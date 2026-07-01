# Studio MVP 第一批实现切片

本文记录 Studio 第一阶段 MVP 的第一批实现顺序。它是实施计划，不是架构 ADR；若后续代码发现更小的可交付切片，可以在不改变已定架构边界的前提下调整。

## Issue 1：接入口和空 Studio 壳

目标是让用户能从现有工具入口页进入 Studio，但不急着迁移复杂组件。

- 复用工具入口页中已经预留的“AI 漫剧生成”入口，将其从 `soon` 状态改为可进入 Studio。
- 新增或接通 `/studio` 路由。
- 新增 Studio 项目列表空态。
- 新增单项目 / Episode 01 工作台空壳。
- Issue 1 只使用当前项目外壳中的安静工具页风格，保证可进入、可创建、可打开。
- 不接真实生成，不迁移复杂 LumenX 组件。
- 不复刻 LumenX `CreativeCanvas` 背景、完整 `PipelineSidebar`、`EpisodeMiniList`、`SeriesDetailPage`、`StoryboardR2V` 面板、复杂动效或主题系统。

验收线：用户从工具入口页能进入 Studio，创建一个短漫剧项目，打开默认 Episode 01，并看到可承载后续模块的项目列表和工作台壳。

## Issue 2：Studio 类型和仓储边界

目标是先建立当前项目自己的数据插座，不让组件依赖具体存储引擎。

- 定义 `StudioSeries`、`StudioEpisode`、`StudioShot`、`StudioAssetRef` 等核心类型。
- 第一版类型采用窄核心字段，不照搬 LumenX 全量字段，也不使用一个大 `any` 糊住模型。
- 允许保留明确的扩展容器，例如 `metadata`、`generation`、`refs`，用于后续承接组件移植中确认需要保留的字段。
- 建立 `web/src/services/studio-local.ts` 作为 Studio 本地数据仓储边界。
- Web MVP 实现可以复用当前本地能力，但接口不得泄漏 localforage、IndexedDB、本地文件、SQLite 或 manifest 细节。
- 创建项目时默认生成一个 `StudioSeries` 和 Episode 01。

验收线：Studio 可以创建、读取、更新、删除本地项目数据；组件只依赖仓储接口；核心类型有稳定引用点，可支撑 asset 删除保护、Canvas 回填、跨集共享和后续任务队列。

## Issue 3：asset-first 引用边界

目标是先固定媒体资产所有权，避免 Studio、Canvas 和素材库各自拥有媒体文件。

- 生成、导入、上传成功后先创建 asset。
- Studio 候选媒体只保存 asset 引用关系。
- Canvas 节点媒体只保存 asset 引用关系。
- asset 删除前检查 Studio 和 Canvas 引用。
- 第一阶段默认阻止硬删仍被引用的 asset。

验收线：任一成功生成或导入的媒体都能成为 asset；Studio 和 Canvas 使用同一个 asset 引用模型。

## Issue 4：Studio 生成适配层最小闭环

目标是用现有用户态 relay 跑通一个真实生成链路，而不是只做静态 UI。

- 建立 `web/src/services/api/studio-generation.ts`。
- 将 LumenX 的 prompt、schema、JSON 清洗和字段映射思路移植为 TypeScript 适配层。
- 第一批先跑通剧本解析真实 relay 闭环，不先跑图片或视频生成。
- 第一条链路为：用户输入剧本 -> `studio-generation.parseScript()` -> 调用当前 `textModel` 的 chat completion -> 返回结构化 JSON -> 校验 characters / scenes / props / shotDrafts -> 写入 `StudioEpisode` -> 用户可手动编辑结果。
- 底层复用当前 `ai-request`、`image`、`video` 服务和用户态 relay。
- 图片和视频候选生成紧随其后，但不作为第一条真实链路，避免同时牵涉 asset 创建、媒体存储、引用关系、模型参数、任务状态和失败恢复。
- AI 失败时允许用户手动编辑本地项目数据。

验收线：Studio 能通过当前登录态和可用文本模型调用真实 relay 完成剧本解析，并把校验后的结构化结果写回本地项目数据。

## Issue 5：适配性移植 LumenX Studio 组件

目标是在已建立的边界上逐个迁移组件，而不是大面积复制后再补救。

- 先迁移 `ScriptProcessor`。
- 再迁移 `ArtDirection`。
- 再迁移 `Cast`。
- 最后迁移 `StoryboardR2V` 轻量版。
- 从 Issue 5 开始带入 LumenX Studio 的内部视觉原味；在此之前，Issue 1 的空壳不承担复刻 LumenX 工作台视觉的任务。
- 先处理 API、状态、模型、媒体引用和主题冲突，再逐步恢复 LumenX 组件的视觉细节。

验收线：LumenX Studio 组件能逐步接入当前 Studio 数据、生成适配层和 asset 引用边界。

## 非目标

- 第一批不迁移完整视频任务队列。
- 第一批不做批量重试、视频组装和导出。
- 第一批不完整迁移 `SeriesDetailPage`、`EpisodeMiniList` 和跨集 Reconcile。
- 第一批不新增 Studio 业务后端。
- 第一批不让组件直接依赖 localforage、IndexedDB、本地文件、SQLite 或 manifest。
