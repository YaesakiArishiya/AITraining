# AGENTS.md · 协作说明

本文件面向在本仓库中工作的 AI 代理与人类协作者，说明项目约定、常用命令、验收标准和禁区。开始修改前请先读完本文件。

## 1. 项目概览

- 项目：朱泽恩的个人网站与作品集（纯静态站点）。
- 目录：`portfolio/`。
- 技术栈：HTML + CSS + 原生 JavaScript，无框架、无构建、无第三方运行时依赖。
- 部署：Vercel / Cloudflare Pages，仓库也保留了 GitHub Pages 工作流。
- 关联文档：`docs/PRD.md`（需求）、`docs/TECH_DESIGN.md`（技术方案）。

## 2. 常用命令

```bash
# 本地预览（默认 http://localhost:5180）
cd portfolio
node serve.js

# 或指定端口
node serve.js 5180

# 结构与可访问性自检
# 浏览器打开 http://localhost:5180/tests/audit.html

# 响应式自检（全部页面 × 三档宽度）
# 浏览器打开 http://localhost:5180/tests/responsive.html?page=all

# 生成固定尺寸截图（无头 Chrome）
node tools/screenshot.js http://localhost:5180/index.html ../screenshots/10-home.png 1440 1000

# 后台截图（自动写入演示会话）
node tools/screenshot.js http://localhost:5180/admin.html ../screenshots/10-admin.png 1440 1000 login
```

## 3. 文件职责

| 路径 | 职责 | 修改注意 |
| --- | --- | --- |
| `js/data.js` | 站点信息、技能、项目、文章、时间线 | 只放数据，不写 DOM 逻辑 |
| `js/content.js` | 合并 localStorage 覆盖、绑定静态文案 | 新增站点字段时同步 `data-site` |
| `js/app.js` | 前台渲染、筛选、搜索、表单、目录 | 保持无依赖，文本必须 `escapeHtml` |
| `js/admin.js` | 后台登录、表单、保存、导入导出 | 不引入真实密码或密钥 |
| `css/base.css` | 设计令牌、重置、排版 | 颜色改动需重新跑对比度检查 |
| `css/layout.css` | 导航、页脚、栅格、断点 | 新断点先证明内容挤不下 |
| `css/components.css` | 卡片、按钮、标签、空状态 | 复用现有类，避免一次性样式 |
| `css/pages.css` | 页面专属布局 | 优先用现有组件组合 |
| `css/forms.css` | 表单与校验状态 | 保持 label 与 aria 关联 |
| `css/admin.css` | 后台独立样式 | 与前台共享色彩语言即可 |
| `docs/*.md` | 需求、技术方案、协作说明 | 改功能时同步更新文档 |
| `tests/*.html` | 自动化自检 | 新增页面要加入 `pages` 数组 |
| `tools/screenshot.js` | 固定尺寸截图 | 依赖本机 Chrome / Edge |

## 4. 编码约定

### 4.1 JavaScript

- 使用 IIFE + `"use strict"`，不污染全局；仅 `data.js` 暴露内容常量。
- 统一使用 `$` / `$$` 查询节点，`escapeHtml()` 处理所有插入 HTML 的文本。
- 事件监听使用委托，避免为列表项逐个绑定。
- 新增交互要考虑：无 JS、键盘、减少动效、空数据四种状态。
- 不使用 `innerHTML` 拼接未转义的用户输入。
- 代码注释使用中文，句子说明“为什么”，而不是复述“做了什么”。

### 4.2 CSS

- 颜色、圆角、阴影、缓动必须使用 `:root` 变量。
- 移动优先；断点只有 `640px` 与 `900px` 两档（后台另有 `1080px` / `820px` / `520px`）。
- 不使用 `!important`；优先级冲突先调整结构。
- 动画必须包在 `@media (prefers-reduced-motion: no-preference)` 或提供 `reduce` 降级。
- 新组件先检查 `components.css` 是否已有可复用类。

### 4.3 HTML

- 每页一个 `h1`，标题层级不跳级。
- 图片必须有 `alt`；装饰性图标使用 `aria-hidden="true"`。
- 表单控件必须有 `<label for>` 或包裹式 label。
- 外链使用 `target="_blank" rel="noopener"`。
- 新增页面必须复制完整的导航 / 页脚结构，并引入 `data.js`、`content.js`、`app.js`。

## 5. 内容维护

### 5.1 通过后台修改

1. 打开 `admin.html`，密码 `zhuezen2026`。
2. 修改个人信息、项目摘要或文章摘要。
3. 点击“保存修改”，打开前台刷新验证。
4. 需要备份时到“导入与备份”导出 `content.json`。

### 5.2 直接修改代码

- 站点信息：`js/data.js` 的 `SITE`。
- 项目：`PROJECTS` 数组；新增项目必须有唯一 `id`，并补全 `problem`、`approach`、`features`、`learned`。
- 文章：`POSTS` 数组；`slug` 唯一，正文放在 `sections` 中。
- 新增站点字段时：
  1. 在 `SITE` 中加默认值；
  2. 在 `content.js` 的绑定逻辑中登记；
  3. 在 `admin.js` 的表单中加入字段；
  4. 在页面中使用 `data-site="字段名"`。

## 6. 验收流程

每次提交前按顺序执行：

1. 打开 `tests/audit.html`，等待输出“完成”，确认所有页面为 `OK`。
2. 打开 `tests/responsive.html?page=all`，确认 21 条结果全部为 `OK`。
3. 手动检查：
   - 375px 下打开菜单、关闭菜单；
   - 项目筛选与博客搜索；
   - 联系表单空提交与合法提交；
   - 后台修改姓名并保存，前台刷新确认；
   - 键盘 Tab 一遍，焦点不丢失；
   - 系统开启“减少动态效果”后首屏内容可见。
4. 需要交付截图时，用 `tools/screenshot.js` 生成 1440 × 1000 的图片，放在 `screenshots/`。

## 7. 禁区

- 不要引入 npm 依赖、打包工具或 CDN 资源（`tools/` 与部署命令除外）。
- 不要在仓库中写入真实密码、Token、API Key；后台密码仅为演示用途。
- 不要删除 `tests/`、`docs/` 或 `serve.js`；它们是交付物的一部分。
- 不要把用户提交的表单内容发送到任何服务器。
- 不要为了视觉效果移除 `:focus-visible` 或跳过链接。
- 不要使用 `data.js` 之外的全局变量名，避免与现有常量冲突。

## 8. 常见任务

### 新增一个项目

1. 在 `PROJECTS` 中追加对象，补全必填字段。
2. 把截图放入 `assets/shots/`，填写 `cover`、`coverAlt`、`shots`。
3. 刷新 `projects.html` 与 `project.html?id=<新 id>` 验证。
4. 更新 `docs/PRD.md` 的项目数量与验收项。

### 新增一篇文章

1. 在 `POSTS` 中追加对象，`slug` 唯一，`date` 使用 `YYYY-MM-DD`。
2. 在 `sections` 中按 `{ id, title, html }` 组织正文；目录会自动生成。
3. 打开 `post.html?slug=<slug>` 检查目录高亮与阅读进度。

### 修改部署平台

1. 保持相对路径，不要写死域名。
2. 静态输出目录为 `portfolio/` 根目录，无构建命令。
3. 部署后在 `docs/TECH_DESIGN.md` 中更新访问地址与命令。

## 9. 交付物清单

- [x] 七个前台页面 + 内容后台 + 文档中心。
- [x] 响应式与可访问性自检页面。
- [x] PRD、TECH_DESIGN、AGENTS 三份文档。
- [x] 项目截图与站点截图（`screenshots/`）。
- [x] 本地预览服务器与截图工具。
- [x] 可部署到 Vercel / Cloudflare Pages 的静态产物。

## 10. 沟通约定

- 修改前先说明要动的文件与原因。
- 一次提交只做一类改动，提交信息使用 `feat:` / `fix:` / `docs:` / `test:` / `chore:` 前缀。
- 涉及内容口径、数据模型或验收标准的变化，必须先更新文档再改代码。
- 不确定需求时先提问，不要自行扩大范围。
