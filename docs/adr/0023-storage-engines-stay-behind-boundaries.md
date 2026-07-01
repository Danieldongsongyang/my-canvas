# 本地存储引擎必须藏在仓储边界后

Studio 第一阶段仍然使用当前 Web 项目的本地能力快速跑通 MVP，但文档和代码结构不得把 localforage 或 IndexedDB 当成产品架构。`web/src/services/studio-local.ts` 是 Studio 本地数据仓储边界：Web 阶段实现可以复用 localforage / IndexedDB；未来 Electron 桌面端可以在该边界下切换到本地文件、SQLite 或项目 manifest；Studio 组件不得直接依赖具体存储引擎。

媒体层同样不为 Studio 新增独立媒体存储体系。生成、导入或上传成功后先创建 asset；当前 Web 阶段 asset 媒体由现有 `image-storage` / `file-storage` 存入 IndexedDB；未来 Electron 阶段 asset 媒体由同一存储边界迁移到本地文件系统。

**Consequences**

第一阶段实现可以继续借用现有 localforage / IndexedDB 基础设施，但所有调用应通过 Studio 本地数据仓储边界、asset 仓储和媒体存储边界完成。这样 MVP 能尽快跑通，同时不会把未来 Electron 文件落盘、SQLite 或 manifest 迁移卡死在组件和业务模型里。
