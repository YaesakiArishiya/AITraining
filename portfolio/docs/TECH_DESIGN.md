# 个人网站技术方案（TECH_DESIGN）

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 更新日期 | 2026-10-20 |
| 作者 | 朱泽恩 |
| 对应代码 | `portfolio/` |
| 部署方式 | Vercel / Cloudflare Pages（纯静态） |

## 1. 设计原则

1. **零运行时依赖**：没有框架、构建步骤和 CDN，克隆后直接双击即可运行。
2. **内容与渲染分离**：所有项目、文章与站点信息集中在 `js/data.js`，页面只负责渲染。
3. **渐进增强**：没有 JavaScript 时，导航、正文与链接仍然完整可读。
4. **本地优先**：表单与后台数据只写入浏览器，不发起任何内容上传请求。
5. **可验证**：每一处响应式与可访问性要求都有对应的自检页面。

## 2. 技术选型

| 层 | 选择 | 理由 |
| --- | --- | --- |
| 页面 | 原生 HTML5 | 无构建、可离线、SEO 友好 |
| 样式 | 原生 CSS（自定义属性） | 设计令牌集中管理，体积可控 |
| 交互 | 原生 JavaScript（ES2022） | 无需打包，直接运行 |
| 图形 | Canvas 2D / 内联 SVG | 星空背景与图标不依赖图片 |
| 内容 | `data.js` 全局常量 | 单文件维护，页面共享 |
| 后台 | localStorage + JSON 导入导出 | 静态部署即可演示完整流程 |
| 部署 | Vercel / Cloudflare Pages | 静态托管、自动 HTTPS、免费域名 |

## 3. 目录结构

```text
portfolio/
├── index.html            # 首页
├── projects.html         # 项目列表
├── project.html          # 项目详情（?id=）
├── blog.html             # 博客列表（?q= / ?tag=）
├── post.html             # 文章详情（?slug=）
├── about.html            # 关于
├── contact.html          # 联系与表单
├── admin.html            # 内容后台
├── assets/
│   ├── favicon.svg
│   └── shots/            # 项目截图
├── css/
│   ├── base.css          # 重置、设计令牌、排版、通用元素
│   ├── layout.css        # 导航、页脚、栅格与断点
│   ├── components.css    # 卡片、按钮、标签、时间线等
│   ├── pages.css         # 各页面专属布局
│   ├── forms.css         # 表单控件与校验状态
│   └── admin.css         # 后台独立样式
├── js/
│   ├── data.js           # 站点、技能、项目、文章、时间线
│   ├── content.js        # 内容覆盖层 + 静态文案绑定
│   ├── app.js            # 前台渲染与交互
│   └── admin.js          # 后台交互
├── docs/
│   ├── PRD.md
│   ├── TECH_DESIGN.md
│   ├── AGENTS.md
│   └── view.html         # Markdown 文档浏览页
├── tests/
│   ├── audit.html        # 结构与可访问性自检
│   └── responsive.html   # 响应式自检
├── tools/
│   └── screenshot.js     # 无头 Chrome 固定尺寸截图
└── serve.js              # 零依赖本地服务器
```

## 4. 架构总览

```text
                     ┌──────────────────────┐
                     │      data.js         │  默认内容
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │     content.js       │  合并 localStorage 覆盖
                     └──────┬────────┬──────┘
                            │        │
            ┌───────────────▼──┐  ┌──▼────────────────┐
            │     app.js       │  │     admin.js      │
            │ 前台渲染与交互   │  │ 后台表单与保存    │
            └───────┬──────────┘  └──┬────────────────┘
                    │                │
            ┌───────▼────────────────▼───────┐
            │  静态 HTML + CSS + Canvas      │
            └────────────────────────────────┘
```

### 4.1 数据流

1. 浏览器加载页面，先执行 `data.js`，得到 `SITE`、`PROJECTS`、`POSTS`、`SKILLS`。
2. `content.js` 读取 `localStorage` 中的覆盖数据，合并到上述对象。
3. `content.js` 把站点级字段写入带有 `data-site` 的静态节点（导航、Hero、页脚等）。
4. `app.js` 根据 `<body data-page>` 渲染列表与详情。
5. 后台保存时写入同一份 localStorage；前台刷新后读取新值。

### 4.2 数据模型

```js
SITE = {
  name, latin, initials, handle, brandRole, role,
  tagline, location, email, availability, github,
  footerBio, intro, social[]
}

PROJECTS = [{
  id, title, subtitle, category, year, status, role, duration,
  cover, coverAlt, demo, source, tags[], excerpt,
  problem, approach, features[], stack[], metrics[],
  architecture[], shots[], learned
}]

POSTS = [{
  slug, title, excerpt, date, minutes, tags[], featured,
  sections[]  // 正文以 HTML 字符串存放
}]

OVERRIDES = {
  site: { ... },
  projects: { [id]: { title, subtitle, excerpt, status, year } },
  posts: { [slug]: { title, excerpt } },
  updatedAt: "ISO-8601"
}
```

## 5. 路由与页面渲染

### 5.1 查询参数路由

| 页面 | 参数 | 说明 |
| --- | --- | --- |
| `project.html` | `id` | 项目标识，如 `imagegrab` |
| `post.html` | `slug` | 文章标识，如 `manifest-v3-image-grab` |
| `projects.html` | `category` | 分类筛选，缺省为全部 |
| `blog.html` | `q` / `tag` | 搜索关键词与标签 |

筛选状态通过 `history.replaceState` 写回地址栏；`file://` 下若被浏览器拒绝，则静默忽略，不影响筛选本身。

### 5.2 渲染入口

```js
function boot() {
  initStarfield();
  initHeader();
  initNav();
  initYear();

  const page = document.body.dataset.page;
  if (page === "home") renderHome();
  if (page === "projects") renderProjectList();
  if (page === "project") renderProjectDetail();
  if (page === "blog") renderBlog();
  if (page === "post") renderPost();
  if (page === "about") renderAbout();
  if (page === "contact") initContactForm();

  initReveal();
}
```

所有渲染函数使用统一的 `escapeHtml()` 处理文本，避免把内容直接拼进 HTML 造成注入。

## 6. 内容后台

### 6.1 交互流程

1. 访问 `admin.html`，输入演示密码 `zhuezen2026`。
2. 会话标记写入 `sessionStorage`，刷新后保持登录状态。
3. 表单修改先进入内存中的 `draft`，切换栏目不会丢失。
4. 点击“保存修改”调用 `SiteContent.save()`，写入 `localStorage` 并记录 `updatedAt`。
5. 打开前台页面，`content.js` 合并覆盖并刷新静态文案。

### 6.2 存储结构

```json
{
  "site": { "name": "朱泽恩", "email": "hello@zhuezen.dev" },
  "projects": { "imagegrab": { "title": "图提取 ImageGrab" } },
  "posts": { "manifest-v3-image-grab": { "title": "..." } },
  "updatedAt": "2026-10-20T04:20:00.000Z"
}
```

存储键：`zhuezen.content.v1`。

### 6.3 安全边界

当前实现是**演示型后台**：

- 密码与校验都在前端，无法阻止有心人直接修改 localStorage。
- 修改只影响当前浏览器，不会同步给其他访客。
- 生产环境应接入账号登录（如 Auth.js / Clerk）与服务端存储（Vercel KV / Cloudflare KV），并在服务端做鉴权与审计。

这一点在 PRD 的风险表中已明确记录，避免把演示能力误当成生产能力。

### 6.4 导出与恢复

- 导出：将 `draft` 序列化为 `content.json` 下载。
- 导入：读取 JSON，写入 localStorage 后刷新。
- 恢复默认：删除存储键并刷新，回到 `data.js` 的初始内容。

## 7. 样式系统

### 7.1 设计令牌

```css
:root {
  --bg: #0b0f1a;
  --panel: #111726;
  --text: #e8edf7;
  --muted: #96a2ba;
  --accent: #7aa2ff;
  --radius: 14px;
  --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
}
```

颜色、圆角、阴影、缓动全部通过变量管理，后台与前台共用同一套视觉语言。

### 7.2 断点

| 宽度 | 布局 |
| --- | --- |
| `< 640px` | 单列；导航收进下拉面板；项目卡片纵向排列 |
| `640–899px` | 两列；侧栏内容下移 |
| `≥ 900px` | 三列；导航横排；文章详情显示右侧目录 |

断点按“内容什么时候挤不下”确定，而不是按设备型号。

### 7.3 无 JS 降级

- `.js` 类由内联脚本加到 `<html>`，只有存在该类时才启用淡入动画与移动端下拉面板。
- 没有 JS 时，导航以静态块展示，`nav-toggle` 隐藏，正文与链接可完整阅读。
- 项目与文章列表依赖 JS 渲染，提供 `<noscript>` 说明与 GitHub 入口。

## 8. 可访问性实现

| 要求 | 实现 |
| --- | --- |
| 跳过导航 | 每页首个焦点元素为“跳到主要内容”链接 |
| 焦点可见 | 全局 `:focus-visible` 描边，颜色对比度 ≥ 3:1 |
| 键盘筛选 | 筛选按钮组使用 roving tabindex，支持方向键 / Home / End |
| 动态播报 | 结果数量使用 `aria-live="polite"`，表单状态使用 `role="status"` |
| 表单错误 | `aria-invalid` + `aria-describedby` 指向错误文本 |
| 减少动效 | `prefers-reduced-motion` 下关闭 transition 与淡入，内容直接显示 |
| 对比度 | 正文 `--text` 与背景对比度约 13:1；次要文字 ≥ 4.5:1 |

## 9. 性能优化

1. **零请求**：字体使用系统字体栈，图标使用内联 SVG，没有第三方脚本。
2. **Canvas 星空**：星级数量按视口面积计算；`visibilitychange` 时暂停动画；减少动效时不启动循环。
3. **图片懒加载**：项目截图使用 `loading="lazy"` 与固定宽高比，避免布局抖动。
4. **渲染节流**：搜索输入防抖 120ms；滚动监听使用 `{ passive: true }`。
5. **缓存策略**：本地服务器发送 `Cache-Control: no-cache` 方便调试；静态托管由平台处理长缓存。

## 10. 测试方案

### 10.1 自动化自检

| 文件 | 检查内容 |
| --- | --- |
| `tests/audit.html` | lang、alt、链接名称、按钮名称、重复 id、表单 label、标题层级、h1 数量、触控尺寸、对比度 |
| `tests/responsive.html?page=all` | 375 / 768 / 1440 三档的横向溢出、网格列数、导航形态、卡片数量、触控目标 |

两个页面都在 iframe 中逐页加载并输出 `OK / BAD` 结果，可直接作为验收证据截图。

### 10.2 手工回归清单

- 键盘 Tab 走完导航 → 主内容 → 页脚，焦点不丢失。
- 移动端点开菜单、按 Esc 关闭、点击遮罩关闭。
- 项目筛选刷新后状态保留。
- 博客搜索与标签组合筛选。
- 联系表单空提交、非法邮箱、过短内容、合法提交。
- 后台修改姓名 → 保存 → 前台刷新验证。
- 减少动效模式下首屏内容可见。

## 11. 部署方案

### 11.1 Vercel

```bash
cd portfolio
npx vercel --prod
# 首次部署按提示登录并确认项目名
```

- Framework Preset：Other
- Build Command：留空
- Output Directory：`.`（项目根目录）
- 访问地址：`https://temporary-racing-poplar-rfn2u1z.vercel.app`（`--temporary` 匿名部署，
  需在部署后的 1 小时内通过输出的 claim 链接认领，否则会被回收）
- 长期部署：`npx vercel login` 后执行 `npx vercel --prod`，地址形如 `https://<project>.vercel.app`

### 11.2 Cloudflare Pages

```bash
cd portfolio
npx wrangler pages deploy . --project-name zhuezen-portfolio
```

- 构建命令：无
- 输出目录：`/`
- 访问地址：`https://<project>.pages.dev`

### 11.3 GitHub Pages（备选）

仓库中的工作流会把官网发布到 `gh-pages`。个人站也可以放在 `portfolio/` 子路径下，但 Vercel / Cloudflare Pages 的独立域名更适合作为简历链接。

## 12. 已知限制与后续演进

| 限制 | 影响 | 演进方向 |
| --- | --- | --- |
| 后台无真实鉴权 | 仅适合演示 | 接入 OAuth 与服务端会话 |
| 内容不跨设备 | 换浏览器需导入 | 接入 KV / 数据库 |
| 文章正文写在 JS 中 | 编辑需改代码 | 改为 Markdown 文件 + 静态生成 |
| 无图片上传 | 更换封面需手动替换 | 对象存储 + 图片压缩 |

## 13. 关键决策记录（ADR）

| 决策 | 备选 | 结论与理由 |
| --- | --- | --- |
| 不用框架 | React / Vue | 页面数量有限，原生足够；避免构建与依赖，保证双击可开 |
| 内容放 JS | JSON fetch / CMS | `file://` 下 fetch 受限制，JS 常量最稳；后台再用 localStorage 覆盖 |
| 后台用 localStorage | 真后端 | 静态托管即可演示完整流程；生产再替换为 KV |
| 每页重复导航 | JS 注入组件 | 无 JS 时仍完整可读，SEO 与“另存为”都更可靠 |
| Canvas 星空 | CSS 动画 | 星星数量多时 Canvas 更省 DOM，且可暂停渲染 |
