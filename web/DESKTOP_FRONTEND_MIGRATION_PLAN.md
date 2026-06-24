# 桌面端前端化改造执行计划

本文档整理当前 `my-canvas/web` 改造成桌面端前端客户端的执行边界。目标是移除当前项目自带的业务后端能力，保留极薄的同源请求适配层，并让前端通过该适配层连接独立运行的 `/Users/a1/Desktop/mange-backend`。

## 最终目标

第一阶段要把当前 `web` 收敛成一个登录后的 AI 工具应用：

1. 未登录用户看到登录页。
2. 登录使用 `mange-backend` 的用户名密码登录接口。
3. 注册、账号管理、模型渠道添加、Key 管理等流程跳转到 `mange-backend` 网页端。
4. 登录成功后初始化后端代持的 `Infinite Canvas Desktop` relay token。
5. 前端不保存、不读取、不发送真实 `sk-*` relay API Key。
6. 登录后进入工具入口页，而不是管理后台或营销页。
7. 当前画布作为第一个核心工具入口，后续 AI 漫剧生成流程作为并列工具新增。

## 已确认决策

### 保留同源请求适配层

“去后端”指移除当前项目自带的业务后端，不是删除所有 route handler。

保留 `web/src/app/api/[...path]/route.ts` 这一类极薄的同源请求适配层，但它只能做：

1. 转发 `mange-backend` 登录与用户接口。
2. 转发 canvas relay 初始化接口。
3. 转发用户态 AI relay 请求。
4. 处理 cookie、`New-Api-User`、后端地址和流式响应。

它不能继续作为当前项目旧业务后端的兼容层。

参考 ADR：

- `docs/adr/0001-keep-same-origin-request-adapter.md`
- `docs/adr/0007-react-uses-same-origin-api.md`
- `docs/adr/0008-limit-request-adapter-to-auth-and-relay.md`

### 不保留当前项目管理后台

桌面端不保留当前项目的 `/admin/*` 管理后台，也不迁移旧的 `/api/admin/*` 协议。

必须保留 `mange-backend` 网页端。后续这些能力都去 `mange-backend` 网页端完成：

1. 用户注册。
2. 用户管理。
3. 模型渠道添加。
4. Key 管理。
5. 额度和后台设置。

参考 ADR：

- `docs/adr/0002-desktop-does-not-own-admin-console.md`

### 提示词和素材库第一阶段本地化

第一阶段不为提示词和素材库新增 `mange-backend` 接口。

1. 内置提示词可以改成前端静态数据。
2. 用户素材继续使用前端本地持久化能力。
3. 后续如果要云同步或团队共享，再单独设计后端数据模型。

参考 ADR：

- `docs/adr/0003-keep-prompts-and-assets-local-first.md`

### WebDAV 不属于核心适配层

WebDAV 同步不阻塞登录、AI relay 和画布主流程。

1. 不长期保留 `web/src/app/webdav-proxy/route.ts` 作为核心方案。
2. 第一阶段弱化、隐藏或禁用 `nextjs proxyMode`。
3. 如果后续桌面端仍需要 WebDAV，优先通过 Electron 主进程 IPC 实现受控能力。

参考 ADR：

- `docs/adr/0004-webdav-is-not-part-of-core-adapter.md`

### 桌面端只消费模型，不管理渠道

远程模式通过 `mange-backend` 登录态和用户态 AI relay 调用模型。

1. 模型渠道添加、接口地址、后端 Key 和额度策略归 `mange-backend` 网页端。
2. 桌面端从 `/api/user/models` 获取当前用户可用模型。
3. 本地直连模式作为高级选项保留，用户自行填写 OpenAI 兼容 `baseUrl` 和 API Key。

参考 ADR：

- `docs/adr/0005-desktop-consumes-models-but-does-not-manage-channels.md`
- `docs/adr/0009-remove-settings-api-dependency.md`

### 登录后进入工具入口页

当前首页保留为登录后的工具入口页，不作为未登录营销页。

1. 未登录显示登录页。
2. 登录并完成 relay 初始化后进入工具入口页。
3. 工具入口页包含画布入口。
4. 后续新增 AI 漫剧生成流程入口。
5. 未来外部端上线时，再单独设计营销页和公开访问体验。

参考 ADR：

- `docs/adr/0006-login-enters-tool-hub.md`

### 用户状态不再保存 token

真实登录态由 `mange-backend` session cookie 承载。

前端本地只保存：

1. 非敏感用户摘要。
2. `relayReady`。
3. `isReady`。
4. `isLoading`。

不要保存：

1. relay API Key。
2. dashboard access token。
3. 用 `token` 字段伪装的用户 ID。

参考 ADR：

- `docs/adr/0010-auth-store-keeps-user-summary-not-token.md`

### 第一阶段只做用户名密码登录

桌面端第一阶段只支持用户名密码登录。

1. 注册打开 `mange-backend /register`。
2. OAuth、Passkey、邮箱验证、人机验证等复杂流程交给 `mange-backend` 网页端。
3. 如果后端返回需要 2FA，第一阶段先提示暂不支持桌面端 2FA 登录。
4. 后续再单独支持 `/api/user/login/2fa`。

参考 ADR：

- `docs/adr/0011-first-phase-auth-is-username-password.md`

### 第一阶段前端优先改造

第一阶段优先改 `my-canvas/web`，`mange-backend` 保持稳定。

只有发现必要缺口时，才对 `mange-backend` 做小补丁，例如：

1. CORS。
2. session 行为。
3. relay 接口响应。
4. 错误文案。
5. `/api/user/models` 可用性。

参考 ADR：

- `docs/adr/0012-front-end-first-migration.md`

## 保留范围

### 当前前端保留

1. `web/` 作为业务前端主体。
2. 画布页面和画布核心交互。
3. 登录页。
4. 登录后的工具入口页。
5. 本地素材、本地画布、本地提示词能力。
6. 本地直连 OpenAI 兼容服务的高级配置。
7. 极薄的 `mange-backend` 同源请求适配层。

### mange-backend 保留

1. `mange-backend` 后端服务。
2. `mange-backend` 网页端。
3. 注册、账号管理、模型渠道、Key 管理、额度配置。
4. 用户态 AI relay。
5. 后端代持 relay API Key。

## 移除或废弃范围

第一阶段从桌面端范围中移除或废弃：

1. 当前项目 `/admin/*` 管理后台。
2. 当前项目旧 `/api/admin/*` 协议。
3. 当前项目旧 `/api/settings` 启动依赖。
4. 当前项目旧 `/api/prompts` 后端依赖。
5. 当前项目旧 `/api/assets` 后端依赖。
6. `webdav-proxy` 作为长期核心方案。
7. 用户 store 中的 `token` 概念。
8. 前端持有真实 relay API Key 的远程默认流程。

## 前端请求映射

### 认证与用户

| 前端同源请求 | mange-backend 目标 | 状态 |
| --- | --- | --- |
| `POST /api/user/login` | `POST /api/user/login` | 保留 |
| `GET /api/user/logout` | `GET /api/user/logout` | 保留 |
| `GET /api/user/self` | `GET /api/user/self` | 保留，带 `New-Api-User` |
| `GET /api/user/models` | `GET /api/user/models` | 保留，带 `New-Api-User` |
| `POST /api/canvas/relay-token` | `POST /api/canvas/relay-token` | 保留，带 `New-Api-User` |

### AI relay

| 前端同源请求 | mange-backend 目标 | 状态 |
| --- | --- | --- |
| `POST /api/canvas/relay/chat/completions` | 同路径 | 保留 |
| `POST /api/canvas/relay/images/generations` | 同路径 | 保留 |
| `POST /api/canvas/relay/images/edits` | 同路径 | 保留 |
| `POST /api/canvas/relay/audio/speech` | 同路径 | 保留 |
| `POST /api/canvas/relay/videos` | 同路径 | 保留 |
| `GET /api/canvas/relay/videos/:id` | 同路径 | 保留 |
| `GET /api/canvas/relay/videos/:id/content` | 同路径 | 保留 |

### 旧接口处理

| 当前请求 | 处理方式 |
| --- | --- |
| `/api/admin/*` | 删除对应桌面端入口和旧 API 调用 |
| `/api/settings` | 删除启动依赖，改本地默认配置和 `/api/user/models` |
| `/api/prompts` | 改前端静态数据或本地持久化 |
| `/api/assets` | 改前端本地素材库 |
| `/webdav-proxy` | 弱化、禁用或后续迁移到 Electron IPC |

## 用户状态设计

推荐状态结构：

```ts
type DesktopAuthUser = {
    id: string;
    username: string;
    displayName: string;
    role: "guest" | "user" | "admin";
    status?: number;
    group?: string;
};

type DesktopAuthState = {
    user: DesktopAuthUser | null;
    relayReady: boolean;
    isReady: boolean;
    isLoading: boolean;
};
```

启动恢复流程：

1. 从本地恢复用户摘要和 `relayReady`。
2. 如果没有用户摘要，显示登录页。
3. 如果有用户摘要，调用 `/api/user/self` 校验 cookie。
4. 请求带 `New-Api-User: user.id`。
5. 校验成功后进入工具入口页。
6. 校验失败后清空用户摘要和 `relayReady`，回到登录页。
7. 如果 `relayReady` 为 false，重新调用 `/api/canvas/relay-token`。

## 第一阶段实施顺序

1. 收紧 `web/src/app/api/[...path]/route.ts`，只允许用户接口和 canvas relay。
2. 重构 `web/src/stores/use-user-store.ts`，去掉 `token` 字段。
3. 调整 `web/src/services/api/auth.ts`，明确只处理 `mange-backend` 登录、用户信息、模型列表和 relay 初始化。
4. 删除或隐藏 `/admin/*` 路由入口，移除旧 admin API 调用链。
5. 移除 `/api/settings` 启动依赖，远程模式改为本地默认配置加 `/api/user/models`。
6. 将提示词改为静态数据或本地数据来源。
7. 将素材库改为本地素材来源，不再请求 `/api/assets`。
8. 弱化或禁用 WebDAV 的 `nextjs proxyMode`。
9. 确认 image、audio、video、chat 的 remote 模式全部走 `/api/canvas/relay/*`。
10. 调整登录成功后的跳转，进入工具入口页。
11. 在工具入口页提供画布入口，并预留 AI 漫剧生成流程入口。
12. 提供打开 `mange-backend` 注册页、账号中心或模型管理页的入口。

## 暂不做事项

第一阶段不做：

1. 不改造 `mange-backend` 网页端。
2. 不把 `mange-backend` 后端打进 Electron。
3. 不在桌面端复刻 `mange-backend` 管理后台。
4. 不做桌面端内注册表单。
5. 不完整支持 2FA、OAuth、Passkey。
6. 不新增 `mange-backend` prompts/assets 接口。
7. 不做 WebDAV Electron IPC。
8. 不做外部端营销页。
9. 不迁移到 `apps/web` monorepo 结构。

## 验收标准

第一阶段完成后，应满足：

1. 未登录时显示登录页。
2. 点击注册能打开 `mange-backend` 网页端注册页。
3. 用户能用 `mange-backend` 用户名密码登录。
4. 登录成功后能调用 `/api/canvas/relay-token`。
5. 前端请求中不出现真实 `Authorization: Bearer sk-*` relay key。
6. 刷新后能用本地用户摘要和 cookie 恢复登录态。
7. cookie 失效后清空用户摘要并回到登录页。
8. 登录成功后进入工具入口页。
9. 工具入口页能进入画布。
10. 当前项目 `/admin/*` 不再作为桌面端功能入口。
11. 远程 AI 请求走 `/api/canvas/relay/*`。
12. `/api/settings` 不再是应用启动依赖。
13. 提示词和素材库不再依赖旧后端接口。
14. WebDAV 的 Next 代理不再是核心链路依赖。

