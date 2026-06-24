# 用户状态保存摘要而不是 token

桌面端用户 store 不再用 `token` 字段表示用户 ID，也不保存任何 relay API Key 或 dashboard access token。本地只保存非敏感用户摘要、`relayReady`、初始化状态和加载状态；真实登录态由 `mange-backend` session cookie 承载。

**Consequences**

启动恢复时，如果本地存在用户摘要，桌面端用 `user.id` 发送 `New-Api-User` 并调用 `/api/user/self` 校验 cookie；校验失败则清空本地用户和 `relayReady`。代码中应避免继续把用户 ID、登录态和模型调用凭据混称为 `token`。
