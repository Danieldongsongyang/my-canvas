# 桌面端接入 mange-backend 暂缓待办

本文档记录当前已经识别、但第一阶段可以先不处理的问题。它们不阻塞当前桌面端与 `mange-backend` 的基础联调闭环，但后续进入正式发布、真实用户登录或额度治理前需要重新确认。

## 暂缓原则

1. 当前优先跑通用户名密码登录、同源代理、relay token 初始化和 `/api/canvas/relay/*` AI 请求链路。
2. 以下事项先不作为第一阶段阻塞项。
3. 如果对应能力在部署环境中已经开启，必须重新评估是否提前处理。

## 待办项

### 1. 处理 2FA 登录返回结构

当前状态：暂缓。

后端 2FA 登录第一步会返回：

```json
{
    "success": true,
    "data": {
        "require_2fa": true
    }
}
```

当前前端如果没有单独判断 `data.require_2fa`，可能会把该响应误当成普通用户对象，后续再用异常用户信息初始化 relay。这个是实际 bug，不是文档问题。

后续处理建议：

1. `web/src/services/api/auth.ts` 的 `login()` 显式识别 `require_2fa: true`。
2. 第一阶段如果仍不支持桌面端 2FA，则直接提示“当前账号开启了二次验证，桌面端暂不支持”。
3. 增加对应测试，避免再次把 2FA 继续验证响应当成登录成功用户。

### 2. 决定 Turnstile 第一阶段策略

当前状态：暂缓。

`mange-backend` 登录路由实际经过 `TurnstileCheck()`。如果部署环境开启了 Turnstile，桌面端登录必须传 `turnstile` query；如果第一阶段不做验证码，则要明确要求后端关闭 Turnstile，或为桌面端提供可信登录策略。

后续处理建议：

1. 明确第一阶段部署环境是否开启 `TurnstileCheckEnabled`。
2. 如果不开启，在部署说明中写明桌面端第一阶段要求关闭 Turnstile。
3. 如果开启，前端登录请求需要支持 `turnstile` 参数，并在登录页补对应验证流程。

### 3. 确认默认后端地址

当前状态：暂缓。

当前 Next 代理 fallback 是：

```txt
http://localhost:3000
```

如果 `mange-backend` 不是这个端口，最好不要依赖默认值，而是直接配置：

```txt
MANGE_BACKEND_API_URL
```

或：

```txt
API_BASE_URL
```

后续处理建议：

1. 确认本地开发、桌面打包和生产部署各自的后端地址。
2. 如果没有可靠默认值，考虑让缺少配置时直接报清晰错误。
3. 如果存在固定本地默认端口，将代理 fallback 改成真实默认端口。

### 4. 确认 relay token 额度策略

当前状态：暂缓。

现在后端自动创建的 `Infinite Canvas Desktop` token 是：

```txt
UnlimitedQuota: true
```

如果用户级、渠道级或订阅级仍能控额，这个策略可以接受；如果它会绕过预期的额度体系，就需要改后端创建策略。

后续处理建议：

1. 确认 `UnlimitedQuota: true` 是否仍受用户额度、分组、订阅或渠道策略约束。
2. 如果会绕过额度治理，改为创建有限额度 token，或让 token 额度继承用户套餐策略。
3. 在 `mange-backend` 后台明确标识该 token 来源于桌面端自动创建。
