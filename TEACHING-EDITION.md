# Teaching Edition — 教学白板定制层

本仓库基于 Excalidraw 的定制教学版，在官方编辑器之上增加了面向课堂教学白板场景的功能。所有定制代码集中在以下位置，便于与上游 Excalidraw 区分与同步。

## 定制功能

| 功能 | 说明 |
|------|------|
| 品牌落地页 | 欢迎页含品牌区/hero/功能卖点，「导入 PDF 讲义」「创建协作教室」入口 |
| PDF / Office 讲义导入 | 拖拽或菜单导入 PDF/Word/Excel/PPT；PDF 用 pdf.js 前端懒加载（300+ 页秒开），Office 由可选的后端转换服务转 PDF |
| 单页聚焦批注 | 当前页全屏铺满 + 手写批注；五档笔宽、荧光笔（半透明黄高亮） |
| 数字方块侧栏 | 每页一方块点击跳转、多文档分组、翻页指示器跟随视口、跨文档连续翻页 |
| 下载原始文件 | 保存对话框与侧栏均可下载导入时上传的原文件（.docx/.pptx/.pdf 原样） |
| 导出批注 PDF | 每页合成原文档图像 + 批注，导出带批注的 PDF |
| 教师账号 | 邮箱+密码注册/登录（门控创建教室），账号卡片含注册时间、修改密码、退出 |
| 全员跟随 | 教师（登录账号）可拉所有学生视角跟随；学生端有「跟随老师」一键回到教师视角 |
| 学生免登录 | 学生打开邀请链接即可加入协作，无需注册 |

## 定制代码位置

```
excalidraw-app/
  components/
    WelcomeLanding.tsx        # 品牌落地页
    LoginDialog.tsx           # 教师账号注册/登录/管理
    TeachingOverlay.tsx       # 笔宽条 / 荧光笔 / 翻页浮层
    ExportSourceFilesCard.tsx # 保存对话框内「下载原始文件」卡片
    AppSidebar.tsx / .scss    # 侧栏（仅文档页 tab）
    AppMainMenu.tsx           # 主菜单（移除 Excalidraw+ 残留）
  documentImport/             # 讲义导入/页面面板/导出批注 PDF/源文件存取
  data/auth.ts                # 教师账号 API 封装（/api/v2/auth/*）
  teaching.scss               # 品牌与教学 UI 样式
```

## 自托管部署

前端是普通 Vite 构建（`yarn --cwd excalidraw-app build:app`），产物为静态站点。默认后端指向官方 Excalidraw 服务；自托管部署时通过根目录 `.env.production.local` 覆盖后端地址（该文件已被 gitignore）：

```bash
VITE_APP_BACKEND_V2_GET_URL=https://your-domain/api/v2/
VITE_APP_BACKEND_V2_POST_URL=https://your-domain/api/v2/post/
VITE_APP_WS_SERVER_URL=https://your-domain
VITE_APP_CONVERT_URL=https://your-domain/convert/
```

配套的可选后端服务（本仓库未包含，可自建）：
- `excalidraw-storage`：`/api/v2` 云存档 + 通用二进制 KV 存储 + 教师账号 auth + 中转下载
- `excalidraw-room`：协作 WebSocket 服务器（Excalidraw 官方房间服务器）
- `excalidraw-convert`：LibreOffice 文档转 PDF（黑名单制）

## 兼容性说明

- 所有定制在 `excalidraw-app/` 与少量公共包常量内，未改动 Excalidraw 核心渲染逻辑
- 移动端：翻页/笔宽/荧光笔浮层在窄屏自动避让底部工具栏；微信内置浏览器受限时提示用系统浏览器打开
