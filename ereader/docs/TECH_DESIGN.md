# 电子书阅读器 技术方案（v0.1）

| 项目 | 内容 |
| --- | --- |
| 产品名称 | 页间（暂定名） |
| 文档版本 | v0.2（含 v1 实现差异） |
| 更新日期 | 2026-10-21 |
| 关联文档 | `PRD.md`、`AGENTS.md` |
| 状态 | v1 已落地读链路，其余按第 9 节推进 |

## 0. 决策摘要

| 决策项 | 结论 | 依据 |
| --- | --- | --- |
| 产品形态 | 桌面 PWA：静态站点 + 安装到桌面 | 只做桌面；安装后可离线、可关联 `.epub` 文件 |
| 是否用 Electron | 不用 | 需求里没有系统级能力；安装包与内存成本换不到对应价值 |
| 运行时依赖 | 0 个 | 解压用 `DecompressionStream`，XML 用 `DOMParser`，无需引库 |
| 构建工具 | 无 | ES Module 直接跑，改完刷新即生效 |
| 存储 | IndexedDB（书与进度）+ localStorage（设置） | 书籍体积远大于 localStorage 上限 |
| 正文隔离 | 每章一个 `iframe`，`sandbox="allow-same-origin"` | 原书 CSS 不能污染产品 UI |
| 位置锚点 | 章节序号 + 块序号 + 块内比例 | 像素百分比在改字号后会漂 |

后续若出现托盘常驻、目录监听、开机自启这类系统级需求，再用 Tauri 2 套壳；业务代码不需要重写，Electron 不在候选里。

## 1. 运行形态

- 交付物是一个静态目录，部署到 Vercel / Cloudflare Pages 或任意静态服务器。
- Chrome / Edge 打开后通过地址栏「安装」进入独立窗口（`display: standalone`）。
- `manifest.webmanifest` 里注册 `file_handlers`，安装后可双击 `.epub` 直接进入阅读；未安装时仍可用「导入」按钮和拖拽。
- 最低窗口 1024 × 700；不再做手机布局。

## 2. 目录结构

```
ereader/
  AGENTS.md           协作约定与验收清单
  index.html          两个视图：书架 / 阅读
  manifest.webmanifest（待补）
  sw.js               Service Worker，无依赖普通脚本（待补）
  css/
    base.css          设计令牌与重置
    app.css           书架、阅读、抽屉、导入浮层
  js/
    app.js            书架、阅读、目录、设置、导入、进度、键盘
    epub.js           ZIP 读取 + OPF / NAV / NCX + 章节清洗 + TXT 解析（v1 实现）
    mock.js           示例书与段落池（仅示例数据）
    epub/  store/  ui/   目标拆分，见下方说明
  samples/
    山中来信.epub      规范样本：mimetype 首位不压缩，路径用正斜杠
    夜航.txt           规范样本：书名 / 作者行 + 五章标题
  docs/
    PRD.md
    TECH_DESIGN.md
    view.html         文档查看页（渲染上述 Markdown）
  tools/
    screenshot.js     无头 Chrome 截图（支持点击步骤）
```

`js/epub/`（zip、opf、chapter）、`js/store/`（db、progress、settings）、`js/ui/`（shelf、reader、drawer）是目标拆分；v1 先把解析集中在 `js/epub.js` 单文件，等接入 IndexedDB 时按模块整体搬走，不新旧混放。

仓库里不出现 `package.json`、`node_modules` 或打包配置文件。`mock.js` 只保留示例书数据，导入的书全部走真实解析。

## 3. 零依赖怎么做到

`package.json` 不出现，`node_modules` 不出现。所有能力来自浏览器 API：

- 解压：`DecompressionStream("deflate-raw")`（Chrome 80+ / Edge 80+）。
- XML / XHTML：`DOMParser`。
- 哈希去重：`crypto.subtle.digest("SHA-256", buffer)`。
- 封面缩略：`createImageBitmap` + `OffscreenCanvas`。
- 并发控制：`Promise` + 手写队列，不引 p-limit。
- 日期格式：`Intl.DateTimeFormat` / `Intl.RelativeTimeFormat`。

## 4. 关键实现

### 4.1 ZIP 读取

ZIP 最小实现约 120 行，只覆盖 EPUB 会遇到的子集：

1. 读取文件末尾 64KB，从后往前找 EOCD 签名 `0x06054b50`，取出中央目录偏移与条目数。
2. 遍历中央目录（签名 `0x02014b50`），记录 `name`、`compressionMethod`、`compressedSize`、`localHeaderOffset`。
3. 每个条目先读 30 字节本地头，跳过文件名与扩展字段，按 `compressedSize` 切片。
4. `method === 8` 走 `DecompressionStream("deflate-raw")`；`method === 0` 直接当明文。
5. 遇到 ZIP64 标记（`0xffffffff`）直接报「文件过大，暂不支持」，不静默出错。
6. 条目名里的反斜杠统一换成正斜杠：少数打包工具（含 Windows 的 `Compress-Archive`）会写 `OEBPS\ch1.xhtml`，不归一化就会出现「有文件却读不到」。

注意：`DecompressionStream` 只能处理 deflate 原始流，不能替代 CRC 校验；CRC 校验失败按「文件损坏」处理。

### 4.2 元数据与目录

按顺序解析，任一步失败都退到下一步，不允许整本书导入失败：

1. `META-INF/container.xml` → 第一个 `rootfile@full-path`。
2. 加密检测：存在 `META-INF/encryption.xml` 且包含 `EncryptedData` → 提示「加密 / DRM 书籍不支持」。
3. OPF：`dc:title`、`dc:creator`、`dc:language`、`manifest`、`spine`。
4. 封面查找顺序：`meta[name=cover]` → `properties="cover-image"` → manifest 里 id 含 `cover` 的图片 → 全书第一张图片 → 首字占位。
5. 目录：`nav.xhtml` 中 `epub:type="toc"` 的 `ol` → `toc.ncx` 的 `navMap` → 按 `spine` 生成「第 N 节」。
6. 章节清单以 `spine` 为准（决定阅读顺序），目录只负责展示与跳转。

### 4.3 章节渲染与样式隔离

采用 `iframe` 而不是 Shadow DOM：原书样式里大量 `html`、`body`、`@page` 选择器在 Shadow DOM 中不会命中，隔离不彻底。

- iframe 用 `srcdoc`，`sandbox="allow-same-origin"`：不给 `allow-scripts`，书里的脚本一律不执行；保留同源是为了父页面能读到它的 `scrollHeight` 做定位。
- 资源改写：图片、样式表按相对路径从 ZIP 取 Blob，换成 `blob:` URL；无法解析的换成占位。
- 清洗：删除 `script`、`iframe`、`object`、`embed`、`form`、`link[rel=prefetch]`；剥掉 `@import` 与所有 `http(s)://` 外链资源（隐私要求：不上传也不外连）。
- 最后注入一段产品自己的样式：正文字号、行距、段距、页宽、三套主题的底色与文字色，选择器写成 `html body ...` 保证压过原书规则。
- 高度策略：iframe 不内部滚动，加载完成（含图片）后把 `height` 设为文档 `scrollHeight`，由外层容器统一滚动。这样滚轮、`PageDown`、沉浸模式的显示/隐藏只在一处处理，也不会出现 iframe 内外两套滚动条。

### 4.4 阅读位置锚点

只记百分比在改字号后会漂，因此同时存两块数据：

```js
// 持久化结构（progress store）
{
  bookId: "sha256:…",
  spine: 2,          // 第几章，从 0 开始
  block: 5,          // 章节内第几个块级元素（p / h2 / blockquote / pre）
  offset: 0.42,      // 在该块高度内的比例，0~1
  percent: 0.31,     // 全书百分比，只用于书架展示
  cfi: null,         // 预留给 v0.2 的笔记锚点
  updatedAt: 1761021600000
}
```

保存：取正文容器顶部往下 4px 处的第一个块级元素，计算 `(容器顶部 - 块顶部) / 块高度`，夹在 0~1。
恢复：找到第 `block` 个块，`scrollTop = 块顶部 + 块高度 × offset`。字号变化后块高度变了，但落点仍在同一段，符合「位置不跳回章节开头」的验收项。

### 4.5 保存时机

与 PRD F5 一致，四处触发：切章、滚动停止 700ms、`visibilitychange` 隐藏、`beforeunload`。写入前做 200ms 节流，避免滚动时反复写库。

### 4.6 存储设计

IndexedDB 库名 `yejian`，版本 1，三个对象仓库：

```js
books     keyPath: "id"     // { id, title, author, language, cover: Blob, fileName,
                            //   size, addedAt, lastReadAt, spineCount, file: Blob }
progress  keyPath: "bookId" // 见 4.4
settings  keyPath: "key"    // { key: "reader", value: {...} }
```

- 存原始 EPUB 的 `Blob`，不存解析后的 HTML：章节按需解析，存储量与原文件 1:1；代价是每次打开重解析当前章（单章通常 < 50ms）。
- 去重：对文件内容算 SHA-256 作为 `id`，同一文件重复导入直接提示「已在书架」。
- 启动时调用 `navigator.storage.persist()`，避免空间紧张时书库被清；`navigator.storage.estimate()` 用于设置页显示占用。
- 删除书籍时同时删 `books`、`progress` 记录，并在事务里完成，避免留下孤儿进度。

### 4.7 离线与安装

- `manifest.webmanifest`：`name`、`short_name`、`start_url: "./index.html"`、`display: "standalone"`、`display_override: ["window-controls-overlay", "standalone"]`、图标 192/512、`file_handlers`、`launch_handler: { client_mode: "focus-existing" }`。
- `sw.js`：安装时预缓存 app shell（HTML、CSS、JS、图标）；导航请求用 `stale-while-revalidate`，静态资源用缓存优先；书籍数据不进缓存，全部走 IndexedDB。
- 版本升级：`CACHE_NAME` 带版本号，`skipWaiting` + `clients.claim`，页面监听 `controllerchange` 后提示刷新。
- 文件关联：`window.launchQueue.setConsumer` 取出 `FileSystemFileHandle`，转 `File` 后走与导入完全相同的流程。

### 4.8 安全与隐私

- 页面级 CSP：`default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'none'`。`unsafe-inline` 是书籍内联样式必需的，风险由 iframe 禁脚本兜住。
- 书内脚本一律不执行（sandbox 无 `allow-scripts`），不注入 `allow-popups`。
- 所有网络请求被 CSP 的 `connect-src 'self'` 与资源清洗双重拦截，保证「不上传也不外连」。
- 不使用 `innerHTML` 拼接书名、作者等元数据，统一走 `textContent`。

### 4.9 异常对照

| 场景 | 检测方式 | 用户看到 |
| --- | --- | --- |
| 不是 ZIP | 找不到 EOCD 签名 | 「这个文件不是有效的 EPUB」 |
| ZIP 损坏 / CRC 错 | 解压抛错 | 「文件可能已损坏，换一本试试」 |
| 加密 / DRM | `META-INF/encryption.xml` | 「这本书有加密保护，暂不支持」 |
| 缺 OPF | container 找不到 rootfile | 「解析不到书籍信息」 |
| 缺封面 | 封面查找链全部落空 | 书名首字占位，不出现破图 |
| 缺目录 | nav 与 ncx 都不存在 | 按 spine 生成「第 N 节」 |
| 存储写满 | `QuotaExceededError` | 「空间不足，先删掉几本不看的书」 |
| 文件关联未安装 | `launchQueue` 不存在 | 静默降级到拖拽导入 |

### 4.10 TXT 解析

TXT 没有结构，全靠启发式规则，目标是把「一大段文字」切成和 EPUB 一致的章节数组。

1. **解码**：BOM 优先（UTF-8 / UTF-16LE / UTF-16BE）；无 BOM 时先用 `TextDecoder("utf-8", { fatal: true })` 严格解码，抛错再退 `TextDecoder("gbk")`——中文 TXT 绝大多数是 GBK。
2. **元数据**：文件开头的「书名：…」「作者：…」行读成标题与作者，不混入正文；遇到第一个非空正文行后停止识别。
3. **切章**：正则 `^(第[0-9一二三四五六七八九十百千两]+[章节回卷部篇]|序章|序言|前言|楔子|引子|尾声|后记|番外|chapter N|#{1,3} 标题)`，且整行不超过 40 字，避免把正文里的「第二天」误判成标题。
4. **兜底切分**：整本只有一个段落块且超过 60 段时，按每 40 段生成「第 N 节」，防止几百页挤进一章、目录只有一项。
5. **段落**：优先按空行分段，空行少于 3 个时退化为按单换行分段；连续空白折叠成一个空格。
6. **上限**：单文件 100MB、200 章、160 万字符，超出部分截断并在书架提示。

结果对象与 `parseEpub` 完全一致（`id` 用文件名 + 大小 + 修改时间的哈希），因此书架、阅读、目录、进度四处都不需要判断格式。

## 5. 性能预算

| 环节 | 目标 | 手段 |
| --- | --- | --- |
| 5MB EPUB 导入到可读 | ≤ 3s | 只在 Worker 里解压 + 读 OPF，章节延后解析 |
| 单章解析与渲染 | ≤ 100ms | 只处理当前章，图片懒加载 |
| 滚动 | 60fps | iframe 一次设高，不重排；滚动监听只算进度 |
| 书架 50 本 | 首屏 ≤ 1s | 封面缩略到 320px 宽，`loading="lazy"` 由浏览器处理 |
| 字体调整 | 不闪白 | 注入 CSS 变量，不重建 iframe |

解析放 `js/epub` 的 Worker 入口（`new Worker(new URL("./epub/worker.js", import.meta.url), { type: "module" })`），结果用 `ArrayBuffer` 转移，避免结构化克隆开销。

## 6. 技术侧自测

1. 样本库：正常 EPUB 3、只有 `toc.ncx` 的 EPUB 2、无封面、无目录、加密、非 ZIP 六份文件，全部纳入仓库 `tests/fixtures/`（真实书籍裁剪到几百 KB）。
2. 主流程用 Playwright 串起来：导入 → 打开 → 跳章 → 改字号 → 刷新 → 位置一致。
3. 位置精度用脚本断言：改字号前后，当前位置所在段落索引不变。
4. 离线：装好后断网，冷启动仍能打开书。
5. 手工确认安装形态：独立窗口、无地址栏、双击 `.epub` 进入阅读、`Esc` 关闭抽屉后焦点归还。

## 7. 风险与备选

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 原书 CSS 压过注入样式 | 排版失控 | 注入样式放最后 + 提高选择器层级；仍冲突时按标签重置 |
| 超大章节（几万字一章） | iframe 很高，首次排版卡顿 | 章节内分片渲染，先出前 50 块，滚动到底再追加 |
| `DecompressionStream` 的浏览器差异 | 解压失败 | 目标只有桌面 Chrome/Edge，实测通过即可；真需要兜底再写 JS 版 inflate |
| PWA 安装率低 | 文件关联用不上 | 拖拽与选择文件始终保留为主路径，安装只是增强 |
| 图片体积导致渲染慢 | 单章变慢 | 图片先给占位尺寸，`decode()` 后替换；超过 2000px 宽先缩到容器宽 |

## 8. 与 PRD 的口径差异

- 放弃移动端：兼容范围收窄为桌面 Chrome / Edge，响应式只服务窗口缩放。
- 进度数据结构由「章节 + 百分比」升级为「章节 + 块 + 块内比例 + 百分比」，百分比降级为展示字段。PRD 中 F5 与验收项按此实现。
- 新增交付项：可安装 PWA、离线可用、`.epub` 文件关联。

## 9. v1 实现与目标的差异

v1 的目标是「能读真实文件」，因此先落地读链路，把重活留给下一轮。差异清单：

| 能力 | 目标方案（第 2–7 节） | v1 现状 | 下一步 |
| --- | --- | --- | --- |
| 解析模块 | `js/epub/{zip,opf,chapter}.js` 拆分 + Worker | `js/epub.js` 单文件，主线程解析 | 接 IndexedDB 时按模块搬走，再挪进 Worker |
| 正文渲染 | 每章一个 `iframe`，保留原书排版与图片 | 章节清洗成 `blocks[{type,text}]`，用产品自己的 `prose` 样式渲染 | 图片与原始排版放到下一轮；样式隔离风险因此暂时不存在 |
| 存储 | IndexedDB 存 `Blob` + 章节按需解析 | `localStorage` 存序列化后的章节文本；写入失败先丢正文保进度 | 书变大前迁移到 IndexedDB，`yejian.state` 升到 v2 并写迁移 |
| 位置锚点 | 章节 + 块序号 + 块内比例 | 章节 + 块序号 + 块内比例（`scrollTop` 与块顶部换算） | 保留，补改字号后的段落一致性断言 |
| 离线与安装 | manifest + Service Worker + 文件关联 | 未做 | D5 补齐 |
| 图片资源 | Blob URL 改写 | 跳过 `IMG`，正文只保留文字 | 与 iframe 方案一起做 |

这张表是文档与代码的对照口径：读 PRD 的验收项时，按 v1 现状判断勾选，不要把目标方案当成已实现。
