/* ==========================================================================
   app.js · 站点交互（原生 JavaScript，无依赖）
   - 通用：星空背景 / 吸顶导航 / 移动菜单 / 滚动进场 / 页脚年份
   - 页面：根据 <body data-page> 渲染项目、文章与表单校验
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------ 工具函数 */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* 筛选按钮组：方向键在选项间移动焦点，Home / End 跳到首尾 */
  function initRovingKeys(container) {
    if (!container) return;

    container.addEventListener("keydown", (event) => {
      const keys = [
        "ArrowRight",
        "ArrowLeft",
        "ArrowDown",
        "ArrowUp",
        "Home",
        "End",
      ];
      if (keys.indexOf(event.key) === -1) return;

      const buttons = $$("button", container);
      const index = buttons.indexOf(document.activeElement);
      if (index === -1) return;

      let next = index;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = buttons.length - 1;
      else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        next = (index + 1) % buttons.length;
      } else {
        next = (index - 1 + buttons.length) % buttons.length;
      }

      event.preventDefault();
      buttons.forEach((button, i) => {
        button.tabIndex = i === next ? 0 : -1;
      });
      buttons[next].focus();
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(iso) {
    const parts = String(iso).split("-");
    if (parts.length !== 3) return iso;
    return `${Number(parts[0])} 年 ${Number(parts[1])} 月 ${Number(parts[2])} 日`;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function debounce(fn, wait) {
    let timer = 0;
    return function () {
      const args = arguments;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(null, args), wait);
    };
  }

  const params = new URLSearchParams(window.location.search);

  /* --------------------------------------------------------- 星空背景 --- */
  function initStarfield() {
    const canvas = $("#starfield");
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let stars = [];
    let raf = 0;
    let phase = 0;
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;

    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(180, Math.max(48, Math.round((width * height) / 16000)));
      stars = Array.from({ length: count }, () => {
        const depth = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: 0.5 + depth * 1.1,
          alpha: 0.16 + depth * 0.55,
          speed: 0.03 + depth * 0.12,
          phase: Math.random() * Math.PI * 2,
          depth: depth,
        };
      });
    }

    function paint(animate) {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < stars.length; i += 1) {
        const star = stars[i];
        const twinkle = animate ? 0.72 + Math.sin(phase + star.phase) * 0.28 : 1;
        ctx.globalAlpha = Math.max(0.06, star.alpha * twinkle);
        ctx.fillStyle = i % 7 === 0 ? "#b9ccff" : "#dbe4f7";
        ctx.beginPath();
        ctx.arc(
          star.x + pointerX * star.depth * 10,
          star.y + pointerY * star.depth * 10,
          star.r,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function step() {
      phase += 0.008;
      pointerX += (targetX - pointerX) * 0.04;
      pointerY += (targetY - pointerY) * 0.04;

      for (let i = 0; i < stars.length; i += 1) {
        const star = stars[i];
        star.y -= star.speed;
        star.x += star.speed * 0.12;
        if (star.y < -2) star.y = height + 2;
        if (star.x > width + 2) star.x = -2;
      }

      paint(true);
      raf = window.requestAnimationFrame(step);
    }

    function start() {
      if (raf || reduceMotion.matches) return;
      raf = window.requestAnimationFrame(step);
    }

    function stop() {
      if (!raf) return;
      window.cancelAnimationFrame(raf);
      raf = 0;
    }

    build();
    paint(false);
    start();

    window.addEventListener(
      "resize",
      debounce(() => {
        stop();
        build();
        paint(!reduceMotion.matches);
        start();
      }, 180)
    );

    if (window.matchMedia("(pointer: fine)").matches && !reduceMotion.matches) {
      window.addEventListener(
        "pointermove",
        (event) => {
          targetX = (event.clientX / window.innerWidth - 0.5) * 2;
          targetY = (event.clientY / window.innerHeight - 0.5) * 2;
        },
        { passive: true }
      );
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });

    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener("change", () => {
        stop();
        paint(false);
        if (!reduceMotion.matches) start();
      });
    }
  }

  /* --------------------------------------------------------- 吸顶导航 --- */
  function initHeader() {
    const header = $("#siteHeader");
    if (!header) return;

    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* --------------------------------------------------------- 移动菜单 --- */
  function initNav() {
    const toggle = $("#navToggle");
    const nav = $("#primaryNav");
    if (!toggle || !nav) return;

    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
      nav.classList.toggle("is-open", open);
    };

    toggle.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      setOpen(false);
      toggle.focus();
    });

    document.addEventListener("click", (event) => {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      setOpen(false);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 900) setOpen(false);
    });
  }

  /* --------------------------------------------------------- 进场动画 --- */
  let revealObserver = null;

  function initReveal() {
    const items = $$(".reveal:not(.is-visible)");
    if (!items.length) return;

    if (!("IntersectionObserver" in window) || reduceMotion.matches) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
      );
    }

    items.forEach((item) => revealObserver.observe(item));
  }

  /* ------------------------------------------------------------ 页脚 --- */
  function initYear() {
    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();
  }

  /* -------------------------------------------------------- 渲染：通用 --- */
  function tagList(tags, extraClass) {
    if (!tags || !tags.length) return "";
    return tags
      .map((tag) => `<span class="tag${extraClass || ""}">${escapeHtml(tag)}</span>`)
      .join("");
  }

  const SKILL_ICONS = {
    code: '<path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/>',
    tool: '<path d="M4 7h7M15 7h5M4 17h5M13 17h7"/><circle cx="13" cy="7" r="2.2"/><circle cx="11" cy="17" r="2.2"/>',
    chart: '<path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/>',
    spark: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  };

  function skillIcon(name) {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
      SKILL_ICONS[name] || SKILL_ICONS.code
    }</svg>`;
  }

  function projectCard(project) {
    const media = project.cover
      ? `<div class="card__media">
           <img src="${escapeHtml(project.cover)}" alt="${escapeHtml(project.coverAlt || "")}" loading="lazy" decoding="async" />
         </div>`
      : `<div class="card__media card__media--art" aria-hidden="true"><span>{ }</span></div>`;

    return `
      <article class="card reveal">
        ${media}
        <div class="card__body">
          <div class="card__eyebrow">
            <span>${escapeHtml(project.category)}</span>
            <span>${escapeHtml(project.year)}</span>
          </div>
          <h3 class="card__title">
            <a href="project.html?id=${encodeURIComponent(project.id)}">${escapeHtml(project.title)}</a>
          </h3>
          <p class="card__desc">${escapeHtml(project.excerpt)}</p>
          <div class="card__tags">${tagList(project.tags)}</div>
          <div class="card__foot">
            <span>${escapeHtml(project.status)}</span>
            <span class="card__link">查看详情
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </span>
          </div>
        </div>
      </article>`;
  }

  function postCard(post) {
    return `
      <article class="card post-card reveal">
        <div class="post-card__meta">
          <time datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
          <span aria-hidden="true">·</span>
          <span>${post.minutes} 分钟阅读</span>
        </div>
        <h3 class="post-card__title">
          <a href="post.html?slug=${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a>
        </h3>
        <p class="post-card__excerpt">${escapeHtml(post.excerpt)}</p>
        <div class="card__tags">${tagList(post.tags)}</div>
      </article>`;
  }

  function emptyState(title, desc, action) {
    return `
      <div class="empty">
        <span class="empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        </span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(desc)}</p>
        ${action || ""}
      </div>`;
  }

  /* ---------------------------------------------------------- 首页渲染 --- */
  function renderHome() {
    const featured = $("#featuredProjects");
    if (featured) {
      featured.innerHTML = PROJECTS.slice(0, 3).map(projectCard).join("");
    }

    const latest = $("#latestPosts");
    if (latest) {
      latest.innerHTML = POSTS.slice(0, 3).map(postCard).join("");
    }

    const skills = $("#homeSkills");
    if (skills) {
      skills.innerHTML = SKILLS.map(
        (group, index) => `
        <div class="skill-block reveal" style="--delay: ${index * 60}ms">
          <h3>
            ${skillIcon(group.icon)}
            ${escapeHtml(group.title)}
          </h3>
          <ul>${group.items.map((item) => `<li class="tag">${escapeHtml(item)}</li>`).join("")}</ul>
        </div>`
      ).join("");
    }
  }

  /* ---------------------------------------------------------- 项目列表 --- */
  function renderProjectList() {
    const list = $("#projectList");
    if (!list) return;

    const counts = PROJECTS.reduce((acc, project) => {
      acc[project.category] = (acc[project.category] || 0) + 1;
      return acc;
    }, {});

    const filters = $("#projectFilters");
    const categories = ["全部"].concat(Object.keys(counts));
    let active = params.get("category");
    if (active && categories.indexOf(active) === -1) active = null;
    active = active || "全部";

    if (filters) {
      filters.innerHTML = categories
        .map((category) => {
          const count = category === "全部" ? PROJECTS.length : counts[category];
          const pressed = category === active ? "true" : "false";
          return `<button class="chip" type="button" data-category="${escapeHtml(
            category
          )}" aria-pressed="${pressed}" tabindex="${pressed === "true" ? 0 : -1}">${escapeHtml(
            category
          )}<small>${count}</small></button>`;
        })
        .join("");
    }

    const countEl = $("#projectCount");

    function paint(category) {
      const items =
        category === "全部"
          ? PROJECTS
          : PROJECTS.filter((project) => project.category === category);

      list.innerHTML = items.length
        ? items.map(projectCard).join("")
        : emptyState(
            "这个分类还没有项目",
            "换一个分类看看，或者回到全部项目。",
            '<a class="btn btn--ghost btn--sm" href="projects.html">查看全部项目</a>'
          );

      if (countEl) {
        countEl.textContent = `共 ${items.length} 个项目`;
      }

      if (filters) {
        $$("button", filters).forEach((button) => {
          const isActive = button.dataset.category === category;
          button.setAttribute("aria-pressed", isActive ? "true" : "false");
          button.tabIndex = isActive ? 0 : -1;
        });
      }

      initReveal();
    }

    if (filters) {
      filters.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-category]");
        if (!button) return;
        const category = button.dataset.category;
        paint(category);
        try {
          const url = new URL(window.location.href);
          if (category === "全部") url.searchParams.delete("category");
          else url.searchParams.set("category", category);
          window.history.replaceState({}, "", url);
        } catch (error) {
          /* file:// 下可能不允许改地址，忽略即可 */
        }
      });

      initRovingKeys(filters);
    }

    paint(active);
  }

  /* ---------------------------------------------------------- 项目详情 --- */
  function renderProjectDetail() {
    const root = $("#projectRoot");
    if (!root) return;

    const id = params.get("id");
    const project = PROJECTS.find((item) => item.id === id);

    if (!project) {
      root.innerHTML = `
        <div class="container not-found">
          <div>
            <p class="not-found__code">404</p>
            <h1>没有找到这个项目</h1>
            <p>链接可能已经过期，或者项目已经改名。</p>
            <p style="margin-top:1.25rem"><a class="btn btn--primary" href="projects.html">返回项目列表</a></p>
          </div>
        </div>`;
      document.title = "项目未找到 · " + SITE.name;
      return;
    }

    document.title = `${project.title} · ${SITE.name}`;
    const meta = $('meta[name="description"]');
    if (meta) meta.setAttribute("content", project.excerpt);

    const facts = [
      ["角色", project.role],
      ["周期", project.duration],
      ["年份", project.year],
      ["状态", project.status],
    ];

    const actions = [];
    if (project.demo) {
      actions.push(
        `<a class="btn btn--primary" href="${escapeHtml(project.demo)}"${
          /^https?:/.test(project.demo) ? ' target="_blank" rel="noopener"' : ""
        }>在线查看</a>`
      );
    }
    if (project.source) {
      actions.push(
        `<a class="btn btn--ghost" href="${escapeHtml(
          project.source
        )}" target="_blank" rel="noopener">查看源码</a>`
      );
    }

    const shots = project.shots && project.shots.length
      ? `<section class="project-section">
           <h2>界面截图</h2>
           <div class="shots${project.shots.length > 1 ? " shots--2" : ""}">
             ${project.shots
               .map(
                 (shot) => `
               <figure class="shot">
                 <img src="${escapeHtml(shot.src)}" alt="${escapeHtml(
                   shot.alt
                 )}" loading="lazy" decoding="async" />
                 <figcaption>${escapeHtml(shot.caption)}</figcaption>
               </figure>`
               )
               .join("")}
           </div>
         </section>`
      : "";

    const cover = project.cover
      ? `<div class="project-hero__shot">
           <img src="${escapeHtml(project.cover)}" alt="${escapeHtml(
             project.coverAlt || ""
           )}" />
         </div>`
      : `<div class="project-hero__shot card__media--art" style="display:grid;place-items:center;aspect-ratio:16/10" aria-hidden="true">
           <span style="display:grid;place-items:center;width:70px;height:70px;border:1px solid var(--border-strong);border-radius:var(--radius);background:rgba(11,15,26,.55);color:var(--accent);font-family:var(--mono);font-size:1.2rem">{ }</span>
         </div>`;

    root.innerHTML = `
      <div class="container">
        <nav class="breadcrumb" aria-label="面包屑">
          <a href="index.html">首页</a>
          <span class="breadcrumb__sep" aria-hidden="true">/</span>
          <a href="projects.html">项目</a>
          <span class="breadcrumb__sep" aria-hidden="true">/</span>
          <span aria-current="page">${escapeHtml(project.title)}</span>
        </nav>
      </div>

      <header class="project-hero">
        <div class="container project-hero__grid">
          <div>
            <span class="eyebrow">${escapeHtml(project.category)}</span>
            <h1 class="project-hero__title">${escapeHtml(project.title)}</h1>
            <p class="project-hero__desc">${escapeHtml(project.subtitle)}</p>
            <p class="project-hero__desc">${escapeHtml(project.excerpt)}</p>
            <div class="project-hero__actions">${actions.join("")}</div>
            <div class="card__tags" style="margin-top:1.25rem">${tagList(project.tags)}</div>
          </div>
          ${cover}
        </div>
      </header>

      <section class="section section--tight">
        <div class="container project-layout">
          <div>
            <section class="project-section">
              <h2>要解决的问题</h2>
              <p>${escapeHtml(project.problem)}</p>
            </section>

            <section class="project-section">
              <h2>我的做法</h2>
              <p>${escapeHtml(project.approach)}</p>
              <div class="arch-flow" aria-label="处理流程">
                ${project.architecture
                  .map(
                    (step, index) =>
                      `<span class="arch-flow__step">${escapeHtml(step)}</span>${
                        index < project.architecture.length - 1
                          ? '<span class="arch-flow__arrow" aria-hidden="true">→</span>'
                          : ""
                      }`
                  )
                  .join("")}
              </div>
            </section>

            <section class="project-section">
              <h2>主要功能</h2>
              <ul class="feature-list">
                ${project.features
                  .map((feature) => `<li>${escapeHtml(feature)}</li>`)
                  .join("")}
              </ul>
            </section>

            ${shots}

            <section class="project-section">
              <h2>回头再看</h2>
              <p>${escapeHtml(project.learned)}</p>
            </section>

            <p style="margin-top:2rem">
              <a class="btn btn--ghost" href="projects.html">← 返回项目列表</a>
            </p>
          </div>

          <aside class="project-aside">
            <dl class="project-facts">
              ${facts
                .map(
                  (fact) =>
                    `<div><dt>${escapeHtml(fact[0])}</dt><dd>${escapeHtml(
                      fact[1]
                    )}</dd></div>`
                )
                .join("")}
            </dl>
            <div class="info-card">
              <h3 style="font-size:.92rem">技术栈</h3>
              <div class="card__tags">${tagList(project.stack, " tag--accent")}</div>
            </div>
          </aside>
        </div>
      </section>`;

    initReveal();
  }

  /* ---------------------------------------------------------- 博客列表 --- */
  function renderBlog() {
    const root = $("#blogRoot");
    if (!root) return;

    const state = {
      query: params.get("q") || "",
      tag: params.get("tag") || "全部",
    };

    const tags = POSTS.reduce((acc, post) => {
      post.tags.forEach((tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    }, {});
    const tagNames = ["全部"].concat(Object.keys(tags));
    if (tagNames.indexOf(state.tag) === -1) state.tag = "全部";

    const featured = POSTS.find((post) => post.featured) || POSTS[0];

    root.innerHTML = `
      <div class="blog-layout">
        <div>
          <div id="blogFeatured"></div>
          <div class="filter-row">
            <div class="search">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
              <label class="sr-only" for="blogSearch">搜索文章</label>
              <input class="input" id="blogSearch" type="search" placeholder="搜索标题、摘要或标签…" autocomplete="off" value="${escapeHtml(
                state.query
              )}" />
            </div>
            <p class="result-count" id="blogCount" aria-live="polite"></p>
          </div>
          <div id="blogList" class="post-list"></div>
        </div>
        <aside class="blog-aside">
          <div class="toc">
            <p class="toc__title">按标签浏览</p>
            <div class="tag-cloud" id="tagCloud" role="group" aria-label="按标签筛选文章">
              ${tagNames
                .map((tag) => {
                  const count = tag === "全部" ? POSTS.length : tags[tag];
                  return `<button type="button" data-tag="${escapeHtml(
                    tag
                  )}" aria-pressed="${
                    tag === state.tag ? "true" : "false"
                  }" tabindex="${tag === state.tag ? 0 : -1}">${escapeHtml(
                    tag
                  )}<small>${count}</small></button>`;
                })
                .join("")}
            </div>
          </div>
          <div class="side-card">
            <h3>关于这些文章</h3>
            <p>都是做项目时踩过的坑与留下的笔记。没有转载，也没有 AI 直接生成的段落，写完至少自己读一遍。</p>
          </div>
          <div class="side-card">
            <h3>订阅</h3>
            <p>没有邮件列表。想第一时间看到更新，可以在 GitHub 上 watch 这个仓库。</p>
            <p style="margin-top:.75rem">
              <a class="btn btn--soft btn--sm" href="https://github.com/yaesakiarishiya/AITraining" target="_blank" rel="noopener">前往 GitHub</a>
            </p>
          </div>
        </aside>
      </div>`;

    const featuredEl = $("#blogFeatured");
    const listEl = $("#blogList");
    const countEl = $("#blogCount");
    const searchEl = $("#blogSearch");
    const tagCloud = $("#tagCloud");

    function paint() {
      const query = state.query.trim().toLowerCase();
      const filtered = POSTS.filter((post) => {
        const matchTag = state.tag === "全部" || post.tags.indexOf(state.tag) !== -1;
        if (!matchTag) return false;
        if (!query) return true;
        const haystack = [post.title, post.excerpt].concat(post.tags).join(" ").toLowerCase();
        return haystack.indexOf(query) !== -1;
      }).sort((a, b) => (a.date < b.date ? 1 : -1));

      const showFeatured = !query && state.tag === "全部";
      featuredEl.innerHTML = showFeatured
        ? `<article class="post-feature">
             <div>
               <div class="post-card__meta">
                 <span class="tag tag--accent">置顶</span>
                 <time datetime="${escapeHtml(featured.date)}">${formatDate(featured.date)}</time>
                 <span aria-hidden="true">·</span>
                 <span>${featured.minutes} 分钟阅读</span>
               </div>
               <h2 class="post-feature__title">
                 <a href="post.html?slug=${encodeURIComponent(featured.slug)}">${escapeHtml(
                   featured.title
                 )}</a>
               </h2>
               <p class="post-feature__excerpt">${escapeHtml(featured.excerpt)}</p>
             </div>
             <div class="post-feature__side">
               <p class="post-card__meta">标签</p>
               <div class="card__tags">${tagList(featured.tags)}</div>
               <a class="btn btn--primary btn--sm" href="post.html?slug=${encodeURIComponent(
                 featured.slug
               )}">开始阅读</a>
             </div>
           </article>`
        : "";

      let items = filtered;
      if (showFeatured) {
        items = filtered.filter((post) => post.slug !== featured.slug);
      }

      listEl.innerHTML = items.length
        ? items
            .map(
              (post) => `
          <article class="post-row">
            <h3 class="post-row__title"><a href="post.html?slug=${encodeURIComponent(
              post.slug
            )}">${escapeHtml(post.title)}</a></h3>
            <div class="post-row__meta">
              <time datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
              <span aria-hidden="true">·</span>
              <span>${post.minutes} 分钟</span>
              <span aria-hidden="true">·</span>
              <span>${escapeHtml(post.tags[0] || "笔记")}</span>
            </div>
          </article>`
            )
            .join("")
        : emptyState(
            "没有匹配的文章",
            "试试更短的关键词，或者清空筛选条件。",
            '<button class="btn btn--ghost btn--sm" type="button" id="resetBlog">清空筛选</button>'
          );

      countEl.textContent = `共 ${filtered.length} 篇`;

      const reset = $("#resetBlog");
      if (reset) {
        reset.addEventListener("click", () => {
          state.query = "";
          state.tag = "全部";
          searchEl.value = "";
          syncPills();
          paint();
        });
      }
    }

    function syncPills() {
      $$("button", tagCloud).forEach((button) => {
        const isActive = button.dataset.tag === state.tag;
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
        button.tabIndex = isActive ? 0 : -1;
      });
    }

    searchEl.addEventListener(
      "input",
      debounce(() => {
        state.query = searchEl.value;
        paint();
      }, 120)
    );

    tagCloud.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-tag]");
      if (!button) return;
      state.tag = button.dataset.tag;
      syncPills();
      paint();
    });

    initRovingKeys(tagCloud);

    paint();
  }

  /* ---------------------------------------------------------- 文章详情 --- */
  function renderPost() {
    const root = $("#postRoot");
    if (!root) return;

    const slug = params.get("slug");
    const ordered = POSTS.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const post = ordered.find((item) => item.slug === slug);

    if (!post) {
      root.innerHTML = `
        <div class="container not-found">
          <div>
            <p class="not-found__code">404</p>
            <h1>没有找到这篇文章</h1>
            <p>链接可能已经过期，或者文章还在写。</p>
            <p style="margin-top:1.25rem"><a class="btn btn--primary" href="blog.html">返回博客列表</a></p>
          </div>
        </div>`;
      document.title = "文章未找到 · " + SITE.name;
      return;
    }

    document.title = `${post.title} · ${SITE.name}`;
    const meta = $('meta[name="description"]');
    if (meta) meta.setAttribute("content", post.excerpt);

    const index = ordered.indexOf(post);
    const newer = ordered[index - 1];
    const older = ordered[index + 1];

    root.innerHTML = `
      <div class="container">
        <nav class="breadcrumb" aria-label="面包屑">
          <a href="index.html">首页</a>
          <span class="breadcrumb__sep" aria-hidden="true">/</span>
          <a href="blog.html">博客</a>
          <span class="breadcrumb__sep" aria-hidden="true">/</span>
          <span aria-current="page">${escapeHtml(post.tags[0] || "文章")}</span>
        </nav>

        <header class="article-hero">
          <div class="card__tags">${tagList(post.tags)}</div>
          <h1 class="article-title">${escapeHtml(post.title)}</h1>
          <p class="article-lede">${escapeHtml(post.excerpt)}</p>
          <div class="article-meta">
            <span>${escapeHtml(SITE.name)}</span>
            <span class="article-meta__sep" aria-hidden="true">·</span>
            <time datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
            <span class="article-meta__sep" aria-hidden="true">·</span>
            <span>${post.minutes} 分钟阅读</span>
          </div>
        </header>
      </div>

      <section class="section section--tight" style="padding-top:0">
        <div class="container article-layout">
          <div class="article">
            <div class="prose" id="articleBody">${post.body}</div>

            <nav class="article-nav" aria-label="文章导航">
              ${
                older
                  ? `<a class="article-nav__item" href="post.html?slug=${encodeURIComponent(
                      older.slug
                    )}">
                       <span class="article-nav__label">← 上一篇</span>
                       <span class="article-nav__title">${escapeHtml(older.title)}</span>
                     </a>`
                  : "<span></span>"
              }
              ${
                newer
                  ? `<a class="article-nav__item article-nav__item--next" href="post.html?slug=${encodeURIComponent(
                      newer.slug
                    )}">
                       <span class="article-nav__label">下一篇 →</span>
                       <span class="article-nav__title">${escapeHtml(newer.title)}</span>
                     </a>`
                  : ""
              }
            </nav>

            <div class="author-box">
              <span class="author-box__avatar" aria-hidden="true">${escapeHtml(SITE.initials)}</span>
              <div>
                <h3>${escapeHtml(SITE.name)}</h3>
                <p>${escapeHtml(SITE.intro)}</p>
                <p style="margin-top:.55rem"><a class="link" href="about.html">了解更多</a></p>
              </div>
            </div>
          </div>

          <aside class="article-aside">
            <nav class="toc" id="toc" aria-label="文章目录" hidden>
              <p class="toc__title">本文目录</p>
              <ul class="toc__list" id="tocList"></ul>
            </nav>
          </aside>
        </div>
      </section>`;

    initToc();
    initReadingProgress();
    initReveal();
  }

  /* ------------------------------------------------------------ 目录 --- */
  function initToc() {
    const body = $("#articleBody");
    const toc = $("#toc");
    const list = $("#tocList");
    if (!body || !toc || !list) return;

    const headings = $$("h2, h3", body);
    if (!headings.length) return;

    headings.forEach((heading, index) => {
      if (!heading.id) heading.id = `section-${index + 1}`;
    });

    list.innerHTML = headings
      .map(
        (heading) =>
          `<li><a href="#${escapeHtml(heading.id)}" data-level="${
            heading.tagName === "H3" ? "3" : "2"
          }">${escapeHtml(heading.textContent)}</a></li>`
      )
      .join("");

    toc.hidden = false;

    const links = $$("a", list);
    let ticking = false;

    const sync = () => {
      ticking = false;
      const threshold = 120;
      let current = links[0];
      headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= threshold) {
          current = links[index];
        }
      });
      links.forEach((link) => {
        link.classList.toggle("is-current", link === current);
        if (link === current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    };

    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(sync);
      },
      { passive: true }
    );
    sync();
  }

  function initReadingProgress() {
    const bar = $("#readProgress");
    if (!bar) return;

    const article = $("#articleBody");
    if (!article) return;

    let ticking = false;
    const sync = () => {
      ticking = false;
      const rect = article.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.5;
      const passed = Math.min(Math.max(-rect.top + 80, 0), Math.max(total, 1));
      const percent = total > 0 ? (passed / total) * 100 : 0;
      bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    };

    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(sync);
      },
      { passive: true }
    );
    sync();
  }

  /* ------------------------------------------------------------ 关于 --- */
  function renderAbout() {
    const timeline = $("#timeline");
    if (timeline) {
      timeline.innerHTML = TIMELINE.map(
        (item, index) => `
        <li class="timeline__item reveal" style="--delay: ${index * 70}ms">
          <p class="timeline__time">${escapeHtml(item.time)}</p>
          <h3 class="timeline__title">${escapeHtml(item.title)}</h3>
          <p class="timeline__desc">${escapeHtml(item.desc)}</p>
        </li>`
      ).join("");
    }

    const skills = $("#aboutSkills");
    if (skills) {
      skills.innerHTML = SKILLS.map(
        (group, index) => `
        <div class="skill-block reveal" style="--delay: ${index * 60}ms">
          <h3>${skillIcon(group.icon)}${escapeHtml(group.title)}</h3>
          <ul>${group.items.map((item) => `<li class="tag">${escapeHtml(item)}</li>`).join("")}</ul>
        </div>`
      ).join("");
    }
  }

  /* ------------------------------------------------------------ 联系 --- */
  function initContactForm() {
    const form = $("#contactForm");
    if (!form) return;

    const status = $("#formStatus");
    const counter = $("#messageCount");
    const STORAGE_KEY = "zhuezen.contact.messages";

    const fields = {
      name: {
        el: $("#name"),
        error: $("#nameError"),
        validate(value) {
          if (!value.trim()) return "请填写你的称呼。";
          if (value.trim().length < 2) return "称呼至少 2 个字。";
          if (value.trim().length > 40) return "称呼不要超过 40 个字。";
          return "";
        },
      },
      email: {
        el: $("#email"),
        error: $("#emailError"),
        validate(value) {
          if (!value.trim()) return "请填写邮箱，方便我回复你。";
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()))
            return "邮箱格式好像不对，例如 name@example.com。";
          return "";
        },
      },
      message: {
        el: $("#message"),
        error: $("#messageError"),
        validate(value) {
          const text = value.trim();
          if (!text) return "请写一点想说的内容。";
          if (text.length < 10) return `还差 ${10 - text.length} 个字，再多写一点吧。`;
          if (text.length > 1000) return "内容太长了，请控制在 1000 字以内。";
          return "";
        },
      },
      consent: {
        el: $("#consent"),
        error: $("#consentError"),
        validate(checked) {
          return checked ? "" : "请先确认你了解这是演示表单。";
        },
      },
    };

    let submitted = false;

    function setError(key, message) {
      const field = fields[key];
      if (!field) return;
      if (message) {
        field.el.setAttribute("aria-invalid", "true");
        if (field.error) {
          field.error.textContent = message;
          field.error.classList.add("is-shown");
        }
      } else {
        field.el.removeAttribute("aria-invalid");
        if (field.error) {
          field.error.textContent = "";
          field.error.classList.remove("is-shown");
        }
      }
    }

    function readValue(key) {
      const field = fields[key];
      if (!field) return "";
      return key === "consent" ? field.el.checked : field.el.value;
    }

    function validateAll() {
      let firstInvalid = null;
      Object.keys(fields).forEach((key) => {
        const message = fields[key].validate(readValue(key));
        setError(key, message);
        if (message && !firstInvalid) firstInvalid = fields[key].el;
      });
      return firstInvalid;
    }

    function showStatus(type, html) {
      if (!status) return;
      status.className = `form-status is-shown form-status--${type}`;
      status.innerHTML = html;
    }

    function clearStatus() {
      if (!status) return;
      status.className = "form-status";
      status.textContent = "";
    }

    Object.keys(fields).forEach((key) => {
      const field = fields[key];
      const eventName = key === "consent" ? "change" : "blur";
      field.el.addEventListener(eventName, () => {
        if (!submitted) return;
        setError(key, field.validate(readValue(key)));
      });

      // 提交失败后，边输入边消除已经修好的错误提示
      if (key !== "consent") {
        field.el.addEventListener("input", () => {
          if (!submitted) return;
          if (!field.validate(readValue(key))) setError(key, "");
        });
      }
    });

    if (counter) {
      const message = fields.message.el;
      const syncCount = () => {
        counter.textContent = `${message.value.trim().length} / 1000`;
      };
      message.addEventListener("input", syncCount);
      syncCount();
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted = true;
      clearStatus();

      const firstInvalid = validateAll();
      if (firstInvalid) {
        showStatus(
          "error",
          "<span aria-hidden=\"true\">!</span><span>还有几项需要修改，已经在对应输入框下方标出。</span>"
        );
        firstInvalid.focus();
        return;
      }

      const payload = {
        name: fields.name.el.value.trim(),
        email: fields.email.el.value.trim(),
        topic: $("#topic").value,
        message: fields.message.el.value.trim(),
        createdAt: new Date().toISOString(),
      };

      let saved = false;
      try {
        const list = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
        list.push(payload);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-20)));
        saved = true;
      } catch (error) {
        saved = false;
      }

      const count = saved ? readSavedCount() : 0;

      // 先重置表单（reset 事件会清空状态区），再显示成功提示
      form.reset();
      Object.keys(fields).forEach((key) => setError(key, ""));
      submitted = false;
      if (counter) counter.textContent = "0 / 1000";
      const hint = $("#formHint");
      if (hint && count) hint.textContent = `当前浏览器已保存 ${count} 条演示记录，仅本地可见。`;

      showStatus(
        "success",
        `<span aria-hidden="true">✓</span><span><strong>已经记下来了。</strong> 这是演示表单，内容只保存在当前浏览器的 localStorage 里，没有发送到任何服务器。${
          count ? ` 目前本地共有 ${count} 条记录。` : ""
        }</span>`
      );

      if (typeof status.focus === "function") status.focus();
    });

    form.addEventListener("reset", () => {
      submitted = false;
      clearStatus();
      Object.keys(fields).forEach((key) => setError(key, ""));
    });

    const savedCount = readSavedCount();
    if (savedCount) {
      const hint = $("#formHint");
      if (hint) hint.textContent = `当前浏览器已保存 ${savedCount} 条演示记录，仅本地可见。`;
    }
  }

  function readSavedCount() {
    try {
      const list = JSON.parse(window.localStorage.getItem("zhuezen.contact.messages") || "[]");
      return Array.isArray(list) ? list.length : 0;
    } catch (error) {
      return 0;
    }
  }

  /* ------------------------------------------------------------ 启动 --- */
  function boot() {
    initStarfield();
    initHeader();
    initNav();
    initYear();

    const page = document.body.dataset.page;

    if (page === "home") renderHome();
    if (page === "projects") renderProjectList();
    if (page === "project") renderProjectDetail();
    if (page === "blog") renderBlog();
    if (page === "post") renderPost();
    if (page === "about") renderAbout();
    if (page === "contact") initContactForm();

    initReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
