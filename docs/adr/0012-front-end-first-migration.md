# 第一阶段前端优先改造

第一阶段优先改造当前 `my-canvas/web`，让它只依赖已经确认的 `mange-backend` 登录、用户信息、模型列表、relay 初始化和用户态 AI relay 接口。`mange-backend` 网页端和已有后端能力保持稳定，只在发现 CORS、session、接口响应或错误文案等必要缺口时做小补丁。

**Consequences**

实施顺序先清理当前前端旧 admin、settings、prompts、assets 和 WebDAV proxy 依赖，再收紧同源请求适配层、重构用户状态，并确认登录后进入工具入口页。后端不作为第一阶段大规模改造对象，避免同时移动两个系统的边界。
