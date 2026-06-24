# 同源请求适配层只服务登录和 relay

同源请求适配层第一阶段只服务 `mange-backend` 用户登录、用户信息、relay 初始化和用户态 AI relay，不继续承载当前项目旧的业务接口代理。`/api/admin/*`、`/api/prompts`、`/api/assets`、`/api/settings` 不属于保留范围，应分别删除、改成本地能力或由工具入口链接到 `mange-backend` 网页端。

**Consequences**

这个适配层不是万能后端代理，也不是当前项目旧业务后端的兼容层。它的价值在于集中处理同源请求、cookie、`New-Api-User`、后端地址和流式响应，而不是继续隐藏旧后台协议。
