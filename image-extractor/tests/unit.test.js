/**
 * 单元测试 —— 只覆盖与 DOM 无关的纯函数
 * 运行：node tests/unit.test.js
 *
 * DOM 相关的采集逻辑见 tests/harness.html（在浏览器里打开）。
 */
'use strict';

const assert = require('assert');
const path = require('path');

const U = require(path.resolve(__dirname, '..', 'extension', 'lib', 'image-utils.js'));

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS  ' + name);
  } catch (err) {
    failed++;
    failures.push({ name, message: err.message });
    console.log('  FAIL  ' + name);
    console.log('        ' + err.message);
  }
}

function group(title) {
  console.log('\n' + title);
}

/* ------------------------------------------------------------------ */

group('resolveUrl —— 相对路径补全');

check('相对路径补全为绝对地址', () => {
  assert.strictEqual(
    U.resolveUrl('images/a.jpg', 'https://item.jd.com/1000.html'),
    'https://item.jd.com/images/a.jpg'
  );
});

check('协议相对路径补全省略的协议', () => {
  assert.strictEqual(
    U.resolveUrl('//img.alicdn.com/a.jpg', 'https://detail.tmall.com/item.htm'),
    'https://img.alicdn.com/a.jpg'
  );
});

check('清理 CSS url() 包裹', () => {
  assert.strictEqual(
    U.resolveUrl('url("https://img.alicdn.com/b.jpg")', 'https://x.com/'),
    'https://img.alicdn.com/b.jpg'
  );
});

check('非法输入返回空字符串', () => {
  assert.strictEqual(U.resolveUrl('', 'https://x.com/'), '');
  assert.strictEqual(U.resolveUrl(null, 'https://x.com/'), '');
  assert.strictEqual(U.resolveUrl('#', 'https://x.com/'), '');
});

/* ------------------------------------------------------------------ */

group('getOriginalUrl —— 还原 CDN 原图地址');

check('天猫 _430x430q90.jpg 后缀被去掉', () => {
  const input =
    'https://img.alicdn.com/imgextra/i1/2200000000/O1CN01abc_!!2200000000-0-item_pic.jpg_430x430q90.jpg';
  assert.strictEqual(
    U.getOriginalUrl(input),
    'https://img.alicdn.com/imgextra/i1/2200000000/O1CN01abc_!!2200000000-0-item_pic.jpg'
  );
});

check('天猫 .jpg_.webp 后缀被去掉', () => {
  assert.strictEqual(
    U.getOriginalUrl('https://img.alicdn.com/a/b.jpg_.webp'),
    'https://img.alicdn.com/a/b.jpg'
  );
});

check('京东 !q70.dpg.webp 后缀被去掉', () => {
  assert.strictEqual(
    U.getOriginalUrl('https://img14.360buyimg.com/n0/jfs/t1/abc.jpg!q70.dpg.webp'),
    'https://img14.360buyimg.com/n0/jfs/t1/abc.jpg'
  );
});

check('拼多多 imageView2 参数被去掉', () => {
  assert.strictEqual(
    U.getOriginalUrl('https://img.pddpic.com/goods/a.jpeg?imageView2/2/w/400'),
    'https://img.pddpic.com/goods/a.jpeg'
  );
});

check('普通地址保持不变', () => {
  const ok = 'https://img.alicdn.com/a/b.png?v=2';
  assert.strictEqual(U.getOriginalUrl(ok), ok);
});

/* ------------------------------------------------------------------ */

group('过滤规则');

check('图标 / logo / 占位图被识别', () => {
  assert.strictEqual(U.isDecorativeUrl('https://x.com/static/logo.png'), true);
  assert.strictEqual(U.isDecorativeUrl('https://x.com/img/sprite_v2.png'), true);
  assert.strictEqual(U.isDecorativeUrl('https://x.com/img/placeholder.jpg'), true);
  assert.strictEqual(U.isDecorativeUrl('https://x.com/img/1x1.gif'), true);
});

check('正常商品图不被误伤', () => {
  assert.strictEqual(U.isDecorativeUrl('https://img.alicdn.com/imgextra/i1/a.jpg'), false);
});

check('data: / svg 被判定为不支持', () => {
  assert.strictEqual(U.isUnsupportedUrl('data:image/png;base64,AAAA'), true);
  assert.strictEqual(U.isUnsupportedUrl('https://x.com/icon.svg'), true);
  assert.strictEqual(U.isUnsupportedUrl('https://x.com/a.jpg'), false);
});

check('http 图片地址升级为 https', () => {
  assert.strictEqual(U.toSecureUrl('http://img.alicdn.com/a.jpg'), 'https://img.alicdn.com/a.jpg');
  assert.strictEqual(U.toSecureUrl('http://img14.360buyimg.com/a.jpg'), 'https://img14.360buyimg.com/a.jpg');
});

check('未知域名不强制升级', () => {
  assert.strictEqual(U.toSecureUrl('http://example.com/a.jpg'), 'http://example.com/a.jpg');
});

/* ------------------------------------------------------------------ */

group('pickLargestFromSrcset —— 选择最大的一张');

check('按宽度描述符挑选', () => {
  assert.strictEqual(
    U.pickLargestFromSrcset('a.jpg 200w, b.jpg 800w, c.jpg 400w'),
    'b.jpg'
  );
});

check('按像素密度挑选', () => {
  assert.strictEqual(U.pickLargestFromSrcset('a.jpg 1x, b.jpg 2x'), 'b.jpg');
});

check('没有描述符时取第一张', () => {
  assert.strictEqual(U.pickLargestFromSrcset('a.jpg'), 'a.jpg');
});

check('空值返回空字符串', () => {
  assert.strictEqual(U.pickLargestFromSrcset(''), '');
  assert.strictEqual(U.pickLargestFromSrcset(null), '');
});

/* ------------------------------------------------------------------ */

group('dedupe —— 去重与信息合并');

check('同一张图的不同尺寸被合并', () => {
  const list = [
    { url: 'https://img.alicdn.com/a.jpg_430x430.jpg', width: 0, height: 0 },
    { url: 'https://img.alicdn.com/a.jpg_50x50.jpg', width: 800, height: 800 },
    { url: 'https://img.alicdn.com/b.jpg', width: 100, height: 100 }
  ];
  const result = U.dedupe(list);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].url, 'https://img.alicdn.com/a.jpg');
  assert.strictEqual(result[0].width, 800, '应合并进来后出现的尺寸信息');
});

check('http 与 https 视为同一张图', () => {
  const result = U.dedupe([
    { url: 'http://img.alicdn.com/a.jpg', width: 0, height: 0 },
    { url: 'https://img.alicdn.com/a.jpg', width: 0, height: 0 }
  ]);
  assert.strictEqual(result.length, 1);
});

/* ------------------------------------------------------------------ */

group('makeFilename —— 下载文件名');

check('序号补零到三位', () => {
  assert.strictEqual(U.makeFilename(1), '商品图_001.png');
  assert.strictEqual(U.makeFilename(12), '商品图_012.png');
});

check('超过三位不截断', () => {
  assert.strictEqual(U.makeFilename(1234), '商品图_1234.png');
});

check('非法序号回落到 1', () => {
  assert.strictEqual(U.makeFilename(0), '商品图_001.png');
  assert.strictEqual(U.makeFilename(NaN), '商品图_001.png');
});

/* ------------------------------------------------------------------ */

group('站点识别');

const PAGES = [
  ['https://item.taobao.com/item.htm?id=123', 'taobao', true],
  ['https://detail.tmall.com/item.htm?id=123&skuId=1', 'taobao', true],
  ['https://chaoshi.detail.tmall.com/item.htm?id=1', 'taobao', true],
  ['https://www.taobao.com/', 'taobao', false],
  ['https://s.taobao.com/search?q=abc', 'taobao', false],
  ['https://item.jd.com/100012043978.html', 'jd', true],
  ['https://npcitem.jd.hk/100012043978.html', 'jd', true],
  ['https://www.jd.com/', 'jd', false],
  ['https://search.jd.com/Search?keyword=abc', 'jd', false],
  ['https://mobile.yangkeduo.com/goods.html?goods_id=123', 'pdd', true],
  ['https://mms.pinduoduo.com/goods/goods_detail?goods_id=1', 'pdd', true],
  ['https://www.pinduoduo.com/', 'pdd', false],
  ['https://example.com/item.htm?id=1', null, false]
];

check('平台识别与详情页判定', () => {
  PAGES.forEach(([url, platform, isProduct]) => {
    assert.strictEqual(U.matchPlatform(url), platform, '平台识别错误: ' + url);
    assert.strictEqual(U.isProductPage(url), isProduct, '详情页判定错误: ' + url);
  });
});

/* ------------------------------------------------------------------ */

group('杂项格式化');

check('格式推断', () => {
  assert.strictEqual(U.guessFormat('https://x.com/a.JPEG?x=1'), 'jpg');
  assert.strictEqual(U.guessFormat('https://x.com/a.webp'), 'webp');
  assert.strictEqual(U.guessFormat('https://x.com/a.png_430x430.jpg'), 'png');
});

check('字节数格式化', () => {
  assert.strictEqual(U.formatBytes(512), '512 B');
  assert.strictEqual(U.formatBytes(2048), '2.0 KB');
  assert.strictEqual(U.formatBytes(5 * 1024 * 1024), '5.0 MB');
});

/* ------------------------------------------------------------------ */

console.log('\n----------------------------------------');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed) {
  failures.forEach((f) => console.log('  - ' + f.name + ': ' + f.message));
  process.exit(1);
}
