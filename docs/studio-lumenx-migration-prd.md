# Studio LumenX 迁移 PRD

## Problem Statement

当前前端已经具备无限画布、AI 生图、图生图、视频生成、提示词库和本地素材库等自由创作能力，但缺少一个围绕剧本、角色、场景、道具、分镜和连续镜头生产组织的项目制短漫剧生产入口。用户希望把 LumenX Studio 的结构化短漫剧流程迁入当前前端，同时避免把 LumenX Playground、LumenX 后端、供应商绑定、模型目录、存储路径和复杂历史兼容流程一并搬进来。

用户真正需要的是一个与画布并列的 Studio 短漫剧模块：它能从工具入口页进入，以 LumenX Studio 组件为基础做适配性移植，第一阶段用当前项目的登录态、模型配置、本地资产体系和用户态 AI relay 跑通 MVP。这个迁移必须保护当前项目已经定下的边界：`mange-backend` 继续负责账号、额度、模型渠道和 AI relay，不扩张为 Studio 业务后端；当前前端负责 Studio 本地项目数据和资产引用；localforage / IndexedDB 只能作为 Web MVP 阶段的存储实现细节，不能泄漏到组件和业务模型里。

## Solution

新增 Studio 短漫剧模块，作为工具入口页中“AI 漫剧生成流程”的实际落地入口。第一阶段复用工具入口页中已经预留的“AI 漫剧生成”入口，将它从即将开放状态变成可进入 Studio；新增 Studio 路由、项目列表、单项目 / Episode 01 工作台空壳，并逐步适配迁移 LumenX 当前 unified/R2V 主流程中的关键组件。

迁移策略采用“基于 LumenX 组件的适配性移植”：不从零重写 Studio UI，也不原样复制 LumenX 整套应用壳。Issue 1 只做当前项目外壳里的最小 Studio 壳，确保用户可进入、可创建、可打开；LumenX 的内部视觉原味从后续组件迁移阶段开始逐步带入。第一阶段不迁移 LumenX Playground，不优先迁旧 i2v legacy 流程，不运行 LumenX Python 后端，不把 LumenX model catalog 作为模型来源。

第一阶段 MVP 的核心交付是：建立 Studio 本地数据仓储边界、asset-first 媒体引用边界、Studio 生成适配层，并先跑通剧本解析真实 relay 闭环。用户输入剧本后，Studio 使用当前用户可用文本模型调用用户态 AI relay，返回结构化 JSON，校验角色、场景、道具和分镜草稿，写入 Studio 剧集，并允许用户手动编辑结果。图片和视频候选生成紧随其后，但不作为第一条真实链路。

## User Stories

1. As a 桌面端用户, I want to see “AI 漫剧生成” as a usable tool entry, so that I can start a short-drama workflow from the same place as the canvas.
2. As a 桌面端用户, I want to enter Studio from the existing tool hub, so that the product does not feel like a separate unrelated app.
3. As a 创作者, I want to create a short-drama project, so that I can organize script, cast, shots, and generated assets around one work.
4. As a 创作者, I want a newly created Studio project to contain a default Episode 01, so that I can begin with a simple single-episode workflow.
5. As a 创作者, I want the first Studio shell to be simple and reachable, so that I can start using it before every LumenX panel is migrated.
6. As a 创作者, I want Studio to preserve room for series and episodes, so that future multi-episode work does not require a data model rewrite.
7. As a 创作者, I want the first Studio UI to avoid complex LumenX panels, so that the MVP arrives quickly and safely.
8. As a 创作者, I want LumenX Studio’s proven workflow to guide the migration, so that the new Studio inherits useful short-drama production patterns.
9. As a 创作者, I want LumenX components to be adapted rather than redesigned from scratch, so that the migration keeps the original interaction detail.
10. As a 创作者, I want the Studio internal visual feel to remain close to LumenX over time, so that the workflow feels like a real production workbench.
11. As a 创作者, I want the first shell to use the current product’s calm outer style, so that route and data wiring can be verified before complex visual migration.
12. As a 创作者, I want Studio to prioritize the unified/R2V workflow, so that I start from LumenX’s current mainline rather than an older compatibility flow.
13. As a 创作者, I want to input a script and parse it with AI, so that Studio can extract characters, scenes, props, and initial shot drafts.
14. As a 创作者, I want AI parsing results to be editable, so that I can correct names, descriptions, and shot details when the model is imperfect.
15. As a 创作者, I want AI failure to not block the Studio workflow, so that I can manually create and edit Studio data when generation fails.
16. As a 创作者, I want Studio to use my current available text model for script parsing, so that model permissions and billing remain consistent with the rest of the app.
17. As a 创作者, I want Studio project model preferences to be saved locally, so that a long project remains consistent even if global defaults change.
18. As a 创作者, I want Studio model candidates to come from my current `mange-backend` available models, so that Studio does not expose unavailable or unbillable models.
19. As a 创作者, I want LumenX model catalog behavior to inform parameter panels, so that useful special parameters and grouping ideas can still be reused.
20. As a 创作者, I want generated, uploaded, or imported media to immediately become assets, so that I can find them later in the local asset library.
21. As a 创作者, I want Studio candidate media to be asset references, so that candidates remain connected to a shared media asset rather than hidden temporary files.
22. As a 创作者, I want Canvas node media to also be asset references, so that Canvas and Studio can reuse the same asset without duplicating files.
23. As a 创作者, I want unselected Studio candidates to remain available until I explicitly remove them, so that I can compare, revisit, and reselect old candidates.
24. As a 创作者, I want deleting a Studio candidate to only remove the Studio relationship, so that the underlying asset is not accidentally deleted.
25. As a 创作者, I want asset deletion to be protected when Studio or Canvas still references the asset, so that my project does not lose media unexpectedly.
26. As a 创作者, I want deletion protection to show where an asset is referenced, so that I can decide where to remove usage before deleting the asset.
27. As a 创作者, I want Studio data to be stored behind a local repository boundary, so that future Electron storage changes do not break the component model.
28. As an Electron desktop user, I want future Studio project data to be movable to local files, SQLite, or a manifest format, so that desktop storage can become robust without redesigning Studio.
29. As an Electron desktop user, I want asset media to migrate from Web IndexedDB to local files behind the same storage boundary, so that large media files fit desktop expectations.
30. As a developer, I want Studio components to never call localforage or IndexedDB directly, so that storage implementation changes stay isolated.
31. As a developer, I want Studio’s TypeScript model to have narrow core fields, so that the data model remains understandable and stable.
32. As a developer, I want explicit extension containers for metadata, generation details, and references, so that LumenX-specific fields can be accepted deliberately.
33. As a developer, I want LumenX’s full legacy fields to remain out of the first core model, so that the MVP does not inherit avoidable compatibility debt.
34. As a developer, I want a Studio generation adapter in TypeScript, so that LumenX prompt and schema behavior can run through the current user relay.
35. As a developer, I want not to run the LumenX Python backend in the first phase, so that deployment and runtime boundaries stay simple.
36. As a developer, I want not to add Studio business endpoints to `mange-backend`, so that `mange-backend` remains focused on auth, credits, model channels, and relay.
37. As a developer, I want tests at the highest useful seams, so that the migration can be verified by behavior rather than implementation details.
38. As a developer, I want the first implementation issue to avoid real generation, so that routing and project shell assumptions are validated first.
39. As a developer, I want the second implementation issue to establish types and repository boundaries, so that migrated components have stable interfaces.
40. As a developer, I want the third implementation issue to establish asset-first references, so that media lifecycle decisions are settled before generation UI arrives.
41. As a developer, I want the fourth implementation issue to run script parsing through real relay, so that the AI boundary is verified before image/video complexity.
42. As a developer, I want the fifth implementation issue to migrate LumenX components one by one, so that each component can be adapted to local state and services safely.
43. As a future maintainer, I want the PRD to record MVP exclusions, so that deferred video queues, batch retry, export, and multi-episode features are not forgotten.
44. As a future maintainer, I want ADRs to record boundary decisions, so that later implementation does not accidentally turn `mange-backend` into a Studio business backend.
45. As a future maintainer, I want the tool hub entry to become Studio’s public entry, so that users do not have to learn a second navigation model.

## Implementation Decisions

- Studio becomes a new first-class tool alongside Canvas, entered from the existing tool hub via the previously reserved AI comic workflow entry.
- Issue 1 is intentionally small: users can enter Studio, create a short-drama project, open the default Episode 01, and see a shell ready for later modules. It does not migrate LumenX panels, real generation, complex motion, or LumenX app shell visuals.
- The Studio first phase is local-first. `mange-backend` continues to own authentication, credits, model channels, available models, and AI relay. It does not own Studio projects, scripts, shots, characters, scenes, props, or candidate state.
- Studio data uses a local repository boundary. Web MVP may use existing local browser storage infrastructure, but components and business models must only speak to the repository boundary.
- The repository boundary must be designed so a future Electron desktop implementation can switch to local files, SQLite, or a project manifest without rewriting Studio components.
- Studio media does not get its own storage system. Generated, imported, or uploaded media first becomes an asset; Studio and Canvas store references to that asset.
- Current Web asset media may continue to use the existing image and file media storage boundaries; future Electron media may move behind the same boundary to local files.
- The local asset library is an asset store, not a curated-only library. Generated media enters as an asset immediately; curation, favorites, tags, archive, and featured states are organization actions after asset creation.
- Studio candidate media is an asset reference relationship. Unselected candidates are retained until explicit removal from the Studio project, shot, character, scene, or prop.
- Canvas node media is also an asset reference relationship. Canvas owns node position, size, links, and canvas context, not a separate media file copy.
- Deleting an asset defaults to protection-first behavior. If Studio or Canvas still references the asset, deletion is blocked and the reference locations are shown. Dangerous force-delete is not part of the MVP.
- Studio reserves a series/episode model from the first phase. The first UI presents a simple single-project, single-Episode 01 workflow, while the data model leaves room for multi-episode and shared assets.
- The first Studio type model uses narrow core fields plus explicit extension containers such as metadata, generation details, and references. It must not be a broad untyped blob, and it must not import LumenX’s full field set wholesale.
- LumenX unified/R2V workflow is the main migration target. The older i2v legacy flow is not the MVP path; its components and fields are reference material or later compatibility work.
- LumenX Studio UI is adapted, not rewritten from scratch and not copied as a full app shell. The migration preserves useful layout, interaction, state organization, and visual feel, while replacing APIs, storage, model sourcing, routing, theme boundaries, and local state integration.
- LumenX Playground is not migrated as a standalone module. Its local interaction ideas may inform model selection, parameter panels, queues, galleries, or asset pickers later.
- LumenX Python backend is not a runtime dependency. Prompt templates, JSON schema, result cleaning, and field mapping are ported into a TypeScript Studio generation adapter.
- Studio generation uses the current user relay. The first real AI chain is script parsing using the current text model; image and video candidate generation follow after this chain is stable.
- The first script parsing chain is: user inputs script, Studio generation adapter calls chat completion, structured JSON returns, result is cleaned and validated, characters/scenes/props/shot drafts are written into the episode, and the user can edit them.
- Studio model candidates come from the current app model configuration and the user’s available models under `mange-backend`. LumenX model catalog is not a model source.
- Studio projects may store local model preferences for text, image, and video generation so project generation remains stable over time.
- LumenX model catalog may inform parameter grouping, special parameter support, and interaction design, but it must not bring original supplier binding into runtime.
- The first implementation sequence is:
  - Issue 1: Tool entry and empty Studio shell.
  - Issue 2: Studio types and local repository boundary.
  - Issue 3: Asset-first reference boundary.
  - Issue 4: Studio generation adapter with script parsing real relay loop.
  - Issue 5: Adapt LumenX Studio components.
- Issue 5 migrates components incrementally: ScriptProcessor first, then ArtDirection, then Cast, then a lightweight StoryboardR2V.
- Complex LumenX series screens, episode list, cross-episode reconcile, complete video queues, batch retry, assembly, export, and full old-field compatibility are deferred.

## Testing Decisions

- Tests should verify user-observable behavior and module contracts, not internal storage engine details. A passing test should remain valid if Web storage changes from IndexedDB-backed implementation to a future Electron file-backed implementation.
- The highest seam for Issue 1 is the tool hub and Studio route behavior: the AI comic entry becomes usable, opens Studio, allows project creation, and opens the default Episode 01 shell.
- The highest seam for Issue 2 is the Studio repository contract: create, read, update, delete, and hydrate Studio series/episode data through the boundary without exposing the concrete storage engine to callers.
- The highest seam for Issue 3 is the asset reference contract: creating generated/imported media yields an asset; Studio and Canvas references point to the same asset; deleting a referenced asset is blocked and reports references.
- The highest seam for Issue 4 is the Studio generation adapter contract: given a script and a mocked relay response, parsing returns validated structured data and writes it to the episode; malformed model output produces a recoverable error and leaves manual editing possible.
- The highest seam for Issue 5 is component integration behavior: migrated LumenX components read and update current Studio data through the new boundaries, without relying on the original LumenX project store, API client, model catalog, or media path assumptions.
- Existing project testing patterns to follow include service-level tests for API adapters, store/repository behavior tests for local state boundaries, and route/component tests where current project code already validates user-facing flows.
- Tests should include asset deletion protection cases: no references permits deletion; Studio references block deletion; Canvas references block deletion; multiple references are reported.
- Tests should include candidate retention behavior: unselected Studio candidate references persist until explicit removal and are not treated as temporary cache.
- Tests should include model-source behavior: Studio candidate lists derive from current available models, and LumenX model catalog data does not introduce unavailable runtime model options.
- Tests should include storage-boundary behavior: Studio components interact with repository APIs rather than importing or observing the underlying storage implementation.
- Tests should include AI failure behavior: script parsing failure does not erase user input or block manual editing.

## Out of Scope

- Migrating LumenX Playground as a standalone page.
- Running or depending on the LumenX Python backend.
- Adding Studio project, script, storyboard, or asset business endpoints to `mange-backend`.
- Turning `mange-backend` into a Studio business backend.
- Migrating LumenX model catalog as a runtime model source.
- Migrating LumenX supplier bindings, storage paths, OSS logic, or output directory assumptions.
- Complete video task queue, batch generation, retry management, task history, and task dashboard in the MVP.
- Complete video assembly, final export, timeline editing, TTS, BGM, subtitles, and final mix in the MVP.
- Complete LumenX SeriesDetailPage, EpisodeMiniList, cross-episode reconcile, and multi-episode management in the MVP.
- Full old i2v legacy workflow migration as the first path.
- Force-deleting referenced assets in the first phase.
- Rebuilding Studio UI from scratch.
- Copying LumenX full app shell, global sidebar, theme system, or route structure wholesale.
- Letting Studio components directly depend on localforage, IndexedDB, local file paths, SQLite, or manifest implementation details.
- Cloud sync, team collaboration, cross-device Studio data, history/versioning, and cloud asset hosting in the first phase.

## Further Notes

- This PRD follows the current project glossary and the Studio migration ADRs created during planning.
- The issue implementation plan is already recorded separately as “Studio MVP 第一批实现切片”.
- MVP-after work is already recorded separately as “Studio MVP 后待办”, including video queues, batch retry, assembly/export, LumenX field migration evaluation, multi-episode enhancements, and Electron storage migration.
- The existing dirty worktree includes an unrelated `next-env` file change that this PRD does not depend on.
- The GitHub issue publication step was intentionally skipped at the user’s request; this PRD is the local artifact for later issue creation or slicing.
