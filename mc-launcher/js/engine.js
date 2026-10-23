/* ==========================================================================
   js/engine.js · 假下载引擎
   目标：让进度看起来像真的下载，但不发任何请求、不写任何文件。

   可信度来自四件事：
   1. 进度按字节推进（不是按百分比跳），文件计数由字节位置反查；
   2. 速度是「基线 × 包络 + 噪声」，会短暂掉到 0，不是直线；
   3. 每换一个文件有 50～150ms 的停顿时，避免像播放动画；
   4. 下完不是直接 100%，而是先校验、再停留 0.5 秒才算完成。
   ========================================================================== */

import { VERSIONS, CONTENT_KINDS, contentOf } from "./mock.js";

const MB = 1024 * 1024;
const PLAN_CACHE = new Map();

const GROUPS = [
  "com/mojang",
  "org/lwjgl",
  "com/google/guava",
  "io/netty",
  "org/apache/commons",
  "net/java/dev/jna",
  "com/github/oshi",
  "org/slf4j",
];

const ARTIFACTS = [
  "authlib",
  "brigadier",
  "datafixerupper",
  "logging",
  "blocklist",
  "text2speech",
  "glfw",
  "openal",
  "stb",
  "tinyfd",
  "joml",
  "guava",
  "gson",
  "netty-buffer",
  "netty-common",
  "jna",
  "oshi-core",
  "slf4j-api",
  "commons-lang3",
  "icu4j",
  "fastutil",
  "lwjgl-tinyfd",
];

const VERSIONS_OF_LIB = ["3.3.3", "32.1.2-jre", "1.1.2", "4.1.97", "5.13.0", "1.8.0", "2.2.0", "1.4.11"];

// 整合包里的 Mod 文件名池：只用于让「当前文件」看起来像真实整合包
const PACK_MOD_FILES = [
  "fabric-api-0.110.5+1.20.4.jar",
  "sodium-fabric-0.6.5+mc1.20.4.jar",
  "lithium-fabric-mc1.20.4-0.13.1.jar",
  "ferrite-core-6.0.1.jar",
  "indium-1.0.36+mc1.20.4.jar",
  "iris-mc1.20.4-1.8.1.jar",
  "continuity-3.0.0+1.20.4.jar",
  "entityculling-fabric-1.6.6-mc1.20.4.jar",
  "memoryleakfix-fabric-1.20.4-1.1.5.jar",
  "c2me-fabric-mc1.20.4-0.2.0.jar",
  "noisium-fabric-1.20.4-1.0.0.jar",
  "modernfix-fabric-5.18.0+mc1.20.4.jar",
  "modmenu-9.0.0.jar",
  "cloth-config-13.0.121-fabric.jar",
  "yacl-5.2.0+1.20.4-fabric.jar",
  "roughlyenoughitems-14.0.0.jar",
  "appleskin-fabric-mc1.20.4-2.5.1.jar",
  "jade-11.12.3+fabric.jar",
  "xaeros-minimap-24.6.1.jar",
  "xaeros-world-map-1.39.0.jar",
  "waystones-fabric-1.20.4-14.0.1.jar",
  "trinkets-3.8.0.jar",
  "patchouli-1.20.4-84-fabric.jar",
  "geckolib-fabric-4.4.7.jar",
  "architectury-11.1.17-fabric.jar",
  "balm-fabric-9.0.1.jar",
  "kubejs-fabric-2001.6.5-build.4.jar",
  "rhino-fabric-2001.3.0-build.4.jar",
];

function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function prng(seed) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hex(rand, length) {
  let out = "";
  for (let i = 0; i < length; i += 1) out += Math.floor(rand() * 16).toString(16);
  return out;
}

function makePath(kind, rand, version, index) {
  if (kind === "client") return "versions/" + version.id + "/" + version.id + ".jar";
  if (kind === "library") {
    const group = GROUPS[Math.floor(rand() * GROUPS.length)];
    const artifact = ARTIFACTS[Math.floor(rand() * ARTIFACTS.length)];
    const ver = VERSIONS_OF_LIB[Math.floor(rand() * VERSIONS_OF_LIB.length)];
    return "libraries/" + group + "/" + artifact + "/" + ver + "/" + artifact + "-" + ver + ".jar";
  }
  const first = hex(rand, 2);
  const rest = hex(rand, 38);
  return "assets/objects/" + first + "/" + first + rest;
}

/**
 * 内容清单：Mod / 整合包 / 材质包 / 光影。
 * 体积直接取数据里的真实大小，不再按权重随机，避免「1.3MB 的 Mod 下载 40 秒」。
 */
function contentPlan(item) {
  const entries = [];

  if (item.kind === "mod") {
    entries.push({ path: "mods/" + item.fileName, size: item.mainBytes });
    for (const dep of item.requires || []) {
      entries.push({ path: "mods/" + dep.fileName, size: dep.sizeBytes });
    }
  } else if (item.kind === "modpack") {
    // 整合包先取 manifest，再按列表逐个拉 mods；manifest 只有几 KB
    entries.push({ path: "modpacks/" + item.slug + "/manifest.json", size: 8 * 1024 });
    const rest = Math.max(0, item.sizeBytes - 8 * 1024);
    const count = Math.max(1, item.fileCount - 1);
    const rand = prng(hashOf(item.id));
    const weights = [];
    let weightSum = 0;
    for (let i = 0; i < count; i += 1) {
      const weight = 0.5 + rand() * 1.5;
      weights.push(weight);
      weightSum += weight;
    }
    let assigned = 0;
    for (let i = 0; i < count; i += 1) {
      const isLast = i === count - 1;
      const size = isLast ? rest - assigned : Math.round((weights[i] / weightSum) * rest);
      assigned += size;
      const pool = PACK_MOD_FILES[i % PACK_MOD_FILES.length];
      const name = i < PACK_MOD_FILES.length ? pool : item.slug + "-compat-" + (i - PACK_MOD_FILES.length + 1) + ".jar";
      entries.push({ path: "mods/" + name, size: Math.max(1024, size) });
    }
  } else {
    const dir = item.kind === "resourcepack" ? "resourcepacks/" : "shaderpacks/";
    entries.push({ path: dir + item.fileName, size: item.sizeBytes });
  }

  let cursor = 0;
  return entries.map((entry) => {
    cursor += entry.size;
    return { path: entry.path, size: entry.size, end: cursor, kind: item.kind };
  });
}

/**
 * 把下载目标拆成文件清单。
 * 版本：第一个是客户端 jar，其后约 18% 是库文件，剩下是资源文件，体积总和严格等于 sizeBytes。
 * 内容：Mod 带依赖文件，整合包是 manifest + 若干 Mod，材质包与光影是单个压缩包。
 */
export function filePlan(target) {
  const isContent = target.kind && target.kind !== "version";
  const key = isContent ? target.kind + ":" + target.id : target.planKey || target.id;
  if (PLAN_CACHE.has(key)) return PLAN_CACHE.get(key);
  if (isContent) {
    const plan = contentPlan(target);
    PLAN_CACHE.set(key, plan);
    return plan;
  }

  // 版本任务可以附带加载器与高清修复：它们排在版本文件之后，单独占文件与体积
  const addons = Array.isArray(target.addons) ? target.addons : [];
  const addonBytes = addons.reduce((sum, addon) => sum + Math.max(0, Number(addon.size) || 0), 0);
  const addonFiles = addons.reduce((sum, addon) => sum + Math.max(1, Number(addon.files) || 1), 0);
  const baseBytes = Math.max(64, (Number(target.sizeBytes) || 0) - addonBytes);
  const count = Math.max(1, (Number(target.fileCount) || 1) - addonFiles);

  const rand = prng(hashOf(target.id));
  const libraryEnd = 1 + Math.round(count * 0.18);
  const entries = [];
  let weightSum = 0;

  for (let i = 0; i < count; i += 1) {
    const kind = i === 0 ? "client" : i < libraryEnd ? "library" : "asset";
    const base = kind === "client" ? 60 : kind === "library" ? 14 : 1;
    const weight = base * (0.4 + rand() * 1.2);
    weightSum += weight;
    entries.push({ kind, weight, index: i });
  }

  const plan = [];
  let cursor = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const size = isLast
      ? Math.max(64, baseBytes - cursor)
      : Math.max(64, Math.round((entry.weight / weightSum) * baseBytes));
    const path = makePath(entry.kind, rand, target, i);
    cursor += size;
    plan.push({ path, size, end: cursor, kind: entry.kind });
  }

  for (const addon of addons) {
    const total = Math.max(0, Number(addon.size) || 0);
    const parts = Math.max(1, Number(addon.files) || 1);
    const basePath = addon.path || "libraries/" + (addon.id || "addon") + ".jar";
    for (let i = 0; i < parts; i += 1) {
      const size = i === parts - 1 ? total - Math.round((total / parts) * (parts - 1)) : Math.round(total / parts);
      const path = i === 0 ? basePath : basePath.replace(/\.jar$/, "-" + (i + 1) + ".jar");
      cursor += Math.max(0, size);
      plan.push({ path, size: Math.max(0, size), end: cursor, kind: "addon" });
    }
  }

  PLAN_CACHE.set(key, plan);
  return plan;
}

export function versionOf(versionId) {
  return VERSIONS.find((item) => item.id === versionId) || VERSIONS[0];
}

/** 任务对应的下载目标：版本任务取版本清单，内容任务取平台目录 */
export function targetOf(task) {
  if (task.kind && task.kind !== "version") return contentOf(task.itemId);
  const version = versionOf(task.versionId || task.itemId);
  const addons = Array.isArray(task.addons) ? task.addons.filter((addon) => addon && Number(addon.size) > 0) : [];
  if (!addons.length) return version;
  // 加载器与高清修复作为额外文件追加在版本文件之后；
  // planKey 让「同一版本装不同加载器」各自有一份清单缓存，不会互相覆盖。
  return {
    ...version,
    sizeBytes: Number(task.totalBytes) || version.sizeBytes,
    fileCount: version.fileCount + addons.reduce((sum, addon) => sum + Math.max(1, Number(addon.files) || 1), 0),
    addons,
    planKey: version.id + "@" + addons.map((addon) => addon.id || addon.path).join(","),
  };
}

/** 目标展示名：版本号，或内容的名字 */
export function targetLabel(task) {
  const target = targetOf(task);
  if (!target) return "未知内容";
  return task.kind && task.kind !== "version" ? target.name : target.id;
}


/** 已下载字节数落在第几个文件上（文件计数由字节反查，保证两条线不打架） */
export function fileCursor(task) {
  const target = targetOf(task);
  // 内容被下架或数据被改坏时没有文件清单：返回空游标，别让整页渲染跟着崩
  if (!target) return { index: 0, total: 0, entry: null };
  const plan = filePlan(target);
  const totalBytes = Number(task.totalBytes);
  const total = Number.isFinite(totalBytes) ? totalBytes : 0;
  const done = Math.min(Math.max(Number(task.doneBytes) || 0, 0), total);
  let low = 0;
  let high = plan.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (plan[mid].end <= done) low = mid + 1;
    else high = mid;
  }
  return { index: done >= total ? plan.length : low, total: plan.length, entry: plan[low] };
}

export function currentFile(task) {
  if (task.status === "done" || Number(task.doneBytes) >= Number(task.totalBytes)) return "已完成全部文件";
  const cursor = fileCursor(task);
  return cursor.entry ? cursor.entry.path : "";
}

/** 百分比上限 100、下限 0：脏数据（负进度、总量为 0、非数字）都不该画出负宽度或 NaN */
export function percentOf(task) {
  const total = Number(task.totalBytes);
  const done = Number(task.doneBytes);
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(done) || done <= 0) return 0;
  return Math.min(100, (done / total) * 100);
}

export function etaSeconds(task) {
  if (task.status !== "running" || task.speedBps < 1024) return null;
  return Math.max(0, (task.totalBytes - task.doneBytes) / task.speedBps);
}

function runtimeOf(runtime, id) {
  if (!runtime.has(id)) runtime.set(id, { speed: 0, samples: [], stallUntil: 0, dipUntil: 0, failArmed: false });
  return runtime.get(id);
}

const SCENARIO_SPEED = {
  slow: 0.32 * MB,
};

/**
 * 推进一帧。
 * @param {object} state 应用状态（读 settings / scenario，写 tasks）
 * @param {Map} runtime 每个任务的瞬时量（速度平滑、停顿、失败计时），不落 localStorage
 * @param {number} now 时间戳
 * @returns {Array} 事件列表：done / failed / retrying / started
 */
export function stepTasks(state, runtime, now) {
  const events = [];
  const settings = state.settings;
  const scenario = state.scenario;
  const limitBytes = settings.limitMbps > 0 ? settings.limitMbps * MB : Infinity;

  // 并发槽位：有空位就把排队任务提上来
  let running = state.tasks.filter((task) => task.status === "running");
  const queued = state.tasks.filter((task) => task.status === "queued");
  while (running.length < settings.concurrency && queued.length > 0) {
    const next = queued.shift();
    next.status = "running";
    events.push({ type: "started", task: next });
    running.push(next);
  }

  for (const task of running) {
    const rt = runtimeOf(runtime, task.id);
    const lastTick = rt.lastTick || now;
    const dt = Math.min(0.5, Math.max(0, (now - lastTick) / 1000));
    rt.lastTick = now;

    if (task.phase === "verify") {
      // 校验阶段单独一条进度，不与下载共用进度条
      const elapsed = now - (rt.verifyStart || now);
      rt.verifyDone = Math.min(1, elapsed / 1500);
      task.speedBps = 0;
      if (rt.verifyDone >= 1) {
        task.phase = "finishing";
        rt.finishAt = now;
      }
      continue;
    }

    if (task.phase === "finishing") {
      if (now - (rt.finishAt || now) >= 500) {
        task.phase = "done";
        task.status = "done";
        task.doneBytes = task.totalBytes;
        task.fileDone = filePlan(targetOf(task)).length;
        task.finishedAt = now;
        task.speedBps = 0;
        rt.samples = [];
        events.push({ type: "done", task });
      }
      continue;
    }

    if (task.status === "retrying") {
      if (now >= (rt.resumeAt || 0)) {
        task.status = "running";
        // 退回失败文件之前，重下这一段
        task.doneBytes = Math.max(0, task.doneBytes - Math.round(task.totalBytes * 0.018));
        rt.failArmed = false;
      } else {
        task.speedBps = 0;
        continue;
      }
    }

    // 速度：基线 × 包络 + 噪声，偶发短暂掉到 0
    const perTaskCap = Number.isFinite(limitBytes) ? limitBytes / Math.max(1, running.length) : Infinity;
    const isContent = Boolean(task.kind && task.kind !== "version");
    let base;
    if (isContent) {
      // 内容走 Modrinth / CurseForge 镜像，单文件速度明显低于版本文件，场景「慢速」再乘一次
      const kind = CONTENT_KINDS[task.kind];
      base = ((kind && kind.speedMbps) || 2) * MB;
      if (scenario === "slow") base *= 0.32;
    } else {
      base = SCENARIO_SPEED[scenario] || 11.4 * MB;
      const mirror = (state.mirrors || []).find((item) => item.id === task.source);
      if (mirror && mirror.throughputMbps > 0 && scenario !== "slow") base = mirror.throughputMbps * MB;
    }
    base = Math.min(base, perTaskCap);

    if (now < rt.stallUntil || now < rt.dipUntil) base = 0;
    else if (Math.random() < 0.012) rt.dipUntil = now + 250 + Math.random() * 500;

    const phase = hashOf(task.id) % 1000;
    const envelope = 1 + 0.28 * Math.sin(now / 1600 + phase) + (Math.random() - 0.5) * 0.12;
    const instant = Math.max(0, base * envelope);
    rt.speed = rt.speed * 0.72 + instant * 0.28;
    task.speedBps = Math.round(rt.speed);

    // 平滑速度按 3 秒滑动平均展示（这里用同样的近似，避免存整条曲线）
    rt.samples.push(task.speedBps);
    if (rt.samples.length > 15) rt.samples.shift();

    if (scenario === "checksum-fail" && !rt.manualRetry && !rt.failArmed) {
      if ((task.doneBytes + task.speedBps * dt) / task.totalBytes >= 0.62) {
        rt.failArmed = true;
        task.retries = (task.retries || 0) + 1;
        task.speedBps = 0;
        if (task.retries >= 3) {
          task.status = "failed";
          task.error = {
            kind: "checksum",
            title: "文件校验连续失败 3 次",
            detail: "下载完成的文件 SHA1 与清单不一致，已自动切到备用源重试 3 次仍未通过。",
            todo: "换一个下载源重试；若仍然失败，说明镜像上的文件本身损坏，请换源或稍后再试。",
          };
          events.push({ type: "failed", task });
        } else {
          task.status = "retrying";
          task.error = {
            kind: "checksum",
            title: "文件下载不完整，正在重新下载（第 " + task.retries + " 次）",
            detail: "SHA1 与清单不一致，已丢弃这个文件并从断点继续。",
            todo: "通常再试一次就能通过；连续 3 次失败会判定该源不可用。",
          };
          rt.resumeAt = now + 1500;
          events.push({ type: "retrying", task });
        }
        continue;
      }
    }

    const before = fileCursor(task).index;
    task.doneBytes = Math.min(task.totalBytes, task.doneBytes + task.speedBps * dt);
    const after = fileCursor(task).index;
    task.fileDone = after;

    if (after !== before) {
      // 换文件时停一下，像在等下一个连接
      rt.stallUntil = now + 50 + Math.random() * 100;
      task.currentFile = currentFile(task);
    }

    if (task.doneBytes >= task.totalBytes) {
      task.phase = "verify";
      task.speedBps = 0;
      task.doneBytes = task.totalBytes;
      rt.verifyStart = now;
      events.push({ type: "verify", task });
    }
  }

  return events;
}

/** 探测镜像：给安装向导与「测速」按钮共用，纯模拟 */
export function probeMirrors(state) {
  if (state.scenario === "mirror-down") {
    return state.mirrors.map((mirror) => ({ ...mirror, status: "down", latencyMs: null, throughputMbps: 0 }));
  }
  return state.mirrors.map((mirror) => {
    if (mirror.status === "down") return { ...mirror };
    const jitter = 0.85 + Math.random() * 0.4;
    return {
      ...mirror,
      latencyMs: Math.max(8, Math.round((mirror.latencyMs || 60) * jitter)),
      throughputMbps: Number(((mirror.throughputMbps || 0) * jitter).toFixed(1)),
      status: mirror.latencyMs > 800 ? "unstable" : "ok",
    };
  });
}

export function pickSources(mirrors) {
  const alive = mirrors
    .filter((mirror) => mirror.status !== "down" && mirror.baseUrl)
    .sort((a, b) => {
      const scoreA = (a.latencyMs || 9999) * 0.6 + (1 - a.successRate) * 2000 * 0.4;
      const scoreB = (b.latencyMs || 9999) * 0.6 + (1 - b.successRate) * 2000 * 0.4;
      return scoreA - scoreB;
    });
  return { primary: alive[0] || null, backup: alive[1] || null, alive };
}
