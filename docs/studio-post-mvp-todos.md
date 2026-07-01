# Studio MVP 后待办

本文记录 Studio 最小生成闭环跑通之后继续完善的事项。第一阶段 MVP 不要求一次性完成这些能力，但迁移设计和代码边界应避免把它们做死。

## 视频任务队列

- 为单镜头和多镜头生成建立统一任务列表视图。
- 展示等待中、生成中、成功、失败、已取消等状态。
- 支持任务详情、错误原因、输入参数、输出候选和关联分镜定位。
- 支持任务结果进入本地素材库，并回填到对应镜头候选引用。
- 评估是否复用 LumenX `TaskQueuePanel`、`TaskQueueButton`、`VideoQueue` 的交互局部。

## 批量生成与重试

- 支持多镜头批量生成。
- 支持单任务重试、失败任务批量重试和保留原参数重试。
- 支持跳过已成功镜头，只补跑失败或缺失结果。
- 支持批量生成过程中的并发上限、暂停、取消和继续。
- 记录重试历史，避免覆盖用户已经选中的候选结果。

## 视频组装与导出

- 迁移或适配 LumenX `VideoAssembly` 作为后续组装入口。
- 支持镜头排序、时长调整、预览和基础时间线。
- 支持配音、背景音乐、音量混合和字幕等后续能力。
- 支持导出成片，并记录导出任务状态、文件位置和失败原因。
- 明确导出阶段是否只做本地浏览器侧组合，还是需要后续 Studio 云端业务后端参与。

## Canvas 与素材库增强

- 支持 Studio 镜头发送到 Canvas 继续自由编辑。
- 支持 Canvas 结果回填到 Studio 镜头、角色、场景或道具。
- 支持 Studio 角色、场景、道具和镜头结果批量整理、收藏、打标签或归档。
- 统一 asset 引用格式，避免 Studio 和 Canvas 各自维护不可互通的媒体引用。
- 增强 asset 删除前的引用位置展示，必要时再设计带影响预览的危险强删。

## 系列与剧集增强

- 完整迁移或适配 LumenX `SeriesDetailPage` 的系列详情体验。
- 迁移或适配 `EpisodeMiniList`，支持同一系列下多集切换。
- 支持新增、复制、删除、重排剧集。
- 支持跨集共享角色、场景、道具和画风。
- 支持本集覆盖共享资产，并明确覆盖与共享资产之间的关系。
- 支持跨集资产 Reconcile 流程，处理新剧本解析出的实体和系列共享资产之间的合并、复用、冲突。
- 支持“上一集回顾”或跨集上下文摘要，作为后续剧本解析和分镜生成参考。
- 支持按系列查看任务、资产、导出结果和生成历史。

## LumenX 字段迁移评估

- 评估 LumenX `image_asset`、`rendered_image_asset`、`reference_sheet`、`full_body_asset`、`three_view_asset`、`headshot_asset` 等完整 asset 容器是否需要映射到当前 asset 引用模型。
- 评估 LumenX `workbench_*` 字段，例如 `workbench_generate_count`、展开状态、抽卡历史、活动 tab、候选批次等，哪些需要进入 `generation` 或 `metadata` 扩展容器。
- 评估旧 i2v legacy 字段是否仅作为兼容导入数据保留，还是需要进入当前 Studio 主模型。
- 评估 LumenX 任务字段，例如 `video_tasks`、`generation_mode`、`reference_video_urls`、轮询状态、错误信息等，和后续任务队列模型的关系。
- 评估 LumenX `series_id`、`episode_number`、`source`、`shared asset`、`Reconcile` 相关字段如何映射到 `StudioSeries` / `StudioEpisode`。
- 评估 LumenX prompt config、model settings、art direction 的项目级字段，哪些作为 Studio 本地模型偏好和生成配置保留。
- 每个字段只有在明确服务当前产品流程、组件迁移或数据导入兼容时才进入核心模型；否则放入明确扩展容器或保持不迁移。

## 云端能力评估

- 在 MVP 后评估是否需要 Studio 云端业务后端。
- 如果需要云同步、跨设备、团队协作、历史版本或成片资产托管，应另立设计文档和 ADR。
- 不应把这些能力悄悄塞进 `mange-backend` 的账号、额度和 relay 边界。

## Electron 本地存储迁移

- 在 Studio 本地数据仓储边界下评估本地文件、SQLite 或项目 manifest 的落盘方案。
- 在 asset 媒体存储边界下评估从 Web IndexedDB 迁移到 Electron 本地文件系统。
- 保证 Studio 组件、Canvas 组件和业务模型不直接依赖 localforage、IndexedDB、文件路径或 SQLite 细节。
- 设计 Web MVP 数据迁移到 Electron 本地项目目录的导入、备份和恢复路径。
