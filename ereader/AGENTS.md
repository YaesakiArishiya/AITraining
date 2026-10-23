# AGENTS.md · 页间（电子书阅读器）

本文件面向在本项目中工作的 AI 代理（Codex、Copilot、Cursor 等）与人类协作者，说明项目定位、启动方式与硬性约定。开始改动前请先读完本文件，再读 `docs/PRD.md` 与 `docs/TECH_DESIGN.md`。

## 1. 项目是什么

- **页间**：一个本地电子书阅读器，书在本地、进度也在本地，不登录、不上传、不联网。
- **形态**：桌面应用，以可安装的 PWA 交付（Chrome / Edge），不做移动端。
- **当前阶段（v1）**：真实导入已接通。EPUB 与 TXT 都在本机解析成 `{ chapters: [{ title, blocks }] }`，目录跳章、上下章、进度记忆、阅读设置走的是真实章节数据；书架初始的三本书仍是 `js/mock.js` 的示例数据。PWA、IndexedDB、书内图片与原始排版留在下一轮，差异清单见 `docs/TECH_DESIGN.md` 第 9 节。
- **迭代**：v0 是纯界面演示（`mock.js` 伪造正文），v1 换成真实解析，见 `docs/PRD.md` 3.4。
- **技术栈**：HTML + CSS + 原生 JavaScript（ES2022）。零运行时依赖、零构建工具、无框架、无 CDN。
- **目标形态**：静态站点 + Service Worker + IndexedDB，安装为独立窗口后离线可用。

## 2. 怎么跑起来

只需要 Node（仅用于起一个静态服务器，不装任何依赖）：

```bash
cd ereader
node serve.js 5181
# 浏览器打开 http://localhost:5181/
```

- 端口可换：`node serve.js 5182`。
- 没有 `npm install`、没有 `npm run build`，改完文件刷新页面即生效。
- 演示数据存在浏览器 `localStorage` 的 `yejian.state.v1` 里。页面底部的「重置演示数据」是推荐的复位方式；也可以手动 `localStorage.removeItem("yejian.state.v1")`。
- 导入测样本：`samples/山中来信.epub`（4 章，规范 ZIP：`mimetype` 首位不压缩、路径用正斜杠）与 `samples/夜航.txt`（5 章）。直接拖到书架上即可。
- 书架底部「载入一本示例书」会依次导入 `mock.js` 里的备用书，用来演示示例书架。
- 截图用 `tools/screenshot.js`（无头 Chrome，最后一个参数是分号分隔的选择器，依次点击后再截图）：

```bash
# 书架（先把两本样本导入，能看到 EPUB / TXT 两种来源）
node tools/screenshot.js http://localhost:5181/ ../screenshots/11-ereader-shelf.png 1440 1000 "import:samples/山中来信.epub;import:samples/夜航.txt"

# 阅读页 + 目录抽屉
node tools/screenshot.js http://localhost:5181/ ../screenshots/11-ereader-toc.png 1440 1000 "import:samples/山中来信.epub;#book-grid li:first-child .card__open;#toc-btn"

# 文档查看页
node tools/screenshot.js "http://localhost:5181/docs/view.html?doc=TECH_DESIGN" ../screenshots/11-ereader-tech-design.png 1440 1000
```

- 改完必须手动走一遍第 7 节的验收清单，本项目没有自动化测试页面。

## 3. 目录结构

| 路径 | 职责 | 修改注意 |
| --- | --- | --- |
| `index.html` | 两个视图（书架 / 阅读）+ 抽屉 + 弹窗 | 标题层级见 4.4 |
| `css/base.css` | 设计令牌（颜色、圆角、阴影、缓动）、重置、通用控件 | 颜色改动要重新看对比度 |
| `css/app.css` | 书架、阅读、抽屉、导入浮层、响应式 | 复用已有类，不写一次性样式 |
| `js/mock.js` | 三本示例书与段落池 | 只放数据，不写 DOM 逻辑 |
| `js/epub.js` | ZIP 读取、OPF / NAV / NCX 解析、章节清洗、TXT 解析 | 只做解析，不碰 DOM；两种格式返回同一数据形状 |
| `js/app.js` | 书架渲染、阅读、目录、设置、导入、进度、键盘 | 现阶段入口；后续按 `js/store`、`js/ui` 拆分 |
| `samples/` | 导入自测样本（一本 EPUB、一本 TXT） | 样本要规范：正斜杠路径、`mimetype` 不压缩 |
| `tools/screenshot.js` | 无头 Chrome 截图，可带点击步骤 | 依赖本机 Chrome / Edge |
| `serve.js` | 零依赖静态预览服务器 | 不要删除，这是交付物 |
| `docs/PRD.md` | 需求、范围、迭代记录、验收清单 | 行为变化先改这里 |
| `docs/TECH_DESIGN.md` | 技术方案、数据结构、实现差异清单 | 实现偏离方案时同步更新 |
| `docs/view.html` | 文档查看页，渲染上述三份 Markdown | 只读展示，不承载业务逻辑 |

真实实现的目标目录（见 `TECH_DESIGN.md` 第 2 节）：`js/epub/`（ZIP、OPF、章节清洗）、`js/store/`（IndexedDB、进度、设置）、`js/ui/`（书架、阅读、抽屉）。v1 先把解析集中在 `js/epub.js` 单文件，迁移时按模块整体搬，不要新旧逻辑混在同一个文件里。

## 4. 硬性约定

### 4.1 依赖与构建

- 不引入任何 npm 包、CDN 资源、CSS 框架或 UI 库。
- 不引入打包工具（Webpack、Vite、esbuild 都不行）。
- 不引入 Electron、Tauri 或任何桌面壳；需要系统级能力时先改文档、再单独评估。
- 浏览器能力全部来自原生 API：`DecompressionStream`、`DOMParser`、`crypto.subtle`、`IndexedDB`、`Service Worker`。

### 4.2 JavaScript

- 新代码使用 ES Module（`<script type="module">`）。`js/app.js` 已是 ES Module（`import { parseEpub, parseTxt } from "./epub.js"`）；`js/mock.js` 仍是 IIFE，只提供示例数据。
- 缩进 2 空格，字符串用双引号，语句结尾写分号，只用 `const` / `let`。
- 命名：函数与变量 `camelCase`，常量 `UPPER_SNAKE_CASE`，DOM id 用 kebab-case。
- 插入文本一律用 `textContent` 或已有的 `escapeHtml()`；禁止用 `innerHTML` 拼接书名、作者等外部数据。
- 事件用委托，不为列表项逐个绑定；新增交互同时考虑空数据、键盘操作、减少动效三种状态。
- 注释用中文，说明「为什么这样做」，不重复代码字面意思。

### 4.3 CSS

- 颜色、圆角、阴影、缓动只能来自 `:root` 变量；三套主题（`light` / `sepia` / `dark`）通过 `data-theme` 切换，不写第二套硬编码色值。
- 类名沿用现有 `block__element` 形式，状态类用 `is-*`。
- 不使用 `!important`，优先级冲突先调整结构。
- 断点最终只按 `900px` 一档设计（≥900px 抽屉悬浮，<900px 抽屉覆盖正文）。现有 720 / 640 / 420 的窄屏规则是「只做桌面」决策之前的遗留，不再扩展，重构时合并到 900px。
- 动画与过渡必须放在 `@media (prefers-reduced-motion: no-preference)` 内，或在 `reduce` 下显式关闭。

### 4.4 HTML 与无障碍

- 页面只有一个 `h1`（书架视图的「我的书架」），阅读视图打开时它随书架一起隐藏；章节标题用 `h2`，不要补第二个页面级标题。
- 图标按钮必须有 `aria-label` 或可读文本；装饰性 SVG 加 `aria-hidden="true"`。
- 抽屉是 `role="dialog" aria-modal="true"`，打开时焦点进抽屉并锁在里面，Esc 关闭后焦点回到触发按钮。
- 保留 `.skip-link` 与 `:focus-visible`，不为了视觉效果移除。
- 正文用 `<iframe sandbox="allow-same-origin">` 渲染，永不加 `allow-scripts`。

### 4.5 数据与隐私

- 书籍内容、封面、进度、设置全部留在本机：v1 存在 `localStorage`（`yejian.state.v1`），目标形态是书籍与进度进 IndexedDB、设置进 `localStorage`。
- 不向任何服务器发送书籍内容、阅读行为或文件信息；书内的远程资源必须拦截，做到「不上传也不外连」。
- 修改 `localStorage` 键名或数据结构时必须升版本（`yejian.state.v1` → `v2`）并写迁移，不允许直接覆盖旧数据。
- 进度存「章节 + 块序号 + 块内比例」（见 `TECH_DESIGN.md` 4.4），不要退回只用百分比；书架展示的百分比是派生值。

### 4.6 文档优先

- 涉及功能范围、数据模型、验收标准的变化，先改 `docs/PRD.md`，再改 `docs/TECH_DESIGN.md`，最后写代码。
- 代码与文档冲突时，先判断是文档过期还是实现跑偏，改完同步另一方，不留悬空描述。

## 5. 关键实现约束（避免踩坑）

v1 的正文是清洗后的纯文本块（`blocks`），下面几条是下一轮接 iframe、IndexedDB 时不能丢的约束。

- **样式隔离**：书籍自己的 CSS 不能污染产品 UI；正文一律在 iframe 里，注入的产品样式放在最后并提高选择器层级。
- **滚动只有一层**：iframe 不内部滚动，高度撑满整章，由外层 `#reader-scroll` 统一滚动；否则沉浸模式与进度计算会出现两套坐标系。
- **位置恢复**：恢复位置用块级元素锚点，不要只用像素百分比，否则改字号后会跳到别的段落。
- **保存时机**：切章、滚动停止 700ms、页面隐藏、`beforeunload` 四处触发，写入前节流。
- **导入失败不阻塞**：坏文件只影响自己，书架其他书保持可读，提示要具体（「不是有效的 EPUB」而不是「出错了」）。
- **设置生效不重排**：字号、行距、页宽、主题都通过 CSS 变量改，改完保持当前阅读位置。
- **ZIP 路径归一化**：中央目录里的 `\` 一律换成 `/`。Windows 的 `Compress-Archive` 会写出反斜杠，不归一化就会出现「文件在包里却读不到」。

## 6. 禁区

- 不提交 `node_modules`、构建产物或任何锁文件。
- 不删除 `serve.js` 与 `docs/`，它们是交付物。
- 不在仓库写入真实密码、Token、API Key。
- 不把书内 HTML 直接插进主文档，不用 `innerHTML` 渲染未清洗的书籍内容。
- 不为了演示效果伪造「已解析真实 EPUB」的结论；演示数据必须在文案与代码注释里标明是模拟的。
- 不在未更新文档的情况下扩大范围（例如顺手加笔记、书城、云同步）。

## 7. 验收清单

每次提交前手动过一遍：

- [ ] `node serve.js 5181` 能启动，书架显示 3 本示例书。
- [ ] 拖入 `samples/山中来信.epub`：书架出现「山中来信 / 林深 / EPUB」，打开能读到 4 章，目录 4 项且高亮同步。
- [ ] 拖入 `samples/夜航.txt`：切成 5 章，书名「夜航」、作者「林深」正确，目录 5 项。
- [ ] 拖入 `.pdf` 等不支持的文件，提示「只支持 .epub 或 .txt 文件」，书架不变。
- [ ] 同一个文件导入两次，提示「这本书已经在书架上了」。
- [ ] 「载入一本示例书」新增一本，排序切到「最近添加」时置顶。
- [ ] 打开书能读，上下章按钮、方向键、点击左右边缘三种方式都能翻章。
- [ ] 目录抽屉打开后当前章高亮，跳章后正文与高亮一致。
- [ ] 改字号 / 主题 / 行距 / 页宽后位置不跳回章节开头，刷新后设置仍生效。
- [ ] 关闭页面再打开，回到上次的章节与位置；导入的书仍在书架上。
- [ ] 删除书籍有二次确认，删除后进度一并清除，其他书不受影响。
- [ ] 键盘走查：Tab 到每个按钮，焦点可见；抽屉内焦点不逃逸；Esc 关闭抽屉与沉浸模式。
- [ ] 窗口缩到 1024 × 700 时布局不破；系统开启「减少动态效果」后首屏内容仍可见。
- [ ] 控制台无报错，无网络请求（除本地静态资源）。

## 8. 常见任务

### 新增一本示例书

1. 在 `js/mock.js` 用 `build()` 生成对象，补 `id`、`title`、`author`、`genre`、`hue`、`seed`、`titles`。
2. 放进 `YEJIAN_DATA.books`（初始书架）或 `extras`（导入时依次取用）。
3. 刷新书架，确认封面、字数、目录数量正常。

### 修改阅读设置的档位

1. 先改 `docs/PRD.md` F6 的档位描述。
2. 同步 `index.html` 里 `.seg` 的按钮与 `SETTINGS_DEFAULT`。
3. 确认改档后不跳位，且刷新后仍是新档位。

### 用真实文件自测导入

1. 拖入 `samples/山中来信.epub` 与 `samples/夜航.txt`，确认章节数、书名、作者、目录项都对。
2. 再拖一个不支持的格式与一个已知损坏的文件，确认提示具体、书架不受影响。
3. 需要重新生成 EPUB 样本时注意规范：`mimetype` 必须是第一个条目且不压缩，条目路径用正斜杠。

### 接入 IndexedDB（下一步）

1. 先改 `docs/TECH_DESIGN.md` 第 9 节与 `PRD.md` 的数据小节，写清迁移策略。
2. 新建 `js/store/`，只搬存储层，页面其余逻辑不动；`yejian.state.v1` 升到 `v2` 并写读旧数据的迁移。
3. 迁完跑一遍第 7 节清单，重点看「刷新后书还在、位置还在」。

### 本地数据异常

1. 先看 `localStorage` 的 `yejian.state.v1` 是否结构完整。
2. 用底部「重置演示数据」恢复；仍异常再看控制台报错，不要直接改键名绕过。

## 9. 沟通约定

- 修改前说明要动的文件与原因，一次提交只做一类改动。
- 提交信息前缀：`feat:` / `fix:` / `docs:` / `test:` / `chore:`。
- 需求不确定时先提问，不自行扩大范围；技术与产品的取舍记录在 `docs/TECH_DESIGN.md` 的决策摘要里。
