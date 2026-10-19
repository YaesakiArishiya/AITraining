/**
 * 官网交互脚本
 * 1. 滚动时高亮当前所在的导航项
 * 2. 页脚年份自适应
 * 页面其余部分都是静态内容，即使脚本加载失败也不影响阅读。
 */
(function () {
  'use strict';

  var links = Array.prototype.slice.call(document.querySelectorAll('.nav__links a'));

  var targets = links
    .map(function (link) {
      var href = link.getAttribute('href') || '';
      if (href.charAt(0) !== '#' || href === '#top') return null;
      var el = document.querySelector(href);
      return el ? { link: link, el: el } : null;
    })
    .filter(Boolean);

  /** 找出「顶部已经越过导航栏」的最后一个区块 */
  function updateActive() {
    var offset = 120; // 导航栏高度 + 一点余量
    var current = null;

    targets.forEach(function (item) {
      var top = item.el.getBoundingClientRect().top;
      if (top - offset <= 0) current = item;
    });

    links.forEach(function (link) {
      var isCurrent = !!current && link === current.link;
      link.classList.toggle('is-active', isCurrent);
    });
  }

  if (targets.length) {
    var ticking = false;

    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          updateActive();
        });
      },
      { passive: true }
    );

    window.addEventListener('resize', updateActive);
    updateActive();
  }

  // 页脚年份：只覆盖带有 data-year 占位符的元素
  var yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
