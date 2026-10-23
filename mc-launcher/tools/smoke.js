/* ==========================================================================
   tools/smoke.js · 无头 Chrome 冒烟检查
   用法：node tools/smoke.js [url]
   检查内容：
   1. 十个视图都能渲染且只有一个 h1；
   2. 安装向导三步可前进后退，返回后已选版本不丢；
   3. 版本行能进入安装选项页，加载器与 OptiFine / Sodium / Iris 的联动正确，开始安装后任务卡片标出附加组件；
   4. 内容安装弹窗能选实例并成功入队；
   5. 下载任务的暂停 / 继续可用；
   6. 启动前检查弹窗能打开、有 5 项检查；
   7. 演示场景切换与重置不报错；
   8. 设置页能保存，启动子项的全屏开关与 Java 版本栏能从下拉框改到并落盘；
   9. 主页当前账号栏分微软 / 离线 / 第三方三组，只有离线账号能改游戏内 ID 且非法值会回滚。
   同时收集页面异常与 console.error，任何一条都算失败。
   ========================================================================== */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const url = process.argv[2] || "http://localhost:5182/";

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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "jingjie-smoke-"));
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

const TEST_SCRIPT = `
(async function () {
  var results = [];
  var sleep = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
  var view = document.getElementById("view");
  var byAction = function (action) {
    return Array.prototype.slice.call(document.querySelectorAll("[data-action]")).filter(function (el) {
      return el.dataset.action === action;
    })[0];
  };
  var push = function (name, ok, detail) {
    results.push({ check: name, ok: Boolean(ok), detail: detail || "" });
  };

  // 1. 十个视图
  var routes = ["versions", "mods", "modpacks", "resourcepacks", "shaders", "downloads", "instances", "logs", "settings", "home"];
  var routeButton = function (name) {
    return document.querySelector('[data-route="' + name + '"]');
  };
  for (var i = 0; i < routes.length; i += 1) {
    routeButton(routes[i]).click();
    await sleep(80);
    push(
      "视图 " + routes[i],
      view.querySelectorAll("h1").length === 1 && view.innerHTML.length > 300,
      "h1=" + view.querySelectorAll("h1").length + " len=" + view.innerHTML.length
    );
  }

  // 2. 安装向导
  var install = byAction("install:open");
  push("安装入口存在", install);
  install.click();
  await sleep(120);
  push("向导已打开", !document.getElementById("modal").hidden);
  var versionBefore = document.querySelector(".choice.is-checked input").value;
  byAction("wizard:next").click();
  await sleep(80);
  byAction("wizard:next").click();
  await sleep(80);
  push("确认页有汇总", document.querySelectorAll(".summary__row").length >= 6, document.querySelectorAll(".summary__row").length + " 行");
  byAction("wizard:prev").click();
  await sleep(80);
  var backStep = document.querySelectorAll(".steps .step.is-active")[0];
  byAction("wizard:prev").click();
  await sleep(80);
  var versionAfter = document.querySelector(".choice.is-checked input").value;
  push("后退保留已选版本", versionBefore === versionAfter && backStep, versionBefore + " → " + versionAfter);
  byAction("modal:close").click();
  await sleep(80);
  push("向导可关闭", document.getElementById("modal").hidden);

  // 2.1 点版本行进入安装选项页：加载器、高清修复与光影支持的联动
  routeButton("versions").click();
  await sleep(140);
  var versionRow = view.querySelector('tr[data-action="version:open"]');
  push("版本行可点进安装选项页", Boolean(versionRow));
  if (versionRow) {
    versionRow.click();
    await sleep(160);
    push(
      "安装选项页只有一个 h1",
      view.querySelectorAll("h1").length === 1 && view.textContent.indexOf("安装选项") >= 0,
      view.querySelector(".view__title") ? view.querySelector(".view__title").textContent : "没有标题"
    );
    push("列出四个加载器选项", document.querySelectorAll("[data-plan-loader]").length === 4, document.querySelectorAll("[data-plan-loader]").length + " 项");
    push("列出三个附加组件开关", document.querySelectorAll("[data-plan-extra]").length === 3, document.querySelectorAll("[data-plan-extra]").length + " 项");

    var optifine = document.querySelector('[data-plan-extra][value="optifine"]');
    push("原版下 OptiFine 可选", optifine && !optifine.disabled);
    var fabric = document.querySelector('[data-plan-loader][value="fabric"]');
    if (fabric) {
      fabric.click();
      await sleep(150);
      optifine = document.querySelector('[data-plan-extra][value="optifine"]');
      push(
        "切到 Fabric 后 OptiFine 禁用并写明原因",
        optifine && optifine.disabled && view.textContent.indexOf("需要 原版 / Forge 加载器") >= 0,
        optifine ? optifine.disabled + " · " + (optifine.closest(".row").querySelector(".row__desc").textContent || "") : "没有开关"
      );

      var iris = document.querySelector('[data-plan-extra][value="iris"]');
      if (iris) iris.click();
      await sleep(150);
      var sodium = document.querySelector('[data-plan-extra][value="sodium"]');
      push(
        "勾 Iris 自动带上 Sodium",
        sodium && sodium.checked && sodium.disabled && view.textContent.indexOf("随 Iris") >= 0,
        sodium ? "checked=" + sodium.checked + " disabled=" + sodium.disabled : "没有开关"
      );
      push(
        "摘要同步加载器与附加组件",
        document.querySelector(".detail").textContent.indexOf("Fabric") >= 0 && document.querySelector(".detail").textContent.indexOf("Iris") >= 0
      );

      document.querySelector('[data-plan-loader][value="vanilla"]').click();
      await sleep(150);
      optifine = document.querySelector('[data-plan-extra][value="optifine"]');
      push("回原版后 OptiFine 重新可用", optifine && !optifine.disabled);
      if (optifine) optifine.click();
      await sleep(150);
      push("勾 OptiFine 后摘要出现 OptiFine", document.querySelector(".detail").textContent.indexOf("OptiFine") >= 0);

      var planStart = byAction("plan:start");
      push("安装选项页可以开始安装", planStart && !planStart.disabled);
      if (planStart) {
        planStart.click();
        await sleep(320);
        push("开始后跳到安装任务页", view.querySelector(".view__title").textContent === "安装任务", view.querySelector(".view__title").textContent);
        var planTask = document.querySelector("[data-task-id]");
        push("任务卡片标出加载器 / 附加组件", planTask && planTask.textContent.indexOf("OptiFine") >= 0, planTask ? planTask.textContent.slice(0, 20) : "没有任务");
      }
    }
  }

  // 3. Mod 安装流程（内容任务与版本任务共用队列）
  document.querySelector('[data-route="mods"]').click();
  await sleep(150);
  var cards = document.querySelectorAll(".content-card").length;
  push("Mod 列表有卡片", cards >= 5, cards + " 张");

  // 3b. 加载器与类型筛选
  var pickFilter = async function (name, value) {
    var el = document.querySelector('[data-filter="' + name + '"]');
    if (!el) return null;
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(150);
    return document.querySelectorAll(".content-card").length;
  };
  push(
    "Mod 页有加载器与类型筛选",
    Boolean(document.querySelector('[data-filter="content-loader"]')) && Boolean(document.querySelector('[data-filter="content-category"]'))
  );
  var performanceCards = await pickFilter("content-category", "performance");
  push(
    "按类型筛出性能优化",
    performanceCards === 1 && view.textContent.indexOf("Sodium") >= 0 && view.textContent.indexOf("Create") < 0,
    performanceCards + " 张"
  );
  var fabricPerformance = await pickFilter("content-loader", "fabric");
  push("加载器与类型可组合", fabricPerformance === 1, fabricPerformance + " 张");
  var forgePerformance = await pickFilter("content-loader", "forge");
  push(
    "组合无结果时显示空状态",
    forgePerformance === 0 && view.textContent.indexOf("没有匹配") >= 0,
    forgePerformance + " 张"
  );
  var reset = byAction("content:reset");
  if (reset) {
    reset.click();
    await sleep(150);
  }
  var resetCards = document.querySelectorAll(".content-card").length;
  var resetLoader = document.querySelector('[data-filter="content-loader"]');
  push("重置筛选恢复全部卡片", resetCards === cards && resetLoader && resetLoader.value === "all", resetCards + " 张");
  await pickFilter("content-loader", "fabric");
  document.querySelector('[data-route="resourcepacks"]').click();
  await sleep(150);
  push("加载器条件不外溢到材质包", document.querySelectorAll(".content-card").length > 0);
  document.querySelector('[data-route="mods"]').click();
  await sleep(150);
  await pickFilter("content-loader", "all");

  var modInstall = byAction("content:install");
  push("Mod 安装按钮存在", modInstall);
  if (modInstall) {
    modInstall.click();
    await sleep(150);
    push("内容安装弹窗打开", !document.getElementById("modal").hidden);
    var targets = document.querySelectorAll('[data-content="instance"]').length;
    push("可选择目标实例", targets >= 3, targets + " 个");
    var start = byAction("content:install-confirm");
    push("开始下载按钮可用", start && !start.disabled);
    if (start && !start.disabled) {
      start.click();
      await sleep(250);
      push("跳转到安装任务", view.querySelector(".view__title").textContent === "安装任务", view.querySelector(".view__title").textContent);
      var taskCount = document.querySelectorAll("[data-task-id]").length;
      push("内容任务已入队", taskCount >= 7, taskCount + " 个任务");
    }
  }

  // 3.1 安装任务入口改成了右下角悬浮球，点开是一块只看任务的面板
  var ball = document.getElementById("taskball");
  var pop = document.getElementById("taskpop");
  push("站在安装任务页时悬浮球收起", ball && ball.hidden);
  document.querySelector('[data-route="home"]').click();
  await sleep(150);
  push("有活动任务时悬浮球可见且有进度", ball && !ball.hidden && Number(ball.style.getPropertyValue("--p")) > 0,
    ball && !ball.hidden ? "进度 " + ball.style.getPropertyValue("--p") : "隐藏");
  if (ball) {
    ball.click();
    await sleep(200);
    push("点悬浮球打开安装任务面板", pop && !pop.hidden && pop.querySelectorAll("[data-task-id]").length > 0,
      pop && !pop.hidden ? pop.querySelectorAll("[data-task-id]").length + " 行" : "未打开");
    push("面板不跳页，仍停在主页", view.querySelector(".view__title").textContent === "开始游戏", view.querySelector(".view__title").textContent);
    var jump = pop && pop.querySelector('[data-route="mods"]');
    push("面板里有下载分类入口", jump);
    if (jump) {
      jump.click();
      await sleep(200);
    }
    push("从面板跳到 Mod 页并收起面板",
      document.querySelector('.nav__subitem[data-route="mods"]').getAttribute("aria-current") === "page" && pop.hidden,
      view.querySelector(".view__title").textContent + (pop.hidden ? " · 已收起" : " · 未收起"));
  }

  // 3. 下载任务的暂停 / 继续
  document.querySelector('[data-route="downloads"]').click();
  await sleep(100);
  var pause = byAction("task:pause");
  push("存在运行中的任务", pause);
  if (pause) {
    pause.click();
    await sleep(120);
    var resume = byAction("task:resume");
    push("暂停后出现继续按钮", resume);
    if (resume) {
      // 继续后任务会按状态重排，必须按 id 找刚恢复的那一条，不能取第一张卡片
      var resumedId = resume.dataset.id;
      resume.click();
      // 假进度的速度允许短暂掉到 0；如果任务在采样期间直接跑完，也算恢复正常
      var speed = "—";
      var finished = false;
      for (var k = 0; k < 12; k += 1) {
        await sleep(250);
        var card = document.querySelector('[data-task-id="' + resumedId + '"]');
        speed = card ? card.querySelector('[data-field="speed"]').textContent : "";
        finished = card ? !card.querySelector('[data-action="task:pause"]') : false;
        if ((speed && speed !== "—") || finished) break;
      }
      push("继续后速度恢复", (speed && speed !== "—") || finished, finished ? "任务已跑完" : speed);
    }
  }

  // 4. 启动前检查
  document.querySelector('[data-route="instances"]').click();
  await sleep(100);
  byAction("launch").click();
  await sleep(120);
  push("启动检查弹出", !document.getElementById("modal").hidden);
  push("五项检查", document.querySelectorAll(".checkitem").length === 5, document.querySelectorAll(".checkitem").length + " 项");
  byAction("modal:close").click();
  await sleep(80);

  // 5. 场景切换
  var scenarios = ["slow", "java-missing", "oom-crash", "normal"];
  for (var j = 0; j < scenarios.length; j += 1) {
    var button = Array.prototype.slice.call(document.querySelectorAll('[data-action="dev:scenario"]')).filter(function (el) {
      return el.dataset.scenario === scenarios[j];
    })[0];
    push("场景按钮 " + scenarios[j], button);
    if (button) {
      button.click();
      await sleep(150);
    }
  }
  push("崩溃诊断已清除", !document.querySelector(".diagnosis"));

  // 6. 设置页保存
  document.querySelector('[data-route="settings"]').click();
  await sleep(100);
  var lightTheme = document.querySelector('[data-action="setting:theme"][data-value=light]');
  push("主题按钮存在", lightTheme);
  if (lightTheme) {
    lightTheme.click();
    await sleep(80);
    push("保存条出现", !document.getElementById("savebar").hidden);
    push("主题即时预览", document.documentElement.dataset.theme === "light", document.documentElement.dataset.theme);
    byAction("setting:save").click();
    await sleep(120);
    push("保存后保存条收起", document.getElementById("savebar").hidden);
    push("保存后主题仍为浅色", document.documentElement.dataset.theme === "light", document.documentElement.dataset.theme);
    byAction("setting:revert").click();
    await sleep(60);
    push("放弃后保存条隐藏", document.getElementById("savebar").hidden);
  }

  // 7. 启动子项：全屏开关与 Java 版本栏
  var fullscreenInput = document.querySelector('[data-setting="fullscreen"]');
  var fullscreenLabel = fullscreenInput ? fullscreenInput.parentElement.querySelector(".switch__label") : null;
  push(
    "全屏开关存在且默认窗口化",
    fullscreenInput && !fullscreenInput.checked && fullscreenLabel && fullscreenLabel.textContent === "窗口化",
    fullscreenLabel ? fullscreenLabel.textContent : "未找到开关"
  );
  if (fullscreenInput) {
    fullscreenInput.click();
    await sleep(80);
    push("点开关后标签切到全屏", fullscreenLabel.textContent === "全屏", fullscreenLabel.textContent);
    push("改全屏后出现保存条", !document.getElementById("savebar").hidden);
  }

  var javaSelect = document.querySelector('[data-setting="javaId"]');
  var javaOptions = javaSelect ? Array.prototype.slice.call(javaSelect.options) : [];
  push(
    "Java 版本栏第一项是推荐 Java",
    javaOptions[0] && javaOptions[0].value === "auto" && javaOptions[0].textContent.indexOf("推荐") >= 0,
    javaOptions[0] ? javaOptions[0].textContent : "没有下拉框"
  );
  push("Java 栏列出全部运行时", javaOptions.length === 4, javaOptions.length + " 项");
  var missingJava = javaOptions.filter(function (option) {
    return option.value === "jre-21";
  })[0];
  push("未安装的 Java 不可选", missingJava && missingJava.disabled, missingJava ? missingJava.textContent : "未找到 jre-21");
  if (javaSelect) {
    javaSelect.value = "jre-17";
    javaSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(80);
    push("改 Java 后出现保存条", !document.getElementById("savebar").hidden);
  }

  byAction("setting:save").click();
  await sleep(150);
  var savedSettings = {};
  try {
    savedSettings = JSON.parse(localStorage.getItem("jingjie.state.v1") || "{}").settings || {};
  } catch (error) {
    savedSettings = {};
  }
  push(
    "保存后全屏与 Java 写入本地",
    savedSettings.fullscreen === true && savedSettings.javaId === "jre-17",
    "fullscreen=" + savedSettings.fullscreen + " javaId=" + savedSettings.javaId
  );

  document.querySelector('[data-route="instances"]').click();
  await sleep(120);
  byAction("launch").click();
  await sleep(120);
  var summaryText = document.querySelector(".summary") ? document.querySelector(".summary").textContent : "";
  var javaCheck = Array.prototype.slice.call(document.querySelectorAll(".checkitem")).filter(function (item) {
    return item.textContent.indexOf("Java") >= 0;
  })[0];
  push(
    "启动检查显示全屏与指定 Java",
    summaryText.indexOf("全屏") >= 0 && javaCheck && javaCheck.textContent.indexOf("设置里指定") >= 0,
    summaryText.indexOf("全屏") >= 0 ? "全屏" : "未显示全屏"
  );
  byAction("modal:close").click();
  await sleep(80);

  // 8. 默认安装路径：设置里能改、非法值拦住、保存后各页目标目录跟着走
  document.querySelector('[data-route="settings"]').click();
  await sleep(200);
  var pathInput = document.querySelector('[data-setting="installPath"]');
  var pathChip = document.querySelector("[data-path-chip]");
  push("存储面板有默认安装路径", pathInput && pathInput.value.indexOf("minecraft") >= 0, pathInput ? pathInput.value : "没有输入框");
  push("默认路径不标待修正", pathChip && pathChip.hidden, pathChip ? String(pathChip.hidden) : "没有标记");

  if (pathInput) {
    pathInput.value = "minecraft";
    pathInput.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(100);
    var pathHint = document.getElementById("install-path-hint").textContent;
    push("非法路径就地说明原因", pathHint.indexOf("绝对路径") >= 0, pathHint);
    push("非法路径标出待修正", pathChip && !pathChip.hidden, pathChip ? String(pathChip.hidden) : "没有标记");
    byAction("setting:save").click();
    await sleep(160);
    var badSaved = {};
    try { badSaved = JSON.parse(localStorage.getItem("jingjie.state.v1") || "{}").settings || {}; } catch (error) { badSaved = {}; }
    push(
      "非法路径不许保存",
      !document.getElementById("savebar").hidden && String(badSaved.installPath).indexOf("AppData") >= 0,
      "落盘 " + badSaved.installPath
    );

    var pathField = document.querySelector('[data-setting="installPath"]');
    pathField.value = "D:/Games/Minecraft/";
    pathField.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(80);
    byAction("setting:save").click();
    await sleep(200);
    var goodSaved = {};
    try { goodSaved = JSON.parse(localStorage.getItem("jingjie.state.v1") || "{}").settings || {}; } catch (error) { goodSaved = {}; }
    push(
      "合法路径去掉多余分隔符后保存",
      goodSaved.installPath === "D:\\\\Games\\\\Minecraft" && document.getElementById("savebar").hidden,
      "落盘 " + goodSaved.installPath
    );

    document.querySelector('[data-route="versions"]').click();
    await sleep(220);
    var versionRow = document.querySelector("tbody tr");
    if (versionRow) {
      versionRow.click();
      await sleep(300);
    }
    var targetCell = document.querySelector(".plan dd[title]");
    push(
      "安装选项页目标目录跟随设置",
      targetCell && targetCell.getAttribute("title").indexOf("D:\\\\Games\\\\Minecraft\\\\instances") === 0,
      targetCell ? targetCell.getAttribute("title") : "没有目标目录"
    );

    document.querySelector('[data-route="settings"]').click();
    await sleep(200);
    byAction("path:browse").click();
    await sleep(160);
    var choices = document.querySelectorAll("[data-path-choice]");
    push("浏览弹窗列出候选目录", !document.getElementById("modal").hidden && choices.length >= 3, choices.length + " 项");
    var presetChoice = Array.prototype.filter.call(choices, function (item) {
      return item.value.indexOf("E:") === 0;
    })[0];
    if (presetChoice) {
      presetChoice.checked = true;
      presetChoice.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await sleep(60);
    var live = document.querySelector("[data-path-live]");
    var livePath = document.querySelector("[data-path-live-path]");
    var liveNote = document.querySelector("[data-path-live-note]");
    push(
      "选中别的磁盘立即在弹窗里回显",
      live && live.classList.contains("is-changed") && livePath && livePath.textContent.indexOf("E:") === 0 &&
        liveNote && liveNote.textContent.indexOf("保存修改") >= 0,
      livePath ? livePath.textContent + " · " + (liveNote ? liveNote.textContent : "") : "没有实时摘要"
    );
    var checkedRow = document.querySelector("[data-path-row].is-checked");
    push(
      "候选卡片高亮跟着切换",
      checkedRow && checkedRow.getAttribute("data-path-value").indexOf("E:") === 0,
      checkedRow ? checkedRow.getAttribute("data-path-value") : "没有高亮项"
    );
    byAction("path:pick").click();
    await sleep(160);
    var pickedInput = document.querySelector('[data-setting="installPath"]');
    push("候选目录回填到输入框", pickedInput && pickedInput.value.indexOf("E:") === 0, pickedInput ? pickedInput.value : "没有输入框");
    var pathNote = document.querySelector("[data-path-note]");
    push(
      "换盘后在设置页留下未保存提示",
      pathNote && !pathNote.hidden && pathNote.textContent.indexOf("尚未保存") >= 0 &&
        pathNote.textContent.indexOf("E 盘") >= 0 && pathNote.querySelector('[data-action="setting:save"]'),
      pathNote ? pathNote.textContent.trim() : "没有提示"
    );
    push("换盘后保存条重新出现", !document.getElementById("savebar").hidden, String(!document.getElementById("savebar").hidden));

    byAction("path:reset").click();
    await sleep(140);
    var resetInput = document.querySelector('[data-setting="installPath"]');
    push("恢复默认填回演示目录", resetInput && resetInput.value.indexOf("AppData") >= 0, resetInput ? resetInput.value : "没有输入框");
    byAction("setting:save").click();
    await sleep(180);
    var restored = {};
    try { restored = JSON.parse(localStorage.getItem("jingjie.state.v1") || "{}").settings || {}; } catch (error) { restored = {}; }
    push("恢复默认后保存成功", String(restored.installPath).indexOf("AppData") >= 0, "落盘 " + restored.installPath);
    var clearedNote = document.querySelector("[data-path-note]");
    push("保存后未保存提示自动收起", !clearedNote || clearedNote.hidden, clearedNote ? String(clearedNote.hidden) : "没有提示");
  }

  // 9. 主页当前账号：三类账号共用一个下拉，只有离线账号能改游戏内 ID
  document.querySelector('[data-route="home"]').click();
  await sleep(150);
  var picker = document.querySelector('[data-account="pick"]');
  var groups = picker
    ? Array.prototype.slice.call(picker.querySelectorAll("optgroup")).map(function (group) {
        return group.label;
      })
    : [];
  push("主页有当前账号栏且分三类", picker && groups.join("/") === "微软账号/离线账号/第三方登录", groups.join(" / "));
  var offlineInput = document.querySelector('[data-account="name"]');
  push("离线账号可直接改游戏内 ID", offlineInput && !offlineInput.disabled, offlineInput ? offlineInput.value : "没有输入框");
  if (offlineInput) {
    offlineInput.value = "Nether_Fox";
    offlineInput.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(120);
    push("改名后标题栏账号同步", document.getElementById("account-name").textContent === "Nether_Fox", document.getElementById("account-name").textContent);
    var againInput = document.querySelector('[data-account="name"]');
    againInput.value = "bad name!";
    againInput.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(120);
    push("非法 ID 被回滚", againInput.value === "Nether_Fox", againInput.value);
  }
  if (picker) {
    var msPicker = document.querySelector('[data-account="pick"]');
    msPicker.value = "acc-msa-1";
    msPicker.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(150);
    push(
      "微软账号名称只读",
      !document.querySelector('[data-account="name"]') && view.textContent.indexOf("只读") >= 0,
      document.getElementById("account-name").textContent
    );
    var thirdPicker = document.querySelector('[data-account="pick"]');
    thirdPicker.value = "acc-authlib-1";
    thirdPicker.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(150);
    push(
      "第三方账号名称只读并标出来源",
      !document.querySelector('[data-account="name"]') && view.textContent.indexOf("LittleSkin") >= 0,
      document.getElementById("account-name").textContent
    );
  }

  return results;
})()
`;

(async () => {
  const problems = [];
  let page;
  try {
    await waitForBrowser();
    const target = await openTarget();
    page = await connect(target.webSocketDebuggerUrl, (message) => {
      if (message.method === "Runtime.exceptionThrown") {
        const detail = message.params.exceptionDetails;
        problems.push("异常：" + (detail.exception ? detail.exception.description : detail.text));
      }
      if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
        problems.push("console.error：" + message.params.entry.text);
      }
    });

    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Log.enable");
    await page.send("Page.navigate", { url: url });
    await wait(1500);

    const results = await evaluate(page, TEST_SCRIPT);
    let failed = 0;
    results.forEach((item) => {
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
    console.error("冒烟检查失败：" + error.message);
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
