# Text 节点三选项工作流改造计划

## 背景

目标是在 `/Users/a1/Desktop/infinite-canvas/web` 项目的画布中，让 Text 节点实现类似 `TwitCanva-Video-Workflow` 当前项目的交互逻辑：

```txt
Text 节点内容区菜单按钮
  -> CanvasNode 把回调继续往上传
  -> canvas-client-page 挂载 useTextNodeHandlers
  -> useTextNodeHandlers 实际改 nodes / connections 状态
  -> 后续点击 Image / Video 节点 Generate
  -> canvas-node-generation 合并 Text 父节点内容并调用生成接口
```

目标不是直接复制另一个项目的文件结构，而是在 `web` 现有 Next.js 画布结构上做合理改造。

## 当前结构观察

`web` 项目的画布主要集中在：

- `src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- `src/app/(user)/canvas/components/canvas-node.tsx`
- `src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- `src/app/(user)/canvas/components/canvas-node-generation.ts`
- `src/app/(user)/canvas/types.ts`
- `src/app/(user)/canvas/constants.ts`

当前 Text 节点内容渲染在 `canvas-node.tsx` 内部的 `TextContent` 函数里，不是独立的 `NodeContent.tsx` 文件。

当前 Text 节点字段习惯：

```ts
metadata.content // Text 节点正文内容
metadata.prompt  // 生成提示词或历史 prompt
```

这和 TwitCanva 项目不同。TwitCanva 的 Text 节点主要把文本写入 `prompt`。本次改造应保留 `web` 项目的字段习惯，避免大范围迁移数据结构。

当前项目已有一部分“上游 Text 参与生成”的能力：

- `canvas-node-generation.ts` 的 `buildNodeGenerationContext` 会读取连接到目标节点的上游资源。
- `readNodeTextInput` 已经支持从 Text 节点读取 `metadata.content || metadata.prompt`。
- Image / Video 空节点在生成时可以被原地填充，而不是一定创建新节点。

因此本次改造重点不是重写生成服务，而是补齐 Text 节点菜单、动作 handler、子节点创建、以及生成面板的提交条件。

## 期望交互

新建或点开一个空 Text 节点时，内容区显示三个选项：

```txt
Write your own content
Text to Video
Text to Image
```

### Write your own content

点击后：

1. 当前 Text 节点进入文字编辑模式。
2. 用户在 Text 节点内写正文。
3. 正文写入 `node.metadata.content`。

不创建新节点，不触发 AI 生成。

### Text to Image

点击后：

1. 当前 Text 节点进入文字编辑模式。
2. 在 Text 节点右侧创建一个空 Image 节点。
3. 创建一条连接：

```txt
Text -> Image
```

4. Image 节点先保持 idle，不立即生成。
5. 后续用户点击 Image 节点的 Generate 时，生成逻辑读取父 Text 节点的 `metadata.content`，合并 Image 节点自己的 prompt，然后调用图片生成接口。

### Text to Video

点击后：

1. 当前 Text 节点进入文字编辑模式。
2. 在 Text 节点右侧创建一个空 Video 节点。
3. 创建一条连接：

```txt
Text -> Video
```

4. Video 节点先保持 idle，不立即生成。
5. 后续用户点击 Video 节点的 Generate 时，生成逻辑读取父 Text 节点的 `metadata.content`，合并 Video 节点自己的 prompt，然后调用视频生成接口。

## 关键设计原则

1. 保留 `web` 原有字段语义：Text 正文仍写入 `metadata.content`。
2. 不把 Text 节点本身改造成生成节点；Text 节点只提供文本资源。
3. Text to Image / Text to Video 只创建下游空节点和连接，不立即调用接口。
4. 真正生成仍由 Image / Video 节点自己的生成面板触发。
5. 生成时通过连接关系读取上游 Text 内容，而不是靠实时同步 prompt。
6. 尽量把新增逻辑从 `canvas-client-page.tsx` 中抽出来，避免这个文件继续膨胀。

## 拟新增或修改的文件

### 1. `src/app/(user)/canvas/types.ts`

为 Text 节点增加轻量状态字段：

```ts
export type CanvasTextMode = "menu" | "editing";

export type CanvasNodeMetadata = {
    ...
    textMode?: CanvasTextMode;
    linkedOutputNodeId?: string;
};
```

说明：

- `textMode` 用来区分空 Text 节点当前显示菜单还是进入编辑态。
- `linkedOutputNodeId` 可选，用于记录 Text to Image / Text to Video 创建的下游节点，主要方便未来扩展和调试。
- 如果后续不想持久化 UI 状态，也可以只用“空内容 + 非编辑态”推导菜单态；但为了贴近 TwitCanva 的 `textMode` 机制，推荐保留这个字段。

### 2. `src/app/(user)/canvas/constants.ts`

调整 Text 节点默认 metadata：

```ts
[CanvasNodeType.Text]: {
    ...NODE_DEFAULT_SIZE[CanvasNodeType.Text],
    metadata: {
        content: "",
        status: "idle",
        fontSize: 14,
        textMode: "menu",
    },
}
```

已有项目数据中没有 `textMode` 的旧 Text 节点，可以在渲染时按 `textMode ?? "menu"` 兼容。

### 3. `src/app/(user)/canvas/components/canvas-node.tsx`

在 `CanvasNodeProps` 中新增 Text 动作回调：

```ts
onWriteTextContent?: (node: CanvasNodeData) => void;
onTextToImage?: (node: CanvasNodeData) => void;
onTextToVideo?: (node: CanvasNodeData) => void;
```

然后传给内部 `TextContent`。

`TextContent` 里新增菜单态判断：

```ts
const isEmptyText = !node.metadata?.content?.trim();
const shouldShowTextActionMenu =
    node.type === CanvasNodeType.Text &&
    isEmptyText &&
    !isEditingContent &&
    (node.metadata?.textMode ?? "menu") === "menu";
```

当 `shouldShowTextActionMenu` 为真时，显示三个菜单项：

```txt
Write your own content
Text to Video
Text to Image
```

点击菜单项时只调用传入回调，不直接改节点数组。

同时建议处理当前 Text 节点右上角的“生图”按钮：

- 空 Text 节点显示三选项菜单时，不显示右上角“生图”按钮，避免重复入口。
- 已有正文的 Text 节点可以保留 hover toolbar 或右上角快捷“生图”，但建议后续统一到新 handler。

### 4. `src/app/(user)/canvas/hooks/use-text-node-handlers.ts`

新增一个画布局部 hook，承接 Text 节点三个动作。

建议文件结构：

```txt
src/app/(user)/canvas/hooks/use-text-node-handlers.ts
```

核心 API：

```ts
export function useTextNodeHandlers({
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    requestTextEdit,
    effectiveConfig,
}: UseTextNodeHandlersOptions) {
    return {
        handleWriteTextContent,
        handleTextToImage,
        handleTextToVideo,
    };
}
```

`requestTextEdit(nodeId)` 由 `canvas-client-page.tsx` 提供，内部复用现有编辑机制：

```ts
setSelectedNodeIds(new Set([nodeId]));
setSelectedConnectionId(null);
setDialogNodeId(nodeId);
setEditingNodeId(nodeId);
setEditRequestNonce((value) => value + 1);
```

#### handleWriteTextContent

逻辑：

1. 更新 Text 节点：

```ts
metadata.textMode = "editing";
```

2. 调用 `requestTextEdit(nodeId)`。

#### handleTextToImage

逻辑：

1. 找到 Text 节点。
2. 创建空 Image 节点，位置在 Text 节点右侧：

```txt
x = text.position.x + text.width + 96
y = text.position.y + text.height / 2 - image.height / 2
```

3. Image metadata 使用当前全局图片配置初始化：

```ts
{
    content: "",
    status: "idle",
    prompt: "",
    model: effectiveConfig.imageModel || effectiveConfig.model,
    size: effectiveConfig.size,
    quality: effectiveConfig.quality,
}
```

4. 创建连接：

```ts
{ fromNodeId: text.id, toNodeId: image.id }
```

5. 更新 Text 节点：

```ts
metadata.textMode = "editing";
metadata.linkedOutputNodeId = image.id;
```

6. 选中 Text 节点并进入编辑态。

#### handleTextToVideo

逻辑和 `handleTextToImage` 相同，只是创建空 Video 节点：

```ts
{
    content: "",
    status: "idle",
    prompt: "",
    model: effectiveConfig.videoModel || effectiveConfig.model,
    size: effectiveConfig.size,
    seconds: effectiveConfig.videoSeconds,
    vquality: effectiveConfig.vquality,
    generateAudio: effectiveConfig.videoGenerateAudio,
    watermark: effectiveConfig.videoWatermark,
}
```

连接为：

```ts
Text -> Video
```

### 5. `src/app/(user)/canvas/[id]/canvas-client-page.tsx`

在页面组件里挂载新的 hook：

```ts
const {
    handleWriteTextContent,
    handleTextToImage,
    handleTextToVideo,
} = useTextNodeHandlers(...);
```

然后传给 `CanvasNode`：

```tsx
<CanvasNode
    ...
    onWriteTextContent={handleWriteTextContent}
    onTextToImage={handleTextToImage}
    onTextToVideo={handleTextToVideo}
/>
```

同时可以把现有的 `generateImageFromTextNode` 逐步改为调用 `handleTextToImage` 或保留为“已有正文 Text 的快捷创建配置节点”入口。

推荐策略：

- 新三选项菜单只用于空 Text 节点。
- 已有正文 Text 节点的 hover toolbar 里“生图”可以先保持不变，降低改动风险。
- 后续如果要完全统一，再把 hover toolbar 的“生图”也切到 `handleTextToImage`。

### 6. `src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`

这是最关键的兼容点。

当前 `CanvasNodePromptPanel` 的提交条件是：

```ts
if (!text || isRunning) return;
disabled={isRunning || !prompt.trim()}
```

这会导致一个问题：如果 Image / Video 子节点自己的 prompt 为空，但它已经连接了 Text 父节点，用户仍然无法点击 Generate。

需要新增一个 prop：

```ts
hasGenerationInput?: boolean;
```

或更明确：

```ts
canGenerateFromConnectedInputs?: boolean;
```

在 `canvas-client-page.tsx` 渲染 panel 时，根据 `buildNodeGenerationInputs(panelNode.id, nodes, connections)` 判断：

```ts
const hasGenerationInput = generationInputsById.get(panelNode.id)?.length > 0;
```

提交逻辑改为：

```ts
const text = prompt.trim();
const canSubmit = Boolean(text || hasGenerationInput);
if (!canSubmit || isRunning) return;
onGenerate(node.id, mode, text);
```

按钮禁用逻辑也改为：

```tsx
disabled={isRunning || !canSubmit}
```

这样空 Image / Video 节点只要有上游 Text，就能直接 Generate。

### 7. `src/app/(user)/canvas/components/canvas-node-generation.ts`

当前 `buildNodeGenerationContext` 已经会读取上游 Text，但 prompt 拼接顺序和 TwitCanva 不完全一致：

当前逻辑近似为：

```ts
prompt + "\n\n" + upstreamText
```

TwitCanva 逻辑是：

```ts
Text 父节点 prompt + "\n\n" + 子节点自己的 prompt
```

建议调整为：

```ts
const promptParts = [upstreamText, prompt].filter(Boolean);

return {
    prompt: promptParts.join("\n\n"),
    ...
};
```

好处：

- Text 节点作为主输入，语义更自然。
- Image / Video 子节点自己的 prompt 可以作为补充说明或修饰条件。
- 与本次迁移目标保持一致。

需要注意 `Config` 节点的 composer 模式不要受影响。只调整普通节点的上下游文本合并逻辑，不改 `buildComposerGenerationContext`。

## 推荐实现顺序

### 第一步：数据类型和默认值

修改：

- `types.ts`
- `constants.ts`

增加 `textMode` / `linkedOutputNodeId`，并让新建 Text 默认进入菜单态。

### 第二步：Text 节点内容区菜单

修改：

- `canvas-node.tsx`

新增 `TextNodeActionMenu` 小组件，替换空 Text 节点的 placeholder。

菜单 UI 可沿用当前项目的简洁风格：

```txt
Try to:
  Write your own content
  Text to Video
  Text to Image
```

### 第三步：新增 Text 动作 hook

新增：

- `src/app/(user)/canvas/hooks/use-text-node-handlers.ts`

封装：

- `handleWriteTextContent`
- `handleTextToImage`
- `handleTextToVideo`

内部只负责状态和连接，不调用生成接口。

### 第四步：页面接线

修改：

- `canvas-client-page.tsx`

挂载 hook，并把回调传给 `CanvasNode`。

### 第五步：生成面板允许“只有上游 Text”也提交

修改：

- `canvas-node-prompt-panel.tsx`
- `canvas-client-page.tsx`

为 `CanvasNodePromptPanel` 增加 `hasGenerationInput` 或 `canGenerateFromConnectedInputs`。

### 第六步：调整 prompt 合并顺序

修改：

- `canvas-node-generation.ts`

普通节点合并顺序改成：

```txt
上游 Text 内容

本节点 prompt
```

### 第七步：整理旧入口

检查：

- `TextContent` 右上角“生图”按钮
- `CanvasNodeHoverToolbar` 里的“生图”动作
- `generateImageFromTextNode`

推荐先保留旧入口，避免破坏已有用户习惯。等新三选项稳定后，再决定是否统一。

## 详细事件流

### Write your own content

```txt
TextContent 菜单按钮
  -> onWriteTextContent(node)
  -> CanvasNode props
  -> canvas-client-page
  -> useTextNodeHandlers.handleWriteTextContent
  -> 更新 Text metadata.textMode = "editing"
  -> requestTextEdit(node.id)
  -> CanvasNode 收到 editRequestNonce
  -> TextContent 显示 textarea
  -> onContentChange 写入 metadata.content
```

### Text to Image

```txt
TextContent 菜单按钮
  -> onTextToImage(node)
  -> CanvasNode props
  -> canvas-client-page
  -> useTextNodeHandlers.handleTextToImage
  -> 创建空 Image 节点
  -> 创建 Text -> Image connection
  -> Text 进入 editing
  -> 用户写入 metadata.content
  -> 用户点击 Image 节点 Generate
  -> CanvasNodePromptPanel submit
  -> handleGenerateNode(image.id, "image", imagePrompt)
  -> buildNodeGenerationContext 读取上游 Text 内容
  -> requestGeneration / requestEdit
  -> Image 节点原地变成生成结果
```

### Text to Video

```txt
TextContent 菜单按钮
  -> onTextToVideo(node)
  -> CanvasNode props
  -> canvas-client-page
  -> useTextNodeHandlers.handleTextToVideo
  -> 创建空 Video 节点
  -> 创建 Text -> Video connection
  -> Text 进入 editing
  -> 用户写入 metadata.content
  -> 用户点击 Video 节点 Generate
  -> CanvasNodePromptPanel submit
  -> handleGenerateNode(video.id, "video", videoPrompt)
  -> buildNodeGenerationContext 读取上游 Text 内容
  -> requestVideoGeneration
  -> Video 节点原地变成生成结果
```

## 需要避免的问题

### 1. 不要让 Text to Image 直接调用生成

这会跳过用户编辑 Text 的过程，也不符合目标项目的连接式工作流。

### 2. 不要把 Text 正文强行改存到 `metadata.prompt`

`web` 项目已有大量逻辑用 `metadata.content` 表示 Text 正文。应继续沿用：

```ts
Text 正文 = metadata.content
生成补充 prompt = metadata.prompt
```

### 3. 不要破坏 Config 节点的 composer 模式

`buildComposerGenerationContext` 依赖 `@[node:id]` token 和输入资源选择。普通节点的 prompt 合并顺序调整，不应影响 composer 模式。

### 4. 不要让空 prompt 的子节点无法生成

这是本次改造必须处理的点。只要有上游 Text 输入，Image / Video 子节点就应该能 Generate。

### 5. 不要创建重复连接

`handleTextToImage` / `handleTextToVideo` 需要检查是否已有同方向连接，或者使用 `nanoid()` 创建新连接并确保不重复：

```ts
connections.some(conn => conn.fromNodeId === text.id && conn.toNodeId === child.id)
```

## 验证清单

### 手动验证

1. 新建 Text 节点，节点内容区显示三个选项。
2. 点击 `Write your own content`，节点变成可编辑 textarea。
3. 输入文字，失焦后文字保留在 Text 节点中。
4. 新建 Text 节点，点击 `Text to Image`：
   - 右侧出现 Image 节点。
   - 出现 Text -> Image 连线。
   - Text 节点进入编辑态。
5. 在 Text 节点输入 prompt。
6. 点击 Image 节点，打开生成面板。
7. Image 节点 prompt 为空时，只要父 Text 有内容，Generate 按钮可点击。
8. 点击 Generate，Image 节点原地显示生成结果。
9. 新建 Text 节点，点击 `Text to Video`：
   - 右侧出现 Video 节点。
   - 出现 Text -> Video 连线。
   - Text 节点进入编辑态。
10. 在 Text 节点输入 prompt。
11. 点击 Video 节点 Generate，Video 节点原地显示生成结果。
12. 已有正文的 Text 节点仍能双击编辑。
13. 已有正文的 Text 节点 hover toolbar 不受影响。
14. Config 节点 composer 生成不受影响。

### 命令验证

项目当前 `package.json` 只有以下相关脚本：

```bash
bun run format:check
bun run build
```

建议实现后执行：

```bash
bun run format:check
bun run build
```

如只想快速看类型问题，也可以直接执行：

```bash
bunx tsc --noEmit
```

## 风险评估

### 中风险：`canvas-client-page.tsx` 过大

该文件已经承担大量画布状态和生成逻辑。新增逻辑如果继续塞进去，会变得更难维护。建议新建 `use-text-node-handlers.ts`。

### 中风险：Text 编辑状态当前是局部 state

`CanvasNode` 内部用 `isEditingContent` 控制 textarea，页面层用 `editRequestNonce` 触发编辑。新增 `metadata.textMode` 后，需要明确两者关系：

- `metadata.textMode` 决定空 Text 节点显示菜单还是准备编辑。
- `isEditingContent` 决定当前是否真的显示 textarea。
- `editRequestNonce` 负责从页面层主动让节点进入 textarea。

### 低风险：生成上下文已有基础

`canvas-node-generation.ts` 已经能从连接读取 Text 输入，所以生成层改动较小。

### 低风险：空 Image / Video 原地生成已有支持

`handleGenerateNode` 对空 Image / Video 节点已有原地填充逻辑，本次只是让 Text 菜单更容易创建这种节点。

## 预期最终效果

改造完成后，Text 节点会从“单纯的文本内容节点”变成一个更明确的工作流入口：

```txt
空 Text 节点
  -> 写文字
  -> 或创建 Text -> Image 工作流
  -> 或创建 Text -> Video 工作流

下游 Image / Video 节点
  -> 从连接读取 Text 内容
  -> 可叠加自己的 prompt 和模型参数
  -> 点击 Generate 后原地生成结果
```

这能保持 `web` 项目的连接式画布结构，同时对齐 TwitCanva 当前项目中 Text 节点的三选项体验。
