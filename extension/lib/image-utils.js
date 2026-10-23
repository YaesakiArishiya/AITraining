/**
 * 商品图片提取器 —— 核心工具库
 * ---------------------------------------------------------------------------
 * 本文件被三种运行环境共享，因此没有使用任何框架、也没有依赖 DOM 全局对象：
 *   1. Chrome 内容脚本：manifest.json 的 content_scripts 会把本文件排在 content.js 之前加载
 *   2. Service Worker：background.js 通过 importScripts('lib/image-utils.js') 引入
 *   3. Node.js 单元测试：tests/unit.test.js 通过 require() 引入
 *
 * 设计原则：所有函数都是纯函数或只依赖传入的 document，方便单独测试。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  // Node.js 环境
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  // 浏览器 / Service Worker 环境
  if (root) {
    root.ImgXUtils = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 图片最小边长（像素），小于该值的图片视为图标 / 占位图，会被过滤 */
  var MIN_SIDE = 100;

  /** 单次扫描最多保留的图片数量，避免超大页面把内存吃满 */
  var MAX_IMAGES = 600;

  /**
   * 懒加载属性名清单。
   * 三个平台的实现各不相同，这里做并集处理：
   *   淘宝 / 天猫：data-src、data-ks-lazyload、data-lazy-src
   *   京东：      data-lazy-img、data-original、data-url
   *   拼多多：    data-src、data-original、data-image
   */
  var LAZY_ATTRS = [
    'data-src',
    'data-lazy-src',
    'data-lazy',
    'data-lazy-img',
    'data-original',
    'data-ks-lazyload',
    'data-lazyload',
    'data-url',
    'data-image',
    'data-img',
    'data-echo'
  ];

  /** 这些协议的地址无法被 chrome.downloads 正常下载，直接跳过 */
  var UNSUPPORTED_RE = /^(data|blob|about|javascript|chrome-extension):/i;

  /**
   * 装饰性图片关键字。注意保持保守：只拦截「几乎不可能是商品图」的词，
   * 否则容易误伤（例如商品标题里带 icon 的情况不会跑到 URL 里，影响有限）。
   */
  var DECORATIVE_RE = new RegExp(
    [
      'logo',
      'sprite',
      'placeholder',
      'blank\\.(gif|png)',
      'spacer',
      'loading\\.(gif|png)',
      'avatar',
      '/icon',
      'qrcode',
      'qr_code',
      'barcode',
      'noimage',
      'no-image',
      'nopic',
      'default_pic',
      'watermark'
    ].join('|'),
    'i'
  );

  /** 纯数字命名的 1x1 像素图常见于统计打点，例如 /1x1.gif */
  var TINY_RE = /(^|\/)(1x1|2x2|transparent|pixel)\.(gif|png)(\?|$)/i;

  /* ------------------------------------------------------------------ *
   * URL 处理
   * ------------------------------------------------------------------ */

  /**
   * 把相对路径 / 协议相对路径补全为绝对 URL。
   * @param {string} raw 原始地址
   * @param {string} base 基准地址（通常是 document.baseURI）
   * @returns {string} 绝对 URL，非法时返回空字符串
   */
  function resolveUrl(raw, base) {
    if (!raw || typeof raw !== 'string') return '';
    var s = raw.trim();
    if (!s || s === '#' || s.indexOf('about:') === 0) return '';
    // 去掉属性里的换行、制表符（换行常用于 srcset）
    s = s.replace(/[\r\n\t]/g, ' ').trim();
    // CSS 里常见的 url("...") 残留
    var cssUrl = s.match(/^url\((['"]?)(.*?)\1\)$/i);
    if (cssUrl) s = cssUrl[2].trim();
    if (!s) return '';
    try {
      var u = new URL(s, base || undefined);
      // 只处理 http(s)，其它协议（data:/blob:）交给调用方过滤
      return u.href;
    } catch (e) {
      return '';
    }
  }

  /**
   * 还原 CDN 缩略图地址为原图地址。
   * 三家平台的图片 CDN 都会在文件名后追加缩放参数，例如：
   *   天猫：O1CN01xxx.jpg_430x430q90.jpg  -> O1CN01xxx.jpg
   *   京东：xxx.jpg!q70.dpg.webp          -> xxx.jpg
   *   拼多多：xxx.jpg?imageView2/2/w/400   -> xxx.jpg
   * 还原后不同尺寸的同一张图会被去重成一条记录。
   */
  function getOriginalUrl(url) {
    if (!url) return '';
    var out = url;

    // 1) 路径末尾的 _430x430q90.jpg / _50x50.jpg 之类
    out = out.replace(
      /^(https?:\/\/[^?#]+?\.(?:jpe?g|png|webp|gif))_\d+x\d+[^/?#]*(.*)$/i,
      function (_m, base, rest) {
        return base + rest;
      }
    );

    // 2) 天猫 / 阿里 CDN 的 .jpg_.webp 形式
    out = out.replace(/^(https?:\/\/[^?#]+?\.(?:jpe?g|png|gif))_\.(?:webp|avif)(.*)$/i, '$1$2');

    // 3) 京东的 !q70.dpg.webp 后缀
    out = out.replace(/^(https?:\/\/[^?#]+?\.(?:jpe?g|png|webp|gif))![^?#]*(.*)$/i, '$1$2');

    // 4) 拼多多的阿里云图片处理参数，只删除明确是缩放指令的 query
    //    兼容 ?imageView2/2/w/400 与 ?imageView2=2/w/400 两种写法
    out = out.replace(
      /[?&](?:imageView2|imageMogr2|imageslim|x-oss-process)(?:=[^&#]*|\/[^&#]*)/gi,
      function (m) {
        return m.charAt(0) === '?' ? '?' : '';
      }
    );
    // 上一步可能留下 "?&" 或结尾的 "?"
    out = out.replace(/[?&]$/, '').replace(/\?&/, '?');

    return out;
  }

  /** 判断地址是否无法下载 */
  function isUnsupportedUrl(url) {
    return !url || UNSUPPORTED_RE.test(url) || /\.svg(?:[?#]|$)/i.test(url);
  }

  /** 判断地址是否明显是图标 / 占位图 */
  function isDecorativeUrl(url) {
    if (!url) return true;
    return DECORATIVE_RE.test(url) || TINY_RE.test(url);
  }

  /** 已知支持 HTTPS 的电商图片 CDN */
  var SECURE_HOST_RE = /(^|\.)(alicdn|taobao|tmall|jd|jdimg|360buyimg|pddpic|pinduoduo|yangkeduo)\.(com|hk|net)$/i;

  /**
   * 把 http 图片地址升级为 https。
   * 扩展页面和 Service Worker 都运行在安全上下文（secure context）中，
   * 加载 http 资源会被当作混合内容（mixed content）拦截，因此必须升级。
   */
  function toSecureUrl(url) {
    if (!url || url.indexOf('http://') !== 0) return url;
    try {
      var u = new URL(url);
      if (SECURE_HOST_RE.test(u.hostname)) {
        u.protocol = 'https:';
        return u.href;
      }
    } catch (e) {
      /* ignore */
    }
    return url;
  }

  /** 去重用的归一化 key：忽略协议、大小写、hash，并还原为原图地址 */
  function normalizeKey(url) {
    if (!url) return '';
    try {
      var u = new URL(getOriginalUrl(url));
      u.hash = '';
      u.protocol = 'https:';
      return (u.hostname + u.pathname).toLowerCase() + u.search;
    } catch (e) {
      return url.toLowerCase();
    }
  }

  /**
   * 从 srcset 里挑选尺寸最大的一张。
   * 支持 "a.jpg 1x, b.jpg 2x" 与 "a.jpg 200w, b.jpg 800w" 两种写法。
   */
  function pickLargestFromSrcset(srcset) {
    if (!srcset || typeof srcset !== 'string') return '';
    var parts = srcset.split(',');
    var best = '';
    var bestScore = -1;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!part) continue;
      var m = part.match(/^(\S+)(?:\s+(\d+(?:\.\d+)?)(w|x))?$/i);
      if (!m) continue;
      var value = m[2] ? parseFloat(m[2]) : 1;
      // 宽度描述符直接比较，像素密度描述符放大后比较，保证 2x 优先于 1x
      var score = m[3] && m[3].toLowerCase() === 'x' ? value * 1000 : value;
      if (score > bestScore) {
        bestScore = score;
        best = m[1];
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ *
   * DOM 采集
   * ------------------------------------------------------------------ */

  /**
   * 扫描一个文档，收集所有候选图片。
   * @param {Document} doc
   * @param {{minSide?: number, maxNodes?: number}} [opts]
   * @returns {Array<{url:string, source:string, width:number, height:number}>}
   */
  function collectCandidates(doc, opts) {
    var o = opts || {};
    var minSide = typeof o.minSide === 'number' ? o.minSide : MIN_SIDE;
    var maxNodes = typeof o.maxNodes === 'number' ? o.maxNodes : 4000;
    var win = doc.defaultView || null;
    var base = doc.baseURI || (win && win.location && win.location.href) || undefined;
    var out = [];

    function push(raw, source, w, h) {
      var url = resolveUrl(raw, base);
      if (!url) return;
      if (isUnsupportedUrl(url)) return;
      if (isDecorativeUrl(url)) return;
      out.push({
        url: toSecureUrl(getOriginalUrl(url)),
        source: source,
        width: w > 0 ? w : 0,
        height: h > 0 ? h : 0
      });
    }

    // ---- 1. <img> 标签及其懒加载属性 ----
    var imgs = doc.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];

      // 只有真正加载完成的图片才有可信的尺寸；
      // 不能用 img.width（那是布局宽度，与图片实际像素无关）
      var loaded = img.complete && img.naturalWidth > 0;
      var natW = loaded ? img.naturalWidth : 0;
      var natH = loaded ? img.naturalHeight : 0;

      var current = img.currentSrc || '';
      var currentAbs = current ? resolveUrl(current, base) : '';

      /** 判断某个属性值是否就是当前真正显示的这张图 */
      function isCurrent(raw) {
        if (!raw || !currentAbs) return false;
        return resolveUrl(raw, base) === currentAbs;
      }

      if (current) push(current, 'img.currentSrc', natW, natH);

      var srcAttr = img.getAttribute('src');
      push(srcAttr, 'img.src', isCurrent(srcAttr) ? natW : 0, isCurrent(srcAttr) ? natH : 0);

      // 懒加载属性里是「另一张图的地址」，尺寸与当前元素无关，必须留空待探测
      for (var a = 0; a < LAZY_ATTRS.length; a++) {
        push(img.getAttribute(LAZY_ATTRS[a]), 'img.' + LAZY_ATTRS[a], 0, 0);
      }

      var srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
      var best = pickLargestFromSrcset(srcset);
      if (best) push(best, 'img.srcset', isCurrent(best) ? natW : 0, isCurrent(best) ? natH : 0);
    }

    // ---- 2. <picture><source srcset> ----
    var sources = doc.querySelectorAll('picture source, source[srcset]');
    for (var s = 0; s < sources.length; s++) {
      var bestSource = pickLargestFromSrcset(sources[s].getAttribute('srcset'));
      if (bestSource) push(bestSource, 'source.srcset', 0, 0);
    }

    // ---- 3. 行内 background-image ----
    // 注意：元素的盒子尺寸不等于图片尺寸，因此这里不传尺寸，交由后续预加载探测
    var bgRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    var inlineBgs = doc.querySelectorAll('[style*="background"]');
    for (var b = 0; b < inlineBgs.length; b++) {
      var style = inlineBgs[b].getAttribute('style') || '';
      var match;
      bgRe.lastIndex = 0;
      while ((match = bgRe.exec(style))) {
        push(match[2], 'style.background', 0, 0);
      }
    }

    // ---- 4. 样式表里定义的 background-image（需要计算样式，因此限量扫描）----
    if (win && typeof win.getComputedStyle === 'function') {
      var nodes = doc.querySelectorAll('div,section,li,a,span,figure,p,picture,dd,dt');
      var scanned = 0;
      for (var n = 0; n < nodes.length && scanned < maxNodes; n++) {
        var el = nodes[n];
        // 先做廉价的尺寸判断，跳过不可能承载商品图的小节点
        if ((el.offsetWidth || 0) < minSide || (el.offsetHeight || 0) < minSide) continue;
        scanned++;
        var bg = '';
        try {
          bg = win.getComputedStyle(el).backgroundImage || '';
        } catch (e) {
          continue;
        }
        if (!bg || bg === 'none') continue;
        bgRe.lastIndex = 0;
        while ((match = bgRe.exec(bg))) {
          push(match[2], 'computed.background', 0, 0);
        }
      }
    }

    return out;
  }

  /**
   * 按归一化 URL 去重。
   * 同一张图可能同时出现在 src、srcset、background 里，合并后保留信息最全的一条。
   */
  function dedupe(list) {
    var seen = Object.create(null);
    var result = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || !item.url) continue;
      var key = normalizeKey(item.url);
      if (!key) continue;

      var prev = seen[key];
      if (prev) {
        // 合并：后来者带有尺寸信息时补进去（通常是真正加载过的那一条）
        if (!prev.width && item.width) {
          prev.width = item.width;
          prev.height = item.height;
        }
        continue;
      }

      // 统一存原图地址，保证返回结果本身就是可下载的原图
      var record = {
        url: getOriginalUrl(item.url),
        source: item.source || '',
        width: item.width || 0,
        height: item.height || 0
      };

      seen[key] = record;
      result.push(record);
      if (result.length >= MAX_IMAGES) break;
    }
    return result;
  }

  /* ------------------------------------------------------------------ *
   * 站点识别
   * ------------------------------------------------------------------ */

  /**
   * 判断当前页面属于哪个平台。
   * @returns {'taobao'|'jd'|'pdd'|null}
   */
  function matchPlatform(urlStr) {
    var u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return null;
    }
    var host = u.hostname.toLowerCase();
    if (/(^|\.)(taobao|tmall)\.com$/.test(host)) return 'taobao';
    if (/(^|\.)jd\.com$/.test(host) || /(^|\.)jd\.hk$/.test(host)) return 'jd';
    if (/(^|\.)pinduoduo\.com$/.test(host) || /(^|\.)yangkeduo\.com$/.test(host)) return 'pdd';
    return null;
  }

  /**
   * 判断是否为「商品详情页」。
   * 需求要求只在详情页出现按钮，因此这里用 URL 规则做严格判断；
   * 常见的列表页 / 首页 / 商家后台首页都不会命中。
   */
  function isProductPage(urlStr) {
    var platform = matchPlatform(urlStr);
    if (!platform) return false;

    var u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return false;
    }
    var host = u.hostname.toLowerCase();
    var path = u.pathname.toLowerCase();
    var search = u.search.toLowerCase();

    if (platform === 'taobao') {
      // item.taobao.com/item.htm?id=xxx / detail.tmall.com/item.htm?id=xxx
      if (/\/item\.htm$/.test(path) || path === '/item.htm') return true;
      if (/\/(i|detail)\d*\.htm$/.test(path)) return true;
      // detail.tmall.com、chaoshi.detail.tmall.com、world.tmall.com 等子站
      if (/^(detail|chaoshi\.detail|world\.tmall|travel\.detail|list\.tmall)\./.test(host) && /\.htm$/.test(path)) {
        return true;
      }
      return false;
    }

    if (platform === 'jd') {
      // item.jd.com/100012043978.html
      if (/^item\.jd\.(com|hk|n)$/.test(host)) return /\/\d+\.html$/.test(path);
      // 京东国际
      if (/^(npcitem|item)\.jd\.hk$/.test(host)) return /\d+\.html$/.test(path);
      // m.jd.com/product/123.html
      if (/\/product\/\d+\.html$/.test(path)) return true;
      // 商家后台的商品编辑页
      if (/(^|\.)mms\.jd\.com$/.test(host) || /shop\.jd\.com$/.test(host)) {
        return /(product|goods|item|ware)/.test(path);
      }
      return false;
    }

    // 拼多多：mobile.yangkeduo.com/goods.html?goods_id=xxx
    if (/goods\d*\.html$/.test(path)) return true;
    if (/(goods_id|goodsId)=/.test(search)) return true;
    if (/(^|\.)mms\.pinduoduo\.com$/.test(host)) {
      return /(goods|product|detail)/.test(path) || /goods_id/.test(search);
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * 杂项
   * ------------------------------------------------------------------ */

  /**
   * 生成下载文件名：商品图_001.png
   * @param {number} index 从 1 开始
   * @param {number} [pad] 补零位数，默认 3
   */
  function makeFilename(index, pad) {
    var width = typeof pad === 'number' ? pad : 3;
    var n = Math.max(1, Math.floor(index) || 1);
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return '商品图_' + s + '.png';
  }

  /** 从 URL 猜测图片格式，用于界面上的小标签 */
  function guessFormat(url) {
    var m = String(url).match(/\.(jpe?g|png|webp|gif|bmp|avif)(?:[?#_]|$)/i);
    if (!m) return 'img';
    var ext = m[1].toLowerCase();
    if (ext === 'jpeg') return 'jpg';
    return ext;
  }

  /** 人类可读的字节数 */
  function formatBytes(bytes) {
    if (!bytes || bytes < 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    var v = bytes;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return (i === 0 ? v : v.toFixed(v >= 10 ? 0 : 1)) + ' ' + units[i];
  }

  return {
    MIN_SIDE: MIN_SIDE,
    MAX_IMAGES: MAX_IMAGES,
    LAZY_ATTRS: LAZY_ATTRS,
    resolveUrl: resolveUrl,
    getOriginalUrl: getOriginalUrl,
    isUnsupportedUrl: isUnsupportedUrl,
    isDecorativeUrl: isDecorativeUrl,
    toSecureUrl: toSecureUrl,
    normalizeKey: normalizeKey,
    pickLargestFromSrcset: pickLargestFromSrcset,
    collectCandidates: collectCandidates,
    dedupe: dedupe,
    matchPlatform: matchPlatform,
    isProductPage: isProductPage,
    makeFilename: makeFilename,
    guessFormat: guessFormat,
    formatBytes: formatBytes
  };
});
