/* ==========================================================================
   js/app.js · 界面与交互
   十个视图共用一套状态：state 落 localStorage（jingjie.state.v1），
   runtime 只放速度平滑、停顿、校验计时这类瞬时量，刷新即丢。
   ========================================================================== */

import {
  VERSIONS,
  TYPE_LABEL,
  MIRRORS,
  JAVA_RUNTIMES,
  SEED_INSTANCES,
  SEED_TASKS,
  SEED_ACCOUNTS,
  SEED_CONTENT,
  CONTENT,
  CONTENT_KINDS,
  CONTENT_SOURCES,
  LOADER_LABEL,
  LOADER_OPTIONS,
  EXTRA_OPTIONS,
  MOD_CATEGORIES,
  DEFAULT_SETTINGS,
  MOCK_DISK_FREE,
  DEMO_ROOT,
  INSTALL_PATH_PRESETS,
  makeLogs,
  makeCrashLogs,
  DIAGNOSIS,
  SCENARIOS,
  contentOf,
  contentList,
} from "./mock.js";
import {
  stepTasks,
  probeMirrors,
  pickSources,
  versionOf,
  targetOf,
  targetLabel,
  percentOf,
  etaSeconds,
  fileCursor,
  currentFile,
} from "./engine.js";

const STORAGE_KEY = "jingjie.state.v1";
const MB = 1024 * 1024;
const GB = 1024 * MB;
const PHYSICAL_MEMORY_MB = 16384;
const TICK_MS = 200;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const runtime = new Map();

const boot = { restored: 0 };
let state = loadState();
let route = "home";
const ui = {
  selectedVersionId: state.instances[0] ? state.instances[0].versionId : "1.21.4",
  filters: { q: "", types: new Set(["release", "snapshot", "old_beta"]), installedOnly: false, sort: "date" },
  content: { q: "", mc: "all", loader: "all", category: "all", sort: "popular", installedOnly: false },
  log: { level: "all", q: "", follow: true },
  wizard: null,
  plan: null,
  install: null,
  settingsDraft: null,
  taskSig: "",
  taskpopSig: "",
  launching: null,
  runningGame: null,
};

/* ==========================================================================
   状态
   ========================================================================== */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function seedState() {
  return {
    version: 1,
    scenario: "normal",
    settings: clone(DEFAULT_SETTINGS),
    mirrors: clone(MIRRORS),
    instances: clone(SEED_INSTANCES),
    tasks: clone(SEED_TASKS),
    content: clone(SEED_CONTENT),
    accounts: clone(SEED_ACCOUNTS),
    selectedAccountId: "acc-offline-1",
    javaInstalled: { "jre-8": true, "jre-17": true, "jre-21": false },
    logs: makeLogs(),
    diagnosis: false,
    diskFree: MOCK_DISK_FREE,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return seedState();
    const base = seedState();
    const merged = { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };

    // 老状态没有内容字段：补空数组即可，不把示例内容塞回去，避免「删了又出现」
    if (!Array.isArray(merged.content)) merged.content = [];
    merged.instances = (merged.instances || []).map((instance) => ({
      ...instance,
      loader: instance.loader || "vanilla",
      extras: Array.isArray(instance.extras) ? instance.extras : [],
    }));

    // 老任务只有 versionId，补上 kind / itemId 后统一走新的目标解析
    merged.tasks = (merged.tasks || []).map((task) => {
      const withKind = {
        ...task,
        kind: task.kind || "version",
        itemId: task.itemId || task.versionId,
      };
      const wasActive = withKind.status === "running" || withKind.status === "queued" || withKind.status === "retrying";
      const wasVerifying = withKind.phase === "verify" || withKind.phase === "finishing";
      if (!wasActive && !wasVerifying) return withKind;
      if (wasActive) boot.restored += 1;
      return {
        ...withKind,
        status: "paused",
        phase: wasVerifying ? "paused" : withKind.phase || "download",
        speedBps: 0,
      };
    });
    return merged;
  } catch (error) {
    return seedState();
  }
}

let saveTimer = null;

function save() {
  const payload = { ...state };
  delete payload.filters;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    toast("本地存储写入失败，进度可能无法保存", "danger");
  }
}

function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    save();
  }, 1200);
}

/* ==========================================================================
   小工具
   ========================================================================== */

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtBytes(bytes) {
  // 负数与 NaN 都按 0 显示：坏数据不该在界面上出现「-0 KB」或「NaN」
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  if (value >= GB) return (value / GB).toFixed(2) + " GB";
  if (value >= MB) return (value / MB).toFixed(1) + " MB";
  return Math.round(value / 1024) + " KB";
}

function fmtSpeed(bps) {
  if (!bps || bps < 1) return "0 KB/s";
  if (bps >= MB) return (bps / MB).toFixed(1) + " MB/s";
  return Math.round(bps / 1024) + " KB/s";
}

function fmtEta(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 1) return "即将完成";
  if (seconds < 60) return Math.ceil(seconds) + " 秒";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return minutes + " 分 " + String(rest).padStart(2, "0") + " 秒";
  return Math.floor(minutes / 60) + " 时 " + (minutes % 60) + " 分";
}

function relTime(ts) {
  if (!ts) return "从未启动";
  const diff = Date.now() - ts;
  const minute = 60000;
  if (diff < minute) return "刚刚";
  if (diff < 60 * minute) return Math.floor(diff / minute) + " 分钟前";
  if (diff < 24 * 60 * minute) return Math.floor(diff / (60 * minute)) + " 小时前";
  return Math.floor(diff / (24 * 60 * minute)) + " 天前";
}

function clockOf(ts) {
  const date = new Date(ts);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

const installedSet = () => new Set(state.instances.map((item) => item.versionId));
const instanceOfVersion = (versionId) => state.instances.find((item) => item.versionId === versionId) || null;
const runningTasks = () => state.tasks.filter((task) => task.status === "running");
const activeTasks = () => state.tasks.filter((task) => ["running", "retrying", "queued", "paused"].includes(task.status));
const totalSpeed = () => runningTasks().reduce((sum, task) => sum + (task.speedBps || 0), 0);
const selectedAccount = () => state.accounts.find((item) => item.id === state.selectedAccountId) || state.accounts[0];

// 三类账号的名称来源不同：只有离线账号的名字是本地游戏内 ID，另外两类由认证方下发
const ACCOUNT_TYPES = { microsoft: "微软账号", offline: "离线账号", thirdparty: "第三方登录" };
const ACCOUNT_TYPE_ORDER = { microsoft: 0, offline: 1, thirdparty: 2 };
const accountTypeLabel = (account) => (account && ACCOUNT_TYPES[account.type]) || "未登录";
const accountNameLocked = (account) => Boolean(account) && account.type !== "offline";

/**
 * 离线 UUID 由用户名派生：Minecraft 离线模式就是这么算的，改名必须换 UUID。
 * 这里用固定种子的 FNV-1a 摊出 16 字节，保证同名同 UUID、刷新不跳。
 */
function offlineUuid(name) {
  const source = "OfflinePlayer:" + name;
  const bytes = [];
  let hash = 0x811c9dc5;
  for (let index = 0; index < 16; index += 1) {
    for (const char of source) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    bytes.push((hash >>> ((index % 4) * 8)) & 0xff);
  }
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const isContentTask = (task) => Boolean(task.kind && task.kind !== "version");
const loaderOf = (instance) => (instance && instance.loader) || "vanilla";
const loaderLabel = (value) => LOADER_LABEL[value || "vanilla"] || value;
const instanceName = (id) => {
  const found = state.instances.find((item) => item.id === id);
  return found ? found.name : "已删除的实例";
};
const installedContentOf = (instanceId) =>
  state.content.filter((entry) => !instanceId || entry.instanceId === instanceId);

/** 内容与实例的兼容性：先看游戏版本，再看加载器；资源包与光影不限版本 */
function contentCompat(item, instance) {
  if (!instance) return { ok: false, reason: "还没有实例，先装一个纯净版" };
  const versionOk = item.kind === "modpack" ? item.mcVersion === instance.versionId : !item.mcVersions.length || item.mcVersions.includes(instance.versionId);
  if (!versionOk) {
    const need = item.kind === "modpack" ? item.mcVersion : item.mcVersions.join(" / ");
    return { ok: false, reason: "需要 " + need + "，当前是 " + instance.versionId };
  }
  if (item.kind === "mod" && !item.loaders.includes(loaderOf(instance))) {
    return {
      ok: false,
      reason: "需要 " + item.loaders.map((loader) => LOADER_LABEL[loader] || loader).join(" / ") + "，当前是 " + loaderLabel(loaderOf(instance)),
    };
  }
  return { ok: true, reason: "" };
}

function compatibleInstances(item) {
  return state.instances.filter((instance) => contentCompat(item, instance).ok);
}

function contentSourceName(sourceId) {
  const mirror = state.mirrors.find((item) => item.id === sourceId);
  if (mirror) return mirror.name;
  const found = CONTENT_SOURCES.find((item) => item.id === sourceId);
  return found ? found.name : (sourceId || "未知来源");
}

function fmtCount(value) {
  if (value >= 100000000) return (value / 100000000).toFixed(1) + " 亿";
  if (value >= 10000) return (value / 10000).toFixed(1) + " 万";
  return String(value || 0);
}

function pinnedJava() {
  const id = state.settings.javaId;
  if (!id || id === "auto") return null;
  return JAVA_RUNTIMES.find((java) => java.id === id) || null;
}

function javaForVersion(versionId) {
  const version = versionOf(versionId);
  // 设置里指定了运行时就用它，但要求已安装且不低于该版本要求的最低 Java
  const pinned = pinnedJava();
  if (pinned) {
    if (!state.javaInstalled[pinned.id] || pinned.major < version.javaMajor) return null;
    return pinned;
  }
  const candidates = JAVA_RUNTIMES.filter((java) => state.javaInstalled[java.id]);
  const exact = candidates.find((java) => java.major === version.javaMajor);
  if (exact) return exact;
  const higher = candidates
    .filter((java) => java.major > version.javaMajor)
    .sort((a, b) => a.major - b.major)[0];
  return higher || null;
}

function activeMirror() {
  if (state.settings.mirror === "auto") {
    const { primary } = pickSources(state.mirrors);
    return primary || state.mirrors[0];
  }
  return state.mirrors.find((mirror) => mirror.id === state.settings.mirror) || state.mirrors[0];
}

function statusChip(status) {
  const map = {
    running: ["下载中", "chip--ok"],
    retrying: ["重试中", "chip--warn"],
    queued: ["排队中", "chip--muted"],
    paused: ["已暂停", "chip--warn"],
    failed: ["失败", "chip--danger"],
    done: ["已完成", "chip--info"],
  };
  const [label, cls] = map[status] || ["未知", "chip--muted"];
  return `<span class="chip ${cls}">${label}</span>`;
}

function mirrorChip(status) {
  const map = {
    ok: ["可用", "chip--ok"],
    unstable: ["不稳定", "chip--warn"],
    down: ["不可用", "chip--danger"],
  };
  const [label, cls] = map[status] || ["未知", "chip--muted"];
  return `<span class="chip ${cls}">${label}</span>`;
}

/* ==========================================================================
   提示与对话框
   ========================================================================== */

function toast(text, kind) {
  const stack = $("#toasts");
  const node = document.createElement("div");
  node.className = "toast" + (kind ? " toast--" + kind : "");
  node.innerHTML = `<span class="toast__mark" aria-hidden="true">${kind === "danger" ? "!" : kind === "warn" ? "△" : "✓"}</span><span>${esc(text)}</span>`;
  stack.appendChild(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transform = "translateY(6px)";
    node.style.transition = "opacity .3s var(--ease), transform .3s var(--ease)";
    setTimeout(() => node.remove(), 320);
  }, 3600);
}

let lastFocused = null;

function openModal(options) {
  const modal = $("#modal");
  const panel = $(".modal__panel", modal);
  lastFocused = document.activeElement;
  $("#modal-title").textContent = options.title;
  $("#modal-body").innerHTML = options.body;
  $("#modal-foot").innerHTML = options.foot || "";
  panel.classList.toggle("modal__panel--wide", Boolean(options.wide));
  modal.hidden = false;
  panel.focus();
  const first = $('button:not(:disabled), input:not([type="radio"]), select', $("#modal-body"));
  if (first) first.focus();
}

function closeModal() {
  const modal = $("#modal");
  if (modal.hidden) return;
  modal.hidden = true;
  $("#modal-body").innerHTML = "";
  $("#modal-foot").innerHTML = "";
  ui.wizard = null;
  ui.launching = null;
  ui.install = null;
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
}

function trapFocus(event) {
  if (event.key !== "Tab") return;
  const modal = $("#modal");
  if (modal.hidden) return;
  const focusable = $$(
    'button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])',
    $(".modal__panel", modal)
  ).filter((el) => el.offsetParent !== null);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  }
}

/* ==========================================================================
   渲染：外壳
   ========================================================================== */

function resolvedTheme(value) {
  if (value === "auto") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return value === "light" ? "light" : "dark";
}

function applyTheme(value) {
  document.documentElement.dataset.theme = resolvedTheme(value);
}

function scenarioName() {
  const found = SCENARIOS.find((item) => item.id === state.scenario);
  return found ? found.name : "正常网络";
}

function updateChrome() {
  // 版本安装选项是「纯净版」的子页，导航高亮仍然落在纯净版上
  const navRoute = route === "version" ? "versions" : route;
  $$(".nav__item").forEach((item) => {
    if (item.dataset.route && item.dataset.route === navRoute) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  $$(".nav__subitem").forEach((item) => {
    if (item.dataset.route === navRoute) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  const group = $("#nav-download");
  if (group) group.classList.toggle("has-current", CONTENT_ROUTES.includes(navRoute));

  // 安装任务的入口是右下角的悬浮球：没有需要关注的任务就收起，有任务时用外圈显示总体进度
  const active = activeTasks();
  const attention = attentionTasks();
  const totalBytes = active.reduce((sum, task) => sum + (task.totalBytes || 0), 0);
  const doneBytes = active.reduce((sum, task) => sum + (task.doneBytes || 0), 0);
  const percent = totalBytes > 0 ? (doneBytes / totalBytes) * 100 : 0;
  const ball = $("#taskball");
  if (ball) {
    // 已经站在安装任务页时不需要再挡一次入口
    ball.hidden = attention.length === 0 || route === "downloads";
    if (ball.hidden) closeTaskpop();
    ball.style.setProperty("--p", percent.toFixed(1));
    ball.classList.toggle("is-running", active.some((task) => task.status === "running"));
    const summary = active.length ? "总体 " + Math.round(percent) + "%" : "有条目需要处理";
    ball.setAttribute(
      "aria-label",
      attention.length ? "打开安装任务：" + attention.length + " 个任务，" + summary : "打开安装任务"
    );
    ball.title = attention.length ? "安装任务 · " + attention.length + " 个任务 · " + summary : "安装任务";
    const ballBadge = $("#taskball-badge");
    if (ballBadge) {
      ballBadge.hidden = attention.length === 0;
      ballBadge.textContent = String(attention.length);
    }
  }
  updateTaskpop();

  const mirror = activeMirror();
  const pill = $("#mirror-pill");
  pill.classList.toggle("is-down", state.scenario === "mirror-down" || !mirror);
  pill.classList.toggle("is-warn", mirror && mirror.status === "unstable");
  $("#mirror-pill-title").textContent = state.scenario === "mirror-down" ? "所有源不可达" : mirror ? mirror.name : "未配置源";
  $("#mirror-pill-sub").textContent =
    state.scenario === "mirror-down"
      ? "探测全部超时"
      : mirror
        ? (mirror.latencyMs == null ? "—" : mirror.latencyMs + " ms") + " · " + (mirror.throughputMbps || 0).toFixed(1) + " MB/s"
        : "—";

  const account = selectedAccount();
  $("#account-name").textContent = account ? account.name : "未登录";
  $("#account-tag").textContent = account
    ? account.type === "offline"
      ? "离线账号"
      : accountTypeLabel(account) + " · 演示"
    : "点击登录";
  $(".avatar").textContent = account ? account.name.slice(0, 1).toUpperCase() : "?";

  $("#status-installed").textContent = "已安装 " + state.instances.length + " 个实例 · " + state.content.length + " 项内容";
  $("#status-processes").textContent = "模拟进程 " + (ui.runningGame ? 1 : 0);
  $("#status-scenario").textContent = "场景：" + scenarioName();
  $("#titlebar-meta").textContent = route === "home" ? "仅 Windows · 纯净版 + 内容 · 假进度" : scenarioName() + " · 演示数据";

  $$(".scenario").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.scenario === state.scenario ? "true" : "false");
  });
}

function setText(root, field, text) {
  const node = root.querySelector(`[data-field="${field}"]`);
  if (node) node.textContent = text;
}

/* ==========================================================================
   悬浮的安装任务面板
   ========================================================================== */

// 失败的任务也要算「需要关注」，否则校验失败后入口消失，用户找不到重试在哪
const ATTENTION_STATUS = ["running", "retrying", "queued", "paused", "failed"];

const attentionTasks = () => state.tasks.filter((task) => ATTENTION_STATUS.includes(task.status));

function taskpopTasks() {
  return [...attentionTasks()].sort((a, b) => (TASK_ORDER[a.status] ?? 9) - (TASK_ORDER[b.status] ?? 9));
}

const taskpopSignature = () => taskpopTasks().map((task) => task.id + ":" + task.status).join("|");

function taskpopRow(task) {
  const pct = percentOf(task);
  const cls = task.status === "failed" ? "bar--danger" : task.status === "paused" ? "bar--muted" : "";
  const action =
    task.status === "running"
      ? `<button class="btn btn--sm btn--ghost" type="button" data-action="task:pause" data-id="${esc(task.id)}">暂停</button>`
      : task.status === "paused"
        ? `<button class="btn btn--sm btn--ghost" type="button" data-action="task:resume" data-id="${esc(task.id)}">继续</button>`
        : "";

  return `
  <div class="taskpop__row" data-task-id="${esc(task.id)}">
    <div class="taskpop__rowhead">
      <span class="taskpop__name" title="${esc(targetLabel(task))}">${esc(targetLabel(task))}</span>
      ${statusChip(task.status)}
      ${action}
    </div>
    <div class="bar ${cls}"><i data-field="bar" style="width:${pct.toFixed(2)}%"></i></div>
    <div class="taskpop__rowmeta">
      <span>已完成<b data-field="pct">${pct.toFixed(1)}%</b></span>
      <span>速度<b data-field="speed">${task.speedBps > 0 ? fmtSpeed(task.speedBps) : "—"}</b></span>
      <span>剩余<b data-field="eta">${fmtEta(etaSeconds(task))}</b></span>
    </div>
  </div>`;
}

function renderTaskpop() {
  const body = $("#taskpop-body");
  const meta = $("#taskpop-meta");
  if (!body) return;
  // 重渲染会丢掉焦点：记住当前按钮属于哪个任务，重建后把焦点放回同一行
  const focused = document.activeElement;
  const focusedTask = focused && focused.dataset ? focused.dataset.id : null;

  const list = taskpopTasks();
  body.innerHTML = list.length
    ? list.map(taskpopRow).join("")
    : `<p class="taskpop__empty">队列空闲。去下面的分类装个版本或内容，进度会出现在这里。</p>`;
  if (meta) meta.textContent = list.length ? list.length + " 个任务 · " + fmtSpeed(totalSpeed()) : "队列空闲";
  ui.taskpopSig = taskpopSignature();

  if (focusedTask) {
    const row = body.querySelector('[data-task-id="' + CSS.escape(focusedTask) + '"]');
    const again = row && row.querySelector("button");
    if (again) again.focus({ preventScroll: true });
  }
}

function patchTaskpop() {
  const list = taskpopTasks();
  for (const task of list) {
    const row = document.querySelector('#taskpop [data-task-id="' + CSS.escape(task.id) + '"]');
    if (!row) continue;
    const pct = percentOf(task);
    const bar = row.querySelector('[data-field="bar"]');
    if (bar) bar.style.width = pct.toFixed(2) + "%";
    setText(row, "pct", pct.toFixed(1) + "%");
    setText(row, "speed", task.speedBps > 0 ? fmtSpeed(task.speedBps) : "—");
    setText(row, "eta", fmtEta(etaSeconds(task)));
  }
  const meta = $("#taskpop-meta");
  if (meta) meta.textContent = list.length ? list.length + " 个任务 · " + fmtSpeed(totalSpeed()) : "队列空闲";
}

function updateTaskpop() {
  const pop = $("#taskpop");
  if (!pop || pop.hidden) return;
  if (taskpopSignature() !== ui.taskpopSig) renderTaskpop();
  else patchTaskpop();
}

function openTaskpop() {
  const pop = $("#taskpop");
  if (!pop) return;
  pop.hidden = false;
  $("#taskball").setAttribute("aria-expanded", "true");
  renderTaskpop();
  // 打开后把焦点交给面板里的第一个按钮，键盘用户可以接着操作
  const first = pop.querySelector("button");
  if (first) first.focus({ preventScroll: true });
}

function closeTaskpop() {
  const pop = $("#taskpop");
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  $("#taskball").setAttribute("aria-expanded", "false");
}

const CONTENT_ROUTES = ["versions", "version", "mods", "modpacks", "resourcepacks", "shaders", "downloads"];

const VIEWS = {
  home: viewHome,
  versions: viewVersions,
  version: viewVersionPlan,
  downloads: viewDownloads,
  instances: viewInstances,
  logs: viewLogs,
  settings: viewSettings,
  mods: () => viewContent("mod"),
  modpacks: () => viewContent("modpack"),
  resourcepacks: () => viewContent("resourcepack"),
  shaders: () => viewContent("shader"),
};

function render() {
  const view = $("#view");
  view.innerHTML = VIEWS[route]();
  ui.taskSig = taskSignature();
  updateChrome();
  if (route === "logs" && ui.log.follow) {
    const box = $(".logbox");
    if (box) box.scrollTop = box.scrollHeight;
  }
  if (route === "settings") syncSaveBar();
}

function setNavOpen(open) {
  const group = $("#nav-download");
  if (!group) return;
  group.dataset.open = open ? "true" : "false";
  const button = $(".nav__item--group", group);
  if (button) button.setAttribute("aria-expanded", String(open));
}

// ≤1080px 导航收成图标栏，下载分组展开后是右侧浮层；浮层不该导航后继续挡着正文
function compactNav() {
  return window.matchMedia("(max-width: 1080px)").matches;
}

function go(next) {
  if (!VIEWS[next]) return;
  if (next !== "settings") ui.settingsDraft = null;
  if (CONTENT_ROUTES.includes(next)) setNavOpen(!compactNav());
  route = next;
  render();
  $("#view").focus({ preventScroll: true });
  $("#view").scrollTop = 0;
  if (next === "downloads") patchDownloads();
}

/* ==========================================================================
   视图：主页
   ========================================================================== */

function accountBar() {
  const account = selectedAccount();
  // 账号列表可能来自旧版本或人为改坏的数据，空数组时给入口而不是让主页渲染报错
  if (!account) {
    return `
    <div class="accountbar">
      <span class="accountbar__label">当前账号</span>
      <span class="accountbar__hint">还没有账号，先添加一个离线账号才能启动游戏。</span>
      <button class="linkbtn accountbar__manage" type="button" data-action="account:open">账号管理</button>
    </div>`;
  }
  const groups = ["microsoft", "offline", "thirdparty"]
    .map((type) => {
      const list = state.accounts.filter((item) => item.type === type);
      if (!list.length) return "";
      return `<optgroup label="${ACCOUNT_TYPES[type]}">${list
        .map(
          (item) =>
            `<option value="${esc(item.id)}" ${item.id === account.id ? "selected" : ""}>${esc(item.name)}${item.type === "thirdparty" ? " · " + esc(item.provider || "外置登录") : ""}</option>`
        )
        .join("")}</optgroup>`;
    })
    .join("");

  const locked = accountNameLocked(account);
  const control = locked
    ? `<span class="accountbar__locked"><span class="accountbar__name">${esc(account ? account.name : "未登录")}</span><span class="chip">${esc(accountTypeLabel(account))} · 只读</span></span>`
    : `<input class="input accountbar__id" type="text" maxlength="16" value="${esc(account ? account.name : "")}" data-account="name" data-id="${esc(account ? account.id : "")}" aria-label="离线游戏内 ID" spellcheck="false" autocomplete="off">`;
  const note = locked
    ? `名称由${account.type === "microsoft" ? "微软账号中心" : esc(account.provider || "外置登录服务器")}同步，只能回原平台改`
    : "离线 ID 可改，UUID 由用户名派生";

  return `
    <div class="accountbar">
      <span class="accountbar__label">当前账号</span>
      <select class="select accountbar__select" data-account="pick" aria-label="当前账号">${groups}</select>
      ${control}
      <button class="linkbtn accountbar__manage" type="button" data-action="account:open">账号管理</button>
      <span class="accountbar__hint">${note}</span>
    </div>`;
}

function viewHome() {
  const recent = [...state.instances].sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))[0];
  const latest = VERSIONS[0];
  const installed = installedSet();
  const active = activeTasks();
  const primary = pickSources(state.mirrors).primary;

  const hero = recent
    ? `
      <div class="hero__card">
        <div>
          <p class="eyebrow">最近实例</p>
          <h2 class="hero__title">${esc(recent.name)}</h2>
          <div class="hero__meta">
            <span class="mono">${esc(recent.versionId)}</span>
            <span>${esc(loaderLabel(loaderOf(recent)))} 加载器</span>
            <span>${recent.memoryMb} MB 内存</span>
            <span>${relTime(recent.lastPlayedAt)}</span>
          </div>
        </div>
        <div class="hero__stats">
          <div class="hero__stat">
            <span class="hero__stat-label">版本文件</span>
            <span class="hero__stat-value">${versionOf(recent.versionId).fileCount} 个 · 已校验</span>
          </div>
          <div class="hero__stat">
            <span class="hero__stat-label">实例内容</span>
            <span class="hero__stat-value">${installedContentOf(recent.id).length} 项 · mods / resourcepacks</span>
          </div>
          <div class="hero__stat">
            <span class="hero__stat-label">上次启动</span>
            <span class="hero__stat-value">${relTime(recent.lastPlayedAt)}</span>
          </div>
        </div>
        ${accountBar()}
        <div class="hero__actions">
          <button class="btn btn--primary" type="button" data-action="launch" data-id="${esc(recent.id)}">启动游戏</button>
          <button class="btn" type="button" data-action="dir" data-id="${esc(recent.id)}">打开目录</button>
          <button class="btn btn--ghost" type="button" data-action="route" data-route="instances">全部实例</button>
        </div>
      </div>`
    : `
      <div class="hero__card">
        <p class="eyebrow">开始</p>
        <h2 class="hero__title">还没有安装版本</h2>
        <div class="hero__meta"><span>先装一个原版，再从主页一键启动。</span></div>
        ${accountBar()}
        <div class="hero__actions">
          <button class="btn btn--primary" type="button" data-action="install:open" data-version="${esc(latest.id)}">安装第一个版本</button>
          <button class="btn" type="button" data-action="route" data-route="versions">看看有哪些版本</button>
        </div>
      </div>`;

  const side = `
    <div class="recommend">
      <div class="recommend__top">
        <div>
          <p class="eyebrow">推荐安装</p>
          <p class="recommend__ver">${esc(latest.id)}</p>
        </div>
        <span class="chip chip--ok">最新正式版</span>
      </div>
      <p class="recommend__meta">需要 Java ${latest.javaMajor} · ${fmtBytes(latest.sizeBytes)} · ${latest.fileCount} 个文件</p>
      ${
        installed.has(latest.id)
          ? `<button class="btn btn--block" type="button" data-action="open-instance" data-version="${esc(latest.id)}">打开已有实例</button>`
          : `<button class="btn btn--primary btn--block" type="button" data-action="install:open" data-version="${esc(latest.id)}">安装 ${esc(latest.id)}</button>`
      }
    </div>
    <div class="card">
      <div class="card__head">
        <span class="card__title">下载队列</span>
        <button class="linkbtn" type="button" data-action="route" data-route="downloads">下载中心</button>
      </div>
      <div class="card__body" style="display:grid;gap:8px">
        <div class="summary__row"><span class="summary__key">活动任务</span><span class="summary__val">${active.length} 个</span></div>
        <div class="summary__row"><span class="summary__key">当前速度</span><span class="summary__val" data-field="home-speed">${fmtSpeed(totalSpeed())}</span></div>
        <div class="summary__row"><span class="summary__key">当前源</span><span class="summary__val">${esc(primary ? primary.name : "不可用")}</span></div>
      </div>
    </div>`;

  return `
  <section class="view">
    <div class="view__head">
      <div>
        <p class="eyebrow">主页</p>
        <h1 class="view__title">开始游戏</h1>
        <p class="view__sub">原版、离线、本机存档；演示版不会真正启动游戏。</p>
      </div>
      <div class="view__actions">
        <button class="btn" type="button" data-action="route" data-route="logs">查看日志</button>
        <button class="btn btn--primary" type="button" data-action="install:open" data-version="${esc(latest.id)}">安装新版本</button>
      </div>
    </div>

    <div class="hero">
      ${hero}
      <div class="hero__side">${side}</div>
    </div>

    <div class="quick">
      <button class="quick__item" type="button" data-action="route" data-route="versions"><span class="quick__icon" aria-hidden="true">＋</span>安装纯净版</button>
      <button class="quick__item" type="button" data-action="route" data-route="mods"><span class="quick__icon" aria-hidden="true">◈</span>下载 Mod</button>
      <button class="quick__item" type="button" data-action="route" data-route="modpacks"><span class="quick__icon" aria-hidden="true">▤</span>浏览整合包</button>
      <button class="quick__item" type="button" data-action="route" data-route="downloads"><span class="quick__icon" aria-hidden="true">↓</span>安装任务</button>
      <button class="quick__item" type="button" data-action="mirror:test"><span class="quick__icon" aria-hidden="true">⇅</span>镜像测速</button>
    </div>

    <div class="section">
      <div class="section__head">
        <h2 class="section__title">镜像状态</h2>
        <span class="faint" style="font-size:11.5px">自动模式按「延迟 0.6 + 成功率 0.4」选择</span>
      </div>
      <div class="mirror-list">
        ${state.mirrors
          .map(
            (mirror) => `
          <div class="mirror-row ${primary && primary.id === mirror.id ? "is-selected" : ""}">
            <span class="mirror-row__name">${esc(mirror.name)}${primary && primary.id === mirror.id ? ' <span class="chip chip--ok">主源</span>' : ""}</span>
            <span class="mirror-row__url mono">${esc(mirror.baseUrl || "未配置")}</span>
            <span class="mirror-row__num">${mirror.latencyMs == null ? "—" : mirror.latencyMs + " ms"}</span>
            <span class="mirror-row__num">${(mirror.throughputMbps || 0).toFixed(1)} MB/s</span>
            <span class="mirror-row__tag">${mirrorChip(mirror.status)}</span>
          </div>`
          )
          .join("")}
      </div>
    </div>

    <p class="faint" style="font-size:11.5px">演示数据 · 不会真正下载或启动游戏 · 模拟目录 ${esc(installRoot())}</p>
  </section>`;
}

/* ==========================================================================
   视图：版本与安装
   ========================================================================== */

function filteredVersions() {
  const filters = ui.filters;
  const keyword = filters.q.trim().toLowerCase();
  let list = VERSIONS.filter((version) => {
    if (!filters.types.has(version.type)) return false;
    if (keyword && !version.id.toLowerCase().includes(keyword)) return false;
    return true;
  });
  if (filters.installedOnly) list = list.filter((version) => installedSet().has(version.id));

  const sorters = {
    date: (a, b) => (a.releasedAt < b.releasedAt ? 1 : -1),
    id: (a, b) => a.id.localeCompare(b.id, "en", { numeric: true }),
    size: (a, b) => b.sizeBytes - a.sizeBytes,
  };
  return list.sort(sorters[filters.sort] || sorters.date);
}

function viewVersions() {
  const list = filteredVersions();
  const selected = versionOf(ui.selectedVersionId);
  const installed = installedSet();
  const isInstalled = installed.has(selected.id);
  const filters = ui.filters;

  const rows = list.length
    ? list
        .map(
          (version) => `
        <tr tabindex="0" data-action="version:open" data-version="${esc(version.id)}" class="${version.id === selected.id ? "is-selected" : ""}">
          <td class="cell-strong mono">${esc(version.id)}</td>
          <td><span class="chip ${version.type === "release" ? "" : version.type === "snapshot" ? "chip--info" : "chip--muted"}">${TYPE_LABEL[version.type]}</span></td>
          <td class="mono">${esc(version.releasedAt)}</td>
          <td class="mono">Java ${version.javaMajor}</td>
          <td class="mono">${fmtBytes(version.sizeBytes)}</td>
          <td>${installed.has(version.id) ? '<span class="chip chip--ok">已安装</span>' : '<span class="faint">—</span>'}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="6" style="padding:28px;text-align:center;color:var(--text-faint)">没有匹配的版本，清空搜索或放宽筛选试试。</td></tr>`;

  return `
  <section class="view">
    <div class="view__head">
      <div>
        <p class="eyebrow">下载 · 纯净版</p>
        <h1 class="view__title">纯净版</h1>
        <p class="view__sub">共 ${VERSIONS.length} 个版本；这里只装 Mojang 官方文件，Mod 与整合包在左侧「下载」的其他分类。</p>
      </div>
      <div class="view__actions">
        <button class="btn" type="button" data-action="route" data-route="downloads">安装任务</button>
        <button class="btn btn--primary" type="button" data-action="install:open" data-version="${esc(selected.id)}">安装 ${esc(selected.id)}</button>
      </div>
    </div>

    <div class="split">
      <div>
        <div class="filterbar">
          <div class="filterbar__search">
            <input class="input input--search" type="search" placeholder="搜索版本号，例如 1.20" value="${esc(filters.q)}" data-filter="q" aria-label="搜索版本号">
          </div>
          <div class="filterbar__chips" role="group" aria-label="按类型筛选">
            <button class="chipbtn" type="button" data-action="filter:type" data-type="release" aria-pressed="${filters.types.has("release")}">正式版</button>
            <button class="chipbtn" type="button" data-action="filter:type" data-type="snapshot" aria-pressed="${filters.types.has("snapshot")}">快照</button>
            <button class="chipbtn" type="button" data-action="filter:type" data-type="old_beta" aria-pressed="${filters.types.has("old_beta")}">远古版</button>
          </div>
          <label class="switch">
            <input type="checkbox" data-filter="installedOnly" ${filters.installedOnly ? "checked" : ""}>
            <span class="switch__track" aria-hidden="true"></span>
            <span class="switch__label">只看已安装</span>
          </label>
          <select class="select" data-filter="sort" aria-label="排序方式" style="width:auto">
            <option value="date" ${filters.sort === "date" ? "selected" : ""}>发布时间（新→旧）</option>
            <option value="id" ${filters.sort === "id" ? "selected" : ""}>版本号</option>
            <option value="size" ${filters.sort === "size" ? "selected" : ""}>占用空间</option>
          </select>
        </div>
        <div class="tablewrap">
          <table class="table">
            <thead>
              <tr><th>版本</th><th>类型</th><th>发布时间</th><th>Java</th><th>体积</th><th>状态</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="faint" style="margin-top:8px;font-size:11.5px">上下键切换版本，Enter 进入安装选项；点任意一行也能进。</p>
      </div>

      <aside class="detail" aria-label="版本详情">
        <div>
          <p class="eyebrow">版本详情</p>
          <p class="detail__ver">${esc(selected.id)}</p>
        </div>
        <div class="detail__meta">
          <span class="chip">${TYPE_LABEL[selected.type]}</span>
          ${isInstalled ? '<span class="chip chip--ok">已安装</span>' : '<span class="chip chip--muted">未安装</span>'}
          ${selected.note ? `<span class="chip chip--warn">${esc(selected.note)}</span>` : ""}
        </div>
        <dl class="detail__rows kv">
          <dt>发布时间</dt><dd>${esc(selected.releasedAt)}</dd>
          <dt>所需 Java</dt><dd>Java ${selected.javaMajor}</dd>
          <dt>预计体积</dt><dd>${fmtBytes(selected.sizeBytes)}</dd>
          <dt>文件数</dt><dd>${selected.fileCount}</dd>
          <dt>目标目录</dt><dd class="truncate" title="${esc(instancePath(selected.id))}">instances\\${esc(selected.id)}</dd>
          ${isInstalled ? `<dt>最近启动</dt><dd>${relTime(instanceOfVersion(selected.id).lastPlayedAt)}</dd>` : ""}
        </dl>
        <div class="detail__actions">
          ${
            isInstalled
              ? `<button class="btn btn--primary btn--block" type="button" data-action="launch" data-id="${esc(instanceOfVersion(selected.id).id)}">打开实例</button>
                 <button class="btn btn--block" type="button" data-action="version:open" data-version="${esc(selected.id)}">调整加载器 / 高清修复</button>`
              : `<button class="btn btn--primary btn--block" type="button" data-action="version:open" data-version="${esc(selected.id)}">选择安装选项</button>`
          }
        </div>
        <p class="detail__note">装什么由你在下一页决定：不装加载器就是纯净版；也可以顺手勾上 Fabric / Forge / NeoForge、高清修复或光影支持。</p>
      </aside>
    </div>
  </section>`;
}

/* ==========================================================================
   视图：版本安装选项（加载器 / 高清修复 / 光影支持）
   版本页点一行进入这里：先选装什么，再开始下载。
   ========================================================================== */

const extraOptionOf = (id) => EXTRA_OPTIONS.find((item) => item.id === id) || null;
const extraLabel = (id) => {
  const option = extraOptionOf(id);
  return option ? option.short : id;
};
const loaderOptionOf = (id) => LOADER_OPTIONS.find((item) => item.id === id) || LOADER_OPTIONS[0];

function optionSince(option, version) {
  if (!option.since) return true;
  return String(version.releasedAt || "") >= option.since;
}

/** 加载器不可用时给出具体原因，界面直接显示，不让用户点了才知道 */
function loaderReason(version, option) {
  if (option.id === "vanilla") return "";
  if (!optionSince(option, version)) return "该版本发布时还没有 " + option.short + "，只能用原版";
  return "";
}

/** 附加组件的可用性由「发布日期 + 当前加载器」两条线决定 */
function extraReason(option, version, loader) {
  if (option.releaseOnly && version.type !== "release") return "快照与远古版没有 " + option.short + " 构建";
  if (!optionSince(option, version)) return "该版本发布时还没有 " + option.short;
  if (option.loaders && !option.loaders.includes(loader)) {
    return "需要 " + option.loaders.map((id) => loaderLabel(id)).join(" / ") + " 加载器";
  }
  return "";
}

function defaultPlan(versionId) {
  const version = versionOf(versionId);
  const existing = instanceOfVersion(version.id);
  return {
    versionId: version.id,
    loader: existing ? loaderOf(existing) : "vanilla",
    extras: existing && Array.isArray(existing.extras) ? existing.extras.slice() : [],
    sourceMode: state.settings.mirror === "auto" ? "auto" : state.settings.mirror,
  };
}

/**
 * 把选择收回到合法组合：加载器变了就丢掉不再支持的附加组件，
 * 勾了 Iris 就自动带上 Sodium，避免出现「缺依赖」的安装。
 */
function normalizePlan() {
  const plan = ui.plan;
  if (!plan) return;
  const version = versionOf(plan.versionId);
  if (loaderReason(version, loaderOptionOf(plan.loader))) plan.loader = "vanilla";

  const kept = [];
  for (const id of plan.extras || []) {
    const option = extraOptionOf(id);
    if (!option || extraReason(option, version, plan.loader)) continue;
    if (!kept.includes(id)) kept.push(id);
  }
  for (const id of kept.slice()) {
    const option = extraOptionOf(id);
    for (const dep of option.requires || []) if (!kept.includes(dep)) kept.push(dep);
  }
  plan.extras = kept;

  // 选中的源可能因为场景切换变成不可用，回落到自动
  if (plan.sourceMode !== "auto") {
    const mirror = state.mirrors.find((item) => item.id === plan.sourceMode);
    if (!mirror || mirror.status === "down" || !mirror.baseUrl) plan.sourceMode = "auto";
  }
}

function planAddons(plan) {
  const version = versionOf(plan.versionId);
  const addons = [];
  const loader = loaderOptionOf(plan.loader);
  if (loader.id !== "vanilla" && !loaderReason(version, loader)) {
    addons.push({ id: loader.id, label: loader.name, path: loader.path, size: loader.sizeBytes, files: loader.fileCount });
  }
  for (const id of plan.extras || []) {
    const option = extraOptionOf(id);
    if (!option || extraReason(option, version, plan.loader)) continue;
    addons.push({
      id: option.id,
      label: option.name,
      path: String(option.path || "libraries/" + option.id + ".jar").replace(/\{version\}/g, version.id),
      size: option.sizeBytes,
      files: option.fileCount,
    });
  }
  return addons;
}

function planTotals(plan) {
  const version = versionOf(plan.versionId);
  const addons = planAddons(plan);
  const extraBytes = addons.reduce((sum, addon) => sum + addon.size, 0);
  const extraFiles = addons.reduce((sum, addon) => sum + addon.files, 0);
  return {
    version,
    addons,
    extraBytes,
    extraFiles,
    totalBytes: version.sizeBytes + extraBytes,
    totalFiles: version.fileCount + extraFiles,
  };
}

function openVersionPage(versionId) {
  ui.plan = defaultPlan(versionId);
  ui.selectedVersionId = ui.plan.versionId;
  normalizePlan();
  go("version");
}

function viewVersionPlan() {
  if (!ui.plan) ui.plan = defaultPlan(ui.selectedVersionId);
  normalizePlan();
  const plan = ui.plan;
  const { version, addons, extraBytes, totalFiles, totalBytes } = planTotals(plan);
  const existing = instanceOfVersion(version.id);
  const alive = state.mirrors.filter((mirror) => mirror.status !== "down" && mirror.baseUrl);
  const source = plan.sourceMode === "auto" ? pickSources(state.mirrors).primary : state.mirrors.find((item) => item.id === plan.sourceMode);
  const throughput = source && source.throughputMbps > 0 ? source.throughputMbps * 1024 * 1024 : 800 * 1024;
  const need = Math.round(totalBytes * 1.2);
  const diskBlocked = state.diskFree < need;
  const mirrorBlocked = state.scenario === "mirror-down" && plan.sourceMode === "auto";
  const blocked = diskBlocked || mirrorBlocked;

  const loaderChoices = LOADER_OPTIONS.map((option) => {
    const reason = loaderReason(version, option);
    const checked = plan.loader === option.id;
    return `
      <label class="choice choice--wrap ${checked ? "is-checked" : ""} ${reason ? "is-disabled" : ""}">
        <input type="radio" name="plan-loader" value="${esc(option.id)}" data-plan-loader ${checked ? "checked" : ""} ${reason ? "disabled" : ""}>
        <span class="choice__radio" aria-hidden="true"></span>
        <span class="choice__main">
          <span class="choice__title">${esc(option.name)}${option.id === "vanilla" ? '<span class="chip chip--muted">最轻</span>' : ""}${reason ? '<span class="chip chip--warn">不可用</span>' : ""}</span>
          <span class="choice__sub">${esc(reason || option.desc)}</span>
        </span>
        <span class="choice__side">${option.id === "vanilla" ? "无需下载" : "+" + fmtBytes(option.sizeBytes) + "<br>" + option.fileCount + " 个文件"}</span>
      </label>`;
  }).join("");

  const irisOption = extraOptionOf("iris");
  const extras = EXTRA_OPTIONS.map((option) => {
    // Iris 依赖 Sodium：勾了 Iris，Sodium 就由它带进来，不再让人重复点
    const forced = plan.extras.includes("iris") && (irisOption.requires || []).includes(option.id);
    const reason = extraReason(option, version, plan.loader);
    const checked = forced || plan.extras.includes(option.id);
    const disabled = Boolean(reason) || forced;
    return `
      <div class="row ${disabled ? "is-disabled" : ""}">
        <div class="row__text">
          <span class="row__title">${esc(option.name)}${forced ? '<span class="chip chip--ok">随 Iris 一起安装</span>' : ""}${reason ? '<span class="chip chip--warn">不可用</span>' : ""}</span>
          <span class="row__desc">${esc(reason || option.desc)}</span>
        </div>
        <div class="row__control">
          <span class="faint mono">+${fmtBytes(option.sizeBytes)}</span>
          <label class="switch">
            <input type="checkbox" value="${esc(option.id)}" data-plan-extra ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
            <span class="switch__track" aria-hidden="true"></span>
            <span class="switch__label">${checked ? "安装" : "不装"}</span>
          </label>
        </div>
      </div>`;
  }).join("");

  const extraNames = addons.filter((addon) => addon.id !== plan.loader).map((addon) => extraLabel(addon.id));
  const sourceLabel = source ? source.name : "无可用源";

  return `
  <section class="view">
    <div class="view__head">
      <div>
        <p class="eyebrow">下载 · 纯净版 · 安装选项</p>
        <h1 class="view__title">安装 ${esc(version.id)}</h1>
        <p class="view__sub">先决定装不装加载器与高清修复，再开始下载。选择只影响新建或重装的实例，不会动存档。</p>
      </div>
      <div class="view__actions">
        <button class="btn" type="button" data-action="plan:back">← 返回版本列表</button>
      </div>
    </div>

    <div class="split">
      <div class="plan">
        <section class="panel">
          <div class="panel__head">
            <p class="panel__title">游戏本体</p>
            <p class="panel__desc">Mojang 官方文件，任何选项都会装。</p>
          </div>
          <div class="panel__body">
            <dl class="kv">
              <dt>版本 / 类型</dt><dd>${esc(version.id)} · ${TYPE_LABEL[version.type]}</dd>
              <dt>发布时间</dt><dd>${esc(version.releasedAt)}</dd>
              <dt>所需 Java</dt><dd>Java ${version.javaMajor}</dd>
              <dt>本体体积</dt><dd>${fmtBytes(version.sizeBytes)} · ${version.fileCount} 个文件</dd>
              <dt>目标目录</dt><dd class="truncate" title="${esc(instancePath(version.id))}">instances\\${esc(version.id)}\\</dd>
            </dl>
            ${version.note ? `<div class="notice notice--warn"><strong>${esc(version.note)}</strong><span>开始安装前会检查本机 Java；缺失时在启动检查里给下载入口。</span></div>` : ""}
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <p class="panel__title">Mod 加载器</p>
            <p class="panel__desc">单选。纯净版不需要加载器；要装 Mod 或光影就先选一个。</p>
          </div>
          <div class="panel__body">
            <div class="planopts" role="radiogroup" aria-label="选择 Mod 加载器">${loaderChoices}</div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <p class="panel__title">高清修复与光影</p>
            <p class="panel__desc">按当前加载器过滤：OptiFine 走原版 / Forge，Iris 与 Sodium 走 Fabric。</p>
          </div>
          <div class="panel__body">${extras}</div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <p class="panel__title">下载源</p>
            <p class="panel__desc">加载器与附加组件跟随同一个源下载；自动模式会挑延迟最低的可用镜像。</p>
          </div>
          <div class="panel__body">
            <div class="row">
              <div class="row__text">
                <span class="row__title">使用哪个源</span>
                <span class="row__desc">${esc(sourceLabel)}${source && source.latencyMs != null ? " · " + source.latencyMs + " ms · " + (source.throughputMbps || 0).toFixed(1) + " MB/s" : ""}</span>
              </div>
              <div class="row__control">
                <select class="select" data-plan="source" aria-label="下载源">
                  <option value="auto" ${plan.sourceMode === "auto" ? "selected" : ""}>自动选择（推荐）</option>
                  ${alive
                    .map(
                      (mirror) =>
                        `<option value="${esc(mirror.id)}" ${plan.sourceMode === mirror.id ? "selected" : ""}>${esc(mirror.name)} · ${mirror.latencyMs} ms</option>`
                    )
                    .join("")}
                </select>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside class="detail" aria-label="安装摘要">
        <div>
          <p class="eyebrow">安装摘要</p>
          <p class="detail__ver">${esc(version.id)}</p>
        </div>
        <div class="detail__meta">
          <span class="chip">${TYPE_LABEL[version.type]}</span>
          ${existing ? `<span class="chip chip--ok">已有实例 · ${esc(loaderLabel(loaderOf(existing)))}</span>` : '<span class="chip chip--muted">未安装</span>'}
          ${addons.map((addon) => `<span class="chip chip--info">${esc(addon.id === plan.loader ? loaderLabel(addon.id) : extraLabel(addon.id))}</span>`).join("")}
        </div>
        <div class="summary">
          <div class="summary__row"><span class="summary__key">加载器</span><span class="summary__val">${esc(loaderOptionOf(plan.loader).name)}</span></div>
          <div class="summary__row"><span class="summary__key">附加组件</span><span class="summary__val">${extraNames.length ? esc(extraNames.join(" · ")) : "无"}</span></div>
          <div class="summary__row"><span class="summary__key">本体 / 追加</span><span class="summary__val">${fmtBytes(version.sizeBytes)} / ${extraBytes ? "+" + fmtBytes(extraBytes) : "无"}</span></div>
          <div class="summary__row"><span class="summary__key">合计</span><span class="summary__val">${fmtBytes(totalBytes)} · ${totalFiles} 个文件</span></div>
          <div class="summary__row"><span class="summary__key">预计耗时</span><span class="summary__val">${fmtEta(Math.round(totalBytes / throughput))}</span></div>
          <div class="summary__row"><span class="summary__key">下载源</span><span class="summary__val">${esc(sourceLabel)}</span></div>
          <div class="summary__row"><span class="summary__key">磁盘剩余</span><span class="summary__val">${fmtBytes(state.diskFree)}</span></div>
        </div>
        ${
          mirrorBlocked
            ? `<div class="notice notice--danger"><strong>所有下载源都连不上。</strong><span>探测阶段全部超时，暂时不能开始；换成手动指定源或稍后重试。</span></div>`
            : ""
        }
        ${
          diskBlocked
            ? `<div class="notice notice--danger"><strong>磁盘空间不足。</strong><span>还需要 ${fmtBytes(need - state.diskFree)} 才能开始安装。</span></div>`
            : ""
        }
        ${
          existing
            ? `<div class="notice notice--warn"><strong>${esc(version.id)} 已有实例。</strong><span>再次安装会覆盖版本文件、保留 saves/ 与 config/；这次选的加载器与附加组件会应用到已有实例。</span></div>`
            : ""
        }
        <div class="detail__actions">
          <button class="btn btn--primary btn--block" type="button" data-action="plan:start" ${blocked ? "disabled" : ""}>开始安装${addons.length ? "（含 " + addons.length + " 项）" : ""}</button>
          <button class="btn btn--block" type="button" data-action="plan:back">返回版本列表</button>
        </div>
        <p class="detail__note">演示数据：不会下载加载器安装器，也不会写磁盘。加载器与高清修复只写进假清单，用来演示体积、文件数与安装结果。</p>
      </aside>
    </div>
  </section>`;
}

/* ==========================================================================
   视图：内容下载（Mod / 整合包 / 材质包 / 光影）
   ========================================================================== */

const CATEGORY_TABS = [
  ["versions", "纯净版"],
  ["mods", "Mod"],
  ["modpacks", "整合包"],
  ["resourcepacks", "材质包"],
  ["shaders", "光影"],
  ["downloads", "安装任务"],
];

function categoryTabs(activeRoute) {
  return `<nav class="cattabs" aria-label="下载分类">
    ${CATEGORY_TABS.map(
      ([target, label]) =>
        `<button class="cattab" type="button" data-route="${target}" ${target === activeRoute ? 'aria-current="page"' : ""}>${label}</button>`
    ).join("")}
  </nav>`;
}

function contentMcOptions(kind) {
  const set = new Set();
  contentList(kind).forEach((item) => {
    if (item.kind === "modpack") set.add(item.mcVersion);
    else item.mcVersions.forEach((version) => set.add(version));
  });
  return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
}

function modLoaderOptions() {
  // 选项从现有数据推导，新增 Mod 支持 Quilt 时下拉会自动多一项，不用改这里
  const present = new Set();
  contentList("mod").forEach((item) => (item.loaders || []).forEach((loader) => present.add(loader)));
  const order = ["fabric", "forge", "neoforge", "quilt"];
  return order
    .filter((loader) => present.has(loader))
    .concat(Array.from(present).filter((loader) => !order.includes(loader)));
}

const categoryLabel = (id) => {
  const found = MOD_CATEGORIES.find((item) => item.id === id);
  return found ? found.label : "";
};

function filteredContent(kind) {
  const filters = ui.content;
  const keyword = filters.q.trim().toLowerCase();
  let list = contentList(kind);

  // 游戏版本筛选只对 Mod 与整合包有意义；材质包/光影没有版本概念，
  // 切换分类时保留旧的关键字不应该把新分类筛空
  if (filters.mc !== "all" && (kind === "mod" || kind === "modpack")) {
    list = list.filter((item) => (item.kind === "modpack" ? item.mcVersion === filters.mc : item.mcVersions.includes(filters.mc)));
  }
  // 加载器与类型只对 Mod 有意义；切换分类时保留选择，但不拿它去筛材质包 / 光影
  if (kind === "mod") {
    if (filters.loader !== "all") {
      list = list.filter((item) => (item.loaders || []).includes(filters.loader));
    }
    if (filters.category !== "all") {
      list = list.filter((item) => item.category === filters.category);
    }
  }
  if (keyword) {
    list = list.filter((item) =>
      [item.name, item.author, item.description, categoryLabel(item.category)].concat(item.tags || []).join(" ").toLowerCase().includes(keyword)
    );
  }
  if (filters.installedOnly) {
    list = list.filter((item) => state.content.some((entry) => entry.itemId === item.id));
  }

  const sorters = {
    popular: (a, b) => b.downloads - a.downloads,
    updated: (a, b) => (a.updatedAt < b.updatedAt ? 1 : -1),
    size: (a, b) => b.sizeBytes - a.sizeBytes,
  };
  return list.sort(sorters[filters.sort] || sorters.popular);
}

function contentChips(item) {
  const chips = [];
  if (item.kind === "mod") {
    const category = categoryLabel(item.category);
    if (category) chips.push(`<span class="chip chip--info">${esc(category)}</span>`);
    chips.push(...item.loaders.map((loader) => `<span class="chip">${esc(LOADER_LABEL[loader] || loader)}</span>`));
    chips.push(`<span class="chip chip--muted">${esc(item.mcVersions.slice(0, 2).join(" / "))}${item.mcVersions.length > 2 ? " …" : ""}</span>`);
  }
  if (item.kind === "modpack") {
    chips.push(`<span class="chip chip--info">${esc(item.mcVersion)}</span>`);
    chips.push(`<span class="chip">${esc(LOADER_LABEL[item.loader] || item.loader)}</span>`);
  }
  return chips.join("");
}

function contentCard(item) {
  const entries = state.content.filter((entry) => entry.itemId === item.id);
  const installed = entries.length > 0;
  const isPack = item.kind === "modpack";
  const targets = isPack ? [] : compatibleInstances(item);

  let note;
  if (isPack) note = "包含 " + item.modCount + " 个 Mod · 安装后新建独立实例";
  else if (installed) note = "已装到：" + entries.map((entry) => instanceName(entry.instanceId)).join("、");
  else if (targets.length) {
    note = "可装到：" + targets.slice(0, 2).map((instance) => instance.name).join("、") + (targets.length > 2 ? " 等 " + targets.length + " 个实例" : "");
  } else {
    note = "没有兼容的实例 · 详见详情";
  }

  return `
  <article class="content-card ${installed ? "is-installed" : ""}">
    <div class="content-card__head">
      <span class="content-cover" style="--hue:${Number(item.hue) || 150}" aria-hidden="true">${esc(item.name.slice(0, 2))}</span>
      <div class="content-card__titles">
        <p class="content-card__title">${esc(item.name)}</p>
        <p class="content-card__author">${esc(item.author)} · v${esc(item.version)}</p>
      </div>
      ${installed ? '<span class="chip chip--ok">已安装</span>' : ""}
    </div>
    <p class="content-card__desc">${esc(item.description)}</p>
    <div class="content-card__tags">${contentChips(item)}${(item.tags || []).map((tag) => `<span class="chip chip--muted">${esc(tag)}</span>`).join("")}</div>
    <div class="content-card__meta">
      <span>${fmtCount(item.downloads)} 次下载</span>
      <span>${fmtBytes(item.sizeBytes)}</span>
      <span>${item.fileCount} 个文件</span>
      <span>更新于 ${esc(item.updatedAt)}</span>
    </div>
    <p class="content-card__note">${esc(note)}</p>
    <div class="content-card__actions">
      <button class="btn btn--sm btn--primary" type="button" data-action="content:install" data-id="${esc(item.id)}">${installed ? "再装一个" : "安装"}</button>
      <button class="btn btn--sm" type="button" data-action="content:detail" data-id="${esc(item.id)}">详情</button>
    </div>
  </article>`;
}

function installedBlock(kind) {
  const entries = state.content.filter((entry) => entry.kind === kind);
  if (!entries.length) return "";
  return `
  <div class="installed">
    <div class="installed__head">
      <span>已安装 ${entries.length} 项</span>
      <span class="faint" style="font-weight:400">卸载只改演示状态，不会真的删文件</span>
    </div>
    ${entries
      .map((entry) => {
        const item = contentOf(entry.itemId);
        if (!item) return "";
        return `
        <div class="installed-row">
          <span class="installed-row__name"><span>${esc(item.name)}</span> <span class="chip chip--muted">${esc(item.version)}</span></span>
          <span class="installed-row__meta">${esc(instanceName(entry.instanceId))} · ${esc(relTime(entry.installedAt))}</span>
          <span class="installed-row__num">${fmtBytes(entry.sizeBytes)}</span>
          <span><button class="btn btn--sm btn--ghost" type="button" data-action="content:uninstall" data-id="${esc(entry.id)}">卸载</button></span>
        </div>`;
      })
      .join("")}
  </div>`;
}

function viewContent(kind) {
  const meta = CONTENT_KINDS[kind];
  const list = filteredContent(kind);
  const filters = ui.content;
  const mcOptions = kind === "resourcepack" || kind === "shader" ? [] : contentMcOptions(kind);
  const isMod = kind === "mod";
  const loaderOptions = isMod ? modLoaderOptions() : [];
  const activeLoader = filters.loader || "all";
  const activeCategory = filters.category || "all";

  return `
  <section class="view">
    <div class="view__head">
      <div>
        <p class="eyebrow">下载 · ${esc(meta.label)}</p>
        <h1 class="view__title">${esc(meta.title)}</h1>
        <p class="view__sub">${esc(meta.sub)}</p>
      </div>
      <div class="view__actions">
        <button class="btn" type="button" data-action="route" data-route="downloads">安装任务</button>
        <button class="btn btn--primary" type="button" data-action="route" data-route="versions">装纯净版</button>
      </div>
    </div>

    ${categoryTabs(meta.route)}
    ${installedBlock(kind)}

    <div class="filterbar filterbar--boxed">
      <div class="filterbar__search">
        <input class="input input--search" type="search" placeholder="搜索名称、作者、标签或类型" value="${esc(filters.q)}" data-filter="content-q" aria-label="搜索${esc(meta.noun)}">
      </div>
      ${
        mcOptions.length
          ? `<select class="select" data-filter="content-mc" aria-label="按游戏版本筛选" style="width:auto">
              <option value="all">全部游戏版本</option>
              ${mcOptions.map((version) => `<option value="${esc(version)}" ${filters.mc === version ? "selected" : ""}>${esc(version)}</option>`).join("")}
            </select>`
          : ""
      }
      ${
        isMod
          ? `<select class="select" data-filter="content-loader" aria-label="按加载器筛选" style="width:auto">
              <option value="all">全部加载器</option>
              ${loaderOptions.map((loader) => `<option value="${esc(loader)}" ${activeLoader === loader ? "selected" : ""}>${esc(LOADER_LABEL[loader] || loader)}</option>`).join("")}
            </select>
            <select class="select" data-filter="content-category" aria-label="按模组类型筛选" style="width:auto">
              <option value="all">全部类型</option>
              ${MOD_CATEGORIES.map((category) => `<option value="${esc(category.id)}" ${activeCategory === category.id ? "selected" : ""}>${esc(category.label)}</option>`).join("")}
            </select>`
          : ""
      }
      <select class="select" data-filter="content-sort" aria-label="排序方式" style="width:auto">
        <option value="popular" ${filters.sort === "popular" ? "selected" : ""}>下载量</option>
        <option value="updated" ${filters.sort === "updated" ? "selected" : ""}>最近更新</option>
        <option value="size" ${filters.sort === "size" ? "selected" : ""}>体积</option>
      </select>
      <label class="switch">
        <input type="checkbox" data-filter="content-installedOnly" ${filters.installedOnly ? "checked" : ""}>
        <span class="switch__track" aria-hidden="true"></span>
        <span class="switch__label">只看已安装</span>
      </label>
    </div>

    ${
      list.length
        ? `<div class="content-grid">${list.map(contentCard).join("")}</div>`
        : `<div class="empty">
            <span class="empty__icon" aria-hidden="true">◌</span>
            <p class="empty__title">没有匹配的${esc(meta.noun)}</p>
            <p class="empty__text">清空搜索，或放宽游戏版本、加载器与类型条件，再关掉「只看已安装」试试。</p>
            <button class="btn" type="button" data-action="content:reset">重置筛选</button>
          </div>`
    }

    <p class="faint" style="font-size:11.5px">演示目录：${esc(installRoot())}\\instances\\&lt;实例&gt;\\${esc(meta.dir)}\\ · 目录与文件均为模拟，不会真的下载或写入</p>
  </section>`;
}

/* ---------- 内容安装 / 详情弹窗 ---------- */

function openContentInstall(itemId) {
  const item = contentOf(itemId);
  if (!item) return;
  if (item.kind === "modpack") {
    ui.install = { itemId, instanceId: null };
  } else {
    const targets = compatibleInstances(item);
    ui.install = { itemId, instanceId: targets[0] ? targets[0].id : null };
  }
  renderContentInstall();
}

function loaderFixables(item) {
  if (item.kind !== "mod") return [];
  return state.instances.filter(
    (instance) => item.mcVersions.includes(instance.versionId) && !item.loaders.includes(loaderOf(instance))
  );
}

function renderContentInstall() {
  if (!ui.install) return;
  const item = contentOf(ui.install.itemId);
  if (!item) return;
  const meta = CONTENT_KINDS[item.kind];
  const isPack = item.kind === "modpack";
  const instance = state.instances.find((entry) => entry.id === ui.install.instanceId) || null;
  const compatible = isPack ? true : Boolean(instance && contentCompat(item, instance).ok);
  const enough = state.diskFree >= item.sizeBytes;
  const fixables = loaderFixables(item);
  const dir = isPack
    ? "instances\\&lt;新实例&gt;\\mods\\"
    : "instances\\" + (instance ? instance.versionId : "&lt;实例&gt;") + "\\" + meta.dir + "\\";

  const choices = isPack
    ? `<div class="summary">
        <div class="summary__row"><span class="summary__key">将新建实例</span><span class="summary__val">${esc(item.name)}</span></div>
        <div class="summary__row"><span class="summary__key">游戏版本</span><span class="summary__val">${esc(item.mcVersion)} · ${esc(LOADER_LABEL[item.loader] || item.loader)}</span></div>
        <div class="summary__row"><span class="summary__key">包含 Mod</span><span class="summary__val">${item.modCount} 个 · ${item.fileCount} 个文件</span></div>
      </div>`
    : `<div class="wizard__choice" role="radiogroup" aria-label="选择目标实例">
        ${
          state.instances.length
            ? state.instances
                .map((entry) => {
                  const compat = contentCompat(item, entry);
                  return `
              <label class="choice ${entry.id === ui.install.instanceId ? "is-checked" : ""}" style="${compat.ok ? "" : "opacity:.7"}">
                <input type="radio" name="target-instance" value="${esc(entry.id)}" data-content="instance" ${entry.id === ui.install.instanceId ? "checked" : ""} ${compat.ok ? "" : "disabled"}>
                <span class="choice__radio" aria-hidden="true"></span>
                <span class="choice__main">
                  <span class="choice__title">${esc(entry.name)} <span class="chip">${esc(loaderLabel(loaderOf(entry)))}</span></span>
                  <span class="choice__sub">${esc(entry.versionId)} · ${compat.ok ? "兼容" : esc(compat.reason)}</span>
                </span>
                <span class="choice__side">${fmtBytes(entry.sizeBytes)}</span>
              </label>`;
                })
                .join("")
            : `<div class="notice notice--warn"><strong>还没有实例。</strong><span>先到「纯净版」装一个版本，再回来装 ${esc(meta.noun)}。</span></div>`
        }
      </div>`;

  const foot = isPack
    ? `<span class="grow">会新建实例并写入 Mod 清单（演示）</span>
       <button class="btn" type="button" data-action="modal:close">取消</button>
       <button class="btn btn--primary" type="button" data-action="content:install-confirm" data-id="${esc(item.id)}" ${enough ? "" : "disabled"}>开始下载</button>`
    : `<span class="grow">${compatible ? "将写入 " + esc(instance ? instance.name : "") + " 的 " + esc(meta.dir) + "/" : "先选一个兼容的实例"}</span>
       <button class="btn" type="button" data-action="modal:close">取消</button>
       <button class="btn btn--primary" type="button" data-action="content:install-confirm" data-id="${esc(item.id)}" ${compatible && enough ? "" : "disabled"}>开始下载</button>`;

  openModal({
    title: "安装" + meta.noun + " · " + item.name,
    wide: true,
    body: `
      <div class="summary">
        <div class="summary__row"><span class="summary__key">名称 / 版本</span><span class="summary__val">${esc(item.name)} · v${esc(item.version)}</span></div>
        <div class="summary__row"><span class="summary__key">作者</span><span class="summary__val">${esc(item.author)}</span></div>
        <div class="summary__row"><span class="summary__key">体积 / 文件数</span><span class="summary__val">${fmtBytes(item.sizeBytes)} · ${item.fileCount} 个文件</span></div>
        <div class="summary__row"><span class="summary__key">落位目录</span><span class="summary__val truncate">${esc(dir)}</span></div>
        <div class="summary__row"><span class="summary__key">下载源</span><span class="summary__val">Modrinth 镜像 · 单文件限速</span></div>
      </div>
      ${choices}
      ${
        item.requires.length
          ? `<div class="notice notice--info"><strong>会一并下载 ${item.requires.length} 个依赖：</strong><span>${item.requires
              .map((dep) => esc(dep.name) + "（" + fmtBytes(dep.sizeBytes) + "）")
              .join("、")}</span></div>`
          : ""
      }
      ${
        fixables.length
          ? `<div class="notice notice--warn">
              <strong>版本对得上，但实例没有 ${esc(item.loaders.map((loader) => LOADER_LABEL[loader] || loader).join(" / "))} 加载器。</strong>
              <span>演示版可以直接给实例补一个加载器标记，之后就能把这个 Mod 装进去。</span>
              <span><button class="linkbtn" type="button" data-action="content:add-loader" data-id="${esc(item.id)}" data-instance="${esc(fixables[0].id)}" data-loader="${esc(item.loaders[0])}">给「${esc(fixables[0].name)}」装上 ${esc(LOADER_LABEL[item.loaders[0]] || item.loaders[0])}（演示）</button></span>
            </div>`
          : ""
      }
      ${
        item.kind === "shader"
          ? `<div class="notice notice--warn"><strong>光影需要 Iris 或 OptiFine 才能加载。</strong><span>演示只把 zip 放进 shaderpacks/；要真正生效，先给实例装 Iris。</span><span><button class="linkbtn" type="button" data-action="route" data-route="mods">去装 Iris</button></span></div>`
          : ""
      }
      ${enough ? "" : `<div class="notice notice--danger"><strong>磁盘空间不足。</strong><span>还需要 ${fmtBytes(item.sizeBytes - state.diskFree)} 才能开始。</span></div>`}
    `,
    foot: foot,
  });
}

function openContentDetail(itemId) {
  const item = contentOf(itemId);
  if (!item) return;
  const entries = state.content.filter((entry) => entry.itemId === item.id);
  const targets = item.kind === "modpack" ? [] : state.instances;
  const meta = CONTENT_KINDS[item.kind];

  openModal({
    title: meta.noun + "详情 · " + item.name,
    wide: true,
    body: `
      <div class="summary">
        <div class="summary__row"><span class="summary__key">作者</span><span class="summary__val">${esc(item.author)}</span></div>
        <div class="summary__row"><span class="summary__key">版本</span><span class="summary__val">${esc(item.version)}</span></div>
        <div class="summary__row"><span class="summary__key">体积 / 文件数</span><span class="summary__val">${fmtBytes(item.sizeBytes)} · ${item.fileCount} 个文件</span></div>
        <div class="summary__row"><span class="summary__key">下载量</span><span class="summary__val">${fmtCount(item.downloads)}</span></div>
        <div class="summary__row"><span class="summary__key">更新时间</span><span class="summary__val">${esc(item.updatedAt)}</span></div>
        <div class="summary__row"><span class="summary__key">支持版本</span><span class="summary__val">${esc(item.kind === "modpack" ? item.mcVersion : item.mcVersions.join(" / ") || "全部版本")}</span></div>
        <div class="summary__row"><span class="summary__key">加载器</span><span class="summary__val">${esc(item.kind === "mod" ? item.loaders.map((loader) => LOADER_LABEL[loader] || loader).join(" / ") : item.kind === "modpack" ? LOADER_LABEL[item.loader] || item.loader : "不限")}</span></div>
        <div class="summary__row"><span class="summary__key">类型</span><span class="summary__val">${esc(categoryLabel(item.category) || "未分类")}</span></div>
      </div>
      <p class="muted" style="font-size:13px;line-height:1.65">${esc(item.description)}</p>
      <div class="content-card__tags">${(item.tags || []).map((tag) => `<span class="chip chip--muted">${esc(tag)}</span>`).join("")}</div>
      ${
        item.requires.length
          ? `<div class="notice notice--info"><strong>依赖</strong><span>${item.requires
              .map((dep) => esc(dep.name) + "（" + fmtBytes(dep.sizeBytes) + "）")
              .join("、")}</span></div>`
          : ""
      }
      ${
        item.kind === "modpack"
          ? `<div class="notice"><strong>安装方式</strong><span>会新建一个「${esc(item.name)}」实例，版本 ${esc(item.mcVersion)} · ${esc(LOADER_LABEL[item.loader] || item.loader)}。</span></div>`
          : `<div class="notice"><strong>已安装位置</strong><span>${
              entries.length
                ? entries
                    .map(
                      (entry) =>
                        esc(instanceName(entry.instanceId)) +
                        ' <button class="linkbtn" type="button" data-action="content:uninstall" data-id="' + esc(entry.id) + '">卸载</button>'
                    )
                    .join("　")
                : "还没有装到任何实例"
            }</span></div>`
      }
      ${
        targets.length && item.kind !== "modpack"
          ? `<div class="notice"><strong>兼容性检查</strong><span>${targets
              .map((instance) => {
                const compat = contentCompat(item, instance);
                return esc(instance.name) + "：" + (compat.ok ? "兼容" : esc(compat.reason));
              })
              .join("　")}</span></div>`
          : ""
      }
    `,
    foot: `<span class="grow">演示数据 · 不会真的下载</span>
      <button class="btn" type="button" data-action="modal:close">关闭</button>
      <button class="btn btn--primary" type="button" data-action="content:install" data-id="${esc(item.id)}">${entries.length ? "再装一个" : "安装"}</button>`,
  });
}



const TASK_ORDER = { running: 0, retrying: 1, queued: 2, paused: 3, failed: 4, done: 5 };

function taskSignature() {
  return state.tasks
    .map((task) => [task.id, task.status, task.phase, task.retries, task.error ? task.error.title : ""].join(":"))
    .join("|");
}

/* ==========================================================================
   视图：下载中心（版本任务 + 内容任务混排）
   ========================================================================== */

function taskCard(task) {
  const target = targetOf(task);
  const isContent = isContentTask(task);
  const fileCount = target ? target.fileCount : 0;
  const pct = percentOf(task);
  const cursor = fileCursor(task);
  const eta = etaSeconds(task);
  const sourceLabel = contentSourceName(task.source);
  const label = targetLabel(task);

  let instance = null;
  if (isContent) {
    instance = task.instanceId ? state.instances.find((item) => item.id === task.instanceId) : instanceOfVersion(target ? target.mcVersion : "");
  } else {
    instance = instanceOfVersion(task.versionId);
  }

  const actions = [];
  if (task.status === "running") {
    actions.push(`<button class="btn btn--sm" type="button" data-action="task:pause" data-id="${esc(task.id)}">暂停</button>`);
    actions.push(`<button class="btn btn--sm btn--ghost" type="button" data-action="task:cancel" data-id="${esc(task.id)}">取消</button>`);
  } else if (task.status === "paused") {
    actions.push(`<button class="btn btn--sm btn--primary" type="button" data-action="task:resume" data-id="${esc(task.id)}">继续</button>`);
    actions.push(`<button class="btn btn--sm btn--ghost" type="button" data-action="task:cancel" data-id="${esc(task.id)}">取消</button>`);
  } else if (task.status === "queued") {
    actions.push(`<button class="btn btn--sm btn--ghost" type="button" data-action="task:cancel" data-id="${esc(task.id)}">移出队列</button>`);
  } else if (task.status === "failed") {
    actions.push(`<button class="btn btn--sm btn--primary" type="button" data-action="task:retry" data-id="${esc(task.id)}">重试</button>`);
    actions.push(`<button class="btn btn--sm btn--ghost" type="button" data-action="task:cancel" data-id="${esc(task.id)}">删除任务</button>`);
  } else if (task.status === "done") {
    if (isContent) {
      actions.push(
        instance
          ? `<button class="btn btn--sm" type="button" data-action="launch" data-id="${esc(instance.id)}">打开实例</button>`
          : `<button class="btn btn--sm" type="button" data-action="content:install" data-id="${esc(task.itemId)}">再装一次</button>`
      );
    } else {
      actions.push(
        instance
          ? `<button class="btn btn--sm" type="button" data-action="launch" data-id="${esc(instance.id)}">打开实例</button>`
          : `<button class="btn btn--sm" type="button" data-action="install:open" data-version="${esc(task.versionId)}">重新安装</button>`
      );
    }
    actions.push(`<button class="btn btn--sm btn--ghost" type="button" data-action="task:remove" data-id="${esc(task.id)}">清除记录</button>`);
  } else if (task.status === "retrying") {
    actions.push(`<button class="btn btn--sm btn--ghost" type="button" data-action="task:cancel" data-id="${esc(task.id)}">取消</button>`);
  }

  const verifying = task.phase === "verify" || task.phase === "finishing";
  const verifyPct = task.phase === "finishing" ? 100 : Math.round((runtime.get(task.id)?.verifyDone || 0) * 100);
  const limitNote = state.settings.limitMbps > 0 ? " · 限速 " + state.settings.limitMbps + " MB/s" : "";
  const targetNote = isContent
    ? (task.instanceId ? "目标实例 " + instanceName(task.instanceId) : "不指定实例")
    : (task.loader && task.loader !== "vanilla" ? loaderLabel(task.loader) : "原版") + " · 共 " + fileCount + " 个文件";
  const planChips = isContent
    ? `<span class="chip chip--info">${esc((CONTENT_KINDS[task.kind] || {}).label || "内容")}</span>`
    : [
        task.loader && task.loader !== "vanilla"
          ? `<span class="chip chip--info">${esc(loaderLabel(task.loader))}</span>`
          : '<span class="chip chip--muted">纯净版</span>',
        ...(Array.isArray(task.extras) ? task.extras : []).map((id) => `<span class="chip">${esc(extraLabel(id))}</span>`),
      ].join("");

  return `
  <article class="task ${task.status === "running" || task.status === "retrying" ? "is-active" : ""} ${task.status === "failed" ? "is-failed" : ""}" data-task-id="${esc(task.id)}">
    <div class="task__head">
      <span class="task__ver">${esc(label)}</span>
      ${planChips}
      <span class="task__name">${esc(targetNote)}</span>
      ${statusChip(task.status)}
      ${task.retries > 0 ? `<span class="chip chip--warn">重试 ${task.retries} 次</span>` : ""}
      <div class="task__actions">${actions.join("")}</div>
    </div>

    <div class="task__barrow">
      <div class="bar ${task.status === "failed" ? "bar--danger" : task.status === "paused" ? "bar--muted" : ""}">
        <i data-field="bar" style="width:${pct.toFixed(2)}%"></i>
      </div>
      <span class="task__pct" data-field="pct">${pct.toFixed(1)}%</span>
    </div>

    ${
      verifying
        ? `<div class="task__verify">
            <span>正在校验文件 <b data-field="verify-count">${task.fileDone || fileCount}</b> / ${fileCount}</span>
            <div class="bar bar--thin"><i style="width:${verifyPct}%"></i></div>
          </div>`
        : ""
    }

    <div class="task__meta">
      <span>已下载<b data-field="done">${fmtBytes(task.doneBytes)} / ${fmtBytes(task.totalBytes)}</b></span>
      <span>文件<b data-field="files">${Math.min(cursor.index, fileCount)} / ${fileCount}</b></span>
      <span>速度<b data-field="speed">${task.speedBps > 0 ? fmtSpeed(task.speedBps) : "—"}</b></span>
      <span>剩余<b data-field="eta">${fmtEta(eta)}</b></span>
      <span>当前源<b>${esc(sourceLabel)}</b></span>
    </div>

    <div class="task__file"><span aria-hidden="true">▤</span><span data-field="file">${esc(currentFile(task))}</span></div>

    ${
      task.error
        ? `<div class="task__error">
            <b>${esc(task.error.title)}</b>
            <span>${esc(task.error.detail)}</span>
            <span>下一步：${esc(task.error.todo)}</span>
          </div>`
        : ""
    }

    <p class="faint" style="font-size:11px">${
      task.status === "done"
        ? (isContent ? "校验通过 · 已写入 " + esc(CONTENT_KINDS[task.kind].dir) + "/ · " : "校验通过 · 已写入版本 JSON · ") + esc(relTime(task.finishedAt))
        : "并发 " + state.settings.concurrency + limitNote
    }</p>
  </article>`;
}

function viewDownloads() {
  const sorted = [...state.tasks].sort((a, b) => (TASK_ORDER[a.status] ?? 9) - (TASK_ORDER[b.status] ?? 9));
  const blocked = state.scenario === "mirror-down";

  return `
  <section class="view">
    <div class="view__head">
      <div>
        <p class="eyebrow">下载中心</p>
        <h1 class="view__title">安装任务</h1>
        <p class="view__sub">版本与内容共用一条队列；进度是模拟推进的，不会真的联网。</p>
      </div>
      <div class="view__actions">
        <button class="btn" type="button" data-action="mirror:test">镜像测速</button>
        <button class="btn btn--primary" type="button" data-action="install:open" data-version="${esc(VERSIONS[0].id)}">新建纯净版</button>
      </div>
    </div>

    ${categoryTabs("downloads")}

    ${
      blocked
        ? `<div class="notice notice--danger">
            <strong>所有下载源都连不上。</strong>
            <span>探测阶段全部超时。检查网络后重试，或在设置里换一个镜像。</span>
            <span><button class="linkbtn" type="button" data-action="route" data-route="settings">去设置换源</button></span>
          </div>`
        : ""
    }

    <div class="stats">
      <div class="stat"><span class="stat__label">活动任务</span><span class="stat__value" data-field="stat-active">${activeTasks().length}</span></div>
      <div class="stat"><span class="stat__label">总速度</span><span class="stat__value" data-field="stat-speed">${fmtSpeed(totalSpeed())}</span></div>
      <div class="stat"><span class="stat__label">内容任务</span><span class="stat__value">${state.tasks.filter(isContentTask).length}</span></div>
      <div class="stat"><span class="stat__label">限速</span><span class="stat__value">${state.settings.limitMbps > 0 ? state.settings.limitMbps + " MB/s" : "不限"}</span></div>
    </div>

    <div class="tasks">
      ${
        sorted.length
          ? sorted.map(taskCard).join("")
          : `<div class="empty">
              <span class="empty__icon" aria-hidden="true">↓</span>
              <p class="empty__title">还没有下载任务</p>
              <p class="empty__text">去「纯净版」装一个版本，或者到 Mod / 整合包页面挑一项内容，进度都会出现在这里。</p>
              <button class="btn btn--primary" type="button" data-action="route" data-route="versions">去挑版本</button>
            </div>`
      }
    </div>
  </section>`;
}

function patchDownloads() {
  if (route !== "downloads") return;
  const sig = taskSignature();
  if (sig !== ui.taskSig) {
    render();
    return;
  }
  for (const task of state.tasks) {
    const card = document.querySelector('[data-task-id="' + CSS.escape(task.id) + '"]');
    if (!card) continue;
    const pct = percentOf(task);
    const bar = card.querySelector('[data-field="bar"]');
    if (bar) bar.style.width = pct.toFixed(2) + "%";
    setText(card, "pct", pct.toFixed(1) + "%");
    setText(card, "done", fmtBytes(task.doneBytes) + " / " + fmtBytes(task.totalBytes));
    const cursor = fileCursor(task);
    const fileTotal = cursor.total;
    setText(card, "files", Math.min(cursor.index, fileTotal) + " / " + fileTotal);
    setText(card, "speed", task.speedBps > 0 ? fmtSpeed(task.speedBps) : "—");
    setText(card, "eta", fmtEta(etaSeconds(task)));
    setText(card, "file", currentFile(task));
    const verify = card.querySelector('[data-field="verify-count"]');
    if (verify && runtime.get(task.id)?.verifyDone != null) {
      verify.textContent = String(Math.round(runtime.get(task.id).verifyDone * fileTotal));
    }
  }
  const active = $('[data-field="stat-active"]');
  if (active) active.textContent = String(activeTasks().length);
  const speed = $('[data-field="stat-speed"]');
  if (speed) speed.textContent = fmtSpeed(totalSpeed());
}

/* ==========================================================================
   视图：实例
   ========================================================================== */

function viewInstances() {
  const list = [...state.instances].sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));

  return `
  <section class="view">
    <div class="view__head">
      <div>
        <p class="eyebrow">实例</p>
        <h1 class="view__title">每个版本一个目录</h1>
        <p class="view__sub">默认开启版本隔离，存档与配置互不影响；Mod、材质包与光影都装进各自的实例目录。</p>
      </div>
      <div class="view__actions">
        <button class="btn" type="button" data-action="route" data-route="mods">下载 Mod</button>
        <button class="btn btn--primary" type="button" data-action="install:open" data-version="${esc(VERSIONS[0].id)}">安装新版本</button>
      </div>
    </div>

    ${
      list.length
        ? `<div class="instance-grid">${list
            .map((instance) => {
              const java = javaForVersion(instance.versionId);
              const contentCount = installedContentOf(instance.id).length;
              const extraNames = (Array.isArray(instance.extras) ? instance.extras : []).map((id) => extraLabel(id));
              const planLabel = loaderLabel(loaderOf(instance)) + (extraNames.length ? " + " + extraNames.join(" + ") : "");
              return `
              <article class="instance">
                <div class="instance__head">
                  <div>
                    <p class="instance__name">${esc(instance.name)}</p>
                    <p class="instance__ver">${esc(instance.versionId)} · ${esc(planLabel)} · instances\\${esc(instance.versionId)}\\</p>
                  </div>
                  <span class="instance__thumb" aria-hidden="true">${esc(instance.versionId.split(".")[1] || "MC")}</span>
                </div>
                <div class="instance__meta">
                  <span>内存 <b>${instance.memoryMb} MB</b> · Java <b>${java ? java.version : "缺失"}</b></span>
                  <span>占用 <b>${fmtBytes(instance.sizeBytes)}</b> · 内容 <b>${contentCount} 项</b> · 上次启动 <b>${relTime(instance.lastPlayedAt)}</b></span>
                </div>
                <div class="instance__actions">
                  <button class="btn btn--primary" type="button" data-action="launch" data-id="${esc(instance.id)}">启动</button>
                  <button class="btn" type="button" data-action="dir" data-id="${esc(instance.id)}">目录</button>
                  <button class="btn" type="button" data-action="instance:edit" data-id="${esc(instance.id)}">配置</button>
                  <button class="btn btn--ghost" type="button" data-action="instance:delete" data-id="${esc(instance.id)}" aria-label="删除实例 ${esc(instance.name)}">删除</button>
                </div>
              </article>`;
            })
            .join("")}</div>`
        : `<div class="empty">
            <span class="empty__icon" aria-hidden="true">▣</span>
            <p class="empty__title">还没有实例</p>
            <p class="empty__text">安装一个原版版本后，这里会出现它的独立实例目录与启动配置。</p>
            <button class="btn btn--primary" type="button" data-action="install:open" data-version="${esc(VERSIONS[0].id)}">安装第一个版本</button>
          </div>`
    }

    <p class="faint" style="font-size:11.5px">模拟路径：${esc(installRoot())}\\instances\\&lt;版本名&gt;\\ · 不会写入真实磁盘</p>
  </section>`;
}

/* ==========================================================================
   视图：日志
   ========================================================================== */

function filteredLogs() {
  const { level, q } = ui.log;
  const keyword = q.trim().toLowerCase();
  return state.logs.filter((line) => {
    if (level !== "all" && line.level.toLowerCase() !== level) return false;
    if (keyword && !line.text.toLowerCase().includes(keyword)) return false;
    return true;
  });
}

function viewLogs() {
  const lines = filteredLogs();

  return `
  <section class="view">
    <div class="view__head">
      <div>
        <p class="eyebrow">日志与诊断</p>
        <h1 class="view__title">启动日志</h1>
        <p class="view__sub">${state.logs.length} 行日志；诊断只复制到剪贴板，不会上传。</p>
      </div>
      <div class="view__actions">
        <button class="btn" type="button" data-action="log:copy">复制日志</button>
        <button class="btn" type="button" data-action="log:save">另存为</button>
      </div>
    </div>

    ${
      state.diagnosis
        ? `<div class="diagnosis">
            <p class="diagnosis__title"><span aria-hidden="true">!</span>${esc(DIAGNOSIS.title)}</p>
            <div class="diagnosis__lines">${DIAGNOSIS.lines.map((line) => `<span>${esc(line)}</span>`).join("")}</div>
            <ul class="diagnosis__actions">${DIAGNOSIS.actions.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
            <div class="diagnosis__foot">
              <button class="btn btn--sm" type="button" data-action="log:diagnose">复制诊断信息</button>
              <button class="btn btn--sm btn--ghost" type="button" data-action="route" data-route="instances">去调内存</button>
            </div>
          </div>`
        : ""
    }

    <div>
      <div class="logtoolbar">
        <div class="seg" role="group" aria-label="按级别过滤">
          ${["all", "info", "warn", "error"]
            .map(
              (level) =>
                `<button class="seg__btn" type="button" data-action="log:level" data-level="${level}" aria-pressed="${ui.log.level === level}">${level === "all" ? "全部" : level.toUpperCase()}</button>`
            )
            .join("")}
        </div>
        <div class="logtoolbar__search">
          <input class="input input--search" type="search" placeholder="搜索日志内容" value="${esc(ui.log.q)}" data-log="q" aria-label="搜索日志内容">
        </div>
        <label class="switch">
          <input type="checkbox" data-log="follow" ${ui.log.follow ? "checked" : ""}>
          <span class="switch__track" aria-hidden="true"></span>
          <span class="switch__label">自动滚动</span>
        </label>
      </div>
      <div class="logbox" tabindex="0" role="log" aria-label="启动日志">
        ${
          lines.length
            ? lines
                .map(
                  (line) => `
          <div class="logline logline--${line.level.toLowerCase()}">
            <span class="logline__ts">${clockOf(line.ts)}</span>
            <span class="logline__level">${esc(line.level)}</span>
            <span class="logline__text">${esc(line.text)}</span>
          </div>`
                )
                .join("")
            : '<p class="faint" style="padding:16px">没有匹配的日志行。</p>'
        }
      </div>
    </div>

    <p class="faint" style="font-size:11.5px">环境：Windows 11 22631 · 启动器 0.1.0-demo · 实例 instances\\1.20.4\\ · 最后 3 次启动：成功 / 成功 / 崩溃</p>
  </section>`;
}

/* ==========================================================================
   视图：设置
   ========================================================================== */

function settingsDraft() {
  if (!ui.settingsDraft) ui.settingsDraft = clone(state.settings);
  return ui.settingsDraft;
}

function settingsDirty() {
  return ui.settingsDraft && JSON.stringify(ui.settingsDraft) !== JSON.stringify(state.settings);
}

function syncSaveBar() {
  const bar = $("#savebar");
  if (!bar) return;
  bar.hidden = !settingsDirty();
}

/** 保存条默认只是一个安静的小条，改完路径要它自己跳出来提醒一次 */
function flashSaveBar() {
  const bar = $("#savebar");
  // 没有未保存的改动时不硬把保存条翻出来，否则「有未保存的修改」就成了假话
  if (!bar || bar.hidden) return;
  bar.classList.remove("is-flash");
  // 连续两次选目录时，强制重排才能让动画重新播放
  void bar.offsetWidth;
  bar.classList.add("is-flash");
  setTimeout(() => bar.classList.remove("is-flash"), 1600);
}

/* 安装路径：统一成 Windows 风格，再做一遍合法性判断。
   判断结果直接当界面文案用，避免只说「格式错误」。 */
function normalizeInstallPath(value) {
  return String(value == null ? "" : value)
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\{2,}/g, "\\")
    .replace(/\\+$/, "");
}

function installPathIssue(value) {
  const path = normalizeInstallPath(value);
  if (!path) return "安装路径不能为空";
  if (path.length > 120) return "路径太长，上限 120 个字符";
  if (!/^[A-Za-z]:/.test(path)) return "请写成 Windows 绝对路径，例如 D:\\Games\\Minecraft";
  if (!/^[A-Za-z]:\\/.test(path)) return "请给到具体目录，不要停在盘符根目录";
  if (/[<>:"|?*]/.test(path.slice(2))) return '路径里不能出现 < > : " | ? * 这些字符';
  if (path.split("\\").some((segment) => segment === "." || segment === "..")) return "路径里不能包含 . 或 .. 片段";
  if (path.split("\\").some((segment) => /[. ]$/.test(segment))) return "目录名不能以点或空格结尾";
  return "";
}

/** 展示用的根目录：旧存档或被人手改坏了就回落到演示默认值 */
function installRoot() {
  const path = normalizeInstallPath(state.settings.installPath);
  return installPathIssue(path) ? DEMO_ROOT : path;
}

function instancePath(versionId) {
  return `${installRoot()}\\instances\\${versionId}`;
}

/** 取盘符：换盘这件事对用户来说比完整路径更需要被看见 */
function driveOf(path) {
  const matched = /^([A-Za-z]):/.exec(path || "");
  return matched ? matched[1].toUpperCase() : "";
}

/** 「改了但没保存」要说清改成什么、下一步点哪里，不能只丢一个一闪而过的 toast */
function pathChangeNote(path) {
  const saved = normalizeInstallPath(state.settings.installPath);
  if (!path || installPathIssue(path) || path === saved) return "";
  const from = driveOf(saved);
  const to = driveOf(path);
  const diskPart = from && to && from !== to ? `磁盘从 ${from} 盘换到 ${to} 盘，` : "";
  return `已改为 ${path}（尚未保存）：${diskPart}点「立即保存」或顶部「保存修改」后，新实例才装到这里。`;
}

/** 弹窗里换一块盘时，把「改成什么、还差一步保存」写在单选项下方，而不是等点确定才提示 */
function pathLiveNote(picked, saved) {
  if (normalizeInstallPath(picked) === saved) return "与已保存的路径一致，不用再点保存。";
  const from = driveOf(saved);
  const to = driveOf(picked);
  const tail = from && to && from !== to ? `已有实例仍在 ${from} 盘，不会跟着搬到 ${to} 盘。` : "已有实例不会自动搬家。";
  return "选定后还要点设置页的「保存修改」才生效；" + tail;
}

function syncPathLive(picked) {
  const saved = normalizeInstallPath(state.settings.installPath);
  const path = normalizeInstallPath(picked);
  const live = $("[data-path-live]");
  const label = $("[data-path-live-label]");
  const pathEl = $("[data-path-live-path]");
  const noteEl = $("[data-path-live-note]");
  if (!live || !pathEl || !noteEl) return;
  if (label) label.textContent = path === saved ? "当前生效的路径" : "将改为";
  pathEl.textContent = path;
  noteEl.textContent = pathLiveNote(path, saved);
  live.classList.toggle("is-changed", path !== saved);
}

/** 输入路径时就地更新提示，不整页重渲染，避免光标被打断 */
function syncPathHint() {
  const draft = settingsDraft();
  const hint = $("[data-path-hint]");
  const chip = $("[data-path-chip]");
  if (!hint) return;
  const path = normalizeInstallPath(draft.installPath);
  const issue = installPathIssue(path);
  hint.textContent = issue || "新实例会装到 " + path + "\\instances\\<版本>\\；已有实例留在原处，不会自动搬家。";
  if (chip) chip.hidden = !issue;
  const note = $("[data-path-note]");
  if (note) {
    const text = pathChangeNote(path);
    note.hidden = !text;
    const noteText = $("[data-path-note-text]", note);
    if (text && noteText) noteText.textContent = text;
  }
}

function viewSettings() {
  const draft = settingsDraft();
  const usage = state.instances.reduce((sum, item) => sum + item.sizeBytes, 0);
  const pathValue = normalizeInstallPath(draft.installPath);
  const pathIssue = installPathIssue(pathValue);
  const pathHint = pathIssue || "新实例会装到 " + pathValue + "\\instances\\<版本>\\；改完记得保存。";
  const pathNote = pathChangeNote(pathValue);
  const memoryOptions = [1024, 2048, 3072, 4096, 6144, 8192, 12288];

  return `
  <section class="view">
    <div class="view__head">
      <div>
        <p class="eyebrow">设置</p>
        <h1 class="view__title">启动器设置</h1>
        <p class="view__sub">改动先留在草稿里，点「保存修改」才写入本地存储。</p>
      </div>
    </div>

    <div class="settings">
      <div class="savebar" id="savebar" ${settingsDirty() ? "" : "hidden"}>
        <span class="savebar__text">有未保存的修改</span>
        <button class="btn btn--ghost btn--sm" type="button" data-action="setting:revert">放弃</button>
        <button class="btn btn--primary btn--sm" type="button" data-action="setting:save">保存修改</button>
      </div>

      <section class="panel">
        <div class="panel__head"><p class="panel__title">通用</p></div>
        <div class="panel__body">
          <div class="row">
            <div class="row__text">
              <span class="row__title">主题</span>
              <span class="row__desc">深色 / 浅色 / 跟随系统，切换后立即预览。</span>
            </div>
            <div class="row__control">
              <div class="seg" role="group" aria-label="主题">
                ${[
                  ["dark", "深色"],
                  ["light", "浅色"],
                  ["auto", "跟随系统"],
                ]
                  .map(
                    ([value, label]) =>
                      `<button class="seg__btn" type="button" data-action="setting:theme" data-value="${value}" aria-pressed="${draft.theme === value}">${label}</button>`
                  )
                  .join("")}
              </div>
            </div>
          </div>
          <div class="row">
            <div class="row__text">
              <span class="row__title">语言</span>
              <span class="row__desc">本期只有中文，切换语言留到 v1。</span>
            </div>
            <div class="row__control">
              <select class="select" data-setting="language" aria-label="语言">
                <option value="zh-CN" selected>简体中文</option>
                <option value="en-US" disabled>English（未实现）</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <p class="panel__title">下载</p>
          <p class="panel__desc">演示阶段不发起真实请求，但这些设置会影响假进度的速度与并发。</p>
        </div>
        <div class="panel__body">
          <div class="row">
            <div class="row__text">
              <span class="row__title">默认下载源</span>
              <span class="row__desc">自动模式按延迟与成功率挑主源，另一个作为备用源。</span>
            </div>
            <div class="row__control">
              <select class="select" data-setting="mirror" aria-label="默认下载源">
                <option value="auto" ${draft.mirror === "auto" ? "selected" : ""}>自动（推荐）</option>
                ${state.mirrors
                  .filter((mirror) => mirror.baseUrl)
                  .map(
                    (mirror) =>
                      `<option value="${esc(mirror.id)}" ${draft.mirror === mirror.id ? "selected" : ""}>${esc(mirror.name)}</option>`
                  )
                  .join("")}
              </select>
            </div>
          </div>
          <div class="row">
            <div class="row__text">
              <span class="row__title">并发文件数</span>
              <span class="row__desc">1～16；调高会让单任务速度被摊薄。</span>
            </div>
            <div class="row__control">
              <input class="input" type="number" min="1" max="16" step="1" value="${draft.concurrency}" data-setting="concurrency" aria-label="并发文件数">
            </div>
          </div>
          <div class="row">
            <div class="row__text">
              <span class="row__title">限速</span>
              <span class="row__desc">只限制总带宽，不改变并发数。</span>
            </div>
            <div class="row__control">
              <select class="select" data-setting="limitMbps" aria-label="限速">
                ${[0, 5, 10, 20]
                  .map(
                    (value) =>
                      `<option value="${value}" ${Number(draft.limitMbps) === value ? "selected" : ""}>${value === 0 ? "不限速" : value + " MB/s"}</option>`
                  )
                  .join("")}
              </select>
            </div>
          </div>
          <div class="row">
            <div class="row__text">
              <span class="row__title">保留取消任务的临时文件</span>
              <span class="row__desc">关闭时，取消任务会清掉已下载的分片。</span>
            </div>
            <div class="row__control">
              <label class="switch">
                <input type="checkbox" data-setting="keepTemp" ${draft.keepTemp ? "checked" : ""}>
                <span class="switch__track" aria-hidden="true"></span>
                <span class="switch__label">${draft.keepTemp ? "保留" : "不保留"}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head"><p class="panel__title">启动</p></div>
        <div class="panel__body">
          <div class="row">
            <div class="row__text">
              <span class="row__title">默认内存</span>
              <span class="row__desc">不超过物理内存（16 GB）的 70%，即 ${Math.round(PHYSICAL_MEMORY_MB * 0.7)} MB。</span>
            </div>
            <div class="row__control">
              <select class="select" data-setting="defaultMemoryMb" aria-label="默认内存">
                ${memoryOptions
                  .map(
                    (value) =>
                      `<option value="${value}" ${Number(draft.defaultMemoryMb) === value ? "selected" : ""}>${value} MB</option>`
                  )
                  .join("")}
              </select>
            </div>
          </div>
          <div class="row">
            <div class="row__text">
              <span class="row__title">默认窗口尺寸</span>
              <span class="row__desc">${draft.fullscreen ? "已开启全屏启动，窗口尺寸只作为退出全屏后的回退值。" : "游戏窗口的初始大小，可在实例里单独改。"}</span>
            </div>
            <div class="row__control">
              <select class="select" data-setting="windowSize" aria-label="默认窗口尺寸">
                ${["1280x720", "1600x900", "1920x1080", "2560x1440"]
                  .map(
                    (value) =>
                      `<option value="${value}" ${draft.windowSize === value ? "selected" : ""}>${value.replace("x", " × ")}</option>`
                  )
                  .join("")}
              </select>
            </div>
          </div>
          <div class="row">
            <div class="row__text">
              <span class="row__title">全屏模式启动</span>
              <span class="row__desc">开启后游戏直接以全屏运行；日志与启动检查会标出「全屏」。</span>
            </div>
            <div class="row__control">
              <label class="switch">
                <input type="checkbox" data-setting="fullscreen" ${draft.fullscreen ? "checked" : ""}>
                <span class="switch__track" aria-hidden="true"></span>
                <span class="switch__label">${draft.fullscreen ? "全屏" : "窗口化"}</span>
              </label>
            </div>
          </div>
          <div class="row">
            <div class="row__text">
              <span class="row__title">Java 版本</span>
              <span class="row__desc">推荐模式按游戏版本自动挑 Java 8 / 17 / 21；指定后每次启动都用这个运行时。未安装的版本不可选。</span>
            </div>
            <div class="row__control">
              <select class="select" data-setting="javaId" aria-label="Java 版本">
                <option value="auto" ${draft.javaId === "auto" || !draft.javaId ? "selected" : ""}>使用推荐 Java（自动匹配）</option>
                ${JAVA_RUNTIMES.map((java) => {
                  const installed = Boolean(state.javaInstalled[java.id]);
                  return `<option value="${esc(java.id)}" ${draft.javaId === java.id ? "selected" : ""} ${installed ? "" : "disabled"}>Java ${java.major} · ${esc(java.vendor)} ${esc(java.version)}${installed ? "" : "（未安装）"}</option>`;
                }).join("")}
              </select>
            </div>
          </div>
          <div class="row">
            <div class="row__text">
              <span class="row__title">显示日志窗口</span>
              <span class="row__desc">启动后浮出日志窗口，可随时关闭。</span>
            </div>
            <div class="row__control">
              <label class="switch">
                <input type="checkbox" data-setting="showLogWindow" ${draft.showLogWindow ? "checked" : ""}>
                <span class="switch__track" aria-hidden="true"></span>
                <span class="switch__label">${draft.showLogWindow ? "显示" : "不显示"}</span>
              </label>
            </div>
          </div>
          <div class="row">
            <div class="row__text">
              <span class="row__title">版本隔离</span>
              <span class="row__desc">每个版本使用独立目录；本期固定开启，不允许关闭。</span>
            </div>
            <div class="row__control">
              <label class="switch">
                <input type="checkbox" checked disabled>
                <span class="switch__track" aria-hidden="true"></span>
                <span class="switch__label">已开启</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <p class="panel__title">存储</p>
          <p class="panel__desc">安装路径只影响之后新建的实例；已有实例留在原目录，不会自动搬家。</p>
        </div>
        <div class="panel__body">
          <div class="row row--path">
            <div class="row__text">
              <span class="row__title">默认安装路径</span>
              <span class="row__desc">
                <span id="install-path-hint" data-path-hint>${esc(pathHint)}</span>
                <span class="chip chip--warn" data-path-chip ${pathIssue ? "" : "hidden"}>待修正</span>
              </span>
            </div>
            <div class="row__control row__control--path">
              <input class="input input--path mono" type="text" value="${esc(typeof draft.installPath === "string" && draft.installPath ? draft.installPath : DEMO_ROOT)}" data-setting="installPath" aria-label="默认安装路径" aria-describedby="install-path-hint" spellcheck="false" autocomplete="off">
              <button class="btn btn--sm" type="button" data-action="path:browse">浏览…</button>
              <button class="btn btn--sm" type="button" data-action="path:reset">恢复默认</button>
            </div>
            <p class="pathnote" data-path-note ${pathNote ? "" : "hidden"}>
              <span class="pathnote__mark" aria-hidden="true">!</span>
              <span class="pathnote__text" data-path-note-text>${esc(pathNote)}</span>
              <button class="btn btn--primary btn--sm" type="button" data-action="setting:save">立即保存</button>
            </p>
          </div>
          <div class="row">
            <div class="row__text">
              <span class="row__title">实例占用</span>
              <span class="row__desc">${state.instances.length} 个实例，共 ${fmtBytes(usage)}；模拟磁盘剩余 ${fmtBytes(state.diskFree)}。</span>
            </div>
            <div class="row__control">
              <button class="btn btn--sm" type="button" data-action="dir">打开目录</button>
              <button class="btn btn--sm" type="button" data-action="storage:clean">清理缓存</button>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head"><p class="panel__title">关于</p></div>
        <div class="panel__body">
          <dl class="kv">
            <dt>版本号</dt><dd>0.1.0-demo</dd>
            <dt>运行平台</dt><dd>Windows 10 / 11 x64（仅此一档）</dd>
            <dt>开源许可</dt><dd>MIT（演示版，不含游戏本体）</dd>
            <dt>镜像来源</dt><dd>Mojang 官方 + 用户可配置镜像</dd>
            <dt>演示声明</dt><dd>演示数据 · 不会真正下载或启动游戏</dd>
          </dl>
        </div>
      </section>
    </div>
  </section>`;
}

/* ==========================================================================
   安装向导
   ========================================================================== */

const WIZARD_STEPS = ["选版本", "选下载源", "确认开始"];

function wizardBody() {
  const wiz = ui.wizard;
  if (!wiz) return "";
  const version = versionOf(wiz.versionId);
  const installed = installedSet().has(version.id);

  const steps = `
    <div class="steps">
      ${WIZARD_STEPS.map((label, index) => {
        const num = index + 1;
        const cls = num === wiz.step ? "is-active" : num < wiz.step ? "is-done" : "";
        return `<span class="step ${cls}"><span class="step__num">${num}</span>${label}</span>${
          num < WIZARD_STEPS.length ? '<span class="step__bar" aria-hidden="true"></span>' : ""
        }`;
      }).join("")}
    </div>`;

  if (wiz.step === 1) {
    return (
      steps +
      `<div class="wizard__choice" role="radiogroup" aria-label="选择版本">
        ${VERSIONS.slice(0, 12)
          .map(
            (item) => `
          <label class="choice ${item.id === version.id ? "is-checked" : ""}">
            <input type="radio" name="wizard-version" value="${esc(item.id)}" data-wizard="version" ${item.id === version.id ? "checked" : ""}>
            <span class="choice__radio" aria-hidden="true"></span>
            <span class="choice__main">
              <span class="choice__title">${esc(item.id)}
                ${installedSet().has(item.id) ? '<span class="chip chip--ok">已安装</span>' : ""}
                ${item.type === "release" ? "" : `<span class="chip">${TYPE_LABEL[item.type]}</span>`}
              </span>
              <span class="choice__sub">${TYPE_LABEL[item.type]} · ${esc(item.releasedAt)} · 需要 Java ${item.javaMajor}</span>
            </span>
            <span class="choice__side">${fmtBytes(item.sizeBytes)}<br>${item.fileCount} 个文件</span>
          </label>`
          )
          .join("")}
      </div>
      ${
        installed
          ? `<div class="notice notice--warn"><strong>该版本已安装。</strong><span>继续会重新校验并覆盖版本文件，saves/ 与 config/ 保留；也可以直接打开已有实例。</span></div>`
          : ""
      }`
    );
  }

  if (wiz.step === 2) {
    const alive = state.mirrors.filter((mirror) => mirror.status !== "down" && mirror.baseUrl);
    const picked = pickSources(state.mirrors);
    return (
      steps +
      `<div class="wizard__choice" role="radiogroup" aria-label="选择下载源">
        <label class="choice ${wiz.sourceMode === "auto" ? "is-checked" : ""}">
          <input type="radio" name="wizard-source" value="auto" data-wizard="source" data-mode="auto" ${wiz.sourceMode === "auto" ? "checked" : ""}>
          <span class="choice__radio" aria-hidden="true"></span>
          <span class="choice__main">
            <span class="choice__title">自动选择 <span class="chip chip--ok">推荐</span></span>
            <span class="choice__sub">主源 ${esc(picked.primary ? picked.primary.name : "无")}；备用源 ${esc(picked.backup ? picked.backup.name : "无")}</span>
          </span>
          <span class="choice__side">${picked.primary ? picked.primary.latencyMs + " ms" : "—"}</span>
        </label>
        ${alive
          .map(
            (mirror) => `
          <label class="choice ${wiz.sourceMode === mirror.id ? "is-checked" : ""}">
            <input type="radio" name="wizard-source" value="${esc(mirror.id)}" data-wizard="source" data-mode="${esc(mirror.id)}" ${wiz.sourceMode === mirror.id ? "checked" : ""}>
            <span class="choice__radio" aria-hidden="true"></span>
            <span class="choice__main">
              <span class="choice__title">${esc(mirror.name)} ${mirror.status === "unstable" ? '<span class="chip chip--warn">不稳定</span>' : ""}</span>
              <span class="choice__sub">${esc(mirror.baseUrl)}</span>
            </span>
            <span class="choice__side">${mirror.latencyMs} ms<br>${(mirror.throughputMbps || 0).toFixed(1)} MB/s</span>
          </label>`
          )
          .join("")}
        ${state.mirrors
          .filter((mirror) => !mirror.baseUrl)
          .map(
            (mirror) => `
          <label class="choice" style="opacity:.55;cursor:not-allowed">
            <input type="radio" name="wizard-source" value="${esc(mirror.id)}" disabled>
            <span class="choice__radio" aria-hidden="true"></span>
            <span class="choice__main">
              <span class="choice__title">${esc(mirror.name)} <span class="chip chip--muted">未配置</span></span>
              <span class="choice__sub">演示版不允许填自定义地址</span>
            </span>
            <span class="choice__side">—</span>
          </label>`
          )
          .join("")}
      </div>
      ${
        state.scenario === "mirror-down"
          ? `<div class="notice notice--danger"><strong>所有下载源都连不上。</strong><span>探测阶段全部超时，暂时无法开始安装；可以换源或稍后重试。</span></div>`
          : ""
      }`
    );
  }

  const picked = wiz.sourceMode === "auto" ? pickSources(state.mirrors) : null;
  const sourceId = wiz.sourceMode === "auto" ? (picked.primary ? picked.primary.id : null) : wiz.sourceMode;
  const source = state.mirrors.find((mirror) => mirror.id === sourceId);
  const backup = picked ? picked.backup : null;
  const throughput = source && source.throughputMbps > 0 ? source.throughputMbps * MB : 800 * 1024;
  const estimate = Math.round(version.sizeBytes / throughput);
  const need = Math.round(version.sizeBytes * 1.2);
  const enough = state.diskFree >= need;

  return (
    steps +
    `<div class="summary">
      <div class="summary__row"><span class="summary__key">版本</span><span class="summary__val">${esc(version.id)} · ${TYPE_LABEL[version.type]}</span></div>
      <div class="summary__row"><span class="summary__key">下载源</span><span class="summary__val">${esc(source ? source.name : "无可用源")}${backup ? "（备用 " + esc(backup.name) + "）" : ""}</span></div>
      <div class="summary__row"><span class="summary__key">文件数 / 总大小</span><span class="summary__val">${version.fileCount} 个 · ${fmtBytes(version.sizeBytes)}</span></div>
      <div class="summary__row"><span class="summary__key">预计耗时</span><span class="summary__val">${fmtEta(estimate)}</span></div>
      <div class="summary__row"><span class="summary__key">目标目录</span><span class="summary__val" title="${esc(instancePath(version.id))}">…\\instances\\${esc(version.id)}\\</span></div>
      <div class="summary__row"><span class="summary__key">磁盘剩余</span><span class="summary__val">${fmtBytes(state.diskFree)}</span></div>
      <div class="summary__row"><span class="summary__key">加载器</span><span class="summary__val">无（仅原版）<button class="linkbtn" type="button" data-action="wizard:options">去选加载器 / 高清修复</button></span></div>
    </div>
    ${
      !enough
        ? `<div class="notice notice--danger"><strong>磁盘空间不足。</strong><span>还需要 ${fmtBytes(need - state.diskFree)} 才能开始安装。</span></div>`
        : ""
    }
    ${
      installedSet().has(version.id)
        ? `<div class="notice notice--warn"><strong>${esc(version.id)} 已安装。</strong><span>本次是重新安装：覆盖版本文件，不改动 saves/ 与 config/。</span></div>`
        : ""
    }
    <p class="faint" style="font-size:11.5px">演示路径不会写入磁盘；安装完成后会自动检测 Java。</p>`
  );
}

function openWizard(versionId) {
  ui.wizard = { step: 1, versionId: versionId || VERSIONS[0].id, sourceMode: state.settings.mirror === "auto" ? "auto" : state.settings.mirror };
  renderWizard();
}

function renderWizard() {
  const wiz = ui.wizard;
  if (!wiz) return;
  const version = versionOf(wiz.versionId);

  let foot = "";
  if (wiz.step === 1) {
    const existing = instanceOfVersion(version.id);
    foot =
      `<span class="grow">选一个原版版本，已安装的版本会标注出来。</span>` +
      (existing ? `<button class="btn btn--ghost" type="button" data-action="wizard:open-existing">打开已有实例</button>` : "") +
      `<button class="btn btn--primary" type="button" data-action="wizard:next">下一步</button>`;
  } else if (wiz.step === 2) {
    foot =
      `<span class="grow">自动模式会探测一次延迟，选出主源与备用源。</span>` +
      `<button class="btn" type="button" data-action="wizard:prev">上一步</button>` +
      `<button class="btn btn--primary" type="button" data-action="wizard:next">下一步</button>`;
  } else {
    const blocked = state.scenario === "mirror-down" && wiz.sourceMode === "auto";
    foot =
      `<span class="grow">开始后可以在下载中心暂停、继续或取消。</span>` +
      `<button class="btn" type="button" data-action="wizard:prev">上一步</button>` +
      `<button class="btn btn--primary" type="button" data-action="wizard:start" ${blocked ? "disabled" : ""}>开始安装</button>`;
  }

  openModal({ title: "安装原版 " + version.id, body: wizardBody(), foot: foot, wide: true });
}

/* ==========================================================================
   启动前检查
   ========================================================================== */

function preflight(instance) {
  const version = versionOf(instance.versionId);
  const java = javaForVersion(instance.versionId);
  const pinned = pinnedJava();
  const account = selectedAccount();
  const memoryOk = instance.memoryMb >= 1024 && instance.memoryMb <= PHYSICAL_MEMORY_MB * 0.7;
  // 只有离线账号的名字是本地可改的游戏内 ID，微软与第三方由认证方保证合法
  const nameOk = Boolean(account) && (account.type === "offline" ? /^[A-Za-z0-9_]{3,16}$/.test(account.name) : true);
  const versionOk = instanceOfVersion(instance.versionId) !== null;

  const javaDetail = () => {
    if (java) {
      return `检测到 ${java.vendor} ${java.version}（x64）· ${java.path} · ${pinned ? "设置里指定" : "自动匹配"}`;
    }
    if (pinned && !state.javaInstalled[pinned.id]) {
      return `设置里指定的 Java ${pinned.major} 未检测到。改回「使用推荐 Java」，或重新安装这个运行时。`;
    }
    if (pinned) {
      return `设置里指定的 Java ${pinned.major} 低于该版本需要的 Java ${version.javaMajor}。改回自动匹配，或换一个不低于 ${version.javaMajor} 的运行时。`;
    }
    return `需要 Java ${version.javaMajor}，本机只找到 ${JAVA_RUNTIMES.filter((item) => state.javaInstalled[item.id])
      .map((item) => "Java " + item.major)
      .join(" / ") || "无"}。下载一个 JRE ${version.javaMajor}（约 45MB）就能继续。`;
  };

  return [
    {
      id: "files",
      ok: versionOk,
      title: "版本文件完整",
      detail: versionOk ? `清单比对通过：${version.fileCount} 个文件与版本 JSON 一致` : "版本文件缺失，需要重新安装该版本",
    },
    {
      id: "java",
      ok: Boolean(java),
      title: "Java 可用且版本匹配",
      detail: javaDetail(),
      fix: java ? null : pinned ? "settings" : "java",
    },
    {
      id: "memory",
      ok: memoryOk,
      title: "内存设置合理",
      detail: memoryOk
        ? `已分配 ${instance.memoryMb} MB，物理内存 16 GB，比例 ${((instance.memoryMb / PHYSICAL_MEMORY_MB) * 100).toFixed(0)}%`
        : `已分配 ${instance.memoryMb} MB，需在 1024～${Math.round(PHYSICAL_MEMORY_MB * 0.7)} MB 之间`,
      fix: memoryOk ? null : "memory",
    },
    { id: "disk", ok: true, title: "目标目录可写", detail: `${instancePath(instance.versionId)}\\（演示路径，不会写入）` },
    {
      id: "account",
      ok: nameOk,
      title: account && account.type !== "offline" ? "账号已登录" : "离线用户名合法",
      detail: !account
        ? "还没有选择账号，先在主页「当前账号」里选一个"
        : account.type === "offline"
          ? nameOk
            ? `使用离线账号 ${account.name}，UUID 由用户名派生（3～16 位字母数字下划线）`
            : `当前离线 ID「${account.name}」不符合 ^[A-Za-z0-9_]{3,16}$，回主页改一个`
          : account.type === "microsoft"
            ? `已登录微软账号 ${account.name}（演示态）；名称随账号同步，启动器内不可修改`
            : `已通过${account.provider || "外置登录"}登录 ${account.name}（演示态）；名称由服务器同步，不可修改`,
    },
  ];
}

function openLaunch(instanceId) {
  const instance = state.instances.find((item) => item.id === instanceId);
  if (!instance) {
    toast("这个实例已经不存在了", "warn");
    return;
  }
  ui.launching = { instanceId: instance.id, downloading: false, progress: 0 };
  renderLaunchModal();
}

function renderLaunchModal() {
  const launch = ui.launching;
  if (!launch) return;
  const instance = state.instances.find((item) => item.id === launch.instanceId);
  if (!instance) {
    closeModal();
    return;
  }
  const checks = preflight(instance);
  const allOk = checks.every((check) => check.ok);
  const java = javaForVersion(instance.versionId);
  const version = versionOf(instance.versionId);

  const body = `
    <div class="summary">
      <div class="summary__row"><span class="summary__key">实例</span><span class="summary__val">${esc(instance.name)} · ${esc(instance.versionId)}</span></div>
      <div class="summary__row"><span class="summary__key">内存 / 显示</span><span class="summary__val">${instance.memoryMb} MB · ${state.settings.fullscreen ? "全屏" : esc(instance.windowSize || "1280x720")}</span></div>
      <div class="summary__row"><span class="summary__key">目录</span><span class="summary__val">instances\\${esc(instance.versionId)}\\</span></div>
    </div>
    <div class="checklist">
      ${checks
        .map(
          (check) => `
        <div class="checkitem ${check.ok ? "is-ok" : "is-bad"}">
          <span class="checkitem__mark" aria-hidden="true">${check.ok ? "✓" : "✕"}</span>
          <span>
            <span class="checkitem__title">${esc(check.title)}</span><br>
            <span class="checkitem__detail">${esc(check.detail)}</span>
          </span>
          ${
            check.fix === "java" && !launch.downloading
              ? `<button class="btn btn--sm" type="button" data-action="java:download" data-version="${esc(version.id)}" data-major="${version.javaMajor}">下载 JRE ${version.javaMajor}</button>`
              : check.fix === "settings"
                ? `<button class="btn btn--sm" type="button" data-action="fix:settings">去设置</button>`
                : check.fix === "memory"
                  ? `<button class="btn btn--sm" type="button" data-action="instance:edit" data-id="${esc(instance.id)}">改内存</button>`
                  : `<span></span>`
          }
        </div>`
        )
        .join("")}
    </div>
    ${
      launch.downloading
        ? `<div class="task__verify">
            <span>正在下载 JRE ${version.javaMajor}（模拟）· ${Math.round(launch.progress)}%</span>
            <div class="bar bar--thin"><i style="width:${launch.progress}%"></i></div>
          </div>`
        : ""
    }
    ${
      allOk
        ? ""
        : `<div class="notice notice--warn"><strong>有检查项未通过，启动按钮已禁用。</strong><span>先处理标红的项，再点启动；演示里也可以切换「Java 缺失」场景复现。</span></div>`
    }`;

  openModal({
    title: "启动前检查",
    body: body,
    foot:
      `<span class="grow">${allOk && java ? "将使用 " + esc(java.vendor) + " " + esc(java.version) : "检查通过后才能启动"}</span>` +
      `<button class="btn" type="button" data-action="modal:close">取消</button>` +
      `<button class="btn btn--primary" type="button" data-action="launch:confirm" data-id="${esc(instance.id)}" ${allOk ? "" : "disabled"}>启动游戏</button>`,
  });
}

/* ==========================================================================
   动作：任务
   ========================================================================== */

function createTask(versionId, sourceId, plan) {
  const version = versionOf(versionId);
  const addons = plan ? planAddons(plan) : [];
  const extraBytes = addons.reduce((sum, addon) => sum + addon.size, 0);
  const task = {
    id: "task-" + Date.now().toString(36),
    kind: "version",
    itemId: version.id,
    versionId: version.id,
    source: sourceId,
    status: "queued",
    phase: "download",
    totalBytes: version.sizeBytes + extraBytes,
    doneBytes: 0,
    fileDone: 0,
    speedBps: 0,
    retries: 0,
    error: null,
    createdAt: Date.now(),
    // 加载器与附加组件的文件由引擎追加在版本文件之后，完成时写进实例
    loader: plan ? plan.loader : "vanilla",
    extras: plan ? plan.extras.slice() : [],
    addons,
  };
  state.tasks.unshift(task);
  return task;
}

function createContentTask(item, instanceId) {
  const task = {
    id: "task-" + Date.now().toString(36),
    kind: item.kind,
    itemId: item.id,
    instanceId: instanceId || null,
    name: item.name,
    source: "modrinth",
    status: "queued",
    phase: "download",
    totalBytes: item.sizeBytes,
    doneBytes: 0,
    fileDone: 0,
    speedBps: 0,
    retries: 0,
    error: null,
    createdAt: Date.now(),
  };
  state.tasks.unshift(task);
  return task;
}

function installVersion(task) {
  const version = versionOf(task.versionId);
  const loader = task.loader || "vanilla";
  const extras = Array.isArray(task.extras) ? task.extras.slice() : [];
  const existing = instanceOfVersion(version.id);

  // 「一个版本一个实例」：重装可以换加载器与附加组件，但复用同一个目录，存档不受影响
  if (existing) {
    existing.loader = loader;
    existing.extras = extras;
    if (task.totalBytes) existing.sizeBytes = task.totalBytes;
    return existing;
  }

  const java = javaForVersion(version.id);
  const instance = {
    id: "inst-" + Date.now().toString(36),
    name: (loader === "vanilla" ? "原版 " : loaderLabel(loader) + " ") + version.id,
    versionId: version.id,
    loader,
    extras,
    memoryMb: state.settings.defaultMemoryMb,
    javaId: java ? java.id : null,
    windowSize: state.settings.windowSize,
    isolated: true,
    sizeBytes: task.totalBytes || version.sizeBytes,
    installedAt: Date.now(),
    lastPlayedAt: null,
  };
  state.instances.push(instance);
  return instance;
}

/** 内容下载完成：写进目标实例，整合包则新建实例 */
function installContent(task) {
  const item = contentOf(task.itemId);
  if (!item) return null;

  if (item.kind === "modpack") {
    // 同名的包再次安装时新建第二个实例，避免覆盖已有存档
    let name = item.name;
    let suffix = 2;
    while (state.instances.some((instance) => instance.name === name)) {
      name = item.name + " #" + suffix;
      suffix += 1;
    }
    const java = javaForVersion(item.mcVersion);
    const instance = {
      id: "inst-" + Date.now().toString(36),
      name,
      versionId: item.mcVersion,
      loader: item.loader,
      memoryMb: state.settings.defaultMemoryMb,
      javaId: java ? java.id : null,
      windowSize: state.settings.windowSize,
      isolated: true,
      sizeBytes: item.sizeBytes,
      installedAt: Date.now(),
      lastPlayedAt: null,
    };
    state.instances.push(instance);
    state.content.push({
      id: "content-" + Date.now().toString(36),
      itemId: item.id,
      kind: item.kind,
      instanceId: instance.id,
      installedAt: Date.now(),
      sizeBytes: item.sizeBytes,
    });
    return instance;
  }

  if (!task.instanceId || !state.instances.some((instance) => instance.id === task.instanceId)) return null;
  if (state.content.some((entry) => entry.itemId === item.id && entry.instanceId === task.instanceId)) return null;
  state.content.push({
    id: "content-" + Date.now().toString(36),
    itemId: item.id,
    kind: item.kind,
    instanceId: task.instanceId,
    installedAt: Date.now(),
    sizeBytes: item.sizeBytes,
  });
  return state.instances.find((instance) => instance.id === task.instanceId);
}

function handleEvents(events) {
  for (const event of events) {
    const task = event.task;
    const isContent = isContentTask(task);
    const label = targetLabel(task);
    if (event.type === "started") {
      appendLog("INFO", "[launcher/INFO] 开始下载 " + label + "，源 " + contentSourceName(task.source));
    } else if (event.type === "verify") {
      appendLog("INFO", "[launcher/INFO] " + label + " 下载完成，开始校验 " + targetOf(task).fileCount + " 个文件");
    } else if (event.type === "done") {
      if (isContent) {
        const instance = installContent(task);
        if (instance) task.instanceId = instance.id;
        appendLog("INFO", "[launcher/INFO] " + label + " 校验通过，已写入 " + CONTENT_KINDS[task.kind].dir + "/");
        toast(instance ? label + " 已装到「" + instance.name + "」" : label + " 安装完成");
      } else {
        const instance = installVersion(task);
        const planNote = [
          task.loader && task.loader !== "vanilla" ? loaderLabel(task.loader) : "",
          ...(task.extras || []).map((id) => extraLabel(id)),
        ]
          .filter(Boolean)
          .join(" + ");
        appendLog("INFO", "[launcher/INFO] " + label + " 校验通过，已写入版本 JSON" + (planNote ? "，并装上 " + planNote : ""));
        toast(label + (planNote ? "（" + planNote + "）" : "") + " 安装完成，可以打开了");
        if (instance && route === "version") ui.plan = defaultPlan(instance.versionId);
      }
      if (route === "downloads" || CONTENT_ROUTES.includes(route)) render();
    } else if (event.type === "retrying") {
      appendLog("WARN", "[launcher/WARN] " + label + " 校验失败，第 " + task.retries + " 次重新下载");
    } else if (event.type === "failed") {
      appendLog("ERROR", "[launcher/ERROR] " + label + " 校验连续失败 3 次，任务终止");
      toast(label + " 校验连续失败 3 次，任务已终止", "danger");
    }
  }
  if (events.length && (route === "downloads" || route === "home")) updateChrome();
}

function appendLog(level, text) {
  state.logs.push({ id: "log-" + Date.now() + Math.random().toString(16).slice(2), ts: Date.now(), level, text });
  if (state.logs.length > 400) state.logs = state.logs.slice(-400);
  if (route === "logs") render();
}

/* ==========================================================================
   动作分发
   ========================================================================== */

const actions = {
  "route": (el) => go(el.dataset.route),

  "taskpop:toggle": () => {
    const pop = $("#taskpop");
    if (!pop) return;
    if (pop.hidden) openTaskpop();
    else closeTaskpop();
  },

  "taskpop:close": () => closeTaskpop(),

  "nav:toggle": () => {
    const group = $("#nav-download");
    setNavOpen(group.dataset.open !== "true");
  },

  "install:open": (el) => openWizard(el.dataset.version),

  "content:install": (el) => openContentInstall(el.dataset.id),

  "content:detail": (el) => openContentDetail(el.dataset.id),

  "content:reset": () => {
    ui.content = { q: "", mc: "all", loader: "all", category: "all", sort: "popular", installedOnly: false };
    render();
  },

  "content:install-confirm": (el) => {
    const item = contentOf(el.dataset.id);
    const install = ui.install;
    if (!item || !install) return;
    const instance = state.instances.find((entry) => entry.id === install.instanceId) || null;
    if (item.kind !== "modpack" && !(instance && contentCompat(item, instance).ok)) {
      toast("先选一个兼容的实例", "danger");
      return;
    }
    if (state.diskFree < item.sizeBytes) {
      toast("磁盘空间不足，无法开始下载", "danger");
      return;
    }
    createContentTask(item, item.kind === "modpack" ? null : instance.id);
    closeModal();
    go("downloads");
    toast("已开始下载 " + item.name + "（假进度）");
  },

  "content:add-loader": (el) => {
    const instance = state.instances.find((entry) => entry.id === el.dataset.instance);
    if (!instance) return;
    instance.loader = el.dataset.loader;
    if (ui.install) ui.install.instanceId = instance.id;
    save();
    renderContentInstall();
    toast("已给「" + instance.name + "」标记 " + loaderLabel(instance.loader) + " 加载器（演示）");
  },

  "content:uninstall": (el) => {
    const entry = state.content.find((item) => item.id === el.dataset.id);
    if (!entry) return;
    const item = contentOf(entry.itemId);
    openModal({
      title: "卸载「" + (item ? item.name : "内容") + "」？",
      body: `<p class="muted" style="font-size:13px">会从「${esc(instanceName(entry.instanceId))}」移除这项 ${esc(CONTENT_KINDS[entry.kind].label)}，实例本身与存档不受影响。</p>
        <div class="notice notice--warn"><strong>演示版只改界面状态。</strong><span>不会真的删除 ${esc(CONTENT_KINDS[entry.kind].dir)}\\ 下的文件。</span></div>`,
      foot: `<span class="grow">重新安装可以再装回来</span>
        <button class="btn" type="button" data-action="modal:close">返回</button>
        <button class="btn btn--danger" type="button" data-action="content:uninstall-confirm" data-id="${esc(entry.id)}">卸载</button>`,
    });
  },

  "content:uninstall-confirm": (el) => {
    const entry = state.content.find((item) => item.id === el.dataset.id);
    const item = entry ? contentOf(entry.itemId) : null;
    state.content = state.content.filter((row) => row.id !== el.dataset.id);
    save();
    closeModal();
    render();
    toast("已卸载" + (item ? "「" + item.name + "」" : "内容"));
  },

  "version:open": (el) => {
    ui.selectedVersionId = el.dataset.version;
    openVersionPage(el.dataset.version);
  },

  "plan:back": () => go("versions"),

  "plan:start": () => {
    const plan = ui.plan;
    if (!plan) return;
    const { version, addons, totalBytes } = planTotals(plan);
    if (state.diskFree < totalBytes * 1.2) {
      toast("磁盘空间不足，无法开始安装", "danger");
      return;
    }
    if (state.scenario === "mirror-down" && plan.sourceMode === "auto") {
      toast("所有下载源都连不上，换源后再试", "danger");
      return;
    }
    const picked = plan.sourceMode === "auto" ? pickSources(state.mirrors) : null;
    const sourceId = plan.sourceMode === "auto" ? (picked && picked.primary ? picked.primary.id : "bmclapi") : plan.sourceMode;
    createTask(version.id, sourceId, plan);
    const label = loaderOptionOf(plan.loader).id === "vanilla" ? version.id : loaderLabel(plan.loader) + " " + version.id;
    go("downloads");
    toast("已开始安装 " + label + (addons.length ? "（含 " + addons.length + " 项）" : "") + "（假进度）");
  },

  "wizard:options": () => {
    if (!ui.wizard) return;
    const versionId = ui.wizard.versionId;
    closeModal();
    openVersionPage(versionId);
  },

  "filter:type": (el) => {
    const type = el.dataset.type;
    if (ui.filters.types.has(type)) ui.filters.types.delete(type);
    else ui.filters.types.add(type);
    render();
  },

  "wizard:next": () => {
    ui.wizard.step = Math.min(3, ui.wizard.step + 1);
    renderWizard();
  },

  "wizard:prev": () => {
    ui.wizard.step = Math.max(1, ui.wizard.step - 1);
    renderWizard();
  },

  "wizard:open-existing": () => {
    const instance = instanceOfVersion(ui.wizard.versionId);
    closeModal();
    if (instance) openLaunch(instance.id);
  },

  "wizard:start": () => {
    const wiz = ui.wizard;
    const version = versionOf(wiz.versionId);
    if (state.diskFree < version.sizeBytes * 1.2) {
      toast("磁盘空间不足，无法开始安装", "danger");
      return;
    }
    if (state.scenario === "mirror-down") {
      toast("所有下载源都连不上，换源后再试", "danger");
      return;
    }
    const picked = wiz.sourceMode === "auto" ? pickSources(state.mirrors) : null;
    const sourceId = wiz.sourceMode === "auto" ? (picked.primary ? picked.primary.id : "bmclapi") : wiz.sourceMode;
    createTask(version.id, sourceId);
    closeModal();
    go("downloads");
    toast("已开始安装 " + version.id + "（假进度）");
  },

  "task:pause": (el) => {
    const task = state.tasks.find((item) => item.id === el.dataset.id);
    if (!task) return;
    task.status = "paused";
    task.speedBps = 0;
    save();
    render();
  },

  "task:resume": (el) => {
    const task = state.tasks.find((item) => item.id === el.dataset.id);
    if (!task) return;
    if (task.phase === "verify" || task.phase === "finishing" || task.phase === "paused") {
      task.phase = "download";
      const rt = runtime.get(task.id);
      if (rt) rt.verifyStart = 0;
      if (task.doneBytes >= task.totalBytes) task.doneBytes = task.totalBytes - Math.round(task.totalBytes * 0.02);
    }
    task.status = "running";
    task.error = null;
    save();
    render();
  },

  "task:retry": (el) => {
    const task = state.tasks.find((item) => item.id === el.dataset.id);
    if (!task) return;
    const rt = runtime.get(task.id) || {};
    rt.manualRetry = true;
    runtime.set(task.id, rt);
    task.status = "running";
    task.phase = "download";
    task.error = null;
    save();
    render();
    toast("已重新排队 " + targetLabel(task));
  },

  "task:cancel": (el) => {
    const task = state.tasks.find((item) => item.id === el.dataset.id);
    if (!task) return;
    openModal({
      title: "取消这个任务？",
      body: `<p class="muted" style="font-size:13px">将停止 ${esc(targetLabel(task))} 的下载，已下载 ${fmtBytes(task.doneBytes)}。</p>
        <label class="switch"><input type="checkbox" checked data-cancel="keep"><span class="switch__track" aria-hidden="true"></span><span class="switch__label">保留已下载的临时文件（下次可续传）</span></label>
        <p class="faint" style="font-size:11.5px">演示版不会真的删除文件；这个选择只影响提示文案。</p>`,
      foot: `<span class="grow">取消后可以在下载中心重新开始</span>
        <button class="btn" type="button" data-action="modal:close">返回</button>
        <button class="btn btn--danger" type="button" data-action="task:cancel-confirm" data-id="${esc(task.id)}">确认取消</button>`,
    });
  },

  "task:cancel-confirm": (el) => {
    const index = state.tasks.findIndex((item) => item.id === el.dataset.id);
    if (index >= 0) {
      const [task] = state.tasks.splice(index, 1);
      runtime.delete(task.id);
      appendLog("WARN", "[launcher/WARN] 用户取消了 " + targetLabel(task) + " 的下载任务");
      toast("已取消 " + targetLabel(task) + " 的下载");
    }
    closeModal();
    render();
  },

  "task:remove": (el) => {
    state.tasks = state.tasks.filter((item) => item.id !== el.dataset.id);
    save();
    render();
  },

  "launch": (el) => {
    if (!el.dataset.id) {
      toast("先安装一个版本，再启动", "warn");
      return;
    }
    openLaunch(el.dataset.id);
  },

  "fix:settings": () => {
    closeModal();
    go("settings");
  },

  "launch:confirm": (el) => {
    const instance = state.instances.find((item) => item.id === el.dataset.id);
    if (!instance) return;
    instance.lastPlayedAt = Date.now();
    ui.runningGame = { instanceId: instance.id, startedAt: Date.now() };
    closeModal();
    toast("游戏已启动（演示）· 日志窗口已浮出");
    appendLog(
      "INFO",
      "[main/INFO] 启动实例 " +
        instance.name +
        "（" +
        instance.versionId +
        "），账号 " +
        (selectedAccount() ? selectedAccount().name : "未登录") +
        "，内存 " +
        instance.memoryMb +
        "MB" +
        (state.settings.fullscreen ? "，全屏模式" : "，窗口 " + (instance.windowSize || "1280x720"))
    );
    setTimeout(() => {
      appendLog("INFO", "[main/INFO] 游戏已退出（演示），本次时长 32 分钟");
      toast("游戏已退出（演示）· 本次时长 32 分钟");
      ui.runningGame = null;
      updateChrome();
    }, 1800);
    save();
    updateChrome();
    render();
  },

  "dir": (el) => {
    const instance = el.dataset.id ? state.instances.find((item) => item.id === el.dataset.id) : state.instances[0];
    const path = instance ? instancePath(instance.versionId) : installRoot();
    toast("演示路径：" + path + "（不会打开资源管理器）");
  },

  "open-instance": (el) => {
    const instance = instanceOfVersion(el.dataset.version);
    if (instance) openLaunch(instance.id);
  },

  "instance:edit": (el) => {
    const instance = state.instances.find((item) => item.id === el.dataset.id);
    if (!instance) return;
    openModal({
      title: "实例配置 · " + instance.name,
      body: `
        <div class="field">
          <label class="field__label" for="inst-memory">内存（MB）</label>
          <input class="input" id="inst-memory" type="number" min="1024" max="${Math.round(PHYSICAL_MEMORY_MB * 0.7)}" step="512" value="${instance.memoryMb}" data-instance="memory">
          <span class="field__hint">上限 ${Math.round(PHYSICAL_MEMORY_MB * 0.7)} MB（物理内存的 70%）</span>
        </div>
        <div class="field">
          <label class="field__label" for="inst-window">窗口尺寸</label>
          <select class="select" id="inst-window" data-instance="windowSize">
            ${["1280x720", "1600x900", "1920x1080", "2560x1440"]
              .map(
                (value) =>
                  `<option value="${value}" ${instance.windowSize === value ? "selected" : ""}>${value.replace("x", " × ")}</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="row">
          <div class="row__text">
            <span class="row__title">版本隔离</span>
            <span class="row__desc">目录 instances\\${esc(instance.versionId)}\\，存档与配置独立。</span>
          </div>
          <div class="row__control">
            <label class="switch">
              <input type="checkbox" checked disabled>
              <span class="switch__track" aria-hidden="true"></span>
              <span class="switch__label">固定开启</span>
            </label>
          </div>
        </div>
        <div class="field">
          <span class="field__label">已安装内容 · ${installedContentOf(instance.id).length} 项</span>
          ${
            installedContentOf(instance.id).length
              ? `<ul style="display:grid;gap:6px">
                  ${installedContentOf(instance.id)
                    .map((entry) => {
                      const content = contentOf(entry.itemId);
                      if (!content) return "";
                      return `<li class="row">
                        <span class="row__text">
                          <span class="row__title">${esc(content.name)}</span>
                          <span class="row__desc">${esc(CONTENT_KINDS[entry.kind].label)} · ${esc(content.version)} · ${fmtBytes(entry.sizeBytes)}</span>
                        </span>
                        <span class="row__control">
                          <button class="btn btn--sm btn--ghost" type="button" data-action="content:uninstall" data-id="${esc(entry.id)}">卸载</button>
                        </span>
                      </li>`;
                    })
                    .join("")}
                </ul>`
              : `<span class="field__hint">还没有内容。到「下载 → Mod / 材质包 / 光影」挑一项装进来。</span>`
          }
        </div>
        <details>
          <summary class="muted" style="cursor:pointer;font-size:12px">高级：JVM 参数</summary>
          <p class="faint" style="margin-top:6px;font-size:11.5px">演示版不写入真实参数；v1 会在这里追加 -XX 参数。</p>
        </details>`,
      foot: `<span class="grow">改动只影响这个实例</span>
        <button class="btn" type="button" data-action="modal:close">取消</button>
        <button class="btn btn--primary" type="button" data-action="instance:save" data-id="${esc(instance.id)}">保存</button>`,
    });
  },

  "instance:save": (el) => {
    const instance = state.instances.find((item) => item.id === el.dataset.id);
    if (!instance) return;
    const memory = Number($("#inst-memory").value);
    if (!Number.isFinite(memory) || memory < 1024 || memory > PHYSICAL_MEMORY_MB * 0.7) {
      toast("内存需在 1024～" + Math.round(PHYSICAL_MEMORY_MB * 0.7) + " MB 之间", "danger");
      return;
    }
    instance.memoryMb = memory;
    instance.windowSize = $("#inst-window").value;
    save();
    closeModal();
    render();
    toast("实例配置已保存");
  },

  "instance:delete": (el) => {
    const instance = state.instances.find((item) => item.id === el.dataset.id);
    if (!instance) return;
    openModal({
      title: "删除实例「" + instance.name + "」？",
      body: `<p class="muted" style="font-size:13px">会从书架移除 ${esc(instance.versionId)} 的实例，并清除它的启动进度。</p>
        <label class="switch"><input type="checkbox" data-delete="saves"><span class="switch__track" aria-hidden="true"></span><span class="switch__label">同时删除该实例的存档（saves/）</span></label>
        <div class="notice notice--danger"><strong>不可撤销。</strong><span>演示版只改界面状态，不会真的删文件。</span></div>`,
      foot: `<span class="grow">其他实例不受影响</span>
        <button class="btn" type="button" data-action="modal:close">取消</button>
        <button class="btn btn--danger" type="button" data-action="instance:delete-confirm" data-id="${esc(instance.id)}">删除</button>`,
    });
  },

  "instance:delete-confirm": (el) => {
    const instance = state.instances.find((item) => item.id === el.dataset.id);
    state.instances = state.instances.filter((item) => item.id !== el.dataset.id);
    if (instance && ui.selectedVersionId === instance.versionId) {
      ui.selectedVersionId = state.instances[0] ? state.instances[0].versionId : VERSIONS[0].id;
    }
    save();
    closeModal();
    render();
    toast("已删除实例" + (instance ? "「" + instance.name + "」" : ""));
  },

  "java:download": (el) => {
    const major = Number(el.dataset.major);
    const java = JAVA_RUNTIMES.find((item) => item.major === major);
    if (!java || !ui.launching) return;
    ui.launching.downloading = true;
    ui.launching.progress = 0;
    renderLaunchModal();
    const timer = setInterval(() => {
      // 用户中途关掉对话框时就把计时器停掉，别在空对象上继续加
      if (!ui.launching) {
        clearInterval(timer);
        return;
      }
      ui.launching.progress += 12 + Math.random() * 16;
      if (ui.launching.progress >= 100) {
        clearInterval(timer);
        state.javaInstalled[java.id] = true;
        ui.launching.downloading = false;
        save();
        appendLog("INFO", "[launcher/INFO] 已安装 JRE " + java.version + "（演示）");
        renderLaunchModal();
        toast("JRE " + major + " 安装完成（演示）");
      } else {
        renderLaunchModal();
      }
    }, 420);
  },

  "mirror:test": () => {
    toast("正在探测镜像延迟…");
    setTimeout(() => {
      state.mirrors = probeMirrors(state);
      save();
      render();
      const primary = pickSources(state.mirrors).primary;
      toast(primary ? "主源：" + primary.name + " · " + primary.latencyMs + " ms" : "所有源都不可用", primary ? undefined : "danger");
    }, 700);
  },

  "log:level": (el) => {
    ui.log.level = el.dataset.level;
    render();
  },

  "log:copy": async () => {
    const text = filteredLogs()
      .map((line) => clockOf(line.ts) + " " + line.level + " " + line.text)
      .join("\n");
    await copyText(text);
    toast("已复制 " + filteredLogs().length + " 行日志");
  },

  "log:diagnose": async () => {
    const text =
      "镜界 0.1.0-demo 诊断信息\n" +
      "系统：Windows 11 22631 x64\n" +
      "Java：Temurin 17.0.13 (x64)\n" +
      "实例：instances\\1.20.4\\\n" +
      "分配内存：4096 MB\n" +
      "结论：" + DIAGNOSIS.title + "\n\n" +
      state.logs
        .slice(-80)
        .map((line) => clockOf(line.ts) + " " + line.level + " " + line.text)
        .join("\n");
    await copyText(text);
    toast("诊断信息已复制到剪贴板（未上传）");
  },

  "log:save": () => {
    const lines = filteredLogs();
    if (!lines.length) {
      toast("当前没有可保存的日志", "warn");
      return;
    }
    const text = lines.map((line) => clockOf(line.ts) + " " + line.level + " " + line.text).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jingjie-log-demo.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("已另存为 jingjie-log-demo.txt（本地生成）");
  },

  "account:open": () => {
    const chipOf = (account) =>
      account.type === "offline"
        ? '<span class="chip">离线</span>'
        : account.type === "microsoft"
          ? '<span class="chip chip--info">微软 · 演示</span>'
          : '<span class="chip chip--warn">第三方 · 演示</span>';
    const subOf = (account) => {
      if (account.type === "offline") return "UUID " + esc(account.uuid.slice(0, 18)) + "… · 游戏内 ID 可在主页修改";
      if (account.type === "microsoft") return "名称由微软账号同步，不可修改";
      return esc(account.provider || "外置登录服务器") + " · 名称由服务器同步，不可修改";
    };
    // 按微软 → 离线 → 第三方排序，和主页下拉的分组顺序保持一致
    const sorted = [...state.accounts].sort(
      (a, b) => (ACCOUNT_TYPE_ORDER[a.type] ?? 9) - (ACCOUNT_TYPE_ORDER[b.type] ?? 9)
    );
    openModal({
      title: "账号",
      body: `
        <div class="wizard__choice">
          ${sorted
            .map(
              (account) => `
            <label class="choice ${account.id === state.selectedAccountId ? "is-checked" : ""}">
              <input type="radio" name="account" value="${esc(account.id)}" data-account="select" ${account.id === state.selectedAccountId ? "checked" : ""}>
              <span class="choice__radio" aria-hidden="true"></span>
              <span class="choice__main">
                <span class="choice__title">${esc(account.name)} ${chipOf(account)}</span>
                <span class="choice__sub">${subOf(account)}</span>
              </span>
            </label>`
            )
            .join("")}
        </div>
        <div class="field">
          <label class="field__label" for="new-account">新增离线用户名</label>
          <input class="input" id="new-account" type="text" maxlength="16" placeholder="3～16 位字母、数字或下划线" data-account="new">
          <span class="field__hint">离线账号只在本机生成 UUID，不联网；名字就是游戏内 ID。</span>
        </div>
        <div class="notice notice--info"><strong>微软与第三方登录都是演示占位。</strong><span>真实授权需要应用注册、回调地址与外置登录服务器配置，本期不联网；这两类账号的名称由认证方下发，界面只读。</span></div>`,
      foot: `<span class="grow">账号切换只影响下次启动</span>
        <button class="btn" type="button" data-action="modal:close">关闭</button>
        <button class="btn btn--primary" type="button" data-action="account:add">添加离线账号</button>`,
    });
  },

  "account:add": () => {
    const input = $("#new-account");
    const name = input ? input.value.trim() : "";
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      toast("用户名需为 3～16 位字母、数字或下划线", "danger");
      input.focus();
      return;
    }
    if (state.accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) {
      toast("这个用户名已经在列表里了", "warn");
      return;
    }
    const id = "acc-offline-" + Date.now().toString(36);
    state.accounts.push({ id, type: "offline", name, uuid: offlineUuid(name) });
    state.selectedAccountId = id;
    save();
    closeModal();
    updateChrome();
    render();
    toast("已添加离线账号 " + name);
  },

  "setting:theme": (el) => {
    const draft = settingsDraft();
    draft.theme = el.dataset.value;
    applyTheme(draft.theme);
    $$('[data-action="setting:theme"]').forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.value === draft.theme ? "true" : "false");
    });
    syncSaveBar();
  },

  "setting:save": () => {
    const draft = settingsDraft();
    const concurrency = Number(draft.concurrency);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
      toast("并发数需要是 1～16 的整数", "danger");
      return;
    }
    const memory = Number(draft.defaultMemoryMb);
    if (!Number.isFinite(memory) || memory < 1024 || memory > PHYSICAL_MEMORY_MB * 0.7) {
      toast("默认内存需在 1024～" + Math.round(PHYSICAL_MEMORY_MB * 0.7) + " MB 之间", "danger");
      return;
    }
    draft.concurrency = concurrency;
    draft.defaultMemoryMb = memory;
    const javaId = draft.javaId || "auto";
    if (javaId !== "auto") {
      const java = JAVA_RUNTIMES.find((item) => item.id === javaId);
      if (!java) {
        toast("所选的 Java 运行时不在这台机器上，请重新选择", "danger");
        return;
      }
      if (!state.javaInstalled[java.id]) {
        toast("Java " + java.major + " 还没安装，先下载它或改回「使用推荐 Java」", "danger");
        return;
      }
    }
    draft.javaId = javaId;
    draft.fullscreen = Boolean(draft.fullscreen);
    const pathIssue = installPathIssue(draft.installPath);
    if (pathIssue) {
      toast(pathIssue, "danger");
      return;
    }
    draft.installPath = normalizeInstallPath(draft.installPath);
    state.settings = clone(draft);
    applyTheme(state.settings.theme);
    save();
    ui.settingsDraft = null;
    render();
    toast("设置已保存");
  },

  "setting:revert": () => {
    ui.settingsDraft = null;
    applyTheme(state.settings.theme);
    render();
    toast("已放弃未保存的修改");
  },

  "path:browse": () => {
    const draft = settingsDraft();
    const current = normalizeInstallPath(draft.installPath) || DEMO_ROOT;
    const saved = normalizeInstallPath(state.settings.installPath);
    const presets = INSTALL_PATH_PRESETS.slice();
    // 手填的路径不在候选里时也列出来，避免点「浏览」把它悄悄换掉
    if (!presets.some((item) => normalizeInstallPath(item.path) === current)) {
      presets.unshift({ id: "current", path: current, label: "当前填写的目录", desc: "你在设置页里手动输入的路径", tag: "当前" });
    }
    const rows = presets
      .map((item) => {
        const value = normalizeInstallPath(item.path);
        const checked = value === current;
        const isSaved = value === saved;
        const disk = driveOf(value);
        return `
            <label class="choice choice--wrap ${checked ? "is-checked" : ""}" data-path-row data-path-value="${esc(item.path)}">
              <input type="radio" name="path-choice" value="${esc(item.path)}" data-path-choice ${checked ? "checked" : ""}>
              <span class="choice__radio" aria-hidden="true"></span>
              <span class="choice__main">
                <span class="choice__title">${esc(item.label)}${disk ? ' <span class="chip chip--muted">' + esc(disk) + "</span>" : ""}${item.tag ? ' <span class="chip chip--ok">' + esc(item.tag) + "</span>" : ""}</span>
                <span class="choice__sub mono">${esc(item.path)}</span>
                <span class="choice__sub">${esc(item.desc)}</span>
              </span>
              <span class="choice__side">${isSaved ? "当前生效" : checked ? "当前填写" : ""}</span>
            </label>`;
      })
      .join("");
    openModal({
      title: "选择默认安装路径",
      body: `
        <p class="faint" style="font-size:11.5px;margin-bottom:10px">演示版不能唤起系统目录选择器，下面给几个常见位置；也可以关掉这里，直接在设置页手填路径。</p>
        <div class="wizard__choice" role="radiogroup" aria-label="候选安装目录">${rows}</div>
        <div class="pathlive ${current === saved ? "" : "is-changed"}" data-path-live role="status">
          <span class="pathlive__label" data-path-live-label>${current === saved ? "当前生效的路径" : "将改为"}</span>
          <span class="pathlive__path mono" data-path-live-path>${esc(current)}</span>
          <span class="pathlive__note" data-path-live-note>${esc(pathLiveNote(current, saved))}</span>
        </div>`,
      foot: `<button class="btn" type="button" data-action="modal:close">取消</button>
             <button class="btn btn--primary" type="button" data-action="path:pick">使用这个目录</button>`,
    });
  },

  "path:pick": () => {
    const picked = $("[data-path-choice]:checked");
    const draft = settingsDraft();
    const saved = normalizeInstallPath(state.settings.installPath);
    const path = normalizeInstallPath(picked ? picked.value : DEMO_ROOT);
    draft.installPath = picked ? picked.value : DEMO_ROOT;
    closeModal();
    render();
    if (path === saved) {
      toast("默认安装路径仍是 " + path + "，没有变化");
      return;
    }
    // 这里不再弹 toast：弹窗关掉后 toast 会正好压在刚出现的提示条与「立即保存」上，
    // 改成「闪一下保存条 + 常驻提示条 + 焦点落到立即保存」，信息更多也不遮挡
    flashSaveBar();
    // 焦点交给常驻提示里的「立即保存」，键盘用户不用再去找保存条
    const note = $("[data-path-note]");
    if (note && !note.hidden) {
      note.scrollIntoView({ block: "nearest" });
      const saveBtn = $('[data-action="setting:save"]', note);
      if (saveBtn) saveBtn.focus({ preventScroll: true });
    }
  },

  "path:reset": () => {
    const draft = settingsDraft();
    draft.installPath = DEMO_ROOT;
    const unchanged = normalizeInstallPath(state.settings.installPath) === normalizeInstallPath(DEMO_ROOT);
    render();
    toast(
      unchanged ? "默认路径本来就是 " + DEMO_ROOT : "已填回默认路径 " + DEMO_ROOT + "，还没保存",
      unchanged ? "" : "warn"
    );
  },

  "storage:clean": () => {
    toast("已清理日志与临时文件（演示，未删除任何内容）");
  },

  "java:installed": (el) => {
    state.javaInstalled[el.dataset.id] = true;
    save();
    render();
  },

  "dev:close": () => {
    $("#devpanel").hidden = true;
    $("#devbtn").setAttribute("aria-expanded", "false");
  },

  "dev:scenario": (el) => {
    applyScenario(el.dataset.scenario);
  },

  "dev:reset": () => {
    localStorage.removeItem(STORAGE_KEY);
    state = seedState();
    runtime.clear();
    applyTheme(state.settings.theme);
    route = "home";
    render();
    toast("演示数据已重置");
  },

  "dev:fresh": () => {
    localStorage.removeItem(STORAGE_KEY);
    state = seedState();
    runtime.clear();
    state.instances = [];
    state.tasks = [];
    state.content = [];
    state.logs = [];
    ui.selectedVersionId = VERSIONS[0].id;
    route = "home";
    render();
    toast("已模拟首次使用：没有实例、没有任务");
  },

  "modal:close": () => closeModal(),
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

/* ==========================================================================
   演示场景
   ========================================================================== */

function applyScenario(id) {
  state.scenario = id;
  if (id === "normal") {
    state.mirrors = clone(MIRRORS);
    state.javaInstalled = { "jre-8": true, "jre-17": true, "jre-21": false };
    state.diagnosis = false;
    toast("已切回正常网络");
  } else if (id === "slow") {
    state.mirrors = state.mirrors.map((mirror) =>
      mirror.baseUrl ? { ...mirror, latencyMs: 420, throughputMbps: 0.31, status: "unstable" } : mirror
    );
    toast("已切到慢速网络：速度约 300 KB/s", "warn");
  } else if (id === "mirror-down") {
    state.mirrors = state.mirrors.map((mirror) => ({ ...mirror, status: "down", latencyMs: null, throughputMbps: 0 }));
    toast("镜像不可用：所有探测都会超时", "danger");
  } else if (id === "checksum-fail") {
    state.mirrors = clone(MIRRORS);
    toast("校验失败场景：下一次安装会在 62% 处失败", "warn");
  } else if (id === "java-missing") {
    state.javaInstalled = { "jre-8": true, "jre-17": false, "jre-21": false };
    toast("已模拟 Java 17 缺失，启动检查会标红", "warn");
  } else if (id === "oom-crash") {
    state.logs = state.logs.concat(makeCrashLogs(Date.now()));
    state.diagnosis = true;
    route = "logs";
    toast("已注入一次 OOM 崩溃日志", "danger");
  }
  save();
  render();
  $("#devpanel").hidden = true;
  $("#devbtn").setAttribute("aria-expanded", "false");
}

/* ==========================================================================
   事件绑定
   ========================================================================== */

document.addEventListener("click", (event) => {
  // 窄窗口下点别处就收起下载浮层，避免它一直压着内容
  if (compactNav() && !event.target.closest("#nav-download")) setNavOpen(false);

  // 点面板与悬浮球之外的地方收起安装任务面板
  const pop = $("#taskpop");
  if (pop && !pop.hidden && !event.target.closest("#taskpop") && !event.target.closest("#taskball")) closeTaskpop();

  const closeTarget = event.target.closest("[data-close]");
  if (closeTarget) {
    closeModal();
    return;
  }

  const routeButton = event.target.closest("[data-route]");
  if (routeButton && !routeButton.closest("[data-action]")) {
    closeTaskpop();
    go(routeButton.dataset.route);
    return;
  }

  const el = event.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (actions[action]) {
    event.preventDefault();
    actions[action](el);
    return;
  }
  if (el.dataset.route) go(el.dataset.route);
});

document.addEventListener("change", (event) => {
  const target = event.target;

  // 候选目录卡片：单选圆点是隐藏的，不自己同步 is-checked 的话换盘看起来毫无反应
  if (target.matches("[data-path-choice]")) {
    const picked = normalizeInstallPath(target.value);
    $$("[data-path-row]").forEach((row) => {
      row.classList.toggle("is-checked", normalizeInstallPath(row.dataset.pathValue) === picked);
    });
    syncPathLive(picked);
    return;
  }

  if (target.dataset.filter === "installedOnly") {
    ui.filters.installedOnly = target.checked;
    render();
    return;
  }

  if (target.dataset.filter === "sort") {
    ui.filters.sort = target.value;
    render();
    return;
  }

  if (target.dataset.filter === "content-installedOnly") {
    ui.content.installedOnly = target.checked;
    render();
    return;
  }

  if (target.dataset.filter === "content-mc") {
    ui.content.mc = target.value;
    render();
    return;
  }

  if (target.dataset.filter === "content-loader") {
    ui.content.loader = target.value;
    render();
    return;
  }

  if (target.dataset.filter === "content-category") {
    ui.content.category = target.value;
    render();
    return;
  }

  if (target.dataset.filter === "content-sort") {
    ui.content.sort = target.value;
    render();
    return;
  }

  if (target.dataset.content === "instance") {
    if (ui.install) {
      ui.install.instanceId = target.value;
      renderContentInstall();
    }
    return;
  }

  if (target.dataset.plan === "source") {
    if (ui.plan) {
      ui.plan.sourceMode = target.value;
      normalizePlan();
      render();
    }
    return;
  }

  if (target.matches("[data-plan-loader]") && ui.plan) {
    ui.plan.loader = target.value;
    normalizePlan();
    render();
    // 重新渲染会重建整页，把焦点还给同一个单选项，键盘用户不用从头 Tab
    const next = $(`[data-plan-loader][value="${target.value}"]`);
    if (next) next.focus({ preventScroll: true });
    return;
  }

  if (target.matches("[data-plan-extra]") && ui.plan) {
    const id = target.value;
    const next = new Set(ui.plan.extras);
    if (target.checked) next.add(id);
    else next.delete(id);
    ui.plan.extras = Array.from(next);
    normalizePlan();
    render();
    // 依赖自动补齐后，原来那个开关可能变成禁用，焦点退回开关组
    const back = $(`[data-plan-extra][value="${id}"]`) || $("[data-plan-extra]");
    if (back) back.focus({ preventScroll: true });
    return;
  }

  if (target.dataset.wizard === "version") {
    ui.wizard.versionId = target.value;
    renderWizard();
    return;
  }

  if (target.dataset.wizard === "source") {
    ui.wizard.sourceMode = target.dataset.mode;
    renderWizard();
    return;
  }

  if (target.dataset.account === "pick") {
    const account = state.accounts.find((item) => item.id === target.value);
    if (!account) return;
    state.selectedAccountId = account.id;
    save();
    updateChrome();
    render();
    toast("已切换到" + accountTypeLabel(account) + " " + account.name);
    return;
  }

  if (target.dataset.account === "name") {
    const account = state.accounts.find((item) => item.id === target.dataset.id);
    if (!account) return;
    const name = target.value.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      toast("游戏内 ID 需为 3～16 位字母、数字或下划线", "danger");
      target.value = account.name;
      return;
    }
    if (state.accounts.some((item) => item.id !== account.id && item.name.toLowerCase() === name.toLowerCase())) {
      toast("这个 ID 已经被另一个账号占用", "warn");
      target.value = account.name;
      return;
    }
    account.name = name;
    account.uuid = offlineUuid(name);
    save();
    updateChrome();
    toast("离线游戏内 ID 已改为 " + name);
    return;
  }

  if (target.dataset.account === "select") {
    state.selectedAccountId = target.value;
    save();
    updateChrome();
    closeModal();
    render();
    toast("已切换到 " + target.value.replace("acc-", ""));
    return;
  }

  if (target.dataset.log === "follow") {
    ui.log.follow = target.checked;
    return;
  }

  if (target.dataset.setting) {
    const draft = settingsDraft();
    const key = target.dataset.setting;
    draft[key] = target.type === "checkbox" ? target.checked : target.value;
    if (key === "keepTemp" || key === "showLogWindow") {
      const label = target.parentElement.querySelector(".switch__label");
      if (label) {
        if (key === "keepTemp") label.textContent = target.checked ? "保留" : "不保留";
        else label.textContent = target.checked ? "显示" : "不显示";
      }
    }
    if (key === "fullscreen") {
      const row = target.closest(".row");
      const label = target.parentElement.querySelector(".switch__label");
      if (label) label.textContent = target.checked ? "全屏" : "窗口化";
      // 窗口尺寸那一行的说明随开关变化，避免用户以为全屏还要先调分辨率
      const desc = row && row.previousElementSibling ? row.previousElementSibling.querySelector(".row__desc") : null;
      if (desc) {
        desc.textContent = target.checked
          ? "已开启全屏启动，窗口尺寸只作为退出全屏后的回退值。"
          : "游戏窗口的初始大小，可在实例里单独改。";
      }
    }
    syncSaveBar();
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;

  if (target.dataset.filter === "q") {
    ui.filters.q = target.value;
    const caret = target.selectionStart;
    render();
    const next = $('[data-filter="q"]');
    if (next) {
      next.focus();
      next.setSelectionRange(caret, caret);
    }
    return;
  }

  if (target.dataset.log === "q") {
    ui.log.q = target.value;
    const caret = target.selectionStart;
    render();
    const next = $('[data-log="q"]');
    if (next) {
      next.focus();
      next.setSelectionRange(caret, caret);
    }
    return;
  }

  if (target.dataset.filter === "content-q") {
    ui.content.q = target.value;
    const caret = target.selectionStart;
    render();
    const next = $('[data-filter="content-q"]');
    if (next) {
      next.focus();
      next.setSelectionRange(caret, caret);
    }
    return;
  }

  if (target.dataset.setting) {
    const draft = settingsDraft();
    draft[target.dataset.setting] = target.type === "checkbox" ? target.checked : target.value;
    syncSaveBar();
    if (target.dataset.setting === "installPath") syncPathHint();
  }
});

document.addEventListener("keydown", (event) => {
  trapFocus(event);

  if (event.key === "Escape") {
    const modal = $("#modal");
    if (!modal.hidden) {
      closeModal();
      return;
    }
    const panel = $("#devpanel");
    if (!panel.hidden) {
      panel.hidden = true;
      $("#devbtn").setAttribute("aria-expanded", "false");
      return;
    }
    const pop = $("#taskpop");
    if (pop && !pop.hidden) {
      closeTaskpop();
      $("#taskball").focus({ preventScroll: true });
      return;
    }
    return;
  }

  // 版本表格：上下键换行，Enter 进入安装选项
  const row = event.target.closest('tr[data-action="version:open"]');
  if (row && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault();
    const rows = $$('tr[data-action="version:open"]');
    const index = rows.indexOf(row);
    const next = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) next.focus();
    return;
  }
  if (row && event.key === "Enter") {
    event.preventDefault();
    ui.selectedVersionId = row.dataset.version;
    openVersionPage(row.dataset.version);
  }
});

$("#devbtn").addEventListener("click", () => {
  const panel = $("#devpanel");
  panel.hidden = !panel.hidden;
  $("#devbtn").setAttribute("aria-expanded", panel.hidden ? "false" : "true");
});

// 演示场景面板内容
$("#devpanel-list").innerHTML = SCENARIOS.map(
  (scenario) => `
  <button class="scenario" type="button" data-action="dev:scenario" data-scenario="${esc(scenario.id)}" aria-pressed="false">
    <span class="scenario__name">${esc(scenario.name)}</span>
    <span class="scenario__desc">${esc(scenario.desc)}</span>
  </button>`
).join("");

const freshButton = document.createElement("button");
freshButton.type = "button";
freshButton.className = "btn btn--sm btn--block";
freshButton.dataset.action = "dev:fresh";
freshButton.textContent = "模拟首次使用（清空实例）";
$("#devpanel-list").appendChild(freshButton);

/* ==========================================================================
   主循环
   ========================================================================== */

function updateLiveStats() {
  updateChrome();
  if (route === "downloads") patchDownloads();
  const homeSpeed = $('[data-field="home-speed"]');
  if (homeSpeed) homeSpeed.textContent = fmtSpeed(totalSpeed());
}

let chromeTick = 0;

setInterval(() => {
  const events = stepTasks(state, runtime, Date.now());
  if (events.length) handleEvents(events);
  chromeTick += 1;
  // 进度条每 200ms 更新；导航与状态栏这类外围信息每秒刷一次就够
  if (route === "downloads") patchDownloads();
  if ($("#taskpop") && !$("#taskpop").hidden) updateTaskpop();
  if (chromeTick % 5 === 0) updateLiveStats();
  if (state.tasks.some((task) => task.status === "running")) saveSoon();
}, TICK_MS);

window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (state.settings.theme === "auto") applyTheme("auto");
});

save();
applyTheme(state.settings.theme);
render();
if (boot.restored > 0) {
  setTimeout(() => toast("已恢复上次的 " + boot.restored + " 个任务进度（已暂停）"), 400);
}
