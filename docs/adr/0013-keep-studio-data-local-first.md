# Studio 第一阶段项目数据本地优先

迁移 LumenX Studio 时，第一阶段只把 Studio 短漫剧模块作为 `my-canvas/web` 内的本地优先工具入口，不让 `mange-backend` 拥有项目、剧本、分镜、角色、场景、道具或镜头状态等 Studio 业务数据。`mange-backend` 继续负责账号、额度、模型渠道和 AI relay；Studio 通过本地数据仓储边界保存项目数据，并只通过现有登录态、可用模型和用户态 relay 发起生成调用，必要时再补很薄的 relay 参数或任务查询适配。

**Considered Options**

- 直接把 Studio 项目、分镜和资产模型建进 `mange-backend`。
- 第一阶段通过 Studio 本地数据仓储边界保存项目数据，等 MVP 验证后再单独设计 Studio 云端业务后端。

**Consequences**

第一阶段迁移可以先跑通短漫剧流程和前端体验，不把 `mange-backend` 从账号、额度和 AI relay 后端扩张成内容生产业务后端。后续如果需要云同步、跨设备、团队协作、历史版本或成片资产托管，应另立 Studio 云端业务后端设计和 ADR。
