# 聊天窗口弹窗迁移合并方案

本文档是 TwitCanva 右下角聊天窗口弹窗体验迁移到 `/Users/a1/Desktop/infinite-canvas/web` 的主文档

当前最终选择是路线 A：**沿用 infinite-canvas 现有 OpenAI 兼容 relay，不复刻 TwitCanva 的 Express `/api/chat` 和 LangGraph agent 后端**。

## 最终选择

本次只融合 TwitCanva 的聊天入口、弹窗体验和少量 UI 增强，不迁移 TwitCanva 的后端智能体。

最终链路：

```txt
infinite-canvas 桌面端前端
    -> /api/v1/chat/completions
    -> Next /api/[...path] 代理
    -> mange-backend /v1/chat/completions
    -> middleware.TokenAuth()
    -> Authorization: Bearer sk-...
    -> controller.Relay(...)
```

也就是说：

1. 前端仍请求 `/api/v1/*`。
2. Next 代理把 `/api/v1/*` 转发到 `mange-backend /v1/*`。
3. AI 请求头使用桌面端登录后自动获取的 `relayApiKey`。
4. 聊天会话继续保存到当前画布项目。
5. 不新增第二套聊天后端、聊天数据库或聊天文件存储。

这个方案依赖桌面端登录方案：

```txt
web/DESKTOP_AUTH_MANGE_BACKEND_PLAN.md
```

聊天窗口本身不处理用户注册、登录和 API Key 创建，只消费登录流程已经保存好的 `relayApiKey`。

## 不采用的路线

TwitCanva 中还有一条完整 agent 路线：

```txt
TwitCanva ChatPanel
    -> Express /api/chat
    -> server/agent/*
    -> LangGraph + Gemini agent
    -> library/chats/*.json
```

这条路线本次不采用。

原因：

1. 目标项目已有 `CanvasAssistantPanel`、会话历史、图片/文本引用和插入画布能力。
2. `mange-backend` 已提供 OpenAI 兼容 relay。
3. 复刻 TwitCanva Express 和 LangGraph 会引入第二套后端。
4. 会导致鉴权、额度、模型配置、流式响应、会话存储分裂。
5. 当前目标是迁移“右下角聊天窗口体验”，不是复刻 TwitCanva 的完整 agent 大脑。

只有后续明确需要保留 TwitCanva 的多步骤 agent 工作流时，才重新评估 LangGraph agent。

## 目标效果

1. 画布页面右下角出现聊天浮动按钮。
2. 点击按钮后，右侧弹出画布助手聊天窗口。
3. 聊天窗口打开时，右下角按钮隐藏。
4. 点击聊天窗口关闭按钮后，窗口收起，右下角按钮重新出现。
5. 默认进入“对话”模式，而不是“生图”模式。
6. 聊天窗口可发送文本消息。
7. 聊天窗口可基于当前选中的图片/文本节点进行上下文问答。
8. 保留当前项目已有的会话历史、新建会话、删除会话能力。
9. AI 回复文本可插入画布为文本节点。
10. AI 生成图片可插入画布为图片节点。
11. 可选支持代码块渲染和复制按钮。
12. 可选使用 TwitCanva 的 `chat-preview.gif` 优化空态。
13. 后续可增强拖拽节点到 Chat 面板的体验，但第一阶段不做。

## 源项目功能拆解

TwitCanva 中相关文件如下：

| 源文件 | 作用 | 本项目处理方式 |
| --- | --- | --- |
| `src/hooks/usePanelState.ts` | 管理 `isChatOpen`、`toggleChat`、`closeChat` | 只参考逻辑，不整文件搬 |
| `src/components/ChatPanel.tsx` | Chat 面板 UI、输入框、拖拽媒体、历史面板、发送消息 | 参考 UI，实际复用 `CanvasAssistantPanel` |
| `src/components/ChatMessage.tsx` | 消息气泡、附件预览、代码块复制 | 可把代码块渲染能力融合到目标项目 |
| `src/hooks/useChatAgent.ts` | 前端聊天状态、请求 `/api/chat`、会话列表 | 不迁移，目标项目已有会话和请求链路 |
| `public/chat-preview.gif` | 空态提示动图 | 可选复制到目标项目 `public/` |
| `server/index.js` 的 `/api/chat` | Express Chat API | 不迁移 |
| `server/agent/*` | LangGraph + Gemini agent | 不迁移 |
| `library/chats/*.json` | 文件式聊天历史 | 不迁移 |

TwitCanva 最小弹窗逻辑是：

```tsx
const [isChatOpen, setIsChatOpen] = useState(false);

const toggleChat = () => setIsChatOpen((value) => !value);
const closeChat = () => setIsChatOpen(false);

<ChatBubble onClick={toggleChat} isOpen={isChatOpen} />
<ChatPanel isOpen={isChatOpen} onClose={closeChat} />
```

本项目不复制这套组件，只把这个交互映射到现有状态：

```txt
isChatOpen
    -> !assistantCollapsed

toggleChat/openChat
    -> openAssistant()

closeChat
    -> closeAssistant()
```

## 当前项目基础

目标前端已经有画布助手面板，不需要从零实现完整 Chat UI。

相关文件：

```txt
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx
web/src/app/(user)/canvas/types.ts
web/src/app/(user)/canvas/stores/use-canvas-store.ts
web/src/services/api/image.ts
web/src/services/api/audio.ts
web/src/services/api/video.ts
web/src/app/api/[...path]/route.ts
```

当前已有能力：

| 能力 | 当前状态 | 位置 |
| --- | --- | --- |
| 右侧助手面板 | 已有 | `canvas-assistant-panel.tsx` |
| 面板打开/收起状态 | 已有 | `assistantCollapsed`、`assistantMounted` |
| 会话数据结构 | 已有 | `CanvasAssistantSession` |
| 会话保存到画布项目 | 已有 | `use-canvas-store.ts` |
| 文本问答请求 | 已有 | `requestImageQuestion()` |
| 图片生成请求 | 已有 | `requestGeneration()`、`requestEdit()` |
| 图片/文本节点引用 | 已有 | `buildAssistantReferences()` |
| 插入文本到画布 | 已有 | `insertAssistantText()` |
| 插入图片到画布 | 已有 | `insertAssistantImage()` |

迁移方式是“融合当前画布助手”，不是原样搬运 TwitCanva 的 `ChatPanel.tsx`。

## 后端接口确认

`mange-backend` relay 路由位于：

```txt
/Users/a1/Desktop/mange-backend/router/relay-router.go
```

已存在：

```txt
POST /v1/chat/completions
POST /v1/images/generations
POST /v1/images/edits
POST /v1/audio/speech
GET  /v1/models
```

这些接口挂在后端根路径 `/v1/*`，不是 `/api/v1/*`。

`mange-backend /v1/*` 使用：

```txt
middleware.TokenAuth()
```

因此 AI 请求必须带：

```txt
Authorization: Bearer sk-...
```

其中 `sk-...` 是 `mange-backend` 自己签发/保存的 relay API Key，不是当前 `infinite-canvas` 旧登录 token，也不是 `mange-backend` dashboard access token。

## Next 代理方案

当前 Next 项目里浏览器请求统一使用 `/api/*` 是前端软约定，这个约定保留。

需要修改：

```txt
web/src/app/api/[...path]/route.ts
```

代理规则：

```txt
如果 path[0] 是 v1 / v1beta / mj / suno：
    target = ${API_BASE_URL}/${path...}
否则：
    target = ${API_BASE_URL}/api/${path...}
```

示例：

```txt
前端请求：
/api/v1/chat/completions

实际转发：
http://127.0.0.1:8080/v1/chat/completions
```

普通后台 API 仍保持：

```txt
前端请求：
/api/user/login

实际转发：
http://127.0.0.1:8080/api/user/login
```

拟改代码：

```ts
const relayPrefixes = new Set(["v1", "v1beta", "mj", "suno"]);
const encodedPath = path.map(encodeURIComponent).join("/");
const targetPath = relayPrefixes.has(path[0]) ? `/${encodedPath}` : `/api/${encodedPath}`;
const target = `${apiBaseUrl.replace(/\/$/, "")}${targetPath}${request.nextUrl.search}`;
```

## 鉴权方案

AI remote 模式不能继续使用旧的：

```ts
useUserStore.getState().token
```

应改为使用桌面端登录流程保存的：

```txt
relayApiKey
```

请求头：

```txt
Authorization: Bearer ${relayApiKey}
```

推荐统一规则：

```txt
channelMode = remote:
    URL = /api/v1${path}
    Authorization = Bearer relayApiKey

channelMode = local:
    URL = buildApiUrl(config.baseUrl, path)
    Authorization = Bearer config.apiKey
```

这样桌面端默认走 `mange-backend`，高级用户仍可保留本地直连 OpenAI 兼容服务的能力。

## 前端移植映射

| TwitCanva | infinite-canvas/web |
| --- | --- |
| `ChatBubble` | 新增或内联 `CanvasChatBubble` |
| `ChatPanel` | 复用并调整 `CanvasAssistantPanel` |
| `usePanelState.isChatOpen` | 复用 `assistantCollapsed` / `assistantMounted` |
| `useChatAgent.sendMessage()` | 复用 `CanvasAssistantPanel.sendMessage()` |
| `/api/chat` | 不迁移，改走 `/api/v1/chat/completions` |
| `library/chats/*.json` | 不迁移，会话继续保存到当前画布项目 |
| 拖拽节点到聊天 | 第一阶段不做，沿用“选中节点即引用” |
| `ChatMessage` 代码块复制 | 可选融合到 `AssistantMessages` |
| `chat-preview.gif` | 可选复制到 `web/public/chat-preview.gif` |

## 拟修改文件

### 1. `canvas-client-page.tsx`

路径：

```txt
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

改动：

1. 新增统一打开助手函数。
2. 顶部助手按钮复用同一个打开函数。
3. 在画布右下角新增聊天浮动按钮。
4. 助手面板展开时隐藏右下角按钮。

示例：

```tsx
const openAssistant = useCallback(() => {
    setAssistantMounted(true);
    setAssistantCollapsed(false);
}, []);

const closeAssistant = useCallback(() => {
    setAssistantCollapsed(true);
}, []);
```

按钮示例：

```tsx
{assistantCollapsed ? <CanvasChatBubble onClick={openAssistant} /> : null}
```

建议按钮属于画布区域，优先使用 `absolute bottom-6 right-6`，避免 `fixed` 和右侧面板、全局弹窗层级互相干扰。

新增局部组件示例：

```tsx
function CanvasChatBubble({ onClick }: { onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button
            type="button"
            className="absolute bottom-6 right-6 z-50 grid size-12 place-items-center rounded-full transition hover:scale-105"
            style={{
                background: theme.toolbar.activeBg,
                color: theme.toolbar.activeText,
                boxShadow: "0 18px 40px rgba(0,0,0,.20)",
            }}
            onClick={onClick}
            aria-label="打开画布助手"
        >
            <MessageSquare className="size-5" />
        </button>
    );
}
```

### 2. `canvas-assistant-panel.tsx`

路径：

```txt
web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx
```

改动：

1. 标题从 `画布助手(未开发)` 改为 `画布助手`。
2. 默认模式改为 `ask`。
3. 空态文案改成聊天引导。
4. 保留现有 `AssistantComposer`、`AssistantMessages`、`AssistantHistory`。
5. 保留输入区“对话/生图”模式切换。
6. 可选增加代码块渲染和复制按钮。

默认模式：

```tsx
const [mode, setMode] = useState<AssistantMode>("ask");
```

空态文案示例：

```txt
选中画布上的图片或文本节点后提问，助手会自动把它们作为上下文。
```

### 3. `src/services/api/image.ts`

路径：

```txt
web/src/services/api/image.ts
```

改动：

1. `requestImageQuestion()` 继续作为聊天问答入口。
2. remote 模式继续请求 `/api/v1/chat/completions`。
3. remote 模式请求头改用 `relayApiKey`。
4. 保留 local 模式使用 `config.apiKey` 的逻辑。

### 4. `src/services/api/audio.ts`

路径：

```txt
web/src/services/api/audio.ts
```

改动：

1. remote 模式继续请求 `/api/v1/audio/speech`。
2. remote 模式请求头改用 `relayApiKey`。
3. 保留 local 模式。

### 5. `src/services/api/video.ts`

路径：

```txt
web/src/services/api/video.ts
```

改动：

1. remote 模式继续请求 `/api/v1/videos` 等当前路径。
2. 如果后续视频也统一走 `mange-backend` relay，需要同步检查真实后端路径。
3. remote 模式请求头不要再依赖旧登录 token。

聊天窗口第一阶段主要依赖 `image.ts`，但为了避免远程 AI 鉴权逻辑分裂，建议同时检查 `audio.ts` 和 `video.ts`。

### 6. `src/app/api/[...path]/route.ts`

路径：

```txt
web/src/app/api/[...path]/route.ts
```

改动：

1. 增加 relay 前缀分流。
2. 保留普通 `/api/*` 后台接口转发。
3. 继续透传请求头和请求体。
4. 注意不要丢失流式响应能力。

## 会话存储方案

会话继续保存到当前画布项目中：

```ts
chatSessions: CanvasAssistantSession[];
activeChatId: string | null;
```

位置：

```txt
web/src/app/(user)/canvas/stores/use-canvas-store.ts
```

不新增后端聊天历史接口，不新增聊天历史数据表。

原因：

1. 当前画布项目主要保存在浏览器/桌面端本地。
2. 聊天会话与具体画布强绑定。
3. 现有项目已经包含 `chatSessions` 和 `activeChatId` 字段。

## 媒体/节点上下文方案

第一阶段不实现 TwitCanva 的“拖拽节点到聊天窗口”。

继续沿用当前项目逻辑：

```txt
选中图片/文本节点
    -> buildAssistantReferences()
    -> selectedReferences
    -> buildChatMessages()
    -> requestImageQuestion()
```

这样可以复用：

1. 当前节点选择逻辑。
2. `storageKey`。
3. `imageToDataUrl()`。
4. 当前图片/文本引用编号逻辑。

## 后续增强：拖拽节点到 Chat

TwitCanva 支持把节点拖进 Chat 面板作为附件。本项目第一阶段不做，但后续可以在当前“选中节点即引用”的基础上增强。

推荐原则：

1. 不新增第二套 `attachedMedia` 状态。
2. drop 后把节点 id 转成 `selectedNodeIds`。
3. 继续复用 `buildAssistantReferences()`、`storageKey`、`imageToDataUrl()` 和引用 chip。

后续实现思路：

```txt
用户拖拽画布节点
    -> dataTransfer 写入 application/x-canvas-node-id
    -> CanvasAssistantPanel onDrop 读取 nodeId
    -> onSelectNodeIds(new Set([nodeId]))
    -> buildAssistantReferences()
    -> selectedReferences
```

伪代码：

```tsx
const handleAssistantDrop = (event: React.DragEvent) => {
    event.preventDefault();

    const nodeId = event.dataTransfer.getData("application/x-canvas-node-id");
    if (!nodeId) return;

    onSelectNodeIds(new Set([nodeId]));
};
```

这样拖拽只是选中节点的另一种入口，不会产生第二套附件生命周期。

## UI 细节

### 右下角按钮

1. 使用 `MessageSquare` 或 `Sparkles` 图标。
2. 使用当前 `canvasThemes`、`useThemeStore` 或 Ant Design token。
3. 不硬编码纯黑/纯白、stone、slate 等颜色。
4. 尺寸建议 `48px`。
5. `z-index` 高于画布节点和工具栏，低于 Modal。
6. 打开面板后隐藏。

### 右侧面板

1. 复用当前 `CanvasAssistantPanel`。
2. 保留拖动调整宽度。
3. 保留收起动画。
4. 保留历史记录面板。
5. 输入区保留“对话/生图”模式切换。

### 顶部入口

保留顶部“助手”按钮，同时新增右下角聊天按钮。

原因：

1. 不破坏现有用户习惯。
2. 右下角按钮只是新增聊天入口。
3. 两个入口调用同一个 `openAssistant()`。

### 空态

默认使用中文空态，不依赖额外素材：

```tsx
<div className="flex h-full flex-col items-center justify-center px-6 text-center">
    <Sparkles className="mb-4 size-8 opacity-70" />
    <div className="text-lg font-semibold">需要灵感吗？</div>
    <div className="mt-2 max-w-[260px] text-sm leading-6 opacity-60">
        选中画布上的图片或文本节点后提问，助手会自动把它们作为上下文。
    </div>
</div>
```

如果要保留 TwitCanva 动图，可以复制：

```txt
/Users/a1/Desktop/无限画布项目汇总/TwitCanva-Video-Workflow/public/chat-preview.gif
```

到：

```txt
/Users/a1/Desktop/infinite-canvas/web/public/chat-preview.gif
```

使用示例：

```tsx
<img
    src="/chat-preview.gif"
    alt=""
    className="mb-4 w-full max-w-[260px] rounded-2xl object-cover"
/>
```

注意：

1. 动图只是空态增强，不是第一阶段必要项。
2. 如果动图视觉风格和当前画布主题冲突，优先不用。
3. 空态文案保持中文。

## 可选增强：代码块渲染和复制

TwitCanva 的 `ChatMessage.tsx` 支持解析 Markdown 代码块并提供复制按钮。目标项目当前如果只是直接展示 `message.text`，后续可以把这部分能力融合到 `AssistantMessages`。

建议新增轻量解析函数：

```tsx
function parseAssistantContent(content: string): Array<{ type: "text" | "code"; content: string }> {
    const segments: Array<{ type: "text" | "code"; content: string }> = [];
    const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            const text = content.slice(lastIndex, match.index).trim();
            if (text) segments.push({ type: "text", content: text });
        }

        segments.push({ type: "code", content: match[1].trim() });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        const text = content.slice(lastIndex).trim();
        if (text) segments.push({ type: "text", content: text });
    }

    return segments.length ? segments : [{ type: "text", content }];
}
```

复制按钮组件示例：

```tsx
function AssistantCodeBlock({ code }: { code: string }) {
    const [copied, setCopied] = useState(false);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="group relative my-2">
            <pre
                className="thin-scrollbar overflow-x-auto rounded-xl border p-3 text-xs"
                style={{ background: theme.node.panel, borderColor: theme.node.stroke }}
            >
                <code>{code}</code>
            </pre>
            <Button
                size="small"
                shape="circle"
                className="!absolute !right-2 !top-2 opacity-0 transition group-hover:opacity-100"
                icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                onClick={async () => {
                    await navigator.clipboard.writeText(code);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                }}
                title={copied ? "已复制" : "复制"}
            />
        </div>
    );
}
```

需要同步增加 import：

```tsx
import { Check, Copy } from "lucide-react";
```

在消息气泡中渲染：

```tsx
{parseAssistantContent(message.text).map((segment, index) =>
    segment.type === "code" ? (
        <AssistantCodeBlock key={index} code={segment.content} />
    ) : (
        <div key={index}>{segment.content}</div>
    ),
)}
```

这部分不是第一阶段必须项。建议在聊天弹窗、relay 鉴权和基础问答跑通后再补。

## 不迁移内容

以下 TwitCanva 内容不迁移：

```txt
src/hooks/useChatAgent.ts
server/index.js 中的 /api/chat
server/agent/index.js
server/agent/graph/chatGraph.js
server/agent/prompts/system.js
library/chats 文件存储逻辑
```

第一阶段也不迁移：

```txt
拖拽节点到聊天窗口
代码块渲染和复制按钮
chat-preview.gif 空态动图
```

原因：

1. 目标项目已有 `CanvasAssistantPanel` 和会话存储。
2. 后端已确定为 `mange-backend` OpenAI 兼容 relay。
3. 引入 TwitCanva Express/LangGraph 会造成第二套后端和第二套会话体系。
4. 拖拽节点、代码块复制和空态动图都可以在基础链路跑通后增强。

## 实施顺序

建议按以下顺序实现：

1. 完成桌面端登录与 relay API Key 初始化方案，确保前端 store 中有 `relayApiKey`。
2. 修改 `web/src/app/api/[...path]/route.ts`，让 `/api/v1/*` 转发到 `mange-backend /v1/*`。
3. 修改 AI API 请求头，remote 模式使用 `relayApiKey`。
4. 修改 `canvas-client-page.tsx`，新增右下角聊天按钮并复用打开助手逻辑。
5. 修改 `canvas-assistant-panel.tsx`，去掉“未开发”、默认进入对话模式、调整空态文案。
6. 验证文本问答。
7. 验证选中图片/文本节点后的上下文问答。
8. 验证 AI 回复文本插入画布。
9. 验证 AI 生成图片插入画布。
10. 再决定是否补 `chat-preview.gif`、代码块复制和拖拽节点到 Chat。

## 最小迁移版本

如果只想先实现“点击右下角弹出 Chat 面板”，最小改动只有：

```txt
web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
```

新增：

```tsx
const openAssistant = useCallback(() => {
    setAssistantMounted(true);
    setAssistantCollapsed(false);
}, []);
```

把顶部按钮改为复用同一个函数：

```tsx
<CanvasTopBar
    assistantCollapsed={assistantCollapsed}
    onExpandAssistant={openAssistant}
/>
```

新增右下角按钮：

```tsx
{assistantCollapsed ? <CanvasChatBubble onClick={openAssistant} /> : null}
```

新增组件：

```tsx
function CanvasChatBubble({ onClick }: { onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button
            type="button"
            className="absolute bottom-6 right-6 z-50 grid size-12 place-items-center rounded-full transition hover:scale-105"
            style={{
                background: theme.toolbar.activeBg,
                color: theme.toolbar.activeText,
                boxShadow: "0 18px 40px rgba(0,0,0,.20)",
            }}
            onClick={onClick}
            aria-label="打开画布助手"
        >
            <MessageSquare className="size-5" />
        </button>
    );
}
```

这样就完成了 TwitCanva 中最核心的弹出逻辑迁移：

```txt
ChatBubble click
    -> openAssistant()
    -> render CanvasAssistantPanel
    -> close
    -> restore bubble
```

这个最小版本只负责入口和展开/收起，不处理 relay 鉴权，也不验证 AI 请求。

## 验收标准

1. 进入画布详情页后，右下角出现聊天按钮。
2. 点击右下角按钮后，右侧助手面板展开。
3. 面板展开后，右下角按钮隐藏。
4. 点击面板关闭按钮后，面板收起，右下角按钮恢复。
5. 顶部“助手”按钮仍可打开同一个面板。
6. 面板标题显示“画布助手”，不再显示“未开发”。
7. 默认进入“对话”模式。
8. 输入文字后，请求从前端发到 `/api/v1/chat/completions`。
9. Next 代理实际转发到 `mange-backend /v1/chat/completions`。
10. 请求头使用 `Authorization: Bearer sk-...`。
11. `mange-backend` 能返回流式或完整文本回复。
12. 选中图片节点后提问，图片作为上下文发送。
13. 选中文本节点后提问，文本作为上下文发送。
14. AI 回复文本可插入画布为文本节点。
15. AI 生图结果可插入画布为图片节点。
16. 会话刷新后仍保存在当前画布项目中。
17. 不影响图片节点、视频节点、音频节点、配置节点的现有功能。
18. 深色/浅色主题下按钮和面板都不突兀。

## 工作区注意事项

实施时需要遵循当前项目规则：

1. 先读现有代码，再修改。
2. 不回滚用户已有改动。
3. 不复制 TwitCanva 后端。
4. 不新增第二套聊天会话数据库。
5. 画布 UI 必须遵循当前画布主题。
6. 前端文案保持中文。
7. 如同步改动 AI 鉴权，需要同时关注 `image.ts`、`audio.ts`、`video.ts` 的 remote 模式一致性。
