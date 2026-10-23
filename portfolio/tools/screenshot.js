/* ==========================================================================
   tools/screenshot.js · 用无头 Chrome 生成固定尺寸截图
   用法：
     node tools/screenshot.js http://localhost:5180/index.html ../screenshots/10-home.png
     node tools/screenshot.js http://localhost:5180/admin.html ../screenshots/10-admin.png 1440 1000 login
   说明：
     - 需要本机安装 Chrome 或 Edge；可用 CHROME_PATH 环境变量指定
     - 第四、五个参数为宽高，默认 1440 × 1000
     - 第六个参数为 login 时，会先写入后台的演示会话再截图
   ========================================================================== */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const args = process.argv.slice(2);
const url = args[0];
const out = args[1] ? path.resolve(args[1]) : path.resolve("shot.png");
const width = Number(args[2] || 1440);
const height = Number(args[3] || 1000);
const wantLogin = args[4] === "login";

if (!url) {
  console.error("用法：node tools/screenshot.js <url> <out.png> [width] [height] [login]");
  process.exit(1);
}

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const chrome = candidates.find((item) => fs.existsSync(item));
if (!chrome) {
  console.error("没有找到 Chrome / Edge，请用 CHROME_PATH 指定可执行文件。");
  process.exit(1);
}

const port = 9400 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "site-shot-"));
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(route) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}${route}`, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
  });
}

async function waitForBrowser() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const version = await getJson("/json/version");
      if (version.webSocketDebuggerUrl) return version.webSocketDebuggerUrl;
    } catch (error) {
      /* 继续等待 */
    }
    await wait(150);
  }
  throw new Error("Chrome 调试端口没有就绪");
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;

    socket.addEventListener("open", () => {
      resolve({
        send(method, params) {
          seq += 1;
          const id = seq;
          socket.send(JSON.stringify({ id, method, params: params || {} }));
          return new Promise((res, rej) => pending.set(id, { res, rej }));
        },
        close() {
          socket.close();
        },
      });
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const handler = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) handler.rej(new Error(message.error.message));
      else handler.res(message.result);
    });

    socket.addEventListener("error", reject);
  });
}

(async () => {
  try {
    await waitForBrowser();

    const target = await new Promise((resolve, reject) => {
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/json/new?about:blank",
          method: "PUT",
        },
        (response) => {
          let body = "";
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (error) {
              reject(error);
            }
          });
        }
      );
      request.on("error", reject);
      request.end();
    });

    const page = await connect(target.webSocketDebuggerUrl);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });

    await page.send("Page.navigate", { url });
    await wait(1400);

    if (wantLogin) {
      await page.send("Runtime.evaluate", {
        expression:
          "sessionStorage.setItem('zhuezen.admin.session','1'); location.reload();",
      });
      await wait(1600);
    }

    // 等字体与入场动画稳定
    await page.send("Runtime.evaluate", {
      expression:
        "document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0);",
    });
    await wait(500);

    const shot = await page.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });

    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
    console.log(`saved ${out} (${width}×${height})`);
    page.close();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    browser.kill();
    await wait(400);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch (error) {
      /* 忽略临时目录清理失败 */
    }
  }
})();
