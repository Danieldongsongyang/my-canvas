# 桌面端消费模型但不管理渠道

桌面端不再维护自己的后端模型渠道配置，也不迁移当前项目旧的 `/api/settings`、`/api/admin/settings` 和渠道管理页面。远程模式通过 `mange-backend` 登录态调用用户态 AI relay，并从 `mange-backend` 用户接口读取可用模型；模型渠道添加、Key 管理和额度策略继续由 `mange-backend` 网页端负责。

**Consequences**

桌面端配置页只保留消费侧设置和本地直连模式。本地直连模式作为高级选项保留，用户自行填写 OpenAI 兼容 `baseUrl` 和 API Key，不影响默认远程模式的后端代持 relay key 方案。
