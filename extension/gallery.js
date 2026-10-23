/**
 * 商品图片提取器 —— 图库页逻辑
 * ---------------------------------------------------------------------------
 * 职责：
 *   1. 从 chrome.storage 读取扫描结果（通过 background 转发）
 *   2. 网格渲染缩略图、尺寸、复选框
 *   3. 全选 / 反选 / 清空 / 已选计数
 *   4. 发起批量下载，并实时展示进度与结果
 *
 * 附带的「演示模式」：当页面没有 chrome.* API（例如直接用普通浏览器打开
 * gallery.html 做预览）时，自动读取 demo/demo-scan.json，方便演示和截图。
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var U = window.ImgXUtils || {
    makeFilename: function (i) {
      return '商品图_' + String(i).padStart(3, '0') + '.png';
    },
    formatBytes: function (b) {
      return b + ' B';
    }
  };

  var MIN_SIDE = 100;

  /** 是否运行在扩展环境里 */
  var hasChrome =
    typeof chrome !== 'undefined' &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === 'function' &&
    !!chrome.runtime.id;

  var scanId = new URLSearchParams(location.search).get('scan') || '';

  /* ------------------------------------------------------------------ *
   * DOM 引用
   * ------------------------------------------------------------------ */
  var els = {
    pageMeta: document.getElementById('page-meta'),
    statTotal: document.getElementById('stat-total'),
    statSelected: document.getElementById('stat-selected'),
    btnAll: document.getElementById('btn-all'),
    btnInvert: document.getElementById('btn-invert'),
    btnNone: document.getElementById('btn-none'),
    filterSmall: document.getElementById('filter-small'),
    selectionHint: document.getElementById('selection-hint'),
    btnDownload: document.getElementById('btn-download'),
    grid: document.getElementById('grid'),
    empty: document.getElementById('empty'),
    emptyText: document.getElementById('empty-text'),
    progress: document.getElementById('progress'),
    progressText: document.getElementById('progress-text'),
    progressFill: document.getElementById('progress-fill'),
    toast: document.getElementById('toast')
  };

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */
  var state = {
    record: null,
    items: [], // { id, url, width, height, source, el, checkbox, nameEl, broken, small }
    selected: new Set(), // 保持插入顺序 == 下载序号
    downloading: false,
    demo: !hasChrome
  };

  /* ------------------------------------------------------------------ *
   * 通信
   * ------------------------------------------------------------------ */

  /** Promise 化的 chrome.runtime.sendMessage */
  function send(message) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.runtime.sendMessage(message, function (res) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(res);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /** 读取扫描结果：扩展环境走 background，演示模式读本地 json */
  function loadScan() {
    if (!hasChrome) {
      return fetch('demo/demo-scan.json')
        .then(function (r) {
          return r.json();
        })
        .then(function (record) {
          return { ok: true, record: record };
        })
        .catch(function () {
          return { ok: false, record: null };
        });
    }

    return send({ type: 'IMGX_READ_SCAN', scanId: scanId }).catch(function () {
      return { ok: false, record: null };
    });
  }

  /* ------------------------------------------------------------------ *
   * 渲染
   * ------------------------------------------------------------------ */

  function makeItems(record) {
    var images = (record && record.images) || [];
    return images.map(function (img, index) {
      return {
        id: 'img_' + index,
        url: img.url,
        width: img.width || 0,
        height: img.height || 0,
        source: img.source || '',
        broken: false,
        small: false
      };
    });
  }

  function createCard(item, index) {
    var card = document.createElement('article');
    card.className = 'card';
    card.dataset.id = item.id;
    card.tabIndex = 0;
    card.innerHTML =
      '<div class="card__media">' +
      '<img class="card__img" alt="" />' +
      '<input class="card__check" type="checkbox" aria-label="选择这张图片" />' +
      '<span class="card__badge"></span>' +
      '<span class="card__dims"></span>' +
      '</div>' +
      '<div class="card__foot">' +
      '<span class="card__name">未选择</span>' +
      '<span class="card__index">#' + (index + 1) + '</span>' +
      '</div>';

    var img = card.querySelector('.card__img');
    var check = card.querySelector('.card__check');
    var badge = card.querySelector('.card__badge');
    var dims = card.querySelector('.card__dims');
    var nameEl = card.querySelector('.card__name');

    item.el = card;
    item.checkbox = check;
    item.nameEl = nameEl;

    badge.textContent = U.guessFormat ? U.guessFormat(item.url) : '';
    img.alt = '商品图 ' + (index + 1);
    img.loading = 'lazy';
    img.decoding = 'async';
    // 不发送 Referer，规避大部分 CDN 的防盗链限制
    img.referrerPolicy = 'no-referrer';

    dims.textContent = item.width && item.height ? item.width + '×' + item.height : '加载中';

    img.addEventListener('load', function () {
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      if (!w || !h) return;
      item.width = w;
      item.height = h;
      dims.textContent = w + '×' + h;

      // 扫描时尺寸未知的图片，在这里做二次校验
      if (w < MIN_SIDE || h < MIN_SIDE) {
        item.small = true;
        card.classList.add('is-broken');
        card.style.opacity = '0.45';
        state.selected.delete(item.id);
        syncSelection();
        applyFilter(card);
      }
    });

    img.addEventListener('error', function () {
      item.broken = true;
      card.classList.add('is-broken');
      card.style.opacity = '0.55';
      var overlay = document.createElement('div');
      overlay.className = 'card__error';
      overlay.textContent = '图片无法加载';
      card.querySelector('.card__media').appendChild(overlay);
      state.selected.delete(item.id);
      syncSelection();
      applyFilter(card);
    });

    img.src = U.toSecureUrl ? U.toSecureUrl(item.url) : item.url;

    // 整张卡片可点击切换选中；点复选框时不要重复触发
    card.addEventListener('click', function (e) {
      if (e.target === check) return;
      if (item.broken) return;
      toggle(item.id);
    });
    check.addEventListener('click', function (e) {
      e.stopPropagation();
      if (item.broken || item.small) {
        e.preventDefault();
        return;
      }
      toggle(item.id);
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggle(item.id);
      }
    });

    return card;
  }

  function render() {
    els.grid.innerHTML = '';
    state.items.forEach(function (item, index) {
      els.grid.appendChild(createCard(item, index));
    });

    els.statTotal.textContent = String(state.items.length);
    els.empty.hidden = state.items.length > 0;

    if (!state.items.length) {
      els.emptyText.textContent = state.demo
        ? '演示模式没有找到示例数据（demo/demo-scan.json）。'
        : '回到商品详情页，点击右下角的「获取图片」按钮重新扫描。';
    }

    syncSelection();
  }

  /* ------------------------------------------------------------------ *
   * 选择逻辑
   * ------------------------------------------------------------------ */

  function toggle(id) {
    if (state.downloading) return;
    // 加载失败或尺寸不足的图片不允许选中（与全选 / 反选保持一致）
    var item = state.items.find(function (it) {
      return it.id === id;
    });
    if (item && (item.broken || item.small)) return;

    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    syncSelection();
  }

  /** 同步卡片状态、按钮状态、文件名预览 */
  function syncSelection() {
    var order = Array.from(state.selected);

    state.items.forEach(function (item) {
      var pos = order.indexOf(item.id);
      var on = pos >= 0;
      item.el.classList.toggle('is-selected', on);
      item.checkbox.checked = on;
      item.nameEl.textContent = on ? U.makeFilename(pos + 1) : '未选择';
    });

    els.statSelected.textContent = String(order.length);
    els.btnDownload.disabled = order.length === 0 || state.downloading;
    els.btnDownload.textContent = state.downloading
      ? '下载中…'
      : order.length
      ? '下载选中为 PNG（' + order.length + '）'
      : '下载选中为 PNG';

    els.selectionHint.textContent = order.length
      ? '将保存为 ' + U.makeFilename(1) + ' ~ ' + U.makeFilename(order.length)
      : '勾选图片后下载';
  }

  function selectAll() {
    state.items.forEach(function (item) {
      if (!item.broken && !item.small) state.selected.add(item.id);
    });
    syncSelection();
  }

  function invertSelection() {
    state.items.forEach(function (item) {
      if (item.broken || item.small) return;
      if (state.selected.has(item.id)) state.selected.delete(item.id);
      else state.selected.add(item.id);
    });
    syncSelection();
  }

  function clearSelection() {
    state.selected.clear();
    syncSelection();
  }

  /* ------------------------------------------------------------------ *
   * 过滤
   * ------------------------------------------------------------------ */

  function applyFilter(card) {
    var hide = els.filterSmall.checked && (card.classList.contains('is-broken'));
    card.classList.toggle('is-hidden', hide);
  }

  function applyAllFilters() {
    state.items.forEach(function (item) {
      applyFilter(item.el);
    });
  }

  /* ------------------------------------------------------------------ *
   * 下载
   * ------------------------------------------------------------------ */

  function startDownload() {
    var order = Array.from(state.selected);
    if (!order.length || state.downloading) return;

    var byId = new Map();
    state.items.forEach(function (item) {
      byId.set(item.id, item);
    });

    var items = order
      .map(function (id) {
        return byId.get(id);
      })
      .filter(Boolean)
      .map(function (item) {
        return { url: item.url, width: item.width, height: item.height };
      });

    if (state.demo) {
      showToast('演示模式：这里只展示界面，安装插件后即可真正下载。', 'error');
      return;
    }

    state.downloading = true;
    syncSelection();
    showProgress(0, items.length, '正在准备下载…');

    send({
      type: 'IMGX_DOWNLOAD',
      payload: { scanId: (state.record && state.record.id) || scanId, items: items }
    })
      .then(function (res) {
        if (!res || res.ok === false) {
          finishDownload({
            total: items.length,
            ok: 0,
            failed: items.length,
            failures: [{ error: (res && res.error) || '下载未能开始' }]
          });
        }
      })
      .catch(function (err) {
        finishDownload({
          total: items.length,
          ok: 0,
          failed: items.length,
          failures: [{ error: err.message || String(err) }]
        });
      });
  }

  function showProgress(done, total, text) {
    els.progress.hidden = false;
    var pct = total ? Math.round((done / total) * 100) : 0;
    els.progressFill.style.width = pct + '%';
    els.progressText.textContent = text;
  }

  function finishDownload(summary) {
    state.downloading = false;
    syncSelection();

    var total = summary.total || 0;
    var ok = summary.ok || 0;
    var failed = summary.failed || 0;

    els.progressFill.style.width = '100%';
    els.progressText.textContent = '已完成 ' + total + ' 张：成功 ' + ok + (failed ? '，失败 ' + failed : '');

    setTimeout(function () {
      els.progress.hidden = true;
      els.progressFill.style.width = '0%';
    }, 1400);

    if (ok > 0 && failed === 0) {
      showToast('已保存 ' + ok + ' 张 PNG 到浏览器默认下载目录。', 'success');
    } else if (ok > 0) {
      var reason = summary.failures && summary.failures[0] ? summary.failures[0].error : '';
      showToast('成功 ' + ok + ' 张，失败 ' + failed + ' 张。' + (reason ? '首个原因：' + reason : ''), 'error');
    } else {
      var first = summary.failures && summary.failures[0] ? summary.failures[0].error : '';
      showToast('下载失败：' + (first || '未知错误'), 'error');
    }
  }

  /* ------------------------------------------------------------------ *
   * Toast
   * ------------------------------------------------------------------ */

  var toastTimer = 0;

  function showToast(text, tone) {
    els.toast.textContent = text;
    els.toast.className = 'toast is-open' + (tone === 'success' ? ' is-success' : tone === 'error' ? ' is-error' : '');
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('is-open');
      setTimeout(function () {
        els.toast.hidden = true;
      }, 200);
    }, 5200);
  }

  /* ------------------------------------------------------------------ *
   * 初始化
   * ------------------------------------------------------------------ */

  function bindEvents() {
    els.btnAll.addEventListener('click', selectAll);
    els.btnInvert.addEventListener('click', invertSelection);
    els.btnNone.addEventListener('click', clearSelection);
    els.btnDownload.addEventListener('click', startDownload);
    els.filterSmall.addEventListener('change', applyAllFilters);
  }

  /** 监听 background 推送的下载进度 */
  function bindProgressChannel() {
    if (!hasChrome || !chrome.runtime.onMessage) return;
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'IMGX_DOWNLOAD_START') {
        state.downloading = true;
        syncSelection();
        showProgress(0, msg.total, '开始下载 ' + msg.total + ' 张图片…');
        return;
      }

      if (msg.type === 'IMGX_DOWNLOAD_PROGRESS') {
        if (msg.phase === 'fetch') {
          showProgress(msg.index - 1, msg.total, '正在处理 ' + msg.index + '/' + msg.total + ' · ' + msg.filename);
        } else {
          showProgress(
            msg.index,
            msg.total,
            '已完成 ' + msg.index + '/' + msg.total + ' · 成功 ' + msg.ok + (msg.failed ? ' · 失败 ' + msg.failed : '')
          );
        }
        return;
      }

      if (msg.type === 'IMGX_DOWNLOAD_DONE') {
        finishDownload(msg);
      }
    });
  }

  function renderMeta(record) {
    if (!record) {
      els.pageMeta.textContent = '没有找到扫描记录';
      return;
    }
    var host = '';
    try {
      host = new URL(record.pageUrl).host;
    } catch (e) {
      host = record.pageUrl || '';
    }
    var time = record.scannedAt ? new Date(record.scannedAt).toLocaleString('zh-CN') : '';
    els.pageMeta.textContent = [host, record.pageTitle, time].filter(Boolean).join(' · ');
  }

  function init() {
    bindEvents();
    bindProgressChannel();

    loadScan().then(function (res) {
      var record = res && res.record ? res.record : null;
      state.record = record;
      state.items = makeItems(record);
      renderMeta(record);
      render();

      if (state.demo && state.items.length) {
        showToast('当前为演示模式（未安装插件），界面可以浏览，下载不可用。');
      }
    });
  }

  init();
})();
