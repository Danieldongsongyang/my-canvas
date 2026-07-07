# 画布全景图能力集成计划

本文使用 `codebase-design` 的词汇描述全景图能力如何接入当前代码库。重点是把“当前可落地的最小闭环”和“后续继续深化生成编排”分开：第一版先让用户能生成、标记、查看全景图；第二阶段再把仍散在 hook 里的生成 implementation 收进更深的 **Module**。

调研日期：2026-07-07。

参考：

- 架构评审文件：`file:///private/var/folders/dl/9mdbbdx13yl20k4mh9qgr4f00000gn/T/architecture-review-20260706-203711.html`
- Photo Sphere Viewer 文档：<https://photo-sphere-viewer.js.org/guide/>

## 1. 结论

和当前代码库的契合度判断：

- 数据模型契合：`CanvasNodeMetadata.panorama?: boolean` 已存在。
- 配置入口契合：生成配置面板已经有“全景图”开关。
- 图片查看入口契合：图片详情弹窗现在只有普通 `<img>`，适合在这里接全景 viewer。
- 图片节点入口契合：节点内现在只渲染缩略图，适合只加“全景”标识，不启用 WebGL。
- 媒体存储 **Module** 契合：`canvas-node-media.ts` 已经负责媒体 hydrate / upload / cleanup，全景策略不该放进去。
- 生成编排部分半契合：`canvas-generation-orchestration.ts` 已经承接文本生图和重试，但配置节点、空图片节点、已有图片节点生图仍在 `canvas-image-generation.ts` 里直接实现。

因此第一版不要把“全景功能闭环”和“生成编排完全收拢”绑死。正确顺序是：

1. 新增一个小而深的全景策略 **Module**。
2. 在当前生成 hook 和已有 generation orchestration 两处接入策略，先完成闭环。
3. 新增 viewer **Module**，只在图片详情弹窗里使用。
4. 给缩略图和工具栏补 UI 状态。
5. 第二阶段再把配置节点 / 图片节点生图分支收进 `canvas-generation-orchestration.ts`。

本计划已经确认以下执行决策：

- 依赖管理使用 Bun。安装 Photo Sphere Viewer 时使用 `bun add @photo-sphere-viewer/core`，不要引入 npm / pnpm / yarn 锁文件。
- 全景策略 **Module** 固定放在 `web/src/app/(user)/canvas/services/canvas-panorama-policy.ts`。
- 第一版接受在 `canvas-image-generation.ts` 里接入全景策略，不把生成编排大迁移作为 blocker。
- 图片工具栏配置 key 直接从 `canvas-image-quick-tools-v7` 升到 `canvas-image-quick-tools-v8`，让默认工具集包含“全景”。
- 替换图片时保留原节点的 `panorama` 意图；用户可通过工具栏切回平面。
- `AiConfig.size = "2:1"` 由后端配合支持，前端计划不再把该契约作为待确认前提。
- 第一版不新增保存原始 prompt 的 metadata 字段；生成结果的 `metadata.prompt` 使用最终请求 prompt，确保重试不会丢失全景约束。

## 2. 第一版目标

用户工作流：

```text
用户生成、上传或导入一张 2:1 等距矩形全景图
        ↓
图片节点用 metadata.panorama 标记为全景图
        ↓
节点仍按普通图片参与画布排布、批量生成、连线、下载、保存素材
        ↓
打开图片详情时进入可拖拽、可缩放的 360 全景查看
```

第一版要做：

- 复用 `CanvasNodeType.Image`，不新增全景节点类型。
- 复用 `CanvasNodeMetadata.panorama?: boolean`，不新增 projection / yaw / pitch / fov 字段。
- 生成配置里的“全景图”开关影响生成请求和生成结果。
- 全景生成请求使用 2:1 尺寸，并给 prompt 增加 equirectangular / seamless wrap 约束。
- 图片详情弹窗根据 `metadata.panorama` 切换普通图片查看或全景查看。
- 图片节点缩略图仍渲染普通 `<img>`，只增加低干扰“全景”标识。
- 图片工具栏提供“全景 / 平面”切换。

第一版不做：

- 不在画布节点内初始化 WebGL 全景预览。
- 不做多场景 tour、热点、地图、楼层切换。
- 不做 cubemap、tiles、360 视频。
- 不自研 WebGL 球面投影。
- 不抽 `PanoramaProvider` / `PanoramaRuntime`。当前只有 Photo Sphere Viewer 一个生产 **Adapter**，这个 **Seam** 不真实。

## 3. 当前代码事实

### 已存在的数据和入口

- `web/src/app/(user)/canvas/types.ts`
  - `CanvasNodeMetadata` 已有 `panorama?: boolean`。
- `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
  - 第 110 行左右已经有“全景图”开关，直接写 `metadata.panorama`。
- `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
  - `setBatchPrimary` 目前只把 child 的 `content`、`naturalWidth`、`naturalHeight`、`freeResize` 写回 root，尚未传播 `panorama`。
  - 图片详情弹窗目前标题固定为“图片详情”，内容固定为普通 `<img>` 缩放。
- `web/src/app/(user)/canvas/components/canvas-node.tsx`
  - `ImageContent` 当前只渲染普通 `<img>` 和底部“以图生图 / 图生视频”快捷操作。
- `web/src/app/(user)/canvas/components/canvas-image-toolbar-tools.tsx`
  - 图片工具栏没有 `panorama` 工具。
  - `IMAGE_QUICK_TOOLS_STORAGE_KEY` 当前是 `canvas-image-quick-tools-v7`；第一版新增默认工具时直接 bump 到 `canvas-image-quick-tools-v8`。

### 已存在的深 Module

- `web/src/app/(user)/canvas/services/canvas-node-media.ts`
  - 已负责图片 / 视频 / 音频上传、hydrate、cleanup、storage key 收集。
  - 它可以保留 `metadata.panorama`，但不应理解 2:1、equirectangular 或 viewer。
- `web/src/app/(user)/canvas/utils/canvas-graph-mutations.ts`
  - 已负责上传媒体入图、生成开始、生成成功、生成失败等图结构变更。
  - `cleanUploadedMediaMetadata` 当前不会清理 `panorama`，所以替换一张图片时会继承旧节点的全景状态，除非显式改变。
- `web/src/app/(user)/canvas/services/canvas-generation-orchestration.ts`
  - 已负责文本生图和重试。
  - 通过 `CanvasImageGenerationRequester` 和 `CanvasNodeMediaAdapter` 提供可测试 **Seam**。

### 仍散在 hook 里的 implementation

`web/src/app/(user)/canvas/[id]/hooks/canvas-image-generation.ts` 中仍直接实现：

- 配置节点生图。
- 空图片节点生图。
- 已有图片节点以图生图。
- root / child 节点创建。
- batch connections 创建。
- `requestGeneration` / `requestEdit` 调用。
- `uploadImage` 调用。
- success / error metadata 写入。

所以第一版全景接入必须照顾这个现实：策略 **Module** 要能同时被当前 hook 和已有 generation orchestration 调用。

## 4. Module 1：Canvas Panorama Policy Module

### Seam

新增：

```text
web/src/app/(user)/canvas/services/canvas-panorama-policy.ts
web/src/app/(user)/canvas/services/canvas-panorama-policy.test.ts
```

这是纯计算 **Module**。它不依赖 React，不依赖 Photo Sphere Viewer，不读写 store，不请求后端。

固定放在 `services/` 的理由：当前跨页面、跨 hook 的画布能力已经放在 `services/`，例如 `canvas-node-media.ts` 和 `canvas-generation-orchestration.ts`。全景策略会被生成编排、当前生成 hook、图片详情和工具栏共同使用，不是页面私有工具函数；规则不要散在 UI 文件里。

### Interface

第一版只暴露这些函数：

```ts
export function isPanoramaNode(node: CanvasNodeData | null | undefined): boolean;

export function buildPanoramaPrompt(prompt: string): string;

export function buildPanoramaGenerationConfig(config: AiConfig): AiConfig;

export function applyPanoramaMetadata(
    metadata: CanvasNodeMetadata | undefined,
    enabled: boolean,
): CanvasNodeMetadata;
```

调用方需要知道：

- 给一个 node，能判断它是否按全景图处理。
- 给一个 prompt，能得到适合全景生成的 prompt。
- 给一个生成 config，能得到 2:1 全景生成 config。
- 给一段 metadata，能得到写入或关闭 `panorama` 后的新 metadata。

调用方不需要知道：

- 2:1 尺寸字符串目前怎么表达。
- prompt 追加哪些英文约束。
- 如何避免重复追加全景词。
- 未来是否加入 projection、ratio readiness 或模型专用策略。

### Implementation

规则：

```ts
const PANORAMA_SIZE = "2:1";

const PANORAMA_PROMPT_SUFFIX = [
    "equirectangular 360 panorama",
    "2:1 aspect ratio",
    "seamless horizontal wrap",
    "complete environment in all directions",
    "no text, no watermark, no border",
].join(", ");
```

`buildPanoramaPrompt(prompt)`：

- `prompt.trim()` 为空时返回空字符串。
- 已包含 `equirectangular`、`360 panorama`、`360-degree panorama` 时不重复追加。
- 否则在原 prompt 后追加全景约束。

`buildPanoramaGenerationConfig(config)`：

- 返回新对象，不修改原对象。
- 强制 `size: "2:1"`。
- 保留 `model`、`quality`、`count`、`systemPrompt`、`channelMode` 等其他字段。
- 后端会配合接受 `AiConfig.size = "2:1"`；前端不需要在第一版实现尺寸 fallback。

`applyPanoramaMetadata(metadata, enabled)`：

- `enabled === true` 时返回 `{ ...metadata, panorama: true }`。
- `enabled === false` 时返回 `{ ...metadata, panorama: false }`。

### 测试

新增 `canvas-panorama-policy.test.ts`，只测 **Interface**：

- `isPanoramaNode` 对空节点、普通图片、全景图片的判断。
- `buildPanoramaPrompt` 会追加全景约束。
- `buildPanoramaPrompt` 不重复追加全景约束。
- `buildPanoramaGenerationConfig` 返回 2:1 且不修改原对象。
- `applyPanoramaMetadata` 正确写入 true / false。

不要测试内部字符串拼接顺序，除非该字符串成为外部可见行为。

## 5. Module 2：Canvas Panorama Viewer Module

### Seam

新增：

```text
web/src/app/(user)/canvas/components/canvas-panorama-viewer.tsx
```

这是 Photo Sphere Viewer 的外部 **Seam**。第三方库只应该出现在这个文件内。

### 依赖

当前 `web/package.json` 还没有 `@photo-sphere-viewer/core`。项目使用 Bun 锁文件，第一版需要这样安装：

```bash
cd /Users/a1/Desktop/my-canvas/web
bun add @photo-sphere-viewer/core
```

不要使用 `npm install`、`pnpm add` 或 `yarn add`，避免引入新的锁文件。

Photo Sphere Viewer 文档说明它支持 equirectangular panorama，其他格式通过 adapters 支持；viewer 容器需要明确尺寸。

### Interface

第一版 **Interface**：

```tsx
type CanvasPanoramaViewerProps = {
    src: string;
    title?: string;
    className?: string;
};

export function CanvasPanoramaViewer(props: CanvasPanoramaViewerProps) {}
```

调用方只知道：

- 传 `src`。
- 传可选 `title`。
- 给它一个稳定尺寸容器。

调用方不需要知道：

- Photo Sphere Viewer 如何创建。
- Photo Sphere Viewer 如何销毁。
- CSS 如何引入。
- 哪些事件需要阻止冒泡。
- WebGL 初始化失败如何展示。
- `src` 变化时如何更新 viewer。

### Implementation

第一版 implementation 要处理：

- 文件顶部使用 `"use client"`。
- `useEffect` 中初始化 `Viewer`。
- cleanup 中调用 `destroy()`。
- `src` 变化时重建或更新 panorama。
- 外层加 `data-canvas-no-zoom`。
- 阻止 `wheel`、`pointerdown`、`mousedown`、`dblclick` 冒泡，避免和无限画布缩放、拖拽、双击冲突。
- 容器设置稳定宽高，避免初始化时宽高为 0。
- 初始化失败时显示中文错误文案。

第三方 CSS：

- 优先测试是否可在该 client 文件中引入 `@photo-sphere-viewer/core/index.css`。
- 如果 Next 构建报全局 CSS 限制，就在 `web/src/app/globals.css` 或应用根部统一引入。全局 CSS 这里只放第三方库必要样式，不放页面私有样式。

### 不新增 Provider Seam

第一版不要定义：

```ts
type PanoramaRuntime = ...
type PanoramaProvider = ...
```

原因：

- 当前只有 Photo Sphere Viewer 一个生产 **Adapter**。
- 没有 Pannellum / Marzipano 的第二个 **Adapter**。
- 删除 provider 后复杂度不会回到多个调用方，只会少一层浅转发。

## 6. 第一版生成链路接入：最小闭环

这一步不要先强迫完成 `canvas-generation-orchestration.ts` 的大迁移。当前更稳妥的做法是：新增 policy **Module** 后，在已有两条路径分别接入。

### 6.1 文本生图路径

当前文本生图已经走：

```text
canvas-image-generation.ts
  -> generateCanvasTextToImage(...)
  -> canvas-generation-orchestration.ts
```

执行方案：在 `generateCanvasTextToImage` 内接入全景策略。

- `sourceNode` 已在 `generateCanvasTextToImage` 内读取。
- 根据 `sourceNode?.metadata?.panorama` 计算 `wantsPanorama`。
- 使用 `requestPrompt` / `requestConfig` 创建 root / child metadata，并发起请求。
- success metadata 合并时保留 `panorama`。

伪代码：

```ts
const wantsPanorama = Boolean(sourceNode?.metadata?.panorama);
const requestPrompt = wantsPanorama ? buildPanoramaPrompt(input.effectivePrompt) : input.effectivePrompt;
const requestConfig = wantsPanorama ? buildPanoramaGenerationConfig(input.generationConfig) : input.generationConfig;
const panoramaMetadata = { panorama: wantsPanorama };
```

然后：

- `createRootImageNode` 使用 `requestPrompt` 和 `requestConfig`。
- `createChildImageNode` 使用 `requestPrompt` 和 `requestConfig`。
- `requestOneImage` 使用 `requestPrompt` 和 `requestConfig`。
- `applyCanvasImageGenerationSuccess` 的 metadata 合并 `{ ...imageMetadata(uploaded), ...panoramaMetadata }`。

不要在 `canvas-image-generation.ts` 调用 `generateCanvasTextToImage` 前预处理 prompt / config。那样虽然改动更小，但会让全景策略留在 hook 调用点，**Locality** 差一些。

### 6.2 配置节点 / 图片节点生图路径

当前这些路径仍在：

```text
web/src/app/(user)/canvas/[id]/hooks/canvas-image-generation.ts
```

第一版直接在这个 hook 内接入 policy，不要等第二阶段重构；这是一项明确执行决策，不是临时绕路。

在 `generateCanvasImage` 开头计算：

```ts
const wantsPanorama = Boolean(sourceNode?.metadata?.panorama);
const requestPrompt = wantsPanorama ? buildPanoramaPrompt(effectivePrompt) : effectivePrompt;
const requestConfig = wantsPanorama ? buildPanoramaGenerationConfig(generationConfig) : generationConfig;
const generationMetadata = buildImageGenerationMetadata(generationType, requestConfig, count, referenceImages);
const panoramaMetadata = { panorama: wantsPanorama };
```

然后替换当前使用点：

- root node title / prompt 使用 `requestPrompt`。
- child node title / prompt 使用 `requestPrompt`。
- `requestGeneration` / `requestEdit` 使用 `requestConfig` 和 `requestPrompt`。
- root / child loading metadata 合并 `panoramaMetadata`。
- success metadata 合并 `panoramaMetadata`。
- `buildImageGenerationMetadata` 使用 `requestConfig`，确保 metadata.size 是 `"2:1"`。

第一版不新增 `originalPrompt`、`lastEffectivePrompt` 等 metadata 字段。生成结果的 `metadata.prompt` 使用最终请求 prompt，也就是包含全景约束的 prompt；这样复制提示词和重试都不会丢失全景生成约束。

注意：当前 hook 中已经在第 33 行左右提前创建了 `generationMetadata`。接入全景后，这个创建点必须移动到 `requestConfig` 计算之后，否则 metadata 里的 size 仍可能是原尺寸。

### 6.3 重试路径

当前重试走：

```text
canvas-image-generation.ts
  -> retryCanvasGeneratedImage(...)
  -> canvas-generation-orchestration.ts
```

在 `retryCanvasGeneratedImage` 内处理：

- `wantsPanorama = Boolean(input.savedImageMetadata?.panorama || input.node.metadata?.panorama)`。
- 使用 `requestPrompt` / `requestConfig` 请求。
- `retryGenerationMetadata` 使用 `requestConfig`。
- success metadata 保留 `panorama: wantsPanorama`。

这样失败后的全景图重试不会退回普通图片。

### 6.4 批量主图传播

当前 `setBatchPrimary` 只传播这些字段：

```ts
content
primaryImageId
naturalWidth
naturalHeight
freeResize
```

必须补上：

```ts
panorama: child.metadata?.panorama,
```

否则批量生成全景图后，把某个 child 设为主图时，root 会丢失全景查看状态。

## 7. UI 集成点

### 7.1 图片详情弹窗

入口：

```text
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

当前弹窗固定普通图片查看。改造：

```tsx
const previewIsPanorama = isPanoramaNode(previewNode);
```

全景图：

```tsx
<CanvasPanoramaViewer src={previewNode.metadata.content} title={previewNode.title} />
```

普通图：

- 保留当前 `<img>` 缩放查看。
- 保留 `previewScale`、滚轮缩放、双击重置。

全景模式下不要套普通图片滚轮缩放逻辑。滚轮应交给全景 viewer 处理。

弹窗标题：

```text
全景图详情
图片详情
```

### 7.2 图片节点缩略图

入口：

```text
web/src/app/(user)/canvas/components/canvas-node.tsx
```

第一版不在节点内启用 WebGL viewer。原因：

- 画布可能有很多图片节点。
- 每个节点初始化 viewer 会增加内存和显卡压力。
- 节点内拖拽会和画布拖拽、框选、连线、缩放抢事件。
- 缩略图只需要告诉用户“这是一张全景图”，真正交互在详情弹窗。

改造：

- `ImageContent` 使用 `isPanoramaNode(node)`。
- 如果是全景图，在右上角显示低视觉重量标识：`全景`。
- 标识不拦截事件。
- 保持“以图生图 / 图生视频”操作不变。

### 7.3 图片工具栏切换

入口：

```text
web/src/app/(user)/canvas/components/canvas-image-toolbar-tools.tsx
web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

增加工具 id：

```ts
export type ImageNodeActionToolId = ... | "panorama";
```

增加 handler：

```ts
onTogglePanorama: (node: CanvasNodeData) => void;
```

工具定义：

- `panelLabel`: `全景图`
- `label`: active 时 `全景`，非 active 时 `平面`
- `title`: active 时 `切换为平面图片`，非 active 时 `切换为全景图`
- `active`: `isPanoramaNode(node)`
- icon：优先用 `lucide-react` 的 `Orbit`，如果不可用再选接近环视语义的图标。

页面 handler：

```ts
const toggleNodePanorama = useCallback((nodeId: string) => {
    setNodes((prev) =>
        prev.map((node) =>
            node.id === nodeId
                ? { ...node, metadata: applyPanoramaMetadata(node.metadata, !node.metadata?.panorama) }
                : node,
        ),
    );
}, []);
```

工具配置注意：

- 当前 `IMAGE_QUICK_TOOLS_STORAGE_KEY` 是 `canvas-image-quick-tools-v7`。
- 第一版直接 bump 到 `canvas-image-quick-tools-v8`，让老用户拿到包含“全景”的新默认工具。
- 不做复杂迁移。这里接受重置图片快捷工具配置，换取实现简单和行为清晰。

### 7.4 上传和替换图片

当前上传替换图片时，`cleanUploadedMediaMetadata` 不清理 `panorama`，所以新图片会继承旧节点的全景状态。

第一版明确保留这个行为：

- 用户把一个节点切成全景后，替换图片仍保留“这是全景节点”的意图。
- 如果替换后的图片不是 2:1，打开详情时提醒可能变形。

不要在 `canvas-node-media.ts` 里判断图片比例或清理全景状态。这个判断属于全景 policy，不属于媒体存储 **Module**。

## 8. 数据模型

第一版只使用现有字段：

```ts
panorama?: boolean;
```

暂时不新增：

```ts
panoramaProjection?: "equirectangular" | "cubemap";
panoramaInitialYaw?: number;
panoramaInitialPitch?: number;
panoramaInitialFov?: number;
```

原因：

- 当前只支持 equirectangular 查看。
- 当前没有保存初始视角的用户需求。
- 当前没有 cubemap、tiles、360 视频。
- 新字段会扩大 **Interface**，但暂时没有产生对应 **Leverage**。

如果后续要支持比例检查，先在 policy **Module** 增加派生函数，而不是立刻扩 metadata：

```ts
export function getPanoramaReadiness(node: CanvasNodeData): {
    ready: boolean;
    warning?: string;
};
```

第一版不阻止用户把非 2:1 图片标记为全景图。打开详情时可以轻提示：

```text
这张图片不是 2:1，全景查看可能会变形
```

## 9. 第一版实施顺序

### Step 1：新增全景策略 Module

新增：

```text
web/src/app/(user)/canvas/services/canvas-panorama-policy.ts
web/src/app/(user)/canvas/services/canvas-panorama-policy.test.ts
```

完成：

- 全景判断。
- 全景 prompt。
- 全景 config。
- metadata 写入。
- 单元测试。

### Step 2：接入当前生成路径

修改：

```text
web/src/app/(user)/canvas/services/canvas-generation-orchestration.ts
web/src/app/(user)/canvas/services/canvas-generation-orchestration.test.ts
web/src/app/(user)/canvas/[id]/hooks/canvas-image-generation.ts
```

完成：

- 文本生图路径应用全景 prompt / config / metadata。
- 配置节点和图片节点生图路径应用全景 prompt / config / metadata。
- 重试路径保留全景状态。
- `buildImageGenerationMetadata` 使用实际请求 config。
- 批量 root / child 都写入 `panorama`。

### Step 3：补批量主图传播

修改：

```text
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

完成：

- `setBatchPrimary` 从 child 写回 root 时传播 `panorama`。

### Step 4：新增 Viewer Module

安装依赖：

```bash
cd /Users/a1/Desktop/my-canvas/web
bun add @photo-sphere-viewer/core
```

新增：

```text
web/src/app/(user)/canvas/components/canvas-panorama-viewer.tsx
```

完成：

- viewer 初始化。
- viewer 销毁。
- `src` 变化处理。
- 事件隔离。
- 错误状态。
- 稳定容器尺寸。

### Step 5：接入图片详情弹窗

修改：

```text
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

完成：

- 全景图打开 `CanvasPanoramaViewer`。
- 普通图保留现有 `<img>` 缩放逻辑。
- 弹窗标题区分全景 / 普通。
- 全景详情内滚轮和拖拽不影响底层画布。

### Step 6：给图片节点加全景标识

修改：

```text
web/src/app/(user)/canvas/components/canvas-node.tsx
```

完成：

- 图片缩略图不变。
- 全景图片显示低干扰小标识。
- 不初始化节点内 WebGL。

### Step 7：工具栏加入全景切换

修改：

```text
web/src/app/(user)/canvas/components/canvas-image-toolbar-tools.tsx
web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

完成：

- 图片工具中出现“全景”切换。
- 修改当前节点 metadata。
- 将 `IMAGE_QUICK_TOOLS_STORAGE_KEY` 升到 `canvas-image-quick-tools-v8`。

## 10. 第二阶段：继续深化 Generation Orchestration

第一版可以先在当前 hook 里接入全景策略。但从 **Depth** 看，`canvas-image-generation.ts` 里配置节点 / 图片节点分支仍然太深、太知道图结构 implementation。

第二阶段目标：

```text
Canvas generation orchestration module
├── 文本节点生图
├── 配置节点生图
├── 空图片节点生图
├── 已有图片节点以图生图
├── 批量 root / child 创建
├── 请求 generate / edit
├── 媒体 materialize
├── graph mutation success / error
└── 返回 UI state
```

推荐新增统一 **Interface**：

```ts
export type CanvasImageGenerationSourceKind = "text" | "config" | "image" | "empty-image";

export type CanvasImageGenerationInput = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    sourceNodeId: string;
    sourceKind: CanvasImageGenerationSourceKind;
    prompt: string;
    effectivePrompt: string;
    generationConfig: AiConfig;
    referenceImages: ReferenceImage[];
    createId?: () => string;
    createConnectionId?: () => string;
    requester?: CanvasImageGenerationRequester;
    mediaAdapter?: CanvasNodeMediaAdapter;
    onStart?: (state: CanvasImageGenerationStartState) => void;
};

export async function generateCanvasImageOnCanvas(
    input: CanvasImageGenerationInput,
): Promise<CanvasImageGenerationResult>;
```

调用方不应知道：

- root 节点和 child 节点如何定位。
- 批量生成如何创建 child。
- 哪些时候 rootId 复用空图片节点 id。
- 成功时 root 和 child metadata 如何合并。
- 失败时 root / child / source 状态如何收尾。

这一阶段不是第一版全景功能的前置条件。它是全景接入后顺手能看见的下一块 deepening 工作。

## 11. 验收

功能验收：

- 上传一张 2:1 全景图，切换为全景，打开详情可拖拽环视。
- 上传一张普通图，打开详情仍为普通图片缩放。
- 替换一张全景节点的图片后，全景状态按设计保留。
- 生成配置打开“全景图”，生成请求使用 2:1，生成结果自动带全景标识。
- 文本节点、配置节点、空图片节点、已有图片节点生图都能传播 `panorama`。
- 批量生成全景图，root 和 child 都可全景查看。
- 批量图选择主图后，root 仍保持全景状态。
- 全景详情里滚轮、拖拽、双击不影响底层画布。
- 下载、保存素材、以图生图、图生视频不回退。

测试验收：

- `canvas-panorama-policy.test.ts` 覆盖策略 **Interface**。
- `canvas-generation-orchestration.test.ts` 至少覆盖文本生图和重试的全景传播。
- `canvas-image-generation.ts` 如果暂时保留 hook implementation，需要补对应测试或通过现有生成测试覆盖请求 config / prompt / metadata。
- React / WebGL 部分第一版以手动验证为主。
- 若补自动测试，只测试 `CanvasPanoramaViewer` 可观察行为：空 src、容器渲染、unmount 调用 destroy。不要测试 Photo Sphere Viewer 内部。

## 12. 风险和处理

### WebGL 黑屏

可能原因：

- 容器初始化时宽高为 0。
- 图片跨域不可用。
- 图片不是浏览器可加载 URL。

处理：

- viewer 容器设置稳定宽高。
- 使用项目已有 `metadata.content`，通常是 blob URL、data URL 或可解析 URL。
- 初始化失败显示中文错误。

### 图片比例不对导致变形

处理：

- 第一版不阻断。
- 打开详情时轻提示。
- 后续在 policy **Module** 增加 `getPanoramaReadiness`。

### 事件穿透到底层画布

处理：

- viewer 外层统一 `data-canvas-no-zoom`。
- viewer 外层阻止 wheel / pointer / mouse / double click 冒泡。
- 不在画布节点缩略图里直接启用 viewer。

### 工具栏配置版本

风险：

- 新增 `panorama` 默认工具后，老用户 localStorage 里仍保存旧工具列表，导致看不到新工具。

处理：

- 直接 bump `IMAGE_QUICK_TOOLS_STORAGE_KEY` 到 `canvas-image-quick-tools-v8`。
- 不做旧配置迁移；接受图片快捷工具配置重置一次。

### 生成模型不听全景约束

处理：

- 前端只能提高概率，不能保证模型一定产出真实无缝全景。
- 请求强制 `size: "2:1"`。
- `size: "2:1"` 的后端支持由后端改造保证，本计划不把它作为前端待确认项。
- prompt 增加 equirectangular 和 seamless horizontal wrap。
- 后续如果接专门全景模型，再重新设计生成模型选择 **Seam**。

## 13. 删除测试

想象删除 `Canvas panorama policy module`：

- 全景 prompt、2:1 尺寸、metadata 写入会散落到生成、重试、toolbar、详情查看。
- 测试需要跨多个调用点重复断言。

所以它值得存在。

想象删除 `Canvas panorama viewer module`：

- Photo Sphere Viewer 初始化、CSS、销毁、事件隔离会散落到图片详情弹窗。
- 未来若要素材预览或节点内选中态预览，会重复第三方库生命周期。

所以它值得存在。

想象新增 `PanoramaProvider`：

- 当前只有一个 Photo Sphere Viewer **Adapter**。
- 删除它以后复杂度不会回到多个真实调用方，只会少一层浅转发。

所以第一版不要加。

想象继续保留当前 `canvas-image-generation.ts` 的配置节点 / 图片节点 implementation：

- 第一版可以接受，因为它降低全景闭环风险。
- 长期不理会则会继续扩大 hook 的 **Interface** 和隐含知识，生成行为难以通过一个 **Seam** 测完。

所以它不是第一版 blocker，但应作为第二阶段 deepening。

## 14. 后续演进

第一版完成后，可以按价值继续加：

1. 节点选中态内嵌全景预览。
2. 保存初始视角。
3. 全景截图，导出当前视角为普通图片节点。
4. cubemap 支持。
5. 超大图 tiles 支持。
6. 全景热点和多场景 tour。
7. 360 视频。
8. 接入专门的全景生成模型或 ComfyUI 工作流。

每一步都要重新问：

- 新能力是否需要扩大现有 **Interface**？
- 是否真的有第二个 **Adapter**，值得新增 **Seam**？
- 删除该 **Module** 时，复杂度会回到几个调用方？

## 15. 最小完成定义

第一版完成后，应满足：

- 用户能把任意图片节点切换为全景图。
- 全景图打开详情后可以拖拽环视。
- 普通图片行为不回退。
- 生成配置打开“全景图”后，生成结果自动进入全景模式。
- 生成请求使用 2:1 尺寸。
- 文本 / 配置 / 图片节点生成路径都不丢失全景状态。
- 批量 root / child / primary 选择都不丢失全景状态。
- 全景 prompt 和 config 逻辑有单元测试。
- 全景 viewer 的第三方库细节不泄漏到多个调用方。
- 没有新增浅层 provider **Seam**。
