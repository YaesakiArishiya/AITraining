# 朱泽恩 · 个人网站

零依赖的个人作品集、博客与内容后台。纯静态站点，不需要构建步骤，双击 `index.html` 就能完整运行。

- 在线地址（Vercel）：<https://temporary-racing-poplar-rfn2u1z.vercel.app/>
- 文档中心：`docs/view.html?doc=PRD`
- 内容后台：`admin.html`（演示密码 `zhuezen2026`）

> 上面这条 Vercel 地址来自 `vercel deploy --temporary` 的匿名部署，未认领时会在部署后 1 小时内被回收。
> 想长期保留：打开部署时输出的 `claim-deployment` 链接登录认领（认领后地址不变，可再改项目名），
> 或执行 `npx vercel login && npx vercel --prod` 把站点放到自己账号下。

## 页面

| 文件 | 说明 |
| --- | --- |
| `index.html` | 首页：定位、精选项目、技能、最新文章 |
| `projects.html` | 项目列表，支持分类筛选 |
| `project.html?id=...` | 项目详情：问题、做法、功能、截图与复盘 |
| `blog.html` | 博客列表，支持搜索与标签筛选 |
| `post.html?slug=...` | 文章详情，自动生成目录与阅读进度 |
| `about.html` | 关于：经历、原则、技能与时间线 |
| `contact.html` | 联系表单与联系方式 |
| `admin.html` | 内容后台：修改个人信息、项目与文章摘要 |
| `docs/view.html` | PRD / TECH_DESIGN / AGENTS 三个文档的浏览页 |

## 本地预览

```bash
cd portfolio
node serve.js
# http://localhost:5180
```

也可以直接双击 `index.html`。`file://` 下所有页面都可读，只有筛选状态的地址栏同步会被静默跳过。

## 内容后台

1. 打开 <http://localhost:5180/admin.html>。
2. 输入演示密码 `zhuezen2026`。
3. 修改个人信息、项目摘要或文章摘要，点击「保存修改」。
4. 打开前台页面刷新，导航、Hero、页脚与卡片会同步更新。

后台数据保存在当前浏览器的 `localStorage`（键名 `zhuezen.content.v1`），不会上传到服务器。到「导入与备份」可以：

- 导出 `content.json` 作为备份；
- 在另一台设备导入 JSON；
- 恢复 `js/data.js` 的默认内容。

> 这是演示型后台：密码和校验都在前端，生产环境应接入真实账号与服务端存储（Vercel KV / Cloudflare KV）。

## 目录

```text
portfolio/
├── css/            # base / layout / components / pages / forms / admin
├── js/             # data（内容）、content（覆盖层）、app（前台）、admin（后台）
├── docs/           # PRD / TECH_DESIGN / AGENTS + Markdown 浏览页
├── tests/          # 结构与可访问性自检、响应式自检
├── tools/          # 无头 Chrome 截图脚本
├── assets/         # favicon 与项目截图
├── serve.js        # 零依赖静态服务器
└── *.html          # 九个页面
```

## 自检

启动本地服务器后打开：

- <http://localhost:5180/tests/audit.html>：lang、alt、链接与按钮名称、重复 id、表单 label、标题层级、触控尺寸、对比度。
- <http://localhost:5180/tests/responsive.html?page=all>：七个页面 × 375 / 768 / 1440 三档宽度，检查横向溢出、网格列数、导航形态与触控目标。

当前结果：两个自检页面全部为 `OK`。

## 截图

```bash
# 前台
node tools/screenshot.js http://localhost:5180/index.html ../screenshots/10-portfolio-home.png 1440 1000

# 后台（自动写入演示会话）
node tools/screenshot.js "http://localhost:5180/admin.html?view=profile" ../screenshots/10-portfolio-admin-profile.png 1440 1000 login

# 文档
node tools/screenshot.js "http://localhost:5180/docs/view.html?doc=PRD" ../screenshots/10-portfolio-prd.png 1440 1000
```

需要本机安装 Chrome 或 Edge，可用 `CHROME_PATH` 指定路径。

## 部署

### Vercel

```bash
npx vercel --prod
```

Framework Preset 选 Other，Build Command 留空，Output Directory 填 `.`。

### Cloudflare Pages

```bash
npx wrangler pages deploy . --project-name zhuezen-portfolio
```

构建命令留空，输出目录为 `/`。

### GitHub Pages

仓库工作流会把 `image-extractor/docs/` 发布到站点根目录，并把 `portfolio/` 放到 `/portfolio/` 子路径：

<https://yaesakiarishiya.github.io/AITraining/portfolio/>

## 技术要点

- 设计令牌集中在 `css/base.css` 的 `:root`，颜色、圆角、阴影与缓动统一管理。
- 三档断点：`< 640px` 单列、`640–899px` 两列、`≥ 900px` 三列。
- 筛选按钮使用 roving tabindex，支持方向键、Home、End。
- 星空背景用 Canvas 绘制，标签页隐藏时暂停渲染；尊重 `prefers-reduced-motion`。
- 无 JavaScript 时导航、链接与正文仍然完整可读。
- 表单与后台数据只写 localStorage，不发起内容上传请求。

## 文档

- [PRD](docs/PRD.md)：目标、范围、功能需求与验收标准。
- [TECH_DESIGN](docs/TECH_DESIGN.md)：架构、数据流、后台、可访问性与部署。
- [AGENTS](docs/AGENTS.md)：协作约定、常用命令、验收流程与禁区。
