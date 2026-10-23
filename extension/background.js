/**
 * 商品图片提取器 —— Service Worker（background.js）
 * ---------------------------------------------------------------------------
 * 职责：
 *   1. 接收内容脚本上传的图片列表，存入 chrome.storage.local，并打开图库页
 *   2. 接收图库页的批量下载请求：fetch 原图 -> createImageBitmap -> OffscreenCanvas
 *      转 PNG -> chrome.downloads.download 保存
 *   3. 逐张推送下载进度，供图库页显示进度条
 *   4. 工具栏图标点击：对当前标签页触发一次扫描（content script 未注入时自动注入）
 *
 * 说明：图片是跨域资源，Service Worker 中的 fetch 之所以能成功，
 *       是因为 manifest.json 的 host_permissions 里声明了图片 CDN 域名。
 * ---------------------------------------------------------------------------
 */

importScripts('lib/image-utils.js');

const U = self.ImgXUtils;

/** 存储 key 前缀：scan:<id> */
const SCAN_PREFIX = 'scan:';
/** 只保留最近 N 次扫描记录，防止 storage 无限增长 */
const MAX_SCANS = 8;
/** 单张图片转换超时（毫秒） */
const CONVERT_TIMEOUT = 45000;

/* -------------------------------------------------------------------------- *
 * 工具函数
 * -------------------------------------------------------------------------- */

/** 向所有扩展页面广播消息（没有接收者时会报错，直接忽略） */
function broadcast(message) {
  try {
    const p = chrome.runtime.sendMessage(message);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) {
    /* 没有打开的扩展页面，忽略 */
  }
}

/** 让出事件循环，避免长时间占用 Service Worker */
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** blob -> data URL（base64），用于 blob URL 不可用时的兜底下载 */
async function blobToDataUrl(blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < buffer.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, buffer.subarray(i, i + CHUNK));
  }
  return 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + btoa(binary);
}

/** 带超时的 Promise 包装 */
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || '操作超时')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* -------------------------------------------------------------------------- *
 * 扫描记录的保存与读取
 * -------------------------------------------------------------------------- */

async function saveScan(payload) {
  const id = payload.id || 'scan_' + Date.now().toString(36);
  const images = Array.isArray(payload.images) ? payload.images : [];

  const record = {
    id,
    pageUrl: payload.pageUrl || '',
    pageTitle: payload.pageTitle || '',
    scannedAt: payload.scannedAt || Date.now(),
    images
  };

  const key = SCAN_PREFIX + id;
  await chrome.storage.local.set({ [key]: record, lastScanId: id });
  await pruneScans();
  return record;
}

/** 清理过期的扫描记录 */
async function pruneScans() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(SCAN_PREFIX));
  if (keys.length <= MAX_SCANS) return;

  // 按扫描时间从旧到新排序，删掉最早的几条
  keys.sort((a, b) => {
    const ra = all[a] || {};
    const rb = all[b] || {};
    return (ra.scannedAt || 0) - (rb.scannedAt || 0);
  });

  const remove = keys.slice(0, keys.length - MAX_SCANS);
  if (remove.length) await chrome.storage.local.remove(remove);
}

async function readScan(scanId) {
  if (!scanId) {
    const { lastScanId } = await chrome.storage.local.get('lastScanId');
    scanId = lastScanId;
  }
  if (!scanId) return null;
  const key = SCAN_PREFIX + scanId;
  const data = await chrome.storage.local.get(key);
  return data[key] || null;
}

/* -------------------------------------------------------------------------- *
 * 图片下载与格式转换
 * -------------------------------------------------------------------------- */

/** 拉取原图二进制；重点：referrerPolicy 设为 no-referrer，规避 CDN 防盗链 */
async function fetchImageBlob(url) {
  // 升级为 https：Service Worker 处于安全上下文，http 资源会被混合内容策略拦截
  const res = await fetch(U.toSecureUrl(url), {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'force-cache'
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  if (!blob.size) throw new Error('图片内容为空');
  return blob;
}

/**
 * 把任意格式的图片转成 PNG。
 * 已经是 PNG 的直接返回原 blob（避免不必要的重编码损失）。
 * @returns {Promise<{blob: Blob, converted: boolean}>}
 */
async function convertToPng(url) {
  const original = await fetchImageBlob(url);

  if (/^image\/png/i.test(original.type || '')) {
    return { blob: original, converted: false };
  }

  let bitmap;
  try {
    // createImageBitmap 在 Service Worker 中可用，且不依赖 DOM
    bitmap = await withTimeout(createImageBitmap(original), CONVERT_TIMEOUT, '图片解码超时');
  } catch (e) {
    throw new Error('无法解码图片：' + (e && e.message ? e.message : e));
  }

  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 2D 画布');
    // 透明背景填充白色，避免 webp 透明通道转 PNG 后发黑
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);

    const png = await withTimeout(
      canvas.convertToBlob({ type: 'image/png' }),
      CONVERT_TIMEOUT,
      'PNG 编码超时'
    );
    return { blob: png, converted: true };
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

/** 等待某个下载项进入完成 / 中断状态 */
function waitForDownload(downloadId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => finish(new Error('下载超时')), timeoutMs || 60000);

    function finish(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(listener);
      if (err) reject(err);
      else resolve();
    }

    function listener(delta) {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === 'complete') finish(null);
      else if (delta.state.current === 'interrupted') finish(new Error('下载被中断'));
    }

    chrome.downloads.onChanged.addListener(listener);

    // 补查一次，避免创建与监听之间错过状态变化
    chrome.downloads
      .search({ id: downloadId })
      .then((items) => {
        const item = items && items[0];
        if (!item) return;
        if (item.state === 'complete') finish(null);
        else if (item.state === 'interrupted') finish(new Error('下载被中断'));
      })
      .catch(() => {});
  });
}

/** 保存 blob 为文件：优先 blob URL，失败则退回 data URL */
async function saveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  let downloadId = null;

  try {
    downloadId = await chrome.downloads.download({
      url: objectUrl,
      filename,
      conflictAction: 'uniquify',
      saveAs: false
    });
  } catch (err) {
    // 极少数环境下 Service Worker 创建的对象 URL 无法被下载器接管，改用 data URL。
    // 注意这里只重试「发起下载」这一步，等待完成的逻辑放在 try 之外，避免重复下载。
    const dataUrl = await blobToDataUrl(blob);
    downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename,
      conflictAction: 'uniquify',
      saveAs: false
    });
  } finally {
    // 留出缓冲时间再释放，确保下载器已经接管了该 URL
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }

  await waitForDownload(downloadId);
  return downloadId;
}

/**
 * 执行一批下载。
 * 进度通过广播推送，而不是靠 sendMessage 的返回值，避免长任务超时。
 */
async function runBatch(items, scanId) {
  const total = items.length;
  const results = [];
  let okCount = 0;

  broadcast({ type: 'IMGX_DOWNLOAD_START', scanId, total });

  for (let i = 0; i < total; i++) {
    const item = items[i];
    const index = i + 1;
    const baseName = U.makeFilename(index);

    broadcast({
      type: 'IMGX_DOWNLOAD_PROGRESS',
      scanId,
      index,
      total,
      phase: 'fetch',
      filename: baseName,
      url: item.url
    });

    try {
      const { blob, converted } = await convertToPng(item.url);
      // 转换失败退回原格式时，文件名保持真实扩展名，避免「假 PNG」
      const filename = converted ? baseName : baseName.replace(/\.png$/i, '.' + U.guessFormat(item.url));
      const downloadId = await saveBlob(blob, filename);

      okCount++;
      results.push({ url: item.url, filename, downloadId, ok: true, converted, size: blob.size });
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      results.push({ url: item.url, filename: baseName, ok: false, error: message });
      console.warn('[商品图片提取器] 下载失败', item.url, message);
    }

    broadcast({
      type: 'IMGX_DOWNLOAD_PROGRESS',
      scanId,
      index,
      total,
      phase: 'done',
      ok: okCount,
      failed: results.length - okCount
    });

    await tick();
  }

  const failed = results.filter((r) => !r.ok);
  const summary = {
    type: 'IMGX_DOWNLOAD_DONE',
    scanId,
    total,
    ok: okCount,
    failed: failed.length,
    failures: failed.slice(0, 20),
    finishedAt: Date.now()
  };

  broadcast(summary);

  // 记录最近一次下载历史，图库页可以展示
  try {
    await chrome.storage.local.set({
      lastDownload: {
        scanId,
        total,
        ok: okCount,
        failed: failed.length,
        finishedAt: summary.finishedAt
      }
    });
  } catch (e) {
    /* ignore */
  }

  return summary;
}

/* -------------------------------------------------------------------------- *
 * 工具栏图标点击
 * -------------------------------------------------------------------------- */

/**
 * 让指定标签页开始扫描。
 * 优先复用已注入的内容脚本；没有时通过 chrome.scripting 注入（activeTab 权限）。
 */
async function triggerScan(tab) {
  if (!tab || typeof tab.id !== 'number') return;
  const url = tab.url || '';
  if (!/^https?:/i.test(url)) return;

  // 1) 已注入过（普通情况下 manifest 的 content_scripts 已经注入）
  try {
    const pong = await chrome.tabs.sendMessage(tab.id, { type: 'IMGX_PING' });
    if (pong && pong.ok) {
      await chrome.tabs.sendMessage(tab.id, { type: 'IMGX_START_SCAN' });
      return;
    }
  } catch (e) {
    /* 没有内容脚本，继续走注入流程 */
  }

  // 2) 手动注入（例如用户在没有 reload 过的标签页上点击）
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/image-utils.js', 'content.js']
    });
    await chrome.tabs.sendMessage(tab.id, { type: 'IMGX_START_SCAN' });
  } catch (err) {
    console.warn('[商品图片提取器] 注入失败', err);
    // 注入失败说明不是允许的页面，直接打开上一次的图库
    const scan = await readScan();
    if (scan) {
      await chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html?scan=' + encodeURIComponent(scan.id)) });
    }
  }
}

chrome.action.onClicked.addListener(triggerScan);

/* -------------------------------------------------------------------------- *
 * 消息路由
 * -------------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    // 内容脚本扫描完成
    case 'IMGX_SCAN_RESULT': {
      (async () => {
        try {
          const record = await saveScan(msg.payload || {});
          const url = chrome.runtime.getURL('gallery.html?scan=' + encodeURIComponent(record.id));
          await chrome.tabs.create({ url });
          sendResponse({ ok: true, id: record.id, count: record.images.length, opened: true });
        } catch (err) {
          console.error('[商品图片提取器] 保存扫描结果失败', err);
          sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
        }
      })();
      return true; // 异步响应
    }

    // 图库页读取扫描数据
    case 'IMGX_READ_SCAN': {
      (async () => {
        const record = await readScan(msg.scanId);
        sendResponse({ ok: !!record, record });
      })();
      return true;
    }

    // 图库页请求下载
    case 'IMGX_DOWNLOAD': {
      const payload = msg.payload || {};
      const items = Array.isArray(payload.items) ? payload.items.filter((it) => it && it.url) : [];
      if (!items.length) {
        sendResponse({ ok: false, error: '没有选中任何图片' });
        return false;
      }
      // 立即返回「已开始」，真正的进度用广播推送
      runBatch(items, payload.scanId || '').catch((err) => {
        broadcast({
          type: 'IMGX_DOWNLOAD_DONE',
          scanId: payload.scanId || '',
          total: items.length,
          ok: 0,
          failed: items.length,
          failures: [{ error: String(err && err.message ? err.message : err) }],
          finishedAt: Date.now()
        });
      });
      sendResponse({ ok: true, started: true, total: items.length });
      return false;
    }

    // 内容脚本请求重新打开上一次的图库
    case 'IMGX_OPEN_GALLERY': {
      (async () => {
        const id = msg.scanId;
        if (!id) return sendResponse({ ok: false });
        await chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html?scan=' + encodeURIComponent(id)) });
        sendResponse({ ok: true });
      })();
      return true;
    }

    default:
      return false;
  }
});

/* -------------------------------------------------------------------------- *
 * 生命周期
 * -------------------------------------------------------------------------- */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.info('[商品图片提取器] 安装完成，打开商品详情页即可使用');
  }
});
