/* ==========================================================================
   tools/screenshot.js · 用无头 Chrome 给页面拍固定尺寸截图
   用法：
     node tools/screenshot.js <url> <out.png> [宽] [高] [步骤]
   步骤用分号分隔，按顺序执行完再截图：
     "#versions-tbody tr:nth-child(2)"   点击匹配到的第一个元素
     "wait:800"                          等待 800ms
     "js:localStorage.clear()"           执行一段表达式
     "js:document.querySelector('[data-action=\"dev:scenario\"][data-scenario=\"slow\"]').click()"
   示例：
     node tools/screenshot.js http://localhost:5182/ ../screenshots/12-mc-home.png 1440 1000
   说明：依赖本机 Chrome / Edge，可用 CHROME_PATH 指定可执行文件。
   ========================================================================== */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const args = process.argv.slice(2);
const url = args[0];
const out = path.resolve(args[1] || "shot.png");
const width = Number(args[2] || 1440);
const height = Number(args[3] || 1000);
const steps = (args[4] || "")
  .split(";")
  .map((step) => step.trim())
  .filter(Boolean);

if (!url) {
  console.error("用法：node tools/screenshot.js <url> <out.png> [width] [height] [steps]");
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

const port = 9500 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "jingjie-shot-"));
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getJson(route) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port: port, path: route }, (response) => {
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
      if (version.webSocketDebuggerUrl) return;
    } catch (error) {
      /* 端口还没起来，继续等 */
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
          socket.send(JSON.stringify({ id: id, method: method, params: params || {} }));
          return new Promise((res, rej) => pending.set(id, { res: res, rej: rej }));
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

function openTarget() {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: "127.0.0.1", port: port, path: "/json/new?about:blank", method: "PUT" },
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
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", {
    expression: expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "脚本执行失败");
  return result.result.value;
}

async function runStep(page, step) {
  if (step.indexOf("wait:") === 0) {
    await wait(Number(step.slice(5)) || 500);
    return;
  }
  if (step.indexOf("js:") === 0) {
    const value = await evaluate(page, step.slice(3));
    if (value !== undefined) console.log("[step] " + step.slice(3) + " => " + JSON.stringify(value));
    await wait(500);
    return;
  }

  const found = await evaluate(
    page,
    "var el = document.querySelector(" + JSON.stringify(step) + "); if (el) { el.click(); true } else false"
  );
  if (!found) throw new Error("找不到元素：" + step);
  await wait(800);
}

(async () => {
  try {
    await waitForBrowser();
    const target = await openTarget();
    const page = await connect(target.webSocketDebuggerUrl);

    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: width,
      height: height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await page.send("Page.navigate", { url: url });
    await wait(1500);

    for (const step of steps) await runStep(page, step);

    await evaluate(page, "document.documentElement.style.scrollBehavior='auto';");
    await wait(300);

    const shot = await page.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });

    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
    console.log("saved " + out + " (" + width + "×" + height + ")");
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
      /* 临时目录清不掉就算了 */
    }
  }
})();
