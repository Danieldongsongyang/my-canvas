# 桌面端前端化改造 Issue 拆分计划

本文档基于 `web/DESKTOP_FRONTEND_MIGRATION_PLAN.md`，将第一阶段迁移拆成可独立领取的 tracer bullet issues。每个 issue 都尽量对应一条可演示、可验收的端到端路径，而不是单纯按文件或层级横向拆分。

## 拆分原则

1. 先完成同源请求适配层、登录状态、远程模型配置这三条基础链路。
2. 再把首页、管理后台、提示词、素材库、WebDAV 和远程 AI 请求分别收口。
3. 最后做一次端到端清扫，确认旧后端依赖没有留在启动链路和核心画布流程中。
4. 第一阶段只改 `my-canvas/web` 为主，`mange-backend` 只在发现必要缺口时做小补丁。

## 建议依赖顺序

```text
1 收紧同源请求适配层
  -> 2 重构桌面端登录状态
      -> 3 远程模型配置切到 /api/user/models
          -> 4 登录后首页改成工具入口页
              -> 5 移除桌面端 admin 入口与旧 admin API 调用链
              -> 6 提示词库改为前端静态或本地数据来源
              -> 7 素材库改为本地素材来源
          -> 8 确认画布远程 AI 请求全部走 Canvas Relay
          -> 9 弱化或禁用 WebDAV 的 Next.js proxyMode
              -> 10 第一阶段端到端验收与遗留旧接口清扫
```

第 5、6、7、8、9 可以在前置依赖完成后并行实施。第 10 作为集成验收 issue，依赖前面所有切片完成。

## Issue 1: 收紧同源请求适配层到认证与 Canvas Relay

### What to build

将桌面端保留的同源请求适配层收敛为极薄代理，只服务 `mange-backend` 登录态、用户信息、用户模型列表、canvas relay token 初始化，以及用户态 AI relay 请求。旧项目业务后端接口不再被这个适配层兼容或兜底。

### Acceptance criteria

- [ ] `POST /api/user/login`、`GET /api/user/logout`、`GET /api/user/self`、`GET /api/user/models` 能转发到 `mange-backend`，并保留 cookie 与 `New-Api-User` 相关请求头行为。
- [ ] `POST /api/canvas/relay-token` 能转发到 `mange-backend`，并支持当前用户上下文。
- [ ] `/api/canvas/relay/chat/completions`、`/api/canvas/relay/images/generations`、`/api/canvas/relay/images/edits`、`/api/canvas/relay/audio/speech`、`/api/canvas/relay/videos`、`/api/canvas/relay/videos/:id`、`/api/canvas/relay/videos/:id/content` 能保持流式响应和二进制响应可用。
- [ ] `/api/admin/*`、`/api/settings`、`/api/prompts`、`/api/assets` 不再通过桌面端适配层作为旧业务后端协议继续工作。
- [ ] 代理失败时返回中文错误，能提示用户确认 `mange-backend` 服务是否启动。

### Blocked by

None - can start immediately.

## Issue 2: 重构桌面端登录状态，移除本地 token 概念

### What to build

将桌面端登录状态改为由 `mange-backend` session cookie 承载真实登录态，前端本地只保存非敏感用户摘要和 relay 初始化状态。登录、刷新恢复、cookie 失效回退都围绕 `mange-backend` 用户接口完成。

### Acceptance criteria

- [ ] 本地持久化状态只包含用户摘要、`relayReady`、`isReady`、`isLoading` 等非敏感字段。
- [ ] 前端不再保存 relay API Key、dashboard access token，且不再用 `token` 字段伪装用户 ID。
- [ ] 用户名密码登录成功后会调用 `/api/canvas/relay-token`，并在 relay ready 后进入登录后体验。
- [ ] 应用刷新时，如果本地有用户摘要，会调用 `/api/user/self` 校验 cookie；校验成功后恢复登录态。
- [ ] cookie 失效、用户不存在或后端返回 guest 时，会清空本地用户摘要和 relay 状态，并回到登录页。
- [ ] 2FA、OAuth、Passkey 等第一阶段不支持的登录方式返回清晰中文提示，注册入口仍打开 `mange-backend /register`。

### Blocked by

- Issue 1

## Issue 3: 把远程模型配置从旧 settings 切到 `/api/user/models`

### What to build

移除应用启动对旧 `/api/settings` 的依赖，远程模式使用当前登录用户从 `mange-backend` 获取的可用模型列表。本地直连模式保留为高级选项，继续允许用户自行填写 OpenAI 兼容 `baseUrl` 和 API Key。

### Acceptance criteria

- [ ] 应用启动不再请求 `/api/settings`，也不再等待旧 public settings 才能进入主界面。
- [ ] 登录用户能通过 `/api/user/models` 获取可用模型列表。
- [ ] 远程模式下，文本、图片、视频、音频模型选择基于当前用户可用模型列表和现有能力识别规则。
- [ ] 当用户模型列表为空或后端不可用时，界面给出明确中文提示，而不是要求配置旧后台 settings。
- [ ] 本地直连模式仍保留 `baseUrl`、API Key、模型名等高级配置。
- [ ] URL 参数导入 `baseUrl` 或 `apiKey` 的逻辑不再依赖旧后台的 `allowCustomChannel` 配置。

### Blocked by

- Issue 2

## Issue 4: 把登录后的首页改成工具入口页

### What to build

将当前首页收敛为登录后的 AI 工具入口页。未登录用户看到登录页；登录并完成 relay 初始化后进入工具入口页。工具入口页提供画布入口，预留 AI 漫剧生成流程入口，并提供打开 `mange-backend` 注册、账号中心、模型管理等网页端能力的入口。

### Acceptance criteria

- [ ] 未登录访问登录后页面会进入登录页，登录成功后回到工具入口页。
- [ ] 首页不再作为未登录营销页，也不再为了展示效果请求旧 `/api/prompts`。
- [ ] 工具入口页包含画布入口，能进入当前画布列表或画布工作区。
- [ ] 工具入口页预留 AI 漫剧生成流程入口，状态可为“即将开放”或不可点击占位。
- [ ] 注册、账号中心、模型管理、Key 管理等入口打开 `mange-backend` 网页端。
- [ ] admin 用户登录后也进入工具入口页，而不是当前项目管理后台。

### Blocked by

- Issue 2
- Issue 3

## Issue 5: 移除桌面端 admin 入口与旧 admin API 调用链

### What to build

从桌面端第一阶段范围中移除当前项目自带的 `/admin/*` 管理后台入口和旧 `/api/admin/*` 调用链。管理后台能力统一跳转到 `mange-backend` 网页端完成。

### Acceptance criteria

- [ ] 当前项目导航、登录跳转、用户菜单和路由保护不再把用户引导到 `/admin/*`。
- [ ] `/admin/*` 不再作为桌面端功能入口；访问时应跳转到工具入口页、登录页、404，或明确提示去 `mange-backend`。
- [ ] 用户注册、用户管理、模型渠道添加、Key 管理、额度和后台设置都有对应 `mange-backend` 网页入口。
- [ ] 桌面端运行路径不再依赖 `web/src/services/api/admin.ts` 的旧 API 调用。
- [ ] 不为旧 admin 页面保留兼容逻辑或旧协议迁移兜底。

### Blocked by

- Issue 4

## Issue 6: 提示词库改为前端静态或本地数据来源

### What to build

第一阶段不新增 `mange-backend` prompts 接口，将内置提示词改为前端静态数据或本地数据来源。提示词页面、提示词选择弹窗和首页引用都不再请求旧 `/api/prompts`。

### Acceptance criteria

- [ ] 提示词列表、分类、标签、搜索和详情能从前端静态数据或本地数据读取。
- [ ] 首页、提示词页面、画布内提示词选择弹窗不再请求 `/api/prompts`。
- [ ] 如果用户侧提示词编辑或收藏仍保留，应使用本地持久化能力。
- [ ] 空状态、加载失败状态和搜索无结果状态保持中文文案。
- [ ] 不新增 `mange-backend` prompts 接口，不提前设计云同步或团队共享数据模型。

### Blocked by

- Issue 4

## Issue 7: 素材库改为本地素材来源

### What to build

将素材库从旧 `/api/assets` 后端依赖切换为前端本地素材来源。画布素材选择、素材库页面和用户素材管理继续基于本地持久化能力运行。

### Acceptance criteria

- [ ] 素材库页面不再请求 `/api/assets`。
- [ ] 画布素材选择器能从本地素材库读取图片、视频、文本等素材。
- [ ] 用户新增、筛选、查看素材的核心路径仍可在本地完成。
- [ ] 本地素材持久化使用项目已有本地存储能力，业务列表、图片、base64 或大 JSON 不写入 `localStorage`。
- [ ] 不新增 `mange-backend` assets 接口，不提前设计云同步或团队共享数据模型。

### Blocked by

- Issue 4

## Issue 8: 确认画布远程 AI 请求全部走 Canvas Relay

### What to build

让画布和相关工具在远程模式下统一通过 `/api/canvas/relay/*` 调用模型。远程模式只使用 `mange-backend` 登录态、`New-Api-User` 和 relay 初始化结果，不保存、不读取、不发送真实 `sk-*` relay API Key。

### Acceptance criteria

- [ ] 远程图片生成走 `/api/canvas/relay/images/generations`。
- [ ] 远程图片编辑走 `/api/canvas/relay/images/edits`。
- [ ] 远程聊天或图片问答走 `/api/canvas/relay/chat/completions`，并保持流式输出可用。
- [ ] 远程音频生成走 `/api/canvas/relay/audio/speech`，并保持二进制音频响应可用。
- [ ] 远程视频创建、查询和内容获取走 `/api/canvas/relay/videos`、`/api/canvas/relay/videos/:id`、`/api/canvas/relay/videos/:id/content`。
- [ ] 远程模式请求头不出现真实 `Authorization: Bearer sk-*` relay key。
- [ ] relay 未初始化时能重新初始化或提示用户登录，不要求用户手动填写远程 relay Key。
- [ ] 本地直连模式仍允许用户自行填写 OpenAI 兼容 API Key，并只在本地模式发送该 Key。

### Blocked by

- Issue 1
- Issue 2
- Issue 3

## Issue 9: 弱化或禁用 WebDAV 的 Next.js proxyMode

### What to build

将 WebDAV 从第一阶段核心链路中移出。WebDAV 不阻塞登录、AI relay 和画布主流程；`nextjs proxyMode` 不再作为长期核心方案。后续如果桌面端仍需要 WebDAV，再单独通过 Electron 主进程 IPC 设计受控能力。

### Acceptance criteria

- [ ] 默认 WebDAV 配置不再使用 `nextjs proxyMode`。
- [ ] WebDAV 同步不可用时，不影响登录、工具入口页、画布打开和远程 AI 请求。
- [ ] UI 中与 `nextjs proxyMode` 相关的入口被隐藏、禁用，或明确标注为非第一阶段核心能力。
- [ ] `/webdav-proxy` 不再被核心流程依赖。
- [ ] 不在本 issue 中实现 Electron IPC 版 WebDAV。

### Blocked by

- Issue 3

## Issue 10: 第一阶段端到端验收与遗留旧接口清扫

### What to build

在前面切片完成后，对桌面端第一阶段迁移做端到端验收和遗留旧接口清扫。目标是确认启动、登录、恢复、工具入口、画布、AI relay、本地提示词、本地素材和 WebDAV 弱化后的组合行为满足迁移计划。

### Acceptance criteria

- [ ] 未登录用户看到登录页。
- [ ] 点击注册能打开 `mange-backend` 网页端注册页。
- [ ] 用户能用 `mange-backend` 用户名密码登录。
- [ ] 登录成功后能调用 `/api/canvas/relay-token`。
- [ ] 前端远程模式请求中不出现真实 `Authorization: Bearer sk-*` relay key。
- [ ] 刷新后能用本地用户摘要和 cookie 恢复登录态。
- [ ] cookie 失效后清空用户摘要并回到登录页。
- [ ] 登录成功后进入工具入口页。
- [ ] 工具入口页能进入画布。
- [ ] 当前项目 `/admin/*` 不再作为桌面端功能入口。
- [ ] 远程 AI 请求走 `/api/canvas/relay/*`。
- [ ] `/api/settings` 不再是应用启动依赖。
- [ ] 提示词和素材库不再依赖旧后端接口。
- [ ] WebDAV 的 Next.js 代理不再是核心链路依赖。

### Blocked by

- Issue 1
- Issue 2
- Issue 3
- Issue 4
- Issue 5
- Issue 6
- Issue 7
- Issue 8
- Issue 9

## 发布备注

如果后续要发布到 GitHub Issues，建议按依赖顺序创建，并给每个 issue 加上 `ready-for-agent` 标签。创建 Issue 2 及之后的 issue 时，把真实的前置 issue 编号写入 `Blocked by`，方便 AFK agent 判断领取顺序。
