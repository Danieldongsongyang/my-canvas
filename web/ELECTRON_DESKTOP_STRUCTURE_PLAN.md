# Electron 桌面壳目录结构方案

本文档用于梳理：当前 `web/` 前端连接已有后端的情况下，如何增加一层 Electron 桌面壳，以及后续扩展时推荐采用的文件布局。

## 核心结论

当前项目不建议删除 `web/`。

`web/` 已经是完整的 Next.js App Router 前端应用，包含画布页面、素材库、配置、状态管理、API 请求和 Next route handler。Electron 应作为新增桌面壳存在，而不是替代 `web/`。

推荐方向：

```txt
infinite-canvas/
├─ web/       # 保留：现有 Next.js 前端，继续连接已有后端
├─ desktop/   # 新增：Electron 桌面壳
├─ docs/      # 保留：文档站
└─ package.json
```

建议使用 `desktop/` 而不是 `electron/` 作为目录名，因为它描述的是产品端形态，Electron 只是当前实现技术。以后如果迁移到 Tauri 或其他桌面方案，目录语义不会过时。

## 参考项目

| 项目 | 适合学习的点 | 参考链接 |
| --- | --- | --- |
| Mattermost Desktop | Web 产品外包 Electron，拆分 main、renderer、common、types、resources，和当前项目方向最接近。 | https://github.com/mattermost/desktop |
| Element Desktop | Electron 壳层职责很清楚，`ipc`、`protocol`、`store`、`tray`、`updater` 等文件适合作为后期扩展清单。 | https://github.com/element-hq/element-desktop |
| GitHub Desktop | 完整桌面产品结构，拆分 `main-process`、`ui`、`lib`、`models`，适合未来桌面端业务变重时参考。 | https://github.com/desktop/desktop |
| Joplin | 多端 monorepo 结构，`packages/app-desktop`、`packages/lib`、`packages/renderer` 等适合长期多端扩展时参考。 | https://github.com/laurent22/joplin |

当前项目更接近 Mattermost Desktop 和 Element Desktop：桌面端主要是壳层，业务 UI 仍由现有 Web 前端承载。

## 推荐目录结构

第一阶段建议保持轻量，不做大规模 monorepo 迁移：

```txt
infinite-canvas/
├─ web/
│  ├─ src/
│  ├─ public/
│  ├─ package.json
│  └─ next.config.ts
│
├─ desktop/
│  ├─ src/
│  │  ├─ main.ts
│  │  ├─ preload.ts
│  │  ├─ window.ts
│  │  ├─ store.ts
│  │  ├─ next-server.ts
│  │  ├─ ipc/
│  │  ├─ protocol.ts
│  │  ├─ menu.ts
│  │  ├─ tray.ts
│  │  └─ updater.ts
│  ├─ assets/
│  ├─ scripts/
│  ├─ electron-builder.ts
│  ├─ package.json
│  └─ tsconfig.json
│
├─ docs/
├─ package.json
├─ VERSION
└─ CHANGELOG.md
```

如果一开始不想拆太细，可以先只保留：

```txt
desktop/
├─ src/
│  ├─ main.ts
│  ├─ preload.ts
│  ├─ window.ts
│  └─ store.ts
├─ assets/
├─ electron-builder.ts
└─ tsconfig.json
```

等桌面能力变多后，再逐步增加 `ipc/`、`tray.ts`、`updater.ts`、`protocol.ts`。

## 目录职责

### `web/`

继续承载现有前端业务：

- 页面和路由。
- 画布组件和交互。
- Zustand store。
- Ant Design / Tailwind UI。
- API 请求封装。
- 本地素材和本地项目存储。
- Next route handler，例如 `/api/[...path]` 和 `/webdav-proxy`。

`web/` 不直接使用 Node API，也不直接依赖 Electron 主进程能力。需要桌面能力时，通过 `preload` 暴露的安全 API 调用。

### `desktop/`

只负责桌面壳能力：

- 创建和管理 `BrowserWindow`。
- 开发环境加载 `http://localhost:3002`。
- 生产环境加载打包后的 `web` 应用。
- 保存窗口大小、位置、后端地址等桌面端配置。
- 管理菜单、托盘、系统通知、深链和自动更新。
- 通过 IPC 提供文件选择、导入导出、本地目录访问等系统能力。
- 必要时启动内置 Next standalone server。

### 后端

已有后端继续独立运行或独立部署，不建议塞进 Electron 包内。

Electron 桌面端只需要保存后端地址或读取环境配置，然后让 `web/` 继续通过现有接口调用后端。

## 开发环境加载方式

开发时建议保持简单：

```txt
Next dev server: http://localhost:3002
Electron window: 加载 http://localhost:3002
```

推荐流程：

```txt
1. 启动 web 开发服务。
2. 启动 desktop 开发服务。
3. Electron 窗口加载 web 的 dev server。
```

示例脚本可以放在根目录 `package.json`：

```json
{
  "scripts": {
    "web:dev": "cd web && npm run dev",
    "web:build": "cd web && npm run build",
    "desktop:dev": "electron .",
    "desktop:build": "npm run web:build && electron-builder"
  }
}
```

实际使用 `npm`、`pnpm` 还是其他包管理器，后续按项目当前习惯统一即可。

## 生产环境加载方式

当前项目更适合使用 Next standalone，而不是静态导出。

`web/next.config.ts` 当前已经使用：

```ts
output: "standalone"
```

这是适合 Electron 的方式。生产打包时可以：

```txt
1. 构建 web。
2. 把 web/.next/standalone、web/.next/static、web/public 带进桌面应用资源。
3. Electron 启动后在 127.0.0.1 的随机端口启动 Next server。
4. BrowserWindow 加载这个本地地址。
```

原因是当前项目存在 Next route handler：

```txt
web/src/app/api/[...path]/route.ts
web/src/app/webdav-proxy/route.ts
```

这些能力依赖 Next 服务端运行。如果改成纯静态导出，相关代理能力需要迁移到 Electron 主进程，会带来更大的改动。

不推荐第一阶段改成：

```ts
output: "export"
```

除非后续明确要把所有 Next 服务端能力迁移到 Electron `ipc`、`protocol` 或独立后端服务。

## 安全边界

Electron 中不要让 renderer 直接获得 Node 权限。

推荐窗口配置原则：

```txt
nodeIntegration: false
contextIsolation: true
sandbox: true
preload: 使用独立 preload 文件暴露最小 API
```

`web/` 侧只使用类似下面的安全桥接：

```ts
window.desktop?.selectFolder?.();
window.desktop?.openExternal?.(url);
```

不要在 React 组件中直接调用 `fs`、`path`、`child_process` 等 Node API。

IPC 也要保持少而明确：

```txt
desktop:select-folder
desktop:save-file
desktop:open-external
desktop:get-app-version
desktop:get-config
desktop:set-config
```

不要把通用执行命令、任意文件读写这类危险能力直接暴露给前端。

## 后续扩展位

第一阶段可以先不实现，但目录上可以预留扩展方向：

```txt
desktop/src/ipc/
  文件选择、保存、导入导出、本地目录访问。

desktop/src/store.ts
  窗口尺寸、后端地址、最近打开项目、桌面端偏好。

desktop/src/protocol.ts
  自定义协议、深链、资源安全访问。

desktop/src/tray.ts
  托盘菜单、后台运行。

desktop/src/updater.ts
  自动更新。

desktop/src/menu.ts
  应用菜单、快捷键菜单、开发菜单。
```

如果后续桌面端需要更强的本地文件能力，可以优先放进 `desktop/src/ipc/`，不要直接侵入 `web/src/`。

## 不建议立刻做的事

### 不删除 `web/`

`web/` 是现有前端主体，不是临时网页目录。删除它等于重写前端。

### 不急着改成 `apps/web`

长期可以演进为：

```txt
infinite-canvas/
├─ apps/
│  ├─ web/
│  ├─ desktop/
│  └─ docs/
├─ packages/
│  ├─ shared/
│  └─ api-client/
└─ package.json
```

但现在不建议马上做。因为迁移会影响：

- `Dockerfile`。
- Docker Compose。
- GitHub Actions。
- README。
- 文档路径。
- `web/next.config.ts` 中读取 `../VERSION` 和 `../CHANGELOG.md` 的路径。
- 现有本地开发习惯。

等桌面端跑通后，再按实际复用需求决定是否迁移到 monorepo。

### 不把后端打进 Electron

当前目标是前端连接已有后端。Electron 只需要做桌面壳和系统能力，不建议把完整后端一起塞进桌面包。

如果未来确实要做离线单机版，再单独设计本地后端、数据库和数据同步策略。

### 不把 Next route handler 直接删掉

当前 `/api/[...path]` 和 `/webdav-proxy` 仍有实际作用。第一阶段继续保留，减少迁移风险。

## 推荐实施阶段

### 第一阶段：最小桌面壳

目标是把当前 `web/` 成功跑进 Electron。

需要做：

- 新增 `desktop/`。
- 新增 `main.ts`、`preload.ts`、`window.ts`。
- Electron 开发环境加载 `http://localhost:3002`。
- 保持后端连接方式不变。
- 不改 `web/` 业务逻辑。

### 第二阶段：生产打包

目标是产出可安装桌面应用。

需要做：

- 复用 `web` 的 Next standalone 构建。
- Electron 启动本地 Next server。
- 配置 `electron-builder`。
- 添加应用图标。
- 配置 macOS / Windows 打包产物。

### 第三阶段：桌面增强

目标是让桌面端提供 Web 端没有的本地能力。

可以逐步增加：

- 系统文件选择。
- 本地导入导出。
- 打开外部链接。
- 托盘。
- 菜单。
- 自动更新。
- 深链。
- 桌面端配置持久化。

### 第四阶段：长期结构升级

如果后续出现多个端共享大量代码，再考虑：

```txt
apps/web
apps/desktop
apps/docs
packages/shared
packages/api-client
```

在没有真实共享需求前，不提前抽 `packages/`。

## 当前项目的推荐最终方案

短期采用：

```txt
infinite-canvas/
├─ web/
├─ desktop/
├─ docs/
└─ package.json
```

职责保持：

```txt
web      = 业务前端
desktop  = Electron 桌面壳
backend  = 已有后端，独立运行
docs     = 文档站
```

这条路线改动最小，也方便后续扩展。等桌面版真正跑通并出现稳定复用需求后，再考虑 monorepo 迁移。
