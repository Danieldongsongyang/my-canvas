# 基于 LumenX Studio 组件做适配性移植

迁移 LumenX Studio 时，不从零重写 Studio UI，也不原样复制整套 LumenX 应用壳，而是以 LumenX Studio 的现有组件、页面结构和交互为基底做适配性移植。迁移时保留组件的业务布局、关键交互、状态组织和视觉肌理，同时把 API 调用、状态持久化、路由、主题 token、组件库版本和局部样式接入 `my-canvas/web` 的 Next.js、React、Ant Design、Tailwind 和 Zustand 体系。

**Considered Options**

- 从零按当前项目重新设计和实现 Studio UI。
- 原样复制 LumenX 前端应用壳、主题、路由和 Studio 组件。
- 基于 LumenX Studio 组件做适配性移植。

**Consequences**

这个选择能降低迁移成本，并尽量保留 LumenX Studio 已经打磨过的交互细节；同时避免把 LumenX 的 Playground、AppShell、全局导航、原始 API 假设和主题系统整体带进当前项目。迁移后的 Studio 允许和当前项目存在少量视觉差异，但差异应来自当前产品的统一导航、主题和服务边界，而不是重新设计导致的功能漂移。

第一阶段应保留 LumenX Studio 的内部视觉原味，只适配当前项目的外层入口、登录态、主题变量和少数冲突组件；等流程跑通后，再逐步把高频控件统一到当前项目的 Ant Design 和 Tailwind 风格。
