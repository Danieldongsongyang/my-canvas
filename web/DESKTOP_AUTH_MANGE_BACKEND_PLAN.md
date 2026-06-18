# 桌面端登录注册与 mange-backend 接入方案

本文档用于梳理：`infinite-canvas/web` 做成桌面端应用后，首页登录、注册跳转、登录态保存、后端代持 AI relay API Key，以及后续聊天/生图请求接入 `/Users/a1/Desktop/mange-backend` 的推荐实现方案。

核心结论：

1. 桌面端不内置完整注册表单，只提供“注册账号”链接。
2. 用户点击注册链接后，打开 `mange-backend` 的网页注册页。
3. 注册完成后，用户回到桌面端，使用刚创建的用户名和密码登录。
4. 桌面端登录使用 `mange-backend` 的登录系统，不再使用当前 `infinite-canvas` 自带 JWT 登录系统。
5. 登录成功后，桌面端调用 `mange-backend` 的专用初始化接口，自动为当前用户创建或确认一个 `Infinite Canvas Desktop` 专用 relay API Key。
6. relay API Key 只保存在 `mange-backend` 后端，不返回给桌面端前端。
7. 后续聊天、生图、图文上下文问答请求由前端带登录态请求 `mange-backend` 的用户态 AI 代理接口，后端内部注入 relay API Key 再调用 `/v1/*` relay。

## 术语说明

| 名称 | 含义 |
| --- | --- |
| 桌面端 | 由当前 `infinite-canvas/web` 打包出的桌面应用，例如 Tauri/Electron 外壳中的 Next 前端 |
| `mange-backend` 网页端 | `mange-backend` 自带的管理/用户网页，用来完成注册、账号管理、充值、查看 Key 等 |
| 用户登录态 | `mange-backend` 登录后建立的 session/cookie，用于访问 `/api/user/*`、`/api/token/*` 等后台 API |
| dashboard access token | `mange-backend` 的 `/api/user/token` 生成的用户 access token，用于部分 dashboard API，不等同于模型 relay key |
| relay API Key | `mange-backend` `tokens` 表里的 `sk-...` key，用于请求 `/v1/chat/completions`、`/v1/images/generations` 等 OpenAI 兼容接口 |

需要明确区分：

```txt
登录态 / session cookie 只能证明用户已登录后台 API。
relay API Key 才能调用 /v1/* 模型接口。
```

不要把当前 `infinite-canvas` 登录 token、`mange-backend` dashboard access token 和 relay API Key 混用。

安全边界必须明确：

```txt
前端不保存、不读取、不发送真实 relay API Key。
真实 relay API Key 只存在 mange-backend 后端。
前端只携带 mange-backend 登录态，请求后端的用户态 AI 代理接口。
```

这和 Codex、Claude、ChatGPT 这类官方客户端的常见模型类似：客户端每次请求会携带登录态、session、短期 token 或设备 token 来证明用户身份，但不会直接持有可调用模型服务的长期 `sk-...` API Key。真正调用模型服务的凭据由官方后端代持、校验额度后再内部转发。

## 目标用户流程

### 1. 新用户注册

桌面端首页只提供一个注册链接：

```txt
注册账号
```

点击后使用系统浏览器打开 `mange-backend` 的注册页面：

```txt
${MANGE_BACKEND_WEB_URL}/register
```

当前 `mange-backend` 前端存在 `/register` 路由，也存在 `/sign-up` 路由。第一阶段建议统一使用 `/register`，如果后续部署主题改成 `/sign-up`，再把链接做成可配置项。

注册流程全部交给 `mange-backend`：

1. 注册开关。
2. 邮箱验证。
3. Turnstile/人机校验。
4. 用户协议和隐私协议。
5. 邀请码或推广关系。
6. 第三方登录注册。

注册成功后，不要求自动回跳桌面端。用户自己回到桌面端，用刚创建的用户名和密码登录。

### 2. 已有用户登录

桌面端首页显示：

```txt
用户名
密码
登录按钮
注册账号链接
```

登录时请求 `mange-backend`：

```txt
POST /api/user/login
```

请求体：

```json
{
  "username": "demo",
  "password": "password"
}
```

`mange-backend` 登录成功后会写入 session cookie，并返回用户信息，典型响应结构是：

```json
{
  "success": true,
  "message": "",
  "data": {
    "id": 1,
    "username": "demo",
    "display_name": "demo",
    "role": 1,
    "status": 1,
    "group": "default"
  }
}
```

桌面端保存：

```txt
user.id
user.username
user.display_name
user.role
user.status
user.group
```

后续调用 `mange-backend` 的用户 API 时，除了 cookie，还需要带：

```txt
New-Api-User: ${user.id}
```

这是 `mange-backend` 当前 `UserAuth()` 的认证习惯。它会检查 session/access token 中的用户 ID 是否和 `New-Api-User` 一致。

### 3. 登录成功后初始化后端代持 relay API Key

登录成功后，桌面端立即调用一个专用接口：

```txt
POST /api/canvas/relay-token
```

这个接口建议新增在 `mange-backend`，而不是让桌面端直接拼现有 `/api/token` 管理接口。

推荐原因：

1. 现有 token 管理接口面向后台 Key 管理页面，不适合作为桌面端自动初始化协议。
2. 桌面端不应该关心 token 分页、搜索、打码、批量删除等后台页面逻辑。
3. 专用接口可以保证幂等：已有则确认可用，没有则创建。
4. 专用接口可以明确约束：不向前端返回完整 `sk-...` key。
5. 后续可以在同一接口中返回用户可用模型、默认模型、额度状态等非敏感信息。

推荐接口行为：

```txt
1. 使用 UserAuth() 校验当前用户登录态。
2. 从上下文读取 user id。
3. 查找该用户是否已有 name = "Infinite Canvas Desktop" 的 token。
4. 如果已有且可用，返回 relay 已准备好的状态，不返回完整 key。
5. 如果没有，创建一个新的 token，再返回 relay 已准备好的状态，不返回完整 key。
6. 如果已有但禁用、过期或耗尽，按产品策略返回错误或创建新 token。
```

推荐响应：

```json
{
  "success": true,
  "message": "",
  "data": {
    "token_id": 123,
    "token_name": "Infinite Canvas Desktop",
    "relay_ready": true,
    "relay_proxy_prefix": "/api/canvas/relay"
  }
}
```

如果后端想顺便返回用户可用模型，也可以扩展：

```json
{
  "available_models": ["gpt-4o", "gpt-image-1"],
  "default_text_model": "gpt-4o",
  "default_image_model": "gpt-image-1"
}
```

第一阶段不强依赖这些模型字段，模型列表仍可沿用现有公开配置或后续再补。

## mange-backend 现有接口确认

### 用户注册和登录

`mange-backend` 当前已有：

```txt
POST /api/user/register
POST /api/user/login
POST /api/user/login/2fa
GET  /api/user/logout
GET  /api/user/self
GET  /api/user/models
```

注册和登录路由位于：

```txt
/Users/a1/Desktop/mange-backend/router/api-router.go
```

登录处理位于：

```txt
/Users/a1/Desktop/mange-backend/controller/user.go
```

注意：

1. `mange-backend` 登录是 session/cookie 模式，不是当前 `infinite-canvas` 的 JWT 返回模式。
2. 登录接口可能受 Turnstile、限流、2FA、密码登录开关影响。
3. 如果生产环境开启 Turnstile，桌面端登录也需要支持 `turnstile` 参数，或为桌面端制定单独的可信调用策略。

### token 管理

`mange-backend` 当前已有：

```txt
GET    /api/token/
GET    /api/token/search
GET    /api/token/:id
POST   /api/token/:id/key
POST   /api/token/
PUT    /api/token/
DELETE /api/token/:id
```

这些接口使用 `UserAuth()`，适合后台 Key 管理页面。

不建议桌面端第一阶段直接使用这组接口完成自动初始化，因为完整 key 的获取链路偏后台页面，不够直接。

### relay 接口

`mange-backend` relay 是根路径，不是 `/api/v1`：

```txt
POST /v1/chat/completions
POST /v1/images/generations
POST /v1/images/edits
POST /v1/audio/speech
GET  /v1/models
```

这些接口使用 `TokenAuth()`，必须带：

```txt
Authorization: Bearer sk-...
```

因此：

```txt
用户登录态不能直接调用 /v1/*。
桌面端前端也不应该直接拿到 relay API Key。
需要由 mange-backend 增加用户态 AI 代理接口，在后端内部用 relay API Key 调用 /v1/*。
```

推荐新增用户态 AI 代理前缀：

```txt
/api/canvas/relay/v1/chat/completions
/api/canvas/relay/v1/images/generations
/api/canvas/relay/v1/images/edits
/api/canvas/relay/v1/audio/speech
```

这些代理接口使用 `UserAuth()`，前端请求只带：

```txt
Cookie: mange-backend session
New-Api-User: ${user.id}
```

后端内部完成：

```txt
1. 校验用户登录态。
2. ensure 当前用户存在 Infinite Canvas Desktop token。
3. 读取该 token 的完整 key。
4. 内部注入 Authorization: Bearer sk-...
5. 转发到 mange-backend 现有 /v1/* relay 或复用现有 relay 处理逻辑。
6. 将响应、错误和流式内容透传给桌面端。
```

## Next 代理路径设计

当前 `infinite-canvas/web` 是 Next 项目，前端请求统一走 `/api/*` 是项目软约定。

推荐保持这个约定：

```txt
桌面端前端只请求同源 /api/*
Next 代理负责转发到 mange-backend
```

但代理需要区分两类路径。

### 普通后台 API

前端请求：

```txt
/api/user/login
/api/user/self
/api/canvas/relay-token
```

Next 代理到：

```txt
${API_BASE_URL}/api/user/login
${API_BASE_URL}/api/user/self
${API_BASE_URL}/api/canvas/relay-token
```

### 用户态 AI relay 代理

前端请求：

```txt
/api/v1/chat/completions
/api/v1/images/generations
/api/v1/images/edits
/api/v1/audio/speech
```

Next 代理到 `mange-backend` 用户态 AI 代理接口：

```txt
${API_BASE_URL}/api/canvas/relay/v1/chat/completions
${API_BASE_URL}/api/canvas/relay/v1/images/generations
${API_BASE_URL}/api/canvas/relay/v1/images/edits
${API_BASE_URL}/api/canvas/relay/v1/audio/speech
```

推荐代理规则：

```txt
如果 path[0] 是 v1 / v1beta / mj / suno：
    target = ${API_BASE_URL}/api/canvas/relay/${path...}
否则：
    target = ${API_BASE_URL}/api/${path...}
```

这样浏览器侧仍然只看见 `/api/*`，真实 relay API Key 不出现在前端请求里，后端真实路径可以同时兼容：

```txt
/api/user/*
/api/token/*
/api/canvas/relay/v1/*
/api/canvas/relay/v1beta/*
/api/canvas/relay/mj/*
/api/canvas/relay/suno/*
```

## 前端认证状态设计

当前 `infinite-canvas/web` 的用户状态更像这样：

```txt
token: string
user: AuthUser | null
```

并且请求当前项目自带后端：

```txt
POST /api/auth/login
POST /api/auth/register
GET  /api/auth/me
```

桌面端接入 `mange-backend` 后，建议调整为：

```ts
type DesktopAuthUser = {
    id: number;
    username: string;
    displayName: string;
    role: number;
    status: number;
    group: string;
};

type DesktopAuthState = {
    user: DesktopAuthUser | null;
    relayReady: boolean;
    isReady: boolean;
    isLoading: boolean;
};
```

状态职责：

| 字段 | 用途 |
| --- | --- |
| `user` | 当前 `mange-backend` 登录用户 |
| `relayReady` | 后端是否已为当前用户准备好 `Infinite Canvas Desktop` 专用 relay token |
| `isReady` | 是否完成本地持久化恢复和登录态检查 |
| `isLoading` | 是否正在登录、退出或初始化 |

不建议继续叫 `token`，避免和 `mange-backend` 登录态、dashboard access token、relay API Key 混淆。

### 本地持久化

桌面端建议保存：

```txt
user.id
user.username
user.displayName
relayReady
```

cookie/session 由 WebView 或系统网络层处理。

不要把真实 relay API Key 存到 Zustand persist、localforage、localStorage、普通配置文件或前端日志中。

如果后续使用 Tauri/Electron 并选择由主进程直接请求模型服务，才考虑把 relay API Key 存入系统安全存储，例如 Keychain/钥匙串/凭据管理器。当前推荐方案是 `mange-backend` 后端代持，前端只保存 `relayReady`。

### 启动恢复

桌面端启动时建议：

```txt
1. 从本地恢复 user 和 relayReady。
2. 如果没有 user，停留在登录页。
3. 如果有 user，调用 /api/user/self 校验登录态。
4. 请求 /api/user/self 时带 New-Api-User: user.id。
5. 如果校验成功，进入应用。
6. 如果 cookie 已失效，清空 user 和 relayReady，回到登录页。
7. 如果 user 存在但 relayReady 为 false，重新调用 /api/canvas/relay-token。
```

如果本地只剩 cookie 但丢失 `user.id`，当前 `mange-backend` 的 `UserAuth()` 不方便直接恢复身份，因为它要求 `New-Api-User`。第一阶段可以直接要求用户重新登录。

## 前端 API 封装建议

建议新增或重写：

```txt
web/src/services/api/auth.ts
web/src/stores/use-user-store.ts
```

推荐 API：

```ts
export async function loginMangeBackend(payload: {
    username: string;
    password: string;
    turnstile?: string;
}): Promise<MangeLoginResponse>;

export async function fetchMangeSelf(userId: number): Promise<MangeUser>;

export async function logoutMangeBackend(userId?: number): Promise<void>;

export async function ensureCanvasRelayToken(userId: number): Promise<CanvasRelayToken>;
```

普通后台 API 请求需要：

```txt
credentials: include
New-Api-User: user.id
```

relay API 请求需要：

```txt
credentials: include
New-Api-User: user.id
```

relay 请求走 `mange-backend` 用户态 AI 代理接口，由后端内部注入 `Authorization: Bearer sk-...`。前端不依赖、不保存、不发送真实 relay API Key。

## 登录页 UI 逻辑

桌面端首页就是登录页，不做营销落地页。

页面元素：

```txt
用户名输入框
密码输入框
登录按钮
注册账号链接
错误提示
```

注册账号链接行为：

```txt
使用系统浏览器打开 ${MANGE_BACKEND_WEB_URL}/register
```

不要在第一阶段把注册页嵌入桌面端 WebView，原因：

1. `mange-backend` 注册页可能包含 Turnstile、OAuth、邮箱验证等网页能力。
2. 系统浏览器更容易完成第三方登录和验证码。
3. 桌面端不需要处理注册成功回调。

登录成功后：

```txt
1. 保存 user。
2. 调用 /api/canvas/relay-token。
3. 保存 relayReady。
4. 进入画布库或默认首页。
```

登录失败：

```txt
显示 mange-backend 返回的 message。
```

需要 2FA：

```txt
第一阶段可以提示“当前账号开启了二次验证，请先在网页端完成登录设置或使用未开启二次验证的账号”。
```

后续再支持：

```txt
POST /api/user/login/2fa
```

Passkey/OAuth：

```txt
第一阶段不在桌面端直接实现。
如果需要第三方登录，优先打开 mange-backend 网页端完成登录或绑定，再回桌面端用用户名密码登录。
```

## AI 请求接入方式

当前 `web/src/services/api/image.ts` 中 remote 模式会请求：

```txt
/api/v1/chat/completions
/api/v1/images/generations
/api/v1/images/edits
```

接入桌面端认证后，remote 模式请求不再携带 `Authorization: Bearer sk-...`。

remote 模式请求头应为：

```txt
credentials: include
New-Api-User: ${user.id}
```

不要继续使用旧的 `useUserStore.getState().token`，也不要新增 `relayApiKey` 给前端使用。

推荐把 AI 配置逻辑改成：

```txt
如果 channelMode = remote：
    URL = /api/v1${path}
    credentials = include
    New-Api-User = user.id

如果 channelMode = local：
    URL = buildApiUrl(config.baseUrl, path)
    Authorization = Bearer config.apiKey
```

这样可以同时保留：

1. 桌面端默认走 `mange-backend`。
2. 高级用户仍可使用本地直连 OpenAI 兼容服务。

## 退出登录

桌面端退出登录时：

```txt
1. 调用 GET /api/user/logout。
2. 清空本地 user。
3. 清空本地 relayReady。
4. 清空或重置 AI remote 状态。
5. 回到登录页。
```

默认不删除 `mange-backend` 后台的 `Infinite Canvas Desktop` token。

原因：

1. 退出登录只是退出当前设备。
2. 删除 token 会影响用户重新登录后的稳定性。
3. 用户可以在 `mange-backend` 网页端自行撤销 Key。

如果需要“退出并撤销本机 Key”，后续可增加独立按钮和确认弹窗。

## 后端新增接口建议

### 路由

建议在 `mange-backend` 增加：

```txt
POST /api/canvas/relay-token
```

或更明确：

```txt
POST /api/infinite-canvas/relay-token
```

第一阶段建议用较短的：

```txt
/api/canvas/relay-token
```

### 权限

使用：

```go
middleware.UserAuth()
```

请求需要带：

```txt
Cookie: mange-backend session
New-Api-User: user.id
```

### 伪代码

```go
func EnsureCanvasRelayToken(c *gin.Context) {
    userID := c.GetInt("id")
    tokenName := "Infinite Canvas Desktop"

    token, err := model.GetUserTokenByName(userID, tokenName)
    if err == nil && tokenIsUsable(token) {
        common.ApiSuccess(c, gin.H{
            "token_id": token.Id,
            "token_name": token.Name,
            "relay_ready": true,
            "relay_proxy_prefix": "/api/canvas/relay",
        })
        return
    }

    key, err := common.GenerateKey()
    if err != nil {
        common.ApiError(c, err)
        return
    }

    token = model.Token{
        UserId: userID,
        Name: tokenName,
        Key: key,
        CreatedTime: common.GetTimestamp(),
        AccessedTime: common.GetTimestamp(),
        ExpiredTime: -1,
        Group: "auto",
        ModelLimitsEnabled: false,
    }

    applyProductQuotaPolicy(&token)

    if err := token.Insert(); err != nil {
        common.ApiError(c, err)
        return
    }

    common.ApiSuccess(c, gin.H{
        "token_id": token.Id,
        "token_name": token.Name,
        "relay_ready": true,
        "relay_proxy_prefix": "/api/canvas/relay",
    })
}
```

实际实现时要以 `mange-backend` 现有 `model.Token`、`common.GenerateKey()`、`common.ApiSuccess()` 写法为准。

注意：`token.GetFullKey()` 只允许在 `mange-backend` 内部调用，用于后端代理请求现有 `/v1/*` relay。不要把完整 key 放进接口响应、前端 store、浏览器存储或日志。

### 额度策略

不要在桌面端写死额度。

后端可以选择：

```txt
方案 A：创建无限额度 token，实际额度由用户总账户控制。
方案 B：创建有限额度 token，额度来自用户当前套餐或默认额度。
方案 C：如果用户已有后台 token，则复用专用 token，不额外创建。
```

第一阶段建议后端统一决定，前端只消费返回的 `relay_ready` 和非敏感状态。

### 幂等策略

接口必须幂等。

同一用户重复调用：

```txt
POST /api/canvas/relay-token
```

不应该无限创建新 token。

推荐按名称查找：

```txt
Infinite Canvas Desktop
```

如果后续支持多设备，可以改成：

```txt
Infinite Canvas Desktop - ${deviceName}
```

但第一阶段不要引入设备管理复杂度。

## 环境变量建议

桌面端/Next 前端：

```txt
API_BASE_URL=http://127.0.0.1:8080
NEXT_PUBLIC_MANGE_BACKEND_WEB_URL=http://127.0.0.1:8080
```

含义：

| 变量 | 用途 |
| --- | --- |
| `API_BASE_URL` | Next 代理请求的后端 API 地址，只在服务端使用 |
| `NEXT_PUBLIC_MANGE_BACKEND_WEB_URL` | 前端打开注册页、账号管理页时使用的公开网页地址 |

如果桌面端和后端部署在公网：

```txt
API_BASE_URL=https://api.example.com
NEXT_PUBLIC_MANGE_BACKEND_WEB_URL=https://api.example.com
```

如果后续 `mange-backend` 网页端和 API 域名分离，再分别配置。

## 错误处理

### 登录失败

显示后端返回的：

```txt
message
```

常见情况：

```txt
用户名或密码错误
账号被禁用
登录功能未开启
Turnstile 校验失败
请求过于频繁
```

### 注册链接打不开

提示：

```txt
无法打开注册页面，请检查服务地址配置
```

并显示当前注册 URL，方便用户复制。

### relay token 初始化失败

提示：

```txt
登录成功，但初始化 AI Key 失败，请稍后重试或联系管理员
```

不要进入需要 AI 的主流程。可以提供“重试”按钮。

### relay 请求 401/403

处理逻辑：

```txt
1. 清空 relayReady。
2. 尝试重新调用 /api/canvas/relay-token。
3. 如果仍失败，提示用户重新登录。
```

不要把 401/403 简单提示为 OpenAI API Key 错误，因为这里的 key 是 `mange-backend` 后端代持的 relay key，前端并不知道完整 key。

### cookie 失效

调用 `/api/user/self` 或 `/api/canvas/relay-token` 返回未登录时：

```txt
1. 清空 user。
2. 清空 relayReady。
3. 回到登录页。
```

## 推荐实施阶段

### 第一阶段：最小闭环

目标：

```txt
桌面端可登录 mange-backend，后端自动准备 relay key，前端不接触真实 key，并能用聊天/生图接口。
```

改动：

```txt
mange-backend:
新增 POST /api/canvas/relay-token
新增 /api/canvas/relay/* 用户态 AI 代理

infinite-canvas/web:
修改 Next /api/[...path] 代理，把 /api/v1/* 分流到 mange-backend /api/canvas/relay/v1/*
修改 auth service 和 user store，接入 /api/user/login
新增登录页注册链接，打开 mange-backend /register
AI remote 请求使用登录态和 New-Api-User，不使用 relayApiKey
退出登录清理 user 和 relayReady
```

暂不做：

```txt
桌面端内注册表单
2FA 输入流程
Passkey 登录
OAuth 回调
多设备 token 管理
撤销本机 token
```

### 第二阶段：账号体验完善

可补：

```txt
支持 2FA 登录
支持网页登录后回跳桌面端
支持打开账号中心
支持查看额度和用量
支持 token 失效自动重建
```

### 第三阶段：桌面端安全和设备管理

可补：

```txt
每台设备独立后端 relay token
设备名称管理
退出并撤销本机 token
后台展示设备来源
敏感操作二次确认
如果改成桌面主进程直连 relay，再评估系统安全存储 relayApiKey
```

## 建议文件改动清单

`infinite-canvas/web`：

```txt
web/src/app/api/[...path]/route.ts
web/src/services/api/auth.ts
web/src/stores/use-user-store.ts
web/src/services/api/image.ts
web/src/services/api/audio.ts
web/src/services/api/video.ts
web/src/app/(user)/login/page.tsx
web/src/components/layout/client-root-init.tsx
web/src/components/layout/app-config-modal.tsx
```

其中：

1. `route.ts` 负责代理分流。
2. `auth.ts` 负责 `mange-backend` 登录、登出、自我信息、初始化 relay token。
3. `use-user-store.ts` 负责保存用户和 relayReady。
4. `image.ts`、`audio.ts`、`video.ts` 负责 remote 模式使用登录态调用用户态 AI 代理。
5. `login/page.tsx` 负责桌面端登录页和注册链接。
6. `client-root-init.tsx` 和 `app-config-modal.tsx` 需要检查是否仍保留旧的 URL 导入 API Key 逻辑，避免和桌面端自动 key 冲突。

`mange-backend`：

```txt
router/api-router.go
controller/canvas.go 或 controller/infinite_canvas.go
model/token.go
relay 代理相关 controller 或 service
```

其中：

1. `api-router.go` 注册 `/api/canvas/relay-token`。
2. `api-router.go` 注册 `/api/canvas/relay/*` 用户态 AI 代理。
3. 新 controller 负责 ensure relay token。
4. 如现有 model 缺少按用户和名称查 token 的方法，可在 `model/token.go` 增加小函数。

## 验收标准

1. 桌面端首次打开时显示登录页。
2. 点击“注册账号”能打开 `mange-backend` 的 `/register` 页面。
3. 用户在网页端注册完成后，能回桌面端用用户名密码登录。
4. 登录成功后，桌面端能保存用户信息。
5. 登录成功后，桌面端会自动调用 `/api/canvas/relay-token` 并保存 `relayReady`，接口不返回完整 `sk-...`。
6. 刷新或重启桌面端后，如果 session 仍有效，能继续进入应用。
7. session 失效后，桌面端回到登录页，并清空本地 `relayReady`。
8. 聊天请求从前端发到 `/api/v1/chat/completions`，Next 实际转发到 `mange-backend /api/canvas/relay/v1/chat/completions`。
9. 生图请求从前端发到 `/api/v1/images/generations`，Next 实际转发到 `mange-backend /api/canvas/relay/v1/images/generations`。
10. relay 请求头使用登录态和 `New-Api-User`，前端请求中不出现 `Authorization: Bearer sk-...`。
11. 退出登录后，桌面端清空用户信息和 `relayReady`。
12. `mange-backend` 后台能看到当前用户名下的 `Infinite Canvas Desktop` token。

## 不做事项

第一阶段不做：

```txt
不迁移 TwitCanva 的 Express /api/chat
不在桌面端复刻 mange-backend 注册页面
不把 infinite-canvas 自带 JWT 登录和 mange-backend 登录混用
不让用户手填 mange-backend API Key 作为默认流程
不把 dashboard access token 当 relay API Key
不把 relay API Key 写进普通文档或日志
```

## 和聊天窗口迁移的关系

聊天窗口迁移文档中提到：

```txt
/api/v1/* 和 mange-backend /v1/* 路径不匹配
remote 模式使用旧登录 token，不一定能通过 mange-backend TokenAuth()
```

本方案给出的正式解法是：

```txt
1. Next 代理继续保留前端 /api/* 软约定。
2. 代理层把 /api/v1/* 转发到 mange-backend /api/canvas/relay/v1/*。
3. 登录后自动确保 mange-backend 已为当前用户准备 relay API Key。
4. remote 模式 AI 请求统一使用登录态调用用户态 AI 代理，由后端内部代持并注入 relay API Key。
```

这样聊天窗口、画布助手、生图、图生图、音频和视频接口都可以共享同一套认证与 relay 接入逻辑。
