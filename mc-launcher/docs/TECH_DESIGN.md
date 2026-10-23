# 镜界 · 技术方案（v0 界面演示）

| 项目 | 内容 |
| --- | --- |
| 对应需求 | `docs/PRD.md` v0.4 |
| 实现阶段 | v0：Windows 界面演示 + 假进度，不联网、不写真实目录 |
| 技术栈 | HTML + CSS + 原生 JavaScript（ES Module，ES2022），零依赖、零构建 |
| 运行方式 | `node serve.js 5182` → `http://localhost:5182/` |
| 数据存储 | `localStorage` 的 `jingjie.state.v1` |
| 更新日期 | 2026-10-22 |

## 1. 本期做了什么、没做什么

已实现：

- 十个视图：主页、纯净版、版本安装选项、Mod、整合包、材质包、光影、下载中心、实例、日志与诊断、设置。
- 左侧「下载」是可展开分组（纯净版 / Mod / 整合包 / 材质包 / 光影），窄屏收成图标栏后仍能进全部分类；安装任务改用右下角的悬浮球，点开是只列任务的悬浮面板，面板里可跳到五个下载分类或完整任务页；站在安装任务页或没有进行中 / 失败任务时自动收起。
- 三步安装向导：选版本 → 选下载源 → 确认开始，可前进后退且已选内容保留。
- 版本安装选项页：点纯净版里任意一行进入，选不装加载器 / Fabric / Forge / NeoForge，再勾高清修复（OptiFine）、性能优化（Sodium）或光影支持（Iris）；按版本发布日期与加载器过滤不可用项并写明原因，追加文件计入同一任务的体积与文件数。
- 假下载引擎：字节推进、文件粒度切换、速度包络与瞬时停顿、暂停/继续/取消、校验阶段、完成停留。
- 内容下载中心：24 项模拟内容，支持搜索、游戏版本 / 加载器 / 类型筛选、排序、只看已安装；安装前校验「游戏版本 → 加载器」，装完写入实例并出现在实例配置里，可卸载。
- 内容任务与版本任务共用一条队列与同一套状态机，只是文件清单与基线速度不同。
- 启动前五项检查，Java 缺失时禁用启动并提供模拟下载 JRE 入口。
- 六种可切换的演示场景（正常、慢速、镜像不可用、校验失败、Java 缺失、OOM 崩溃），外加「模拟首次使用」。
- 深色 / 浅色 / 跟随系统三档主题（跟随系统在运行时解析）。

未实现（下一轮再做，见 PRD 3.4）：

- 真实版本清单与 HTTP 下载、SHA1 校验、磁盘写入、SQLite。
- 真实内容目录 API（Modrinth / CurseForge）与真实文件下载；真实加载器安装器（当前只在安装选项页模拟加载器与 OptiFine 的文件与体积）。
- 桌面壳（Tauri / Electron / 原生）与系统托盘、UAC、开机自启。
- 微软 OAuth 登录（当前只有演示占位）。
- 多实例并存、实例文件浏览（只读）、增量更新、自动更新。

## 2. 为什么是纯静态实现

PRD 的交付形态是 Windows 桌面应用，但桌面壳选型（Tauri / Electron / 原生）尚未确定，而仓库的硬性约定是「不引入打包工具、不做后端」。因此 v0 用浏览器里的一套静态页面把**交互与信息密度**先验证出来：

- 所有规则、字段、状态机都在浏览器里跑通，换成任何壳只需替换存储与进程启动两处。
- 假进度引擎与 UI 解耦（`js/engine.js` 不碰 DOM），v1 换真实下载器时保留相同的任务数据结构即可。
- 不引入任何 npm 依赖，任何人 `node serve.js` 就能复现同一套演示。

代价：浏览器标签页形态，没有真实的系统窗口行为；这部分留给壳选型之后。

## 3. 目录与职责

| 路径 | 职责 | 约束 |
| --- | --- | --- |
| `index.html` | 应用外壳：标题栏、左侧导航、主区域、状态栏、弹窗、演示场景面板 | 只放骨架，视图内容由 JS 渲染 |
| `css/base.css` | 设计令牌、重置、按钮/输入/开关/进度条/表格等通用件 | 颜色与圆角只能来自 `:root` 变量 |
| `css/app.css` | 外壳与十个视图的布局、弹窗、提示条、内容卡片、场景面板、响应式 | 复用已有类，不写一次性样式 |
| `js/mock.js` | 版本、镜像、Java、账号、任务、日志、诊断样本，内容目录（Mod / 整合包 / 材质包 / 光影）与已安装内容，版本安装选项（加载器 / 附加组件）的元数据，以及默认安装路径的候选目录 | 只放数据，不写 DOM 与计时器 |
| `js/engine.js` | 文件清单生成（版本与内容两种形态）、假下载推进、进度派生、镜像探测与选源 | 不碰 DOM，不读 `localStorage` |
| `js/app.js` | 状态、渲染、事件委托、对话框、演示场景 | 插入文本一律走 `esc()` |
| `serve.js` | 零依赖静态预览服务器（端口 5182） | 交付物，不删除 |
| `tools/screenshot.js` | 无头 Chrome 截图，可带点击/等待步骤 | 依赖本机 Chrome / Edge |

## 4. 数据结构

### 4.1 持久化状态

键名 `jingjie.state.v1`。改结构必须升到 `v2` 并写迁移，不允许直接覆盖。

```js
{
  version: 1,
  scenario: "normal",                 // 当前演示场景
  settings: {
    theme: "dark",                    // dark | light | auto
    language: "zh-CN",
    mirror: "auto",                   // auto | mojang | bmclapi | mirror-cn
    concurrency: 8,                   // 1～16
    limitMbps: 0,                     // 0 = 不限速
    keepTemp: false,
    defaultMemoryMb: 4096,
    windowSize: "1280x720",
    fullscreen: false,
    javaId: "auto",
    showLogWindow: true,
    isolated: true,
    installPath: "C:\\Users\\Demo\\AppData\\Roaming\\minecraft"  // 默认安装根目录，可改
  },
  mirrors: [ { id, name, baseUrl, latencyMs, throughputMbps, status, priority, successRate } ],
  instances: [ { id, name, versionId, loader, extras, memoryMb, javaId, windowSize, isolated, sizeBytes, installedAt, lastPlayedAt } ],
  tasks: [ {
    id, kind, itemId, instanceId, name, source,
    status,                           // queued | running | retrying | paused | failed | done
    phase,                            // download | verify | finishing | done | paused
    totalBytes, doneBytes, fileDone,
    speedBps, retries, error, createdAt, finishedAt,
    loader, extras, addons            // 仅版本任务：加载器、附加组件与追加文件清单
  } ],
  content: [ { id, itemId, kind, instanceId, installedAt, sizeBytes } ],
  accounts: [ { id, type, name, uuid, provider, demo } ],   // type: microsoft | offline | thirdparty
  selectedAccountId: "acc-offline-1",
  javaInstalled: { "jre-8": true, "jre-17": true, "jre-21": false },
  logs: [ { id, ts, level, text } ],
  diagnosis: false,
  diskFree: 167772160000
}
```

瞬时量不进 `localStorage`：速度平滑样本、换文件停顿、校验计时、失败注入标志都放在 `app.js` 的 `runtime` Map 里，刷新即丢。

### 4.2 派生值

百分比、剩余时间、文件完成数、当前文件、磁盘占用率全部由 `engine.js` 现算，不落库，避免两份数据打架。

## 5. 假进度引擎

### 5.1 文件清单

`filePlan(version)` 用版本号做种子生成确定性清单：

- 第 1 个文件是客户端 jar（`versions/<id>/<id>.jar`）；
- 其后约 18% 是库文件（`libraries/...jar`）；
- 剩下是资源文件（`assets/objects/ab/<hash>`）；
- 每个文件的体积按权重分配，总和严格等于 `version.sizeBytes`。

因此「字节进度」与「文件计数」两条线永远一致：文件序号由已下载字节数二分反查得到，而不是单独维护一个计数器。

版本任务带安装选项时，`targetOf(task)` 会返回一个带 `addons` 的版本视图：

- `task.addons` 里每项是 `{ id, label, path, size, files }`，例如 Fabric 加载器或 `mods/iris-….jar`；
- 这些文件排在版本文件之后，版本文件按 `sizeBytes - addonBytes` 分摊，总字节与 `task.totalBytes` 严格一致；
- 清单缓存键变成 `版本号@附加组件 id 列表`（`planKey`），同一版本装不同加载器不会互相覆盖。

内容任务复用同一套清单结构，只是换生成规则（`contentPlan()`）：

- Mod：`mods/<fileName>` + 每个依赖一个 `.jar`，体积直接取数据里的真实值，不按权重随机；
- 整合包：`modpacks/<slug>/manifest.json`（几 KB）+ `modCount` 个 `mods/*.jar`，文件名从固定池里取，看起来像真实整合包；
- 材质包 / 光影：`resourcepacks/<fileName>` 或 `shaderpacks/<fileName>` 单个压缩包。

因此内容任务的「当前文件」也是真的路径，而不是一句「正在下载」。

### 5.2 速度模型

```
base = 当前源吞吐（慢速场景固定 300 KB/s）
内容任务：base = 类型基线（Mod 1.9 / 整合包 2.6 / 材质包 2.2 / 光影 1.7 MB/s）
base = min(base, 限速 / 并发数)
envelope = 1 + 0.28·sin(t/1.6s + phase) + 噪声(±6%)
speed = 0.72·上次速度 + 0.28·(base × envelope)
```

- 每换一个文件，速度归零 50～150ms，模拟等待下一个连接；
- 约 1.2% 的帧会插入一次 250～750ms 的掉零，避免速度曲线是直线；
- 暂停时把 `speedBps` 置 0 并冻住 `doneBytes`，继续时从原值接着走，不重算。

### 5.3 任务状态机

```
queued ──有空闲并发槽──> running ──字节走满──> verify ──1.5s──> finishing ──0.5s──> done
                            ↑   ↓ 暂停/继续
                          paused
                            └──校验失败（第 1/2 次）──> retrying ──1.5s──> running
                            └──校验失败（第 3 次）──> failed ──手动重试──> running
```

- 并发上限来自设置；有空槽时自动把 `queued` 提升为 `running`。
- 校验阶段单独一条进度条（「正在校验文件 N / 总数」），不与下载共用。
- 完成后先停在 100% 0.5 秒，再切到「已完成 · 打开实例」，避免一闪而过。
- 完成时写入实例、刷新版本状态、追加日志并提示。

### 5.4 持久化与恢复

- 任务运行期间每 1.2 秒节流写入一次；暂停、取消、完成、改设置立即写。
- 重新打开页面时，`running` / `queued` / `retrying` 一律恢复成 `paused`，并提示「已恢复上次的 N 个任务进度」，不会在后台偷偷跑。
- 校验中被打断的任务回到 `paused`，继续时回退 2% 重新进入下载。

## 6. 界面实现

### 6.1 渲染模型

- 单个 `<main id="view">`，路由是 `home | versions | version | mods | modpacks | resourcepacks | shaders | downloads | instances | logs | settings`，每个视图函数返回 HTML 字符串；四个内容分类共用 `viewContent(kind)`，靠 `CONTENT_KINDS` 取文案与落位目录。
- `version` 是版本安装选项页，草稿存在 `ui.plan`（`versionId` / `loader` / `extras` / `sourceMode`）。可用性判断在 `loaderReason()` 与 `extraReason()`：发布日期早于组件的 `since`、加载器不在 `loaders` 里、快照勾了 `releaseOnly` 组件，都返回具体原因，界面直接禁用并显示。`normalizePlan()` 负责收敛非法组合：切加载器会丢掉不再支持的附加组件，勾 Iris 会自动补 Sodium。
- 内容列表的筛选状态 `ui.content`（关键字 / 游戏版本 / 加载器 / 类型 / 排序 / 只看已安装）在四个分类间共享；游戏版本条件只对 Mod 与整合包生效，加载器与类型只对 Mod 生效，切换分类不会把材质包/光影筛空。加载器选项由目录数据里的 `loaders` 推导，类型选项来自 `MOD_CATEGORIES`（`performance` / `gameplay` / `utility` / `visual`），新增 Mod 只需补 `category` 字段。
- 下载页按「状态 + 阶段 + 重试次数 + 错误文案」算签名：签名变了整体重渲染，否则只按 `data-field` 打补丁（百分比、速度、剩余、当前文件），避免每 200ms 重建 DOM 导致按钮失焦。
- 所有动态文本经 `esc()` 转义；书内数据不进入 `innerHTML` 的未转义位置。
- 安装根目录统一走 `installRoot()`：读 `settings.installPath`，非法值回落 `DEMO_ROOT`。路径的归一化（正斜杠转反斜杠、合并重复分隔符、去掉结尾分隔符）与校验（绝对路径、不能停在盘符根目录、禁止 `<>:"|?*`、禁止 `.` / `..` 片段、目录名不能以点结尾、上限 120 字符）分别是 `normalizeInstallPath()` 与 `installPathIssue()`，后者返回的文案直接当界面提示与 `toast` 用。手填时只更新提示行（`syncPathHint()`），不整页重渲染，避免打光标。
- 换盘要看得见：弹窗里的候选卡片带 `data-path-row` / `data-path-value`，`.choice input` 是隐藏的，所以 `[data-path-choice]` 的 `change` 事件必须自己同步 `is-checked`（否则单选项看起来没反应），并刷新底部 `.pathlive` 摘要（`syncPathLive()` / `pathLiveNote()`）说明「将改为」与「已有实例不会搬走」。确定后用 `pathChangeNote()` 在设置页留一条常驻提示与「立即保存」按钮，`flashSaveBar()` 让顶部保存条闪一下；保存后提示自动收起。`syncPathHint()` 也会同步这条提示，手填路径时提示一致。

### 6.2 事件与键盘

- 点击走 document 级委托，按钮写 `data-action`，动作表集中在 `actions`。
- 版本表格行可聚焦，`↑` / `↓` 换行、`Enter` 进入安装选项页；点行同样是进入该页。
- 安装选项页的加载器与附加组件是原生 `radio` / `checkbox`，重新渲染后把焦点还给同一个控件，键盘用户不用从头 Tab。
- `Esc` 关闭弹窗与演示场景面板；弹窗内 `Tab` 焦点不逃逸，关闭后焦点回到触发元素。

### 6.3 主题与响应式

- 主题只切 `<html data-theme>`，颜色全部来自 `:root` 变量；`auto` 通过 `matchMedia` 解析，并监听系统切换。
- 主布局为标题栏 + 侧栏 + 主区域 + 状态栏，最小按 1024 × 700 设计；≤1080px 时导航收成图标栏。
- ≤1080px 下「下载」分组展开为右侧浮层；选中任意子项后浮层自动收起，点页面空白处也收起，避免浮层一直压着正文。
- 动画与过渡都在 `prefers-reduced-motion` 下关闭。

### 6.4 自检

两个无头 Chrome 脚本，分工不同，提交前都要跑：

- `tools/smoke.js` 走正常路径：十个视图各自只有一个 `h1` 且内容非空、安装向导可前进后退且已选版本不丢、版本行能进入安装选项页且 Fabric 下 OptiFine 禁用 / Iris 自动带 Sodium / 回原版后恢复可选 / 开始安装后任务卡片标出附加组件、Mod 页加载器与类型筛选可组合且重置后恢复、Mod 安装弹窗能选实例并成功入队、安装任务悬浮球点开只列任务的悬浮面板、从面板跳到 Mod 页并收起面板、下载任务暂停后能继续并恢复速度、启动检查弹窗有 5 项、四个场景切换与复原、设置页保存条的出现与保存、启动子项的全屏开关与 Java 版本栏、默认安装路径的非法值拦截 / 合法值归一化与保存后各页目标目录跟随 / 浏览弹窗候选目录与选中其他磁盘后的高亮、实时摘要、未保存提示与恢复默认、主页账号栏三组切换与离线改名，共 94 项。
- `tools/edge.js` 只喂不合法输入与被改坏的数据：离线 ID 长度 / 字符 / 重名边界与 UUID 派生、微软与第三方账号只读、设置里并发 / 内存 / Java 的非法值、默认安装路径的相对路径 / 盘符根目录 / 通配符 / `..` / 结尾点 / 超长 / 空值、搜索框的脚本注入与 4000 字符关键字、`localStorage` 非法 JSON 与字段类型错误、账号 / 镜像 / 实例 / 任务为空或超限、进度超出总量时封顶 100%、负进度与总量为 0 时钳到 0、内容被下架或类型未知的任务、远古版只有原版加载器可用、非法下载源回落到自动、磁盘为 0 时禁用安装、脏附加组件任务、实例名为脚本片段时的转义、内存为 0 与磁盘为 0，以及 200 个任务 / 200 个实例时的渲染耗时，共 110 项。它用 `Page.addScriptToEvaluateOnNewDocument` 在每次导航前写好脏数据，测完再把注入脚本移除。

两个脚本都同时收集 `Runtime.exceptionThrown` 与 `Log` 的 error，任何一条都算失败。

截图用 `tools/screenshot.js`，参数格式与冒烟脚本一致（`url`、输出路径、宽高、分号分隔的步骤）。

## 7. 演示场景实现

| 场景 | 代码位置 | 实现方式 |
| --- | --- | --- |
| 正常网络 | `applyScenario("normal")` | 重置镜像与 Java 状态 |
| 慢速网络 | `slow` | 引擎把基线速度固定为 300 KB/s，镜像标记不稳定 |
| 镜像不可用 | `mirror-down` | 所有镜像 `status: down`；向导确认页禁用开始按钮，下载页顶部三段式提示 |
| 校验失败 | `checksum-fail` | 任务到 62% 时注入 SHA1 失败，前两次自动重下，第三次判定失败 |
| Java 缺失 | `java-missing` | `javaInstalled["jre-17"] = false`，启动检查第二项红叉并给下载入口 |
| OOM 崩溃 | `oom-crash` | 追加 ERROR 日志、打开诊断卡片、跳到日志页 |
| 首次使用 | `dev:fresh` | 清实例与任务，主页与实例页进入空状态 |

## 8. 与 PRD 的差异与口径调整

| 项 | PRD | 实现 | 原因 |
| --- | --- | --- | --- |
| 重复安装 | 提示「已安装」并给「打开已有实例 / 另建隔离实例」 | 提示「已安装」并给「打开已有实例 / 重新安装（保留存档）」 | 实例模型是「一个版本一个实例」，目录为 `instances/<版本名>/`，两个实例会抢同一个目录；已同步修改 PRD F2 |
| 版本列表性能 | 500 条不卡顿 | 只渲染 24 条，未做虚拟滚动 | 演示数据规模不够触发；v1 接真实清单时再按需分批渲染 |
| 实例文件浏览 | 只读展示 `saves/` 等 | 未实现，只给模拟路径 | 演示阶段不读磁盘；v1 与 IndexedDB / 文件系统一起做 |
| 日志窗口 | 启动后浮出可关闭的日志窗口 | 统一在「日志与诊断」页查看 | 浏览器形态没有独立窗口，用页面 + 提示条替代 |
| 托盘 / 开机自启 | P1 | 不实现 | 依赖桌面壳 |
| 微软登录 | 界面占位 | 界面占位 + 演示态说明 | 与 PRD 一致 |
| 内容目录 | 真实平台数据（Modrinth / CurseForge） | 24 条本地模拟数据，接口形态与真实目录对齐 | 演示阶段不联网；v1 只换数据源，不动渲染 |
| 加载器不匹配 | 走加载器安装向导 | 实例上的 `loader` 标记 + 安装选项页选的加载器；内容安装弹窗的「补加载器」仍是演示捷径 | 真实安装器解析与校验是独立复杂度，v2 再做；文案已标明是演示 |
| 安装选项页 | 由加载器安装器决定版本与组件 | 用 `LOADER_OPTIONS` / `EXTRA_OPTIONS` 的 `since` 与 `loaders` 模拟可用性，只把组件当清单文件 | 演示不联网、不解析安装器；体积与文件数是模拟值 |
| 内容任务速度 | 与版本任务同速 | 按类型给更低基线（1.7～2.6 MB/s） | 内容平台单文件限速，同速会让 3MB 的 Mod 一秒下完，反而不可信 |

## 9. 下一轮（v1）改造点

1. **桌面壳**：确定 Tauri / Electron / 原生后再动；界面层可整体复用。
2. **真实下载**：新增 `js/net/`，把 `engine.js` 的 `stepTasks` 换成真实队列驱动，任务字段保持不变；补 HTTP Range、SHA1、指数退避。
3. **存储分层**：书籍/实例/任务进 SQLite 或 IndexedDB，设置留 `localStorage`；`jingjie.state.v1` 升 `v2` 并写迁移。
4. **Java 管理**：真实探测 `java -version`、下载 JRE、校验目录下的 `bin\java.exe`。
5. **日志窗口**：接真实进程 stdout，按行做级别解析与崩溃特征匹配。
6. **内容目录接真**：新增 `js/net/content.js` 调 Modrinth API，保持 `CONTENT` 的字段与 `contentPlan()` 的清单结构不变；安装选项页接真实的 Fabric / Forge / NeoForge 与 OptiFine 构建清单，`LOADER_OPTIONS` / `EXTRA_OPTIONS` 换成接口数据，把模拟的 `addons` 文件换成本体与校验值。
