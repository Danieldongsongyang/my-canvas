# 保留同源请求适配层

在把当前项目改造成桌面客户端前端时，我们删除当前前端自身拥有业务数据和规则的业务后端，但保留极薄的同源请求适配层。这个适配层只负责统一 `/api/*` 请求入口、转发 cookie 登录态与 `New-Api-User`、屏蔽 `mange-backend` 地址差异和支持流式 AI 响应；真实账号、额度、relay API Key 和模型请求规则都归 `mange-backend` 所有。

**Considered Options**

- 删除所有 Next route handler，让浏览器直接跨域请求 `mange-backend`。
- 保留同源请求适配层，把它明确限定为无业务数据、无业务规则的边界层。

**Consequences**

保留适配层意味着当前前端仍需要一个能承载 route handler 的运行形态，不能被误解为完全静态 HTML。这个取舍换来更稳定的桌面端请求边界，避免把 CORS、cookie、后端地址、流式响应和敏感 relay key 处理散落到 React 组件里。
