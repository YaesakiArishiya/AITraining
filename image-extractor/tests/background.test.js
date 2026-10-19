/**
 * Service Worker 逻辑测试
 * ---------------------------------------------------------------------------
 * Chrome 扩展的 background.js 只能在浏览器里运行，这里用 vm 造一个最小的
 * chrome.* 运行时，验证两条关键链路：
 *   1. 扫描结果落库 + 自动打开图库页
 *   2. 批量下载：PNG 转换、序号命名、进度广播、失败统计
 *
 * 运行：node tests/background.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.resolve(__dirname, '..', 'extension');

let passed = 0;
let failed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log('  PASS  ' + name);
    })
    .catch((err) => {
      failed++;
      console.log('  FAIL  ' + name);
      console.log('        ' + (err && err.message ? err.message : err));
    });
}

/** 构造一个带 stub 的 Service Worker 环境，并执行 background.js */
function createWorker(options) {
  const opts = options || {};
  const store = new Map();
  const broadcasts = [];
  const downloads = [];
  const createdTabs = [];
  const changedListeners = [];
  let downloadSeq = 0;

  const chrome = {
    runtime: {
      onMessage: { addListener: (fn) => (sandbox._onMessage = fn) },
      onInstalled: { addListener: () => {} },
      sendMessage: (msg) => {
        broadcasts.push(msg);
        if (msg && msg.type === 'IMGX_DOWNLOAD_DONE') sandbox._doneResolve(msg);
        return Promise.resolve();
      },
      getURL: (p) => 'chrome-extension://test-id/' + p
    },
    action: { onClicked: { addListener: () => {} } },
    tabs: {
      create: ({ url }) => {
        createdTabs.push(url);
        return Promise.resolve({ id: 99 });
      },
      sendMessage: () => Promise.resolve({ ok: true })
    },
    storage: {
      local: {
        get: (keys) => {
          if (keys === null || keys === undefined) {
            return Promise.resolve(Object.fromEntries(store));
          }
          if (typeof keys === 'string') {
            return Promise.resolve(store.has(keys) ? { [keys]: store.get(keys) } : {});
          }
          const out = {};
          (Array.isArray(keys) ? keys : Object.keys(keys)).forEach((k) => {
            if (store.has(k)) out[k] = store.get(k);
          });
          return Promise.resolve(out);
        },
        set: (obj) => {
          Object.keys(obj).forEach((k) => store.set(k, obj[k]));
          return Promise.resolve();
        },
        remove: (keys) => {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => store.delete(k));
          return Promise.resolve();
        }
      }
    },
    downloads: {
      download: ({ url, filename }) => {
        if (opts.failDownload) return Promise.reject(new Error('download 拒绝'));
        downloadSeq++;
        const id = downloadSeq;
        downloads.push({ id, url, filename });
        // 稍后触发 complete，模拟真实下载完成回调
        setTimeout(() => {
          changedListeners.forEach((fn) => fn({ id, state: { current: 'complete' } }));
        }, 5);
        return Promise.resolve(id);
      },
      search: ({ id }) =>
        Promise.resolve(downloads.some((d) => d.id === id) ? [{ id, state: 'in_progress' }] : []),
      onChanged: {
        addListener: (fn) => changedListeners.push(fn),
        removeListener: (fn) => {
          const i = changedListeners.indexOf(fn);
          if (i >= 0) changedListeners.splice(i, 1);
        }
      }
    }
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    btoa,
    URL,
    Blob,
    chrome,
    fetch: (url) => {
      if (opts.failFetch && opts.failFetch(url)) {
        return Promise.resolve({ ok: false, status: 403, blob: () => Promise.resolve(null) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob(['fake-image-bytes'], { type: opts.mime || 'image/jpeg' }))
      });
    },
    createImageBitmap: () =>
      Promise.resolve({ width: 800, height: 600, close: () => {} }),
    OffscreenCanvas: class {
      constructor(width, height) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return { fillStyle: '', fillRect: () => {}, drawImage: () => {} };
      }
      convertToBlob(info) {
        return Promise.resolve(new Blob(['png-bytes'], { type: info.type }));
      }
    },
    _doneResolve: () => {},
    _onMessage: null
  };

  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.importScripts = (p) => {
    sandbox.ImgXUtils = require(path.resolve(EXT, p));
    sandbox.self.ImgXUtils = sandbox.ImgXUtils;
  };

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8'), sandbox, {
    filename: 'background.js'
  });

  return { sandbox, store, broadcasts, downloads, createdTabs, chrome };
}

/** 以 Promise 方式调用 background 的消息处理器 */
function sendMessage(worker, message) {
  return new Promise((resolve) => {
    worker.sandbox._onMessage(message, {}, resolve);
  });
}

/** 等待 IMGX_DOWNLOAD_DONE 广播 */
function waitForDone(worker) {
  return new Promise((resolve) => {
    worker.sandbox._doneResolve = resolve;
    setTimeout(() => resolve({ type: 'IMGX_DOWNLOAD_DONE', timeout: true }), 4000);
  });
}

/* -------------------------------------------------------------------------- */

async function main() {
  console.log('\n扫描结果落库');
  {
    const w = createWorker();

    const res = await sendMessage(w, {
      type: 'IMGX_SCAN_RESULT',
      payload: {
        id: 'scan_test',
        pageUrl: 'https://item.jd.com/100012043978.html',
        pageTitle: '测试商品',
        scannedAt: 1760000000000,
        images: [
          { url: 'https://img14.360buyimg.com/a.jpg', width: 800, height: 800, source: 'img.src' },
          { url: 'https://img14.360buyimg.com/b.jpg', width: 600, height: 600, source: 'img.src' }
        ]
      }
    });

    await check('返回保存结果与数量', () => {
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.id, 'scan_test');
      assert.strictEqual(res.count, 2);
    });

    await check('扫描记录写入 storage', () => {
      const record = w.store.get('scan:scan_test');
      assert.ok(record, '未写入 scan:scan_test');
      assert.strictEqual(record.images.length, 2);
      assert.strictEqual(record.pageUrl, 'https://item.jd.com/100012043978.html');
      assert.strictEqual(w.store.get('lastScanId'), 'scan_test');
    });

    await check('自动打开图库页并带上 scan 参数', () => {
      assert.strictEqual(w.createdTabs.length, 1);
      assert.strictEqual(w.createdTabs[0], 'chrome-extension://test-id/gallery.html?scan=scan_test');
    });

    await check('IMGX_READ_SCAN 能读回记录', async () => {
      const read = await sendMessage(w, { type: 'IMGX_READ_SCAN', scanId: 'scan_test' });
      assert.strictEqual(read.ok, true);
      assert.strictEqual(read.record.id, 'scan_test');
    });
  }

  console.log('\n批量下载（PNG 转换 + 序号命名）');
  {
    const w = createWorker();
    const donePromise = waitForDone(w);

    const start = await sendMessage(w, {
      type: 'IMGX_DOWNLOAD',
      payload: {
        scanId: 'scan_test',
        items: [
          { url: 'https://img14.360buyimg.com/a.jpg' },
          { url: 'https://img.alicdn.com/b.webp' },
          { url: 'https://img.pddpic.com/c.jpeg' }
        ]
      }
    });

    await check('立即返回「已开始」', () => {
      assert.strictEqual(start.ok, true);
      assert.strictEqual(start.total, 3);
    });

    const done = await donePromise;

    await check('下载了 3 个文件', () => {
      assert.strictEqual(w.downloads.length, 3);
    });

    await check('文件名按 商品图_001.png 递增', () => {
      assert.deepStrictEqual(
        w.downloads.map((d) => d.filename),
        ['商品图_001.png', '商品图_002.png', '商品图_003.png']
      );
    });

    await check('全部使用 blob: 地址交给下载器', () => {
      assert.ok(
        w.downloads.every((d) => d.url.indexOf('blob:') === 0),
        '实际：' + w.downloads.map((d) => d.url).join(', ')
      );
    });

    await check('广播了开始 / 进度 / 完成三类消息', () => {
      const types = w.broadcasts.map((b) => b.type);
      assert.ok(types.includes('IMGX_DOWNLOAD_START'), '缺少 START');
      assert.ok(types.includes('IMGX_DOWNLOAD_PROGRESS'), '缺少 PROGRESS');
      assert.ok(types.includes('IMGX_DOWNLOAD_DONE'), '缺少 DONE');
    });

    await check('进度消息按 1..3 递增且带 total', () => {
      const fetches = w.broadcasts.filter(
        (b) => b.type === 'IMGX_DOWNLOAD_PROGRESS' && b.phase === 'fetch'
      );
      assert.deepStrictEqual(
        fetches.map((b) => b.index),
        [1, 2, 3]
      );
      assert.ok(fetches.every((b) => b.total === 3));
    });

    await check('完成消息统计正确', () => {
      assert.strictEqual(done.ok, 3);
      assert.strictEqual(done.failed, 0);
      assert.strictEqual(done.total, 3);
    });

    await check('下载历史写入 storage', () => {
      const history = w.store.get('lastDownload');
      assert.ok(history, '缺少 lastDownload');
      assert.strictEqual(history.ok, 3);
    });
  }

  console.log('\n失败处理');
  {
    const w = createWorker({ failFetch: (url) => url.indexOf('bad') !== -1 });
    const donePromise = waitForDone(w);

    await sendMessage(w, {
      type: 'IMGX_DOWNLOAD',
      payload: {
        scanId: 'scan_test',
        items: [
          { url: 'https://img.alicdn.com/ok.jpg' },
          { url: 'https://img.alicdn.com/bad.jpg' }
        ]
      }
    });

    const done = await donePromise;

    await check('失败的图片不阻塞其余下载', () => {
      assert.strictEqual(w.downloads.length, 1);
      assert.strictEqual(done.ok, 1);
      assert.strictEqual(done.failed, 1);
    });

    await check('失败原因被记录', () => {
      assert.ok(done.failures.length >= 1);
      assert.ok(/403/.test(done.failures[0].error), '实际：' + done.failures[0].error);
    });
  }

  console.log('\n边界情况');
  {
    const w = createWorker();
    const empty = await sendMessage(w, { type: 'IMGX_DOWNLOAD', payload: { items: [] } });
    await check('空列表直接返回错误', () => {
      assert.strictEqual(empty.ok, false);
      assert.ok(/没有选中/.test(empty.error));
    });

    const unknownReturn = w.sandbox._onMessage({ type: 'IMGX_UNKNOWN_TYPE' }, {}, function () {});
    await check('未知消息类型直接返回 false（不回消息）', () => {
      assert.strictEqual(unknownReturn, false);
    });
  }

  console.log('\n----------------------------------------');
  console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
  // 显式退出：background.js 里有 30s 的对象 URL 回收定时器，会拖住 Node 的事件循环
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
