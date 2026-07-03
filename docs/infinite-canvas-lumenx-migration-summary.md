# Infinite Canvas / LumenX Studio 迁移基线

本文是 Studio 迁移的当前实现基线。它不记录访谈流水，只记录后续实现必须遵守的产品行为、模块接口、数据不变量、验收线和 LumenX 对照结论。

后续讨论和实现优先以本文为准。若 LumenX 源项目已有明确答案，先参考 LumenX 已批准设计文档和源码；只有源项目做法与当前项目边界冲突时，才进行本地适配决策。

## 1. 北极星：复原 LumenX 五步生产行为

Studio 不是更复杂的 Canvas，也不是普通生图页的项目化版本。Studio 是 LumenX/Loomax 五步生产法在当前项目本地素材库、用户态 relay、当前模型配置和本地仓储上的适配实现。

正确行为链路是：

```text
Script 解析
        ↓
Style 定调
        ↓
Cast 生成角色 / 场景 / 道具参考图，并保留 variants
        ↓
Storyboard 基于 Cast 资产生成镜头候选
        ↓
Assembly 选镜头、组装、混音、导出
```

这条链路是产品真相，不是 UI 排列建议。只做五个 tab，但行为没有沿着这条链路推进，就不是 LumenX Studio 的迁移。

必须复原：

- 五步工作法及其因果顺序。
- Script 产出结构化角色、场景、道具和分镜草稿。
- Style 作为后续 Cast 和 Storyboard 生成的视觉基线。
- Cast 负责角色、场景、道具参考资产生产，并保留候选 variants。
- Storyboard 基于 Cast selected 参考资产生成镜头图片候选。
- Assembly 负责最终镜头选择、组装、混音和导出。

可以本地适配：

- 不运行 LumenX Python 后端。
- 不迁移 LumenX model catalog 作为运行时模型来源。
- 不迁移 LumenX OSS 路径、输出目录、供应商绑定和文件存储假设。
- 媒体文件进入当前项目本地素材库 asset，再由 Studio 保存引用。
- 生成请求走当前项目用户态 relay 和当前用户可用模型。
- 第一阶段用前端本地仓储，后续可切换 Electron 文件、SQLite 或 manifest。

跑偏信号：

- Cast 只展示实体清单，却不能生成和维护参考图 variants。
- Storyboard 直接拿镜头 prompt 生图，绕过 Cast selected 参考资产。
- Style 只是一个展示步骤，对 Cast / Storyboard 生成没有实际影响。
- Assembly 被简化成导出按钮，而不是最终选择和组装阶段。
- 页面直接串联 relay、asset 创建和 episode 更新，导致生成行为散落在 UI 里。

## 2. 产品边界

当前项目已经具备无限画布、AI 生图、图生图、视频生成、提示词库和本地素材库能力，不需要迁移 LumenX Playground。

真正值得迁移的是 LumenX Studio：围绕剧本、角色、场景、道具、分镜和连续镜头生产的项目制短漫剧流程。

最终边界：

```text
Canvas  = 自由创作、节点编排、图片/视频生成和视觉迭代
Studio  = 项目制短漫剧生产，围绕剧本、风格、Cast 参考资产、分镜候选和最终组装推进
Assets  = 统一素材库，保存、检索、整理和复用所有媒体资产
Backend = 账号、额度、模型渠道和用户态 AI relay
```

Studio 和 Canvas 不互相替代。Studio 负责结构化生产，Canvas 负责自由创作；二者通过统一 asset 引用共享媒体。

## 3. 不迁移范围

- 不迁移 LumenX Playground 作为独立模块。
- 不运行或依赖 LumenX Python 后端。
- 不迁移 LumenX model catalog 作为运行时模型来源。
- 不迁移 LumenX 供应商绑定、OSS 路径、输出目录或存储路径假设。
- 不把 `mange-backend` 扩成 Studio 业务后端。
- 不在第一阶段做完整视频任务队列、批量重试、视频组装、TTS、字幕、时间线和成片导出。
- 不完整迁移 `SeriesDetailPage`、`EpisodeMiniList`、跨集 Reconcile 和复杂多集管理。
- 不让 Studio 组件直接依赖 localforage、IndexedDB、本地文件路径、SQLite 或 manifest。

## 4. 五步职责

### 4.1 Script

职责：

- 保存剧本文本。
- 调用当前文本模型解析剧本。
- 产出角色、场景、道具和分镜草稿。
- 生成角色、场景、道具和镜头的 prompt 初稿。

产物：

- `StudioEpisode.script`
- `StudioEpisode.characters`
- `StudioEpisode.scenes`
- `StudioEpisode.props`
- `StudioEpisode.shots`
- `episode.generation.scriptParser`

不做：

- 不直接生成 Cast 参考图。
- 不直接生成镜头图。
- 不直接生成视频。

### 4.2 Style

职责：

- 确定项目或本集视觉语言。
- 保存 positive / negative / preset / art direction name。
- 作为后续 Cast 和 Storyboard 生成的视觉基线。

产物：

- 第一阶段可继续保存在 `episode.generation.artDirection`。
- 后续多集阶段可提升为 `StudioSeries.stylePrompt` 或系列级 art direction。

不做：

- 不替代 Cast prompt。
- 不直接生成角色、场景、道具或镜头。
- 不静默覆盖已有实体 prompt。

关键规则：

Style 必须影响 Cast 和 Storyboard，但不能不可见地影响生成。生成前必须能展示 effective prompt 或保存生成快照，让用户知道 Style 如何参与了这次生成。

### 4.3 Cast

职责：

- 展示本集角色、场景、道具。
- 为角色、场景、道具生成参考图。
- 保留每个基础资产的 candidate variants。
- 维护每个基础资产的 selected reference image。
- 允许单项重新生成 1 / 2 / 4 张候选。
- 允许用户从候选中切换主参考图。

产物：

- `StudioCharacter.assetRefs`
- `StudioScene.assetRefs`
- `StudioProp.assetRefs`
- 每个基础资产最多一个 selected image ref。
- 每个基础资产可以有多个 candidate image ref。

不做：

- 不生成镜头画面。
- 不生成视频。
- 不把未选候选当作缓存自动清理。

Cast 是当前最关键的补齐阶段。没有 Cast variants，就没有 LumenX Studio 的角色一致性和后续 Storyboard 参考资产。

### 4.4 Storyboard

职责：

- 展示和编辑分镜草稿。
- 基于 shot prompt、Style、Cast selected 参考资产生成镜头图片候选。
- 为每个 shot 保留 selected image 和 candidate variants。
- 为后续视频生成提供已确认的镜头图或参考图。

产物：

- `StudioShot.prompt`
- `StudioShot.assetRefs`
- shot-level selected image ref。
- shot-level candidate image refs。

不做：

- 不绕过 Cast selected 参考资产直接裸 prompt 生成主流程镜头图。
- 不生成完整视频队列。
- 不承担最终成片选择职责。

允许例外：

- 当用户明确选择无参考模式或 Cast 参考图缺失时，可以允许生成，但 UI 必须提示一致性风险。

### 4.5 Assembly

职责：

- 从每个 shot 的候选中确认最终 take。
- 管理镜头排序、预览、时间线、配音、音乐、字幕和混音。
- 导出最终短片。

产物：

- episode-level assembly metadata。
- final takes。
- preview / exported media asset refs。

不做：

- 不回头承担 Cast 参考资产生成。
- 不回头承担 Storyboard 镜头候选生成。
- 不被简化为单个“导出”按钮。

第一阶段 Assembly 可以占位，但行为定义必须保持为最终选择和组装阶段。

## 5. 模块接口和 Seam

这里使用 `codebase-design` 的语言：Studio 迁移应优先设计深 Module。页面只负责展示、触发和局部 UI 状态；生成链路、模型 fallback、asset 创建、variants 规则和 repository 回填应集中在少量深 Module 后面。

### 5.1 Studio Workflow Module

Studio Workflow 是概念 Module，当前可先落在：

```text
web/src/services/api/studio-generation.ts
```

它的 Interface 应接近 LumenX 工作法，而不是底层 relay 细节。

建议 Interface：

```text
parseAndApplyScript(input)
generateCastReferences(input)
generateShotCandidates(input)
assembleEpisode(input)
```

第一阶段先实现前两个：

- `parseAndApplyScript`
- `generateCastReferences`

Implementation 隐藏：

- 文本模型和图像模型 fallback。
- 当前用户可用模型校验。
- relay 请求。
- 生成结果解析。
- 媒体转 asset。
- selected / candidate / reference 写入规则。
- variants 保留规则。
- 失败摘要写入。
- repository 多步更新。

页面不要直接知道 raw relay payload、asset 存储细节或 repository 的多步写入顺序。

### 5.2 Studio Repository Module

核心入口：

```text
web/src/services/studio-local.ts
```

职责：

- 管理 Studio 本地数据读写。
- 隐藏 localforage / IndexedDB / Electron 文件 / SQLite / manifest 的底层差异。
- 提供窄仓储 Interface。

第一阶段不急着为每个行为新增很多 repository 方法。可以继续使用 `updateEpisode`，但复杂生成规则不要散落在页面里。

### 5.3 Studio Workspace Model Module

核心入口：

```text
web/src/app/(user)/studio/[seriesId]/studio-workspace-model.tsx
```

职责：

- 纯计算派生 UI 所需数据。
- 计算 Pipeline 状态。
- 计算 Cast 卡片 selected 图、candidate 数、prompt 摘要、失败状态和顶部按钮文案。
- 计算 Storyboard 卡片候选状态和生成前检查。

它是 in-process Module，适合通过单元测试覆盖，不应发起 I/O。

### 5.4 Asset Reference Module

核心入口：

```text
web/src/services/asset-references.ts
```

职责：

- 扫描 Studio 和 Canvas 对 asset 的引用。
- 阻止仍被引用的 asset 被硬删。
- 报告引用位置。

Studio 生成、导入、上传出的媒体必须先成为 asset，再写 Studio 或 Canvas 引用。

## 6. 数据模型和不变量

### 6.1 核心模型

核心模型保持窄字段加扩展容器：

```text
StudioSeries
  - 项目标题、简介、模型偏好、共享配置和剧集引用

StudioEpisode
  - 剧本、角色、场景、道具、分镜、生成元数据和扩展引用

StudioCharacter / StudioScene / StudioProp
  - 名称、描述、prompt、assetRefs、generation、metadata

StudioShot
  - 镜头描述、prompt、对白、assetRefs、generation、metadata

StudioAssetRef
  - 指向素材库 asset 的引用关系
```

不把 LumenX 旧字段整包搬入核心模型。确实需要保留的字段进入 `metadata`、`generation` 或 `refs` 等明确扩展容器。

### 6.2 Variants 映射

LumenX 的 `reference_sheet.image_variants`、`image_asset.variants` 和 `selected_id` 语义映射到当前项目统一的 `assetRefs`：

```text
LumenX ImageVariant
        ↓
本地素材库 asset
        ↓
StudioAssetRef(role: "candidate" | "selected")
```

LumenX 的 `prompt_used` 映射为：

```text
StudioAssetRef.metadata.promptSnapshot
```

当前项目不为每种实体新增独立 `image_asset` 容器，优先复用 `assetRefs`。

### 6.3 selected / candidate / reference 不变量

- 同一个 Studio 角色、场景、道具或镜头可以有多个 `role: "candidate"` 的 image ref。
- 同一个 Studio 角色、场景、道具或镜头，同一媒体类型最多只有一个 `role: "selected"` ref。
- 将 candidate 设为主图时，旧 selected image ref 降级为 candidate，不删除旧图，也不改成 reference。
- `reference` 只表示明确作为生成参考图的关系，不表示“曾经选中过”。
- 第一次 Cast 一键生成返回的单张图直接写为 selected image。
- Cast 后续单项重新生成返回的新图默认写为 candidate。
- Storyboard 空镜头首次单张生成可以自动成为 selected image。
- 未选 candidate 不是缓存，不应自动丢弃。
- 删除 Studio 候选只解除 Studio 关系，不删除底层 asset。

### 6.4 Prompt 和 Style 快照

基础资产和镜头都需要有用户可见 prompt：

- `StudioCharacter.prompt`
- `StudioScene.prompt`
- `StudioProp.prompt`
- `StudioShot.prompt`

Style 也必须参与后续生成，但要透明：

```text
entity.prompt
        +
effective art direction / style prompt
        ↓
effectivePrompt
        ↓
生成请求
```

生成前 UI 应能展示 effective prompt 或关键摘要。每张生成图的参数摘要记录在 `StudioAssetRef.metadata`，至少包含：

- `source`
- `promptSnapshot`
- `styleSnapshot`
- `effectivePromptSnapshot`
- `model`
- `createdAt`

按需包含：

- `count`
- `aspectRatio`
- `batchId`
- `targetKind`
- `targetId`

规则：

- Style 更新后，不静默覆盖已有实体 prompt。
- 可以提示“可根据当前 Style 重组 prompt”。
- 一键重组必须先展示草稿，用户确认后才写回。
- 生成适配层不得把用户完全看不见的创作上下文塞进请求。
- 生成失败摘要写入 `entity.generation.lastImageError` 或 `shot.generation.lastImageError`。
- 成功生成后清除对应 last error。

## 7. 媒体资产边界

Studio 不拥有自己的媒体存储。所有生成、导入或上传成功的媒体，必须先成为本地素材库 asset。

```text
生成 / 导入 / 上传
        ↓
创建 asset
        ↓
Studio 候选或 Canvas 节点保存 asset 引用
```

生成接口拿到媒体返回值不等于完成。只有 asset 创建成功，并且 Studio 或 Canvas 引用写入成功，才算完成一次可追踪的生成结果。

失败处理：

- 图片生成失败：不创建 asset，不清空已有候选。
- asset 创建失败：不写入 Studio 引用，提示用户重试。
- asset 已创建但 Studio 引用写入失败：允许 asset 留在素材库，并提示“图片已保存到素材库，但未挂接到 Studio”。
- 删除 Studio 候选只解除 Studio 关系，不删除底层 asset。

删除 asset 时采用保护优先：

```text
删除 asset
        ↓
检查 Studio 引用和 Canvas 引用
        ↓
存在引用则阻止删除，并展示引用位置
        ↓
用户解除引用后才允许删除 asset
```

第一阶段不做默认强删，也不做级联清空引用。

## 8. 生成和模型

Studio 生成走当前项目用户态 relay，不新增 Studio 业务后端。

核心入口：

```text
web/src/services/api/studio-generation.ts
```

模型来源：

```text
全局 AI 配置
        ↓
Studio 项目级 text / image / video 模型偏好
        ↓
生成链路使用项目偏好，未设置时跟随全局配置
```

模型偏好使用规则：

- 项目级模型仍在当前可用模型列表中时，优先使用项目级模型。
- 项目级模型已经不可用时，降级到全局模型，并在 UI 上给出提示或 missing 状态。
- 全局模型也不可用时，生成按钮禁用，并引导用户去全局 AI 配置。
- 不把 LumenX catalog 中存在但当前用户不可用的模型展示为可选项。
- LumenX model catalog 只作为参数面板、模型分组和特殊参数设计参考，不作为运行时模型列表来源。

## 9. 当前实现状态

第一批 Studio MVP 基础已完成，可以视为“Studio 壳、数据边界、剧本解析、轻量工作台”阶段结束。

已完成：

- `/studio` 项目库已建立，支持创建、打开和删除 Studio 项目。
- `/studio/[seriesId]` 已建立 Episode 01 工作台。
- 桌面端路由保护已覆盖 Studio 项目库和工作台。
- `studio-local` 已定义 Studio 类型和本地仓储边界。
- `asset-references` 已集中扫描 Studio / Canvas 对 asset 的引用。
- Canvas 节点 metadata 已支持 `assetRef` / `assetRefs`。
- 素材库删除 asset 时已具备 Studio / Canvas 引用保护。
- `studio-generation` 已跑通剧本解析真实 relay 链路。
- 剧本解析结果会写入角色、场景、道具和分镜草稿。
- AI 解析失败、坏 JSON、schema 错误不会覆盖用户已有手工内容。
- Studio 工作台已对齐 LumenX unified/R2V 的 5 步流程：Script、Art Direction、Cast、Storyboard、Assembly。
- ScriptProcessor、ArtDirection、Cast、轻量 StoryboardR2V 已完成适配性迁移。
- Assembly 仍是占位，视频组装、混音和导出属于后续阶段。
- Studio 工作台视觉已校准为 LumenX dark glass 风格，具体工作区隐藏全局顶部导航。
- 左侧底部已补齐项目级生成设置入口，可保存 text / image / video 模型偏好。

当前实际缺口：

- 代码中的 `StudioCharacter`、`StudioScene`、`StudioProp` 尚未补齐核心 `prompt` 和 `generation` 字段。
- 剧本解析结果目前主要写入 `name`、`description` 和分镜草稿，尚未形成完整 Cast 生产 prompt 初稿。
- Cast 当前只是本集素材清单和 ready / pending 状态展示，还不是可生成、可迭代、可选择主图的生产步骤。
- Style 已有 UI 和保存能力，但还没有作为可见 effective prompt 参与 Cast / Storyboard 生成。
- Storyboard 当前展示镜头 prompt 和候选计数，但尚未基于 Cast selected 参考资产生成镜头候选。
- Assembly 只是占位，尚未承担最终选择、组装、混音和导出。

当前阶段的正确推进方向：

```text
Script 解析
        ↓
Style 定调
        ↓
Cast 生成角色 / 场景 / 道具参考图，并保留 variants
        ↓
Storyboard 基于 Cast 资产生成镜头候选
        ↓
Assembly 选镜头、组装、混音、导出
```

说明：剧本输入、AI 解析、角色 / 场景 / 道具 / 分镜草稿和 prompt 初稿都属于 Script 解析步骤内部的产物，不是插在 Style 前面的独立工作法阶段。文档中的主流程必须始终保持 LumenX 的五步顺序。

## 10. Issue 6：Cast 参考资产与 variants 闭环

下一阶段优先做 Cast 参考资产与 variants 闭环，而不是先做 Storyboard 单镜头图、视频任务队列或 Assembly 导出。

“一键批量生成基础资产图”只是入口之一，不是 Issue 6 的核心目标。Issue 6 的核心目标是：

```text
每个角色 / 场景 / 道具都有可持续迭代的参考资产池
```

原因：

- LumenX Studio 的工作流会在剧本分析和 Style 定调后，先形成 Cast 参考资产，再围绕这些资产推进分镜和镜头生成。
- Cast 参考图是后续镜头一致性的前置条件。
- variants 是抽卡、比较、回退和再选择的产品核心，不是缓存。
- 这个切片可以验证 Studio 生成适配层、模型偏好、asset-first、候选引用、并发任务状态和 UI 回填。
- 视频同时牵涉轮询、失败重试、参考图、耗时状态和导出链路，适合在 Cast 图片资产闭环稳定后再做。

### 10.1 目标链路

```text
Script 解析完成，并得到 characters / scenes / props / 分镜草稿 + prompt 初稿
        ↓
Style 保存视觉基线
        ↓
Cast 展示基础资产清单、prompt 摘要、selected 图和 variants 状态
        ↓
用户点击“生成缺失参考图”
        ↓
为 pending 的角色 / 场景 / 道具创建并发图片生成任务
        ↓
每个任务读取 entity.prompt + 当前可见 Style，形成 effective prompt
        ↓
读取 Studio 项目 imageModel 偏好，未设置或不可用时 fallback
        ↓
复用当前 image request / ai-request / relay 接口
        ↓
生成返回的图片逐张创建 asset
        ↓
写入 StudioCharacter / StudioScene / StudioProp 的 image ref
        ↓
首次缺失项写为 selected，后续单项重生成写为 candidate
        ↓
Cast 卡片展示生成结果、候选数和任务状态
        ↓
用户可以进入单项 Workbench 继续生成 1 / 2 / 4 张候选
        ↓
用户可以把 candidate 设为主图，旧 selected 降级为 candidate
```

这里的“批量”指一次为多个 Cast 基础资产创建并发图片生成任务，不等于完整视频任务队列，也不等于 Assembly 导出队列。

### 10.2 Issue 6 切片

#### 6.1 Cast 数据补正

- 给 `StudioCharacter`、`StudioScene`、`StudioProp` 增加 `prompt` 和 `generation`。
- 剧本解析时生成基础资产 prompt 初稿。
- prompt 初稿要参考实体名称、描述、类型和当前工作法需要的构图要求。
- Style 独立保存，不强行不可见地塞进每个实体 prompt。
- Cast 卡片展示 prompt 摘要、selected 图、candidate 数、失败状态和出现次数。

验收线：

- 剧本解析后，Cast 中每个角色、场景、道具都有可见 prompt。
- 保存结构草稿不会丢失 prompt 字段。
- 重新解析或补充解析不静默覆盖用户已改 prompt。

#### 6.2 Cast 一键生成缺失参考图

- 顶部按钮文案为“生成缺失参考图”。
- 默认只生成没有 selected image 的角色、场景、道具。
- 每项默认生成 1 张。
- 并发执行，允许部分成功。
- 成功图片先进入 asset，再写回 Studio `assetRefs`。
- 首次缺失项成功后写为 selected image。
- 失败项写入 `generation.lastImageError`。

验收线：

- 成功项不受失败项影响。
- 失败不会清空已有候选。
- asset 创建失败时不写入 Studio ref。
- asset 已创建但 Studio 回填失败时提示用户图片仍在素材库。

#### 6.3 Cast 单项 Workbench

- 点击角色、场景、道具打开单项 Workbench 或详情面板。
- 可编辑基础 prompt。
- 可看到 Style 是否参与生成。
- 可看到 effective prompt preview 或关键摘要。
- 可选择生成数量 1 / 2 / 4。
- 单项重生成的新图默认追加为 candidate，不自动替换 selected。
- 多次生成结果保留为 variants。

验收线：

- 用户能对单个角色、场景、道具反复生成和比较候选。
- 旧候选保留。
- 生成快照记录 prompt、style、model、count、aspectRatio。

#### 6.4 Variants 选择和管理

- candidate 可以设为主图。
- 旧 selected 降级为 candidate。
- 可以移除 Studio 候选关系。
- 可以从素材库选择图片加入候选。
- 可以查看每张候选的生成参数摘要。

验收线：

- 同一实体同一媒体类型最多一个 selected。
- 未选候选不会因为切换主图而丢失。
- 删除候选只解除 Studio 关系，不删除素材库 asset。

### 10.3 产品规则

- Cast 展示角色、场景、道具基础资产清单。
- 每个基础资产都有用户可见、可编辑、可复制、可保存、可复用的生产 prompt。
- 每个基础资产都可以有 selected reference image 和多个 candidate variants。
- 初级用户可以直接一键生成缺失参考图，高级用户可以先检查和修改 prompt。
- 剧本刚解析完成后的第一次一键生成中，角色、场景、道具默认都没有图片，全部属于 pending。
- 全部基础资产已生成且没有 pending / failed 项时，顶部入口禁用或弱化，文案显示“参考图已生成”。
- 不提供默认“重新生成全部”。
- 后续新增角色、场景或道具后，顶部入口恢复为“生成缺失参考图”，只生成新增的 pending 项。
- 部分失败时，顶部入口显示“重试失败项”，只重新提交 failed 或仍缺图的 pending 项，不重跑成功项。
- 运行中离开 Studio 工作区时，可以提示“仍有图片正在生成，离开后当前进度不会继续追踪”。
- 第一版只持久化生成结果状态，不持久化完整运行中任务队列。

### 10.4 建议 Interface

```text
generateCastReferences(input)
  输入：
    - repository
    - seriesId / episodeId
    - target kind: character / scene / prop
    - target ids 或 allMissing / failedOnly
    - 当前 StudioSeries / StudioEpisode
    - 当前 AI config
    - asset 创建函数
    - 可测试替换的图片请求函数
    - count: 1 / 2 / 4

  输出：
    - per-target result
    - 新创建的 assets
    - 写入对应 StudioCharacter / StudioScene / StudioProp 的 assetRefs
    - 更新后的 episode / series
```

Interface 应隐藏：

- imageModel fallback 和可用性校验。
- effective prompt 构建和快照。
- `/images/generations` relay 调用。
- 生成结果转 asset。
- Studio entity `assetRefs` 回填。
- selected / candidate 切换。
- 失败时不覆盖旧候选的保护逻辑。

## 11. Issue 7：Storyboard 镜头图片候选闭环

Issue 7 必须建立在 Cast 参考资产可生成、可选择、可重生之后。

正确链路：

```text
StudioShot.prompt
        +
Style
        +
角色 selected reference image
        +
场景 selected reference image
        +
道具 selected reference image
        ↓
镜头图片候选 variants
        ↓
shot selected image / candidate images
```

产品规则：

- 分镜卡展示 shot prompt。
- 分镜卡展示所引用的角色、场景、道具参考图状态。
- 缺少关键 Cast selected 图时，生成入口提示一致性风险。
- 单镜头默认生成 1 张。
- 可选 2 / 4 张候选。
- 空镜头首次单张生成可以自动成为 selected image。
- 后续重生成默认追加 candidate。
- 用户可以切换 shot selected image。

不要先做：

- 多镜头视频队列。
- 完整 R2V 任务队列。
- Assembly 导出。

## 12. Issue 8：候选管理增强

Cast 和 Storyboard 都有候选后，再补统一候选管理能力：

- 重新生成。
- 移除 Studio 候选关系。
- 从素材库选择候选。
- 上传图片作为候选。
- 候选批次记录。
- 生成参数摘要展示。
- 收藏、标签、归档等素材库增强。

候选管理不要提前到 Issue 6 之前做成空架子。

## 13. Issue 9：Studio 与 Canvas 打通

Studio 与 Canvas 的打通建立在 asset-first 上：

- 角色、场景、道具、镜头可以发送到 Canvas 自由编辑。
- Canvas 结果通过 asset ref 回填 Studio。
- 回填时进入对应实体或 shot 的 candidate refs。
- 用户可以再设为 selected。

Canvas 是自由创作空间，不替代 Studio 的五步生产顺序。

## 14. Issue 10-12：视频、任务队列和 Assembly

Issue 10：单镜头视频候选生成

- 基于已选镜头图或参考图生成视频候选。
- 先做单镜头，不急着批量队列。
- 视频候选也进入 asset，再写 Studio ref。

Issue 11：轻量任务队列

- 多镜头生成。
- 状态追踪。
- 失败重试。
- 结果回填。
- 第一版不需要完整后台恢复和复杂暂停继续。

Issue 12：Assembly / 组装 / 预览 / 导出

- 镜头排序。
- 最终 take 选择。
- 基础时间线。
- 配音、音乐、字幕和最终导出视产品范围补齐。

Assembly 的目标是 LumenX 的最终选择和组装阶段，不是单个导出按钮。

## 15. 多集和系列能力

当前数据模型已经预留 `StudioSeries` 和 `StudioEpisode`，但第一阶段 UI 只暴露单项目单集。这个方向保持不变。

后续再迁移：

- `SeriesDetailPage`
- `EpisodeMiniList`
- 多集切换
- 跨集共享角色、场景、道具和 Style
- Reconcile
- 上一集回顾
- 系列级任务、资产、导出结果和生成历史

这些能力重要，但不应抢在 Cast variants 和 Storyboard 候选闭环之前。

## 16. LumenX 对照

后续 Studio 流程决策默认先参考 LumenX 已批准设计文档和源码，不再把 LumenX 已经回答过的问题逐项重新追问。

对照 LumenX 时，优先找等价行为，再决定当前项目的适配写法。只有当 LumenX 的实现依赖 Python 后端、OSS 路径、model catalog、不可见 prompt 拼接或其他当前项目明确不迁移的边界时，才进行本地改写。

主要依据：

- `/Users/a1/Desktop/无限画布项目汇总/lumenx/docs/design/r2v-workflow-v2.md`
  - R2V workflow 是 5 步：`Script · Style · Cast · Storyboard · Assembly`。
  - Cast 是本集视角，按角色、场景、道具三段平铺，每张卡展示缩略图、名称、出场次数和状态徽。
  - 角色参考图采用 single master sheet，`reference_sheet` 是新主字段。
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/docs/design/r2v-workflow-v3-unified.md`
  - Unified 5-step workflow 保留 Series / Cast / Reconcile 等已确认结构。
  - Assembly 是最终合成、混音和导出阶段。
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/Cast.tsx`
  - Cast 从 `currentProject.characters / scenes / props` 聚合基础资产，并根据是否有参考图显示 ready / pending。
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/cast/CastWorkbenchModal.tsx`
  - 单个角色、场景、道具可以进入 workbench 生成、迭代、选择参考图。
  - 生成数量为 1 / 2 / 4。
  - 变体 gallery 保留多次生成结果。
  - prompt 编辑、Style 应用和最终 prompt preview 是可见工作流。
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/AssetGrid.tsx`
  - 旧流程存在 `generateAssets` / `generateAll` 风格的全量基础资产生成入口。
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/models.py`
  - 图片变体记录 `prompt_used`，资产容器记录 selected id 和 variants。
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/assets.py`
  - 角色 reference sheet 生成成功后追加 variant，首次没有 selected 时设为 selected。
  - 场景和道具生成也写入 variants 并维护 selected。

迁移映射：

- LumenX 的 `reference_sheet` / `image_asset` 容器语义映射到当前项目统一的 `assetRefs`。
- LumenX 的媒体文件先进入当前项目本地素材库 asset，再写入 Studio 引用。
- LumenX 的 `prompt_used` 映射为 `StudioAssetRef.metadata.promptSnapshot`。
- LumenX 的 variants 映射为多个 `role: "candidate"` refs。
- LumenX 的 selected id 映射为唯一 `role: "selected"` ref。
- 当前可编辑生产输入保留在 `entity.prompt` 或 `shot.prompt`。
- LumenX 中 Style 可以拼接进生成；当前项目必须让 Style 参与生成的事实可见，并保存 `styleSnapshot` / `effectivePromptSnapshot`。
- LumenX 对 scene / prop 的单张重生成有自动 selected 行为；当前项目统一采用更保守规则：首次缺失项生成直接 selected，后续单项重生成默认 candidate，用户手动切换 selected。

## 17. 测试建议

优先测试 Module Interface 和用户可观察行为，不测底层 IndexedDB 细节。

- `studio-workspace-model.test.ts`
  - Cast selected 图派生。
  - candidate 数量。
  - 失败状态。
  - 顶部按钮文案。
  - Storyboard 生成前检查。
- `studio-generation.test.ts`
  - Cast 生成读取显性 prompt 和 Style。
  - 记录 effective prompt 快照。
  - 模型偏好 fallback。
  - asset 创建。
  - entity 回填。
  - 失败路径不覆盖候选。
  - 首次缺失项 selected，后续重生成 candidate。
- `studio-local.test.ts`
  - repository 写入角色、场景、道具 candidate ref。
  - candidate 设为 selected。
  - 旧 selected 降级 candidate。
- `asset-references.test.ts`
  - Studio 角色、场景、道具和镜头 candidate / selected image 都能阻止 asset 删除。
- 必要时补页面级测试：
  - 点击“生成缺失参考图”后任务状态和候选展示。
  - 失败时提示且不清空旧候选。

## 18. 实践守则

- 以 LumenX 五步生产行为为产品真相。
- 先补 Cast variants，再做 Storyboard 候选，再做视频和 Assembly。
- Style 必须影响 Cast / Storyboard，但必须以可见 effective prompt 或生成快照体现。
- 每次生成出的媒体都先成为 asset，再写 Studio 或 Canvas 引用。
- 未选候选不是缓存，不应自动丢弃。
- AI 失败不能阻断手工编辑。
- 页面只做展示、触发和局部 UI 状态。
- prompt 初稿生成、Style 参与、relay 调用、asset 创建、repository 回填和 variants 规则要放进可测试的 Module Interface。
- 能复用当前项目已有服务就复用，不复制 LumenX 的 API 假设。
- LumenX 组件做适配性移植，保留工作流、交互结构和视觉质感，但替换路由、状态、存储、模型和服务边界。
- Studio 流程细节优先查 LumenX 已批准设计文档和源码；只有源项目做法与当前项目边界冲突时再单独决策。
- 不为假想的完整 Studio 后端提前设计复杂抽象。
- 不让完整视频队列、Assembly 导出、多集 Reconcile 抢在 Cast 和 Storyboard 基础闭环之前。
