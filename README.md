# 图提取 ImageGrab · 官网与项目合集

本仓库是 AI 编程训练的项目合集，主要内容如下：

| 目录 | 说明 |
| --- | --- |
| `image-extractor/` | Chrome 电商图片提取插件（Manifest V3）及其静态官网 |
| `image-extractor/extension/` | 可直接加载到 Chrome 的插件源码 |
| `image-extractor/docs/` | 插件官网（纯静态，GitHub Pages 发布源） |
| `sales-dashboard/` | 云栖咖啡门店经营看板（纯静态演示） |
| `screenshots/` | 各项目的运行截图 |

## 官网

**图提取 ImageGrab**：<https://yaesakiarishiya.github.io/AITraining/>

官网与插件使用说明见 [image-extractor/README.md](image-extractor/README.md)。

## 安装插件（本地）

1. 解压 `image-extractor/docs/assets/imagegrab-extension.zip`，或在仓库中打开 `image-extractor/extension/`。
2. 地址栏打开 `chrome://extensions`。
3. 打开右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的 `extension` 目录。

插件支持淘宝 / 天猫、京东、拼多多商家版的商品详情页，扫描、转码、保存均在本地完成。

## 本地预览官网

直接双击 `image-extractor/docs/index.html`，或：

```bash
node image-extractor/tools/serve.js 5179
# http://localhost:5179/docs/
```

官网通过 GitHub Actions 自动部署：推送到 `master` 且 `image-extractor/docs/` 有变化时，会重新发布到 GitHub Pages。

## 免责声明

本项目仅用于学习与训练；提取图片时请遵守目标平台的服务条款与版权规定。
