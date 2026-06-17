# 画布左侧菜单新增记录

## 背景

本次操作目标是在 `/Users/a1/Desktop/infinite-canvas/web` 项目中新增一个左侧竖向菜单组件，使其布局结构与 `/Users/a1/Desktop/无限画布项目汇总/TwitCanva-Video-Workflow` 项目中的菜单组件保持一致，并显示在画布左侧相同位置。

原 TwitCanva 项目中的对应菜单组件为：

- `/Users/a1/Desktop/无限画布项目汇总/TwitCanva-Video-Workflow/src/components/Toolbar.tsx`

目标项目中原有底部工具栏组件为：

- `/Users/a1/Desktop/infinite-canvas/web/src/app/(user)/canvas/components/canvas-toolbar.tsx`

本次没有删除、替换或重构原有 `CanvasToolbar`，而是新增了一个独立左侧菜单组件并并列挂载到画布页面。

## 新增文件

新增文件：

- `/Users/a1/Desktop/infinite-canvas/web/src/app/(user)/canvas/components/canvas-left-menu.tsx`

新增组件：

```tsx
export function CanvasLeftMenu(...)
```

组件外层定位：

```tsx
<div
    ref={menuRef}
    className="pointer-events-auto absolute left-4 top-1/2 z-50 -translate-y-1/2"
    data-canvas-no-zoom
>
```

这对应 TwitCanva 菜单在画布左侧、中部垂直居中的位置。

## 修改文件

修改文件：

- `/Users/a1/Desktop/infinite-canvas/web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

修改内容只有两处：

1. 引入新增组件：

```tsx
import { CanvasLeftMenu } from "../components/canvas-left-menu";
```

2. 在画布详情页中渲染新菜单，位置在 `CanvasNodeHoverToolbar` 之后、原有 `CanvasToolbar` 之前：

```tsx
<CanvasLeftMenu
    canUndo={historyState.canUndo}
    canRedo={historyState.canRedo}
    onAddImage={() => createNode(CanvasNodeType.Image)}
    onAddVideo={() => createNode(CanvasNodeType.Video)}
    onAddAudio={() => createNode(CanvasNodeType.Audio)}
    onAddText={() => createNode(CanvasNodeType.Text)}
    onAddConfig={() => createNode(CanvasNodeType.Config)}
    onUpload={() => handleUploadRequest()}
    onProjects={() => router.push("/canvas")}
    onOpenAssetLibrary={() => {
        setAssetPickerTab("library");
        setAssetPickerOpen(true);
    }}
    onOpenMyAssets={() => {
        setAssetPickerTab("my-assets");
        setAssetPickerOpen(true);
    }}
    onUndo={undoCanvas}
    onRedo={redoCanvas}
    onClear={() => setClearConfirmOpen(true)}
/>
```

## 菜单结构

新增菜单参考了 TwitCanva 的 `Toolbar.tsx` 结构：

- 顶部圆形加号按钮
- 中部竖排图标按钮
- 分隔线
- 底部头像按钮
- 点击部分图标时，从右侧弹出小型菜单

当前菜单按钮结构如下：

| 位置 | 图标 | 行为 |
| --- | --- | --- |
| 顶部 | `Plus` | 展开“新建节点”菜单 |
| 中部 1 | `LayoutGrid` | 跳转到 `/canvas` 我的画布列表 |
| 中部 2 | `ImageIcon` | 展开“素材”菜单 |
| 中部 3 | `History` | 展开“历史”菜单 |
| 中部 4 | `Wrench` | 展开“工具”菜单 |
| 底部 | 用户头像或首字母 | 展示当前用户头像/首字母 |

## 功能映射

### 新建节点菜单

顶部 `+` 按钮展开后提供：

| 菜单项 | 回调 |
| --- | --- |
| 文本 | `createNode(CanvasNodeType.Text)` |
| 图片 | `createNode(CanvasNodeType.Image)` |
| 视频 | `createNode(CanvasNodeType.Video)` |
| 音频 | `createNode(CanvasNodeType.Audio)` |
| 生成配置 | `createNode(CanvasNodeType.Config)` |
| 上传素材 | `handleUploadRequest()` |

### 素材菜单

图片按钮展开后提供：

| 菜单项 | 回调 |
| --- | --- |
| 素材库 | `setAssetPickerTab("library")` + `setAssetPickerOpen(true)` |
| 我的素材 | `setAssetPickerTab("my-assets")` + `setAssetPickerOpen(true)` |

### 历史菜单

历史按钮展开后提供：

| 菜单项 | 回调 |
| --- | --- |
| 撤销 | `undoCanvas` |
| 重做 | `redoCanvas` |

其中撤销/重做会根据 `historyState.canUndo`、`historyState.canRedo` 禁用。

### 工具菜单

扳手按钮展开后提供：

| 菜单项 | 回调 |
| --- | --- |
| 配置节点 | `createNode(CanvasNodeType.Config)` |
| 上传素材 | `handleUploadRequest()` |
| 清空画布 | `setClearConfirmOpen(true)` |

## 样式与交互

新组件使用目标项目已有主题系统：

- `canvasThemes`
- `useThemeStore`
- `useUserStore`

深色/浅色模式会自动读取当前画布主题。

组件内部使用：

```tsx
const colorTheme = useThemeStore((state) => state.theme);
const theme = canvasThemes[colorTheme];
```

菜单浮层通过本地状态控制：

```tsx
const [openMenu, setOpenMenu] = useState<"add" | "assets" | "history" | "tools" | null>(null);
```

点击外部会自动关闭浮层：

```tsx
useEffect(() => {
    if (!openMenu) return;
    const close = (event: PointerEvent) => {
        if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
}, [openMenu]);
```

外层增加了 `data-canvas-no-zoom`，避免在菜单上操作时触发画布缩放/拖拽相关逻辑。

## 保留内容

以下内容没有删除或替换：

- 原有底部 `CanvasToolbar`
- 原有顶部 `CanvasTopBar`
- 原有菜单/Dropdown 逻辑
- 原有素材选择弹窗 `AssetPickerModal`
- 原有画布节点、连线、缩放控件、助手面板逻辑

## 验证记录

已执行：

```bash
git diff --check -- 'src/app/(user)/canvas/[id]/canvas-client-page.tsx' 'src/app/(user)/canvas/components/canvas-left-menu.tsx'
```

结果：

- 通过，无空白错误。

已确认本地 Next dev server 正在运行：

```bash
lsof -nP -iTCP:3002 -sTCP:LISTEN
```

结果：

- `node` 进程监听 `3002`
- 进程描述为 `next-server (v16.2.3)`

已请求页面：

```bash
curl -I http://localhost:3002/canvas
curl -I http://localhost:3002/canvas/test
```

结果：

- `/canvas` 返回 `200 OK`
- `/canvas/test` 返回 `200 OK`

其中 `/canvas/test` 会命中画布详情路由，即本次接入 `CanvasLeftMenu` 的页面。

## 类型检查结果

已执行：

```bash
npx tsc --noEmit --pretty false
```

结果：

类型检查失败，但失败点均为项目既有文件中的问题，不是本次新增的 `canvas-left-menu.tsx`。

当前报错如下：

```text
src/app/(user)/canvas/components/canvas-image-toolbar-settings-modal.tsx(105,33): error TS2345: Argument of type 'HTMLDivElement | null' is not assignable to parameter of type 'Element'.
src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx(129,16): error TS18047: 'node' is possibly 'null'.
src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx(285,96): error TS2353: Object literal may only specify known properties, and 'body' does not exist in type ...
src/app/(user)/canvas/components/canvas-node-mask-edit-dialog.tsx(60,27): error TS2345: Argument of type 'HTMLCanvasElement | null' is not assignable to parameter of type 'HTMLCanvasElement'.
```

## 工作区状态说明

本次新增/修改的文件：

- `src/app/(user)/canvas/components/canvas-left-menu.tsx`
- `src/app/(user)/canvas/[id]/canvas-client-page.tsx`

执行 `git status --short` 时，还能看到以下文件处于修改状态：

```text
M src/app/(user)/canvas/components/canvas-node.tsx
M src/app/(user)/canvas/constants.ts
M src/app/(user)/canvas/types.ts
```

这些文件不是本次左侧菜单新增操作修改的内容，未对其进行回退或调整。

## 审查建议

建议审查时重点看以下位置：

1. `canvas-left-menu.tsx` 的外层定位是否符合预期：

```tsx
absolute left-4 top-1/2 -translate-y-1/2
```

2. `canvas-client-page.tsx` 中 `CanvasLeftMenu` 是否位于画布 `<section>` 内、并且不影响原有 `CanvasToolbar`。

3. 各菜单按钮是否映射到目标项目已有回调，而不是新增重复业务逻辑。

4. `data-canvas-no-zoom` 是否能避免菜单交互被画布缩放/拖拽捕获。

5. 视觉上是否需要进一步贴近 TwitCanva 原菜单，例如尺寸、间距、阴影、头像行为或下拉菜单内容。

## 回滚方式

如果需要回滚本次菜单新增，可以：

1. 删除文件：

```text
src/app/(user)/canvas/components/canvas-left-menu.tsx
```

2. 从 `src/app/(user)/canvas/[id]/canvas-client-page.tsx` 删除 import：

```tsx
import { CanvasLeftMenu } from "../components/canvas-left-menu";
```

3. 从同文件删除 `<CanvasLeftMenu ... />` 渲染块。

原有 `CanvasToolbar` 和其他画布功能不依赖该新增组件。
