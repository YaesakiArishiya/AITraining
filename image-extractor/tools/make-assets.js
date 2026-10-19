/**
 * 生成插件图标、演示图片与测试用图片。
 * 运行：node tools/make-assets.js
 */
'use strict';

const path = require('path');
const { Canvas } = require('./png');

const ROOT = path.resolve(__dirname, '..');

/* ------------------------------------------------------------------ 图标 */
function drawIcon(size) {
  const c = new Canvas(size, size, 4);
  const s = size;

  c.fill('#2563eb');
  // 圆角：先用背景色铺满，再把四角削圆（简单做法：画一个圆角矩形覆盖）
  c.roundRect(0, 0, s, s, s * 0.22, '#2563eb');

  // 白色相框
  c.roundRect(s * 0.18, s * 0.18, s * 0.64, s * 0.64, s * 0.1, '#ffffff');

  // 相框内的蓝色图形（太阳 + 山脉）
  c.circle(s * 0.38, s * 0.38, s * 0.07, '#2563eb');
  c.triangle([s * 0.26, s * 0.72], [s * 0.42, s * 0.48], [s * 0.58, s * 0.72], '#2563eb');
  c.triangle([s * 0.5, s * 0.72], [s * 0.62, s * 0.56], [s * 0.76, s * 0.72], '#2563eb');

  return c;
}

[16, 32, 48, 128].forEach((size) => {
  const file = path.join(ROOT, 'extension', 'icons', `icon${size}.png`);
  drawIcon(size).save(file);
  console.log('icon ->', file);
});

/* -------------------------------------------------------------- 演示图片 */
const DEMO = [
  { bg: '#efe6dc', main: '#c8a27c', accent: '#8c6b4f', shape: 'bottle' },
  { bg: '#e7eef2', main: '#9fb8c6', accent: '#5f8296', shape: 'cup' },
  { bg: '#eceee4', main: '#b6bfa0', accent: '#7a8560', shape: 'bag' },
  { bg: '#f4eaea', main: '#d8a8a8', accent: '#a86c6c', shape: 'shoe' },
  { bg: '#e9e9f1', main: '#a9a9c9', accent: '#6b6b93', shape: 'box' },
  { bg: '#f2ece4', main: '#d3b995', accent: '#997a4f', shape: 'shirt' },
  { bg: '#e6f0ec', main: '#a3c9ba', accent: '#5f8c7c', shape: 'lamp' },
  { bg: '#f2f0e6', main: '#c9c39f', accent: '#8a8460', shape: 'plant' },
  { bg: '#eef1f6', main: '#a7b4c9', accent: '#64758f', shape: 'bottle' },
  { bg: '#f6eeea', main: '#d9b3a2', accent: '#9d6e57', shape: 'cup' },
  { bg: '#eaeef0', main: '#adc0c6', accent: '#6c8890', shape: 'box' },
  { bg: '#f1eef7', main: '#bdb0d4', accent: '#7c6a9c', shape: 'lamp' }
];

function drawProduct(spec, size) {
  const c = new Canvas(size, size, 2);
  const k = size / 640; // 以 640 为设计基准
  const S = (v) => v * k;

  c.fill(spec.bg);

  const { main, accent, shape } = spec;

  switch (shape) {
    case 'bottle':
      c.roundRect(S(280), S(170), S(84), S(320), S(18), main);
      c.roundRect(S(302), S(120), S(40), S(60), S(8), accent);
      c.rect(S(288), S(300), S(68), S(60), accent);
      break;
    case 'cup':
      c.roundRect(S(244), S(236), S(150), S(170), S(18), main);
      c.roundRect(S(390), S(266), S(56), S(34), S(16), accent);
      c.rect(S(244), S(236), S(150), S(22), accent);
      break;
    case 'bag':
      c.roundRect(S(246), S(272), S(148), S(150), S(10), main);
      c.roundRect(S(288), S(222), S(64), S(58), S(12), accent);
      c.rect(S(246), S(330), S(148), S(16), accent);
      break;
    case 'shoe':
      c.roundRect(S(214), S(298), S(212), S(82), S(40), main);
      c.circle(S(392), S(318), S(26), accent);
      c.rect(S(214), S(360), S(212), S(18), accent);
      break;
    case 'box':
      c.roundRect(S(250), S(248), S(148), S(148), S(8), main);
      c.triangle([S(250), S(248)], [S(398), S(248)], [S(250), S(396)], accent);
      break;
    case 'shirt':
      c.roundRect(S(276), S(238), S(96), S(184), S(10), main);
      c.roundRect(S(238), S(238), S(48), S(56), S(6), accent);
      c.roundRect(S(362), S(238), S(48), S(56), S(6), accent);
      break;
    case 'lamp':
      c.circle(S(320), S(224), S(62), main);
      c.rect(S(312), S(286), S(16), S(146), accent);
      c.roundRect(S(268), S(424), S(104), S(18), S(9), accent);
      break;
    case 'plant':
      c.roundRect(S(268), S(352), S(104), S(92), S(10), accent);
      c.circle(S(300), S(300), S(44), main);
      c.circle(S(348), S(286), S(38), main);
      c.circle(S(322), S(250), S(32), main);
      break;
    default:
      c.roundRect(S(240), S(240), S(160), S(160), S(12), main);
  }

  return c;
}

DEMO.forEach((spec, i) => {
  const file = path.join(ROOT, 'extension', 'demo', `${String(i + 1).padStart(2, '0')}.png`);
  drawProduct(spec, 640).save(file);
  console.log('demo ->', file);
});

/* -------------------------------------------------------------- 测试图片 */
function solid(file, size, colors) {
  const c = new Canvas(size, size, 2);
  c.fill(colors[0]);
  c.circle(size * 0.5, size * 0.5, size * 0.3, colors[1]);
  c.save(file);
  console.log('test ->', file);
}

const assets = path.join(ROOT, 'tests', 'assets');

solid(path.join(assets, 'hero.png'), 1200, ['#e8eef7', '#8aa6c8']);
solid(path.join(assets, 'detail-1.png'), 800, ['#f3ece4', '#c9a982']);
solid(path.join(assets, 'detail-2.png'), 600, ['#eaf1ea', '#9dbfa3']);
solid(path.join(assets, 'lazy-1.png'), 500, ['#f0eaf3', '#b09ac0']);
solid(path.join(assets, 'bg-1.png'), 400, ['#f7f1e6', '#d5b98a']);
solid(path.join(assets, 'small-80.png'), 80, ['#eeeeee', '#999999']);
solid(path.join(assets, 'logo.png'), 48, ['#dddddd', '#666666']);
solid(path.join(assets, 'icon.png'), 32, ['#dddddd', '#666666']);

console.log('done');
