# React 只请求同源 API

React 业务代码只请求同源 `/api/*`，不在组件、hooks 或 service 中分散拼接 `mange-backend` 的完整地址。真实 `mange-backend` API 地址和网页端地址由同源请求适配层读取环境变量管理，后续 Electron 桌面壳可以再提供受控的服务地址配置。

**Consequences**

本地开发默认可以指向 `http://localhost:3000`，未来切换到公网 `mange-backend` 时只改适配层或桌面配置。注册、账号中心、模型渠道管理等网页端跳转使用统一的 `mange-backend` 网页端地址，不进入 React 业务组件的散落配置。
