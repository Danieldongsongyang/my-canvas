# 画布全景图能力集成计划

更新日期：2026-07-08

本文使用 `codebase-design` 的词汇，按当前代码库新的架构梳理方式重写全景图接入计划。目标不是继续讨论方案，而是给实现者一份可以直接执行的实施说明：哪些 **Module** 要新增，哪些现有 **Seam** 要接入，哪些行为必须验收，哪些事情第一版明确不做。

## 1. 执行摘要

第一版目标是跑通这条最小闭环：

```text
用户把生成源或图片节点切到“全景图”
        ↓
图片生成请求使用 2:1 config 和全景 prompt
        ↓
生成、上传、替换或批量主图选择后，Canvas 图片节点保留全景意图
        ↓
图片节点仍按普通图片参与画布排布、连线、下载、保存素材、以图生图、图生视频入口
        ↓
打开图片详情时，全景图片进入可拖拽、可缩放的 360 查看
```

核心实施方向：

1. 新增 `Canvas Panorama Policy` **Module**，把全景语义、prompt 增强、2:1 config、metadata 写入和比例提示集中。
2. 在 `Canvas Generation Orchestration` 已覆盖的文本生图和重试路径接入 policy。
3. 在仍留在 hook 里的配置节点、空图片节点、已有图片节点生图分支接入 policy，不把大规模 generation deepening 当成第一版 blocker。
4. 在 `Canvas Graph Mutations` 或页面调用点补齐批量主图 `panorama` 传播；推荐把该图规则收进 graph mutation **Module**。
5. 新增 `Canvas Panorama Viewer` **Module**，把 Photo Sphere Viewer 的第三方细节隔离在一个文件内，只在图片详情弹窗使用。
6. 在 `Canvas UI Surface` 增加节点标识、详情切换和图片工具栏切换。

已确认的产品与技术决策：

| 决策点 | 第一版决策 |
| --- | --- |
| 全景语义 | `panorama` 是 Canvas 节点意图，不是 asset 级认证属性 |
| 生成源节点 | 非图片生成源节点上的 `panorama` 是持久节点级生成偏好，生成完成后不自动关闭 |
| 图片节点 | 图片节点上的 `panorama` 表示该节点按全景图标记和查看 |
| 素材库重新插入 | 从本地素材库重新插入图片时默认普通图片，不自动恢复全景状态 |
| 替换图片 | 替换当前全景节点的图片时保留该节点的全景意图 |
| 非 2:1 图片 | 不阻止进入全景 viewer，只轻提示可能变形 |
| prompt 保存 | 生成结果的 `metadata.prompt` 使用最终请求 prompt，不新增原始 prompt 字段 |
| 后端尺寸契约 | 后端会支持 `AiConfig.size = "2:1"`，前端不做 fallback |
| 图生视频 | 全景图片执行图生视频时按普通参考图处理，不传播 360/全景视频语义 |
| 依赖管理 | 使用 Bun：`bun add @photo-sphere-viewer/core`，不引入 npm/pnpm/yarn 锁文件 |
| Provider seam | 不新增 `PanoramaProvider` / `PanoramaRuntime`，当前只有一个真实 Adapter |

## 2. 当前代码库落点

当前架构已经把 Canvas 逐步拆成更深的 **Module**。全景能力应顺着这些 **Seam** 接入，而不是把规则散到 UI 里。

| Module | 当前状态 | 全景接入策略 |
| --- | --- | --- |
| `Canvas Node Semantics` | 语义仍分散在 `types.ts`、`canvas-page-utils.ts`、`canvas-node-generation.ts`、`canvas-resource-references.ts` 等文件 | 新增 `Canvas Panorama Policy`，作为全景语义的集中 seam |
| `Canvas Generation Orchestration` | 已覆盖 `generateCanvasTextToImage` 和 `retryCanvasGeneratedImage` | 在这个 seam 内统一接入全景 prompt、2:1 config、metadata 传播 |
| `Canvas Graph Mutations` | 已负责上传替换、生成开始/成功/失败、删除和 batch 图规则 | 批量主图选择的 `panorama` 传播应尽量放入这里 |
| `Canvas Node Media` | 已负责 hydrate、materialize、cleanup、storageKey 收集 | 不理解全景语义，不做比例判断，不清理 `panorama` |
| `Canvas UI Surface` | 页面和节点组件负责弹窗、toolbar、节点内容 | 只负责展示、事件隔离和调用 policy，不拼接全景 prompt |
| `Asset` | 本地素材库是 asset 集合和引用关系 | 不新增 asset 级全景字段，不从历史 Canvas 节点反推全景素材 |

当前代码事实：

- `CanvasNodeMetadata` 已有 `panorama?: boolean`。
- 生成配置面板已经有“全景图”开关，直接写 `metadata.panorama`。
- `canvas-generation-orchestration.ts` 已有可测试 **Seam**：`CanvasImageGenerationRequester` 和 `CanvasNodeMediaAdapter`。
- `canvas-image-generation.ts` 仍直接实现配置节点、空图片节点、已有图片节点生图。
- `canvas-client-page.tsx` 的图片详情弹窗仍固定普通 `<img>` 缩放。
- `setBatchPrimary` 只传播 `content`、`primaryImageId`、`naturalWidth`、`naturalHeight`、`freeResize`，尚未传播 `panorama`。
- `canvas-node.tsx` 的图片节点仍只显示普通 `<img>` 和“以图生图 / 图生视频”快捷入口。
- `canvas-image-toolbar-tools.tsx` 仍无 `panorama` 工具，快捷工具 storage key 是 `canvas-image-quick-tools-v7`。
- `web/package.json` 尚未包含 `@photo-sphere-viewer/core`，项目使用 `bun.lock`。

## 3. 第一版范围

### 要做

- 复用 `CanvasNodeType.Image`，不新增全景节点类型。
- 复用 `CanvasNodeMetadata.panorama?: boolean`，不新增 projection、yaw、pitch、fov 字段。
- 支持文本节点、配置节点、空图片节点、已有图片节点的全景图片生成。
- 全景生成请求强制 `size: "2:1"`，并追加 equirectangular / seamless wrap prompt 约束。
- 生成结果、批量 root / child、重试和主图选择都不丢失 `panorama`。
- 图片详情根据 `panorama` 切换普通 `<img>` 查看和全景 viewer。
- 图片节点缩略图仍渲染普通 `<img>`，只增加低干扰“全景”标识。
- 图片工具栏提供“全景 / 平面”切换，并通过亮 / 暗状态反馈当前节点意图。
- 全景图片点“以图生图”时，图片生成链路可继续继承全景意图。
- 全景图片点“图生视频”时，只作为普通参考图，不生成或承诺 360 视频。

### 不做

- 不在画布节点内部初始化 WebGL viewer。
- 不做多场景 tour、热点、地图、楼层切换。
- 不做 cubemap、tiles、360 视频。
- 不做 asset 级全景认证字段。
- 不做素材库重新插入时的自动全景恢复。
- 不自研 WebGL 球面投影。
- 不新增只有一个 Adapter 的 provider seam。
- 不在第一版把所有图片生成分支强行迁入 `Canvas Generation Orchestration`。

## 4. Module 设计

### 4.1 Canvas Panorama Policy

**Seam**

新增文件：

```text
web/src/app/(user)/canvas/services/canvas-panorama-policy.ts
web/src/app/(user)/canvas/services/canvas-panorama-policy.test.ts
```

这是纯计算 **Module**。它不依赖 React，不依赖 Photo Sphere Viewer，不请求后端，不读写 store。它属于 `Canvas Node Semantics` 的一块集中规则：调用方只问“这个节点是否启用全景”和“全景请求应该怎么改”，不自己理解 2:1、prompt suffix、ratio warning。

**Interface**

建议第一版暴露：

```ts
export type CanvasPanoramaReadiness = {
    ready: boolean;
    warning?: string;
};

export function isCanvasPanoramaEnabled(node: CanvasNodeData | null | undefined): boolean;

export function buildCanvasPanoramaPrompt(prompt: string): string;

export function buildCanvasPanoramaGenerationConfig(config: AiConfig): AiConfig;

export function applyCanvasPanoramaMetadata(
    metadata: CanvasNodeMetadata | undefined,
    enabled: boolean,
): CanvasNodeMetadata;

export function getCanvasPanoramaReadiness(
    node: CanvasNodeData | null | undefined,
): CanvasPanoramaReadiness;
```

如果实现时希望兼容旧命名，可以让 `isPanoramaNode` 作为 `isCanvasPanoramaEnabled` 的别名，但新调用点应使用语义更清楚的名称。

**Implementation 规则**

- `isCanvasPanoramaEnabled` 只读 `Boolean(node?.metadata?.panorama)`，不判断 node type。
- `buildCanvasPanoramaGenerationConfig` 返回新对象，强制 `size: "2:1"`，保留其他字段。
- `buildCanvasPanoramaPrompt` 对空 prompt 返回空字符串。
- `buildCanvasPanoramaPrompt` 已包含 `equirectangular`、`360 panorama`、`360-degree panorama` 时不重复追加。
- prompt suffix 至少包含这些语义：
  - `equirectangular 360 panorama`
  - `2:1 aspect ratio`
  - `seamless horizontal wrap`
  - `complete environment in all directions`
  - `no text, no watermark, no border`
- `applyCanvasPanoramaMetadata(metadata, true)` 写入 `panorama: true`。
- `applyCanvasPanoramaMetadata(metadata, false)` 写入 `panorama: false`，不要删除字段；显式 false 能表达用户关闭意图。
- `getCanvasPanoramaReadiness` 只用于提示，不用于阻断。若 `naturalWidth` / `naturalHeight` 可用且比例明显不是 2:1，返回中文 warning；尺寸不可用时返回 ready。

**测试**

只测 **Interface**：

- 空节点、普通节点、全景节点的 enabled 判断。
- prompt 追加全景约束。
- prompt 已有全景词时不重复追加。
- config 返回 2:1，且不修改原对象。
- metadata true / false 写入。
- 2:1、非 2:1、无尺寸时的 readiness。

不要测试内部字符串拼接顺序，除非顺序成为外部可见行为。

### 4.2 Canvas Panorama Viewer

**Seam**

新增文件：

```text
web/src/app/(user)/canvas/components/canvas-panorama-viewer.tsx
```

这是 Photo Sphere Viewer 的外部 **Seam**。第三方库只应该出现在这个文件里。调用方不应该知道 viewer 如何创建、销毁、引入 CSS、处理 WebGL 错误或隔离事件。

**依赖**

```bash
cd /Users/a1/Desktop/my-canvas/web
bun add @photo-sphere-viewer/core
```

不要使用 `npm install`、`pnpm add` 或 `yarn add`。

**Interface**

```tsx
type CanvasPanoramaViewerProps = {
    src: string;
    title?: string;
    className?: string;
};

export function CanvasPanoramaViewer(props: CanvasPanoramaViewerProps) {}
```

**Implementation 规则**

- 文件顶部使用 `"use client"`。
- 在 `useEffect` 中初始化 `Viewer`。
- cleanup 时调用 `destroy()`。
- `src` 变化时重建或更新 panorama。
- 外层加 `data-canvas-no-zoom`。
- 阻止 `wheel`、`pointerdown`、`mousedown`、`dblclick` 冒泡，避免影响无限画布缩放、拖拽和双击。
- 容器必须有稳定宽高，避免初始化时宽高为 0。
- 初始化失败时展示中文错误文案。
- 优先测试能否在该 client 文件中 import `@photo-sphere-viewer/core/index.css`；如果 Next 构建不允许，再把第三方 CSS 放到应用根部或全局 CSS。全局 CSS 只放第三方必要样式。

### 4.3 Canvas Graph Mutations 补强

批量主图选择是图结构规则，不是 UI 规则。推荐新增或扩展 graph mutation **Interface**：

```ts
export function applyCanvasBatchPrimarySelection(input: {
    nodes: CanvasNodeData[];
    childNodeId: string;
}): CanvasNodeData[];
```

**Implementation 规则**

- 找到 child 的 `batchRootId`。
- child 没有 `content` 时返回原 nodes。
- root 写回 child 的 `content`、`primaryImageId`、`naturalWidth`、`naturalHeight`、`freeResize`。
- 同时写回 `panorama: child.metadata?.panorama`。
- 不在这里判断比例，不理解 viewer。

如果第一版为了减少改动选择仍在 `canvas-client-page.tsx` 里补字段，也必须把 `panorama` 写回 root；但从新的架构看，收进 `Canvas Graph Mutations` 更符合 **Locality**。

**测试**

在 `canvas-graph-mutations.test.ts` 增加：

- child 为全景时设为主图，root 获得 `panorama: true`。
- child 为普通图时设为主图，root 获得 `panorama: false` 或 undefined，按实现保持一致。
- child 无 content 时不变。

## 5. 生成链路实施

### 5.1 文本节点生图

入口：

```text
web/src/app/(user)/canvas/services/canvas-generation-orchestration.ts
```

当前 `generateCanvasTextToImage` 已经是合适的 **Seam**。在函数内部读取 source node 的全景意图：

```ts
const wantsPanorama = isCanvasPanoramaEnabled(sourceNode);
const requestPrompt = wantsPanorama
    ? buildCanvasPanoramaPrompt(input.effectivePrompt)
    : input.effectivePrompt;
const requestConfig = wantsPanorama
    ? buildCanvasPanoramaGenerationConfig(input.generationConfig)
    : input.generationConfig;
const panoramaMetadata = { panorama: wantsPanorama };
```

必须替换的使用点：

- root image node title / prompt 使用 `requestPrompt`。
- child image node title / prompt 使用 `requestPrompt`。
- `requestOneImage` 使用 `requestPrompt` 和 `requestConfig`。
- `buildImageGenerationMetadata` 使用 `requestConfig`，确保 metadata.size 是 `"2:1"`。
- asset intake context 使用 `requestPrompt` 和 `requestConfig`。
- success metadata 合并 `panoramaMetadata`。
- source text node 保留自己的 `panorama` 持久偏好，生成完成后不要自动关闭。

注意：source text node 的 `metadata.prompt` 可以继续保存用户输入 prompt；生成结果图片的 `metadata.prompt` 必须保存最终请求 prompt。

### 5.2 配置节点、空图片节点、已有图片节点生图

入口：

```text
web/src/app/(user)/canvas/[id]/hooks/canvas-image-generation.ts
```

这些分支仍在 hook 里，第一版直接在这里接入 policy。不要为了全景功能先做 generation orchestration 大迁移。

在 `generateCanvasImage` 计算 count、referenceImages、generationType 后，先计算请求参数：

```ts
const wantsPanorama = isCanvasPanoramaEnabled(sourceNode);
const requestPrompt = wantsPanorama
    ? buildCanvasPanoramaPrompt(effectivePrompt)
    : effectivePrompt;
const requestConfig = wantsPanorama
    ? buildCanvasPanoramaGenerationConfig(generationConfig)
    : generationConfig;
const generationMetadata = buildImageGenerationMetadata(
    generationType,
    requestConfig,
    count,
    referenceImages,
);
const panoramaMetadata = { panorama: wantsPanorama };
```

必须替换的使用点：

- root node title / prompt 使用 `requestPrompt`。
- child node title / prompt 使用 `requestPrompt`。
- root / child loading metadata 合并 `panoramaMetadata`。
- `requestGeneration` / `requestEdit` 使用 `requestConfig` 和 `requestPrompt`。
- `registerCanvasGeneratedImageAsset` context 使用 `requestPrompt` 和 `requestConfig`。
- success metadata 合并 `panoramaMetadata`。
- config node、empty image node、image node 自身的 `panorama` 不因生成完成自动关闭。

当前 hook 里 `generationMetadata` 创建较早。接入全景后，必须移动到 `requestConfig` 之后，否则 metadata 里的 `size` 会仍然是原尺寸。

### 5.3 重试

入口：

```text
web/src/app/(user)/canvas/services/canvas-generation-orchestration.ts
```

在 `retryCanvasGeneratedImage` 内计算：

```ts
const wantsPanorama = Boolean(
    input.savedImageMetadata?.panorama || input.node.metadata?.panorama,
);
const requestPrompt = wantsPanorama
    ? buildCanvasPanoramaPrompt(input.prompt)
    : input.prompt;
const requestConfig = wantsPanorama
    ? buildCanvasPanoramaGenerationConfig(input.generationConfig)
    : input.generationConfig;
```

必须替换的使用点：

- `requestOneImage` 使用 `requestPrompt` 和 `requestConfig`。
- `retryGenerationMetadata` 使用 `requestConfig`。
- asset intake context 使用 `requestPrompt` 和 `requestConfig`。
- success metadata 显式合并 `prompt: requestPrompt` 和 `panorama: wantsPanorama`。

这样失败后的全景图重试不会退回普通图片，也不会丢失 2:1 size。

### 5.4 以图生图与图生视频入口

入口：

```text
web/src/app/(user)/canvas/hooks/use-image-node-handlers.ts
```

行为要求：

- `handleImageToImage` 从全景图片创建图片生成节点时，应把 `panorama` 意图带到新图片生成节点。这个节点后续生成图片时继续走全景 prompt 和 2:1 config。
- `handleImageToVideo` 不传播 `panorama`。全景图片只作为普通参考图创建视频生成节点，不承诺 360 视频。
- 不新增视频级 `panorama` 字段，不改视频详情 viewer。

## 6. UI 实施

### 6.1 图片详情弹窗

入口：

```text
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

当前弹窗固定普通 `<img>`。改造后：

- `previewIsPanorama = isCanvasPanoramaEnabled(previewNode)`。
- 普通图片保留现有 `previewScale`、滚轮缩放、双击重置。
- 全景图片渲染 `CanvasPanoramaViewer`。
- 全景模式下不要套普通图片的滚轮缩放逻辑。
- 弹窗标题区分 `全景图详情` / `图片详情`。
- 如果 `getCanvasPanoramaReadiness(previewNode).warning` 有值，在详情内显示低干扰中文提示。
- 全景详情里的滚轮、拖拽、双击不影响底层画布。

### 6.2 图片节点缩略图

入口：

```text
web/src/app/(user)/canvas/components/canvas-node.tsx
```

行为要求：

- 图片缩略图继续用普通 `<img>`。
- 不在节点内初始化 WebGL viewer。
- `ImageContent` 使用 `isCanvasPanoramaEnabled(node)` 判断。
- 全景图片在右上角显示低视觉重量标识：`全景`。
- 标识不拦截事件。
- 保持“以图生图 / 图生视频”入口。

### 6.3 图片工具栏

入口：

```text
web/src/app/(user)/canvas/components/canvas-image-toolbar-tools.tsx
web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

实施要求：

- `ImageNodeActionToolId` 增加 `"panorama"`。
- `ImageToolHandlers` 增加 `onTogglePanorama`。
- 工具配置 key 从 `canvas-image-quick-tools-v7` 升到 `canvas-image-quick-tools-v8`。
- 默认工具集包含“全景”，接受老用户图片快捷工具配置重置一次。
- icon 优先使用 `lucide-react` 的 `Orbit`；如果当前版本不可用，选接近“环视 / 旋转”语义的现有 lucide 图标。

工具文案：

| 状态 | label | title |
| --- | --- | --- |
| active | 全景 | 切换为平面图片 |
| inactive | 平面 | 切换为全景图 |

交互语义：

- 图标亮色表示当前节点会按全景图处理。
- 图标暗色表示当前节点按普通图片或普通生成源处理。
- 对非图片生成源节点，亮色表示后续从该节点发起的图片生成会继续生成全景图，直到用户手动关闭。
- 生成完成后不要自动关闭源节点上的全景开关。

页面 handler 使用 `applyCanvasPanoramaMetadata`，不要在 UI 里手写 metadata 规则。

## 7. Asset 与媒体规则

### 7.1 Canvas Node Media 不加全景逻辑

`Canvas Node Media` 继续只处理媒体生命周期：

- hydrate object URL。
- materialize 生成图片。
- cleanup unused storage keys。
- collect storage keys。

它不处理：

- 2:1 比例判断。
- prompt 增强。
- Photo Sphere Viewer。
- `panorama` 清理。

### 7.2 上传与替换

当前 `cleanUploadedMediaMetadata` 不清理 `panorama`。第一版保留这个行为：

- 用户把一个节点切成全景后，替换图片仍保留该节点的全景意图。
- 替换后的图片不是 2:1 时，只在打开详情时提示可能变形。
- 不在 upload/media Module 中判断比例。

### 7.3 本地素材库重新插入

从本地素材库重新插入图片时：

- 新 Canvas 图片节点默认普通图片。
- 不自动恢复历史全景状态。
- 不给 asset 增加全景 metadata。
- 不根据历史 Canvas 节点反推 asset 是否为全景素材。

原因：`panorama` 是 Canvas 节点意图，不是 asset 级认证属性。同一个 asset 可以在一个 Canvas 节点按全景图使用，在另一个 Canvas 节点按普通图片使用。

## 8. 实施顺序

### Step 1：新增 Canvas Panorama Policy

改动：

```text
web/src/app/(user)/canvas/services/canvas-panorama-policy.ts
web/src/app/(user)/canvas/services/canvas-panorama-policy.test.ts
```

完成标准：

- Interface 和测试通过。
- 无 React、无 viewer、无后端请求。
- 能表达 enabled、prompt、config、metadata、readiness。

### Step 2：接入文本生图和重试

改动：

```text
web/src/app/(user)/canvas/services/canvas-generation-orchestration.ts
web/src/app/(user)/canvas/services/canvas-generation-orchestration.test.ts
```

完成标准：

- 文本生图全景请求使用 2:1 和最终 prompt。
- root / child / success metadata 保留全景状态。
- source text node 的全景偏好不自动关闭。
- 重试保留全景状态。
- asset intake context 使用最终请求 prompt/config。

### Step 3：接入配置节点和图片节点生图

改动：

```text
web/src/app/(user)/canvas/[id]/hooks/canvas-image-generation.ts
```

完成标准：

- 配置节点、空图片节点、已有图片节点都应用 requestPrompt/requestConfig。
- `generationMetadata` 使用 requestConfig。
- root / child loading 和 success metadata 都不丢 `panorama`。
- 生成完成后源节点开关不自动关闭。

### Step 4：补齐图结构传播

推荐改动：

```text
web/src/app/(user)/canvas/utils/canvas-graph-mutations.ts
web/src/app/(user)/canvas/utils/canvas-graph-mutations.test.ts
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

完成标准：

- 批量 child 设为主图时，root 同步 `panorama`。
- 页面只调用 graph mutation，不自己理解 batch primary 规则。

### Step 5：安装 viewer 依赖并新增 Viewer Module

命令：

```bash
cd /Users/a1/Desktop/my-canvas/web
bun add @photo-sphere-viewer/core
```

改动：

```text
web/src/app/(user)/canvas/components/canvas-panorama-viewer.tsx
```

完成标准：

- viewer 初始化、销毁、src 变化处理完整。
- 事件隔离完整。
- 错误状态为中文。
- 容器尺寸稳定。
- 第三方库细节不泄漏到调用方。

### Step 6：接入图片详情、节点标识和工具栏

改动：

```text
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
web/src/app/(user)/canvas/components/canvas-node.tsx
web/src/app/(user)/canvas/components/canvas-image-toolbar-tools.tsx
web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx
```

完成标准：

- 全景详情打开 viewer，普通图片仍走原缩放。
- 非 2:1 全景图可查看，并提示可能变形。
- 图片节点显示低干扰“全景”标识。
- 工具栏有“全景 / 平面”切换。
- storage key 升到 v8。

### Step 7：补齐 image-to-image / image-to-video 边界

改动：

```text
web/src/app/(user)/canvas/hooks/use-image-node-handlers.ts
```

完成标准：

- 全景图片创建“以图生图”节点时继承 `panorama`。
- 全景图片创建“图生视频”节点时不继承 `panorama`。

## 9. 验收清单

功能验收：

- 文本节点打开“全景图”后生成图片，请求 config 为 2:1，生成结果进入全景模式。
- 配置节点打开“全景图”后生成图片，请求 config 为 2:1，生成结果进入全景模式。
- 空图片节点打开“全景图”后生成图片，原节点成为全景图片。
- 已有图片节点为全景时再次生图，输出仍为全景图片。
- 批量生成全景图，root 和 child 都可全景查看。
- 批量 child 设为主图后，root 不丢全景状态。
- 失败后重试全景图片，不退回普通图片。
- 替换全景节点图片后，节点仍按全景图查看。
- 从素材库重新插入同一张图片，新节点默认普通图片。
- 全景图片“以图生图”继承全景意图。
- 全景图片“图生视频”只生成普通视频工作流节点。
- 普通图片详情仍支持原缩放、滚轮、双击重置。
- 全景详情里的滚轮、拖拽、双击不影响底层画布。
- 非 2:1 全景图片可以打开 viewer，并看到轻提示。
- 下载、保存素材、裁剪、局部编辑、超分等普通图片工具不因全景标记回退。

测试验收：

- `canvas-panorama-policy.test.ts` 覆盖 policy **Interface**。
- `canvas-generation-orchestration.test.ts` 覆盖文本生图和重试的全景 prompt/config/metadata。
- `canvas-graph-mutations.test.ts` 覆盖批量主图传播 `panorama`。
- `canvas-image-generation.ts` 里仍留在 hook 的分支至少通过现有测试或新增薄测试覆盖 requestPrompt/requestConfig/metadata。不要测试 hook 内部临时变量。
- Viewer 的自动测试只测可观察行为：空 src、容器渲染、unmount destroy、错误状态。不要测试 Photo Sphere Viewer 内部。

建议实施后运行：

```bash
cd /Users/a1/Desktop/my-canvas/web
bun run test
bun run typecheck
```

## 10. 风险与处理

### WebGL 黑屏

处理：

- viewer 容器固定稳定尺寸。
- 使用当前 `metadata.content`，通常是 blob URL、data URL 或可解析 URL。
- 初始化失败展示中文错误。
- 必要时手动验证桌面和移动尺寸下 viewer 非空。

### 非 2:1 图片变形

处理：

- 第一版不阻断。
- `getCanvasPanoramaReadiness` 只产生提示。
- 不把比例校验放进 media Module。

### 事件穿透

处理：

- viewer 外层 `data-canvas-no-zoom`。
- viewer 外层阻止 wheel / pointer / mouse / double click 冒泡。
- 不在节点缩略图内启用 WebGL。

### 工具栏默认项看不到

处理：

- storage key 直接升到 `canvas-image-quick-tools-v8`。
- 不做旧配置迁移。

### 生成模型不听全景约束

处理：

- 前端只保证请求语义：2:1 config + 全景 prompt。
- 后端支持 `AiConfig.size = "2:1"`。
- 真实无缝全景质量由模型能力决定。
- 后续接专门全景模型时，再设计模型选择 **Seam**。

## 11. 第二阶段 deepening

第一版完成后，再考虑继续加深 `Canvas Generation Orchestration`。目标是把当前仍散在 hook 里的配置节点、空图片节点、已有图片节点、视频、音频生成分支逐步收进更深的 generation **Module**。

推荐方向：

```ts
export type CanvasImageGenerationSourceKind =
    | "text"
    | "config"
    | "image"
    | "empty-image";

export async function generateCanvasImageOnCanvas(
    input: CanvasImageGenerationInput,
): Promise<CanvasImageGenerationResult>;
```

这个更深的 **Interface** 应隐藏：

- root / child 节点如何创建。
- batch connections 如何创建。
- 空图片节点何时复用 source id。
- request / edit 如何选择。
- media 如何 materialize。
- asset intake context 如何写。
- graph mutation success / error 如何回填。
- 全景 prompt/config/metadata 如何传播。

这不是第一版全景功能的前置条件。第一版优先完成用户可见闭环，并把全景语义集中在 policy **Module**，避免将规则散落到 UI。

## 12. 后续能力

这些能力明确不属于第一版，可以按价值单独设计：

1. 节点选中态内嵌全景预览。
2. 保存初始视角。
3. 从全景当前视角导出普通图片节点。
4. cubemap 支持。
5. 超大图 tiles 支持。
6. 全景热点和多场景 tour。
7. 360 视频。
8. 专门全景生成模型或 ComfyUI 工作流。

每次扩展前都重新做 deletion test：

- 删除新 **Module** 后，复杂度会不会回到多个调用方？
- 是否真的有第二个 **Adapter**，值得新增 **Seam**？
- 新字段是否产生真实 **Leverage**，还是只是提前扩大 **Interface**？

