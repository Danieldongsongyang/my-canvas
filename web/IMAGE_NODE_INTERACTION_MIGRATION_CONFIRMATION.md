# Image 节点交互逻辑迁移确认稿

## 目标

将 `/Users/a1/Desktop/无限画布项目汇总/TwitCanva-Video-Workflow` 中 Image 节点的工作流交互迁移到当前项目 `/Users/a1/Desktop/infinite-canvas/web`。

本确认稿只描述迁移范围和实现方案，先不修改业务代码。确认后再进入实现。

## 源项目 Image 节点交互摘要

TwitCanva 的 Image 节点交互核心不是点击后立刻生成，而是通过菜单创建下游节点，并建立上游输入关系：

```txt
Image 节点
  -> Image to Image
  -> 创建右侧空 Image 节点
  -> 建立 source Image -> child Image
  -> 用户在 child Image 输入 prompt
  -> 点击 child Image 的 Generate
  -> 生成逻辑读取 source Image 作为参考图
  -> child Image 原地显示生成结果
```

```txt
Image 节点
  -> Image to Video
  -> 创建右侧空 Video 节点
  -> 建立 source Image -> child Video
  -> 用户在 child Video 输入 prompt
  -> 点击 child Video 的 Generate
  -> 生成逻辑读取 source Image 作为视频参考图
  -> child Video 原地显示生成结果
```

源项目用 `parentIds` 表示父子关系，例如：

```ts
parentIds: [sourceImageNodeId]
```

目标项目不迁移这个字段。目标项目已有独立连线模型，应继续使用 `CanvasConnection[]`：

```ts
{
    id: string;
    fromNodeId: sourceImageNode.id;
    toNodeId: childNode.id;
}
```

## 目标项目现状

当前项目已经具备一部分迁移基础：

- 节点类型使用 `CanvasNodeType.Image` / `CanvasNodeType.Video`。
- 图片内容保存在 `node.metadata.content`。
- 图片资源信息保存在 `metadata.storageKey`、`metadata.naturalWidth`、`metadata.naturalHeight`、`metadata.mimeType`、`metadata.bytes`。
- 节点连接使用 `CanvasConnection[]`，不是 `parentIds`。
- `canvas-node-generation.ts` 已能通过连接读取上游 Image，并转换成 `referenceImages`。
- `canvas-image-generation.ts` 已能在存在 `referenceImages` 时走 `requestEdit`。
- `canvas-video-generation.ts` 已能把 `referenceImages` 传给 `requestVideoGeneration`。
- 图片 hover toolbar 已经有 `生视频` 的工具定义和接线基础。
- `use-image-node-handlers.ts` 当前已经存在，但目前主要实现了 `handleImageToVideo`。

因此本次迁移不需要重写生成服务，也不需要改成 TwitCanva 的 `parentIds` 数据结构。

## 建议迁移范围

### 本轮迁移

1. 补齐 `Image to Image` 工作流入口。
2. 保留并整理已有 `Image to Video` 工作流入口。
3. 让 Image 节点创建下游空 Image / Video 节点时，统一使用目标项目的 `CanvasConnection`。
4. 创建下游节点后自动选中新节点，并打开该节点的生成面板。
5. 真正生成仍由下游节点自己的 prompt panel 触发。

### 本轮不迁移

1. 不迁移 TwitCanva 的 `parentIds`。
2. 不迁移完整 Video 节点交互，例如 motion control、frame-to-frame、Video 空态菜单。
3. 不重写目标项目已有图片工具栏。
4. 不重写裁剪、切图、超分、多角度、局部编辑、反推提示词、下载、保存素材等已有能力。
5. 不让 `Image to Image` / `Image to Video` 点击后直接请求生成接口。

## 目标交互设计

### Image to Image

入口建议放在 Image 节点内容区或快捷工具中，第一阶段推荐先放在空/选中 Image 节点内容区，避免和已有图片 hover toolbar 的编辑工具混在一起。

用户操作：

```txt
用户点击 Image to Image
```

系统行为：

1. 校验当前节点是 `CanvasNodeType.Image`。
2. 校验 source Image 有 `metadata.content`。
3. 在 source Image 右侧创建一个空 Image 子节点。
4. 创建一条 `source Image -> child Image` 的连接。
5. 更新 source Image 的 `metadata.linkedOutputNodeId = child.id`，用于记录最近创建的下游节点。
6. 选中 child Image。
7. 清空选中的连接。
8. 打开 child Image 的 prompt panel。
9. 不调用图片生成接口。

后续生成：

```txt
child Image prompt panel
  -> 输入编辑 prompt
  -> 点击 Generate
  -> buildNodeGenerationContext 通过连接读取 source Image
  -> referenceImages 包含 source Image
  -> generateCanvasImage
  -> requestEdit
  -> child Image 原地显示结果
```

### Image to Video

入口建议继续放在非空 Image 节点 hover toolbar 中，使用现有 `生视频` 按钮。

用户操作：

```txt
用户点击 Image 节点 hover toolbar 的 生视频
```

系统行为：

1. 校验当前节点是 `CanvasNodeType.Image`。
2. 校验 source Image 有 `metadata.content`。
3. 在 source Image 右侧创建一个空 Video 子节点。
4. 创建一条 `source Image -> child Video` 的连接。
5. 更新 source Image 的 `metadata.linkedOutputNodeId = child.id`。
6. 选中 child Video。
7. 清空选中的连接。
8. 打开 child Video 的 prompt panel。
9. 不调用视频生成接口。

后续生成：

```txt
child Video prompt panel
  -> 输入视频 prompt
  -> 点击 Generate
  -> buildNodeGenerationContext 通过连接读取 source Image
  -> referenceImages 包含 source Image
  -> generateCanvasVideo
  -> requestVideoGeneration(..., referenceImages, ...)
  -> child Video 原地显示结果
```

## 空 Image 节点策略

已确认采用更接近 TwitCanva 的“先搭节点结构，再补输入”模式。

空 Image 节点内容区展示工作流入口：

```txt
Upload

Try to:
  Image to Image
  Image to Video
```

在当前项目中，最终界面文案优先保持中文，但布局和交互逻辑按 TwitCanva：

```txt
上传

试试：
  以图生图
  图生视频
```

交互口径：

```txt
空 Image 节点
  -> 展示上传入口
  -> 展示 Image to Image
  -> 展示 Image to Video
  -> 点击工作流入口后只创建下游空节点和连接
  -> 不立即生成

非空 Image 节点
  -> 继续展示同一套内容区工作流入口，或在图片内容上提供轻量入口
  -> Image to Image 创建右侧空 Image 子节点
  -> Image to Video 创建右侧空 Video 子节点
```

需要注意：

- 允许空 Image 预搭工作流后，source Image 可能暂时没有 `metadata.content`。
- 用户需要先给 source Image 上传或生成图片，再到 child Image / child Video 输入 prompt 并 Generate。
- 为避免 source Image 仍为空时 child 节点误走普通 text-to-image / text-to-video，生成前需要增加校验，或者在 child 节点 metadata 里记录轻量工作流约束。
- 本确认稿推荐使用轻量 metadata 标记，例如 `requiresImageInput: true`，只用于阻止缺少上游图片时误生成，不迁移 TwitCanva 的 `parentIds`。

## 文件级改动方案

### 1. `src/app/(user)/canvas/hooks/use-image-node-handlers.ts`

目标：把 Image 发起的工作流动作集中到这个 hook。

当前已有：

- `handleImageToVideo`

建议补齐：

- `handleImageToImage`
- 通用 `createWorkflowNode`
- 通用 `addWorkflowNode`
- 如有需要，抽出 `buildImageWorkflowMetadata` / `buildVideoWorkflowMetadata`

推荐返回：

```ts
return {
    handleImageToImage,
    handleImageToVideo,
};
```

`handleImageToImage` 创建子 Image 的 metadata：

```ts
{
    content: "",
    status: "idle",
    prompt: "",
    model: effectiveConfig.imageModel || effectiveConfig.model,
    size: effectiveConfig.size,
    quality: effectiveConfig.quality,
    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
}
```

`handleImageToVideo` 创建子 Video 的 metadata：

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

节点位置：

```txt
x = source.position.x + source.width + 96
y = source.position.y + source.height / 2 - child.height / 2
```

连接：

```ts
{
    id: nanoid(),
    fromNodeId: source.id,
    toNodeId: child.id,
}
```

状态更新：

```ts
setSelectedNodeIds(new Set([child.id]));
setSelectedConnectionId(null);
setDialogNodeId(child.id);
```

### 2. `src/app/(user)/canvas/components/canvas-node.tsx`

目标：让 Image 节点内容区可以触发 `Image to Image`。

建议新增 props：

```ts
onImageToImage?: (node: CanvasNodeData) => void;
```

并在 `NodeContentRendererProps` 里继续传给 `ImageNodeContent` / `EmptyImageContent` 或新的小组件。

第一阶段建议：

- 如果采用方案 A，只在非空 Image 节点或选中状态下提供 `Image to Image` 入口。
- 如果要保持 UI 简洁，也可以先不改空态内容区，把 `Image to Image` 放进 hover toolbar。

如果放进空态内容区，菜单风格可复用 Text 节点的 `TextNodeActionItem`：

```txt
Try to:
  Image to Image
```

文案最终建议中文化：

```txt
试试：
  以图生图
```

### 3. `src/app/(user)/canvas/components/canvas-image-toolbar-tools.tsx`

当前已有 `imageToVideo`。

如确认要把 `Image to Image` 也放到 hover toolbar，则新增：

```ts
export type ImageNodeActionToolId =
    | "imageToImage"
    | "imageToVideo"
    | ...
```

工具定义：

```txt
label: "以图生图"
title: "用这张图片创建图片生成节点"
```

第一阶段建议默认展示：

- `imageToVideo`：默认展示。
- `imageToImage`：是否默认展示待确认。

如果担心工具栏拥挤，`imageToImage` 可以默认不展示，但允许在“更多”里开启。

### 4. `src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx`

当前已有：

- `onImageToVideo`
- `buildImageToolbarTools(... onImageToVideo ...)`

如果新增 `Image to Image` hover 工具，需要补：

```ts
onImageToImage: (node: CanvasNodeData) => void;
```

并传入：

```ts
buildImageToolbarTools(node, {
    ...,
    onImageToImage,
    onImageToVideo,
})
```

### 5. `src/app/(user)/canvas/[id]/canvas-client-page.tsx`

当前已有：

```ts
const { handleImageToVideo } = useImageNodeHandlers(...)
```

建议改为：

```ts
const { handleImageToImage, handleImageToVideo } = useImageNodeHandlers(...)
```

然后按确认的入口位置传递：

```tsx
<CanvasNode
    ...
    onImageToImage={handleImageToImage}
/>
```

如果 `Image to Image` 进入 hover toolbar：

```tsx
<CanvasNodeHoverToolbar
    ...
    onImageToImage={handleImageToImage}
    onImageToVideo={handleImageToVideo}
/>
```

## 生成层是否需要修改

第一阶段原则上不需要修改生成层。

原因：

- `buildNodeGenerationContext` 已经会通过 `connections` 找上游节点。
- 上游 Image 已能被读取为 `referenceImages`。
- Image 生成已有 `referenceImages.length ? requestEdit : requestGeneration`。
- Video 生成已有 `requestVideoGeneration(generationConfig, prompt, referenceImages, referenceVideos, referenceAudios)`。

需要注意一个现有行为：

非空 Image 节点直接点自己的 prompt panel Generate 时，当前 `generateCanvasImage` 会把“自己”作为 source reference，并在右侧生成新图。这是目标项目已有的 Image edit 路径。

迁移后的 `Image to Image` 是另一条更显式的工作流路径：

```txt
先创建空 child Image
再在 child Image 上 Generate
```

这两条路径可以共存。

## 确认点

实现前需要你确认这几个交互选择：

1. `Image to Image` 入口放哪里？
   - 选项 A：放进图片 hover toolbar，文案 `以图生图`。
   - 选项 B：放进 Image 节点内容区菜单，文案 `以图生图`。
   - 选项 C：两个位置都放。
选B
2. 空 Image 节点是否允许预搭工作流？
   - 推荐：不允许，只有非空 Image 才显示 `以图生图` / `生视频`。
   - 如果允许，需要额外加生成前校验，避免 source 为空时误走普通生成。
允许，source 为空时误走普通生成是没问题的
3. `Image to Image` 是否默认出现在图片快捷工具栏？
   - 推荐：默认不展示，但可在“更多”配置里开启，避免工具栏太挤。
   - 如果希望强入口，也可以默认展示。
我选择：推荐：默认不展示，但可在“更多”配置里开启，避免工具栏太挤。
4. `Image to Video` 是否保持现有 `生视频` 工具默认展示？
   - 推荐：保持默认展示。
我选择推荐
5. 创建子节点后选中谁？
   - 推荐：选中新创建的 child 节点，并打开 child 的 prompt panel。
   - 这和 TwitCanva 更接近，也能让用户立刻输入下游 prompt。
我选择推荐
## 推荐第一阶段方案

我建议第一阶段采用这个组合：

```txt
非空 Image 节点 hover toolbar
  -> 生视频，默认展示
  -> 以图生图，默认不展示，可在更多里开启

非空 Image 节点内容区/空态不新增复杂菜单

空 Image 节点
  -> 不展示以图生图 / 生视频
  -> 继续作为上传或普通生成占位
```

理由：

- 目标项目已有图片 hover toolbar 和快捷工具配置系统，迁移成本最低。
- 避免空 source 带来的生成语义歧义。
- 避免和已有 prompt panel 的“非空图片直接编辑生成右侧新图”能力冲突。
- 仍然完整保留 TwitCanva 的核心工作流：创建下游节点、建立连接、由下游节点生成。

## 验收清单

### Image to Image

1. 准备一个已有内容的 Image 节点。
2. 点击 `以图生图`。
3. 右侧创建一个空 Image 节点。
4. 自动创建 `source Image -> child Image` 连接。
5. child Image 被选中。
6. child Image 的 prompt panel 自动打开。
7. 点击入口时不发送图片生成请求。
8. 在 child Image 输入 prompt 后点击 Generate。
9. 请求走 `requestEdit`，不是 `requestGeneration`。
10. child Image 原地显示生成结果。
11. source Image 不被覆盖。

### Image to Video

1. 准备一个已有内容的 Image 节点。
2. 点击 `生视频`。
3. 右侧创建一个空 Video 节点。
4. 自动创建 `source Image -> child Video` 连接。
5. child Video 被选中。
6. child Video 的 prompt panel 自动打开。
7. 点击入口时不发送视频生成请求。
8. 在 child Video 输入 prompt 后点击 Generate。
9. 请求走 `requestVideoGeneration`，且携带 source Image 作为 `referenceImages`。
10. child Video 原地显示生成结果。
11. source Image 不被覆盖。

### 回归

1. Text to Image / Text to Video 继续可用。
2. 非空 Image 自己打开 prompt panel 生成右侧新 Image 的现有路径继续可用。
3. 图片上传、下载、保存素材、反推提示词、裁剪、切图、超分、多角度、局部编辑继续可用。
4. 删除 source 或 child 时，现有连接清理逻辑继续生效。
5. 多选、拖拽、缩放、小地图不受影响。

## 实施后建议验证命令

代码实现后建议执行：

```bash
bun run build
```

如果只想先快速检查类型：

```bash
bunx tsc --noEmit
```

本确认稿阶段不需要执行构建。
