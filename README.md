<a href="https://excalidraw.com/" target="_blank" rel="noopener">
  <picture>
    <source media="(prefers-color-scheme: dark)" alt="Excalidraw" srcset="https://excalidraw.nyc3.cdn.digitaloceanspaces.com/github/excalidraw_github_cover_2_dark.png" />
    <img alt="Excalidraw" src="https://excalidraw.nyc3.cdn.digitaloceanspaces.com/github/excalidraw_github_cover_2.png" />
  </picture>
</a>

<h4 align="center">
  <a href="https://excalidraw.com">Excalidraw Editor</a> |
  <a href="https://plus.excalidraw.com/blog">Blog</a> |
  <a href="https://docs.excalidraw.com">Documentation</a> |
  <a href="https://plus.excalidraw.com">Excalidraw+</a>
</h4>

---

<div align="center">

# 🧑‍🏫 BetterExcalidraw · 教学交互白板

**基于 [Excalidraw](https://github.com/excalidraw/excalidraw)（MIT）深度定制的课堂教学白板：PDF / Office 讲义导入 · 按页批注 · 荧光笔 · 教师账号 · 全员跟随 · 学生免登录**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Vite](https://img.shields.io/badge/Vite-5-646CFF)
![Excalidraw](https://img.shields.io/badge/Base-Excalidraw-6965db)
![License](https://img.shields.io/badge/License-MIT-blue)

**从讲义的导入批注，到课堂的实时协作与全员跟随，再到课后导出带批注的 PDF 与下载原始讲义——一个自托管、数据自控、无第三方依赖的教学白板。**

📺 在线演示：**excalidraw.shunjumc.cn**（自托管） · 🧬 上游项目：[Excalidraw](https://github.com/excalidraw/excalidraw)

</div>

---

## 📑 目录

- [一、这个项目是什么](#一这个项目是什么)
- [二、相比上游 Excalidraw 做了什么改动](#二相比上游-excalidraw-做了什么改动)
- [三、核心功能](#三核心功能)
- [四、界面一览](#四界面一览)
- [五、技术架构](#五技术架构)
- [六、自托管部署指南](#六自托管部署指南)
- [七、常见问题 FAQ](#七常见问题-faq)
- [八、上游 Excalidraw 官方说明](#八上游-excalidraw-官方说明)

---

## 一、这个项目是什么

Excalidraw 是优秀的开源手绘风白板。但把它直接用于**课堂教学**时，还缺一套"讲义工作流"：

> 老师导入 PDF/Word/PPT 讲义 → 逐页讲解、圈划批注 → 学生扫码免登录加入 → 实时看到老师的视角 → 课后导出"带批注的讲义 PDF"或下载回原始文档。

本项目在**不改动 Excalidraw 核心渲染**的前提下，围绕这条教学闭环做了完整定制，并在真实服务器上自托管运行、多轮线上实测。项目以"老师讲得顺、学生看得清、数据在自己手里"为目标：

- 📥 拖入 / 菜单导入 **PDF、Word、Excel、PPT** → 转成页面逐页批注
- ✍️ 自然手写（五档笔宽） + **半透明荧光笔**高亮重点
- 🔢 数字方块侧栏导航：每页一方块，点击跳转，多文档分组不重叠
- 👩‍🏫 教师账号 + **全员跟随**：老师翻页，全班视角跟着走
- 🎓 学生免登录：扫码/链接进房即可，不注册不折腾
- 📤 课后导出**带批注 PDF**，或**下载原始讲义文件**（word/ppt 原样）

---

## 二、相比上游 Excalidraw 做了什么改动

> 本仓库保留 Excalidraw 完整上游历史（基线 `4a6f4e7a`，官方 [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)）。定制改动集中在一次提交 `220de0aa`，便于对照与跟随上游更新。

### 定制功能清单

| 功能 | 说明 |
|------|------|
| 🏠 品牌落地页 | 欢迎页含品牌区 / hero / 三步上手 / 六卖点；「导入 PDF 讲义」「创建协作教室」直接入口 |
| 👤 教师账号体系 | 邮箱+密码注册/登录/退出；账号卡片显示注册时间、支持修改密码（改后其它设备登录失效）；创建教室需登录 |
| 🎓 学生免登录 | 学生打开邀请链接直接加入，全程无注册门槛 |
| 📄 PDF / Office 讲义导入 | PDF 走 pdf.js 前端懒加载（300+ 页秒开）；Word/PPT/Excel 经可选转换服务转 PDF |
| 📖 单页聚焦批注 | 导入后当前页全屏铺满；点击侧栏方块翻页即铺满该页 |
| 🖊️ 五档笔宽 + 荧光笔 | freedraw 平滑书写五档粗细；荧光笔=半透明黄高亮，底下文字可透 |
| 🔢 数字方块侧栏 | 每文档一组页码方块、点击跳转、当前页高亮、跨文档按导入顺序连续翻页 |
| 📥 下载原始文件 | 保存对话框与侧栏均可下载导入时上传的**原文件**（.docx/.pptx/.pdf 原样），多文档各自下载 |
| 📤 导出批注 PDF | 每页合成"原讲义图像 + 批注笔迹"导出为 PDF（教学留档/发学生） |
| 👩‍🏫 全员跟随（教师专用） | 登录教师可一键把全班视角拉到自己当前页；学生端有「跟随老师」随时回到教师视角 |
| 🔁 替换文档保留批注 | 换一版讲义时批注自动保留在原位置 |
| 📱 移动端适配 | 翻页/笔宽/荧光笔浮层避让底部工具栏；微信内置浏览器保存受限时明确引导 |

### 定制代码位置

```
excalidraw-app/
  components/
    WelcomeLanding.tsx        # 品牌落地页
    LoginDialog.tsx           # 教师账号注册 / 登录 / 管理（改密码）
    TeachingOverlay.tsx       # 笔宽条 / 荧光笔 / 翻页浮层
    ExportSourceFilesCard.tsx # 保存对话框内「下载原始文件」卡片
    AppSidebar.tsx / .scss    # 侧栏（仅文档页 tab）
    AppMainMenu.tsx           # 主菜单（清除 Excalidraw+ 等无关入口）
  documentImport/             # 讲义导入 / 页面面板 / 导出批注 PDF / 源文件存取
  data/auth.ts                # 教师账号 API（/api/v2/auth/*）
  teaching.scss               # 教学 UI 品牌样式
```

### 不改动什么

- ✅ Excalidraw 核心渲染 / 画布 / 协作同步引擎（改的是 `excalidraw-app` 应用层与少量常量）
- ✅ 端到端加密与本地优先特性

---

## 三、核心功能

| | | |
|---|---|---|
| 📥 **讲义导入** | 📖 **按页批注** | 🔢 **页面导航** |
| PDF/Word/PPT 拖入即用 · 300+ 页秒开 | 单页聚焦 · 手写顺滑 · 荧光笔高亮 | 数字方块 · 多文档分组 · 连续翻页 |
| 👩‍🏫 **教师账号** | 🎓 **学生免登录** | 👁️ **全员跟随** |
| 注册/登录/改密码 · 创建教室门控 | 链接进房零门槛 | 教师拉视角 · 学生一键回老师 |
| 📤 **导出批注 PDF** | 📥 **下载原文件** | 📱 **移动端友好** |
| 讲义+批注合成 PDF 留档 | word/ppt/pdf 原样下载回 | 浮层避让 · 微信引导 |

---

## 四、界面一览

> 待补充：可在此放置落地页 / 批注画布 / 侧栏导航 / 教师账号面板截图（`docs/screenshots/`）。

---

## 五、技术架构

| 层面 | 技术 | 说明 |
|------|------|------|
| 前端 | TypeScript + React 18 + Vite 5 | 基于 Excalidraw 应用层定制 |
| PDF 渲染 | pdf.js（前端懒加载） | 大讲义按需渲染当前页，不一次铺满 |
| 实时协作 | Excalidraw 协作引擎 + Socket.IO | 房间同步（可自托管 room 服务） |
| 后端（可自托管，本仓库不含） | Node.js | 三个可选服务：存储 / 协作 / 文档转换 |

自托管后端三件套（不在本仓库，按需自建或参考部署文档）：

| 服务 | 职责 |
|------|------|
| `excalidraw-storage` | `/api/v2` 云存档 + 通用二进制 KV 存储 + 教师账号 auth + 中转下载 |
| `excalidraw-room` | 协作 WebSocket（Excalidraw 官方房间服务器） |
| `excalidraw-convert` | LibreOffice 文档转 PDF（黑名单制） |

```
浏览器(Excalidraw 前端)
   │  /api/v2/* ──────────────► nginx ──► excalidraw-storage (8083)
   │  /socket.io/* ───────────► nginx ──► excalidraw-room     (8084)
   │  /convert/*  ────────────► nginx ──► excalidraw-convert   (8085)
```

---

## 六、自托管部署指南

### 1. 构建前端

```bash
yarn install
yarn --cwd excalidraw-app build:app    # 产物在 excalidraw-app/build/
```

### 2. 指向自己的后端（根目录 `.env.production.local`，已被 gitignore）

```bash
VITE_APP_BACKEND_V2_GET_URL=https://your-domain/api/v2/
VITE_APP_BACKEND_V2_POST_URL=https://your-domain/api/v2/post/
VITE_APP_WS_SERVER_URL=https://your-domain
VITE_APP_CONVERT_URL=https://your-domain/convert/
```

### 3. 部署产物

- 前端静态产物 → 站点根目录（nginx 托管）
- 后端三服务 → 服务器 pm2 运行
- nginx 需代理：`/api/v2/`、`/socket.io/`（带 Upgrade）、`/convert/`；`client_max_body_size 50m`

### 4. 默认后端说明

未配置 `.env.production.local` 时，构建默认指向官方 Excalidraw 服务（仅体验用，自托管请务必覆盖）。

---

## 七、常见问题 FAQ

**Q1：学生需要注册吗？**
不需要。老师创建教室后把链接发给学生，学生打开即加入；注册/登录只用于老师身份（创建教室、全员跟随、下载原文件等）。

**Q2：Office 文件（Word/PPT）能导入吗？**
能。需要部署可选的后端转换服务（LibreOffice 转 PDF）；PDF 则完全前端处理，无需后端。

**Q3：导出批注 PDF 和下载原文件有什么区别？**
「导出批注 PDF」= 讲义页面 + 你的批注笔迹合成的 PDF；「下载原文件」= 你最初上传的 .docx/.pptx/.pdf 原样下载回（不含批注）。

**Q4：多人同时用，翻页会互相干扰吗？**
不会。每个端可独立翻页；老师可用「全员跟随」把大家视角拉到自己当前页，学生也可随时「跟随老师」或自由浏览。

**Q5：数据存在哪里？**
自托管部署下，讲义与场景数据都存在你自己的服务器（storage 服务），不经过任何第三方。

**Q6：微信里打开保存不了文件？**
微信内置浏览器限制下载。保存时会提示在系统浏览器打开；部分导出已支持通过系统分享面板保存。

---

## 八、上游 Excalidraw 官方说明

本仓库基于 [Excalidraw](https://github.com/excalidraw/excalidraw)（MIT License）定制，以下为上游官方说明。

### Features

The Excalidraw editor (npm package) supports:

- 💯&nbsp;Free & open-source.
- 🎨&nbsp;Infinite, canvas-based whiteboard.
- ✍️&nbsp;Hand-drawn like style.
- 🌓&nbsp;Dark mode.
- 🏗️&nbsp;Customizable.
- 📷&nbsp;Image support.
- 😀&nbsp;Shape libraries support.
- 🌐&nbsp;Localization (i18n) support.
- 🖼️&nbsp;Export to PNG, SVG & clipboard.
- 💾&nbsp;Open format - export drawings as an `.excalidraw` json file.
- ⚒️&nbsp;Wide range of tools - rectangle, circle, diamond, arrow, line, free-draw, eraser...
- ➡️&nbsp;Arrow-binding & labeled arrows.
- 🔙&nbsp;Undo / Redo.
- 🔍&nbsp;Zoom and panning support.

### Excalidraw.com

The app hosted at [excalidraw.com](https://excalidraw.com) is a minimal showcase of what you can build with Excalidraw. Its [source code](https://github.com/excalidraw/excalidraw/tree/master/excalidraw-app) is part of this repository as well, and the app features:

- 📡&nbsp;PWA support (works offline).
- 🤼&nbsp;Real-time collaboration.
- 🔒&nbsp;End-to-end encryption.
- 💾&nbsp;Local-first support (autosaves to the browser).
- 🔗&nbsp;Shareable links (export to a readonly link you can share with others).

We'll be adding these features as drop-in plugins for the npm package in the future.

### Quick start

**Note:** following instructions are for installing the Excalidraw [npm package](https://www.npmjs.com/package/@excalidraw/excalidraw) when integrating Excalidraw into your own app. To run the repository locally for development, please refer to our [Development Guide](https://docs.excalidraw.com/docs/introduction/development).

Use `npm` or `yarn` to install the package.

```bash
npm install react react-dom @excalidraw/excalidraw
# or
yarn add react react-dom @excalidraw/excalidraw
```

Check out our [documentation](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation) for more details!

### Contributing

- Missing something or found a bug? [Report here](https://github.com/excalidraw/excalidraw/issues).
- Want to contribute? Check out our [contribution guide](https://docs.excalidraw.com/docs/introduction/contributing) or let us know on [Discord](https://discord.gg/UexuTaE).
- Want to help with translations? See the [translation guide](https://docs.excalidraw.com/docs/introduction/contributing#translating).

### Integrations

- [VScode extension](https://marketplace.visualstudio.com/items?itemName=pomdtr.excalidraw-editor)
- [npm package](https://www.npmjs.com/package/@excalidraw/excalidraw)

### Who's integrating Excalidraw

[Google Cloud](https://googlecloudcheatsheet.withgoogle.com/architecture) • [Meta](https://meta.com/) • [CodeSandbox](https://codesandbox.io/) • [Obsidian Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) • [Replit](https://replit.com/) • [Slite](https://slite.com/) • [Notion](https://notion.so/) • [HackerRank](https://www.hackerrank.com/) • and many others

### Sponsors & support

If you like the project, you can become a sponsor at [Open Collective](https://opencollective.com/excalidraw) or use [Excalidraw+](https://plus.excalidraw.com/).

### Thank you for supporting Excalidraw

[<img src="https://opencollective.com/excalidraw/tiers/sponsors/0/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/0/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/1/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/1/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/2/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/2/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/3/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/3/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/4/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/4/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/5/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/5/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/6/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/6/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/7/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/7/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/8/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/8/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/9/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/9/website) [<img src="https://opencollective.com/excalidraw/tiers/sponsors/10/avatar.svg?avatarHeight=120"/>](https://opencollective.com/excalidraw/tiers/sponsors/10/website)

<a href="https://opencollective.com/excalidraw#category-CONTRIBUTE" target="_blank"><img src="https://opencollective.com/excalidraw/tiers/backers.svg?avatarHeight=32"/></a>

Last but not least, we're thankful to these companies for offering their services for free:

[![Vercel](./.github/assets/vercel.svg)](https://vercel.com) [![Sentry](./.github/assets/sentry.svg)](https://sentry.io) [![Crowdin](./.github/assets/crowdin.svg)](https://crowdin.com)
