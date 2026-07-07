# 画布全景图能力集成流程

本文使用 `codebase-design` 的词汇重新编排画布全景图能力的实施流程。目标不是先堆功能，而是先找到合适的 **Seam**，把全景查看、全景生成策略、节点状态传播收进少量有深度的 **Module** 里，让调用方只学习很小的 **Interface**。

调研日期：2026-07-06。

## 1. 目标

在当前 `/canvas` 中支持这类工作流：

```text
用户生成或上传一张 2:1 等距矩形全景图
        ↓
图片节点标记为全景图
        ↓
节点仍按普通图片参与画布排布、连线、下载、保存素材
        ↓
打开图片详情时进入可拖拽、可缩放的 360 全景查看
```

第一版只做稳定闭环：

- 复用现有 `CanvasNodeType.Image`，不新增全景节点类型。
- 复用现有 `metadata.panorama?: boolean` 字段。
- 图片节点缩略图仍按普通图片显示。
- 图片详情弹窗中根据 `metadata.panorama` 切换普通图片查看或全景查看。
- 图片工具栏提供“全景 / 平面”切换。
- 生成配置中的“全景图”开关要传播到生成结果。
- 打开“全景图”生成时，生成策略默认使用 2:1 尺寸，并给 prompt 追加全景约束。

第一版不做：

- 不做画布内实时 WebGL 全景预览。
- 不做多场景虚拟漫游。
- 不做热点、地图、楼层切换。
- 不做 cubemap 或切片格式。
- 不自研 WebGL 球面投影。
- 不把 Photo Sphere Viewer 抽象成可插拔 provider。当前只有一个生产实现，先不要制造假 seam。

## 2. 技术原理

RHTV 或其他无线画布里的“720 度全景”通常是产品说法。工程上最常见的是：

1. 生成一张 **equirectangular panorama**，即等距矩形全景图。
2. 图片通常是 2:1 比例，例如 `2048x1024`、`4096x2048`。
3. 前端用 WebGL 把图片贴到球体内侧。
4. 相机放在球体中心。
5. 拖拽时改变相机的 yaw、pitch、fov，看起来就能前后左右环绕。

因此功能分为两个问题：

- 查看：把一张 equirectangular 图片投影到球面内侧。
- 生成：让 AI 更可能产出 2:1、左右可无缝衔接的 equirectangular 图片。

这两个问题不要混成一个大实现。查看能力和生成策略应放在不同 **Module** 中。

## 3. 开源方案选择

推荐第一版使用 Photo Sphere Viewer：

- 项目地址：https://github.com/mistic100/Photo-Sphere-Viewer
- 文档：https://photo-sphere-viewer.js.org/
- npm：https://www.npmjs.com/package/@photo-sphere-viewer/core
- 协议：MIT
- 能力：支持 equirectangular panorama、cubemap、拖拽、缩放、触摸、移动端交互。

备选方案：

- Pannellum：https://pannellum.org/
  - 很轻，适合 iframe 或简单页面嵌入。
  - 对当前 React / Next 深度集成不如 Photo Sphere Viewer 顺手。
- Marzipano：https://www.marzipano.net/
  - 适合虚拟漫游、多场景、热点、超大图。
  - 第一版只是图片节点全景查看，用它偏重。
- egjs-view360：https://naver.github.io/egjs-view360/
  - 适合后续 360 视频、VR、更多投影格式。
  - 当前最小切片不需要。

选择原则：

- 不自研复杂标准实现。
- 优先成熟开源库。
- 先把第三方库藏在一个小 **Interface** 后面，不让调用方知道 Photo Sphere Viewer 的生命周期、CSS、销毁、事件隔离细节。

## 4. 当前代码里的现成入口

当前项目已经有一半地基：

- 数据模型已有 `metadata.panorama?: boolean`：
  - `web/src/app/(user)/canvas/types.ts`
- 生成配置面板已有“全景图”开关：
  - `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- 图片节点目前只渲染普通 `<img>`：
  - `web/src/app/(user)/canvas/components/canvas-node.tsx`
- 图片详情弹窗目前也只渲染普通 `<img>`：
  - `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- 图片生成链路目前没有把 `panorama` 写入生成结果：
  - `web/src/app/(user)/canvas/[id]/hooks/canvas-image-generation.ts`

因此正确方向是：深化现有 Image 节点能力，而不是新增一套全景节点系统。

## 5. 推荐模块图

```text
Canvas Panorama
├── Canvas Panorama Policy Module
│   ├── 判断节点是否是全景图
│   ├── 构造全景生成 prompt
│   ├── 构造全景生成 config patch
│   └── 给生成结果写入全景 metadata
├── Canvas Panorama Viewer Module
│   ├── 初始化 Photo Sphere Viewer
│   ├── 处理销毁
│   ├── 隔离 pointer / wheel 事件
│   ├── 隐藏第三方 CSS 和 WebGL 生命周期
│   └── 显示错误和加载状态
└── Canvas Image Node Integration
    ├── 图片详情弹窗选择普通查看或全景查看
    ├── 图片工具栏切换全景状态
    └── 图片生成结果继承全景状态
```

这里的 `Canvas Panorama` 是一个产品能力簇，但实施时不要做成一个巨大文件。真正要落地的是两个有清晰 **Interface** 的 **Module**：

- `Canvas Panorama Policy Module`
- `Canvas Panorama Viewer Module`

## 6. Module 1：Canvas Panorama Policy Module

### 6.1 Seam

建议放在：

```text
web/src/app/(user)/canvas/utils/canvas-panorama.ts
```

这是一个纯计算 **Module**。它不依赖 React、不依赖 Photo Sphere Viewer、不读写 store。

### 6.2 Interface

建议第一版只暴露少量函数：

```ts
export function isPanoramaNode(node: CanvasNodeData | null | undefined): boolean;

export function buildPanoramaPrompt(prompt: string): string;

export function buildPanoramaGenerationConfig(config: AiConfig): AiConfig;

export function applyPanoramaMetadata<T extends CanvasNodeMetadata>(
    metadata: T,
    enabled: boolean,
): T;
```

这个 **Interface** 的调用方只需要知道：

- 给一个 node，能判断是不是全景图。
- 给一个 prompt，能得到适合全景生成的 prompt。
- 给一个生成 config，能得到适合全景图的 config。
- 给一段 metadata，能把全景状态写进去。

调用方不需要知道：

- 2:1 尺寸具体怎么选。
- prompt 追加哪些英文约束。
- 未来是否要加入 projection 类型。
- ratio 校验阈值是多少。

### 6.3 Implementation

第一版 Implementation 规则：

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

`buildPanoramaPrompt(prompt)` 的行为：

- 如果 prompt 为空，返回空字符串。
- 如果 prompt 已经包含明显的 `equirectangular` 或 `360 panorama`，不要重复追加一大段。
- 否则追加全景约束。

`buildPanoramaGenerationConfig(config)` 的行为：

- 返回新对象，不修改原对象。
- 强制 `size: "2:1"`。
- 保留 model、quality、count、systemPrompt、channelMode 等原设置。

`applyPanoramaMetadata(metadata, enabled)` 的行为：

- `enabled === true` 时写入 `panorama: true`。
- `enabled === false` 时可以删除或写入 `panorama: false`，建议写入 `false`，方便持久化和调试。

### 6.4 Depth

这个 **Module** 的深度来自：

- 调用方不用重复写 prompt suffix。
- 调用方不用重复决定 2:1 尺寸。
- 调用方不用关心未来是否加入 `panoramaProjection`。
- 测试可以直接穿过这个 **Interface** 覆盖生成策略。

### 6.5 测试

建议新增：

```text
web/src/app/(user)/canvas/utils/canvas-panorama.test.ts
```

测试只测 **Interface**：

- `isPanoramaNode` 对空节点、普通图片、全景图片的判断。
- `buildPanoramaPrompt` 会追加全景约束。
- `buildPanoramaPrompt` 不重复追加全景约束。
- `buildPanoramaGenerationConfig` 返回 `size: "2:1"` 且不修改原对象。
- `applyPanoramaMetadata` 正确写入或关闭全景状态。

不要测试内部字符串拼接细节，除非该字符串是外部可见行为。

## 7. Module 2：Canvas Panorama Viewer Module

### 7.1 Seam

建议放在：

```text
web/src/app/(user)/canvas/components/canvas-panorama-viewer.tsx
```

这是全景查看的外部 **Seam**。Photo Sphere Viewer 只应该出现在这个文件内。

### 7.2 Interface

建议第一版 **Interface**：

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
- 给它一个尺寸容器。

调用方不需要知道：

- Photo Sphere Viewer 怎么创建。
- Photo Sphere Viewer 怎么销毁。
- CSS 在哪里引入。
- 哪些事件需要 stopPropagation。
- WebGL 初始化失败如何显示。
- 容器尺寸变化怎么刷新。

### 7.3 Implementation

第一版 Implementation 要处理：

- `useEffect` 中初始化 viewer。
- `useEffect` cleanup 中销毁 viewer。
- `src` 变化时重建或更新 panorama。
- 外层加 `data-canvas-no-zoom`。
- 阻止 `wheel`、`pointerdown`、`mousedown`、`dblclick` 冒泡，避免和无限画布缩放、拖拽、双击冲突。
- 容器最小尺寸稳定，避免初始化时容器为 0 导致黑屏。
- 初始化失败时显示中文错误文案。

第三方 CSS 建议按 Next 规则集中引入：

- 若 Next 允许在该 client 文件中引入第三方 CSS，可直接引入。
- 若构建报全局 CSS 限制，则在 `web/src/app/globals.css` 或应用根部统一引入。全局 CSS 这里只放第三方库必要样式，不放页面私有样式。

### 7.4 是否需要 Adapter

第一版不建议定义 `PanoramaRuntime`、`PanoramaProvider` 之类的外部 **Seam**。

原因：

- 当前只有 Photo Sphere Viewer 一个生产实现。
- 没有 Pannellum / Marzipano 的第二个 **Adapter**。
- 按 `codebase-design` 原则，一个 **Adapter** 意味着 seam 只是想象出来的。

可以接受的做法：

- 在 `CanvasPanoramaViewer` 内部把 Photo Sphere Viewer 当作内部实现细节。
- 测试时如果需要，mock dynamic import 或只测纯策略 **Module**。
- 等未来真的要支持 Pannellum 或 Marzipano，再抽出 `PanoramaRuntime` seam。

## 8. 集成点 1：图片详情弹窗

### 8.1 当前入口

文件：

```text
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

当前逻辑：

- `previewNodeId` 决定打开哪个节点的图片详情。
- 弹窗内直接渲染 `<img>`。
- 滚轮用于普通图片缩放。

### 8.2 改造流程

1. 引入 `isPanoramaNode`。
2. 引入 `CanvasPanoramaViewer`。
3. 根据 `isPanoramaNode(previewNode)` 分支渲染：

```tsx
{isPanoramaNode(previewNode) ? (
    <CanvasPanoramaViewer src={previewNode.metadata.content} title={previewNode.title} />
) : (
    <普通图片缩放查看 />
)}
```

4. 弹窗标题可根据模式显示：

```text
全景图详情
图片详情
```

5. 全景模式下不要套普通图片滚轮缩放逻辑。滚轮应交给全景 viewer 处理。

### 8.3 验收

- 普通图片详情行为不变。
- 全景图片详情可以拖拽左右旋转。
- 在全景详情中滚轮不会缩放底层画布。
- 双击全景详情不会触发画布节点编辑或重置普通图片缩放。

## 9. 集成点 2：图片节点显示

### 9.1 当前入口

文件：

```text
web/src/app/(user)/canvas/components/canvas-node.tsx
```

当前 `ImageContent` 中直接渲染 `<img>`。

### 9.2 第一版建议

节点内仍显示普通 `<img>` 缩略图，不直接嵌入 WebGL viewer。

原因：

- 画布可能有很多图片节点。
- 每个节点都初始化 WebGL viewer 会增加内存和显卡压力。
- 节点内拖拽会和画布拖拽、框选、连线、缩放抢事件。
- 缩略图只需要告诉用户“这是一张全景图”，真正交互放到详情弹窗。

### 9.3 改造流程

1. `ImageContent` 判断 `node.metadata?.panorama`。
2. 如果是全景图，在图片右上角显示一个小标识：

```text
全景
```

3. 标识只做展示，不拦截事件。
4. 保持现有底部“以图生图 / 图生视频”操作不变。

### 9.4 后续可选

等弹窗全景查看稳定后，再考虑“选中节点时内嵌全景预览”。那会是第二个切片，不要混进第一版。

## 10. 集成点 3：图片工具栏切换全景状态

### 10.1 当前入口

涉及文件：

```text
web/src/app/(user)/canvas/components/canvas-image-toolbar-tools.tsx
web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

### 10.2 Interface

给图片工具定义增加一个操作：

```ts
onTogglePanorama: (node: CanvasNodeData) => void;
```

工具 id：

```ts
"panorama"
```

文案：

```text
全景
平面
```

### 10.3 改造流程

1. 在 `ImageNodeActionToolId` 中加入 `"panorama"`。
2. 在 `ImageToolHandlers` 中加入 `onTogglePanorama`。
3. 在 `imageToolDefinitions` 中加入一个工具：
   - active：`Boolean(node.metadata?.panorama)`
   - label：active 时显示 `全景` 或 `退出全景`，最终文案以 UI 空间为准。
   - icon：优先用 `lucide-react` 中接近全景/环绕语义的图标，例如 `Orbit`、`PanelsTopLeft` 或 `CircleDot`。
4. 在 `CanvasNodeHoverToolbar` 中接收并传递 `onTogglePanorama`。
5. 在 `canvas-client-page.tsx` 中实现：

```ts
const toggleNodePanorama = useCallback((node: CanvasNodeData) => {
    setNodes((prev) =>
        prev.map((item) =>
            item.id === node.id
                ? { ...item, metadata: { ...item.metadata, panorama: !item.metadata?.panorama } }
                : item,
        ),
    );
}, []);
```

### 10.4 是否需要 ratio 校验

第一版不阻止用户把非 2:1 图片标记为全景图。

建议只做非阻断提醒：

- 如果 `naturalWidth / naturalHeight` 明显不是 2:1，打开全景详情时显示轻提示：
  - `这张图片不是 2:1，全景查看可能会变形`

不要为了这个提醒引入新的 store 状态。

## 11. 集成点 4：生成配置传播

### 11.1 当前入口

生成配置面板已经有“全景图”开关：

```text
web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx
```

真正要改的是生成链路：

```text
web/src/app/(user)/canvas/[id]/hooks/canvas-image-generation.ts
```

### 11.2 改造流程

在 `generateCanvasImage` 中：

1. 读取源节点全景意图：

```ts
const wantsPanorama = Boolean(sourceNode?.metadata?.panorama);
```

2. 如果 `wantsPanorama`：

```ts
const requestPrompt = buildPanoramaPrompt(effectivePrompt);
const requestConfig = buildPanoramaGenerationConfig(generationConfig);
```

3. 如果不是：

```ts
const requestPrompt = effectivePrompt;
const requestConfig = generationConfig;
```

4. 请求图片时使用 `requestPrompt` 和 `requestConfig`。
5. 创建 rootNode / childNodes 的 metadata 时写入：

```ts
panorama: wantsPanorama || undefined
```

6. `buildImageGenerationMetadata` 中记录的 `size` 应是实际请求尺寸，即全景模式下为 `2:1`。
7. title 和 prompt 快照建议使用 `requestPrompt` 或同时保存：
   - `prompt`: 用户原始有效 prompt
   - `lastEffectivePrompt`: 含全景约束的 prompt

当前 metadata 没有 `lastEffectivePrompt` 字段。如果不想扩字段，第一版可以让 `prompt` 保存最终请求 prompt。

### 11.3 空图片节点

如果用户选中空图片节点并在其配置中打开全景图：

- 生成后该空图片节点变成图片节点。
- 该节点 metadata 应包含 `panorama: true`。
- 尺寸由真实图片比例决定，通常会被 `fitNodeSize` 处理为 2:1 缩略图。

### 11.4 批量生成

如果 `count > 1`：

- rootNode 和所有 childNodes 都应继承 `panorama: true`。
- 设置主图时，rootNode 保持 `panorama: true`。
- 批量展开、收起逻辑不需要知道全景细节。

这就是 **Leverage**：批量节点不需要新增全景分支，只要 metadata 正确传播。

## 12. 数据模型

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

- 当前只有 equirectangular。
- 当前没有保存初始视角的用户需求。
- 当前没有 cubemap 或 tiles。
- 新字段会扩大 **Interface**，但暂时没有产生对应 **Leverage**。

等出现真实需求后再加。

## 13. 推荐实施顺序

### Step 1：新增纯策略 Module

新增：

```text
web/src/app/(user)/canvas/utils/canvas-panorama.ts
web/src/app/(user)/canvas/utils/canvas-panorama.test.ts
```

完成：

- 全景判断。
- 全景 prompt。
- 全景 config。
- metadata 写入。
- 单元测试。

这是最安全的第一步，因为不碰 UI，也不碰第三方库。

### Step 2：新增 Viewer Module

安装依赖：

```bash
cd /Users/a1/Desktop/my-canvas/web
npm install @photo-sphere-viewer/core
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

### Step 3：接入图片详情弹窗

修改：

```text
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

完成：

- 全景图打开 `CanvasPanoramaViewer`。
- 普通图保留现有 `<img>` 缩放逻辑。
- 弹窗标题区分全景 / 普通。

### Step 4：给图片节点加全景标识

修改：

```text
web/src/app/(user)/canvas/components/canvas-node.tsx
```

完成：

- 图片缩略图不变。
- 全景图片显示低干扰小标识。
- 不初始化节点内 WebGL。

注意：该文件当前可能已有用户改动，实施前必须重新读文件并小心合并。

### Step 5：工具栏加入全景切换

修改：

```text
web/src/app/(user)/canvas/components/canvas-image-toolbar-tools.tsx
web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

完成：

- 图片工具中出现“全景”切换。
- 修改当前节点 metadata。
- 可通过工具设置隐藏或显示。

### Step 6：生成链路传播全景状态

修改：

```text
web/src/app/(user)/canvas/[id]/hooks/canvas-image-generation.ts
```

完成：

- 读取配置节点的 `metadata.panorama`。
- 生成请求强制 `size: "2:1"`。
- prompt 追加全景约束。
- 生成结果写入 `panorama: true`。
- 批量结果都继承全景状态。

### Step 7：手动验证

验证场景：

- 上传一张 2:1 全景图，切换为全景，打开详情可拖拽。
- 上传一张普通图，打开详情仍为普通图片缩放。
- 生成配置打开“全景图”，生成后输出节点自动带全景标识。
- 批量生成全景图，每张候选都可全景查看。
- 在全景详情里滚轮、拖拽不影响底层画布。
- 下载、保存素材、以图生图、图生视频不受影响。

## 14. 测试策略

优先测试纯 **Module**：

```text
canvas-panorama.test.ts
```

覆盖：

- 全景判断。
- prompt 增强。
- config patch。
- metadata patch。

对 React / WebGL 部分，第一版以手动验证为主。Photo Sphere Viewer 本身已经承担渲染复杂度，本项目只需验证：

- lifecycle 没有明显报错。
- 事件没有穿透到画布。
- src 变化能刷新。
- 错误状态能显示。

如果要补自动测试，不要测试 Photo Sphere Viewer 内部。只测试 `CanvasPanoramaViewer` 的可观察行为：

- 有容器。
- 传空 src 时显示错误或空状态。
- unmount 时调用 destroy。这里可以 mock 第三方构造函数。

## 15. 删除测试

想象删除 `Canvas Panorama Policy Module`：

- prompt 全景约束会散落到生成链路。
- 2:1 尺寸规则会散落到生成链路。
- metadata 写入会散落到 rootNode、childNode、retry 逻辑。
- 测试要跨多个调用点重复断言。

所以它值得存在。

想象删除 `Canvas Panorama Viewer Module`：

- Photo Sphere Viewer 初始化会散落到图片详情弹窗。
- CSS 引入、销毁、事件隔离会散落到 UI 文件。
- 未来若要节点内预览或素材预览，会重复第三方库生命周期。

所以它也值得存在。

但想象新增 `PanoramaProvider` seam：

- 当前只有一个 Photo Sphere Viewer **Adapter**。
- 删除它以后复杂度不会回到多个真实调用方，而只是少了一层转发。

所以第一版不要加。

## 16. 风险和处理

### 16.1 WebGL 黑屏

可能原因：

- 容器初始化时宽高为 0。
- 图片跨域不可用。
- 图片不是浏览器可加载 URL。

处理：

- 容器设置稳定 `min-height`。
- 使用已有 `metadata.content`，项目本地图片通常是 blob URL 或 data URL。
- 初始化失败显示中文错误。

### 16.2 图片比例不对导致变形

处理：

- 不阻断。
- 打开详情时轻提示。
- 后续可在 `Canvas Panorama Policy Module` 增加 `getPanoramaReadiness(node)`。

### 16.3 事件穿透到底层画布

处理：

- viewer 外层统一 `data-canvas-no-zoom`。
- viewer 外层阻止 wheel / pointer / mouse / double click 冒泡。
- 不在画布节点缩略图里直接启用交互 viewer。

### 16.4 生成模型不听 2:1 或全景 prompt

处理：

- 前端只能提高概率，不能保证模型一定产出真实无缝全景。
- 生成请求强制 `size: "2:1"`。
- prompt 加 equirectangular 和 seamless horizontal wrap。
- 后续如果接专门全景模型，再做生成 **Adapter**，不要在第一版引入。

## 17. 后续演进

第一版完成后，可以按价值继续加：

1. 节点内选中态全景预览。
2. 保存初始视角。
3. 全景截图，导出当前视角为普通图片节点。
4. cubemap 支持。
5. 超大图 tiles 支持。
6. 全景热点和多场景 tour。
7. 360 视频。
8. 接入专门的全景生成模型，例如 SDXL 360 Diffusion、PanFusion、Diffusion360 或 ComfyUI 工作流。

每一步都要重新问：

- 新能力是否需要扩大现有 **Interface**？
- 是否真的有第二个 **Adapter**，值得新增 seam？
- 删除该 **Module** 时，复杂度会回到几个调用方？

## 18. 最小完成定义

第一版完成后，应满足：

- 用户能把任意图片节点切换为全景图。
- 全景图打开详情后可以拖拽环视。
- 普通图片行为不回退。
- 生成配置打开“全景图”后，生成结果自动进入全景模式。
- 生成请求使用 2:1 尺寸。
- 全景 prompt 逻辑有测试。
- 全景 viewer 的第三方库细节不泄漏到多个调用方。
- 没有新增浅层转发 **Module**。

