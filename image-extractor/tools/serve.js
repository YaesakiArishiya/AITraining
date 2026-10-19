/**
 * 本地静态服务器（零依赖），用于预览官网、测试页面和图库演示模式。
 * 运行：node tools/serve.js [端口]
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 5179;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(ROOT, urlPath);

  // 目录默认返回 index.html
  if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');

  // 防止路径穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('预览服务器已启动：');
  console.log('  官网      http://localhost:' + PORT + '/website/');
  console.log('  图库演示  http://localhost:' + PORT + '/extension/gallery.html');
  console.log('  采集测试  http://localhost:' + PORT + '/tests/harness.html');
  console.log('  按钮预览  http://localhost:' + PORT + '/tests/mock-product.html');
});
