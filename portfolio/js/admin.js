/* ==========================================================================
   admin.js · 内容后台交互
   - 演示登录（密码仅用于展示流程，前端校验不具备真实安全性）
   - 修改站点信息、项目与文章摘要，保存到 localStorage
   - 支持导出 / 导入 JSON，便于把内容同步到其他浏览器
   ========================================================================== */
(function () {
  "use strict";

  const PASSWORD = "zhuezen2026";
  const SESSION_KEY = "zhuezen.admin.session";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const loginScreen = $("#loginScreen");
  const adminApp = $("#adminApp");
  const loginForm = $("#loginForm");
  const loginPassword = $("#loginPassword");
  const loginError = $("#loginError");
  const panelRoot = $("#panelRoot");
  const saveBtn = $("#saveBtn");
  const previewBtn = $("#previewBtn");
  const saveState = $("#saveState");
  const toastEl = $("#toast");

  const stored = window.SiteContent.readStore();

  /* 正在编辑的草稿：页面切换时不丢修改 */
  const draft = {
    site: Object.assign({}, SITE),
    projects: (PROJECTS || []).reduce((acc, project) => {
      acc[project.id] = {
        title: project.title,
        subtitle: project.subtitle,
        excerpt: project.excerpt,
        status: project.status,
        year: project.year,
      };
      return acc;
    }, {}),
    posts: (POSTS || []).reduce((acc, post) => {
      acc[post.slug] = { title: post.title, excerpt: post.excerpt };
      return acc;
    }, {}),
  };

  let currentView = "overview";
  let dirty = false;
  let toastTimer = null;

  const VIEWS = {
    overview: { title: "内容概览", crumb: "概览" },
    profile: { title: "个人信息", crumb: "个人信息" },
    projects: { title: "项目内容", crumb: "项目" },
    posts: { title: "文章摘要", crumb: "文章" },
    data: { title: "导入与备份", crumb: "导入与备份" },
  };

  /* ------------------------------------------------------------- 工具 --- */
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(message, isError) {
    toastEl.textContent = message;
    toastEl.classList.toggle("is-error", Boolean(isError));
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2600);
  }

  function markDirty() {
    dirty = true;
    saveState.textContent = "有未保存的修改";
    saveState.className = "save-state is-dirty";
  }

  function markSaved() {
    dirty = false;
    saveState.textContent = "已保存 · 仅当前浏览器";
    saveState.className = "save-state is-saved";
  }

  function formatWhen(iso) {
    if (!iso) return "尚未保存";
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "尚未保存";
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  /* ------------------------------------------------------------- 登录 --- */
  function hasSession() {
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function enterApp() {
    loginScreen.hidden = true;
    adminApp.hidden = false;
    const requested = new URLSearchParams(location.search).get("view");
    render(VIEWS[requested] ? requested : "overview");
    markSaved();
  }

  if (hasSession()) enterApp();

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (loginPassword.value.trim() !== PASSWORD) {
      loginError.textContent = "密码不正确，请使用页面下方提示的演示密码。";
      loginPassword.setAttribute("aria-invalid", "true");
      loginPassword.focus();
      return;
    }
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch (error) {
      /* 忽略隐私模式下的写入失败 */
    }
    loginError.textContent = "";
    loginPassword.removeAttribute("aria-invalid");
    enterApp();
  });

  $("#logoutBtn").addEventListener("click", () => {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* 忽略 */
    }
    window.location.reload();
  });

  /* ------------------------------------------------------------- 渲染 --- */
  function render(view) {
    currentView = view;
    const meta = VIEWS[view];
    $("#crumb").textContent = meta.crumb;
    $("#viewTitle").textContent = meta.title;

    $$(".sidebar__nav button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === view);
    });

    if (view === "overview") panelRoot.innerHTML = overviewHtml();
    if (view === "profile") panelRoot.innerHTML = profileHtml();
    if (view === "projects") panelRoot.innerHTML = projectsHtml();
    if (view === "posts") panelRoot.innerHTML = postsHtml();
    if (view === "data") panelRoot.innerHTML = dataHtml();

    if (view === "profile") updatePreview();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  $$(".sidebar__nav button").forEach((button) => {
    button.addEventListener("click", () => {
      render(button.dataset.view);
      try {
        const url = new URL(location.href);
        url.searchParams.set("view", button.dataset.view);
        history.replaceState({}, "", url);
      } catch (error) {
        /* file:// 下忽略 */
      }
    });
  });

  /* ------------------------------------------------------------- 概览 --- */
  function overviewHtml() {
    const updated = stored.updatedAt ? formatWhen(stored.updatedAt) : "尚未保存";
    return `
      <div class="stat-grid">
        <div class="stat-card stat-card--accent">
          <strong>${PROJECTS.length}</strong>
          <span>项目内容</span>
        </div>
        <div class="stat-card">
          <strong>${POSTS.length}</strong>
          <span>文章摘要</span>
        </div>
        <div class="stat-card">
          <strong>${SKILLS.length}</strong>
          <span>技能分组</span>
        </div>
        <div class="stat-card">
          <strong>3</strong>
          <span>响应式断点</span>
        </div>
      </div>

      <div class="overview-grid">
        <section class="panel">
          <div class="panel__head">
            <h2>内容完成度</h2>
            <p>首页与详情页会读取这里的内容</p>
          </div>
          <ul class="checklist">
            <li>姓名、英文名与品牌缩写：<strong>${escapeHtml(draft.site.name)} · ${escapeHtml(draft.site.latin)}</strong></li>
            <li>一句话定位：${escapeHtml(draft.site.tagline)}</li>
            <li>个人简介：${escapeHtml(draft.site.intro).slice(0, 46)}…</li>
            <li>联系方式：${escapeHtml(draft.site.email)}</li>
            <li>${PROJECTS.length} 个项目与 ${POSTS.length} 篇文章的摘要已填写</li>
          </ul>
          <div class="quick-actions" style="margin-top:1rem">
            <button class="btn btn--primary" type="button" data-jump="profile">修改个人信息</button>
            <button class="btn btn--ghost" type="button" data-jump="projects">编辑项目</button>
            <button class="btn btn--ghost" type="button" data-jump="posts">编辑文章</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <h2>站点信息</h2>
          </div>
          <ul class="meta-list">
            <li><span>当前访问</span><strong>${escapeHtml(location.host || "本地文件")}</strong></li>
            <li><span>内容存储</span><strong>localStorage</strong></li>
            <li><span>最近保存</span><strong>${escapeHtml(updated)}</strong></li>
            <li><span>部署方式</span><strong>Vercel / Cloudflare Pages</strong></li>
          </ul>
          <p class="section-note" style="margin:1rem 0 0;font-size:0.78rem">
            后台修改会立即写入当前浏览器。换设备或换浏览器时，请到「导入与备份」导出 JSON 再导入。
          </p>
        </section>
      </div>

      <section class="panel" style="margin-top:1.1rem">
        <div class="panel__head">
          <h2>发布前检查</h2>
          <p>与 docs/PRD.md 的验收标准一致</p>
        </div>
        <div class="grid-3">
          <div>
            <span class="badge badge--live">布局</span>
            <p class="section-note" style="margin:0.5rem 0 0">375 / 768 / 1440 三个宽度下无横向滚动，导航自动切换为面板。</p>
          </div>
          <div>
            <span class="badge badge--live">可访问性</span>
            <p class="section-note" style="margin:0.5rem 0 0">跳过链接、可见焦点、筛选按钮支持方向键，正文对比度达到 AA。</p>
          </div>
          <div>
            <span class="badge badge--live">内容</span>
            <p class="section-note" style="margin:0.5rem 0 0">修改后刷新前台页面即可看到姓名、简介与项目摘要的变化。</p>
          </div>
        </div>
      </section>`;
  }

  /* --------------------------------------------------------- 个人信息 --- */
  function field(key, label, options) {
    const config = options || {};
    const value = draft.site[key] == null ? "" : draft.site[key];
    const tag = config.textarea ? "textarea" : "input";
    const attrs = [
      `class="control"`,
      `data-site-field="${key}"`,
      `id="field-${key}"`,
    ];

    if (config.placeholder) attrs.push(`placeholder="${escapeHtml(config.placeholder)}"`);

    const inner =
      tag === "textarea"
        ? `<textarea ${attrs.join(" ")} rows="${config.rows || 4}">${escapeHtml(value)}</textarea>`
        : `<input ${attrs.join(" ")} type="${config.type || "text"}" value="${escapeHtml(value)}" />`;

    return `
      <label class="field${config.wide ? " field--wide" : ""}">
        <span>${escapeHtml(label)}</span>
        ${inner}
      </label>`;
  }

  function profileHtml() {
    return `
      <p class="section-note">
        这些字段会同步到首页、关于页、页脚与文章作者信息。修改后点击右上角「保存修改」，再打开站点即可看到结果。
      </p>

      <div class="profile-layout">
        <div>
          <section class="panel">
            <div class="panel__head">
              <h2>基本信息</h2>
              <p>显示在导航、首页 Hero 与页脚</p>
            </div>
            <div class="grid-2">
              ${field("name", "姓名", { placeholder: "朱泽恩" })}
              ${field("latin", "英文名", { placeholder: "Zhu Ze'en" })}
              ${field("initials", "品牌缩写", { placeholder: "ZZ" })}
              ${field("brandRole", "导航副标题", { placeholder: "Frontend Dev" })}
              ${field("role", "职位定位", { placeholder: "前端 / 全栈开发者" })}
              ${field("availability", "当前状态", { placeholder: "可接受新的合作" })}
              ${field("location", "所在地", { placeholder: "杭州 · 中国" })}
              ${field("email", "联系邮箱", { type: "email", placeholder: "hello@example.com" })}
              ${field("github", "GitHub 地址", { wide: true, placeholder: "https://github.com/..." })}
            </div>
          </section>

          <section class="panel">
            <div class="panel__head">
              <h2>介绍文案</h2>
              <p>首页 Hero 与关于页共用</p>
            </div>
            <div class="grid-2">
              ${field("tagline", "一句话定位", { wide: true, placeholder: "把想法做成能用的小工具" })}
              ${field("intro", "个人简介", { wide: true, textarea: true, rows: 5 })}
              ${field("footerBio", "页脚简介", { wide: true, textarea: true, rows: 3 })}
            </div>
          </section>
        </div>

        <aside class="preview-card" aria-label="首页预览">
          <div class="preview-card__bar">
            <i></i><i></i><i></i>
            <span>index.html</span>
          </div>
          <div class="preview-card__body">
            <span class="preview-card__eyebrow" id="pvAvail">${escapeHtml(draft.site.availability)}</span>
            <h3><span id="pvInitials">${escapeHtml(draft.site.initials)}</span> · <em id="pvName">${escapeHtml(draft.site.name)}</em></h3>
            <p class="preview-card__role" id="pvRole">${escapeHtml(draft.site.role)}</p>
            <p class="preview-card__intro" id="pvIntro">${escapeHtml(draft.site.intro)}</p>
            <ul class="preview-card__meta">
              <li id="pvLocation">${escapeHtml(draft.site.location)}</li>
              <li id="pvEmail">${escapeHtml(draft.site.email)}</li>
            </ul>
          </div>
          <div class="preview-card__foot">预览会随输入实时更新，保存后同步到站点。</div>
        </aside>
      </div>`;
  }

  function updatePreview() {
    const map = {
      pvAvail: "availability",
      pvInitials: "initials",
      pvName: "name",
      pvRole: "role",
      pvIntro: "intro",
      pvLocation: "location",
      pvEmail: "email",
    };
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = draft.site[map[id]] || "";
    });
  }

  /* ------------------------------------------------------------- 项目 --- */
  function projectsHtml() {
    return `
      <p class="section-note">
        项目卡片、项目列表与详情页共用这些内容。标题与摘要会直接出现在首页，建议控制在两行以内。
      </p>
      <div class="editor-list">
        ${(PROJECTS || [])
          .map((project) => {
            const p = draft.projects[project.id] || {};
            return `
            <article class="editor">
              <div class="editor__head">
                <h3>${escapeHtml(p.title || project.title)}</h3>
                <span class="badge">${escapeHtml(project.category)}</span>
                <span class="badge badge--live">${escapeHtml(p.status || project.status)}</span>
              </div>
              <div class="editor__body">
                <label class="field">
                  <span>项目标题</span>
                  <input class="control" data-project-id="${project.id}" data-project-field="title" value="${escapeHtml(p.title || "")}" />
                </label>
                <label class="field">
                  <span>副标题</span>
                  <input class="control" data-project-id="${project.id}" data-project-field="subtitle" value="${escapeHtml(p.subtitle || "")}" />
                </label>
                <label class="field field--wide">
                  <span>一句话摘要</span>
                  <textarea class="control" rows="3" data-project-id="${project.id}" data-project-field="excerpt">${escapeHtml(p.excerpt || "")}</textarea>
                </label>
                <label class="field">
                  <span>状态</span>
                  <input class="control" data-project-id="${project.id}" data-project-field="status" value="${escapeHtml(p.status || "")}" />
                </label>
                <label class="field">
                  <span>年份</span>
                  <input class="control" data-project-id="${project.id}" data-project-field="year" value="${escapeHtml(p.year || "")}" />
                </label>
              </div>
            </article>`;
          })
          .join("")}
      </div>`;
  }

  /* ------------------------------------------------------------- 文章 --- */
  function postsHtml() {
    return `
      <p class="section-note">
        文章正文仍保存在 js/data.js 中；这里可以修改标题和列表摘要，保存后首页与博客列表会同步更新。
      </p>
      <div class="editor-list">
        ${(POSTS || [])
          .map((post) => {
            const p = draft.posts[post.slug] || {};
            return `
            <article class="editor">
              <div class="editor__head">
                <h3>${escapeHtml(p.title || post.title)}</h3>
                <span class="badge">${escapeHtml(post.date)}</span>
              </div>
              <div class="editor__body">
                <label class="field field--wide">
                  <span>文章标题</span>
                  <input class="control" data-post-slug="${post.slug}" data-post-field="title" value="${escapeHtml(p.title || "")}" />
                </label>
                <label class="field field--wide">
                  <span>列表摘要</span>
                  <textarea class="control" rows="3" data-post-slug="${post.slug}" data-post-field="excerpt">${escapeHtml(p.excerpt || "")}</textarea>
                </label>
              </div>
            </article>`;
          })
          .join("")}
      </div>`;
  }

  /* --------------------------------------------------------- 导入备份 --- */
  function dataHtml() {
    const json = JSON.stringify(
      { site: draft.site, projects: draft.projects, posts: draft.posts },
      null,
      2
    );
    return `
      <p class="section-note">
        后台把内容保存在浏览器的 localStorage 中。导出 JSON 可以作为备份，也可以在其他设备上导入后继续编辑。
      </p>

      <section class="panel">
        <div class="panel__head">
          <h2>备份与恢复</h2>
          <p>Storage key：<code>${escapeHtml(window.SiteContent.STORAGE_KEY)}</code></p>
        </div>
        <div class="data-actions">
          <button class="btn btn--primary" type="button" id="exportBtn">导出 content.json</button>
          <button class="btn btn--ghost" type="button" id="importBtn">导入 JSON</button>
          <button class="btn btn--danger" type="button" id="resetBtn">恢复默认内容</button>
          <input class="file-input" id="importFile" type="file" accept="application/json,.json" />
        </div>
        <pre class="code-block" aria-label="当前内容 JSON 预览">${escapeHtml(json.slice(0, 1200))}${json.length > 1200 ? "\n…" : ""}</pre>
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2>数据说明</h2>
        </div>
        <ul class="meta-list">
          <li><span>当前保存时间</span><strong>${escapeHtml(stored.updatedAt ? formatWhen(stored.updatedAt) : "尚未保存")}</strong></li>
          <li><span>保存位置</span><strong>当前浏览器 · 当前域名</strong></li>
          <li><span>跨设备同步</span><strong>导出后导入</strong></li>
          <li><span>真实部署建议</span><strong>接入 Vercel KV / Cloudflare KV 与账号登录</strong></li>
        </ul>
      </section>`;
  }

  /* ------------------------------------------------------------- 事件 --- */
  panelRoot.addEventListener("input", (event) => {
    const target = event.target;

    if (target.dataset.siteField) {
      draft.site[target.dataset.siteField] = target.value;
      if (currentView === "profile") updatePreview();
      markDirty();
      return;
    }

    if (target.dataset.projectId && target.dataset.projectField) {
      const id = target.dataset.projectId;
      draft.projects[id] = draft.projects[id] || {};
      draft.projects[id][target.dataset.projectField] = target.value;
      markDirty();
      return;
    }

    if (target.dataset.postSlug && target.dataset.postField) {
      const slug = target.dataset.postSlug;
      draft.posts[slug] = draft.posts[slug] || {};
      draft.posts[slug][target.dataset.postField] = target.value;
      markDirty();
    }
  });

  panelRoot.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-jump]");
    if (jump) render(jump.dataset.jump);

    if (event.target.id === "exportBtn") {
      const payload = JSON.stringify(
        { site: draft.site, projects: draft.projects, posts: draft.posts },
        null,
        2
      );
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "content.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast("已导出 content.json");
    }

    if (event.target.id === "importBtn") $("#importFile").click();

    if (event.target.id === "resetBtn") {
      if (!window.confirm("恢复默认内容会清除当前浏览器里的所有后台修改，确定继续吗？")) return;
      window.SiteContent.reset();
      window.location.reload();
    }
  });

  panelRoot.addEventListener("change", (event) => {
    if (event.target.id !== "importFile") return;
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object") throw new Error("invalid");
        window.SiteContent.writeStore(parsed);
        window.location.reload();
      } catch (error) {
        showToast("JSON 解析失败，请检查文件格式。", true);
      }
    };
    reader.readAsText(file);
  });

  function saveAll() {
    const ok = window.SiteContent.save({
      site: draft.site,
      projects: draft.projects,
      posts: draft.posts,
    });

    if (!ok) {
      showToast("保存失败：浏览器可能禁用了本地存储。", true);
      return;
    }

    markSaved();
    stored.updatedAt = new Date().toISOString();
    showToast("已保存。打开前台页面即可看到修改。");
  }

  saveBtn.addEventListener("click", saveAll);

  previewBtn.addEventListener("click", () => {
    if (dirty) saveAll();
    window.open("index.html", "_blank", "noopener");
  });
})();
