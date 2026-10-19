/**
 * 商品图片提取器 —— 内容脚本
 * ---------------------------------------------------------------------------
 * 职责：
 *   1. 在淘宝/天猫、京东、拼多多商家版的商品详情页右下角注入悬浮按钮
 *   2. 点击后扫描页面中的商品图片（<img>、srcset、懒加载属性、背景图）
 *   3. 过滤图标 / 占位图 / 小图，补全相对路径并去重
 *   4. 通过 chrome.runtime.sendMessage 把结果交给 Service Worker
 *
 * 按钮使用 Shadow DOM 渲染，避免与页面样式互相污染。
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // 防止 SPA 重复注入（例如页面内部跳转导致脚本被执行两次）
  if (window.__IMGX_CONTENT_LOADED__) return;
  window.__IMGX_CONTENT_LOADED__ = true;

  var U = window.ImgXUtils;
  if (!U) {
    console.warn('[商品图片提取器] 工具库 lib/image-utils.js 未加载，脚本退出');
    return;
  }

  /* ------------------------------------------------------------------ *
   * 常量配置
   * ------------------------------------------------------------------ */

  var MIN_SIDE = U.MIN_SIDE; // 小于 100x100 的图片视为图标
  var PROBE_CONCURRENCY = 6; // 同时预加载的图片数量
  var PROBE_TIMEOUT = 8000; // 单张图片预加载超时（毫秒）
  var PROBE_BUDGET = 15000; // 整个预加载阶段的预算（毫秒），超时后不再等待
  var MAX_PROBE = 240; // 最多预加载这么多张，避免超大页面卡死

  /* ------------------------------------------------------------------ *
   * 运行时状态
   * ------------------------------------------------------------------ */

  var state = 'idle'; // idle | scanning | ready | empty
  var scanSeq = 0; // 扫描序号，用于丢弃过期扫描的结果
  var lastScanId = ''; // 上一次扫描对应的图库 id
  var ui = null; // Shadow DOM 中的元素引用

  /* ------------------------------------------------------------------ *
   * 基础工具
   * ------------------------------------------------------------------ */

  /** 判断当前是否需要显示按钮：URL 命中详情页规则，或带 __imgx 调试参数 */
  function shouldMount() {
    try {
      if (/[?&]__imgx(=[^&]*)?(&|$)/.test(location.search)) return true;
    } catch (e) {
      /* ignore */
    }
    return U.isProductPage(location.href);
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { resolve(); });
      else setTimeout(resolve, 16);
    });
  }

  /** 安全调用 chrome.runtime.getURL（扩展被重载后会失效） */
  function extensionUrl(path) {
    try {
      return chrome.runtime.getURL(path);
    } catch (e) {
      return '';
    }
  }

  /** 生成一个足够随机的扫描 id */
  function newScanId() {
    return 'scan_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ------------------------------------------------------------------ *
   * 界面：悬浮按钮 + 结果面板
   * ------------------------------------------------------------------ */

  var BUTTON_ICON =
    '<svg class="imgx-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" y1="3" x2="12" y2="15"/></svg>';

  var SPINNER_ICON =
    '<svg class="imgx-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  function mountUI() {
    var host = document.createElement('div');
    host.setAttribute('data-imgx-host', '1');
    // host 本身不参与布局，仅作为 Shadow 挂载点
    host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483000;';

    var shadow = host.attachShadow({ mode: 'open' });

    // 通过 <link> 引入 content.css（manifest 中已声明为 web_accessible_resources）
    var cssHref = extensionUrl('content.css');
    if (cssHref) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssHref;
      shadow.appendChild(link);
    }

    var root = document.createElement('div');
    root.className = 'imgx-root';
    root.innerHTML =
      '<button class="imgx-btn" type="button" title="扫描本页商品图片">' +
      BUTTON_ICON +
      '<span class="imgx-btn__label">获取图片</span>' +
      '</button>' +
      '<div class="imgx-panel" hidden>' +
      '<button class="imgx-panel__close" type="button" aria-label="关闭">×</button>' +
      '<div class="imgx-panel__meta">' +
      '<span class="imgx-panel__count">0</span>' +
      '<span class="imgx-panel__label">张图片</span>' +
      '</div>' +
      '<p class="imgx-panel__hint">已在新标签页打开图库，勾选后可批量下载为 PNG。</p>' +
      '<div class="imgx-panel__actions">' +
      '<button class="imgx-panel__open" type="button">打开图库</button>' +
      '<button class="imgx-panel__again" type="button">重新扫描</button>' +
      '</div>' +
      '</div>';

    shadow.appendChild(root);
    document.documentElement.appendChild(host);

    ui = {
      host: host,
      button: shadow.querySelector('.imgx-btn'),
      label: shadow.querySelector('.imgx-btn__label'),
      panel: shadow.querySelector('.imgx-panel'),
      count: shadow.querySelector('.imgx-panel__count'),
      hint: shadow.querySelector('.imgx-panel__hint'),
      open: shadow.querySelector('.imgx-panel__open'),
      again: shadow.querySelector('.imgx-panel__again'),
      close: shadow.querySelector('.imgx-panel__close')
    };

    ui.button.addEventListener('click', function () {
      startScan();
    });
    ui.again.addEventListener('click', function () {
      startScan();
    });
    ui.open.addEventListener('click', openGallery);
    ui.close.addEventListener('click', hidePanel);
  }

  function setBusy(busy, text) {
    if (!ui) return;
    ui.button.dataset.busy = busy ? 'true' : 'false';
    ui.button.disabled = !!busy;
    if (text) ui.label.textContent = text;
    // 忙碌时把图标换成旋转的圆弧，空闲时换回下载图标
    var icon = ui.button.querySelector('svg');
    if (icon) icon.outerHTML = busy ? SPINNER_ICON : BUTTON_ICON;
  }

  function showPanel(count, options) {
    if (!ui) return;
    var opts = options || {};
    ui.count.textContent = String(count);
    ui.panel.hidden = false;
    ui.panel.classList.toggle('imgx-panel--empty', count === 0);

    if (count === 0) {
      ui.hint.textContent = '没有找到符合条件的图片。先向下滚动页面让懒加载图片出现，再试一次。';
      ui.open.disabled = true;
      ui.open.style.opacity = '0.5';
      ui.open.style.cursor = 'not-allowed';
    } else {
      ui.hint.textContent = opts.opened === false
        ? '图库未能自动打开，点击下方按钮查看。'
        : '已在新标签页打开图库，勾选后可批量下载为 PNG。';
      ui.open.disabled = false;
      ui.open.style.opacity = '';
      ui.open.style.cursor = '';
    }
  }

  function hidePanel() {
    if (ui) ui.panel.hidden = true;
  }

  function openGallery() {
    if (!lastScanId) return;
    try {
      chrome.runtime.sendMessage({ type: 'IMGX_OPEN_GALLERY', scanId: lastScanId });
    } catch (e) {
      console.warn('[商品图片提取器] 打开图库失败', e);
    }
  }

  /* ------------------------------------------------------------------ *
   * 图片预加载：拿到真实尺寸，用于过滤小图和不可用的链接
   * ------------------------------------------------------------------ */

  function probeImage(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      var settled = false;

      var timer = setTimeout(function () {
        finish(null);
      }, PROBE_TIMEOUT);

      function finish(value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve(value);
      }

      img.onload = function () {
        finish({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = function () {
        finish(null);
      };

      try {
        // 很多 CDN 会校验 Referer，no-referrer 能显著提高成功率
        img.referrerPolicy = 'no-referrer';
        img.decoding = 'async';
        img.src = url;
      } catch (e) {
        finish(null);
      }
    });
  }

  /**
   * 并发预加载一组图片，返回过滤后的列表。
   * @param {Array} items 候选图片
   * @param {(done:number,total:number)=>void} onProgress
   */
  function probeAll(items, onProgress) {
    var total = items.length;
    var cursor = 0;
    var done = 0;
    var deadline = Date.now() + PROBE_BUDGET;
    var results = new Array(total);

    function worker() {
      if (cursor >= total) return Promise.resolve();
      var index = cursor++;
      var item = items[index];

      // 超出时间预算：保留该图但标记尺寸未知，交给图库页面二次校验
      if (Date.now() > deadline) {
        results[index] = { item: item, unknown: true };
        done++;
        if (onProgress) onProgress(done, total);
        return worker();
      }

      return probeImage(item.url).then(function (size) {
        if (!size) {
          results[index] = null; // 加载失败，丢弃
        } else if (size.width < MIN_SIDE || size.height < MIN_SIDE) {
          results[index] = null; // 小图，丢弃
        } else {
          results[index] = {
            item: {
              url: item.url,
              source: item.source,
              width: size.width,
              height: size.height
            }
          };
        }
        done++;
        if (onProgress) onProgress(done, total);
        return worker();
      });
    }

    var workers = [];
    var count = Math.min(PROBE_CONCURRENCY, total);
    for (var i = 0; i < count; i++) workers.push(worker());
    return Promise.all(workers).then(function () {
      return results;
    });
  }

  /* ------------------------------------------------------------------ *
   * 主流程
   * ------------------------------------------------------------------ */

  function startScan() {
    if (state === 'scanning') return;
    var seq = ++scanSeq;
    state = 'scanning';

    hidePanel();
    setBusy(true, '扫描中…');

    // 等一帧，让按钮先切换到忙碌态，再开始同步扫描
    nextFrame()
      .then(function () {
        // 页面可能加载了新的懒加载图片，这里重新走一遍完整采集
        var candidates = U.collectCandidates(document, { minSide: MIN_SIDE });
        var unique = U.dedupe(candidates);

        // 已知尺寸的直接按阈值过滤，未知尺寸的进入预加载队列
        var known = [];
        var unknown = [];
        for (var i = 0; i < unique.length; i++) {
          var c = unique[i];
          if (c.width && c.height) {
            if (c.width >= MIN_SIDE && c.height >= MIN_SIDE) known.push(c);
          } else {
            unknown.push(c);
          }
        }

        var toProbe = unknown.slice(0, MAX_PROBE);
        var overflow = unknown.slice(MAX_PROBE); // 超出上限的先保留

        if (!toProbe.length) return { known: known, probed: [], overflow: overflow };

        return probeAll(toProbe, function (doneCount, total) {
          if (seq !== scanSeq) return; // 已有新的扫描，忽略旧进度
          setBusy(true, '扫描中 ' + doneCount + '/' + total);
        }).then(function (results) {
          var probed = [];
          for (var j = 0; j < results.length; j++) {
            var r = results[j];
            if (!r) continue;
            probed.push(r.item);
          }
          return { known: known, probed: probed, overflow: overflow };
        });
      })
      .then(function (bag) {
        if (seq !== scanSeq) return null;

        var images = bag.known.concat(bag.probed).concat(bag.overflow);

        // 按面积从大到小排序，主图自然排在最前面
        images.sort(function (a, b) {
          return (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0);
        });

        return submitResult(images);
      })
      .then(function (res) {
        if (seq !== scanSeq || !res) return;
        lastScanId = res.id || '';
        state = res.count > 0 ? 'ready' : 'empty';
        setBusy(false, '获取图片');
        showPanel(res.count, { opened: res.opened !== false });
      })
      .catch(function (err) {
        console.error('[商品图片提取器] 扫描失败', err);
        state = 'idle';
        setBusy(false, '获取图片');
        showPanel(0);
      });
  }

  /** 把扫描结果发给 Service Worker，由它落库并打开图库页 */
  function submitResult(images) {
    var payload = {
      id: newScanId(),
      pageUrl: location.href,
      pageTitle: document.title || '',
      scannedAt: Date.now(),
      images: images
    };

    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({ type: 'IMGX_SCAN_RESULT', payload: payload }, function (res) {
          // 扩展被重载后 chrome.runtime.lastError 会有值
          if (chrome.runtime.lastError) {
            resolve({ id: payload.id, count: images.length, opened: false });
            return;
          }
          resolve(res || { id: payload.id, count: images.length, opened: false });
        });
      } catch (e) {
        resolve({ id: payload.id, count: images.length, opened: false });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 与 Service Worker 通信
   * ------------------------------------------------------------------ */

  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || !msg.type) return;

      // 点击工具栏图标时，由 background 通知当前页面开始扫描
      if (msg.type === 'IMGX_START_SCAN') {
        startScan();
        sendResponse({ ok: true });
        return false;
      }

      // 用于 background 判断内容脚本是否已就绪
      if (msg.type === 'IMGX_PING') {
        sendResponse({ ok: true, state: state });
        return false;
      }
    });
  } catch (e) {
    console.warn('[商品图片提取器] 消息监听注册失败', e);
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */

  function boot() {
    if (!shouldMount()) return;
    if (document.querySelector('[data-imgx-host]')) return;
    mountUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
