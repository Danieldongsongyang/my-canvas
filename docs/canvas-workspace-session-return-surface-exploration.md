# Canvas Workspace Session 返回面探索

> 日期：2026-07-07
> 范围：`web/src/app/(user)/canvas/[id]/workspace-session/use-canvas-workspace-session.ts` 与它在 `canvas-client-page.tsx` 中的消费方式。
> 视角：本文使用 `codebase-design` 词汇，把 `Canvas Workspace Session` 看成一个有 `Interface`、`Implementation` 和 `Seam` 的 `Module`。

## 1. 结论

`Canvas Workspace Session` 现在不是一个无价值的浅 `Module`。删除它以后，`canvas-client-page.tsx` 会重新承担 viewport、history、selection、connections、groups、files、clipboard、project persistence 的 hook wiring，所以它已经有实际 `Leverage`。

但它的 `Interface` 仍然很宽。当前 caller 需要理解大量内部 state、refs、setter 和 handler，尤其是：

- 图数据：`nodes`、`setNodes`、`connections`、`setConnections`、`groups`、`setGroups`
- 会话数据：`chatSessions`、`setChatSessions`、`activeChatId`、`setActiveChatId`
- 选择和连接：`selectedNodeIds`、`setSelectedNodeIds`、`selectedConnectionId`、`setSelectedConnectionId`
- 视口：`viewport`、`setViewport`、`size`、`screenToCanvas`
- 内部 refs：`nodesRef`、`connectionsRef`、`selectedNodeIdsRef`
- 编辑命令：upload、clipboard、history、group、connection、drag 等

所以它当前更像一个工作区 hook composition `Module`，不是最终的深业务 `Module`。要缩小返回面，不能只把返回对象改成 `state / commands / refs` 这种机械分组；那只会给宽 `Interface` 换皮。真正有价值的 deepening 是把页面中重复出现的“工作区动作”收进 session 的 `Implementation`，让 caller 少碰 raw setter。

推荐结论：

1. 先不要把所有 setter 一次性藏掉。
2. 先把高重复、低领域争议的工作区动作收成 commands。
3. `Canvas Generation Orchestration`、`Canvas Node Semantics`、`Canvas Graph Mutations` 还没进一步稳定前，保留部分 raw graph setter 是现实选择。
4. 这个候选确实有价值，但推荐强度保持 `Speculative`，因为它依赖下游几个更深 `Module` 的形状。

## 2. 当前 Module 形状

`Canvas Workspace Session` 的 `Seam` 在：

```text
web/src/app/(user)/canvas/[id]/workspace-session/use-canvas-workspace-session.ts
```

它的 `Implementation` 组合了这些内部 `Module`：

- `useCanvasProjectState`
- `useCanvasProjectPersistence`
- `useCanvasViewport`
- `useLatestCanvasRefs`
- `useCanvasConnections`
- `useCanvasHistory`
- `useCanvasSelectionDrag`
- `useCanvasGroups`
- `useCanvasFileNodes`
- `useCanvasClipboard`

当前只有一个直接 caller：

```text
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

这点很关键：因为只有一个 caller，所以“为了多个 caller 复用而建立新 `Seam`”不是强理由。这里的理由只能是 `Locality` 和 AI 可导航性：让工作区动作集中，减少页面知道内部 state shape 的数量。

## 3. 返回面盘点

当前返回面可以粗分为 7 类。

### 3.1 Project graph state

返回项：

```text
nodes, setNodes
connections, setConnections
groups, setGroups
projectLoaded
```

消费方式：

- 渲染 `CanvasNode`、`ConnectionPath`、`Minimap`、group bounding box。
- 页面内创建节点、复制节点、清空画布、插入素材、插入助手内容。
- 外部 hook 继续拿 setter 做图变更，例如 `useCanvasGeneration`、`useCanvasImageActions`、`useTextNodeHandlers`、`useImageNodeHandlers`。

判断：

这部分目前最难收。原因不是 session 不该藏它，而是图变更规则还没有完全统一到一个 `Canvas Graph Mutations Module` 或 `Canvas Generation Orchestration Module` 里。强行隐藏 `setNodes/setConnections` 会迫使 session 暴露一堆小命令，可能只是把 setter 变成浅命令。

### 3.2 Assistant/session state

返回项：

```text
chatSessions, setChatSessions
activeChatId, setActiveChatId
```

消费方式：

- 传给 `CanvasAssistantPanel`。
- `handleAssistantSessionsChange` 直接调用两个 setter。
- 清理媒体时需要把 `chatSessions` 作为 used data 输入。

判断：

短期可以保留。助手面板本身就是页面 UI surface 的一部分，session 暂时不需要拥有助手业务行为。可以考虑后续提供：

```text
setAssistantSessions(sessions, activeId)
```

但收益不大。

### 3.3 Canvas view state

返回项：

```text
backgroundMode, setBackgroundMode
showImageInfo, setShowImageInfo
viewport, setViewport
size
screenToCanvas
getCanvasCenter
visibleNodes
resetViewport
setZoomScale
```

消费方式：

- `InfiniteCanvas`、`CanvasToolbar`、`CanvasZoomControls`、`Minimap` 直接使用。
- 页面包装了 `resetViewport` 和 `setZoomScale`，用于同时关闭菜单。
- 插入节点、素材、助手内容时依赖 `screenToCanvas` 和 `size` 算中心点。

判断：

这里已经有一定 `Depth`：viewport 内部监听容器尺寸、计算 visible nodes、坐标转换。问题是 caller 还要知道“变更 viewport 时顺手关菜单”。这类 UI side effect 很适合变成 session command，因为它不是领域规则，只是工作区交互规则。

### 3.4 Selection / connection state

返回项：

```text
selectedNodeIds, setSelectedNodeIds
hoveredNodeId, setHoveredNodeId
selectionBox, setSelectionBox
selectedConnectionId, setSelectedConnectionId
connectingParams
connectionTargetNodeId
pendingConnectionCreate
mouseWorld
cancelPendingConnectionCreate
createConnectedNode
deleteConnection
handleConnectStart
openConnectionContextMenu
selectConnection
setConnecting
```

消费方式：

- 渲染连接高亮、selection bounding box、connection create menu。
- 右键菜单、快捷键、拖拽、节点 hover、批量选择等直接调 setter。
- `useCanvasKeyboardShortcuts` 和 `useCanvasNodeDeletion` 也要拿很多 selection/panel setter。

判断：

这是第一批适合收缩的区域。页面里多次出现以下组合：

```text
setSelectedNodeIds(new Set())
setSelectedConnectionId(null)
setContextMenu(null)
setAddNodesMenu(null)
setSelectionBox(null)
setHoveredNodeId(null)
setToolbarNodeId(null)
setDialogNodeId(null)
setEditingNodeId(null)
cancelPendingConnectionCreate()
```

这其实是一个工作区动作：清空临时交互状态。它比 raw setter 更像深 `Interface`。

### 3.5 History / persistence state

返回项：

```text
historyState
undoCanvas
redoCanvas
cleanupCanvasFiles
```

没有直接返回但 Implementation 依赖：

```text
historyRef
lastHistoryRef
historyPausedRef
resetHistory
```

消费方式：

- toolbar/topbar/context menu/keyboard shortcuts 调 undo/redo。
- 删除、清空时调用 `cleanupCanvasFiles`。

判断：

这部分相对健康。caller 不知道 history 内部 past/future、防抖、暂停记录。`cleanupCanvasFiles` 暴露出来是因为删除和清空仍在 session 外部；如果删除和清空命令移进 session，它可以变成内部实现。

### 3.6 Group commands

返回项：

```text
getCommonGroup
groupSelectedNodes
ungroupNodes
renameGroup
sortGroupNodes
```

消费方式：

- `CanvasSelectionBoundingBox` 和 group bounding box 直接消费。

判断：

这部分暂时可以保留。它的 `Interface` 不算大，而且贴近 UI 需要。后续如果要 deepen，可以和 selection commands 合并，但不是第一刀。

### 3.7 File / clipboard commands

返回项：

```text
handleUploadRequest
handleImageInputChange
handleDrop
pasteAssistantImage
copyNodesToClipboard
copySelectedNodes
pasteCopiedNodes
pasteSystemClipboard
```

消费方式：

- toolbar、context menu、topbar、file input、assistant panel、keyboard shortcuts。

判断：

这部分已经比 raw setter 更好。`useCanvasFileNodes` 和 `useCanvasClipboard` 的 `Interface` 是命令式的，但它们内部仍依赖 `setNodes/setConnections/setSelectedNodeIds`。短期不需要再拆，等 `Asset Binary Storage` 和 `Canvas Node Media` 的上层 seam 更清楚后再调整会更稳。

## 4. 主要摩擦点

### 4.1 页面仍是二次 composition root

`useCanvasWorkspaceSession` 已经装配了大量 workspace hooks，但 `canvas-client-page.tsx` 后半段继续装配：

- `useCanvasNodeDeletion`
- `useCanvasKeyboardShortcuts`
- `useTextNodeHandlers`
- `useImageNodeHandlers`
- `useCanvasImageActions`
- `useCanvasGeneration`

这些 hook 又需要 raw graph setter、selection setter、panel setter 和 refs。也就是说，session 收了一半 composition，页面又继续做另一半 composition。

这就是返回面宽的根源。

### 4.2 宽 Interface 会在相邻 hook 间转移

`useCanvasNodeDeletion` 的参数包含完整的 `CanvasDeletionUiState` 和对应 setters；`useCanvasKeyboardShortcuts` 也拿了大量 setter。即使把 `useCanvasWorkspaceSession` 的返回对象分组，如果这些 hook 仍在页面外侧装配，宽 `Interface` 仍然存在。

这说明真正的 deepening 方向不是改返回对象名字，而是把删除、快捷键、清空、取消选择这些工作区交互动作收进同一个 `Module`。

### 4.3 Panels 是相邻 UI Module，不一定该并入 session

`useCanvasPanels` 管理了 context menu、add nodes menu、dialog、crop、mask edit、split、upscale、angle、preview、assistant、title editing 等很多 UI 状态。session 现在只接收其中几个 setter。

如果把 panels 全部并入 session，session 会变成“所有画布 UI 状态的上帝 hook”。这会降低页面参数数量，但不一定提高 `Depth`。更好的方向是让 session 只拥有和工作区交互强相关的 panel side effects，例如关闭菜单、关闭编辑态、清理删除节点关联 panel。

## 5. 可选深化路径

### 路径 A：只把返回对象分组

形态：

```ts
return {
  graph,
  view,
  selection,
  connections,
  history,
  groups,
  files,
  clipboard,
}
```

收益：

- `canvas-client-page.tsx` destructuring 更短。
- 阅读时更容易分区。

问题：

- raw setter 仍然暴露。
- caller 仍然知道内部 state shape。
- 删除测试下复杂度没有减少，只是移动。

判断：

不推荐作为主方案。可以作为最后的整理，但不应当算真正 deepening。

### 路径 B：收工作区临时状态命令

形态：

```ts
commands.deselectCanvas()
commands.closeTransientUi()
commands.selectNode(nodeId)
commands.selectNodes(nodeIds)
commands.selectConnection(connectionId)
commands.clearConnectionDraft()
```

收益：

- 页面重复 setter 组合减少。
- `useCanvasKeyboardShortcuts` 可以只拿 commands，不拿十几个 setter。
- `useCanvasNodeDeletion` 可以复用同一套清理临时状态规则。

问题：

- 需要决定哪些 panel state 算 transient UI。
- 如果 panels 仍在 session 外，commands 需要接收一组 panel setters，参数仍偏宽，但至少宽度被限制在 session seam 内。

判断：

推荐第一步做。它的行为清晰，风险低，`Locality` 明显。

### 路径 C：把删除命令移入 session

形态：

```ts
commands.deleteNodes(ids)
commands.deleteSelected()
commands.deleteConnection(id)
```

收益：

- `useCanvasNodeDeletion` 不再由页面装配。
- 删除后清理 selection、toolbar、dialog、preview、running node、context menu 的规则集中。
- `cleanupCanvasFiles` 可以变成内部实现。

问题：

- 需要让 session 知道更多 panels state，或者把 deletion UI state 的读取收成一个 panels adapter。
- 当前 `Canvas Graph Mutations` 已经承担了纯图和 UI state sanitization，session 只是应用结果；不能重复实现这些规则。

判断：

推荐作为第二步。比路径 B 稍重，但收益更大。

### 路径 D：把快捷键移入 session

形态：

```ts
useCanvasWorkspaceSession(...) // 内部注册 keyboard shortcuts
```

或：

```ts
useCanvasKeyboardShortcuts({ workspaceCommands, workspaceRefs, workspaceState })
```

收益：

- 页面少传一大串 setter。
- Escape、Delete、Copy、Paste、Undo、Redo 的行为由工作区命令统一。

问题：

- 快捷键包含 UI policy，例如输入框、contenteditable、`data-canvas-no-zoom` 的跳过规则。
- 如果太早内聚，session 会吃进过多 UI surface 细节。

判断：

可跟在路径 B 后面做。先让 keyboard shortcuts 依赖 commands，而不是直接移入 session。

### 路径 E：把节点创建 / 插入素材 / 插入助手内容收进 session

形态：

```ts
commands.createNode(type, position?)
commands.insertAsset(payload)
commands.insertAssistantImage(image)
commands.insertAssistantText(text)
commands.duplicateNode(nodeId)
commands.clearCanvas()
```

收益：

- 页面不再重复计算画布中心、创建节点、设置 selection。
- `setNodes + setSelectedNodeIds + setSelectedConnectionId + setDialogNodeId` 这种组合集中。

问题：

- `insertAsset` 依赖 asset payload、image materialization、媒体规则。
- `insertAssistantImage` 依赖 assistant image 类型和 media materialization。
- 如果 `Canvas Node Media` / `Asset Binary Storage` 还没继续 deepen，容易把媒体细节塞进 session。

判断：

可以做 `createNode`、`duplicateNode`、`clearCanvas`，但 `insertAsset` 和 `insertAssistantImage` 建议等媒体 seam 更稳。

## 6. 推荐切法

### Slice 1：引入工作区临时状态 commands

目标：

- 不改变图生成、媒体、素材插入。
- 只把重复 UI/selection 清理动作收进 session。

候选命令：

```text
deselectCanvas
closeTransientUi
selectNode
selectNodes
selectConnection
clearSelection
clearConnectionDraft
```

预期可以替换的页面逻辑：

- 当前 `deselectCanvas`
- `resetViewport` 和 `setZoomScale` 中关闭 context/add menu 的 side effect
- context menu / double click / bounding box / group mouse down 中重复的 selection 和 menu 清理
- `useCanvasKeyboardShortcuts` 中 Escape 和 select all 的 setter 组合

这个 slice 的判断标准：

- `canvas-client-page.tsx` 不再直接写大段“清空临时 UI 状态”的 setter 串。
- `useCanvasWorkspaceSession` 的 `Interface` 不一定立刻变小很多，但 caller 学习的交互规则减少。
- 不新增只有单一 adapter 的抽象。

### Slice 2：把 deletion application 移入 session

目标：

- 页面调用 `deleteNodes(ids)`，不用装配 `useCanvasNodeDeletion`。
- `cleanupCanvasFiles` 变成 session 内部实现。
- 删除 UI state 的采集和应用集中在 session 内部。

保留：

- `deleteCanvasNodesFromGraph` 仍是纯计算 `Module`。
- session 不重新实现 batch root 修复、connection 清理、UI state sanitization。

这个 slice 的判断标准：

- `useCanvasNodeDeletion` 要么删除，要么变成 session 内部 hook。
- 页面不再传递 `toolbarNodeId/dialogNodeId/cropNodeId/...` 给删除 hook。
- 删除相关测试仍以 `Canvas Graph Mutations` 为主，不为 session 内部 wiring 写脆弱测试。

### Slice 3：让 keyboard shortcuts 依赖 commands

目标：

- `useCanvasKeyboardShortcuts` 不再接收十几个 setter。
- 它接收 `commands` 和必要 refs。

候选形态：

```ts
useCanvasKeyboardShortcuts({
  refs,
  state: { selectedConnectionId },
  commands: {
    selectAllNodes,
    copySelected,
    paste,
    undo,
    redo,
    deleteSelected,
    escape,
  },
})
```

这个 slice 的判断标准：

- 快捷键逻辑仍清楚。
- Escape 行为只在一个命令里维护。
- 不把所有 panel state 暴露给 keyboard hook。

## 7. 暂时不建议做的事

### 7.1 不建议一次性隐藏 `setNodes/setConnections`

原因：

- `useCanvasGeneration`、`useCanvasImageActions`、`useTextNodeHandlers`、`useImageNodeHandlers` 仍需要复杂图变更。
- 如果 session 现在为了隐藏 setter 暴露大量细碎命令，只会制造浅 `Interface`。
- 更好的路径是先 deepen `Canvas Generation Orchestration`、`Canvas Node Semantics`、`Canvas Graph Mutations`，再回头收 raw setter。

### 7.2 不建议把 `useCanvasPanels` 整个并入 session

原因：

- Panels 是 UI surface state，不全是 workspace interaction rule。
- 全并入会让 session 变得很宽，`Implementation` 更难读。
- 更好的方式是 session 接收一个小的 panel adapter，只处理 transient UI 清理和删除关联 panel 清理。

### 7.3 不建议只做机械分组后宣布完成

原因：

- `Interface` 表面变漂亮，但 caller 仍要知道所有内部 state。
- 删除测试不会改善。
- 测试表面不会变自然。

## 8. 测试策略

这个议题以 React hook wiring 为主，不适合为了每个 command 都写浅测试。更合适的测试策略是：

1. 继续把纯图规则测在 `Canvas Graph Mutations` 的 `Interface` 上。
2. 如果新增纯函数来计算 transient UI state，可以测这个纯函数。
3. 对 session commands，优先依靠现有行为验证和少量集成测试；不要测试内部 hook 调用顺序。
4. 快捷键如果改为依赖 commands，可以用 fake commands 测 key 到 command 的映射。

符合 `codebase-design` 的原则：`Interface` 是测试表面。不要为了确认内部 setter 顺序写脆弱测试。

## 9. 风险

主要风险不是功能实现难，而是容易把 session 做成过大的 UI `Module`。

风险信号：

- session 返回面名义变小，但 `commands` 里出现几十个很薄的方法。
- session 内部开始直接承担生成、媒体、素材入库、图像处理等规则。
- 页面少了 setter，但相邻 hook 的参数列表没变短。
- 新增很多只做转发的函数，删除测试下复杂度没有减少。

更健康的信号：

- 页面不再重复维护 selection/menu/dialog 清理顺序。
- 删除、Escape、画布空白点击、右键菜单关闭使用同一套命令。
- `useCanvasNodeDeletion` 和 `useCanvasKeyboardShortcuts` 的参数显著变少。
- `setNodes/setConnections` 的剩余使用集中在真正的图变更入口，而不是散落在 UI 事件里。

## 10. 建议下一步

如果要开始实现，我建议先做 Slice 1，不碰生成和媒体：

1. 在 `useCanvasWorkspaceSession` 内创建一组 transient UI / selection commands。
2. 页面中的 `deselectCanvas` 改为使用 session command。
3. `resetViewport`、`setZoomScale`、画布右键、画布双击、selection bounding box mouse down 等重复清理逻辑改用同一命令。
4. 保留 `setNodes/setConnections`，避免第一步牵动生成、素材、助手和图片动作。

这一步不追求“立刻把返回面从 60 个字段降到 20 个字段”。它追求的是先把最明显的交互规则集中起来，让 `Locality` 变好。等这个命令层稳定后，再进入 Slice 2，把删除行为移动到 session 内部，届时返回面才会真正缩小。

