/* ==========================================================================
   app.js · 界面逻辑
   导入的 EPUB / TXT 在本机真实解析（见 epub.js）；书架初始的三本书是示例数据。
   ========================================================================== */

import { parseEpub, parseTxt } from "./epub.js";

(function () {
  "use strict";

  const $ = function (selector, root) {
    return (root || document).querySelector(selector);
  };
  const $$ = function (selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  };

  const STORAGE_KEY = "yejian.state.v1";
  const SETTINGS_DEFAULT = { theme: "light", fontSize: 18, leading: 1.75, width: 760 };

  const DATA = window.YEJIAN_DATA;
  const BOOKS = new Map(DATA.books.concat(DATA.extras).map(function (book) {
    return [book.id, book];
  }));

  let state = loadState();

  // 上次导入的本地书籍随状态恢复，否则刷新后书架会丢书
  Object.keys(state.localBooks || {}).forEach(function (id) {
    const book = state.localBooks[id];
    if (book && Array.isArray(book.chapters) && book.chapters.length) BOOKS.set(id, book);
  });

  let current = null;          // { book, chapter }
  let livePercent = 0;         // 当前章节内的滚动位置
  let saveTimer = 0;
  let toastTimer = 0;
  let immersive = false;
  let lastScrollTop = 0;
  let lastBookId = "";
  let openedFrom = null;       // 打开阅读页前的焦点元素
  let drawerTrigger = null;
  let trapHandler = null;

  /* ------------------------------------------------------------- 状态存取 */
  function loadState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (error) {
      saved = null;
    }

    if (!saved || !Array.isArray(saved.shelf)) {
      const now = Date.now();
      saved = {
        version: 1,
        shelf: DATA.books.map(function (book) {
          return { id: book.id, addedAt: now - (book.addedHours || 0) * 3600000 };
        }),
        progress: {},
        settings: Object.assign({}, SETTINGS_DEFAULT),
        localBooks: {},
      };

      DATA.books.forEach(function (book) {
        if (!book.progress) return;
        saved.progress[book.id] = {
          chapter: book.progress.chapter,
          percent: book.progress.percent,
          lastReadAt: now - book.progress.hoursAgo * 3600000,
        };
      });
    }

    saved.settings = Object.assign({}, SETTINGS_DEFAULT, saved.settings || {});
    saved.progress = saved.progress || {};
    saved.localBooks = saved.localBooks || {};
    return saved;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // 书籍正文比设置大得多，写不进去时先丢掉正文，保住进度与设置
      if (Object.keys(state.localBooks || {}).length) {
        state.localBooks = {};
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          toast("存储空间不足：书还在，刷新后需要重新导入");
          return;
        } catch (retryError) {
          /* 继续走下面的一般性提示 */
        }
      }
      toast("本地存储写入失败，进度可能没有保存");
    }
  }

  /* ----------------------------------------------------------------- 工具 */
  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function relativeTime(timestamp) {
    if (!timestamp) return "还没读过";
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return minutes + " 分钟前";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + " 小时前";
    const days = Math.floor(hours / 24);
    if (days === 1) return "昨天";
    if (days < 30) return days + " 天前";
    return Math.floor(days / 30) + " 个月前";
  }

  function overallProgress(book) {
    const progress = state.progress[book.id];
    if (!progress) return 0;
    const total = book.chapters.length;
    return clamp01((progress.chapter + progress.percent) / total);
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.hidden = false;
    requestAnimationFrame(function () {
      el.classList.add("is-open");
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("is-open");
      setTimeout(function () {
        el.hidden = true;
      }, 200);
    }, 2400);
  }

  /* ----------------------------------------------------------------- 书架 */
  function renderShelf() {
    const grid = $("#book-grid");
    const empty = $("#empty");
    const items = state.shelf
      .map(function (entry) {
        return { entry: entry, book: BOOKS.get(entry.id) };
      })
      .filter(function (item) {
        return Boolean(item.book);
      });

    sortItems(items);

    grid.innerHTML = items
      .map(function (item) {
        return cardHtml(item.book, item.entry);
      })
      .join("");

    grid.hidden = items.length === 0;
    empty.hidden = items.length > 0;
    $("#drop-hint").hidden = true;

    $("#shelf-meta").textContent = items.length
      ? items.length + " 本书 · 进度保存在本浏览器"
      : "书架还是空的";
  }

  function sortItems(items) {
    const mode = $("#sort").value;

    if (mode === "title") {
      items.sort(function (a, b) {
        return a.book.title.localeCompare(b.book.title, "zh-Hans-CN");
      });
      return;
    }

    if (mode === "added") {
      items.sort(function (a, b) {
        return b.entry.addedAt - a.entry.addedAt;
      });
      return;
    }

    items.sort(function (a, b) {
      const aRead = (state.progress[a.book.id] || {}).lastReadAt || 0;
      const bRead = (state.progress[b.book.id] || {}).lastReadAt || 0;
      return bRead - aRead || b.entry.addedAt - a.entry.addedAt;
    });
  }

  function cardHtml(book, entry) {
    const progress = state.progress[book.id];
    const percent = Math.round(overallProgress(book) * 100);
    const title = escapeHtml(book.title);

    return (
      '<li class="card">' +
      '<button class="card__open" type="button" data-open="' + book.id + '" aria-label="打开《' + title + '》">' +
      '<span class="cover" style="--hue:' + book.hue + '">' +
      '<span class="cover__title">' + title + "</span>" +
      '<span class="cover__author">' + escapeHtml(book.author) + "</span>" +
      "</span>" +
      '<span class="card__body">' +
      '<span class="card__title">' + title + "</span>" +
      '<span class="card__author">' + escapeHtml(book.author) + " · " + escapeHtml(book.genre) + "</span>" +
      '<span class="card__bar" aria-hidden="true"><span style="width:' + percent + '%"></span></span>' +
      '<span class="card__foot">' +
      "<span>" + (percent > 0 ? percent + "%" : "未开始") + "</span>" +
      "<span>" + (progress ? relativeTime(progress.lastReadAt) : "") + "</span>" +
      "</span>" +
      "</span>" +
      "</button>" +
      '<button class="card__del" type="button" data-del="' + book.id + '" aria-label="删除《' + title + '》">' +
      '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">' +
      '<path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />' +
      "</svg>" +
      "</button>" +
      "</li>"
    );
  }

  /* ----------------------------------------------------------------- 阅读 */
  function openBook(id) {
    const book = BOOKS.get(id);
    if (!book) return;

    const saved = state.progress[id] || { chapter: 0, percent: 0 };
    lastBookId = id;
    openedFrom = document.activeElement;
    current = {
      book: book,
      chapter: Math.min(Math.max(saved.chapter || 0, 0), book.chapters.length - 1),
    };
    livePercent = clamp01(saved.percent || 0);

    $("#reader-book").textContent = book.title;
    $("#view-shelf").hidden = true;
    $("#view-reader").hidden = false;
    document.body.classList.add("is-reading");
    setImmersive(false);
    closeDrawers();

    renderChapter(current.chapter, livePercent);
    $("#reader-scroll").focus({ preventScroll: true });
  }

  function closeReader() {
    if (!current) return;
    clearTimeout(saveTimer);
    persistProgress();

    $("#view-reader").hidden = true;
    $("#view-shelf").hidden = false;
    document.body.classList.remove("is-reading");
    setImmersive(false);
    closeDrawers();

    current = null;
    renderShelf();

    const target = $('[data-open="' + lastBookId + '"]');
    if (target) target.focus({ preventScroll: true });
    else if (openedFrom && document.contains(openedFrom)) openedFrom.focus({ preventScroll: true });
  }

  function renderChapter(index, percent) {
    if (!current) return;
    const book = current.book;
    const source = book.chapters[index];
    const article = $("#chapter");

    const words = source.blocks.reduce(function (sum, block) {
      return sum + (block.text ? block.text.length : 0);
    }, 0);

    article.innerHTML = "";

    const title = document.createElement("h2");
    title.className = "chapter__title";
    title.textContent = source.title;

    const meta = document.createElement("p");
    meta.className = "chapter__meta";
    meta.textContent =
      book.title + " · 第 " + (index + 1) + " / " + book.chapters.length + " 章 · 约 " + words + " 字";

    article.appendChild(title);
    article.appendChild(meta);
    source.blocks.forEach(function (block) {
      article.appendChild(blockElement(block));
    });

    current.chapter = index;
    livePercent = clamp01(percent);

    $("#reader-chapter").textContent = source.title;
    $("#prev-btn").disabled = index === 0;
    $("#next-btn").disabled = index === book.chapters.length - 1;

    buildToc();
    updateFoot(livePercent);

    const scroller = $("#reader-scroll");
    requestAnimationFrame(function () {
      const max = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = max > 0 ? max * livePercent : 0;
      lastScrollTop = scroller.scrollTop;
      updateFoot(livePercent);
    });

    persistProgress();
  }

  function blockElement(block) {
    let node;

    if (block.type === "quote") {
      node = document.createElement("blockquote");
      node.textContent = block.text;
      return node;
    }

    if (block.type === "code") {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.text;
      pre.appendChild(code);
      return pre;
    }

    if (block.type === "h3") {
      node = document.createElement("h3");
      node.textContent = block.text;
      return node;
    }

    node = document.createElement("p");
    node.textContent = block.text;
    return node;
  }

  function persistProgress() {
    if (!current) return;
    state.progress[current.book.id] = {
      chapter: current.chapter,
      percent: clamp01(livePercent),
      lastReadAt: Date.now(),
    };
    saveState();
  }

  function goChapter(delta) {
    if (!current) return;
    const target = current.chapter + delta;

    if (target < 0) {
      toast("已经是第一章了");
      return;
    }
    if (target >= current.book.chapters.length) {
      toast("已经是最后一章了");
      return;
    }

    persistProgress();
    renderChapter(target, 0);
    setImmersive(false);
  }

  function jumpToChapter(index) {
    if (!current) return;
    persistProgress();
    renderChapter(index, 0);
    closeDrawers();
    setImmersive(false);
  }

  function updateFoot(percent) {
    if (!current) return;
    const total = current.book.chapters.length;
    const overall = clamp01((current.chapter + percent) / total);

    $("#foot-bar").style.width = (overall * 100).toFixed(1) + "%";
    $("#reader-status").textContent =
      "第 " + (current.chapter + 1) + " / " + total + " 章 · 本章 " +
      Math.round(percent * 100) + "% · 全书 " + Math.round(overall * 100) + "%";
  }

  function setImmersive(value) {
    immersive = value;
    document.body.classList.toggle("is-immersive", value);
  }

  /* --------------------------------------------------------------- 目录 */
  function buildToc() {
    const list = $("#toc-list");
    if (!current) return;

    list.innerHTML = "";
    current.book.chapters.forEach(function (chapter, index) {
      const item = document.createElement("li");
      const button = document.createElement("button");

      button.type = "button";
      button.className = "toc__item";
      button.dataset.index = String(index);

      const number = document.createElement("span");
      number.className = "toc__num";
      number.textContent = String(index + 1).padStart(2, "0");

      const title = document.createElement("span");
      title.className = "toc__title";
      title.textContent = chapter.title;

      button.appendChild(number);
      button.appendChild(title);

      if (index === current.chapter) {
        button.classList.add("is-active");
        button.setAttribute("aria-current", "true");
      }

      item.appendChild(button);
      list.appendChild(item);
    });
  }

  /* --------------------------------------------------------------- 抽屉 */
  function focusableItems(panel) {
    return $$('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', panel).filter(
      function (el) {
        return el.offsetParent !== null;
      }
    );
  }

  function openDrawer(panel, trigger) {
    closeDrawers();

    drawerTrigger = trigger;
    panel.hidden = false;
    $("#scrim").hidden = false;
    document.body.classList.add("is-locked");

    requestAnimationFrame(function () {
      panel.classList.add("is-open");
      $("#scrim").classList.add("is-open");
    });

    trigger.setAttribute("aria-expanded", "true");

    const items = focusableItems(panel);
    if (items.length) items[0].focus();

    trapHandler = function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawers();
        return;
      }
      if (event.key !== "Tab") return;

      const list = focusableItems(panel);
      if (!list.length) return;

      const first = list[0];
      const last = list[list.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapHandler);
  }

  function closeDrawers() {
    const panels = [$("#toc-panel"), $("#settings-panel")];
    const wasOpen = panels.some(function (panel) {
      return panel.classList.contains("is-open");
    });

    panels.forEach(function (panel) {
      if (panel.hidden) return;
      panel.classList.remove("is-open");
      setTimeout(function () {
        if (!panel.classList.contains("is-open")) panel.hidden = true;
      }, 220);
    });

    $("#scrim").hidden = true;
    $("#scrim").classList.remove("is-open");
    $("#toc-btn").setAttribute("aria-expanded", "false");
    $("#settings-btn").setAttribute("aria-expanded", "false");
    document.body.classList.remove("is-locked");

    if (trapHandler) {
      document.removeEventListener("keydown", trapHandler);
      trapHandler = null;
    }

    if (wasOpen && drawerTrigger && document.contains(drawerTrigger)) {
      drawerTrigger.focus({ preventScroll: true });
    }
    drawerTrigger = null;
  }

  /* --------------------------------------------------------------- 设置 */
  function applySettings() {
    const settings = state.settings;
    const root = document.documentElement;

    root.dataset.theme = settings.theme;
    root.style.setProperty("--read-font", settings.fontSize + "px");
    root.style.setProperty("--read-leading", String(settings.leading));
    root.style.setProperty("--read-width", settings.width + "px");

    $$(".seg").forEach(function (group) {
      const key = group.dataset.setting;
      $$("button", group).forEach(function (button) {
        const active = String(settings[key]) === button.dataset.value;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    });
  }

  function changeSetting(key, rawValue) {
    const before = livePercent;
    const value = key === "theme" ? rawValue : Number(rawValue);

    state.settings[key] = value;
    saveState();
    applySettings();

    if (!current) return;

    const scroller = $("#reader-scroll");
    requestAnimationFrame(function () {
      const max = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = max > 0 ? max * before : 0;
      updateFoot(before);
    });
  }

  /* --------------------------------------------------------------- 导入 */
  function hideImporting() {
    const overlay = $("#importing");
    overlay.classList.remove("is-open");
    setTimeout(function () {
      overlay.hidden = true;
    }, 220);
  }

  function showImporting(title, hint) {
    const overlay = $("#importing");
    const bar = $("#importing-bar");

    $("#importing-title").textContent = title;
    $("#importing-hint").textContent = hint || "解析完成后会自动加入书架";
    overlay.hidden = false;
    bar.style.width = "0%";

    requestAnimationFrame(function () {
      overlay.classList.add("is-open");
      requestAnimationFrame(function () {
        // 解析没有进度事件，先走到 88%，真正完成时再补满
        bar.style.width = "88%";
      });
    });
  }

  function addToShelf(book) {
    BOOKS.set(book.id, book);
    if (book.source === "local") state.localBooks[book.id] = book;

    state.shelf.push({ id: book.id, addedAt: Date.now() });
    $("#sort").value = "added";
    saveState();
    renderShelf();
  }

  function addDemoBook() {
    const next = DATA.extras[state.demoLoaded || 0];
    if (!next) {
      toast("示例书已经全部载入，点「重置演示数据」可以重来");
      return;
    }
    if (state.shelf.some(function (entry) { return entry.id === next.id; })) {
      toast("《" + next.title + "》已经在书架上了");
      return;
    }

    state.demoLoaded = (state.demoLoaded || 0) + 1;
    addToShelf(next);
    toast("已载入示例书《" + next.title + "》");
  }

  async function startImport(file) {
    if (!file) {
      addDemoBook();
      return;
    }

    const name = file.name || "";
    const isEpub = /\.epub$/i.test(name);
    const isTxt = /\.txt$/i.test(name);
    if (!isEpub && !isTxt) {
      toast("只支持 .epub 或 .txt 文件，换一个试试");
      return;
    }

    showImporting(
      "正在解析 " + name,
      isTxt ? "识别编码，按章节切分正文" : "解压文件，读取书籍信息与目录"
    );

    const started = performance.now();
    try {
      const book = isTxt ? await parseTxt(file) : await parseEpub(file);
      $("#importing-bar").style.width = "100%";

      if (state.shelf.some(function (entry) { return entry.id === book.id; })) {
        hideImporting();
        toast("这本书已经在书架上了");
        return;
      }

      addToShelf(book);
      hideImporting();

      const cost = Math.max(1, Math.round(performance.now() - started));
      toast("已导入《" + book.title + "》· " + book.chapters.length + " 章 · " + cost + "ms");
    } catch (error) {
      hideImporting();
      toast(error && error.message ? error.message : "解析失败，换一个文件试试");
    }
  }

  /* --------------------------------------------------------------- 弹窗 */
  function askConfirm(title, text, okText) {
    return new Promise(function (resolve) {
      const dialog = $("#confirm-dialog");
      const ok = $("#confirm-ok");

      $("#confirm-title").textContent = title;
      $("#confirm-text").textContent = text;
      ok.textContent = okText || "确定";
      dialog.returnValue = "";

      dialog.addEventListener(
        "close",
        function () {
          resolve(dialog.returnValue === "ok");
        },
        { once: true }
      );

      dialog.showModal();
    });
  }

  async function removeBook(id) {
    const book = BOOKS.get(id);
    if (!book) return;

    const ok = await askConfirm(
      "删除这本书？",
      "《" + book.title + "》会从书架移除，本地保存的阅读进度也会一起清除。",
      "删除"
    );
    if (!ok) return;

    state.shelf = state.shelf.filter(function (entry) {
      return entry.id !== id;
    });
    delete state.progress[id];
    delete state.localBooks[id];
    BOOKS.delete(id);
    saveState();
    renderShelf();
    toast("已删除《" + book.title + "》");
  }

  /* --------------------------------------------------------------- 事件 */
  function bindEvents() {
    $("#sort").addEventListener("change", renderShelf);

    $("#import-btn").addEventListener("click", function () {
      $("#file-input").click();
    });
    $("#empty-import").addEventListener("click", function () {
      $("#file-input").click();
    });
    $("#file-input").addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      if (file) startImport(file);
      event.target.value = "";
    });
    $("#demo-import").addEventListener("click", function () {
      startImport(null);
    });

    $("#reset-demo").addEventListener("click", async function () {
      const ok = await askConfirm(
        "重置演示数据？",
        "书架、阅读进度和阅读设置都会恢复成初始状态。",
        "重置"
      );
      if (!ok) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });

    /* 整页拖拽导入 */
    const shelfView = $("#view-shelf");
    let dragDepth = 0;

    shelfView.addEventListener("dragenter", function (event) {
      event.preventDefault();
      dragDepth += 1;
      $("#drop-hint").hidden = false;
      shelfView.classList.add("is-dragging");
    });
    shelfView.addEventListener("dragover", function (event) {
      event.preventDefault();
    });
    shelfView.addEventListener("dragleave", function () {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        shelfView.classList.remove("is-dragging");
        $("#drop-hint").hidden = true;
      }
    });
    shelfView.addEventListener("drop", function (event) {
      event.preventDefault();
      dragDepth = 0;
      shelfView.classList.remove("is-dragging");
      $("#drop-hint").hidden = true;

      const file = event.dataTransfer && event.dataTransfer.files[0];
      startImport(file || null);
    });

    /* 书架卡片 */
    $("#book-grid").addEventListener("click", function (event) {
      const open = event.target.closest("[data-open]");
      const del = event.target.closest("[data-del]");

      if (del) {
        removeBook(del.dataset.del);
        return;
      }
      if (open) openBook(open.dataset.open);
    });

    /* 阅读页 */
    $("#back-btn").addEventListener("click", closeReader);
    $("#prev-btn").addEventListener("click", function () {
      goChapter(-1);
    });
    $("#next-btn").addEventListener("click", function () {
      goChapter(1);
    });

    $("#toc-btn").addEventListener("click", function (event) {
      openDrawer($("#toc-panel"), event.currentTarget);
    });
    $("#settings-btn").addEventListener("click", function (event) {
      openDrawer($("#settings-panel"), event.currentTarget);
    });

    $("#toc-list").addEventListener("click", function (event) {
      const item = event.target.closest("[data-index]");
      if (!item) return;
      jumpToChapter(Number(item.dataset.index));
    });

    $$("[data-close]").forEach(function (button) {
      button.addEventListener("click", closeDrawers);
    });
    $("#scrim").addEventListener("click", closeDrawers);

    $$(".seg").forEach(function (group) {
      group.addEventListener("click", function (event) {
        const button = event.target.closest("button[data-value]");
        if (!button) return;
        changeSetting(group.dataset.setting, button.dataset.value);
      });
    });

    /* 阅读区滚动、点击与键盘 */
    const scroller = $("#reader-scroll");

    scroller.addEventListener("scroll", function () {
      const top = scroller.scrollTop;
      const max = scroller.scrollHeight - scroller.clientHeight;
      livePercent = max > 0 ? clamp01(top / max) : 0;

      updateFoot(livePercent);

      if (top > 80 && top - lastScrollTop > 6 && !immersive) setImmersive(true);
      else if (top - lastScrollTop < -6 && immersive) setImmersive(false);

      lastScrollTop = top;

      clearTimeout(saveTimer);
      saveTimer = setTimeout(persistProgress, 700);
    });

    scroller.addEventListener("click", function (event) {
      if (event.target.closest("a, button")) return;
      if (String(window.getSelection()).length > 0) return;
      if (immersive) {
        setImmersive(false);
        return;
      }

      const rect = scroller.getBoundingClientRect();
      const ratio = (event.clientX - rect.left) / rect.width;

      if (ratio < 0.12) goChapter(-1);
      else if (ratio > 0.88) goChapter(1);
    });

    document.addEventListener("keydown", function (event) {
      if ($("#view-reader").hidden) return;
      if (!$("#toc-panel").hidden || !$("#settings-panel").hidden) return;
      if (event.target.closest("select, input, textarea")) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goChapter(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goChapter(-1);
      } else if (event.key === "Escape") {
        if (immersive) setImmersive(false);
        else closeReader();
      }
    });

    window.addEventListener("beforeunload", function () {
      if (current) persistProgress();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && current) persistProgress();
    });
  }

  /* ----------------------------------------------------------------- 启动 */
  applySettings();
  renderShelf();
  bindEvents();
})();
