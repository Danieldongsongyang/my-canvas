# Infinite Canvas 前端迁移分析总结

## 1. 背景

- LumenX：/Users/a1/Desktop/无限画布项目汇总/lumenx
  自己的项目 `infinite-canvas` 已经具备无限画布、AI 生图、图生图、视频生成、提示词库、素材管理等能力，因此它更适合作为主前端壳，而不是被其他项目替代。

---

## 2. 总体结论

最适合迁移的是 **LumenX 的 Studio 模块**。

不建议迁移 LumenX 的 Playground 模块，因为它和自己的无限画布功能高度重叠。

更合理的方向是：

```text
infinite-canvas 作为主应用
├── 无限画布模块
│   ├── 自由创作
│   ├── AI 生图
│   ├── 图生图
│   ├── 视频生成
│   ├── 节点编排
│   └── 资产保存与复用
│
└── Studio 短漫剧模块
    ├── 剧本解析
    ├── 角色管理
    ├── 场景管理
    ├── 道具管理
    ├── 分镜表
    ├── 镜头图生成
    ├── 镜头视频生成
    ├── 配音
    ├── 时间线
    └── 导出
```

一句话总结：

> 保留自己的无限画布作为自由创作入口，把 LumenX Studio 改造成项目制短漫剧生产入口；不要迁移 Playground，否则会和自己的核心能力打架。

---

## 4. 为什么 LumenX Studio 最适合？

LumenX Studio 的核心流程是：

```text
剧本 → 分镜 → 角色/场景/道具资产 → 镜头图 → 镜头视频 → 配音 → 时间线 → 导出
```

这正好补足自己的 `infinite-canvas` 目前相对缺少的部分：**结构化、项目制、长流程的短漫剧生产能力**。

自己的无限画布更偏向：

```text
自由创作 → 节点编排 → 图片/视频生成 → 资产保存与复用
```

LumenX Studio 更偏向：

```text
剧本驱动 → 分镜管理 → 资产一致性 → 视频生产 → 成片导出
```

所以二者不是重复关系，而是互补关系。

---

## 5. 为什么不建议迁移 LumenX Playground？

LumenX Playground 的定位是一个独立的图像/视频生成工作台，通常包括：

- Prompt 输入；
- 模型选择；
- 参数配置；
- 文生图；
- 图生图；
- 文生视频；
- 图生视频；
- 任务队列；
- 结果画廊；
- Prompt 历史；
- 素材选择。

但这些能力和自己的无限画布高度重叠。

自己的无限画布已经承担了“自由生成工作台”的角色，而且比传统 Playground 更灵活，因为它支持节点、画布、素材联动和多轮视觉迭代。

如果再迁移一个完整 Playground，会造成：

1. **功能重复**：两个地方都能生图、生成视频、调参数；
2. **用户困惑**：不知道应该在 Canvas 里生成，还是去 Playground 生成；
3. **代码冗余**：模型选择、参数面板、任务状态、结果展示会重复实现；
4. **产品边界混乱**：Canvas 和 Playground 都在做自由创作，定位冲突。

因此，Playground 不应作为独立模块迁移。

---

## 7. LumenX Studio 中最值得迁移的模块

LumenX 当前 Studio 同时存在旧 i2v legacy 流程和新版 unified/R2V 流程。第一阶段优先迁移新版 unified/R2V 流程，旧流程组件只作为局部复用或兼容参考。

建议按当前迁移优先级迁移：

| 优先级 | 模块                                          | 价值                                                                    |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------- |
| P0     | Studio 项目壳                                 | 项目列表、项目详情、步骤导航和本地数据仓储边界，是承载迁移组件的入口    |
| P0     | ScriptProcessor                               | 剧本输入和实体提取，是短漫剧流程入口                                    |
| P0     | ArtDirection                                  | 统一画风和视觉风格，影响后续角色、分镜和视频生成                        |
| P0     | Cast                                          | 新版统一流程中的角色、场景、道具管理入口，优先于旧 ConsistencyVault     |
| P0     | StoryboardR2V                                 | 新版统一流程的分镜和镜头生成工作台，是 Studio 核心                      |
| P0     | 基础 relay 生成适配                           | 让 Studio 能通过当前登录态、模型列表和用户态 AI relay 发起生成          |
| P1     | VideoAssembly                                 | 视频组装、混音和导出预览，形成短漫剧闭环                                |
| P1     | 任务队列面板                                  | 多镜头生成、状态追踪、失败重试和结果回填                                |
| P1     | Studio 与本地素材库互通                       | 将角色、场景、道具和镜头结果记录为 asset，并建立 Studio 候选引用        |
| P1     | Studio 与 Canvas 互通                         | 通过 asset 引用支持发送到 Canvas 自由编辑，并从 Canvas 回填 Studio 关系 |
| P2     | 旧 ConsistencyVault                           | 作为一致性资产库的局部参考，不作为第一阶段主流程                        |
| P2     | 旧 StoryboardComposer / StoryboardFrameEditor | 作为旧分镜编辑交互参考，不作为第一阶段主流程                            |
| P2     | 旧 VideoGenerator / VideoQueue                | 作为旧视频生成和队列交互参考，不作为第一阶段主流程                      |
| P2     | 配音、时间线和最终导出                        | 视产品范围决定，可在主流程稳定后补齐                                    |

---

## 8. 推荐的产品架构

最终项目可以拆成四个主要区域：

```text
/app
├── /canvas
│   └── 无限画布，自由创作入口
│
├── /studio
│   └── 短漫剧 Studio，结构化生产入口
│
├── /assets
│   └── 统一资产库
│
└── /settings
    └── 模型、供应商、账号、存储配置
```

其中：

- `/canvas` 负责自由创作；
- `/studio` 负责短漫剧项目流程；
- `/assets` 负责统一资产保存、检索、整理和复用；
- `/settings` 负责模型和系统配置。

Studio 的底层数据模型第一阶段就预留“系列 / 剧集”边界：

```text
StudioSeries
  作品级信息：标题、简介、共享画风、共享角色、共享场景、共享道具、模型偏好

StudioEpisode
  单集信息：剧本、分镜、镜头候选、镜头视频、当前流程状态
```

第一阶段 UI 先保持最小可用形态：用户看到的是“创建一个短漫剧项目”，系统默认生成一个系列和 Episode 01。完整剧集管理、跨集资产复用面板和 LumenX 复杂系列页迁移放到 MVP 后继续完善。

---

## 9. Canvas 和 Studio 的关系

Canvas 和 Studio 不应该互相替代，而应该互相协作。

第一阶段先明确媒体边界：

```text
本地素材库 / asset
  保存所有成功生成、导入或上传的媒体资产

Studio 候选媒体
  是 asset 在 Studio 项目、镜头、角色、场景或道具中的候选引用

Canvas 节点媒体
  是 asset 在画布节点中的引用
```

也就是说，Studio 或 Canvas 成功生成出的图片、视频应进入本地素材库成为 asset；选中、不选中、收藏、归档、打标签只是 asset 的不同使用关系或整理状态。Studio 和 Canvas 不直接共享对方的过程数据，而是都通过 asset 引用同一份媒体资产。

Studio 候选媒体不是临时缓存。即使某张候选图没有被选为当前镜头结果，只要它仍然记录在 Studio 项目、镜头、角色、场景或道具中，就必须保留候选引用，方便用户后续回看、比较和重新选择。删除候选引用只解除 Studio 关系，不等于删除本地素材库中的 asset。

在这个模型下，原先“Studio 候选媒体不在素材库，可能被本地媒体清理误删”的问题不再成立。实现重点变成：生成链路必须先创建 asset，再写入 Studio 或 Canvas 的引用关系；删除 asset 时必须检查 Studio 和 Canvas 引用，避免破坏仍在使用的候选或节点。

asset 删除策略采用保护优先：

```text
删除 asset
        ↓
检查 Studio 引用和 Canvas 引用
        ↓
如果存在引用，阻止删除并展示引用位置
        ↓
用户先解除引用
        ↓
无引用后才允许删除 asset
```

第一阶段不做级联清空引用，也不提供默认强制删除；危险强删需要影响预览和恢复策略，放到后续再设计。

第一阶段推荐的产品闭环是：

```text
Studio 负责流程管理
Canvas 负责自由创作
Assets / 素材库负责跨模块资产保存、检索和复用
Backend 负责账号、额度、模型渠道和 AI relay
```

---

## 10. 和自己后端的关系

因为自己已经有独立后端，所以不需要迁移 LumenX、ArcReel、Jellyfish 的后端。

迁移时应该只迁移或参考它们的前端：

```text
迁移重点：
- 页面结构
- 组件组织
- 前端状态管理
- 业务流程
- 数据模型设计
- 交互方式

不迁移重点：
- 原项目后端
- 原项目 API 假设
- 原项目任务队列实现
- 原项目存储逻辑
- 原项目模型供应商绑定
```

LumenX Studio 前端第一阶段不改造成调用新的项目业务后端 API，而是改造成使用当前项目的本地数据仓储边界和现有 relay 边界。

建议在自己的前端中建立清晰的 Studio 适配层：

```text
web/src/services/studio-local.ts
  └── Studio 本地数据仓储边界。
      第一阶段 Web 实现可复用 localforage / IndexedDB；
      未来 Electron 桌面端可在该边界下切换到本地文件、SQLite 或项目 manifest。
      Studio 组件不得直接依赖具体存储引擎。

web/src/services/api/studio-generation.ts
  └── Studio 需要的剧本解析、提示词组装、结构化结果校验和生成调用适配，底层走现有 request / relay 边界
```

这样可以避免把 LumenX 原始 API 结构硬塞进自己的项目，也避免第一阶段把 mange-backend 扩张成 Studio 业务后端。

---

## 11. 实施进度记录

> 本节用于中断后恢复上下文。每次实施应记录已完成切片、验证命令和下一步。

### 2026-07-01

- 状态：开始执行 Studio MVP 第一批实现切片。
- 当前目标：优先完成 Issue 1「接入口和空 Studio 壳」，并补上 Issue 2 的最小 Studio 类型与本地仓储边界，让项目创建不直接依赖页面状态。
- 已确认边界：不迁移 LumenX Playground，不新增 mange-backend Studio 业务接口，不接真实生成，不复制 LumenX 完整应用壳。
- 待执行：先写工具入口、路由保护、Studio 仓储的回归测试，再实现 `/studio` 项目列表与 `/studio/[seriesId]` Episode 01 工作台壳。

#### 15:30 进度

- 已完成：工具入口页的“AI 漫剧生成”已从占位状态改为可进入 `/studio`。
- 已完成：桌面端登录保护已覆盖 `/studio` 与 `/studio/[seriesId]`。
- 已完成：新增 `web/src/services/studio-local.ts`，定义 `StudioSeries`、`StudioEpisode`、`StudioShot`、`StudioAssetRef` 等窄核心类型，并提供本地仓储边界。
- 已完成：新增 `/studio` 项目库空态、创建项目弹窗、项目卡片与删除入口。
- 已完成：新增 `/studio/[seriesId]` Episode 01 工作台壳，可查看项目、编辑并保存剧本草稿。
- 已验证：`bun run test src/lib/tool-hub.test.ts src/lib/desktop-routes.test.ts src/services/studio-local.test.ts` 通过。
- 已验证：`bun run typecheck` 通过。
- 已验证：`bun run test` 全量测试通过。
- 自审结果：未发现 Studio 页面直接依赖 localforage / IndexedDB；未新增 mange-backend Studio 业务接口；未迁移 LumenX 复杂组件或真实生成链路。
- 下一步：Issue 3 asset-first 引用边界，或 Issue 4 剧本解析真实 relay 闭环。

#### 15:40 进度

- 当前目标：执行 Issue 3「asset-first 引用边界」。
- 已完成：新增 `web/src/services/asset-references.ts`，集中扫描 Studio 与 Canvas 对 asset 的引用，并提供删除前检查结果。
- 已完成：Canvas 节点 metadata 支持 `assetRef` / `assetRefs`，用于保存 asset-first 引用关系。
- 已完成：从素材库插入 Canvas 的文本、图片、视频 payload 会携带 `assetRef`，Canvas 节点会写入同一个 asset 引用模型。
- 已完成：`useAssetStore.removeAsset()` 改为保护删除；删除前检查 Studio 和 Canvas 引用，被引用时不移除 asset。
- 已完成：我的素材页删除被引用 asset 时，会展示 Studio / Canvas 引用位置，提示先解除引用。
- 已验证：`bun run test src/services/asset-references.test.ts src/lib/local-asset-library.test.ts` 通过。
- 已验证：`bun run typecheck` 通过。
- 已验证：`bun run test` 全量测试通过。
- 自审结果：未引入 Studio 自有媒体存储；未新增后端接口；未把 localforage / IndexedDB 泄漏进 Studio 或 Canvas 组件；删除保护集中在 asset 引用服务和资产 store 边界。
- 下一步：进入 Issue 4「Studio 生成适配层最小闭环」，先跑剧本解析真实 relay 链路。

#### 15:50 进度

- 当前目标：执行 Issue 4「Studio 生成适配层最小闭环」。
- 已完成：新增 `web/src/services/api/studio-generation.ts`，提供 `parseScript()`、`parseAndApplyScript()` 和 `requestStudioChatCompletion()`。
- 已完成：Studio 剧本解析 prompt、JSON 代码块清洗、结构化 JSON 提取、zod 校验、字段映射已移植到 TypeScript 适配层。
- 已完成：第一条真实链路走当前 `textModel` 的 chat completions；远程模式复用 `/api/canvas/relay/chat/completions`、当前登录用户 relay header 和现有 `ai-request` 边界。
- 已完成：解析结果会写入 `StudioEpisode` 的 `characters`、`scenes`、`props`、`shots` 和 `generation.scriptParser`，并保留剧本内容。
- 已完成：`/studio/[seriesId]` Episode 01 工作台新增“解析剧本”按钮、解析失败提示、角色/场景/道具/分镜草稿摘要展示，以及可手动保存的结构草稿 JSON。
- 已完成：坏 JSON 或结构不符合 schema 时抛出可恢复错误，不写回 episode，保留用户已有手工内容；手工结构草稿复用同一套 Studio schema 校验与字段映射。
- 已验证：`bun run test src/services/api/studio-generation.test.ts src/services/api/relay-requests.test.ts` 通过。
- 已验证：`bun run typecheck` 通过。
- 已验证：`bun run test` 全量测试通过。
- 自审结果：未新增 Studio 后端接口；Studio 生成请求复用现有 `ai-request` 和用户态 relay；Studio 页面仍只通过仓储边界写本地项目数据，未直接依赖 localforage / IndexedDB；失败路径不覆盖用户手工内容。
- 下一步：提交本次 Issue 4；之后进入 Issue 5「适配性移植 LumenX Studio 组件」，优先 ScriptProcessor 组件化迁移。

#### 15:58 Review 修复进度

- 当前目标：处理 Issue 4 自审发现的真实 relay 兼容性和 generation 元数据保护问题。
- 已完成：`requestStudioChatCompletion()` 在模型或 relay 不支持 `response_format` / JSON mode 时，会自动重试一次不带 `response_format` 的 chat completions 请求。
- 已完成：`parseAndApplyScript()` 写入 `generation.scriptParser` 时会保留 episode 已有 `generation` 字段，避免覆盖手动结构草稿或后续生成元数据。
- 已完成：手动保存结构草稿的 schema 错误文案已从 AI 解析错误中拆出，避免用户手动编辑 JSON 时看到“AI 返回内容”。
- 已新增回归测试：不支持 `response_format` 时的 Studio relay fallback；解析成功后保留已有 `generation.manualStructure`。
- 已验证：`bun run test src/services/api/studio-generation.test.ts src/services/api/relay-requests.test.ts` 通过。
- 已验证：`bun run typecheck` 通过。
- 已验证：`bun run test` 全量测试通过。
- 下一步：进入 Issue 5「适配性移植 LumenX Studio 组件」。

#### 17:01 Issue 5 进度

- 当前目标：执行 Issue 5「适配性移植 LumenX Studio 组件」，先把工作台空间结构对齐 LumenX，再迁移 ScriptProcessor。
- 已对照源码：`/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/project/ProjectClient.tsx`、`PipelineSidebar.tsx`、`ScriptProcessor.tsx`、`StepPageHeader.tsx`、`SidePanelHeader.tsx`。
- 已完成：`/studio/[seriesId]` 从普通后台详情页重排为 LumenX unified/R2V 风格的全屏 pipeline shell：左侧 5 步 rail，主区域按 step 切换，Script 步骤采用左侧剧本编辑 + 右侧结构草稿栏。
- 已完成：新增 `studio-workspace-model.tsx`，集中生成 `Script / Art Direction / Cast / Storyboard / Assembly` 五步和状态，页面不再硬编码临时 nav。
- 已完成：当前 Issue 4 的剧本保存、AI 解析、结构 JSON 手动保存能力已搬入新的 ScriptProcessor 布局。
- 已完成：Art Direction、Cast、Storyboard、Assembly 暂以 LumenX pipeline 占位方式保留入口，后续按 Issue 5 顺序逐个接入真实组件。
- 已新增回归测试：`studio-workspace-model.test.ts` 覆盖 LumenX unified/R2V 步骤顺序、状态推导和结构草稿格式化。
- 已验证：`bun run test 'src/app/(user)/studio/[seriesId]/studio-workspace-model.test.ts' src/services/api/studio-generation.test.ts src/services/api/relay-requests.test.ts` 通过。
- 已验证：`bun run typecheck` 通过。
- 已验证：`bun run test` 全量测试通过。
- 已知限制：headless 浏览器访问 `/studio` 会被登录页拦截，无法在无登录态下截图工作台；需在已登录桌面窗口中目测确认最终视觉。
- 下一步：提交 Issue 5 第一段；然后继续迁移 ArtDirection 或先做一次真实视觉对照微调。

媒体层口径：

```text
Studio 不新增自己的媒体存储体系
        ↓
生成 / 导入 / 上传成功后先创建 asset
        ↓
当前 Web 阶段 asset 媒体由 image-storage / file-storage 存入 IndexedDB
        ↓
未来 Electron 阶段 asset 媒体由同一存储边界迁移到本地文件系统
```

第一阶段仍然用当前项目的 localforage / IndexedDB 快速跑通 MVP，但代码结构必须按 Electron 文件落盘来设计，不把 localforage 泄漏到组件和业务模型里。

LumenX 的 Python `ScriptProcessor`、prompt 模板、JSON schema、结果清洗和字段映射只作为迁移参考，不作为第一阶段运行时依赖。第一阶段应把这些生成逻辑移植成当前前端的 TypeScript 适配层，并复用现有 `ai-request`、`image`、`video` 等服务。

模型配置口径：

```text
模型列表和默认选择以当前项目配置为准
        ↓
候选模型来自当前用户在 mange-backend 下可用的模型列表
        ↓
Studio 项目可本地保存 text / image / video 模型偏好
        ↓
LumenX model catalog 只参考参数面板、模型分组和特殊参数支持
```

也就是说，LumenX model catalog 不作为 Studio 第一阶段的模型来源，不迁移原项目供应商绑定或独立模型目录。

---

## 11. 迁移策略

不建议“一次性复制整个 Studio”。

建议分阶段迁移：

### 11.0 迁移口径：适配性移植

Studio 迁移不应理解为从零重写 UI，也不应理解为原样复制 LumenX 的整个前端应用。

更准确的口径是：

```text
以 LumenX Studio 组件为基础
        ↓
保留业务布局、关键交互、状态组织和视觉肌理
        ↓
替换或适配 API、路由、持久化、主题 token、组件库版本和局部样式
        ↓
接入当前项目的 Next.js / React / Ant Design / Tailwind / Zustand 体系
```

也就是说，迁移重点是 **基于 LumenX 组件的适配性移植**，不是从空白页面重新设计一套 Studio。

视觉节奏上采用：

```text
第一阶段：可用、像 LumenX、少改动
第二阶段：流程稳定后，再逐步统一到当前项目视觉体系
```

第一阶段只处理必要的外层入口、登录态、主题变量、组件库版本和冲突样式，不在迁移过程中顺手重设计 Studio。

### 第一阶段：搭建 Studio 壳和统一 R2V 主流程

目标：

- 复用工具入口页中已经预留的“AI 漫剧生成”入口，将其从 `soon` 状态改为可进入 Studio；
- 新增或接通 `/studio` 路由；
- 新增项目列表；
- 新增短漫剧项目详情页；
- 建立 Studio 状态管理和本地数据仓储边界；
- 底层数据模型预留 `StudioSeries` 和 `StudioEpisode`，第一阶段 UI 只暴露单项目单集；
- 适配迁移 LumenX 的 `ScriptProcessor`、`ArtDirection`、`Cast` 和 `StoryboardR2V`；
- 接入当前登录态、可用模型和用户态 AI relay；
- 跑通 Studio 最小生成闭环：剧本解析、实体草稿、用户确认、R2V 分镜或镜头 prompt、至少一次图像或视频候选生成、结果回填本地项目数据；
- AI 结果必须可手动编辑，AI 失败不能阻塞 Studio 继续使用；
- 暂不新增 Studio 业务后端。

第一阶段不要求完成完整视频任务队列、批量重试、视频组装和导出。这些事项记录在 [Studio MVP 后待办](./studio-post-mvp-todos.md)，等最小生成闭环跑通后继续完善。

第一阶段也不要求完整迁移 LumenX 的 `SeriesDetailPage`、`EpisodeMiniList`、跨集 Reconcile 和复杂系列管理。数据模型先预留，复杂交互放到 MVP 后。

第一批实现按 [Studio MVP 第一批实现切片](./studio-mvp-implementation-slices.md) 推进：

```text
Issue 1：接入口和空 Studio 壳
Issue 2：Studio 类型和仓储边界
Issue 3：asset-first 引用边界
Issue 4：Studio 生成适配层最小闭环（先跑剧本解析真实 relay 链路）
Issue 5：适配性移植 LumenX Studio 组件
```

### 第二阶段：跑通剧本、演员表和 R2V 分镜

目标：

- 剧本输入；
- 剧本解析；
- 角色、场景、道具提取和确认；
- 画风设定；
- 分镜列表；
- 单个镜头的图像候选、参考图和视频候选。

这是 Studio 的核心 MVP。

### 第三阶段：打通素材库和 Canvas

目标：

- Studio 角色、场景、道具和镜头结果生成后进入本地素材库；
- Studio 项目保存这些 asset 的候选、选中和项目关系；
- Canvas 节点引用本地素材库中的 asset；
- Studio 和 Canvas 通过 asset 复用媒体，而不是直接复制对方过程数据。

这一阶段决定 Canvas 和 Studio 是否形成产品闭环。

### 第四阶段：完善视频生成和任务队列

目标：

- 单个镜头图生视频；
- 多镜头批量生成；
- 任务状态追踪；
- 失败重试；
- 结果回填分镜；
- 任务队列面板。

### 第五阶段：迁移组装、配音、时间线和导出

目标：

- TTS 配音；
- 镜头排序；
- 时间线预览；
- 视频合成；
- 导出成片。

---

## 12. 技术改造注意点

### 12.1 Next.js 版本差异

LumenX 是 Next.js 14，自己的项目是 Next.js 16。

需要注意：

- App Router 写法是否一致；
- 动态导入方式；
- Client Component 和 Server Component 边界；
- 环境变量读取方式；
- 构建配置差异。

### 12.2 React 版本差异

LumenX 使用 React 18，自己的项目使用 React 19。

大部分普通组件迁移问题不大，但要注意：

- 旧 hooks 写法；
- 第三方组件兼容性；
- 严格模式下副作用重复执行；
- React 19 下部分库是否存在警告。

### 12.3 Tailwind 版本差异

LumenX 使用 Tailwind 3，自己的项目使用 Tailwind 4。

需要注意：

- 配置文件差异；
- class 是否仍然生效；
- 自定义主题变量；
- 动画和插件配置。

### 12.4 UI 体系差异

自己的项目已经使用 Ant Design 6。

因此 LumenX Studio 的组件不建议原样保留 UI，而是应该逐步接入自己的设计体系：

```text
LumenX 组件逻辑
        ↓
保留业务状态和交互结构
        ↓
替换为自己的 Ant Design / Radix / Tailwind UI
```

### 12.5 API 层重写

因为使用自己的后端，所以 LumenX 的 API 调用需要重写。

建议不要在组件里直接写 fetch，而是统一封装：

```text
组件
 ↓
studio service
 ↓
统一 request client
 ↓
自己的后端 API
```

---

## 13. 最终推荐方案

最终推荐：

```text
主项目：infinite-canvas

保留：
- 自己的无限画布
- 自己的模型配置
- 自己的素材库
- 自己的视频生成能力
- 自己的后端

重点迁移：
- LumenX Studio 的业务流程
- LumenX Studio 的分镜系统
- LumenX Studio 的角色/场景/道具管理
- LumenX Studio 的一致性资产管理
- LumenX Studio 的视频任务队列和导出流程

选择性参考：
- LumenX Playground 的参数面板、任务队列、结果画廊
- ArcReel 的任务系统、供应商配置、成本统计、剪映导出
- Jellyfish 的角色一致性、结构化分镜、资产模型

不建议：
- 整体迁移 LumenX Playground
- 同时整合三个项目的完整前端
- 把其他项目后端强行并入自己的后端
```

---

## 14. 最核心判断

这次讨论得出的核心判断是：

> 你的无限画布已经覆盖了 Playground 的价值；你真正缺的是 Studio 这种围绕剧本、分镜、角色一致性和镜头视频生成的结构化生产台。

所以：

```text
Canvas = 自由创作
Studio = 项目制短漫剧生产
Assets = 统一资产保存、检索、整理和复用
Backend = 账号、额度、模型渠道和 AI relay
```

这是最清晰、最适合长期演进的产品架构。

---

## 15. 一句话版

**不要把 LumenX Playground 搬进来；把 LumenX Studio 改造成自己的短漫剧模块，并让它和现有无限画布、素材库、后端任务系统打通。**

---

## 16. 实施进度记录

### 2026-07-01 17:20 Issue 5 第二段/收尾

本次继续执行 Issue 5：在上一段已经完成 LumenX 式 Studio 工作台壳、左侧 PipelineRail、ScriptProcessor 迁移的基础上，继续迁移 ArtDirection，并尽量完成 Issue 5 剩余组件。

已完成：

- 参考 LumenX 源文件：
  - `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/ArtDirection.tsx`
  - `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/Cast.tsx`
  - `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/StoryboardR2V.tsx`
  - `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/storyboard-r2v/StoryboardGenerateDialog.tsx`
- 按 TDD 先补 `web/src/app/(user)/studio/[seriesId]/studio-workspace-model.test.ts`：
  - ArtDirection 草稿会归一化为 `episode.generation.artDirection` 可保存结构。
  - Cast 会从当前 Episode 的 characters / scenes / props 和 shot 文本提及生成三组素材清单。
  - StoryboardR2V 轻量卡片会按镜头顺序生成 prompt，并保留对白标记。
- 扩展 `web/src/app/(user)/studio/[seriesId]/studio-workspace-model.tsx`：
  - 新增本地 `STUDIO_STYLE_PRESETS`，避免依赖 LumenX 后端风格预设接口。
  - 新增 `normalizeArtDirectionDraft()`、`readArtDirectionDraft()`。
  - 新增 `buildCastSections()`、`buildStoryboardCards()`。
- 扩展 `web/src/app/(user)/studio/[seriesId]/page.tsx`：
  - `art_direction` 不再是占位页，已迁移为 LumenX 风格的推荐风格、内置预设、分类切换、prompt 编辑和底部“应用并继续”保存栏。
  - 风格保存写入当前 Episode 的 `generation.artDirection`，并保留已有 `generation` 元数据。
  - `cast` 不再是占位页，已迁移为本集角色/场景/道具三类资产透视，带全部/角色/场景/道具 tab、出现次数和 ready/pending 状态。
  - `storyboard_r2v` 不再是占位页，已迁移为轻量 StoryboardR2V 工作区：按 Episode shots 展示镜头卡、prompt、对白标记、候选计数，以及右侧生成前检查。
  - `assembly` 仍保留占位，因为 Issue 5 明确只要求 ScriptProcessor、ArtDirection、Cast、StoryboardR2V 轻量版；完整 assembly/export 属于后续 MVP-after 范围。

当前已验证：

- `bun run test 'src/app/(user)/studio/[seriesId]/studio-workspace-model.test.ts'`
- `bun run typecheck`

Review 后修正：

- ArtDirection 的“应用并继续”保存成功后会切到 Cast 步骤，避免文案和行为不一致。
- ArtDirection 底部 prompt 编辑区、StoryboardR2V 主区/右侧检查栏增加响应式单列降级，避免窄屏固定双栏挤压。

待本次提交前继续验证：

- 相关 Studio/API 测试组合。
- 全量 `bun run test`。
- `git diff --check`。
- touched-file 格式化检查。

### 2026-07-01 18:10 Issue 5 风格校准

本次根据反馈暂停继续发散设计，改为把当前 Studio 工作区视觉重新拉回 LumenX 工作画面基线。注意：这里不是新增 Issue 6，而是 Issue 5 已完成产物的风格纠偏。

已完成：

- 重新对照 LumenX 源文件和共享组件：
  - `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/shared/StepPageHeader.tsx`
  - `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/shared/WorkflowActionButton.tsx`
  - `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/ScriptProcessor.tsx`
  - `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/ArtDirection.tsx`
  - `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/StoryboardR2V.tsx`
- 在 `web/src/app/(user)/studio/[seriesId]/page.tsx` 增加 Studio 局部 Ant Design dark theme，使 Button/Input/Tag 更接近 LumenX 的 dark glass 工作台，而不是当前项目默认黑白中性主题。
- 把工作区主背景、侧栏、页面头部、结构侧栏、卡片、空状态、检查项从上一版手写暗色改为更贴近 LumenX 的 atelier token：
  - base `#0c0b0e`
  - surface `#131116`
  - elevated `#181620`
  - inset `#0a090c`
  - primary `#34d8c4`
  - accent `#ffa94d`
  - foreground `#f2ede4`
- 重做 `PipelineRail` 的视觉密度：LumenX 式 inset 侧栏、mono 小标签、低亮度状态说明、glass hover/active 和竖向流程线。
- 重做 `StepPageHeader` / `StepPill` / `SidePanelHeader`，对齐 LumenX 的 `STEP 0N · NAME` 头部层级和 pill 信息胶囊。
- 把主行动/次行动按钮改为 LumenX 风格 rounded-full frosted 按钮，优先减少 Ant 默认方角按钮带来的“不是同一个产品”的感觉。
- 调整 `web/src/components/layout/app-top-nav.tsx`：具体 Studio 工作区 `/studio/:seriesId` 像 `/canvas/:id` 一样隐藏全局顶部导航，保留 `/studio` 项目库导航，避免工作台顶部被无限画布全局 chrome 打断。
- 保持 Issue 5 业务行为不变：Script、ArtDirection、Cast、StoryboardR2V 轻量版的数据流和保存逻辑没有扩大范围。

当前已验证：

- `bun run typecheck`
- `bun run test 'src/app/(user)/studio/[seriesId]/studio-workspace-model.test.ts'`
- `bun run test`
- `git diff --check`
- touched-file prettier check
- 已通过内置浏览器进入本地 `http://127.0.0.1:3002/studio/:seriesId` 并截图核验：顶部全局导航已隐藏，工作区进入沉浸式 LumenX dark glass 布局。
