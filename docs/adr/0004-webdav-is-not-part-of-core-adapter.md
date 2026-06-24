# WebDAV 不属于核心同源适配层

WebDAV 同步第一阶段不作为桌面端改造主线，也不放进保留的 `mange-backend` 同源请求适配层。当前 Next `webdav-proxy` 可以被弱化、禁用或移除；如果后续桌面端仍需要绕过浏览器 CORS 或处理认证头，优先通过 Electron 主进程 IPC 提供受控能力。

**Consequences**

登录、用户态 AI relay、画布主流程不被 WebDAV 迁移阻塞。WebDAV 若保留浏览器直连模式，需要接受外部服务 CORS 限制；若要稳定支持，则在桌面壳阶段单独设计。
