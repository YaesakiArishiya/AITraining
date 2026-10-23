/* ==========================================================================
   js/mock.js · 演示数据
   全部是模拟数据：不联网、不读真实 .minecraft、不发起任何下载。
   路径统一以 C:\Users\Demo\AppData\Roaming\minecraft\ 开头，避免被当成真实目录。
   ========================================================================== */

const MB = 1024 * 1024;

// 版本清单：版本号、发布时间、所需 Java 主版本、体积、文件数
const RELEASE_ROWS = [
  ["1.21.4", "2024-12-03", 21, 328872960, 1826],
  ["1.21.3", "2024-10-23", 21, 328245248, 1821],
  ["1.21.1", "2024-08-08", 21, 327770112, 1814],
  ["1.21", "2024-06-13", 21, 327614464, 1808],
  ["1.20.6", "2024-04-29", 21, 312475648, 1790],
  ["1.20.4", "2023-12-07", 17, 307232768, 1742],
  ["1.20.1", "2023-06-12", 17, 305397760, 1726],
  ["1.19.4", "2023-03-14", 17, 289406976, 1698],
  ["1.19.2", "2022-08-05", 17, 287309824, 1681],
  ["1.18.2", "2022-02-28", 17, 271581184, 1655],
  ["1.16.5", "2021-01-14", 8, 233832448, 1587],
  ["1.12.2", "2017-09-18", 8, 168820736, 1216],
];

const SNAPSHOT_ROWS = [
  ["24w14a", "2024-04-03", 21, 314572800, 1798],
  ["23w31a", "2023-08-02", 17, 310378496, 1772],
  ["22w42a", "2022-10-19", 17, 288358400, 1688],
  ["21w37a", "2021-09-15", 17, 262144000, 1622],
  ["20w45a", "2020-11-04", 8, 219152384, 1498],
  ["19w46b", "2019-11-14", 8, 205520896, 1441],
];

const OLD_ROWS = [
  ["1.8.9", "2015-12-09", 8, 121634816, 1024, "old_beta"],
  ["1.7.10", "2014-05-14", 8, 98697216, 964, "old_beta"],
  ["1.5.2", "2013-04-25", 8, 73400320, 812, "old_beta"],
  ["1.4.7", "2012-12-27", 8, 66060288, 764, "old_beta"],
  ["b1.7.3", "2011-07-08", 8, 22020096, 402, "old_beta"],
  ["a1.2.6", "2010-12-03", 8, 10485760, 268, "old_alpha"],
];

function toVersion(row, type) {
  const [id, releasedAt, javaMajor, sizeBytes, fileCount, forcedType] = row;
  return {
    id,
    type: forcedType || type,
    releasedAt,
    javaMajor,
    sizeBytes,
    fileCount,
    // javaMajor 为 21 的版本给一个「需要新 Java」的标签，用来演示缺失态
    note: javaMajor === 21 ? "需要 64 位 Java 21" : null,
  };
}

export const VERSIONS = [
  ...RELEASE_ROWS.map((row) => toVersion(row, "release")),
  ...SNAPSHOT_ROWS.map((row) => toVersion(row, "snapshot")),
  ...OLD_ROWS.map((row) => toVersion(row, "old_beta")),
];

export const TYPE_LABEL = {
  release: "正式版",
  snapshot: "快照",
  old_beta: "远古版",
  old_alpha: "远古版",
};

export const MIRRORS = [
  {
    id: "mojang",
    name: "Mojang 官方源",
    baseUrl: "https://piston-meta.mojang.com",
    latencyMs: 1180,
    throughputMbps: 0.42,
    status: "unstable",
    priority: 2,
    successRate: 0.72,
    note: "国内常见 1MB/s 以下",
  },
  {
    id: "bmclapi",
    name: "BMCLAPI 镜像",
    baseUrl: "https://bmclapi2.bangbang93.com",
    latencyMs: 38,
    throughputMbps: 11.4,
    status: "ok",
    priority: 1,
    successRate: 0.98,
    note: "默认首选",
  },
  {
    id: "mirror-cn",
    name: "国内镜像 A",
    baseUrl: "https://mirror.example.cn/mc",
    latencyMs: 64,
    throughputMbps: 8.2,
    status: "ok",
    priority: 3,
    successRate: 0.94,
    note: "备用源",
  },
  {
    id: "custom",
    name: "自定义源",
    baseUrl: "",
    latencyMs: null,
    throughputMbps: 0,
    status: "down",
    priority: 4,
    successRate: 0,
    note: "未配置地址，演示版禁用",
  },
];

export const JAVA_RUNTIMES = [
  {
    id: "jre-8",
    major: 8,
    version: "1.8.0_412",
    vendor: "Oracle",
    path: "C:\\Program Files\\Java\\jre1.8.0_412",
    arch: "x64",
    source: "system",
  },
  {
    id: "jre-17",
    major: 17,
    version: "17.0.13",
    vendor: "Temurin",
    path: "C:\\Users\\Demo\\AppData\\Roaming\\minecraft\\java\\jre-17",
    arch: "x64",
    source: "bundled",
  },
  {
    id: "jre-21",
    major: 21,
    version: "21.0.5",
    vendor: "Temurin",
    path: "C:\\Users\\Demo\\AppData\\Roaming\\minecraft\\java\\jre-21",
    arch: "x64",
    source: "download",
  },
];

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();

export const SEED_INSTANCES = [
  {
    id: "inst-1",
    name: "生存 1.20.4",
    versionId: "1.20.4",
    loader: "fabric",
    memoryMb: 4096,
    javaId: "jre-17",
    windowSize: "1280x720",
    isolated: true,
    sizeBytes: 412000000,
    installedAt: now - 26 * DAY,
    lastPlayedAt: now - 2 * HOUR,
  },
  {
    id: "inst-2",
    name: "建筑 1.19.2",
    versionId: "1.19.2",
    loader: "forge",
    memoryMb: 4096,
    javaId: "jre-17",
    windowSize: "1920x1080",
    isolated: true,
    sizeBytes: 398000000,
    installedAt: now - 40 * DAY,
    lastPlayedAt: now - 1 * DAY,
  },
  {
    id: "inst-3",
    name: "怀旧 1.12.2",
    versionId: "1.12.2",
    loader: "forge",
    memoryMb: 2048,
    javaId: "jre-8",
    windowSize: "1280x720",
    isolated: true,
    sizeBytes: 268000000,
    installedAt: now - 62 * DAY,
    lastPlayedAt: now - 6 * DAY,
  },
];

export const SEED_TASKS = [
  {
    id: "task-001",
    versionId: "1.21.4",
    source: "bmclapi",
    status: "running",
    phase: "download",
    totalBytes: 328872960,
    doneBytes: 111840000,
    fileDone: 604,
    speedBps: 0,
    retries: 0,
    error: null,
    createdAt: now - 4 * 60 * 1000,
  },
  {
    id: "task-002",
    versionId: "1.20.6",
    source: "bmclapi",
    status: "queued",
    phase: "download",
    totalBytes: 312475648,
    doneBytes: 0,
    fileDone: 0,
    speedBps: 0,
    retries: 0,
    error: null,
    createdAt: now - 3 * 60 * 1000,
  },
  {
    id: "task-003",
    versionId: "1.19.4",
    source: "mojang",
    status: "paused",
    phase: "download",
    totalBytes: 289406976,
    doneBytes: 167864320,
    fileDone: 962,
    speedBps: 0,
    retries: 1,
    error: null,
    createdAt: now - 52 * 60 * 1000,
  },
  {
    id: "task-004",
    versionId: "1.18.2",
    source: "mirror-cn",
    status: "failed",
    phase: "download",
    totalBytes: 271581184,
    doneBytes: 118800000,
    fileDone: 688,
    speedBps: 0,
    retries: 3,
    error: {
      kind: "checksum",
      title: "文件校验连续失败 3 次",
      detail: "镜像返回的文件与清单里的 SHA1 不一致，已切换到备用源仍然失败。",
      todo: "换一个下载源重试；如果仍然失败，说明镜像上的文件本身已损坏。",
    },
    createdAt: now - 3 * HOUR,
  },
  {
    id: "task-005",
    versionId: "1.16.5",
    source: "bmclapi",
    status: "done",
    phase: "done",
    totalBytes: 233832448,
    doneBytes: 233832448,
    fileDone: 1587,
    speedBps: 0,
    retries: 0,
    error: null,
    createdAt: now - 2 * DAY,
    finishedAt: now - 2 * DAY + 96000,
  },
  {
    // 内容下载任务：整合包走独立的源与速度模型，演示「同一队列里混着版本与内容」
    id: "task-006",
    kind: "modpack",
    itemId: "pack-vanillaplus",
    instanceId: null,
    name: "Vanilla+ 轻量整合包",
    source: "modrinth",
    status: "running",
    phase: "download",
    totalBytes: 46 * 1024 * 1024,
    doneBytes: 17 * 1024 * 1024,
    fileDone: 9,
    speedBps: 0,
    retries: 0,
    error: null,
    createdAt: now - 6 * 60 * 1000,
  },
];

export const SEED_ACCOUNTS = [
  {
    id: "acc-offline-1",
    type: "offline",
    name: "Mirror_Walker",
    uuid: "9a1f3c2e-6b4d-4f18-9a77-2c5d1e8b0a34",
  },
  {
    id: "acc-offline-2",
    type: "offline",
    name: "Steven_CN",
    uuid: "3d7b90aa-18c2-4cc6-8f0e-57a2c4d9e611",
  },
  {
    id: "acc-msa-1",
    type: "microsoft",
    name: "ZhuZen",
    demo: true,
  },
  {
    id: "acc-authlib-1",
    type: "thirdparty",
    name: "Aurora_Xi",
    provider: "LittleSkin 外置登录",
    demo: true,
  },
];

// 默认安装目录：真实实现由系统目录选择器决定，演示里就是一个固定的模拟路径
export const DEMO_ROOT = "C:\\Users\\Demo\\AppData\\Roaming\\minecraft";

export const DEFAULT_SETTINGS = {
  theme: "dark",
  language: "zh-CN",
  mirror: "auto",
  concurrency: 8,
  limitMbps: 0,
  keepTemp: false,
  defaultMemoryMb: 4096,
  windowSize: "1280x720",
  fullscreen: false,
  // auto = 按游戏版本自动挑 Java；其余值是 JAVA_RUNTIMES 的 id
  javaId: "auto",
  showLogWindow: true,
  isolated: true,
  // 用户可以改的默认安装路径；所有「目标目录」与「打开目录」都读这一项
  installPath: DEMO_ROOT,
};

// 模拟磁盘剩余空间：160GB，够装几十个原版版本
export const MOCK_DISK_FREE = 160 * 1024 * MB;

// 目录选择器的候选项：浏览器里弹不出系统对话框，只能给几个常见位置
export const INSTALL_PATH_PRESETS = [
  { id: "default", path: DEMO_ROOT, label: "默认位置", desc: "跟着用户目录走，重装启动器不用改路径", tag: "推荐" },
  { id: "d-drive", path: "D:\\Games\\Minecraft", label: "D 盘游戏目录", desc: "与系统盘分开，重装系统不影响存档", tag: "" },
  { id: "e-drive", path: "E:\\Minecraft\\Launcher", label: "E 盘自定义目录", desc: "空间大的机械盘，装多个实例更宽裕", tag: "" },
];

const BASE_LOG_LINES = [
  ["INFO", "启动参数解析完成，实例目录 instances/1.20.4"],
  ["INFO", "检测到 Java：Temurin 17.0.13（x64），路径 …\\java\\jre-17"],
  ["INFO", "版本文件清单比对通过，共 1742 个文件"],
  ["INFO", "正在启动游戏进程…"],
  ["INFO", "[main/INFO] Setting user: Mirror_Walker"],
  ["INFO", "[main/INFO] Backend library: LWJGL version 3.3.3+5"],
  ["INFO", "[Render thread/INFO] Reloading ResourceManager: vanilla"],
  ["INFO", "[Worker-Main-3/INFO] Loaded 1204 advancements"],
  ["WARN", "[Render thread/WARN] Shader pack directory not found, using default pipeline"],
  ["INFO", "[Render thread/INFO] Sound engine started"],
  ["INFO", "[Render thread/INFO] OpenGL 4.5.0 NVIDIA 566.14"],
  ["INFO", "[Server thread/INFO] Starting integrated minecraft server version 1.20.4"],
  ["INFO", "[Server thread/INFO] Preparing level \"world\""],
  ["INFO", "[Server thread/INFO] Time elapsed: 2841 ms"],
  ["INFO", "[Render thread/INFO] Narrator library for x64 successfully loaded"],
  ["INFO", "[Render thread/INFO] Created: 1024x512 minecraft:textures/atlas/blocks.png-atlas"],
  ["INFO", "[Render thread/INFO] Created: 256x256 minecraft:textures/atlas/gui.png-atlas"],
  ["WARN", "[Server thread/WARN] Can't keep up! Is the server overloaded? Running 2120ms behind"],
  ["INFO", "[Render thread/INFO] Loaded 6 recipes for smelting"],
  ["INFO", "[Server thread/INFO] Saving chunks for level 'ServerLevel[world]'/minecraft:overworld"],
];

const CRASH_LOG_LINES = [
  ["INFO", "[Render thread/INFO] Loaded 6 recipes for smelting"],
  ["WARN", "[Server thread/WARN] Can't keep up! Is the server overloaded? Running 4210ms behind"],
  ["WARN", "[Render thread/WARN] Chunk render queue backing up: 184 pending sections"],
  ["ERROR", "[Render thread/ERROR] java.lang.OutOfMemoryError: Java heap space"],
  ["ERROR", "[Render thread/ERROR] \tat net.minecraft.client.renderer.chunk.RenderChunk.rebuild(RenderChunk.java:214)"],
  ["ERROR", "[main/ERROR] 分配内存 4096MB 已用尽，堆外内存 512MB"],
  ["ERROR", "[main/ERROR] 游戏进程以退出码 1 结束"],
];

// 相对时间统一在渲染时计算，这里只记录「距今多少分钟」
function seedLogs() {
  const start = now - 32 * 60 * 1000;
  const lines = [];
  for (let i = 0; i < 120; i += 1) {
    const [level, text] = BASE_LOG_LINES[i % BASE_LOG_LINES.length];
    lines.push({
      id: "log-" + i,
      ts: start + i * 15000,
      level,
      text: i % 12 === 5 ? text + " (" + (i + 1) + ")" : text,
    });
  }
  lines.push({ id: "log-exit", ts: now - 40 * 1000, level: "INFO", text: "[main/INFO] 游戏已退出，本次时长 32 分钟" });
  return lines;
}

export function makeLogs() {
  return seedLogs();
}

export function makeCrashLogs(fromTs) {
  return CRASH_LOG_LINES.map(([level, text], i) => ({
    id: "crash-" + fromTs + "-" + i,
    ts: fromTs + i * 220,
    level,
    text,
  }));
}

export const DIAGNOSIS = {
  title: "游戏因内存不足（OutOfMemoryError）崩溃",
  lines: [
    "崩溃原因是 Java 堆内存耗尽：日志出现 java.lang.OutOfMemoryError: Java heap space。",
    "当前实例分配 4096MB，同时加载了较大的视距与资源包。",
  ],
  actions: [
    "把实例内存提高到 6144MB（不超过物理内存的 70%）",
    "把渲染距离从 16 降到 10～12",
    "关闭占用较高的资源包后再进一次世界",
    "如果仍然崩溃，复制诊断信息后再排查 Java 版本",
  ],
};

export const SCENARIOS = [
  { id: "normal", name: "正常网络", desc: "11MB/s 左右波动，文件粒度推进" },
  { id: "slow", name: "慢速网络", desc: "速度降到 300KB/s，剩余时间显著变长" },
  { id: "mirror-down", name: "镜像不可用", desc: "所有源探测超时，禁止开始安装" },
  { id: "checksum-fail", name: "校验失败", desc: "下载中途校验不通过，重试 3 次后失败" },
  { id: "java-missing", name: "Java 缺失", desc: "启动检查第三项不通过，给下载入口" },
  { id: "oom-crash", name: "OOM 崩溃", desc: "日志出现 ERROR 与诊断摘要" },
];

/* ==========================================================================
   内容下载：Mod / 整合包 / 材质包 / 光影
   本段全部是平台目录的模拟数据，不联 Modrinth / CurseForge，也不写磁盘。
   体积、文件数、依赖关系都按真实目录的形态给值，用来让假进度看起来可信。
   ========================================================================== */

export const LOADER_LABEL = {
  vanilla: "原版",
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
};

/* --------------------------------------------------------------------------
   版本安装选项：加载器与附加组件
   这里只写「有哪些、多大、从什么时候开始有」这些事实；
   某个版本能不能装由 app.js 按 releasedAt 与加载器规则判断。
   演示阶段不会解析 Forge / Fabric 安装器，下面的体积与文件数只是让清单可信。
   -------------------------------------------------------------------------- */

export const LOADER_OPTIONS = [
  {
    id: "vanilla",
    short: "纯净版",
    name: "不装加载器",
    desc: "只装 Mojang 官方文件，最轻量；装好之后仍可以回来补加载器。",
    sizeBytes: 0,
    fileCount: 0,
    since: null,
    path: null,
  },
  {
    id: "fabric",
    short: "Fabric",
    name: "Fabric",
    desc: "轻量、更新快，性能优化（Sodium）与光影（Iris）都走这条线。",
    sizeBytes: 5 * MB,
    fileCount: 4,
    since: "2018-12-01",
    path: "libraries/net/fabricmc/fabric-loader/fabric-loader-0.16.9.jar",
  },
  {
    id: "forge",
    short: "Forge",
    name: "Forge",
    desc: "老牌加载器，机械与大型整合包生态最全，1.20.1 及更早的包大多用它。",
    sizeBytes: 12 * MB,
    fileCount: 6,
    since: "2013-01-01",
    path: "libraries/net/minecraftforge/forge/forge-universal.jar",
  },
  {
    id: "neoforge",
    short: "NeoForge",
    name: "NeoForge",
    desc: "Forge 的分叉，1.20.1 之后的新包更常选它；早期版本没有对应构建。",
    sizeBytes: 10 * MB,
    fileCount: 5,
    since: "2023-06-01",
    path: "libraries/net/neoforged/neoforge/neoforge-universal.jar",
  },
];

export const EXTRA_OPTIONS = [
  {
    id: "optifine",
    short: "OptiFine",
    name: "高清修复（OptiFine）",
    desc: "光影、高清贴图与渲染优化三合一；闭源，和 Fabric 路线互斥。",
    sizeBytes: 9 * MB,
    fileCount: 1,
    since: "2014-01-01",
    // OptiFine 自带启动入口，只能挂到原版或 Forge 上
    loaders: ["vanilla", "forge"],
    releaseOnly: true,
    requires: [],
    path: "versions/{version}/optifine/OptiFine_{version}_HD_U_I6.jar",
  },
  {
    id: "sodium",
    short: "Sodium",
    name: "性能优化（Sodium）",
    desc: "重写渲染管线，帧数通常翻倍；只支持 Fabric。",
    sizeBytes: 2 * MB,
    fileCount: 1,
    since: "2019-08-01",
    loaders: ["fabric"],
    releaseOnly: false,
    requires: [],
    path: "mods/sodium-fabric-0.6.5+mc{version}.jar",
  },
  {
    id: "iris",
    short: "Iris",
    name: "光影支持（Iris）",
    desc: "在 Fabric 上加载光影包，替代 OptiFine 的光影部分；会自动带上 Sodium。",
    sizeBytes: 4 * MB,
    fileCount: 1,
    since: "2021-10-01",
    loaders: ["fabric"],
    releaseOnly: false,
    requires: ["sodium"],
    path: "mods/iris-mc{version}-1.8.1.jar",
  },
];

// Mod 的玩法分类：目录接口返回的是自由标签，这里收敛成固定几类，筛选下拉才有稳定选项
export const MOD_CATEGORIES = [
  { id: "performance", label: "性能优化" },
  { id: "gameplay", label: "玩法拓展" },
  { id: "utility", label: "辅助工具" },
  { id: "visual", label: "视觉美化" },
];

export const CONTENT_KINDS = {
  mod: {
    route: "mods",
    label: "Mod",
    noun: "Mod",
    title: "Mod 下载",
    sub: "安装到指定实例的 mods/：按加载器与游戏版本自动过滤，依赖一并下载。",
    dir: "mods",
    speedMbps: 1.9,
  },
  modpack: {
    route: "modpacks",
    label: "整合包",
    noun: "整合包",
    title: "整合包下载",
    sub: "整合包安装会新建一个独立实例，加载器与游戏版本由包决定。",
    dir: "modpacks",
    speedMbps: 2.6,
  },
  resourcepack: {
    route: "resourcepacks",
    label: "材质包",
    noun: "材质包",
    title: "材质包下载",
    sub: "放进实例的 resourcepacks/，与加载器无关，所有版本通用。",
    dir: "resourcepacks",
    speedMbps: 2.2,
  },
  shader: {
    route: "shaders",
    label: "光影",
    noun: "光影",
    title: "光影下载",
    sub: "放进 shaderpacks/；原版需要 Iris 或 OptiFine 才能加载，演示只演示文件落位。",
    dir: "shaderpacks",
    speedMbps: 1.7,
  },
};

export const CONTENT_SOURCES = [
  { id: "modrinth", name: "Modrinth 镜像", note: "国内镜像 · 单文件限速" },
  { id: "curseforge", name: "CurseForge 镜像", note: "需要 API Key，演示态只读" },
];

// 体积与文件数由主文件 + 依赖推导，避免手写出现「1 个文件 40MB」这种矛盾数据
function contentItem(base) {
  const requires = base.requires || [];
  const isPack = base.kind === "modpack";
  const extra = requires.reduce((sum, dep) => sum + dep.sizeBytes, 0);
  const fileCount = isPack ? 1 + (base.modCount || 0) : 1 + requires.length;
  return {
    ...base,
    requires,
    fileCount,
    sizeBytes: isPack ? base.mainBytes : base.mainBytes + extra,
    loaders: base.loaders || ["vanilla"],
    mcVersions: base.mcVersions || [],
    tags: base.tags || [],
  };
}

const JEI_FILE = "jei-1.20.4-forge-15.20.0.106.jar";

export const CONTENT = [
  contentItem({
    id: "mod-jei",
    kind: "mod",
    slug: "jei",
    name: "Just Enough Items",
    author: "mezz",
    version: "15.20.0.106",
    fileName: JEI_FILE,
    hue: 205,
    description: "在物品栏里按 R 查配方、按 U 查用途。几乎所有整合包都带着它，单装也不会和原版冲突。",
    mcVersions: ["1.21.4", "1.21.1", "1.20.4", "1.20.1", "1.19.2", "1.18.2"],
    loaders: ["fabric", "forge", "neoforge"],
    category: "utility",
    tags: ["物品查询", "配方", "必备"],
    downloads: 218_400_000,
    updatedAt: "2026-09-18",
    mainBytes: 2 * MB,
  }),
  contentItem({
    id: "mod-sodium",
    kind: "mod",
    slug: "sodium",
    name: "Sodium",
    author: "CaffeineMC",
    version: "0.6.5",
    fileName: "sodium-fabric-0.6.5+mc1.20.4.jar",
    hue: 168,
    description: "重写渲染管线，帧数通常能翻倍；和 Iris 一起用可以边开光影边保持流畅。",
    mcVersions: ["1.21.4", "1.21.1", "1.20.4", "1.20.1", "1.19.2"],
    loaders: ["fabric", "neoforge"],
    category: "performance",
    tags: ["性能", "渲染"],
    downloads: 96_500_000,
    updatedAt: "2026-08-30",
    mainBytes: 2 * MB,
  }),
  contentItem({
    id: "mod-iris",
    kind: "mod",
    slug: "iris",
    name: "Iris Shaders",
    author: "IrisShaders",
    version: "1.8.1",
    fileName: "iris-mc1.20.4-1.8.1.jar",
    hue: 268,
    description: "让 Fabric 实例能加载光影包，替代 OptiFine 的光影部分，并且不牺牲 Sodium 的性能。",
    mcVersions: ["1.21.4", "1.21.1", "1.20.4", "1.20.1"],
    loaders: ["fabric"],
    category: "visual",
    tags: ["光影支持", "性能"],
    downloads: 41_200_000,
    updatedAt: "2026-09-02",
    mainBytes: 4 * MB,
    requires: [{ name: "Sodium", fileName: "sodium-fabric-0.6.5+mc1.20.4.jar", sizeBytes: 2 * MB }],
  }),
  contentItem({
    id: "mod-create",
    kind: "mod",
    slug: "create",
    name: "Create",
    author: "simibubi",
    version: "0.5.1f",
    fileName: "create-1.20.1-0.5.1.f.jar",
    hue: 33,
    description: "用齿轮、传送带和机械臂做自动化。内容量大，第一次进世界会明显感觉到加载变慢。",
    mcVersions: ["1.20.1", "1.19.2", "1.18.2"],
    loaders: ["forge", "neoforge", "fabric"],
    category: "gameplay",
    tags: ["机械", "自动化"],
    downloads: 62_800_000,
    updatedAt: "2026-07-11",
    mainBytes: 13 * MB,
    requires: [{ name: "Flywheel", fileName: "flywheel-forge-1.20.1-0.6.11.jar", sizeBytes: 4 * MB }],
  }),
  contentItem({
    id: "mod-appleskin",
    kind: "mod",
    slug: "appleskin",
    name: "AppleSkin",
    author: "squeek502",
    version: "2.5.1",
    fileName: "appleskin-fabric-mc1.20.4-2.5.1.jar",
    hue: 8,
    description: "按住 Shift 时在饥饿条上显示饱和度与预计回复量，做饭与跑图时很实用。",
    mcVersions: ["1.21.4", "1.20.4", "1.20.1", "1.19.2"],
    loaders: ["fabric", "forge"],
    category: "utility",
    tags: ["HUD", "轻量"],
    downloads: 34_900_000,
    updatedAt: "2026-05-22",
    mainBytes: 200 * 1024,
  }),
  contentItem({
    id: "mod-jade",
    kind: "mod",
    slug: "jade",
    name: "Jade",
    author: "Snownee",
    version: "11.12.3",
    fileName: "Jade-1.20.4-Fabric-11.12.3.jar",
    hue: 190,
    description: "准星指向方块或生物时显示名称与状态，替换老版本的 Hwyla / WAILA。",
    mcVersions: ["1.21.4", "1.20.4", "1.20.1", "1.19.2"],
    loaders: ["fabric", "forge"],
    category: "utility",
    tags: ["信息显示", "轻量"],
    downloads: 51_300_000,
    updatedAt: "2026-06-14",
    mainBytes: 900 * 1024,
  }),
  contentItem({
    id: "mod-farmers-delight",
    kind: "mod",
    slug: "farmers-delight",
    name: "Farmer's Delight",
    author: "vectorwing",
    version: "1.2.6",
    fileName: "FarmersDelight-1.20.1-1.2.6.jar",
    hue: 96,
    description: "新增作物、厨具与料理。1.20.4 还没有正式版，演示里会标成「与当前实例不兼容」。",
    mcVersions: ["1.20.1", "1.19.2", "1.18.2"],
    loaders: ["forge", "fabric"],
    category: "gameplay",
    tags: ["农业", "食物"],
    downloads: 18_700_000,
    updatedAt: "2026-03-09",
    mainBytes: 6 * MB,
  }),
  contentItem({
    id: "mod-xaero",
    kind: "mod",
    slug: "xaero-minimap",
    name: "Xaero's Minimap",
    author: "xaero96",
    version: "24.6.1",
    fileName: "Xaeros_Minimap_24.6.1_Fabric_1.20.4.jar",
    hue: 320,
    description: "小地图、路径点与实体雷达；服务端允许时会自动同步多人世界的地形。",
    mcVersions: ["1.21.4", "1.21.1", "1.20.4", "1.20.1", "1.19.2"],
    loaders: ["fabric", "forge"],
    category: "utility",
    tags: ["地图", "路径点"],
    downloads: 73_100_000,
    updatedAt: "2026-09-27",
    mainBytes: 3 * MB,
  }),

  contentItem({
    id: "pack-vanillaplus",
    kind: "modpack",
    slug: "vanillaplus",
    name: "Vanilla+ 轻量整合包",
    author: "MirrorWorks",
    version: "3.2.0",
    hue: 152,
    description: "在原版基础上补齐优化、信息显示与少量装饰，40 多个 Mod 但几乎不改变玩法，适合日常生存。",
    mcVersion: "1.20.4",
    loader: "fabric",
    modCount: 28,
    mainBytes: 46 * MB,
    downloads: 2_140_000,
    updatedAt: "2026-10-08",
    tags: ["轻量", "生存", "原版增强"],
  }),
  contentItem({
    id: "pack-fabulously",
    kind: "modpack",
    slug: "fabulously-optimized",
    name: "Fabulously Optimized",
    author: "Robotkoer",
    version: "6.4.0",
    hue: 144,
    description: "只做性能与体验优化，不含玩法 Mod；配置好后帧数接近 Sodium 单独安装的水平。",
    mcVersion: "1.21.4",
    loader: "fabric",
    modCount: 45,
    mainBytes: 78 * MB,
    downloads: 8_900_000,
    updatedAt: "2026-09-21",
    tags: ["优化", "轻量"],
  }),
  contentItem({
    id: "pack-rlcraft",
    kind: "modpack",
    slug: "rlcraft",
    name: "RLCraft",
    author: "Shivaxi",
    version: "2.9.3",
    hue: 12,
    description: "高难度硬核生存，龙、温度与口渴机制齐全；第一次进世界要看引导，别直接冲出去。",
    mcVersion: "1.12.2",
    loader: "forge",
    modCount: 186,
    mainBytes: 320 * MB,
    downloads: 4_760_000,
    updatedAt: "2026-02-17",
    tags: ["硬核", "生存", "大型"],
  }),
  contentItem({
    id: "pack-bettermc",
    kind: "modpack",
    slug: "better-mc-fabric",
    name: "Better MC [FABRIC]",
    author: "Lunaprise",
    version: "27",
    hue: 258,
    description: "以冒险与探索为主的中大型整合包，新增维度、结构与 Boss，同时保留原版节奏。",
    mcVersion: "1.20.1",
    loader: "fabric",
    modCount: 210,
    mainBytes: 260 * MB,
    downloads: 1_920_000,
    updatedAt: "2026-08-05",
    tags: ["冒险", "大型"],
  }),
  contentItem({
    id: "pack-dawncraft",
    kind: "modpack",
    slug: "dawncraft",
    name: "DawnCraft",
    author: "Kreksuz",
    version: "2.0.11",
    hue: 46,
    description: "魂系战斗 + RPG 任务线，配套光影与材质；对显卡和内存要求都高，建议 8GB 内存起。",
    mcVersion: "1.18.2",
    loader: "forge",
    modCount: 352,
    mainBytes: 640 * MB,
    downloads: 1_120_000,
    updatedAt: "2026-06-30",
    tags: ["RPG", "魂系", "大型"],
  }),

  contentItem({
    id: "rp-faithful",
    kind: "resourcepack",
    slug: "faithful",
    name: "Faithful 32x",
    author: "Faithful Team",
    version: "32x-2026.09",
    fileName: "Faithful 32x - 1.20.4.zip",
    hue: 210,
    description: "把原版 16× 贴图重绘成 32×，风格保持原样，是低配机器上性价比最高的材质包。",
    tags: ["原版风格", "32x"],
    downloads: 160_000_000,
    updatedAt: "2026-09-12",
    mainBytes: 21 * MB,
  }),
  contentItem({
    id: "rp-fresh-animations",
    kind: "resourcepack",
    slug: "fresh-animations",
    name: "Fresh Animations",
    author: "FreshLX",
    version: "1.9.4",
    fileName: "FreshAnimations_v1.9.4.zip",
    hue: 96,
    description: "给生物加上行走、攻击与受击动画，需要搭配实体模型扩展包才能完整生效。",
    tags: ["动画", "生物"],
    downloads: 88_000_000,
    updatedAt: "2026-07-19",
    mainBytes: 7 * MB,
  }),
  contentItem({
    id: "rp-stay-true",
    kind: "resourcepack",
    slug: "stay-true",
    name: "Stay True",
    author: "Risky",
    version: "1.20.4-v3",
    fileName: "Stay_True_1.20.4.zip",
    hue: 132,
    description: "保留原版色板，只把方块边缘与自然材质画得更柔和，适合建筑截图。",
    tags: ["原版风格", "建筑"],
    downloads: 21_300_000,
    updatedAt: "2026-04-28",
    mainBytes: 12 * MB,
  }),
  contentItem({
    id: "rp-mizunos",
    kind: "resourcepack",
    slug: "mizunos",
    name: "Mizuno's 16 Craft",
    author: "Mizuno",
    version: "1.20.4-2.1",
    fileName: "Mizunos_16_Craft_1.20.4.zip",
    hue: 188,
    description: "清淡的日式手绘风，16× 分辨率不占显存，界面与方块都做了统一处理。",
    tags: ["手绘", "16x"],
    downloads: 15_600_000,
    updatedAt: "2026-01-15",
    mainBytes: 18 * MB,
  }),
  contentItem({
    id: "rp-bare-bones",
    kind: "resourcepack",
    slug: "bare-bones",
    name: "Bare Bones",
    author: "RiskyBones",
    version: "1.20",
    fileName: "Bare_Bones_1.20.zip",
    hue: 40,
    description: "极简扁平风，像宣传片里的材质；建筑作品展示时很出效果。",
    tags: ["极简", "宣传片"],
    downloads: 29_800_000,
    updatedAt: "2026-06-02",
    mainBytes: 3 * MB,
  }),
  contentItem({
    id: "rp-xali",
    kind: "resourcepack",
    slug: "xali",
    name: "Xali's Enhanced Vanilla",
    author: "Xali",
    version: "2.4",
    fileName: "Xalis_Enhanced_Vanilla_2.4.zip",
    hue: 282,
    description: "只改部分方块与物品，保留原版识别度的同时补上细节，适合和别的材质包混用。",
    tags: ["原版增强", "兼容"],
    downloads: 9_400_000,
    updatedAt: "2026-08-16",
    mainBytes: 9 * MB,
  }),

  contentItem({
    id: "sh-complementary",
    kind: "shader",
    slug: "complementary",
    name: "Complementary Reimagined",
    author: "EminGTR",
    version: "r5.3",
    fileName: "ComplementaryReimagined_r5.3.zip",
    hue: 24,
    description: "开箱即用的光影，白天通透、夜晚有光晕；配置项多，低配可以先把阴影分辨率降一档。",
    tags: ["综合", "光晕"],
    downloads: 98_000_000,
    updatedAt: "2026-09-05",
    mainBytes: 5 * MB,
  }),
  contentItem({
    id: "sh-bsl",
    kind: "shader",
    slug: "bsl",
    name: "BSL Shaders",
    author: "capttatsu",
    version: "8.4",
    fileName: "BSL_v8.4.zip",
    hue: 198,
    description: "偏写实的水体与体积光，色彩更饱和；和大部分材质包都能搭。",
    tags: ["写实", "水体"],
    downloads: 74_500_000,
    updatedAt: "2026-05-11",
    mainBytes: 4 * MB,
  }),
  contentItem({
    id: "sh-sildurs",
    kind: "shader",
    slug: "sildurs",
    name: "Sildur's Vibrant",
    author: "Sildur",
    version: "1.51",
    fileName: "Sildurs_Vibrant_Shaders_v1.51.zip",
    hue: 348,
    description: "色彩浓、开销小，老显卡也能跑；分 Lite / Medium / High 三档。",
    tags: ["低配友好", "鲜艳"],
    downloads: 52_700_000,
    updatedAt: "2026-03-27",
    mainBytes: 3 * MB,
  }),
  contentItem({
    id: "sh-rethinking",
    kind: "shader",
    slug: "rethinking-voxels",
    name: "Rethinking Voxels",
    author: "gri573",
    version: "0.4b",
    fileName: "Rethinking-Voxels-0.4b.zip",
    hue: 300,
    description: "基于 Complementary 的体素光照版本，画面更接近宣传片，但需要不错的显卡。",
    tags: ["体素光照", "高开销"],
    downloads: 6_200_000,
    updatedAt: "2026-07-02",
    mainBytes: 7 * MB,
  }),
  contentItem({
    id: "sh-makeup",
    kind: "shader",
    slug: "makeup",
    name: "MakeUp Ultra Fast",
    author: "X0nk",
    version: "8.8",
    fileName: "MakeUp-UltraFast-8.8.zip",
    hue: 172,
    description: "极低开销的轻量光影，集显笔记本也能稳 60 帧，适合只想要一点色彩与阴影的场景。",
    tags: ["低配友好", "轻量"],
    downloads: 33_100_000,
    updatedAt: "2026-04-09",
    mainBytes: 2 * MB,
  }),
];

export function contentOf(id) {
  return CONTENT.find((item) => item.id === id) || null;
}

export function contentList(kind) {
  return CONTENT.filter((item) => item.kind === kind);
}

// 初始已装内容：让「已安装」状态、兼容性提示与卸载流程一打开就能看到
export const SEED_CONTENT = [
  {
    id: "content-1",
    itemId: "mod-jei",
    kind: "mod",
    instanceId: "inst-1",
    installedAt: now - 12 * DAY,
    sizeBytes: contentOf("mod-jei").sizeBytes,
  },
  {
    id: "content-2",
    itemId: "rp-faithful",
    kind: "resourcepack",
    instanceId: "inst-1",
    installedAt: now - 9 * DAY,
    sizeBytes: contentOf("rp-faithful").sizeBytes,
  },
  {
    id: "content-3",
    itemId: "mod-jade",
    kind: "mod",
    instanceId: "inst-2",
    installedAt: now - 5 * DAY,
    sizeBytes: contentOf("mod-jade").sizeBytes,
  },
];
