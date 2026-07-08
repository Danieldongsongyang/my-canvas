# Studio Generation Adapter 内部 Implementation 探索

> 探索日期：2026-07-07
> 范围：`web/src/services/api/studio-generation.ts` 及其直接 caller、测试、相关 ADR。
> 视角：使用 `codebase-design` 词汇评估 `Module`、`Interface`、`Implementation`、`Seam`、`Adapter`、`Depth`、`Leverage`、`Locality`。

## 1. 结论

`Studio Generation Adapter` 当前不是一个失败的 shallow `Module`。它的外部 `Interface` 基本贴近 Studio 用户能理解的 workflow action：解析剧本、生成 Cast 参考图、选择候选、更新 prompt、生成 Storyboard 镜头候选。这些 action 背后隐藏了 relay 请求、结构化 JSON 校验、asset 创建、candidate/selected 规则、显式引用解析、repository 写入和失败标记，`Depth` 是成立的。

所以这次探索的结论不是“重做外部 `Interface`”，而是：

- 保持 `web/src/services/api/studio-generation.ts` 作为外部 `Seam`。
- 保持页面和测试继续通过现有 workflow action 调用。
- 只考虑把内部 `Implementation` 拆成少量 private `Module`，改善阅读路径和 AI 可导航性。
- 不要为了文件行数拆出一堆 shallow `Module`。

推荐强度仍然是 `Speculative`：收益真实，但不是当前最高杠杆点。它主要改善 `Locality` 和导航，不像 Canvas generation 那样马上缩小多个 caller 的行为面。

## 2. ADR 约束

这个议题必须和现有 ADR 对齐，不能重新引入已排除的方向。

- ADR-0017：LumenX 生成逻辑移植为前端 TypeScript 适配层。`Studio Generation Adapter` 应继续留在当前前端，底层复用现有用户态 AI relay，不迁回 LumenX Python 后端，也不让 `mange-backend` 拥有 Studio 业务流程。
- ADR-0013：Studio 第一阶段项目数据本地优先。Studio 项目、剧本、分镜、角色、场景、道具和镜头状态继续通过 `Studio Repository` 保存。
- ADR-0016：Studio MVP 要跑通真实 relay 最小生成闭环。生成失败不能破坏已有手工数据，AI 结果必须可继续手动编辑。
- ADR-0018：Studio 模型候选来自当前项目配置。生成适配层使用 caller 已解析好的当前模型，不引入 LumenX model catalog。
- ADR-0019：生成和导入成功即进入素材库。Studio 生成结果先创建 asset，再把 asset id 写入 Studio 引用关系。
- ADR-0020：Studio 候选引用保留到显式移除。candidate 不因为未选中而自动删除。
- ADR-0024：Studio 镜头使用显式引用而不是名称匹配。Storyboard 生成根据 `StudioShot.metadata.references` 解析 Cast selected reference images。

## 3. 当前外部 Interface

`studio-generation.ts` 现在暴露的 `Interface` 可以分成 6 组。

| 组 | 公开入口 | Caller | 判断 |
| --- | --- | --- | --- |
| 剧本解析 | `requestStudioChatCompletion`、`parseScript`、`normalizeScriptStructure`、`parseAndApplyScript` | Studio 页面、测试、relay 请求测试 | 有真实 workflow 意义；`normalizeScriptStructure` 也服务手工结构草稿保存 |
| Cast 生成 | `generateCastReferences` | Studio 页面、测试 | 深；隐藏 prompt、请求、存图、asset、refs、repository、失败标记 |
| Cast 引用操作 | `selectCastAssetReference`、`removeCastCandidateReference`、`addCastAssetReference`、`updateCastEntityPrompt` | Studio 页面、测试 | 小而稳定；大多是用户动作 |
| Shot 编辑 | `updateShotPrompt`、`updateShotReferences` | Studio 页面、测试 | 小；显式引用校验留在适配层 |
| Storyboard 生成 | `generateStoryboardShotImages`、`generateMissingStoryboardShotImages` | Studio 页面、测试 | 深；隐藏引用解析、requestEdit/requestGeneration、asset-first 写入、失败结果 |
| Prompt 预览 | `buildCastReferencePrompt` | `CastWorkbenchModal`、测试间接覆盖 | 有轻微泄漏：UI 需要复用生成 prompt 规则 |

外部 caller 主要在 `web/src/app/(user)/studio/[seriesId]/page.tsx`。页面传入 `repository`、`seriesId`、`episodeId`、`config`、`assets` 和 `addAsset`，然后只负责 UI state 和提示。这是好信号：页面没有重新实现生成流程规则。

## 4. 当前内部 Implementation 地图

`web/src/services/api/studio-generation.ts` 约 1191 行，内部大致是这些段落：

| 行段 | 内部职责 |
| --- | --- |
| `13-190` | 公开类型、Adapter 类型、workflow input/result 类型 |
| `198-228` | zod schema：解析 AI 返回结构 |
| `238-264` | chat relay request adapter，含 `response_format` fallback |
| `266-321` | 剧本解析、结构 normalize、写入 episode |
| `324-430` | Cast 批量生成 workflow |
| `432-495` | Cast selected/candidate/prompt 操作 |
| `497-532` | Shot prompt / explicit references 操作 |
| `534-614` | 单个 Storyboard shot 图片候选生成 |
| `645-699` | Storyboard 批量生成、skip、失败标记 |
| `725-757` | 图像模型、默认图片请求、默认存图、Style snapshot |
| `759-826` | target selection、Cast entity 查找、shot references 校验 |
| `828-859` | Cast / Storyboard generation snapshot 和 effective prompt |
| `871-895` | Storyboard failed state 写入 |
| `897-933` | Cast prompt、negative prompt、aspect ratio、label |
| `935-1037` | generated refs 追加、generation image 状态、selected/candidate 变体 |
| `1039-1191` | 错误读取、chat request、JSON 提取、Studio 类型转换、解析引用 |

这个文件不是“同一层代码太多”，而是多个内部 `Module` 的 `Implementation` 放在一个文件里。外部 `Seam` 可以不动，内部可以更清楚。

## 5. 删除测试

如果删除 `Studio Generation Adapter`，复杂度不会消失，会重新扩散到：

- Studio 页面：需要自己知道 relay 请求、结构化 JSON、asset-first、candidate/selected、失败状态。
- `Studio Repository` caller：会直接拼 episode patch，容易绕过生成不变量。
- 测试：会退回到 UI 或大量内部 helper 测试，失去“Interface 是测试表面”的好处。

所以它在 earning its keep。

如果删除某些内部 helper，例如 `buildCastGenerationSnapshot`、`appendGeneratedShotImageRefs`、`selectStoryboardShotTargets`，复杂度会回到同一个文件里的 workflow 函数，而不是扩散到多个 caller。这说明这些 helper 本身还不是独立外部 `Seam`，更适合作为 private `Module`，不要急着公开。

## 6. 真实摩擦

### 6.1 Prompt / snapshot 规则开始泄漏到 UI

`CastWorkbenchModal` 导入 `buildCastReferencePrompt` 来预览 effective prompt，然后自己拼接 `Style baseline`。而生成流程内部通过 `buildCastGenerationSnapshot` 做类似拼接。

这不是严重 bug，但它说明 prompt 组装已经是页面也需要读的语义。如果后续 Cast prompt 规则、Style 拼接、negative prompt 或 aspect ratio 改动，UI 预览和真实生成可能漂移。

这个摩擦适合通过一个纯 in-process `Module` 解决：把 Cast / Storyboard prompt snapshot 规则集中，UI 预览和 workflow 都读取同一份语义。这个 `Module` 可以保持 private 或只暴露给 Studio 工作区内部，不需要扩大整体 `Studio Generation Adapter` 的外部 `Interface`。

### 6.2 Cast 与 Storyboard 的 asset-first 写入骨架重复

`generateCastReferences` 和 `generateStoryboardShotImages` 都包含类似步骤：

1. 调用图片生成 requester。
2. 调用 `storeImage`。
3. 调用 `addAsset` 创建素材库 asset。
4. 构造 `StudioAssetRef`。
5. 写入 candidate/selected 引用关系。
6. 写入 generation snapshot。

两者 metadata 字段不同，这是领域差异，不应该被强行抹平。但“生成图进入 asset，再形成 Studio 引用”这个骨架来自 ADR-0019 和 ADR-0020，值得集中一点，避免未来新增视频候选、上传候选或从素材库加入候选时重复散开。

### 6.3 Episode 读取和 patch 模式重复

多个 action 都重复：

- `repository.getSeries(seriesId)`
- 找 `episodeId`
- 找 Cast entity 或 shot
- 不存在时抛 `StudioGenerationError`
- 构造 patch
- `repository.updateEpisode(...)`

这种重复还没有严重到必须立刻抽。它的好处是每个 workflow 函数很直观；坏处是错误文本、查找逻辑和 patch 形状会随着功能增长越来越散。

这类代码可以晚一点处理。过早抽成通用“episode command helper”容易制造 shallow `Module`。

### 6.4 Relay request 与 workflow action 混在一个文件

`requestStudioChatCompletion` 和 `sendChatCompletion` 是 request `Adapter` 的 implementation；`parseAndApplyScript`、`generateCastReferences`、`generateStoryboardShotImages` 是 workflow implementation。它们在一个文件里不是功能错误，但阅读时上下文切换比较重。

不过这里要谨慎：`requestStudioChatCompletion` 已被 `relay-requests.test.ts` 直接引用，说明它已经是外部测试表面的一部分。要拆也应保持现有 import path 和行为。

### 6.5 测试表面总体健康，但文件越来越像总账本

`studio-generation.test.ts` 约 1193 行，测试直接穿过 workflow `Interface`，注入 in-memory repository、fake request、fake storage、fake time。这是好事。

测试覆盖的关键不变量包括：

- AI 解析结果能 normalize 成 Studio episode 字段。
- 解析失败不覆盖已有手工数据。
- shot prompt 和 explicit references 可独立更新。
- Cast 生成通过 asset-first 写入 selected/candidate refs。
- 调用方解析好的模型优先，不重新套用 stored Studio preference。
- candidate/selected 唯一性和显式移除规则。
- Storyboard 使用 Cast selected reference images。
- 无 reference 默认阻止，显式允许才裸 prompt 生成。
- 批量 Storyboard 能跳过缺少显式引用或缺少 selected image 的 shot，并记录失败。

后续拆内部 `Implementation` 时，应优先保持这些测试继续穿过外部 `Interface`。不要把测试重心迁到每个 private helper，否则会把 implementation 锁死。

## 7. 可考虑的 private Module

这里说的 `Module` 都是内部组织建议，不是新的外部 `Seam`。

### 7.1 Studio Script Structure Module

可能收纳：

- zod schema
- fenced JSON / JSON object 提取
- `normalizeScriptStructure`
- `toStudioCharacter` / `toStudioScene` / `toStudioProp`
- `toStudioShot`
- AI references 名称或 id 到 explicit references 的转换
- 保留 previous episode 中手工 prompt / references 的规则

价值：

- 纯 in-process，容易测试。
- 规则和 relay request 分离。
- 手工结构草稿和 AI 解析共用同一语义，符合当前实现。

风险：

- `normalizeScriptStructure` 当前是外部入口之一，移动后需要保持 re-export 或原路径可用。

### 7.2 Studio Generation Prompt Snapshot Module

可能收纳：

- `readStudioArtDirection`
- `buildCastGenerationSnapshot`
- `buildStoryboardGenerationSnapshot`
- `buildCastReferencePrompt`
- `castKindNegativePrompt`
- `castKindAspectRatio`
- `readShotPrompt`
- `buildShotPromptFallback`

价值：

- 直接解决 UI prompt preview 和真实生成可能漂移的问题。
- Cast / Storyboard 都需要 snapshot。
- 可以让 “Studio 基础资产生产 prompt” 和 “Studio 镜头生产 prompt” 的规则更有 `Locality`。

风险：

- 如果把它做成太通用的 prompt engine，会变 shallow。它应该只表达 Studio 当前 workflow 需要的 prompt snapshot。

### 7.3 Studio Generated Image Materialization Module

可能收纳：

- generated image → `storeImage`
- stored image → asset input
- asset id → `StudioAssetRef`
- Cast metadata / Storyboard metadata 的共同字段
- batch id、generatedAt、model、style、effectivePrompt 等 snapshot 字段组织

价值：

- ADR-0019 和 ADR-0020 的 asset-first 规则集中。
- 未来加入视频候选、上传候选或素材库复用时，有更清楚的落点。
- Cast 和 Storyboard workflow 减少重复的 asset/ref 拼装。

风险：

- Cast 和 Storyboard metadata 差异真实存在。不要强行抽成一个万能 formatter；可以保留两个明确的内部函数，藏在同一个 private `Module` 里。

### 7.4 Studio Episode Mutation Helpers

可能收纳：

- load series + episode
- get Cast entity
- patch Cast entity
- patch shot
- mark failed
- select batch targets

价值：

- 减少重复查找和错误处理。
- 更新 episode patch 的规则更集中。

风险：

- 这块现在重复不算太痛。
- 如果抽象成通用 repository helper，容易变成 shallow pass-through。
- 只有在新增 workflow 后重复继续增长，才值得动。

### 7.5 Studio Relay Request Adapter

可能收纳：

- `requestStudioChatCompletion`
- `sendChatCompletion`
- `isUnsupportedResponseFormatError`
- relay request error wrapping

价值：

- workflow 文件少一个请求细节段落。
- request 行为和 Studio workflow 规则分开。

风险：

- `requestStudioChatCompletion` 已经是外部测试表面的一部分。
- 拆文件要保持现有 import path，避免 caller 改动。

## 8. 不建议做的方向

### 8.1 不建议拆外部 Interface

不要让页面改成分别 import `studio-cast-generation`、`studio-storyboard-generation`、`studio-script-parser` 等多个 workflow 文件。那会让页面重新知道 Studio 生成适配层的内部组织，降低 `Depth`。

更好的形状是：`studio-generation.ts` 继续作为 façade，导出已有 workflow action；内部 import private `Module`。

### 8.2 不建议做通用 workflow engine

Cast 和 Storyboard 都有 request/store/asset/ref/update 的形状，但差异也很关键：target 类型、prompt、aspect ratio、reference images、skip reason、metadata 和 failure semantics 都不同。通用 engine 很容易把调用方参数变复杂，让 `Interface` 接近 `Implementation`。

### 8.3 不建议把 Studio 生成逻辑迁到后端

这会直接冲突 ADR-0013 和 ADR-0017。当前议题只讨论当前前端内的 TypeScript `Implementation` 组织。

### 8.4 不建议新增 Studio 自有媒体存储

生成结果必须继续走本地素材库 asset。Studio 只保存资产引用，不另建独立媒体体系。

### 8.5 不建议按行数机械拆文件

如果一个 private file 只是把 30 行 helper 搬走，caller 还要学同样多的参数和顺序，那只是浅层移动。拆分应该围绕真实语义：script structure、prompt snapshot、generated image materialization。

## 9. 推荐探索顺序

如果后续要真正实施，我建议分三步，小步走。

### Step 1：先抽 prompt snapshot

原因：

- 当前已经有 UI 预览和真实生成两处使用 Cast prompt 规则。
- 规则纯，风险低。
- 能直接增加 `Locality`。
- 不需要改变外部 workflow `Interface`。

验收：

- `CastWorkbenchModal` 不再自己拼一半 effective prompt。
- `generateCastReferences` 和 UI 预览读取同一份 prompt snapshot 规则。
- `studio-generation.test.ts` 继续通过。

### Step 2：再抽 script structure

原因：

- AI 解析和手工结构草稿保存共用同一 normalize 规则。
- zod schema、id 保留、shot references 转换都比较纯。
- 从 workflow 文件中移走后，`parseAndApplyScript` 会更像 workflow action。

验收：

- `normalizeScriptStructure` 原 import path 仍可用。
- 解析失败、保留手工 prompt / references 的测试继续通过。

### Step 3：最后观察是否需要抽 generated image materialization

原因：

- 它牵涉 asset metadata 和 Studio refs，收益大但风险也高。
- 适合等 Cast / Storyboard 再增加视频候选、上传候选或素材库候选后再做。

验收：

- Cast 和 Storyboard 生成仍然先创建 asset，再写 Studio refs。
- candidate/selected 规则仍由 `studio-image-variants.ts` 承载。
- 不引入 Studio 自有媒体存储。

## 10. 测试策略

实现任何拆分时，主测试表面仍应是 `Studio Generation Adapter` 的外部 `Interface`。

建议保留并优先运行：

```bash
cd /Users/a1/Desktop/my-canvas/web
npm test -- studio-generation
```

如果移动 TypeScript 类型或 re-export，再运行：

```bash
cd /Users/a1/Desktop/my-canvas/web
npm run typecheck
```

只有当某个 private `Module` 承载了稳定、纯粹、跨多个 workflow 复用的语义时，才补少量直接测试。不要为了每个 helper 都写测试。

## 11. 最终判断

这个议题可以做，但不要优先做成“架构大改”。

我会把它定义为：

> 保持 `Studio Generation Adapter` 的外部 `Seam` 不变，把 prompt snapshot 和 script structure 这两个最稳定的内部语义先移成 private deep `Module`，让 workflow action 更像编排，测试继续穿过原 `Interface`。

如果只做一件事，先做 `Studio Generation Prompt Snapshot Module`。它最小、最纯、最能防止 UI 预览和真实生成漂移。
