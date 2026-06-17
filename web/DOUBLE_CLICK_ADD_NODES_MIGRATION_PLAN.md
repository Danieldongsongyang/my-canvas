# 双击画布弹出 Add Nodes 菜单迁移计划

## 背景

目标是在 `/Users/a1/Desktop/infinite-canvas/web` 项目中迁移 TwitCanva 的交互：

```txt
双击画布空白区域
  -> 在鼠标位置弹出 Add Nodes 菜单
  -> 选择 Text / Image / Video / Audio / Config 等节点类型
  -> 在双击位置创建对应节点
```

本文档只写迁移方案，暂不执行代码改造。确认后再按文档逐步修改。

## 参考来源

源项目是：

```txt
/Users/a1/Desktop/无限画布项目汇总/TwitCanva-Video-Workflow
```

TwitCanva 当前实现分三段：

1. 画布绑定双击：

```tsx
// src/App.tsx
onDoubleClick={handleDoubleClick}
```

2. 双击空白画布时打开 `add-nodes` 菜单：

```ts
// src/hooks/useContextMenuHandlers.ts
const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).id === 'canvas-background') {
        setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            type: 'add-nodes'
        });
    }
}, [setContextMenu]);
```

3. Add Nodes 菜单点击节点类型后创建节点：

```tsx
// src/components/ContextMenu.tsx
<MenuItem
  icon={<Type size={18} />}
  label={isConnector ? "Text Generation" : "Text"}
  onClick={() => onSelectType(NodeType.TEXT)}
/>
```

最终会进入：

```ts
// src/hooks/useNodeManagement.ts
addNode(type, contextMenu.x, contextMenu.y, undefined, viewport);
```

核心思想不是复制文件，而是迁移这条行为链路：

```txt
画布双击
  -> 记录菜单屏幕坐标和画布坐标
  -> 渲染 Add Nodes 菜单
  -> 选择类型
  -> 调用目标项目已有 createNode(type, position)
```

## 目标项目当前结构

目标项目是：

```txt
/Users/a1/Desktop/infinite-canvas/web
```

画布相关代码主要在：

```txt
src/app/(user)/canvas/[id]/canvas-client-page.tsx
src/app/(user)/canvas/components/infinite-canvas.tsx
src/app/(user)/canvas/components/canvas-context-menu.tsx
src/app/(user)/canvas/components/canvas-left-menu.tsx
src/app/(user)/canvas/components/canvas-toolbar.tsx
src/app/(user)/canvas/types.ts
src/app/(user)/canvas/constants.ts
```

当前已有节点创建函数：

```ts
// src/app/(user)/canvas/[id]/canvas-client-page.tsx
const createNode = useCallback(
    (type: CanvasNodeType, position?: Position) => {
        const targetPosition = position || getCanvasCenter();
        ...
        const newNode = createCanvasNode(type, targetPosition, configMetadata);

        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeIds(new Set([newNode.id]));
        setSelectedConnectionId(null);
        if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio) setDialogNodeId(newNode.id);
    },
    [...]
);
```

这个函数已经支持传入画布坐标：

```ts
createNode(CanvasNodeType.Text, position)
```

所以双击菜单不需要新增节点创建底层逻辑，只需要把双击点转换成画布坐标后传给 `createNode`。

当前已有连接创建菜单：

```ts
function ConnectionCreateMenu({ pending, onCreate, onClose }: ...)
```

它已经有一组节点类型入口：

```tsx
文本生成
图片生成
视频生成
音频参考
配置节点
```

这套视觉风格适合作为 Add Nodes 菜单的参考，建议新建一个轻量的 `CanvasAddNodesMenu`，而不是把 Add Nodes 塞进现有 `CanvasNodeContextMenu`。

## 当前缺口

目标项目目前没有“空白画布全局 Add Nodes 菜单”：

1. `InfiniteCanvas` 支持 `onContextMenu`，但没有 `onDoubleClick`。
2. `preventCanvasContextMenu` 目前只是阻止空白画布右键默认菜单并关闭菜单：

```ts
const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
    if ((event.target as HTMLElement).closest("[data-node-id]")) return;
    event.preventDefault();
    setContextMenu(null);
}, []);
```

3. `ContextMenuState` 当前只支持：

```ts
type ContextMenuState =
    | { type: "node"; ... }
    | { type: "connection"; ... };
```

4. `CanvasNodeContextMenu` 当前只处理节点/连线操作：

```txt
node: Duplicate / Delete
connection: Delete
```

因此本次迁移需要新增一个“画布空白区域 Add Nodes 菜单状态”和一个菜单组件。

## 推荐设计

推荐不要把 Add Nodes 混进 `CanvasNodeContextMenu`。原因：

1. `CanvasNodeContextMenu` 名字和行为都偏向节点/连线操作。
2. Add Nodes 是画布空白区域菜单，和 node / connection 上下文不同。
3. 未来如果要支持右键空白画布菜单，可以复用同一个 Add Nodes 菜单。

建议新增一套独立状态：

```ts
type AddNodesMenuState = {
    x: number;          // 屏幕坐标，用于菜单 fixed/absolute 定位
    y: number;
    position: Position; // 画布世界坐标，用于 createNode
};
```

状态可以先放在 `canvas-client-page.tsx` 内部，不必一开始就写进 `types.ts`。如果后续需要多个组件共享，再移动到 `types.ts`。

## 拟新增或修改文件

### 1. `src/app/(user)/canvas/components/infinite-canvas.tsx`

新增 prop：

```ts
onCanvasDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
```

组件参数增加：

```ts
export function InfiniteCanvas({
    ...
    onCanvasDoubleClick,
    ...
}: InfiniteCanvasProps) {
```

根容器增加：

```tsx
<div
    ...
    onDoubleClick={onCanvasDoubleClick}
>
```

注意：这里不建议直接在 `InfiniteCanvas` 内部创建菜单状态。`InfiniteCanvas` 是基础画布容器，只负责把双击事件交给页面层。

### 2. `src/app/(user)/canvas/[id]/canvas-client-page.tsx`

新增菜单状态：

```ts
const [addNodesMenu, setAddNodesMenu] = useState<AddNodesMenuState | null>(null);
```

新增坐标转换工具。项目里已有多处类似转换逻辑，可保持局部函数简单实现：

```ts
const screenToWorld = useCallback(
    (clientX: number, clientY: number): Position | null => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;

        return {
            x: (clientX - rect.left - viewportRef.current.x) / viewportRef.current.k,
            y: (clientY - rect.top - viewportRef.current.y) / viewportRef.current.k,
        };
    },
    [],
);
```

新增双击处理：

```ts
const handleCanvasDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest("[data-node-id],[data-connection-id],[data-canvas-no-zoom],[data-connection-create-menu],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;

    const position = screenToWorld(event.clientX, event.clientY);
    if (!position) return;

    event.preventDefault();
    setContextMenu(null);
    setPendingConnectionCreate(null);
    setSelectedConnectionId(null);
    setAddNodesMenu({
        x: event.clientX,
        y: event.clientY,
        position,
    });
}, [screenToWorld]);
```

把它传给 `InfiniteCanvas`：

```tsx
<InfiniteCanvas
    ...
    onCanvasDoubleClick={handleCanvasDoubleClick}
>
```

新增菜单渲染：

```tsx
{addNodesMenu ? (
    <CanvasAddNodesMenu
        menu={addNodesMenu}
        onClose={() => setAddNodesMenu(null)}
        onCreate={(type) => {
            createNode(type, addNodesMenu.position);
            setAddNodesMenu(null);
        }}
    />
) : null}
```

需要在其他会改变画布上下文的地方关闭该菜单：

```ts
setAddNodesMenu(null);
```

建议至少加在这些位置：

1. `onViewportChange` 中，画布缩放/移动时关闭。
2. `deselectCanvas` 或背景点击中关闭。
3. 节点右键打开 `contextMenu` 时关闭。
4. 连线创建菜单打开时关闭。
5. `preventCanvasContextMenu` 里关闭。
6. 菜单成功创建节点后关闭。

### 3. 新增 `src/app/(user)/canvas/components/canvas-add-nodes-menu.tsx`

建议新增独立组件：

```tsx
"use client";

import { useEffect } from "react";
import { FileText, Image as ImageIcon, Music2, Settings2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type Position } from "../types";

type CanvasAddNodesMenuState = {
    x: number;
    y: number;
    position: Position;
};

type CanvasAddNodesMenuProps = {
    menu: CanvasAddNodesMenuState;
    onClose: () => void;
    onCreate: (type: CanvasNodeType.Text | CanvasNodeType.Image | CanvasNodeType.Video | CanvasNodeType.Audio | CanvasNodeType.Config) => void;
};
```

菜单 UI 可以沿用 `ConnectionCreateMenu` 的风格：

```txt
标题：Add Nodes / 新建节点
选项：
- Text / 文本
- Image / 图片
- Video / 视频
- Audio / 音频
- Config / 生成配置
```

由于项目文案规范是中文，推荐菜单文案使用中文：

```txt
新建节点
文本
图片
视频
音频
生成配置
```

如果想更贴近 TwitCanva，可标题用 `Add Nodes`，但项目内已有左侧菜单使用 `新建节点`，因此推荐中文。

菜单定位建议用 `fixed`，直接使用 `event.clientX/clientY`：

```tsx
<div
    className="fixed z-[120] w-[260px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
    style={{
        left: menu.x,
        top: menu.y,
        background: theme.node.panel,
        borderColor: theme.node.stroke,
        color: theme.node.text,
    }}
    onPointerDown={(event) => event.stopPropagation()}
>
```

关闭逻辑参考 `CanvasNodeContextMenu`：

```ts
useEffect(() => {
    const close = (event: PointerEvent) => {
        const target = event.target;
        if (target instanceof Element && target.closest("[data-canvas-add-nodes-menu]")) return;
        onClose();
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
}, [onClose]);
```

为菜单根节点加：

```tsx
data-canvas-add-nodes-menu
```

这样 `InfiniteCanvas` 的双击过滤也可以排除：

```txt
[data-canvas-add-nodes-menu]
```

## 节点类型映射

Add Nodes 菜单应直接使用目标项目已有类型：

| 菜单项 | 调用 |
|---|---|
| 文本 | `createNode(CanvasNodeType.Text, addNodesMenu.position)` |
| 图片 | `createNode(CanvasNodeType.Image, addNodesMenu.position)` |
| 视频 | `createNode(CanvasNodeType.Video, addNodesMenu.position)` |
| 音频 | `createNode(CanvasNodeType.Audio, addNodesMenu.position)` |
| 生成配置 | `createNode(CanvasNodeType.Config, addNodesMenu.position)` |

暂不建议加入以下类型：

```txt
ImageEditor
VideoEditor
Storyboard
CameraAngle
LocalImageModel
LocalVideoModel
```

原因是目标项目当前左侧菜单和底部工具栏也没有暴露这些入口；本次迁移应保持和现有 UI 能力一致。

## 坐标逻辑

TwitCanva 使用：

```ts
const canvasX = (x - viewport.x) / viewport.zoom;
const canvasY = (y - viewport.y) / viewport.zoom;
```

目标项目 `InfiniteCanvas` 的视口字段是：

```ts
type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};
```

目标项目还需要减掉容器自身位置：

```ts
const worldX = (clientX - rect.left - viewport.x) / viewport.k;
const worldY = (clientY - rect.top - viewport.y) / viewport.k;
```

传入 `createCanvasNode` 的 position 应该是节点中心点，因为当前创建函数内部会做居中偏移：

```ts
position: {
    x: position.x - spec.width / 2,
    y: position.y - spec.height / 2,
}
```

因此双击时不需要自己再减半个节点宽高，只要传世界坐标即可。

## 事件过滤规则

双击菜单只能在空白画布触发。建议过滤：

```txt
[data-node-id]
[data-connection-id]
[data-canvas-no-zoom]
[data-connection-create-menu]
[data-canvas-add-nodes-menu]
.ant-modal
.ant-popover
.ant-dropdown
.ant-select-dropdown
.ant-picker-dropdown
```

这样可以避免以下误触：

1. 双击节点标题或内容时误弹 Add Nodes。
2. 双击 Text 节点编辑区时误弹 Add Nodes。
3. 双击图片节点预览时误弹 Add Nodes。
4. 在弹窗、下拉框、菜单上双击时误弹 Add Nodes。
5. 在连接创建菜单上操作时误弹 Add Nodes。

## 与现有交互的关系

### 与左侧菜单

左侧菜单现在已经支持创建节点：

```tsx
onAddText={() => createNode(CanvasNodeType.Text)}
onAddImage={() => createNode(CanvasNodeType.Image)}
onAddVideo={() => createNode(CanvasNodeType.Video)}
onAddAudio={() => createNode(CanvasNodeType.Audio)}
onAddConfig={() => createNode(CanvasNodeType.Config)}
```

双击 Add Nodes 菜单和左侧菜单应共用 `createNode`，区别只是：

```txt
左侧菜单：默认创建在画布中心
双击菜单：创建在双击位置
```

### 与底部工具栏

底部工具栏也调用同一个 `createNode`。本次不改底部工具栏。

### 与连接创建菜单

连接创建菜单会创建节点并同时创建连接：

```txt
拖出连接到空白区域
  -> 选择节点类型
  -> 创建新节点
  -> 创建连接
```

双击 Add Nodes 菜单只创建孤立节点：

```txt
双击空白画布
  -> 选择节点类型
  -> 创建新节点
```

两者可以复用视觉样式，但不要复用同一个 state，因为语义不同。

### 与右键菜单

当前空白画布右键只是禁用浏览器菜单。建议本次只迁移“双击弹 Add Nodes”，不顺手增加右键空白画布 Add Nodes。

如果后续需要，也可以让 `preventCanvasContextMenu` 设置同一个 `addNodesMenu`：

```txt
右键空白画布
  -> setAddNodesMenu(...)
```

但这属于下一步增强，不放进本次迁移。

## 推荐执行步骤

### 第一步：新增菜单组件

新增：

```txt
src/app/(user)/canvas/components/canvas-add-nodes-menu.tsx
```

内容包括：

1. 接收 `menu`、`onClose`、`onCreate`。
2. 使用 `canvasThemes` 和 `useThemeStore`。
3. 用 lucide 图标渲染文本、图片、视频、音频、配置五个按钮。
4. 点击外部关闭。
5. 点击菜单项调用 `onCreate(type)`。

### 第二步：给 `InfiniteCanvas` 增加双击事件透传

修改：

```txt
src/app/(user)/canvas/components/infinite-canvas.tsx
```

增加：

```ts
onCanvasDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
```

根容器增加：

```tsx
onDoubleClick={onCanvasDoubleClick}
```

### 第三步：页面层增加 addNodesMenu 状态和处理函数

修改：

```txt
src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

新增：

```ts
type AddNodesMenuState = {
    x: number;
    y: number;
    position: Position;
};
```

新增：

```ts
const [addNodesMenu, setAddNodesMenu] = useState<AddNodesMenuState | null>(null);
```

新增：

```ts
const screenToWorld = useCallback(...)
const handleCanvasDoubleClick = useCallback(...)
```

### 第四步：挂载菜单

在 `InfiniteCanvas` 内部节点/选择框/连接创建菜单之后，或者在 `InfiniteCanvas` 之后挂载：

```tsx
{addNodesMenu ? (
    <CanvasAddNodesMenu
        menu={addNodesMenu}
        onClose={() => setAddNodesMenu(null)}
        onCreate={(type) => {
            createNode(type, addNodesMenu.position);
            setAddNodesMenu(null);
        }}
    />
) : null}
```

推荐挂在 `InfiniteCanvas` 之后、`CanvasNodeHoverToolbar` 之前或附近，和 `contextMenu` 渲染位置保持同级。

### 第五步：补充关闭逻辑

在以下场景关闭 `addNodesMenu`：

```txt
画布缩放/移动
点击空白处取消选择
节点右键菜单打开
连线右键菜单打开
连接创建菜单打开
创建节点完成
打开素材/弹窗/清空确认等全局浮层
```

不需要每个函数都大改；优先覆盖最容易出现残留菜单的路径：

```ts
onViewportChange={(next) => {
    setViewport(next);
    setContextMenu(null);
    setAddNodesMenu(null);
}}
```

以及节点右键：

```ts
onContextMenu={(event, id) => {
    ...
    setAddNodesMenu(null);
    setContextMenu({ type: "node", ... });
}}
```

### 第六步：人工验证

确认后执行代码改造时，建议手动验证：

1. 双击空白画布，菜单出现在鼠标位置。
2. 选择文本，Text 节点创建在双击位置。
3. 选择图片，Image 节点创建在双击位置，并按现有逻辑打开生成面板。
4. 选择视频，Video 节点创建在双击位置，并按现有逻辑打开生成面板。
5. 选择音频，Audio 节点创建在双击位置，不自动打开生成面板。
6. 选择生成配置，Config 节点创建在双击位置。
7. 双击已有节点，不弹 Add Nodes。
8. 双击 Text 编辑区，不弹 Add Nodes。
9. 拖动画布时不弹 Add Nodes。
10. 缩放画布后双击创建，节点位置仍准确。
11. 打开连接创建菜单时，不和 Add Nodes 菜单互相叠加。
12. 打开节点右键菜单时，Add Nodes 菜单关闭。

## 可能风险

### 风险一：双击和拖动画布冲突

当前 `InfiniteCanvas` 在空白区域左键按下会进入 pan 逻辑。浏览器仍会在连续点击时触发 `doubleClick`，但如果用户第二次点击伴随明显移动，可能同时触发拖动状态。

建议先用事件过滤和菜单打开时关闭其他浮层解决，不额外引入复杂点击计时逻辑。实际体验如果有误触，再考虑记录最近一次 pan 的 `hasMoved`。

### 风险二：坐标偏移

如果忘记减去 `containerRef.current.getBoundingClientRect().left/top`，节点会在画布容器不位于窗口左上角时出现偏移。

本项目页面左侧有菜单、顶部有栏位，必须使用：

```ts
clientX - rect.left
clientY - rect.top
```

再结合 viewport 转世界坐标。

### 风险三：菜单层级和节点 toolbar 冲突

当前连接创建菜单使用 `z-[120]`，节点右键菜单使用 `z-[80]`。Add Nodes 菜单建议使用 `z-[120]`，和连接创建菜单同级。

打开 Add Nodes 时应关闭：

```txt
contextMenu
pendingConnectionCreate
selectedConnectionId
```

避免多个浮层同时存在。

### 风险四：文案风格不统一

TwitCanva 原文案是英文 `Add Nodes`、`Text`、`Image`、`Video`。目标项目文案规范是中文，且左侧菜单已经使用 `新建节点`、`文本`、`图片`。

推荐使用中文菜单，行为对齐 TwitCanva，文案对齐目标项目。

## 不纳入本次范围

本次只迁移“双击空白画布打开 Add Nodes 菜单”。

不纳入：

1. 空白画布右键也打开 Add Nodes。
2. 上传入口合并进 Add Nodes。
3. 暴露 ImageEditor / VideoEditor / Storyboard 等隐藏节点类型。
4. 改造节点生成逻辑。
5. 改造 Text 节点三选项工作流。
6. 抽离 `canvas-client-page.tsx` 的大规模 hook 重构。

## 最终预期

实现后交互应为：

```txt
用户双击画布空白处
  -> 页面层计算双击点的屏幕坐标和画布世界坐标
  -> 打开 CanvasAddNodesMenu
  -> 用户选择节点类型
  -> 调用 createNode(type, worldPosition)
  -> 新节点以双击点为中心创建
  -> 菜单关闭，新节点被选中
```

这条链路保留 TwitCanva 的核心体验，同时遵守 `infinite-canvas/web` 当前的节点数据结构、主题系统和创建函数。
