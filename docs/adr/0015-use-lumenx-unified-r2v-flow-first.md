# 第一阶段优先迁移 LumenX 统一 R2V 流程

迁移 LumenX Studio 时，第一阶段采用 LumenX 当前主线的统一 R2V 流程，而不是旧的 i2v legacy 流程。首批迁移围绕 `ScriptProcessor`、`ArtDirection`、`Cast`、`StoryboardR2V` 和后续 `VideoAssembly` 展开；`ConsistencyVault`、`StoryboardComposer`、`StoryboardFrameEditor`、`VideoGenerator` 和 `VideoQueue` 只作为可复用局部或兼容参考。

**Considered Options**

- 先迁移旧 i2v legacy 流程，因为原迁移总结中的 P0 模块多来自这条路径。
- 先迁移统一 R2V 流程，因为 LumenX 当前项目详情页已经把它作为主工作流。

**Consequences**

第一阶段会更贴近 LumenX 当前 Studio 的主线体验，并减少一开始就背负旧兼容流程的成本。原迁移总结中的 P0 排序需要调整为统一 R2V 优先，旧流程组件不作为 MVP 必选项。
