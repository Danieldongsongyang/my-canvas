# LumenX 生成逻辑移植为前端 TypeScript 适配层

迁移 LumenX Studio 的剧本解析和 prompt 生成能力时，第一阶段不运行或依赖 LumenX Python 后端，也不在 `mange-backend` 新增 Studio 剧本解析业务接口。LumenX 的 Python `ScriptProcessor`、prompt 模板、JSON schema、结果清洗和字段映射作为实现参考，移植到 `my-canvas/web` 的 TypeScript Studio 生成适配层，并通过现有用户态 AI relay 发起 chat、图像和视频生成调用。

**Considered Options**

- 让 `my-canvas` 直接调用 LumenX FastAPI/Python 后端。
- 在 `mange-backend` 新增 `/studio/*` 业务接口承接剧本解析和 prompt 生成。
- 把 LumenX 生成逻辑移植成当前前端的 TypeScript 适配层，底层复用现有 relay。

**Consequences**

这个选择保留 LumenX Studio 的智能流程，但不把原项目后端、原 API、原存储逻辑和供应商绑定一起搬进来。第一阶段的关键文件应围绕 `web/src/services/studio-local.ts` 和 `web/src/services/api/studio-generation.ts` 展开，其中 `studio-local.ts` 是仓储边界而不是具体存储引擎承诺；结构化 JSON 结果需要显式校验，AI 解析失败时仍允许用户手动编辑 Studio 本地项目数据。
