# AGENTS.md

## 基本原则

- 实现保持简单直接，不为假想场景引入额外抽象。
- - 日期、URL、文件解析、压缩、加密等通用能力，优先级为：浏览器原生 API > 项目已有依赖 > 成熟轻量库 > 自己写；不要手写复杂标准实现。
- 不要改无关文件，不要顺手重构。
- 如果工作区已有用户改动，不要回滚，不要覆盖；只在必要范围内追加修改。

## 前端规范

- 前端使用 Next.js App Router、React、TypeScript、Ant Design、Tailwind、Zustand。
- 普通页面编写 Ant Design 相关代码时，参考 https://ant.design/llms-full.txt 理解组件 API、示例和设计规范，并优先结合项目当前 antd 版本与既有写法。
- Studio 工作区 `/studio/:seriesId` 是视觉特例：UI 详细规范见 `docs/studio-lumenx-visual-standards.md`；修改 Studio 工作区 UI 前必须阅读并遵守。Studio 可以使用 Ant Design 组件能力，但视觉以 LumenX dark glass 工作台为最高优先级，不套用普通 Ant Design/SaaS 页面风格。
- `/studio` 项目库属于普通产品页面，可以沿用当前项目外层风格；只有具体 Studio 工作区 `/studio/:seriesId` 使用 LumenX 工作台视觉规范。
- API 请求统一放在 `web/src/services/api/`。
- 全局或跨页面状态优先放在 `web/src/stores/`。
- 已经放在全局 store 或全局 hook 中的状态/动作，组件需要时直接使用对应 store/hook，不要为了“纯组件”层层透传 props；避免一个组件传递过多参数。
- 全局组件、全局常量、全局配置等全局性质的内容不要作为 props 或参数层层传递；哪里需要就在哪里直接从对应全局入口获取。
- 多个页面重复出现的 UI 副作用动作，例如复制文本并提示、下载并提示、统一确认弹窗，优先抽成 `web/src/hooks/` 下的全局 hook；不要放进 store，除非它确实是需要共享/订阅的状态。
- 画布相关状态和组件放在 `web/src/app/(user)/canvas/` 内部。
- 页面里只有一个主业务组件时直接写在 `page.tsx`，不要单独拆 `Manager` 组件再传一堆 props。
- 不要新增只做简单转发的组件，例如只 `return <X>{children}</X>` 或只换个名字透传 props；直接在使用处使用真实组件或把逻辑写进当前文件。
- 页面私有 hook 放在对应页面目录下，例如 `admin/assets/use-admin-assets.ts`；只有多个页面真实复用的 hook 才放到外层 `hooks/`。
- 页面私有组件放在对应页面目录的 `components/` 下；只在多个页面真实复用时再上提共享。
- 普通页面的全局主题、背景、卡片阴影、表格配色等统一在 `web/src/lib/app-theme.ts`、`AppProviders` 或必要的全局 CSS 中配置；页面私有组件不要自己写 `dark ? ...` 主题分支。Studio 工作区允许在局部 `ConfigProvider`、同目录常量或组件 className 中使用 LumenX atelier token，但不要散落新的自创颜色体系。
- 组件优先使用函数组件和现有 hooks，不新增大型状态管理方案。
- UI 图标优先使用 `lucide-react` 或项目已经使用的 Ant Design 图标。
- 页面文案保持中文。
- 不要在组件里堆太多无关逻辑；复杂逻辑优先抽成同目录工具函数或小组件。
- 样式优先由组件自己管理；组件私有样式优先使用 Tailwind className 或少量内联 style，不要为单个组件新增大量全局 CSS。
- 全局 CSS 只放基础变量、全局重置、跨页面通用样式和少量第三方组件必要覆盖；不要在 `globals.css` 堆页面私有样式。
- 代码尽量短小直接，少拆不必要组件，少做多层 props 传递，避免为了抽象堆出更多代码。
- 前端业务数据需要浏览器本地持久化时，默认使用 `localforage`；`localStorage` 只用于极小的简单配置，不要用来保存业务列表、生成记录、图片、base64 或大 JSON。

## 画布 UI 规范

- 本节只适用于 `/canvas` 相关页面和组件，不适用于 Studio 工作区。
- 画布 UI 的主题状态统一走 `useThemeStore`；画布编辑器内的颜色与视觉 token 优先复用 `canvasThemes`，Ant Design 组件再按需继承或覆盖 `ConfigProvider` token。
- 不要硬编码黑白、stone、slate 等颜色导致浅色/深色主题不一致。
- 新增画布按钮、弹窗、浮层时，尽量复用已有工具栏、节点面板、Modal 的视觉风格。
- 顶部工具栏保持极简扁平、低视觉重量，避免边框、阴影、胶囊化按钮
- 图片节点尺寸逻辑要尊重原始比例，除非功能明确要求自由变形。
- 批量生成、多图展示、助手面板等画布交互要尽量简洁，不要占用过多画布空间。

## 后端
- 后端在 /Users/a1/Desktop/mange-backend

## Lumenx位置
/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend

## Agent skills

### Issue tracker

Issues 使用 GitHub Issues；外部 PR 不作为 triage 入口。See `docs/agents/issue-tracker.md`.

### Triage labels

Triage 标签使用默认 canonical vocabulary：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs

Domain docs 采用 single-context 布局：根目录 `CONTEXT.md` + `docs/adr/`。See `docs/agents/domain.md`.
