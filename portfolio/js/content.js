/* ==========================================================================
   content.js · 内容覆盖层
   - 把 data.js 的默认内容与后台保存的修改合并
   - 负责把站点级信息（姓名、简介、邮箱等）写回静态 HTML
   - 后台（admin.html）通过 window.SiteContent 读写同一份数据
   ========================================================================== */
(function () {
  "use strict";

  const STORAGE_KEY = "zhuezen.content.v1";

  /* 记录 data.js 的初始值，后台「恢复默认」时使用 */
  const defaults = {
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

  function readStore() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeStore(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function merge(store) {
    if (store.site) Object.assign(SITE, store.site);

    (PROJECTS || []).forEach((project) => {
      const patch = store.projects && store.projects[project.id];
      if (patch) Object.assign(project, patch);
    });

    (POSTS || []).forEach((post) => {
      const patch = store.posts && store.posts[post.slug];
      if (patch) Object.assign(post, patch);
    });
  }

  /* 把站点信息写进带有 data-site 的静态节点 */
  function bindSite() {
    document.querySelectorAll("[data-site]").forEach((el) => {
      const key = el.getAttribute("data-site");

      if (key === "email") {
        el.textContent = SITE.email;
        if (el.tagName === "A") el.href = "mailto:" + SITE.email;
        return;
      }

      if (key === "github") {
        if (el.tagName === "A") el.href = SITE.github;
        return;
      }

      if (key === "name-latin") {
        el.textContent = SITE.name + " · " + SITE.latin;
        return;
      }

      if (SITE[key] != null) el.textContent = SITE[key];
    });

    document.querySelectorAll("[data-brand-link]").forEach((el) => {
      el.setAttribute("aria-label", SITE.name + " · 首页");
    });

    const page = document.body.dataset.page;
    if (page === "home") {
      document.title = SITE.name + " · " + SITE.tagline;
    } else if (page && page !== "project" && page !== "post") {
      document.title = document.title.split(" · ")[0] + " · " + SITE.name;
    }
  }

  function save(payload) {
    const previous = readStore();
    const next = {
      site: Object.assign({}, previous.site || {}, payload.site || {}),
      projects: Object.assign({}, previous.projects || {}, payload.projects || {}),
      posts: Object.assign({}, previous.posts || {}, payload.posts || {}),
      updatedAt: new Date().toISOString(),
    };
    return writeStore(next);
  }

  function reset() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }

  merge(readStore());

  window.SiteContent = {
    STORAGE_KEY,
    defaults,
    readStore,
    writeStore,
    save,
    reset,
    bindSite,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindSite);
  } else {
    bindSite();
  }
})();
