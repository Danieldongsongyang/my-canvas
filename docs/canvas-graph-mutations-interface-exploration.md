# Canvas Graph Mutations 阶段 Interface 探索

> 日期：2026-07-07
> 议题：是否统一 `Canvas Graph Mutations` 的阶段 `Interface`
> 结论强度：Worth exploring，但只建议保守推进

## 1. 结论

`Canvas Graph Mutations` 值得继续 deepen，但现在不建议直接做一个全局的 `applyCanvasGraphMutation(state, mutation)` 大一统入口。

更稳的判断是：

1. 这个 `Module` 的依赖是 in-process，天然适合通过纯函数 deepen。
2. 现有 `Module` 已经有真实 depth：删除它后，上传替换、删除节点、批量图 root/child 修复、图片生成成功/失败回填都会重新散回 hook 和页面。
3. 但它当前的真实调用点并不多，强行统一成一个大 `Interface` 可能只是把几个清楚的函数换成一个臃肿 union。
4. 真正值得探索的不是“把函数数量从 6 个变 1 个”，而是把重复出现的图动作规则收进同一个 graph mutation seam。

推荐方向：

- 保留 `canvas-graph-mutations.ts` 作为纯 in-process `Module`。
- 不急着删除现有具名函数。
- 先给它补足生成阶段测试。
- 第一刀优先收拢“创建连接任务节点 / 工作流任务节点”这一类重复图动作。
- 等 `Canvas Generation Orchestration` 覆盖更多媒体分支后，再考虑统一 image generation stage `Interface`。

## 2. 当前 Module 现状

当前 seam：

- `web/src/app/(user)/canvas/utils/canvas-graph-mutations.ts`

当前测试：

- `web/src/app/(user)/canvas/utils/canvas-graph-mutations.test.ts`

当前外部 `Interface` 主要有三组：

| 分组 | 函数 | 当前 caller |
| --- | --- | --- |
| 上传 / 替换媒体 | `applyUploadedMediaToCanvasGraph` | `use-canvas-file-nodes.ts` |
| 删除节点 | `deleteCanvasNodesFromGraph` | `use-canvas-node-deletion.ts` |
| 图片生成阶段 | `applyCanvasImageGenerationStart` / `applyCanvasImageGenerationSuccess` / `applyCanvasImageGenerationError` / `completeCanvasImageGeneration` | `canvas-generation-orchestration.ts` |

这些函数都不访问 DOM、不读写 storage、不请求模型、不依赖 Zustand。它们只接收 graph state，返回新的 graph state 和少量 UI state，所以依赖分类是 in-process。

这点很重要：这里不需要引入 `Adapter`。如果为了“可测试”再造一层 port，会违反 “one adapter means a hypothetical seam”。

## 3. 删除测试

如果删除 `Canvas Graph Mutations`，复杂度会回流到这些位置：

- `use-canvas-file-nodes.ts`：上传替换节点时重新处理位置、metadata 清理、selection、dialog。
- `use-canvas-node-deletion.ts`：删除节点时重新处理 batch root / child、连接清理、临时 UI 引用清理。
- `canvas-generation-orchestration.ts`：图片生成开始、成功、失败、全部失败时重新处理 root / child / primary image。
- `canvas-image-generation.ts`：Config / Image / 空 Image 分支里已经存在一份尚未收拢的相似逻辑。

所以这个 `Module` 不是浅 pass-through。它有明显 locality。

但反过来，如果只把现有多个函数包成一个 `applyCanvasGraphMutation`，caller 仍要知道：

- 什么阶段先调用。
- 成功时传 rootId 还是 targetId。
- 失败时标 target 还是 root。
- 什么时候 complete。
- UI state 该如何落回 React setters。

这种统一不会自动增加 depth，只会改变函数外观。

## 4. 现有摩擦

### 4.1 图片生成阶段外泄

`canvas-generation-orchestration.ts` 现在依次调用：

- `applyCanvasImageGenerationStart`
- `applyCanvasImageGenerationSuccess`
- `applyCanvasImageGenerationError`
- `completeCanvasImageGeneration`

这比散在 hook 里好很多，因为 orchestration 已经是生成流程 owner。

摩擦在于：graph mutation `Interface` 暴露了“开始、单张成功、单张失败、整体完成”这些阶段。caller 必须知道阶段顺序。

但这里也有一个反向信号：只有 `Canvas Generation Orchestration` 在调用这些阶段函数。也就是说阶段知识已经没有扩散到很多 caller。现在如果强行统一阶段，收益可能没有看起来那么大。

真正的问题是 `canvas-image-generation.ts` 里 Config / Image / 空 Image 分支还没有完全走 `Canvas Generation Orchestration`，那里仍然手写 root node、child nodes、connections、success/error 回填。

因此，图片生成阶段的最佳推进顺序是：

1. 先补 `canvas-graph-mutations.ts` 对 generation stage 的直接测试。
2. 再让 `canvas-image-generation.ts` 的剩余分支复用同一套 graph mutation 规则。
3. 等只有 orchestration 在协调生成流程后，再评估是否把 stage functions 收成一个 generation event `Interface`。

### 4.2 删除 UI state 太宽

`CanvasDeletionUiState` 包含：

- selection
- hovered node
- toolbar node
- dialog node
- editing node
- info / crop / mask / split / upscale / angle / preview / running node
- context menu

这让 `deleteCanvasNodesFromGraph` 的 `Interface` 看起来偏宽。

但这里不能简单说它错。删除节点后清理悬挂 UI 引用是很有 locality 的规则，如果留在 hook 里，每新增一个面板都可能忘记清理。

更好的方向不是把它移回 hook，而是把它命名成更明确的 `transientUiState`，让 caller 知道这是“删除 graph 后需要被修剪的 transient references”，不是 graph 本体。

短期不建议为了缩小 `Interface` 把 UI 清理拆出去。拆出去会丢 locality。

### 4.3 创建连接任务节点的规则重复

这部分是最值得第一刀探索的地方。

重复模式出现在：

- `use-text-node-handlers.ts`
- `use-image-node-handlers.ts`
- `use-canvas-file-nodes.ts` 的 `createWorkflowFromFile`
- `use-canvas-image-actions.ts` 的 crop / split / upscale / mask edit / angle 等动作
- `canvas-client-page.tsx` 的 assistant / asset 插入

重复的规则包括：

- 在 source node 右侧创建 child node。
- 创建 source -> child connection。
- patch source metadata，例如 `linkedOutputNodeId` 或上传替换后的 metadata。
- selection 选中新节点或 source。
- selected connection 清空。
- dialog 打开或关闭。

这些动作不全都应该进 graph mutation `Module`，但其中“新增节点 + 新增连接 + source patch + UI selection result”明显是 graph rule，而不是 UI rule。

这比“把现有函数统一成一个入口”更有 leverage。

## 5. 三种设计方向

### 方向 A：保持现状，只补测试

做法：

- 保留现有所有函数。
- 给 generation stage 函数补直接测试。
- 不新增统一 `Interface`。

优点：

- 风险最低。
- 不制造抽象。
- 当前 caller 数量少，足够可读。

缺点：

- `canvas-image-generation.ts` 里残留的重复图规则不会改善。
- 连接任务节点的重复模式不会改善。
- 未来新增 image generation stage 时，函数数量可能继续增长。

适合情况：

- 如果近期重点是继续 deepen `Canvas Generation Orchestration`，这个方向可以先作为防守动作。

### 方向 B：大一统 `applyCanvasGraphMutation`

做法：

```ts
applyCanvasGraphMutation(state, mutation)
```

`mutation` 覆盖 upload、delete、generation start、generation success、generation error、generation complete、linked task creation。

优点：

- 外部只有一个 graph mutation `Interface`。
- 测试看起来可以完全围绕一个 seam 写。

缺点：

- 很容易变成巨大的 union。
- caller 仍然要知道很多 mutation variant。
- 不同动作的参数差异很大，`Interface` 可能比现状更难学。
- `Canvas Graph Mutations` 会变成“什么都能塞”的地方。

判断：

- 当前不推荐。
- 这更像最终可能收敛出的形态，不适合作为第一刀。

### 方向 C：按图动作家族收拢

做法：

保留当前具名函数，但新增或收拢几个更深的动作家族：

- 上传 / 替换媒体：继续由 `applyUploadedMediaToCanvasGraph` 承载。
- 删除节点：继续由 `deleteCanvasNodesFromGraph` 承载。
- 图片生成阶段：短期保留 stage functions，等 orchestration 稳定后再收拢。
- 连接任务节点：新增一个专门的 graph mutation，承载“source patch + child nodes + connections + UI result”。

优点：

- 不把不相干动作塞进一个巨型 `Interface`。
- 能先吃到重复图动作的 locality。
- 每个动作家族仍然可以通过自己的 `Interface` 测试。
- 对当前代码改动面可控。

缺点：

- 外部仍有多个函数。
- 需要判断哪些 UI state 属于 graph mutation result，哪些留给 hook。

判断：

- 推荐。

## 6. 建议第一刀

建议第一刀不是“统一所有阶段”，而是做一个小而真实的 deepening：

### 6.1 先补 generation stage 测试

当前 `canvas-graph-mutations.test.ts` 主要覆盖：

- 上传创建节点。
- 上传替换节点。
- 删除普通节点。
- 删除 batch root。
- 删除 batch child 并修复 root。

还缺少直接覆盖：

- `applyCanvasImageGenerationStart`
- `applyCanvasImageGenerationSuccess`
- `applyCanvasImageGenerationError`
- `completeCanvasImageGeneration`

这些测试应该先加，作为后续替换 `Interface` 的安全网。

### 6.2 新增连接任务节点 mutation

第一刀可以探索一个更小的 graph mutation，而不是全局 mutation：

```ts
applyCanvasLinkedNodeCreation(...)
```

它不应该知道 AI config，也不应该请求模型或上传媒体。

它只负责：

- patch source node。
- append one or many child nodes。
- append source -> child connections。
- 返回 selection / dialog / selected connection 的 UI result。

适合迁移的第一批 caller：

- `use-text-node-handlers.ts` 的 `addWorkflowNode`
- `use-image-node-handlers.ts` 的 `addWorkflowNode`
- `use-canvas-file-nodes.ts` 的 `createWorkflowFromFile`

暂不迁移：

- `use-canvas-image-actions.ts` 里的 mask edit / angle，因为它们混合了请求、running 状态和错误回填。
- `canvas-client-page.tsx` 的 assistant / asset 插入，因为有素材 materialize 和页面上下文。
- `use-canvas-connections.ts` 的拖拽连接，因为它有 DOM 交互和 pending connection state。

### 6.3 再迁移剩余图片生成分支

等 `Canvas Generation Orchestration` 继续覆盖 Config / Image / 空 Image 节点生成后，再回来判断：

- 是否还需要暴露四个 generation stage functions。
- 是否可以收成 `applyCanvasImageGenerationEvent`。
- 或者这些函数干脆成为 orchestration 内部 helper，不作为 graph mutation 的公共 `Interface`。

## 7. 暂不建议做的事

### 7.1 不建议把所有 `setNodes` 都替换成 graph mutation

很多 `setNodes` 是 UI-local 的直接编辑，例如：

- 拖拽移动节点。
- resize。
- 改 prompt。
- 改 font size。
- toggle free resize。
- toggle batch expanded。

这些不一定需要进入 `Canvas Graph Mutations`。它们的规则简单，caller 也没有明显复杂度负担。硬收进去会让 `Module` 变浅。

### 7.2 不建议把 DOM 交互放进 graph mutation

例如 connection drag、selection drag、viewport 等，仍应留在 hook 作为 UI `Adapter`。Graph mutation `Module` 应只接收已经被解释过的 graph action。

### 7.3 不建议现在设计跨媒体生成总入口

video / audio / text generation 还在各自 hook-adjacent implementation 中。统一 graph mutation 不能替代 generation orchestration。否则会让 graph mutation 同时知道 graph、media、request、model config，seam 会变脏。

## 8. 风险

### 风险 1：统一 Interface 变成“动作垃圾桶”

如果 `CanvasGraphMutation` union 不断增加 variant，caller 仍要学习大量字段，`Interface` 会变宽。

规避：

- 按动作家族收拢，不直接大一统。
- 每个新增 mutation 必须通过删除测试证明 locality。

### 风险 2：UI state 泄漏继续扩大

Graph mutation 返回 UI result 是有价值的，但如果把所有面板状态都塞进去，会让 graph `Module` 看起来像 UI `Module`。

规避：

- 对 UI state 做命名区分：`graphState`、`selectionState`、`transientUiState`。
- 只处理“节点或连接删除后必须修剪”的 transient reference。
- 不处理 modal open/close 的普通 UI flow。

### 风险 3：和 Canvas Generation Orchestration 争夺 owner

Graph mutation 只应该负责图状态变化。生成流程的 owner 应该是 `Canvas Generation Orchestration`。

规避：

- 请求、上传、retry source、reference hydrate 留在 generation orchestration / media Module。
- Graph mutation 只处理 nodes / connections / graph-related UI result。

## 9. 推荐实施顺序

如果后续要实施，我建议拆成这几个小 issue：

1. 为 generation stage functions 补 `canvas-graph-mutations.test.ts`。
2. 引入共享类型：`CanvasGraphState`、`CanvasGraphSelectionState`、`CanvasGraphMutationResult`。
3. 新增 `applyCanvasLinkedNodeCreation`，迁移 `use-text-node-handlers.ts` 和 `use-image-node-handlers.ts` 的重复 `addWorkflowNode`。
4. 迁移 `use-canvas-file-nodes.ts` 的 `createWorkflowFromFile`。
5. 再评估 `canvas-image-generation.ts` 剩余分支是否先进入 `Canvas Generation Orchestration`，而不是直接进入 graph mutation。
6. 只有当 generation stage 调用点继续增加时，再考虑 `applyCanvasImageGenerationEvent`。

## 10. 最终判断

这个议题值得探索，但不该按“统一所有阶段 Interface”直接开大改。

真正有 leverage 的路线是：

- 保住现有纯 graph mutation seam。
- 让测试先覆盖所有已经公开的图规则。
- 用删除测试挑出重复出现的图动作家族。
- 先收拢连接任务节点创建。
- 等 generation orchestration 更完整后，再决定图片生成阶段是否需要统一。

因此这个候选的推荐强度仍是 `Worth exploring`，不是 `Strong`。

它不是不能做，而是第一刀要非常小；做对了会增加 locality，做大了会制造一个浅而宽的万能 graph mutation `Interface`。
