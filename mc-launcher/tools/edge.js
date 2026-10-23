/* ==========================================================================
   tools/edge.js · 边界与极端输入检查
   用法：node tools/edge.js [url]
   与 smoke.js 互补：smoke 走正常流程，这里只喂不合法的输入、被改坏的数据
   和极端数值，确认界面不崩、该校验的地方拦得住。
   检查内容：
   1. 离线 ID 的长度 / 字符 / 重名边界，改名的 UUID 派生；
   2. 微软与第三方账号的只读约束；
   3. 设置的并发、内存、Java 非法值；
   4. 搜索框的脚本注入、超长关键字、正则元字符；
   5. localStorage 非法 JSON、字段类型错误、账号 / 镜像 / 实例为空、
      内存超限、任务字节超出总量；
   6. 脏任务：内容被下架、未知类型 / 状态、缺字段、总量为 0、负进度、脏附加组件；
   7. 极端数值：内存为 0、磁盘为 0、实例名含脚本片段、镜像字段全部越界；远古版只剩原版加载器、非法下载源回落到自动；
   8. 超量数据：200 个任务与 200 个实例的渲染结果与耗时。
   任何一项失败或页面异常都算不通过。
   ========================================================================== */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const url = process.argv[2] || "http://localhost:5182/";
const STORAGE_KEY = "jingjie.state.v1";

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);

const chrome = candidates.find((item) => fs.existsSync(item));
if (!chrome) {
  console.error("没有找到 Chrome / Edge，请用 CHROME_PATH 指定可执行文件。");
  process.exit(1);
}

const port = 9700 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "jingjie-edge-"));
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
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

function connect(wsUrl, onEvent) {
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
      if (!message.id) {
        if (onEvent) onEvent(message);
        return;
      }
      if (!pending.has(message.id)) return;
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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception ? result.exceptionDetails.exception.description : "页面脚本执行失败");
  }
  return result.result.value;
}

const ROUTES = ["versions", "mods", "modpacks", "resourcepacks", "shaders", "downloads", "instances", "logs", "settings", "home"];

// 公共片段：结果收集与通用查询，各阶段脚本自己拼在开头
const HELPERS = `
  var results = [];
  var sleep = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
  var view = document.getElementById("view");
  var push = function (name, ok, detail) { results.push({ check: name, ok: Boolean(ok), detail: detail || "" }); };
  var byAction = function (action) {
    return Array.prototype.slice.call(document.querySelectorAll("[data-action]")).filter(function (el) {
      return el.dataset.action === action;
    })[0];
  };
  var route = function (name) {
    document.querySelector('[data-route="' + name + '"]').click();
  };
  var stored = function () {
    try { return JSON.parse(localStorage.getItem("${STORAGE_KEY}") || "{}"); } catch (error) { return {}; }
  };
  var step = async function (name, fn) {
    try { await fn(); } catch (error) { push("异常：" + name, false, String(error && error.message || error)); }
  };
`;

// 第一阶段：正常数据下的非法输入
const PHASE_MAIN = `
(async function () {
  ${HELPERS}

  var accountName = function () { return document.getElementById("account-name").textContent; };
  var idInput = function () { return document.querySelector('[data-account="name"]'); };
  var rename = async function (value) {
    var input = idInput();
    if (!input) throw new Error("没有离线 ID 输入框");
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(150);
    return idInput() ? idInput().value : "";
  };
  var uuidOf = function (name) {
    var list = stored().accounts || [];
    var found = list.filter(function (item) { return item.name === name; })[0];
    return found ? found.uuid : "";
  };

  route("home");
  await sleep(220);

  await step("离线 ID 边界", async function () {
    var baseline = idInput().value;
    var cases = [
      ["ab", "少于 3 位"],
      ["abcdefghijklmnopq", "超过 16 位"],
      ["bad name", "含空格"],
      ["玩家一号", "含中文"],
      ["steven_cn", "与已有账号重名（忽略大小写）"],
    ];
    for (var i = 0; i < cases.length; i += 1) {
      var value = await rename(cases[i][0]);
      push("拒绝" + cases[i][1], value === baseline, "输入 " + cases[i][0] + " → " + value);
    }
    var accepted = await rename("abcdefghijklmnop");
    push("接受 16 位合法 ID", accepted === "abcdefghijklmnop" && accountName() === "abcdefghijklmnop", accepted);
    var firstUuid = uuidOf("abcdefghijklmnop");
    await rename("abcdefghijklmno");
    var secondUuid = uuidOf("abcdefghijklmno");
    push("改名后 UUID 跟着变", firstUuid && secondUuid && firstUuid !== secondUuid, firstUuid.slice(0, 8) + " → " + secondUuid.slice(0, 8));
    await rename("abcdefghijklmnop");
    push("同名始终派生同一 UUID", uuidOf("abcdefghijklmnop") === firstUuid);
    push("UUID 格式合法", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(firstUuid), firstUuid);
  });

  await step("账号类型约束", async function () {
    var picker = document.querySelector('[data-account="pick"]');
    picker.value = "acc-msa-1";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(180);
    push("微软账号没有改名输入框", !idInput() && accountName() === "ZhuZen", accountName());
    push("微软账号标注只读", view.textContent.indexOf("只读") >= 0);
    picker = document.querySelector('[data-account="pick"]');
    picker.value = "acc-authlib-1";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(180);
    push("第三方账号没有改名输入框", !idInput() && accountName() === "Aurora_Xi", accountName());
    push("第三方账号标出来源", view.textContent.indexOf("LittleSkin") >= 0);
    picker = document.querySelector('[data-account="pick"]');
    picker.value = "acc-offline-1";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(180);
    push("切回离线账号恢复输入框", Boolean(idInput()), idInput() ? idInput().value : "无");
  });

  await step("设置边界", async function () {
    route("settings");
    await sleep(250);
    var field = function (key) { return document.querySelector('[data-setting="' + key + '"]'); };
    var setValue = function (key, value) {
      var el = field(key);
      if (!el) throw new Error("找不到设置项 " + key);
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    var save = async function () {
      byAction("setting:save").click();
      await sleep(160);
    };
    var saved = function () { return stored().settings || {}; };
    var dirty = function () { return !document.getElementById("savebar").hidden; };

    setValue("concurrency", 0);
    await save();
    push("并发 0 被拒绝", dirty() && Number(saved().concurrency) === 8, "落盘 " + saved().concurrency);
    setValue("concurrency", 17);
    await save();
    push("并发 17 被拒绝", dirty() && Number(saved().concurrency) === 8, "落盘 " + saved().concurrency);
    setValue("concurrency", "8.5");
    await save();
    push("并发 8.5 被拒绝", dirty() && Number(saved().concurrency) === 8, "落盘 " + saved().concurrency);
    setValue("concurrency", 1);
    await save();
    push("并发 1 可保存", !dirty() && Number(saved().concurrency) === 1, "落盘 " + saved().concurrency);
    setValue("concurrency", 16);
    await save();
    push("并发 16 可保存", !dirty() && Number(saved().concurrency) === 16, "落盘 " + saved().concurrency);
    setValue("defaultMemoryMb", 1023);
    await save();
    push("内存 1023 被拒绝", dirty() && Number(saved().defaultMemoryMb) === 4096, "落盘 " + saved().defaultMemoryMb);
    setValue("defaultMemoryMb", 20000);
    await save();
    push("内存超过物理内存 70% 被拒绝", dirty() && Number(saved().defaultMemoryMb) === 4096, "落盘 " + saved().defaultMemoryMb);
    setValue("javaId", "jre-21");
    await save();
    push("未安装的 Java 21 不能保存", dirty() && saved().javaId !== "jre-21", "落盘 " + saved().javaId);
    setValue("javaId", "jre-999");
    await save();
    push("不存在的 Java 不能保存", dirty() && saved().javaId !== "jre-999", "落盘 " + saved().javaId);
    // 安装路径：逐条喂非法值，最后确认合法值能落盘且被归一化
    // 先把并发 / 内存 / Java 恢复成合法值，否则保存会先被这些项拦下，测不到路径
    setValue("javaId", "jre-17");
    setValue("defaultMemoryMb", 4096);
    setValue("concurrency", 8);
    var lastToast = function () {
      var nodes = document.querySelectorAll("#toasts .toast");
      return nodes.length ? nodes[nodes.length - 1].textContent : "";
    };
    var tryPath = async function (value) {
      var pathField = field("installPath");
      if (!pathField) throw new Error("找不到默认安装路径输入框");
      pathField.value = value;
      pathField.dispatchEvent(new Event("input", { bubbles: true }));
      await save();
      return String(saved().installPath || "");
    };
    var pathCases = [
      ["minecraft", "相对路径"],
      ["C:\\\\", "停在盘符根目录"],
      ["D:\\\\Games\\\\Mi*ne", "含通配符"],
      ["D:\\\\Games\\\\..\\\\Windows", "含向上跳目录"],
      ["D:\\\\Games\\\\Minecraft. ", "目录名以点结尾"],
      ["D:\\\\Games\\\\" + new Array(126).join("a"), "超过 120 字符"],
      ["", "空路径"],
    ];
    for (var p = 0; p < pathCases.length; p += 1) {
      var landed = await tryPath(pathCases[p][0]);
      push(
        "拒绝路径" + pathCases[p][1],
        dirty() && landed.indexOf("AppData") >= 0 && lastToast().indexOf("设置已保存") < 0,
        "落盘 " + landed + " · " + lastToast().replace(/^[✓!△]/, "")
      );
    }
    var savedPath = await tryPath("d:/games/minecraft/");
    push("小写盘符与正斜杠被归一化", !dirty() && savedPath === "d:\\\\games\\\\minecraft", "落盘 " + savedPath);
    await tryPath("C:\\\\Users\\\\Demo\\\\AppData\\\\Roaming\\\\minecraft");
    push("合法路径可恢复默认值", !dirty() && String(saved().installPath).indexOf("AppData") >= 0, "落盘 " + saved().installPath);
    setValue("javaId", "jre-17");
    setValue("defaultMemoryMb", 8192);
    setValue("concurrency", 16);
    var fullscreen = field("fullscreen");
    if (fullscreen && !fullscreen.checked) {
      fullscreen.click();
      await sleep(80);
    }
    await save();
    push(
      "合法极端组合可保存",
      !dirty() && saved().javaId === "jre-17" && Number(saved().defaultMemoryMb) === 8192 && saved().fullscreen === true,
      "java=" + saved().javaId + " mem=" + saved().defaultMemoryMb + " full=" + saved().fullscreen
    );
  });

  await step("搜索极端输入", async function () {
    route("versions");
    await sleep(220);
    var search = document.querySelector('[data-filter="q"]');
    search.value = '<img src=x onerror="window.__xss=1">';
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(200);
    push(
      "脚本标签只当关键字",
      !window.__xss && view.querySelectorAll("img").length === 0,
      "xss=" + window.__xss + " img 元素=" + view.querySelectorAll("img").length + " " + (view.textContent.indexOf("没有匹配") >= 0 ? "空结果" : "有结果")
    );

    var next = document.querySelector('[data-filter="q"]');
    next.value = "1".repeat(4000);
    next.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(200);
    push("4000 字符关键字不崩", view.querySelectorAll("h1").length === 1);

    route("mods");
    await sleep(220);
    var contentSearch = document.querySelector('[data-filter="content-q"]');
    contentSearch.value = ".*(";
    contentSearch.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(200);
    push(
      "正则元字符不误当表达式",
      view.querySelectorAll("h1").length === 1 && view.textContent.indexOf("没有匹配") >= 0,
      document.querySelectorAll(".content-card").length + " 张卡片"
    );

    route("logs");
    await sleep(220);
    var logSearch = document.querySelector('[data-log="q"]');
    logSearch.value = "(";
    logSearch.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(200);
    push("日志搜索特殊字符不崩", view.querySelectorAll("h1").length === 1);
  });

  return results;
})()
`;

const PHASE_BAD_JSON = `
(async function () {
  ${HELPERS}
  var title = document.querySelector(".view__title");
  push("非法 JSON 回到示例数据", title && title.textContent === "开始游戏", title && title.textContent);
  route("settings");
  await sleep(250);
  var concurrency = document.querySelector('[data-setting="concurrency"]');
  push("默认并发回落 8", concurrency && concurrency.value === "8", concurrency && concurrency.value);
  return results;
})()
`;

const PHASE_BAD_SETTINGS = `
(async function () {
  ${HELPERS}
  push("坏设置不影响启动", Boolean(document.querySelector(".view__title")));
  route("settings");
  await sleep(250);
  var concurrency = document.querySelector('[data-setting="concurrency"]');
  push("坏并发值不显示为合法数字", concurrency && concurrency.value !== "8" && concurrency.value !== "16", "显示为「" + (concurrency ? concurrency.value : "") + "」");
  push("坏主题不中断渲染", view.querySelectorAll("h1").length === 1, document.documentElement.dataset.theme);
  var badPath = document.querySelector('[data-setting="installPath"]');
  var badChip = document.querySelector("[data-path-chip]");
  push(
    "坏路径在设置页标出待修正",
    badPath && badChip && !badChip.hidden && view.textContent.indexOf("绝对路径") >= 0,
    badPath ? badPath.value : "没有输入框"
  );
  route("versions");
  await sleep(250);
  var fallbackTarget = document.querySelector(".detail dd[title]");
  push(
    "坏路径回落到演示目录",
    fallbackTarget && fallbackTarget.getAttribute("title").indexOf("Demo") >= 0,
    fallbackTarget ? fallbackTarget.getAttribute("title") : "没有目标目录"
  );
  route("settings");
  await sleep(220);
  var save = byAction("setting:save");
  save.click();
  await sleep(200);
  push(
    "保存坏并发被拒并提示",
    document.getElementById("toasts").textContent.indexOf("并发数") >= 0,
    document.getElementById("toasts").textContent.trim()
  );
  return results;
})()
`;

const PHASE_EMPTY_ACCOUNTS = `
(async function () {
  ${HELPERS}
  var title = document.querySelector(".view__title");
  push("账号为空时主页仍渲染", title && title.textContent === "开始游戏" && view.querySelectorAll("h1").length === 1);
  push("账号为空时给出添加入口", view.textContent.indexOf("还没有账号") >= 0);
  var manage = byAction("account:open");
  push("账号为空时账号入口可用", Boolean(manage));
  if (manage) {
    manage.click();
    await sleep(180);
    var input = document.getElementById("new-account");
    push("账号弹窗可打开", Boolean(input));
    if (input) {
      input.value = "Solo_Player";
      byAction("account:add").click();
      await sleep(220);
      push("空账号列表也能新增离线账号", document.getElementById("account-name").textContent === "Solo_Player", document.getElementById("account-name").textContent);
    }
  }
  return results;
})()
`;

const PHASE_EMPTY_MIRRORS = `
(async function () {
  ${HELPERS}
  var routes = ${JSON.stringify(ROUTES)};
  for (var i = 0; i < routes.length; i += 1) {
    try {
      route(routes[i]);
      await sleep(120);
      push("镜像为空时视图 " + routes[i], view.querySelectorAll("h1").length === 1 && view.innerHTML.length > 200);
    } catch (error) {
      push("镜像为空时视图 " + routes[i], false, String(error && error.message || error));
    }
  }
  push("镜像为空时状态栏降级", document.getElementById("mirror-pill-title").textContent === "未配置源", document.getElementById("mirror-pill-title").textContent);
  return results;
})()
`;

const PHASE_HUGE_MEMORY = `
(async function () {
  ${HELPERS}
  route("instances");
  await sleep(250);
  var launch = byAction("launch");
  push("实例页有启动按钮", Boolean(launch));
  if (launch) {
    launch.click();
    await sleep(250);
    var bad = document.querySelectorAll(".checkitem.is-bad").length;
    var confirm = byAction("launch:confirm");
    push("内存超限被标红", bad >= 1, bad + " 项未通过");
    push("内存超限时启动按钮禁用", confirm && confirm.disabled);
    byAction("modal:close").click();
    await sleep(80);
  }
  return results;
})()
`;

const PHASE_OVERSHOOT = `
(async function () {
  ${HELPERS}
  route("downloads");
  await sleep(350);
  var card = document.querySelector('[data-task-id="task-edge"]');
  push("超出总量的任务仍在列表里", Boolean(card));
  if (card) {
    var pct = card.querySelector('[data-field="pct"]');
    var bar = card.querySelector('[data-field="bar"]');
    var width = bar ? parseFloat(bar.style.width) : NaN;
    push("进度封顶 100%", pct && pct.textContent === "100.0%" && width <= 100, (pct && pct.textContent) + " / 宽 " + width + "%");
  }
  return results;
})()
`;

const PHASE_EMPTY_ALL = `
(async function () {
  ${HELPERS}
  var routes = ${JSON.stringify(ROUTES)};
  for (var i = 0; i < routes.length; i += 1) {
    try {
      route(routes[i]);
      await sleep(120);
      push("清空数据后视图 " + routes[i], view.querySelectorAll("h1").length === 1);
    } catch (error) {
      push("清空数据后视图 " + routes[i], false, String(error && error.message || error));
    }
  }
  route("instances");
  await sleep(180);
  push("实例清空后显示空状态", view.textContent.indexOf("还没有实例") >= 0);
  route("downloads");
  await sleep(180);
  push("任务清空后显示空状态", view.textContent.indexOf("还没有下载任务") >= 0);
  return results;
})()
`;

const PHASE_DIRTY_TASKS = `
(async function () {
  ${HELPERS}
  var card = function (id) { return document.querySelector('[data-task-id="' + id + '"]'); };
  var pctOf = function (id) {
    var el = card(id) && card(id).querySelector('[data-field="pct"]');
    return el ? el.textContent : "缺失";
  };
  var widthOf = function (id) {
    var el = card(id) && card(id).querySelector('[data-field="bar"]');
    return el ? parseFloat(el.style.width) : NaN;
  };
  var textOf = function (id) { return card(id) ? card(id).textContent : ""; };

  route("downloads");
  await sleep(450);

  push("脏任务不影响页面", view.querySelectorAll("h1").length === 1);
  push("未知内容任务仍渲染", Boolean(card("t-unknown")));
  push("未知内容显示兜底名称", textOf("t-unknown").indexOf("未知内容") >= 0, textOf("t-unknown").slice(0, 24));
  push("未知类型有兜底分类", Boolean(card("t-badkind")) && textOf("t-badkind").indexOf("内容") >= 0, textOf("t-badkind").slice(0, 24));
  push("零总量不出现 NaN", pctOf("t-zero") === "0.0%" && widthOf("t-zero") === 0, pctOf("t-zero") + " / 宽 " + widthOf("t-zero"));
  push("负进度钳到 0", pctOf("t-negative") === "0.0%" && widthOf("t-negative") === 0, pctOf("t-negative") + " / 宽 " + widthOf("t-negative"));
  push("未知状态显示未知", textOf("t-badstatus").indexOf("未知") >= 0, textOf("t-badstatus").slice(0, 24));
  push("脏附加组件不崩也不出 NaN", Boolean(card("t-addons")) && textOf("t-addons").indexOf("NaN") < 0, textOf("t-addons").slice(0, 24));
  push("缺字段任务不崩也不出 NaN", Boolean(card("t-sparse")) && textOf("t-sparse").indexOf("NaN") < 0);
  push("脏任务时悬浮球无 NaN", (document.getElementById("taskball").getAttribute("style") || "").indexOf("NaN") < 0);

  route("home");
  await sleep(260);
  push("有脏任务时主页仍渲染", view.querySelectorAll("h1").length === 1 && view.textContent.indexOf("NaN") < 0);
  return results;
})()
`;

const PHASE_EXTREME_VALUES = `
(async function () {
  ${HELPERS}
  route("instances");
  await sleep(320);
  push("极端实例数据仍渲染", view.querySelectorAll("h1").length === 1);
  push("实例名里的标签被转义", view.querySelectorAll("img").length === 0 && view.textContent.indexOf("<img") >= 0);
  push("实例页不出现 NaN / undefined", view.textContent.indexOf("NaN") < 0 && view.textContent.indexOf("undefined") < 0);

  var launch = byAction("launch");
  push("极端实例仍有启动入口", Boolean(launch));
  if (launch) {
    launch.click();
    await sleep(260);
    push("内存为 0 时启动检查可打开", document.querySelectorAll(".checkitem").length >= 5, document.querySelectorAll(".checkitem").length + " 项");
    push("内存为 0 时被标红", document.querySelectorAll(".checkitem.is-bad").length >= 1);
    var confirm = byAction("launch:confirm");
    push("内存为 0 时禁用启动", Boolean(confirm) && confirm.disabled);
    var close = byAction("modal:close");
    if (close) close.click();
    await sleep(80);
  }

  route("settings");
  await sleep(260);
  push("磁盘为 0 时设置页正常", view.querySelectorAll("h1").length === 1 && view.textContent.indexOf("NaN") < 0);
  push("磁盘为 0 显示 0 MB", view.textContent.indexOf("0 MB") >= 0);

  route("versions");
  await sleep(260);
  var rows = view.querySelectorAll('tr[data-action="version:open"]');
  var lastRow = rows[rows.length - 1];
  push("版本页的行都能进安装选项", rows.length > 0 && Boolean(lastRow), rows.length + " 行");
  if (lastRow) {
    lastRow.click();
    await sleep(220);
    var loaderInputs = Array.prototype.slice.call(document.querySelectorAll("[data-plan-loader]"));
    var enabledLoaders = loaderInputs.filter(function (el) { return !el.disabled; });
    push("远古版只保留原版加载器", loaderInputs.length === 4 && enabledLoaders.length === 1, enabledLoaders.length + " 个可用");
    push("远古版附加组件全部禁用", Array.prototype.slice.call(document.querySelectorAll("[data-plan-extra]")).every(function (el) { return el.disabled; }));
    push("远古版安装选项页正常", view.querySelectorAll("h1").length === 1 && view.textContent.indexOf("NaN") < 0);
    var source = document.querySelector('[data-plan="source"]');
    if (source) {
      source.value = "mirror-not-exist";
      source.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(160);
      var after = document.querySelector('[data-plan="source"]');
      push("非法下载源回落到自动", after && after.value === "auto", after ? after.value : "没有下拉框");
    }
    var planStart = byAction("plan:start");
    push(
      "磁盘为 0 时安装选项页禁用开始并提示",
      Boolean(planStart) && planStart.disabled && view.textContent.indexOf("磁盘空间不足") >= 0,
      planStart ? "禁用=" + planStart.disabled : "没有开始按钮"
    );
  }

  route("versions");
  await sleep(260);
  var install = byAction("install:open");
  push("镜像缺字段时版本页可打开向导", Boolean(install) || view.querySelectorAll("h1").length === 1);

  route("logs");
  await sleep(260);
  push("日志为空时日志页正常", view.querySelectorAll("h1").length === 1);
  return results;
})()
`;

const PHASE_BULK = `
(async function () {
  ${HELPERS}
  var started = performance.now();
  route("downloads");
  await sleep(120);
  var taskCards = document.querySelectorAll(".task").length;
  push("200 个任务都能列出", taskCards >= 200, taskCards + " 张卡片");
  push("大量任务渲染耗时可接受", performance.now() - started < 2500, Math.round(performance.now() - started) + " ms");

  started = performance.now();
  route("instances");
  await sleep(120);
  var instanceCards = document.querySelectorAll(".instance").length;
  push("200 个实例都能列出", instanceCards >= 200, instanceCards + " 个实例");
  push("大量实例渲染耗时可接受", performance.now() - started < 2500, Math.round(performance.now() - started) + " ms");
  return results;
})()
`;

(async () => {
  const problems = [];
  const results = [];
  let page;
  let currentPhase = "初始加载";

  const runPhase = async (name, script, raw) => {
    currentPhase = name;
    let injected = null;
    if (typeof raw === "string") {
      const created = await page.send("Page.addScriptToEvaluateOnNewDocument", {
        source: "try { localStorage.setItem(" + JSON.stringify(STORAGE_KEY) + ", " + JSON.stringify(raw) + "); } catch (error) {}",
      });
      injected = created.identifier;
    }
    await page.send("Page.navigate", { url: url });
    await wait(1700);
    let phaseResults;
    try {
      phaseResults = await evaluate(page, script);
    } catch (error) {
      phaseResults = [{ check: "阶段脚本执行", ok: false, detail: error.message }];
    }
    if (injected) {
      await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: injected });
    }
    phaseResults.forEach((item) => results.push({ ...item, phase: name }));
  };

  try {
    await waitForBrowser();
    const target = await openTarget();
    page = await connect(target.webSocketDebuggerUrl, (message) => {
      if (message.method === "Runtime.exceptionThrown") {
        const detail = message.params.exceptionDetails;
        problems.push(currentPhase + " 异常：" + (detail.exception ? detail.exception.description : detail.text));
      }
      if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
        problems.push(currentPhase + " console.error：" + message.params.entry.text);
      }
    });

    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Log.enable");

    await runPhase("非法输入", PHASE_MAIN);

    const baseline = await evaluate(page, "localStorage.getItem(" + JSON.stringify(STORAGE_KEY) + ")");
    if (!baseline) throw new Error("第一阶段结束后没有生成可用的状态快照");
    const mutate = (patch) => {
      const data = JSON.parse(baseline);
      patch(data);
      return JSON.stringify(data);
    };

    await runPhase("非法 JSON", PHASE_BAD_JSON, "{");
    await runPhase(
      "字段类型错误",
      PHASE_BAD_SETTINGS,
      mutate((data) => {
        data.settings = { ...data.settings, concurrency: "abc", defaultMemoryMb: -5, javaId: "jre-21", fullscreen: "yes", theme: "neon", installPath: "minecraft\\bad" };
      })
    );
    await runPhase(
      "账号为空",
      PHASE_EMPTY_ACCOUNTS,
      mutate((data) => {
        data.accounts = [];
        data.selectedAccountId = "";
      })
    );
    await runPhase(
      "镜像为空",
      PHASE_EMPTY_MIRRORS,
      mutate((data) => {
        data.mirrors = [];
      })
    );
    await runPhase(
      "内存超限",
      PHASE_HUGE_MEMORY,
      mutate((data) => {
        data.instances[0].memoryMb = 999999;
      })
    );
    await runPhase(
      "任务字节超限",
      PHASE_OVERSHOOT,
      mutate((data) => {
        data.tasks.push({
          id: "task-edge",
          kind: "version",
          versionId: "1.20.4",
          source: "bmclapi",
          status: "running",
          phase: "download",
          totalBytes: 1000,
          doneBytes: 5000,
          fileDone: 1,
          speedBps: 0,
          retries: 0,
          error: null,
          createdAt: Date.now(),
        });
      })
    );
    await runPhase(
      "数据全空",
      PHASE_EMPTY_ALL,
      mutate((data) => {
        data.instances = [];
        data.tasks = [];
        data.content = [];
      })
    );
    await runPhase(
      "脏任务",
      PHASE_DIRTY_TASKS,
      mutate((data) => {
        const base = {
          kind: "version",
          versionId: "1.20.4",
          source: "bmclapi",
          phase: "download",
          totalBytes: 1000,
          doneBytes: 0,
          fileDone: 0,
          speedBps: 0,
          retries: 0,
          error: null,
          createdAt: Date.now(),
        };
        data.tasks = [
          { ...base, id: "t-unknown", kind: "mod", itemId: "mod-not-exist", status: "running", doneBytes: 300 },
          { ...base, id: "t-badkind", kind: "texture", itemId: "whatever", status: "paused" },
          { ...base, id: "t-zero", status: "running", totalBytes: 0, doneBytes: 0 },
          { ...base, id: "t-negative", status: "running", doneBytes: -5000 },
          { ...base, id: "t-badstatus", status: "zombie" },
          { ...base, id: "t-addons", status: "paused", addons: [{ id: "fabric" }, { id: "optifine", size: -1 }], extras: ["iris", "not-exist"] },
          { id: "t-sparse" },
        ];
      })
    );
    await runPhase(
      "极端数值",
      PHASE_EXTREME_VALUES,
      mutate((data) => {
        data.instances = [
          {
            id: "inst-edge",
            name: '<img src=x onerror="window.__instXss=1">',
            versionId: "9.9.9",
            loader: "fabric",
            memoryMb: 0,
            javaId: "auto",
            windowSize: "0x0",
            isolated: true,
            sizeBytes: -1,
            installedAt: 0,
            lastPlayedAt: null,
          },
        ];
        data.diskFree = 0;
        data.mirrors = [
          {
            id: "bmclapi",
            name: "BMCLAPI",
            baseUrl: "",
            latencyMs: 999999,
            throughputMbps: 0,
            status: "mystery",
            priority: -1,
            successRate: 0,
          },
        ];
      })
    );
    await runPhase(
      "超量数据",
      PHASE_BULK,
      mutate((data) => {
        const tasks = [];
        for (let i = 0; i < 200; i += 1) {
          tasks.push({
            id: "t-bulk-" + i,
            kind: "version",
            versionId: "1.20.4",
            source: "bmclapi",
            status: "done",
            phase: "done",
            totalBytes: 1000 + i,
            doneBytes: 1000 + i,
            fileDone: 1,
            speedBps: 0,
            retries: 0,
            error: null,
            createdAt: Date.now() - i,
            finishedAt: Date.now() - i,
          });
        }
        data.tasks = tasks;
        const instances = [];
        for (let i = 0; i < 200; i += 1) {
          instances.push({
            id: "inst-bulk-" + i,
            name: "批量实例 " + i,
            versionId: "1.20.4",
            loader: "vanilla",
            memoryMb: 2048,
            javaId: "auto",
            windowSize: "1280x720",
            isolated: true,
            sizeBytes: 512 * 1024 * 1024,
            installedAt: Date.now() - i,
            lastPlayedAt: Date.now() - i,
          });
        }
        data.instances = instances;
      })
    );

    let lastPhase = "";
    let failed = 0;
    results.forEach((item) => {
      if (item.phase !== lastPhase) {
        console.log("\n[" + item.phase + "]");
        lastPhase = item.phase;
      }
      if (!item.ok) failed += 1;
      console.log((item.ok ? "  OK  " : " FAIL ") + item.check + (item.detail ? "  [" + item.detail + "]" : ""));
    });

    if (problems.length) {
      console.log("\n页面报错：");
      problems.forEach((line) => console.log("  " + line));
    }

    console.log("\n" + (results.length - failed) + " / " + results.length + " 项通过" + (problems.length ? "，" + problems.length + " 条页面报错" : "，无页面报错"));
    if (failed || problems.length) process.exitCode = 1;
    page.close();
  } catch (error) {
    console.error("边界检查失败：" + error.message);
    console.error(problems.join("\n"));
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
