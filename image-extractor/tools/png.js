/**
 * 极简 PNG 生成工具（零依赖）
 * 只实现本项目需要的绘图能力：填充、圆角矩形、圆形、三角形。
 * 通过 3 倍超采样再降采样实现抗锯齿。
 */
'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* -------------------------------------------------------------- CRC32 */
let CRC_TABLE = null;

function makeCrcTable() {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

function crc32(buf) {
  if (!CRC_TABLE) CRC_TABLE = makeCrcTable();
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    for (let i = 0; i < stride; i++) {
      raw[y * (stride + 1) + 1 + i] = rgba[y * stride + i];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* -------------------------------------------------------------- 画布 */

function parseColor(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

class Canvas {
  constructor(width, height, ss) {
    this.scale = ss || 3;
    this.width = width;
    this.height = height;
    this.w = width * this.scale;
    this.h = height * this.scale;
    this.data = new Uint8Array(this.w * this.h * 4);
  }

  px(x, y, rgb, alpha) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const a = alpha === undefined ? 255 : alpha;
    if (a >= 255) {
      this.data[i] = rgb[0];
      this.data[i + 1] = rgb[1];
      this.data[i + 2] = rgb[2];
      this.data[i + 3] = 255;
      return;
    }
    const src = a / 255;
    const dst = this.data[i + 3] / 255;
    const outA = src + dst * (1 - src);
    if (outA === 0) return;
    for (let c = 0; c < 3; c++) {
      this.data[i + c] = Math.round((rgb[c] * src + this.data[i + c] * dst * (1 - src)) / outA);
    }
    this.data[i + 3] = Math.round(outA * 255);
  }

  fill(hex) {
    const rgb = parseColor(hex);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) this.px(x, y, rgb);
    }
  }

  /** 圆角矩形，r 为逻辑像素 */
  roundRect(x, y, w, h, r, hex) {
    const s = this.scale;
    const rgb = parseColor(hex);
    const X = x * s;
    const Y = y * s;
    const W = w * s;
    const H = h * s;
    const R = Math.min(r * s, W / 2, H / 2);

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        let inside = true;
        if (cx < R && cy < R) inside = (cx - R) ** 2 + (cy - R) ** 2 <= R * R;
        else if (cx > W - R && cy < R) inside = (cx - (W - R)) ** 2 + (cy - R) ** 2 <= R * R;
        else if (cx < R && cy > H - R) inside = (cx - R) ** 2 + (cy - (H - R)) ** 2 <= R * R;
        else if (cx > W - R && cy > H - R) inside = (cx - (W - R)) ** 2 + (cy - (H - R)) ** 2 <= R * R;
        if (inside) this.px(Math.floor(X + px), Math.floor(Y + py), rgb);
      }
    }
  }

  rect(x, y, w, h, hex) {
    this.roundRect(x, y, w, h, 0, hex);
  }

  circle(cx, cy, r, hex) {
    const s = this.scale;
    const rgb = parseColor(hex);
    const CX = cx * s;
    const CY = cy * s;
    const R = r * s;
    for (let py = Math.floor(CY - R); py <= Math.ceil(CY + R); py++) {
      for (let px = Math.floor(CX - R); px <= Math.ceil(CX + R); px++) {
        if ((px + 0.5 - CX) ** 2 + (py + 0.5 - CY) ** 2 <= R * R) this.px(px, py, rgb);
      }
    }
  }

  /** 三角形：三个逻辑坐标点 */
  triangle(p1, p2, p3, hex) {
    const s = this.scale;
    const rgb = parseColor(hex);
    const a = [p1[0] * s, p1[1] * s];
    const b = [p2[0] * s, p2[1] * s];
    const c = [p3[0] * s, p3[1] * s];
    const minX = Math.floor(Math.min(a[0], b[0], c[0]));
    const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
    const minY = Math.floor(Math.min(a[1], b[1], c[1]));
    const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
    const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d1 = sign(x + 0.5, y + 0.5, a[0], a[1], b[0], b[1]);
        const d2 = sign(x + 0.5, y + 0.5, b[0], b[1], c[0], c[1]);
        const d3 = sign(x + 0.5, y + 0.5, c[0], c[1], a[0], a[1]);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) this.px(x, y, rgb);
      }
    }
  }

  /** 降采样输出 RGBA Buffer */
  toRGBA() {
    const s = this.scale;
    const out = Buffer.alloc(this.width * this.height * 4);
    const n = s * s;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            const i = ((y * s + dy) * this.w + (x * s + dx)) * 4;
            r += this.data[i];
            g += this.data[i + 1];
            b += this.data[i + 2];
            a += this.data[i + 3];
          }
        }
        const o = (y * this.width + x) * 4;
        out[o] = Math.round(r / n);
        out[o + 1] = Math.round(g / n);
        out[o + 2] = Math.round(b / n);
        out[o + 3] = Math.round(a / n);
      }
    }
    return out;
  }

  save(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, encodePng(this.width, this.height, this.toRGBA()));
  }
}

module.exports = { Canvas, encodePng };
