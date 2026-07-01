# Infinite Canvas 前端迁移分析总结

## 1. 背景

当前计划是：将以下三个开源项目中的前端能力，迁移或参考集成到自己的前端项目中：

- ArcReel：`https://github.com/ArcReel/ArcReel`
- LumenX：`https://github.com/alibaba/lumenx/blob/main/README_EN.md`
- Jellyfish：`https://github.com/Forget-C/Jellyfish`
- 自己的项目：`https://github.com/Danieldongsongyang/infinite-canvas`

自己的项目 `infinite-canvas` 已经具备无限画布、AI 生图、图生图、视频生成、提示词库、素材管理等能力，因此它更适合作为主前端壳，而不是被其他项目替代。

---

## 2. 总体结论

最适合迁移的是 **LumenX 的 Studio 模块**。

不建议迁移 LumenX 的 Playground 模块，因为它和自己的无限画布功能高度重叠。

更合理的方向是：

```text
infinite-canvas 作为主应用
├── 无限画布模块
│   ├── 自由创作
│   ├── AI 生图
│   ├── 图生图
│   ├── 视频生成
│   ├── 节点编排
│   └── 素材沉淀
│
└── Studio 短漫剧模块
    ├── 剧本解析
    ├── 角色管理
    ├── 场景管理
    ├── 道具管理
    ├── 分镜表
    ├── 镜头图生成
    ├── 镜头视频生成
    ├── 配音
    ├── 时间线
    └── 导出
```

一句话总结：

> 保留自己的无限画布作为自由创作入口，把 LumenX Studio 改造成项目制短漫剧生产入口；不要迁移 Playground，否则会和自己的核心能力打架。

---

## 3. 三个项目的迁移价值对比

| 项目 | 迁移价值 | 和当前项目前端适配性 | 建议 |
|---|---:|---:|---|
| LumenX Studio | 很高 | 高 | 重点迁移 |
| LumenX Playground | 低 | 中高 | 不建议迁移完整模块，只参考小组件 |
| ArcReel | 中高 | 中 | 参考任务队列、供应商、成本统计、导出流程 |
| Jellyfish | 中高 | 中偏低 | 参考数据模型、角色一致性、分镜流程 |
| 直接三者整合 | 低 | 低 | 不建议 |

---

## 4. 为什么 LumenX Studio 最适合？

LumenX Studio 的核心流程是：

```text
剧本 → 分镜 → 角色/场景/道具资产 → 镜头图 → 镜头视频 → 配音 → 时间线 → 导出
```

这正好补足自己的 `infinite-canvas` 目前相对缺少的部分：**结构化、项目制、长流程的短漫剧生产能力**。

自己的无限画布更偏向：

```text
自由创作 → 节点编排 → 图片/视频生成 → 素材沉淀
```

LumenX Studio 更偏向：

```text
剧本驱动 → 分镜管理 → 资产一致性 → 视频生产 → 成片导出
```

所以二者不是重复关系，而是互补关系。

---

## 5. 为什么不建议迁移 LumenX Playground？

LumenX Playground 的定位是一个独立的图像/视频生成工作台，通常包括：

- Prompt 输入；
- 模型选择；
- 参数配置；
- 文生图；
- 图生图；
- 文生视频；
- 图生视频；
- 任务队列；
- 结果画廊；
- Prompt 历史；
- 素材选择。

但这些能力和自己的无限画布高度重叠。

自己的无限画布已经承担了“自由生成工作台”的角色，而且比传统 Playground 更灵活，因为它支持节点、画布、素材联动和多轮视觉迭代。

如果再迁移一个完整 Playground，会造成：

1. **功能重复**：两个地方都能生图、生成视频、调参数；
2. **用户困惑**：不知道应该在 Canvas 里生成，还是去 Playground 生成；
3. **代码冗余**：模型选择、参数面板、任务状态、结果展示会重复实现；
4. **产品边界混乱**：Canvas 和 Playground 都在做自由创作，定位冲突。

因此，Playground 不应作为独立模块迁移。

---

## 6. Playground 中仍然可以参考的部分

虽然不建议迁移完整 Playground，但其中一些小组件和设计思路仍然有参考价值：

| Playground 能力 | 是否迁移 | 处理方式 |
|---|---:|---|
| 模型选择器 | 可参考 | 融入自己的模型选择组件 |
| 动态参数面板 | 可参考 | 融入自己的图片/视频参数面板 |
| 任务队列 UI | 可参考 | 统一接入自己的任务系统 |
| 结果画廊 | 可参考 | 融入自己的素材库或画布结果区 |
| Prompt 历史 | 可参考 | 融入自己的提示词库 |
| 素材选择弹窗 | 可参考 | 融入自己的资产系统 |
| Playground 页面整体 | 不建议 | 不独立迁移 |

也就是说：

```text
不迁移 Playground 页面
只吸收 Playground 中局部组件的交互思路
```

---

## 7. LumenX Studio 中最值得迁移的模块

建议按优先级迁移：

| 优先级 | 模块 | 价值 |
|---|---|---|
| P0 | ScriptProcessor | 剧本解析，是短漫剧流程入口 |
| P0 | StoryboardComposer | 分镜生成，是 Studio 核心 |
| P0 | StoryboardFrameEditor | 单个分镜编辑，是镜头生产基础 |
| P0 | CharacterWorkbench | 角色管理，解决角色一致性 |
| P0 | ConsistencyVault | 一致性资产库，是短漫剧核心能力 |
| P1 | ArtDirection | 统一画风和视觉风格 |
| P1 | AssetGrid | 资产管理，可接自己的素材库 |
| P1 | VideoGenerator | 镜头视频生成 |
| P1 | VideoQueue | 视频任务队列 |
| P2 | VoiceActingStudio | 配音/TTS，视产品范围决定 |
| P2 | Timeline | 时间线，适合后期合成 |
| P2 | FinalMixStudio | 最终混音/合成 |
| P2 | ExportStudio | 导出成片 |
| P3 | PlaygroundPage | 不建议迁移 |

---

## 8. 推荐的产品架构

最终项目可以拆成四个主要区域：

```text
/app
├── /canvas
│   └── 无限画布，自由创作入口
│
├── /studio
│   └── 短漫剧 Studio，结构化生产入口
│
├── /assets
│   └── 统一素材库
│
└── /settings
    └── 模型、供应商、账号、存储配置
```

其中：

- `/canvas` 负责自由创作；
- `/studio` 负责短漫剧项目流程；
- `/assets` 负责统一素材沉淀；
- `/settings` 负责模型和系统配置。

---

## 9. Canvas 和 Studio 的关系

Canvas 和 Studio 不应该互相替代，而应该互相协作。

推荐的交互方式：

```text
Studio 中的角色 / 场景 / 分镜
        ↓
发送到 Canvas 继续自由编辑
        ↓
Canvas 生成或修改结果
        ↓
回填到 Studio 的分镜或资产库
```

这样可以形成清晰的产品闭环：

```text
Studio 负责流程管理
Canvas 负责自由创作
Assets 负责素材沉淀
Backend 负责任务、生成、存储和导出
```

---

## 10. 和自己后端的关系

因为自己已经有独立后端，所以不需要迁移 LumenX、ArcReel、Jellyfish 的后端。

迁移时应该只迁移或参考它们的前端：

```text
迁移重点：
- 页面结构
- 组件组织
- 前端状态管理
- 业务流程
- 数据模型设计
- 交互方式

不迁移重点：
- 原项目后端
- 原项目 API 假设
- 原项目任务队列实现
- 原项目存储逻辑
- 原项目模型供应商绑定
```

LumenX Studio 前端需要改造成调用自己的后端 API。

建议在自己的前端中建立统一 API 适配层：

```text
src/services/studio/
├── project.service.ts
├── script.service.ts
├── storyboard.service.ts
├── character.service.ts
├── asset.service.ts
├── video-task.service.ts
├── voice.service.ts
└── export.service.ts
```

这样可以避免把 LumenX 原始 API 结构硬塞进自己的项目。

---

## 11. 迁移策略

不建议“一次性复制整个 Studio”。

建议分阶段迁移：

### 第一阶段：搭建 Studio 壳

目标：

- 新增 `/studio` 路由；
- 新增项目列表；
- 新增短漫剧项目详情页；
- 建立 Studio 状态管理；
- 接入自己的后端项目 API。

### 第二阶段：迁移剧本和分镜

目标：

- 剧本输入；
- 剧本解析；
- 自动生成分镜；
- 分镜列表；
- 单个分镜编辑。

这是 Studio 的核心 MVP。

### 第三阶段：迁移角色、场景、道具资产

目标：

- 角色管理；
- 场景管理；
- 道具管理；
- 风格设定；
- 一致性资产库。

这一阶段决定短漫剧生成质量。

### 第四阶段：迁移视频生成和任务队列

目标：

- 单个镜头图生视频；
- 多镜头批量生成；
- 任务状态追踪；
- 失败重试；
- 结果回填分镜。

### 第五阶段：迁移配音、时间线和导出

目标：

- TTS 配音；
- 镜头排序；
- 时间线预览；
- 视频合成；
- 导出成片。

---

## 12. 技术改造注意点

### 12.1 Next.js 版本差异

LumenX 是 Next.js 14，自己的项目是 Next.js 16。

需要注意：

- App Router 写法是否一致；
- 动态导入方式；
- Client Component 和 Server Component 边界；
- 环境变量读取方式；
- 构建配置差异。

### 12.2 React 版本差异

LumenX 使用 React 18，自己的项目使用 React 19。

大部分普通组件迁移问题不大，但要注意：

- 旧 hooks 写法；
- 第三方组件兼容性；
- 严格模式下副作用重复执行；
- React 19 下部分库是否存在警告。

### 12.3 Tailwind 版本差异

LumenX 使用 Tailwind 3，自己的项目使用 Tailwind 4。

需要注意：

- 配置文件差异；
- class 是否仍然生效；
- 自定义主题变量；
- 动画和插件配置。

### 12.4 UI 体系差异

自己的项目已经使用 Ant Design 6。

因此 LumenX Studio 的组件不建议原样保留 UI，而是应该逐步接入自己的设计体系：

```text
LumenX 组件逻辑
        ↓
保留业务状态和交互结构
        ↓
替换为自己的 Ant Design / Radix / Tailwind UI
```

### 12.5 API 层重写

因为使用自己的后端，所以 LumenX 的 API 调用需要重写。

建议不要在组件里直接写 fetch，而是统一封装：

```text
组件
 ↓
studio service
 ↓
统一 request client
 ↓
自己的后端 API
```

---

## 13. 最终推荐方案

最终推荐：

```text
主项目：infinite-canvas

保留：
- 自己的无限画布
- 自己的模型配置
- 自己的素材库
- 自己的视频生成能力
- 自己的后端

重点迁移：
- LumenX Studio 的业务流程
- LumenX Studio 的分镜系统
- LumenX Studio 的角色/场景/道具管理
- LumenX Studio 的一致性资产管理
- LumenX Studio 的视频任务队列和导出流程

选择性参考：
- LumenX Playground 的参数面板、任务队列、结果画廊
- ArcReel 的任务系统、供应商配置、成本统计、剪映导出
- Jellyfish 的角色一致性、结构化分镜、资产模型

不建议：
- 整体迁移 LumenX Playground
- 同时整合三个项目的完整前端
- 把其他项目后端强行并入自己的后端
```

---

## 14. 最核心判断

这次讨论得出的核心判断是：

> 你的无限画布已经覆盖了 Playground 的价值；你真正缺的是 Studio 这种围绕剧本、分镜、角色一致性和镜头视频生成的结构化生产台。

所以：

```text
Canvas = 自由创作
Studio = 项目制短漫剧生产
Assets = 统一素材沉淀
Backend = 生成任务和数据持久化
```

这是最清晰、最适合长期演进的产品架构。

---

## 15. 一句话版

**不要把 LumenX Playground 搬进来；把 LumenX Studio 改造成自己的短漫剧模块，并让它和现有无限画布、素材库、后端任务系统打通。**
