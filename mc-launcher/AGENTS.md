# AGENTS.md · 镜界（Minecraft 启动器）

本文件面向在本项目中工作的 AI 代理与人类协作者。开始改动前先读完本文件，再读 `docs/PRD.md` 与 `docs/TECH_DESIGN.md`。

## 1. 项目是什么

- **镜界**：对标 PCL2 的 Windows Minecraft 启动器，核心是把「镜像下载 + 版本隔离 + 内容落位 + 启动诊断」做顺。
- **范围**：版本安装提供「安装选项页」——不装加载器（纯净版）/ Fabric / Forge / NeoForge，可再勾高清修复（OptiFine）、性能优化（Sodium）与光影支持（Iris）；在此之上提供内容下载中心（Mod / 整合包 / 材质包 / 光影）。加载器与附加组件只作为清单里的模拟文件，**不解析也不执行真实的 Forge / Fabric 安装器**。
- **平台**：仅 Windows 10（1809+）/ 11 x64；路径、Java 检测、目录文案只按 Windows 写。
- **当前阶段（v0）**：纯静态界面演示 + **假进度**。不联网、不写真实 `.minecraft`、不启动游戏；内容目录是本地模拟数据，不联 Modrinth / CurseForge。
- **技术栈**：HTML + CSS + 原生 JavaScript（ES Module），零依赖、零构建、无 CDN。

## 2. 怎么跑起来

```bash
cd mc-launcher
node serve.js 5182
# 浏览器打开 http://localhost:5182/
```

- 端口可换：`node serve.js 5183`。
- 没有 `npm install`，改完刷新即生效。
- 状态存在 `localStorage` 的 `jingjie.state.v1`；右下角「演示场景」→「重置演示数据」是推荐的复位方式。
- 冒烟检查（无头 Chrome，检查十个视图、版本安装选项页的加载器与附加组件联动、Mod 加载器与类型筛选、向导、内容安装、安装任务悬浮球与面板、暂停继续、启动检查、场景切换、设置保存、默认安装路径（含换盘后的高亮与未保存提示）、主页账号切换，共 94 项）：

```bash
node tools/smoke.js            # 默认检查 http://localhost:5182/
```

- 边界检查（无头 Chrome，只喂非法输入与被改坏的数据：ID 边界、设置与安装路径非法值、脚本注入、坏 `localStorage`、空 / 超限数据、远古版加载器限制、脏任务与脏附加组件、极端数值与 200 条数据，共 110 项）：

```bash
node tools/edge.js             # 同样默认检查 http://localhost:5182/
```

- 截图（无头 Chrome，最后一个参数是分号分隔的步骤）：

```bash
node tools/screenshot.js http://localhost:5182/ ../screenshots/12-mc-home.png 1440 1000
node tools/screenshot.js http://localhost:5182/ ../screenshots/12-mc-logs.png 1440 1000 "js:[...document.querySelectorAll('[data-action]')].find(function(e){return e.dataset.action==='dev:scenario'&&e.dataset.scenario==='oom-crash'}).click();wait:800"
node tools/screenshot.js http://localhost:5182/ ../screenshots/13-mc-mods.png 1440 1000 "js:document.querySelector('[data-route=mods]').click();wait:600"
node tools/screenshot.js http://localhost:5182/ ../screenshots/13-mc-mod-install.png 1440 1000 "js:document.querySelector('[data-route=mods]').click();wait:500;js:[...document.querySelectorAll('[data-action]')].find(function(e){return e.dataset.action==='content:install'}).click();wait:800"
node tools/screenshot.js http://localhost:5182/ ../screenshots/14-mc-install-options.png 1440 1000 "[data-route=versions];wait:500;tbody tr:first-child;wait:600"
```

## 3. 目录职责

| 路径 | 职责 | 修改注意 |
| --- | --- | --- |
| `index.html` | 应用外壳：标题栏、导航、主区域、状态栏、弹窗、场景面板 | 只放骨架，视图由 JS 渲染 |
| `css/base.css` | 设计令牌、重置、通用控件（按钮/输入/开关/进度条/表格） | 颜色只能来自 `:root` 变量 |
| `css/app.css` | 外壳与十个视图的布局、弹窗、提示条、内容卡片 | 复用已有类，不写一次性样式 |
| `js/mock.js` | 版本、镜像、Java、账号、任务、日志、诊断样本、内容目录、加载器与附加组件选项、默认安装路径的候选项 | 只放数据，不写 DOM 与计时器 |
| `js/engine.js` | 文件清单（版本与内容两种）、假下载推进、进度派生、镜像探测 | 不碰 DOM，不读 `localStorage` |
| `js/app.js` | 状态、渲染、事件委托、弹窗、演示场景 | 插入文本一律 `esc()` |
| `serve.js` | 零依赖静态预览服务器 | 交付物，不删除 |
| `tools/smoke.js` | 冒烟检查：视图渲染、向导、暂停继续、启动检查、场景切换 | 新增视图或动作时同步补一条检查 |
| `tools/edge.js` | 边界检查：非法输入、坏数据、空 / 超限、极端数值 | 新增输入或状态字段时同步补一条边界 |
| `tools/screenshot.js` | 无头 Chrome 截图，可带点击/等待 | 依赖本机 Chrome / Edge |
| `docs/PRD.md` | 需求、规则、验收项 | 行为变化先改这里 |
| `docs/TECH_DESIGN.md` | 数据结构、假进度引擎、与 PRD 的差异 | 实现偏离方案时同步更新 |

## 4. 硬性约定

### 4.1 依赖与形态

- 不引入 npm 包、CDN 资源、CSS 框架、图标库或打包工具。
- 不引入 Electron / Tauri / 原生外壳：壳的选型尚未确定，本期只做静态界面。
- 不新增后端、数据库或第三方接口；所有数据在浏览器内。

### 4.2 JavaScript

- ES Module（`<script type="module">`），不污染全局；`mock.js` 只导出数据。
- 缩进 2 空格，双引号，语句结尾分号，只用 `const` / `let`。
- 命名：函数与变量 `camelCase`，常量 `UPPER_SNAKE_CASE`，DOM id 用 kebab-case。
- 插入文本用 `textContent` 或 `esc()`；禁止把外部数据直接拼进 `innerHTML`。
- 事件用 document 级委托，动作写成 `data-action` 并登记到 `actions` 表。
- 注释用中文，说明「为什么」，不复述代码字面意思。

### 4.3 CSS

- 颜色、圆角、阴影、缓动只能来自 `:root` 变量；两套主题靠 `data-theme` 切换，不写第二套硬编码色值。
- 类名用 `block__element`，状态类用 `is-*`。
- 不使用 `!important`；优先级冲突先调整结构。
- 动画与过渡要照顾 `prefers-reduced-motion`。
- 布局按 1024 × 700 起，≤1080px 导航收成图标栏；不新增移动端断点。

### 4.4 HTML 与无障碍

- 每个视图只有一个 `h1`（由当前视图提供，切换视图时整块替换）。
- 图标按钮必须有 `aria-label`；装饰性 SVG 加 `aria-hidden="true"`。
- 弹窗是 `role="dialog" aria-modal="true"`，打开时焦点进入弹窗、Tab 不逃逸、Esc 关闭并回到触发元素。
- 保留 `.skip-link` 与 `:focus-visible`。
- 正文对比度 ≥ 4.5:1；危险操作必须二次确认并写清后果。

### 4.5 数据与隐私

- 演示数据必须是模拟的，并在界面文案里标明（标题栏「演示数据」、状态栏声明、关于页声明）。
- 不发起真实网络请求，不读写真实 `.minecraft` 目录，不启动游戏进程。
- 模拟路径统一以 `C:\Users\Demo\AppData\Roaming\minecraft\` 开头。
- 改 `localStorage` 结构必须升版本（`jingjie.state.v1` → `v2`）并写迁移。

### 4.6 文案

- 失败提示固定三段式：**发生了什么 → 可能的原因 → 可以做什么**。
- 不写「出错了」「失败了」这类无信息文案。
- 加载/探测/校验超过 1.5 秒必须有进行中状态，禁止静默。

## 5. 假进度的不可回退约束

这些是「看起来像真的」的来源，改代码时不要顺手简化：

1. 进度按**字节**推进，文件计数由字节位置反查，不单独维护计数器。
2. 速度不是直线：目标速度 ±30% 波动，允许短暂掉到 0 再爬升。
3. 换文件要有 50～150ms 停顿，否则像在播动画。
4. 校验阶段单独一条进度，不与下载共用进度条。
5. 完成后停在 100% 0.5 秒，再切「已完成」。
6. 暂停立即冻结数字，继续从冻结值接着走，不回退重算。
7. 刷新后任务恢复为暂停，进度保留，不从头开始。

## 6. 禁区

- 不做真实的加载器安装：不解析、不执行 Forge / Fabric / NeoForge 安装器，也不下载加载器与 OptiFine 本体；安装选项页里的 `addons` 只是写进假清单的模拟文件。
- 不做「下载完成自动拉起游戏」的假动作。
- 不把演示数据包装成真实下载结果；不伪造「已连接网络」。
- 不删除 `serve.js` 与 `docs/`。
- 不提交 `node_modules`、构建产物或锁文件。
- 不在未更新文档的情况下扩大范围（例如顺手加笔记、账号登录、云同步）。

## 7. 验收清单

每次提交前手动过一遍（对应 PRD 第 9 节）。先跑 `node tools/smoke.js` 与 `node tools/edge.js`：前者覆盖十个视图渲染、版本安装选项页、Mod 加载器与类型筛选、安装向导、内容安装、安装任务悬浮球与面板、暂停继续、启动检查、场景切换、设置保存、默认安装路径与主页账号切换（94 项），后者覆盖非法输入、坏数据、空 / 超限数据、远古版加载器限制与极端数值（110 项）；两个脚本都要求全部通过且页面无报错。剩下的靠手动走查：

- [ ] `node serve.js 5182` 能启动，主页显示最近实例、推荐版本与镜像状态。
- [ ] 版本页可搜索 `1.20`、按类型筛选、切换排序；「只看已安装」正确。
- [ ] 点任意版本行进入安装选项页：加载器四选一，附加组件三个开关，摘要随选择更新。
- [ ] Fabric 下 OptiFine 禁用并写明「需要 原版 / Forge 加载器」；勾 Iris 自动带上并锁定 Sodium；切回原版 OptiFine 恢复可选。
- [ ] 点远古版（a1.2.6）只剩「不装加载器」，附加组件全部禁用并说明没有对应构建。
- [ ] 开始安装后跳到安装任务页，任务卡片标出加载器 / 附加组件，合计体积与文件数包含追加项。
- [ ] 安装完成后实例页的版本行显示「Fabric + Iris」这类组合；对已有实例重装会更新组合，存档不动。
- [ ] 安装向导三步可前进后退，返回后版本与源仍保留；确认页能跳到安装选项页。
- [ ] 左侧「下载」能展开/收起，五个子项都能打开对应视图，当前项有高亮。
- [ ] 右下角悬浮球：有进行中或失败任务时显示任务数与总体进度；点开是只列任务的悬浮面板（不跳页），面板里能暂停 / 继续，底部能跳到五个下载分类和完整任务页；站在安装任务页或没有需要关注的任务时收起。
- [ ] Mod 页可搜索、按游戏版本 / 加载器 / 类型筛选、切换排序，三个条件可组合；材质包与光影不出现加载器、类型与版本筛选。
- [ ] Mod 安装弹窗能选实例，不兼容的实例禁用并写明原因；「开始下载」入队后跳到下载中心。
- [ ] 整合包安装后新建实例，重名自动加 `#2`；实例配置里能看到已安装内容。
- [ ] 卸载内容后「已安装」区块与实例配置同步减少，其他内容不受影响。
- [ ] 下载中能看到速度、已下载 / 总量、文件计数、当前文件、当前源。
- [ ] 暂停后所有数字冻结，继续后从暂停点接着走。
- [ ] 「校验失败」场景：62% 处失败，出现「第 N 次重新下载」，第 3 次判定失败。
- [ ] 「镜像不可用」场景：确认页禁用开始，下载页给出三段式提示与换源入口。
- [ ] 「Java 缺失」场景：启动检查第二项红叉，启动按钮禁用，点「下载 JRE」能恢复。
- [ ] 「OOM 崩溃」场景：日志高亮 ERROR，顶部出现诊断摘要与四条建议。
- [ ] 「模拟首次使用」后，主页与实例页进入空状态并给安装入口。
- [ ] 设置 → 存储里能改默认安装路径：手填 `D:/Games/Minecraft/` 保存后变成 `D:\Games\Minecraft`，版本详情、安装选项页、安装向导与「打开目录」都显示新根目录；填 `minecraft`、`C:\`、`D:\Games\Mi*ne` 会标「待修正」并拒绝保存。
- [ ] 点「浏览…」能从候选目录里挑一个，确定后回填输入框但还没保存；「恢复默认」回到 `C:\Users\Demo\AppData\Roaming\minecraft`。
- [ ] 深浅主题都无对比度不足；1024 × 700 下布局不破。
- [ ] 键盘可完成「选版本 → 安装 → 启动」；Esc 关闭弹窗与场景面板。
- [ ] 降低动态效果后，首屏内容仍完整可见。
- [ ] 控制台无报错，Network 面板没有任何外部请求。

## 8. 常见任务

### 新增一个版本

1. 在 `js/mock.js` 的 `RELEASE_ROWS` / `SNAPSHOT_ROWS` / `OLD_ROWS` 追加行：版本号、发布日期、Java 主版本、体积、文件数。
2. 刷新版本页，确认文件数、体积、Java 标签正确；安装一次确认文件计数与体积对得上。

### 新增一个加载器或附加组件

1. 先改 `docs/PRD.md` F2b 的可用性规则与 `docs/TECH_DESIGN.md` 第 5.1 节。
2. 在 `js/mock.js` 的 `LOADER_OPTIONS` / `EXTRA_OPTIONS` 追加条目：`id`、`short`、`name`、`desc`、`sizeBytes`、`fileCount`、`since`、`loaders`（附加组件）、`requires`（依赖）、`path`。
3. 不需要改 `app.js`：可用性由 `since` 与 `loaders` 推导，追加文件由 `planAddons()` 自动进清单。
4. 刷新安装选项页，确认不可用时写明原因、勾选依赖会自动补齐、合计体积与文件数正确。

### 新增一个演示场景

1. 先改 `docs/PRD.md` 第 7 节与 `docs/TECH_DESIGN.md` 第 7 节。
2. 在 `js/mock.js` 的 `SCENARIOS` 加条目，在 `js/app.js` 的 `applyScenario` 写副作用（重置 / 注入 / 阻断）。
3. 确认切回「正常网络」能把状态复原。

### 新增一项内容（Mod / 整合包 / 材质包 / 光影）

1. 先确认 PRD F10 的兼容性规则没变；要加新的内容类型先改文档。
2. 在 `js/mock.js` 的 `CONTENT` 用 `contentItem()` 追加条目：`kind`、`slug`、`name`、`author`、`version`、`fileName`、`hue`、`description`、`mcVersions`（整合包用 `mcVersion`）、`loaders`（整合包用单值 `loader`）、`category`（仅 Mod：`performance` / `gameplay` / `utility` / `visual`）、`requires`、`tags`、`downloads`、`updatedAt`、`mainBytes`。
3. 体积与文件数由 `contentItem()` 从主文件 + 依赖推导，不要手写 `sizeBytes` / `fileCount`。
4. 刷新对应分类页，确认卡片数量、体积、可安装实例与落位目录都对；装一次看下载中心的文件清单。

### 调整假进度的观感

1. 只改 `js/engine.js` 的速度系数、停顿区间、校验时长；不要改数据结构。
2. 改完看三件事：速度曲线是否有波动、文件切换是否有停顿、暂停/继续是否跳变。

### 接入真实下载（下一步）

1. 先改 `docs/TECH_DESIGN.md` 第 9 节，写清任务字段与迁移。
2. 新建 `js/net/`，保持 `task` 字段不变，只把推进来源从计时器换成真实队列。
3. 迁完跑第 7 节清单，重点看「暂停继续」「失败重试」「刷新恢复」。

## 9. 沟通约定

- 修改前说明要动的文件与原因，一次提交只做一类改动。
- 提交信息前缀：`feat:` / `fix:` / `docs:` / `test:` / `chore:`。
- 需求不确定时先提问；产品与技术的取舍记录在 `docs/TECH_DESIGN.md` 第 8 节。
