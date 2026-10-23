/* ==========================================================================
   图提取 ImageGrab · 官网交互脚本
   纯原生 JS，无依赖。包含：
   1. 滚动后导航栏吸顶样式
   2. 移动端汉堡菜单（含键盘与点击外部关闭）
   3. 滚动监听：高亮当前区块的导航项
   4. IntersectionObserver：元素进入视口淡入上移
   5. 页脚年份自动更新
   ========================================================================== */

(function () {
  'use strict';

  var header = document.getElementById('siteHeader');
  var nav = document.getElementById('primaryNav');
  var navToggle = document.getElementById('navToggle');
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav__link')
  );

  var prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  /* ------------------------------------------------------ 1. 导航吸顶 --- */
  var lastScrolledState = null;

  function updateHeaderState() {
    if (!header) return;
    var scrolled = window.scrollY > 8;
    if (scrolled === lastScrolledState) return;
    lastScrolledState = scrolled;
    header.classList.toggle('is-scrolled', scrolled);
  }

  /* --------------------------------------------------- 2. 移动端菜单 --- */
  var mobileQuery = window.matchMedia('(min-width: 1024px)');

  function isMenuOpen() {
    return nav && nav.classList.contains('is-open');
  }

  function openMenu() {
    if (!nav || !navToggle) return;
    nav.classList.add('is-open');
    navToggle.setAttribute('aria-expanded', 'true');
    navToggle.setAttribute('aria-label', '关闭菜单');
  }

  function closeMenu() {
    if (!nav || !navToggle) return;
    nav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', '打开菜单');
  }

  if (navToggle) {
    navToggle.addEventListener('click', function (event) {
      event.stopPropagation();
      if (isMenuOpen()) {
        closeMenu();
      } else {
        openMenu();
      }
    });
  }

  // 点击菜单内的锚点后收起面板
  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      if (!mobileQuery.matches) closeMenu();
    });
  });

  // 点击菜单与按钮之外的区域关闭
  document.addEventListener('click', function (event) {
    if (!isMenuOpen()) return;
    if (nav && nav.contains(event.target)) return;
    if (navToggle && navToggle.contains(event.target)) return;
    closeMenu();
  });

  // Escape 关闭并把焦点还给按钮
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isMenuOpen()) {
      closeMenu();
      if (navToggle) navToggle.focus();
    }
  });

  // 切换到桌面断点时复位菜单状态
  function handleBreakpointChange(event) {
    if (event.matches) closeMenu();
  }
  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', handleBreakpointChange);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(handleBreakpointChange);
  }

  /* --------------------------------------------- 3. 导航当前区块高亮 --- */
  // 参与滚动监听的区块（与导航锚点一一对应）
  var sectionIds = ['intro', 'features', 'install', 'download'];
  var sections = sectionIds
    .map(function (id) {
      return document.getElementById(id);
    })
    .filter(Boolean);

  function setActiveLink(id) {
    navLinks.forEach(function (link) {
      var href = link.getAttribute('href') || '';
      var active = href === '#' + id;
      link.classList.toggle('is-active', active);
      if (active) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  var activeId = '';
  var ticking = false;

  function updateActiveSection() {
    if (!sections.length) return;

    // 吸顶导航高度 + 一点余量，作为判定线
    var headerHeight = header ? header.offsetHeight : 0;
    var line = window.scrollY + headerHeight + 80;
    var current = '';

    sections.forEach(function (section) {
      var top = section.getBoundingClientRect().top + window.scrollY;
      if (top <= line) current = section.id;
    });

    // 页面滚动到底部时，强制高亮最后一项（CTA 区块较矮，可能到不了判定线）
    var nearBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 4;
    if (nearBottom) current = sections[sections.length - 1].id;

    if (current !== activeId) {
      activeId = current;
      setActiveLink(current);
    }
  }

  function onScroll() {
    updateHeaderState();
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(function () {
        updateActiveSection();
        ticking = false;
      });
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  /* ------------------------------------- 4. 进入视口的淡入上移动画 --- */
  var revealItems = Array.prototype.slice.call(
    document.querySelectorAll('.reveal')
  );

  if (!('IntersectionObserver' in window) || prefersReducedMotion) {
    // 不支持或用户偏好减少动态：直接显示全部内容
    revealItems.forEach(function (el) {
      el.classList.add('is-visible', 'is-done');
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          // 动画结束后移除 will-change，减少合成层占用
          window.setTimeout(function () {
            entry.target.classList.add('is-done');
          }, 800);
          observer.unobserve(entry.target);
        });
      },
      {
        // 元素露出约 12% 时触发，底部预留一点空间让动画更自然
        threshold: 0.12,
        rootMargin: '0px 0px -8% 0px',
      }
    );

    revealItems.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* ------------------------------------------------- 5. 页脚年份 --- */
  var yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* ------------------------------------------------------ 初始化 --- */
  updateHeaderState();
  updateActiveSection();
})();
