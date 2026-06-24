# 移除 settings API 依赖

桌面端不再依赖当前项目旧的 `/api/settings` 或 `/api/admin/settings` 作为启动和模型配置来源。远程模式使用前端本地默认配置启动，登录后从 `mange-backend /api/user/models` 获取当前用户可用模型；本地直连模式的 `baseUrl` 和 API Key 继续由用户本地保存。

**Consequences**

应用启动不再被旧 settings 后端阻塞。远程模式默认不需要前端 API Key，AI 请求依赖 `mange-backend` 登录态、`New-Api-User` 和用户态 relay；如果用户模型列表获取失败，生成时提示用户确认后端模型渠道配置。
