# 商品图片提取下载器

Chrome 扩展（Manifest V3）：在淘宝 / 天猫、京东、拼多多商家版的商品详情页一键提取页面内所有商品图片，在新标签页集中展示、勾选，并批量下载为 PNG。

- 不上传任何图片，无后端接口，不收集使用数据
- 统一转换为 PNG，文件名按勾选顺序生成 `商品图_001.png`
- 下载过程有逐张进度，结束后给出成功 / 失败数量与失败原因

## 目录结构

```
image-extractor/
├─ extension/                 ← 加载到 Chrome 的就是这个目录
│  ├─ manifest.json           MV3 清单：权限、注入规则、Service Worker
│  ├─ content.js              注入悬浮按钮、扫描图片、提交结果
│  ├─ content.css             按钮与结果面板样式（Shadow DOM 内使用）
│  ├─ background.js           Service Worker：落库、开图库、下载、转 PNG、进度推送
│  ├─ lib/image-utils.js      共享工具库（URL 处理、DOM 采集、去重、命名）
│  ├─ gallery.html            图库页
│  ├─ gallery.css             图库页样式（响应式网格）
│  ├─ gallery.js              图库页逻辑（勾选、全选/反选、下载、进度）
│  ├─ icons/                  16/32/48/128 图标
│  └─ demo/                   图库演示数据（未安装插件时预览界面用）
├─ website/                   插件官网（纯静态）
├─ tests/
│  ├─ unit.test.js            纯函数单元测试（Node）
│  ├─ background.test.js      Service Worker 逻辑测试（Node + vm）
│  ├─ harness.html            浏览器内 DOM 采集测试
│  └─ mock-product.html       悬浮按钮预览页
└─ tools/
   ├─ serve.js                零依赖静态服务器
   ├─ make-assets.js          生成图标 / 测试图片 / 演示图
   └─ png.js                  PNG 编码工具
```

## 安装

1. 地址栏打开 `chrome://extensions`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本项目的 `extension` 目录
4. （可选）把扩展固定到工具栏，点击图标也能触发扫描

安装后不需要重启浏览器。修改代码后，在扩展管理页点击扩展卡片上的刷新按钮，再刷新商品页即可。

## 使用

1. 打开受支持平台的商品详情页
2. 右下角出现蓝色「获取图片」按钮，点击
3. 按钮显示「扫描中 n/m」进度，完成后自动在新标签页打开图库
4. 在图库中勾选图片（可全选 / 反选 / 清空），点击「下载选中为 PNG」
5. 文件保存到浏览器默认下载目录，命名为 `商品图_001.png`、`商品图_002.png`……

提示：详情页的长图通常要滚动到可见位置才会加载。如果提取数量偏少，先滚动一遍页面，再点一次「重新扫描」。

## 支持范围

| 平台 | 详情页示例 |
| --- | --- |
| 淘宝 / 天猫 | `item.taobao.com/item.htm?id=…`、`detail.tmall.com/item.htm?id=…` |
| 京东 | `item.jd.com/100012043978.html`、`npcitem.jd.hk/….html` |
| 拼多多商家版 | `mobile.yangkeduo.com/goods.html?goods_id=…`、`mms.pinduoduo.com/goods/…` |

按钮只在上述详情页出现；列表页、搜索页、店铺首页不会显示。工具栏图标在任意页面点击都可对当前页发起一次扫描（依赖 `activeTab`）。

## 实现要点

- **注入**：`content_scripts` 在三个平台域名下加载，运行时再用 `isProductPage()` 二次判断，只有详情页才挂载 UI。按钮和面板放在 Shadow DOM 中，页面样式与插件样式互不影响。
- **采集**：同时读取 `<img>` 的 `currentSrc` / `src`、`srcset` / `data-srcset`、`data-src`、`data-lazy-src`、`data-original` 等懒加载属性（三平台属性名取并集），以及行内和样式表中的 `background-image`。
- **过滤**：剔除 `data:` / `blob:` / SVG、图标 / logo / 占位图 / 1×1 统计图；用图片预加载取得真实像素尺寸，小于 100×100 的丢弃；加载失败的链接不进入结果。
- **补全与去重**：相对路径按 `document.baseURI` 补全；按归一化 URL 去重，同时把天猫 `_430x430q90.jpg`、京东 `!q70.dpg.webp`、拼多多 `imageView2` 等缩略参数还原成原图地址。`http` 图片地址会升级为 `https`，避免扩展页混合内容拦截。
- **展示**：扫描结果通过 `chrome.runtime.sendMessage` 交给 Service Worker，写入 `chrome.storage.local`（只保留最近 8 次），再打开 `gallery.html?scan=<id>`。
- **下载**：Service Worker 中 `fetch`（`no-referrer`，规避 CDN 防盗链）→ `createImageBitmap` → `OffscreenCanvas` 转 PNG → `chrome.downloads.download` 保存；逐张广播进度，全部结束后推送汇总。单张失败不会中断整批。
- **权限**：`activeTab`、`scripting`、`downloads`、`storage`；`host_permissions` 除三个平台外，还包含 `alicdn.com`、`360buyimg.com`、`jdimg.com`、`pddpic.com` 等图片 CDN，跨域 `fetch` 才能成功。

## 测试

无需安装依赖，Node.js 18+ 即可：

```bash
node tests/unit.test.js        # 26 项：URL 处理、过滤、去重、命名、站点识别
node tests/background.test.js  # 16 项：落库、开图库、PNG 转换、进度、失败处理
```

浏览器内测试与预览：

```bash
node tools/serve.js 5179
```

- 采集逻辑测试：http://localhost:5179/tests/harness.html
- 按钮样式预览：http://localhost:5179/tests/mock-product.html
- 图库演示：http://localhost:5179/extension/gallery.html（未安装插件时自动读取 `demo/demo-scan.json`）
- 官网：http://localhost:5179/website/

如需重新生成图标、测试图片和演示图：`node tools/make-assets.js`。

## 常见问题

**下载失败怎么办？**
常见原因是图片已被删除或 CDN 拒绝访问。完成提示会给出失败数量与首个原因；取消勾选失败项后重新下载其余图片即可。

**为什么有些图片没有出现？**
小于 100×100 的图片、图标、占位图会被过滤；未滚动到的懒加载图片尚未进入 DOM。先滚动页面再重新扫描。

**能自定义文件名吗？**
修改 `extension/lib/image-utils.js` 中的 `makeFilename()`，例如加入商品标题或日期。

**会不会把图片传到服务器？**
不会。扫描、转码、保存全部在本地浏览器内完成，扩展没有网络后端，也没有任何埋点。

## 免责声明

本插件仅用于提取你有权使用的商品素材。请遵守目标平台的服务条款与版权规定。
