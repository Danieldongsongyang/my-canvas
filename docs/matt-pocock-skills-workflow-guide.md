# Matt Pocock Engineering Skills 使用指南

这份文档记录当前仓库里这套 Matt Pocock engineering skills 的推荐使用方式：什么时候用哪个 skill、每个环节的输入和产出是什么，以及它们如何从“一个想法”走到“可执行 issue”和“代码实现”。

本文面向 `my-canvas` 当前工作流。当前项目推荐把 GitHub Issues 作为 issue tracker，使用 `ready-for-agent` 等 triage 标签，并以根目录 `CONTEXT.md` 与 `docs/adr/` 作为领域文档来源。

## 1. 一句话总览

- `setup-matt-pocock-skills`：第一次使用这套工程技能前运行一次，告诉技能 issue 发哪里、标签叫什么、领域文档在哪里。
- `ask-matt`：不知道该用哪个 skill 时，用它问路。
- `codebase-design`：设计模块边界、接口、测试 seam 和 deep module。
- `grilling` / `grill-me` / `grill-with-docs`：需求还模糊时，用追问把方案烤熟。
- `to-prd`：把已经讨论清楚的方案整理成 PRD，并发布到 issue tracker。
- `to-issues`：把 PRD 拆成多个可独立领取和实现的 issue。
- `triage`：处理已经存在的 issue / PR，判断它缺信息、拒绝、交给人做，还是交给 agent 做。
- `implement`：根据 PRD 或 issue 真正实现。
- `tdd`：需要测试先行时使用。
- `diagnosing-bugs`：遇到 bug、报错、性能问题或行为异常时使用。
- `handoff`：上下文太长、需要交接给另一个 agent 或另一个会话时使用。

## 2. 最重要的区分

`to-prd` 和 `triage` 最容易混淆，因为它们都可能产出 `ready-for-agent`。

区别是入口不同：

```text
新想法 / 新功能方案已经在对话里讨论清楚
        -> to-prd

GitHub 上已经存在一个原始 issue / PR，需要判断怎么处理
        -> triage
```

例如：

- “我们要给画布加全景图能力，并且已经讨论完计划”适合 `to-prd`。
- “GitHub #42 有人反馈图片详情不支持 360 全景图，帮我看看该怎么处理”适合 `triage`。
- “全景详情打开黑屏，帮我排查”适合 `diagnosing-bugs`。
- “根据这个 ready-for-agent issue 开始实现”适合 `implement`。

## 3. 第一次使用：setup-matt-pocock-skills

### 什么时候用

一个仓库第一次使用 `to-prd`、`to-issues`、`triage`、`implement` 这套工程技能前，先运行一次。

### 它解决什么

它补齐这三类工作流配置：

1. Issue tracker 在哪里。

   技能需要知道 PRD 和 issue 应该发布到哪里。常见选择：

   - GitHub Issues
   - GitLab Issues
   - 本地 markdown 文件，也就是 `.scratch/<feature>/...`
   - Jira / Linear / 其他系统

2. Triage 标签怎么映射。

   技能内部使用这些标准状态：

   ```text
   needs-triage
   needs-info
   ready-for-agent
   ready-for-human
   wontfix
   ```

   但真实仓库可能用不同标签名。setup 会把标准状态和真实标签名记录下来。

3. 领域文档在哪里。

   后续技能需要读项目领域词汇和架构决策。当前项目推荐：

   ```text
   CONTEXT.md
   docs/adr/
   ```

### 它通常会创建什么

通常会新增：

```text
docs/agents/issue-tracker.md
docs/agents/triage-labels.md
docs/agents/domain.md
```

并在 `AGENTS.md` 里追加或更新 `## Agent skills` 区块。

### 当前项目推荐选择

对 `my-canvas`，推荐：

```text
Issue tracker: GitHub Issues
PRs as request surface: no
Triage labels: 默认标签名
Domain docs: single-context，使用 CONTEXT.md + docs/adr/
```

## 4. codebase-design

### 什么时候用

当你要决定一个功能应该如何进入当前代码库时使用。

适合场景：

- 设计新功能模块。
- 判断逻辑应该放在 hook、service、store、component 还是 API adapter。
- 找 deep module 的接口。
- 判断是否需要新增 seam。
- 判断某个抽象是不是太浅。
- 为后续测试设计合适的 seam。

### 它关注什么

它关注代码结构和模块设计，不只是功能描述。

常用词汇：

- Module：模块。
- Interface：模块暴露给外部的接口。
- Seam：可以替换、测试或隔离复杂度的边界。
- Adapter：连接外部系统或第三方库的适配层。
- Depth：模块内部承载复杂度、外部接口保持简单的程度。
- Locality：相关规则是否放在合适且集中的地方。
- Leverage：一个模块或接口带来的复用和简化收益。

### 产出是什么

通常产出一份设计计划，说明：

- 新增或修改哪些 module。
- 哪些接口应该稳定。
- 哪些逻辑不要散落到 UI。
- 哪些 seam 用来测试。
- 哪些事情第一版不做。

### 当前全景图例子

画布全景图计划里，`codebase-design` 的核心结论是：

- 新增 `Canvas Panorama Policy Module`，集中处理全景判断、prompt 约束、2:1 config 和 metadata 写入。
- 新增 `Canvas Panorama Viewer Module`，隔离 Photo Sphere Viewer 的生命周期、CSS 和事件处理。
- 第一版不新增浅层 `PanoramaProvider`，因为当前只有一个真实 viewer adapter。
- 第一版不把全部生成编排大迁移当 blocker，先在当前 hook 和已有 orchestration 两处接入全景策略。

## 5. grilling / grill-me / grill-with-docs

### 什么时候用

需求还不清楚、有很多产品判断或架构风险时使用。

适合场景：

- 用户只有一个模糊想法。
- 方案里有多个前提没确认。
- 需求看似简单，但涉及产品边界。
- 需要把“我想要 X”变成“第一版具体做什么、不做什么”。

### 三者区别

- `grilling`：常规追问，把方案一步步问清楚。
- `grill-me`：更强的压力测试，专门找计划里的漏洞、假设和未定义边界。
- `grill-with-docs`：一边追问，一边把落地的领域术语或架构决定写进文档。

### 产出是什么

通常产出：

- 明确的需求边界。
- 被确认的实现前提。
- out of scope。
- 领域词汇或 ADR 更新。
- 可以进入 `to-prd` 的稳定方案。

### 什么时候可以跳过

如果需求已经被充分讨论，并且用户已经明确认可关键决策，可以跳过。

例如全景图计划里，用户已经确认：

```text
AiConfig.size = "2:1" 由后端支持
第一版不需要前端 fallback
其他建议都赞同
```

这时可以直接进入 `to-prd`。

## 6. to-prd

### 什么时候用

当一个方案已经讨论清楚，需要整理成产品需求文档并发布到 issue tracker 时使用。

适合场景：

- 已经有计划文档。
- 已经读过代码库。
- 关键前提已经确认。
- 需要把对话沉淀成 PRD。
- 需要让后续 `to-issues` 或 `implement` 有正式输入。

### 它不会做什么

`to-prd` 的说明要求：不要采访用户，只综合已有上下文。

所以它不适合在需求还很模糊时直接使用。那种情况先用 `grilling` 或 `codebase-design`。

### 输入是什么

可以来自：

- 当前对话。
- 代码库调研结果。
- 已有计划文档。
- 已确认的产品和技术决策。
- `CONTEXT.md` 和 ADR 中的项目词汇。

### 输出是什么

一份 PRD，通常发布为 GitHub issue，并打上：

```text
ready-for-agent
```

PRD 模板包含：

- Problem Statement
- Solution
- User Stories
- Implementation Decisions
- Testing Decisions
- Out of Scope
- Further Notes

### 注意点

`to-prd` 的 Implementation Decisions 里不应该写具体文件路径或行号。PRD 应尽量描述模块、接口、行为和契约，避免因代码移动导致文档过期。

## 7. to-issues

### 什么时候用

当 PRD 太大，不能让一个 agent 一次实现完时使用。

适合场景：

- PRD 覆盖多个模块。
- 需要拆成多个可独立完成的小闭环。
- 希望多个 agent 或多个会话并行推进。
- 希望每个 issue 都有清晰验收标准。

### 它怎么拆

`to-issues` 倾向使用 tracer bullet 垂直切片。

好拆法是每个 issue 都打通一条小的端到端行为：

```text
Issue 1：全景策略接入生成请求和 metadata 传播
Issue 2：图片详情弹窗支持全景查看
Issue 3：图片工具栏支持全景 / 平面切换
```

不推荐纯水平拆分：

```text
Issue 1：只加类型
Issue 2：只加组件
Issue 3：只接 API
Issue 4：最后统一串起来
```

水平拆法很容易导致每个 issue 单独不可验收。

### 输出是什么

多个 issue，每个 issue 通常包含：

- Summary
- Context
- Desired behavior
- Acceptance criteria
- Testing notes
- Blocked by
- Out of scope

这些 issue 默认应该是 agent-ready，可以直接交给 `implement`。

## 8. triage

### 什么时候用

`triage` 用来处理已经存在的 issue 或 PR。

适合场景：

- 有人提交了一个 raw issue。
- 有人提交了一个 PR。
- 仓库里堆了一批 unlabeled issue。
- 你想知道哪些 issue 需要维护者注意。
- 你想知道哪些 issue 已经可以交给 agent 做。
- 你想把某个 issue 移到 `ready-for-agent`。

### 它不是用来做什么的

它不是从零写 PRD 的主线工具。

如果你和 agent 正在一起设计一个新功能，通常先走：

```text
codebase-design -> to-prd -> to-issues
```

如果 GitHub 上已经有一个 issue，才走：

```text
triage -> implement
```

### triage 的状态

它会给 issue / PR 分配一个类别和一个状态。

类别：

```text
bug
enhancement
```

状态：

```text
needs-triage      需要维护者评估
needs-info        缺信息，等 reporter 补充
ready-for-agent   已经足够清楚，可以交给 agent
ready-for-human   需要人类实现或判断
wontfix           不做
```

一个理想的 triaged issue 应该有：

```text
一个 category label + 一个 state label
```

例如：

```text
enhancement + ready-for-agent
bug + needs-info
enhancement + wontfix
```

### triage 会做什么

处理单个 issue / PR 时，它会：

1. 读取 issue / PR 的正文、评论、标签、作者和时间。
2. 如果是 PR，还会读取 diff。
3. 读取项目领域词汇和 ADR。
4. 搜代码库，判断请求是否已经实现。
5. 检查 `.out-of-scope/`，判断类似 enhancement 是否以前被拒绝过。
6. 给维护者推荐 category 和 state。
7. 如果是 bug，尽量复现。
8. 如果信息不够，转为 `needs-info`。
9. 如果需求清楚且可交给 agent，转为 `ready-for-agent`。
10. 如果转为 `ready-for-agent`，写 `Agent Brief`。

### Agent Brief 是什么

`Agent Brief` 是 issue 进入 `ready-for-agent` 时给后续 agent 的执行合同。

它通常包含：

- Category
- Summary
- Current behavior
- Desired behavior
- Key interfaces
- Acceptance criteria
- Out of scope

好的 Agent Brief 描述行为和接口，不写死文件路径和行号。

好例子：

```text
当用户开启全景图时，生成请求应使用 2:1 尺寸，并保留全景 metadata。
```

差例子：

```text
打开某个 ts 文件第 42 行，把 size 改成 2:1。
```

### `.out-of-scope/` 是什么

`.out-of-scope/` 是 rejected enhancement 的知识库。

只在这种情况写入：

```text
某个 enhancement 被明确拒绝为 wontfix
```

不要在这种情况写入：

```text
issue 关闭原因是功能已经实现
bug 被判定无效
```

它的作用是让以后类似请求出现时，triage 能提醒维护者：这个方向以前已经拒绝过，原因是什么。

## 9. implement

### 什么时候用

当你已经有一个 PRD 或一个足够清楚的 issue，需要真正改代码时使用。

适合输入：

- `to-prd` 生成的 PRD issue。
- `to-issues` 拆出来的某个 issue。
- `triage` 标为 `ready-for-agent` 的 issue。
- 用户直接给出的明确实现任务。

### 它应该做什么

`implement` 应该：

- 读 PRD / issue。
- 读代码库和相关文档。
- 制定实现计划。
- 修改代码。
- 跑相关测试。
- 报告结果。

### 与 to-issues 的关系

如果 PRD 很大，优先先用 `to-issues` 拆小，再对单个 issue 用 `implement`。

这样更容易控制范围，减少一个 agent 一次改太多造成的风险。

## 10. tdd

### 什么时候用

当你希望明确走测试驱动开发时使用。

适合场景：

- 纯函数策略模块。
- 状态机。
- 复杂数据转换。
- 生成请求参数构造。
- bug 修复需要先复现。

### 当前全景图例子

全景策略模块适合 TDD：

```text
先写测试：
- isPanoramaNode 判断普通图和全景图
- buildPanoramaPrompt 追加全景约束
- buildPanoramaPrompt 不重复追加
- buildPanoramaGenerationConfig 强制 size = "2:1"
- applyPanoramaMetadata 写入 true / false

再实现 policy module。
```

### 什么时候不必强行用

第三方 WebGL viewer 的内部行为不适合测试太深。

对于 `CanvasPanoramaViewer`，第一版可以以手动验证为主；如果补自动测试，只测试可观察行为，比如：

- 容器渲染。
- 空 src 或错误状态。
- unmount 时销毁 viewer。

不要测试 Photo Sphere Viewer 内部。

## 11. diagnosing-bugs

### 什么时候用

当目标是定位问题，而不是设计新功能时使用。

适合场景：

- 报错。
- 测试失败。
- 功能不生效。
- 性能变慢。
- UI 行为异常。
- 生成链路结果不符合预期。

### 当前全景图例子

这些情况适合 `diagnosing-bugs`：

```text
全景详情打开黑屏
viewer 拖动时底层画布也在拖动
滚轮缩放同时影响 viewer 和画布
生成结果没有保留 panorama metadata
批量主图切换后全景状态丢失
```

### 与 triage 的关系

如果 bug 是 GitHub issue 里报的：

```text
triage #issue
        -> 确认是 bug
        -> diagnosing-bugs
        -> implement
```

如果 bug 是你直接在对话里告诉 agent 的：

```text
diagnosing-bugs
        -> implement
```

## 12. handoff

### 什么时候用

当上下文太长，或需要交给另一个 agent / 另一个会话继续时使用。

适合场景：

- 已经做了很多调研，但还没实现。
- 实现到一半需要换会话。
- 有多个文档、决策和代码状态需要交代清楚。
- 上下文接近变长，需要压缩成可靠交接材料。

### 输出是什么

通常是一份交接文档，包含：

- 当前目标。
- 已经完成什么。
- 关键决策。
- 相关文件。
- 未完成事项。
- 下一步建议。

## 13. 推荐工作流

### 路线 A：从一个新功能想法开始

适用于“我要设计并实现一个新功能”。

```text
setup-matt-pocock-skills
        ↓
codebase-design
        ↓
grilling / grill-me / grill-with-docs（可选）
        ↓
to-prd
        ↓
to-issues
        ↓
implement
        ↓
tdd / diagnosing-bugs（按需要）
```

说明：

- `setup-matt-pocock-skills` 只需要第一次跑。
- 如果方案还不清楚，先 `grilling`。
- 如果方案已经清楚，直接 `to-prd`。
- 如果 PRD 很大，再 `to-issues`。
- 最后用 `implement` 一个个实现。

### 路线 B：从已有 issue 或 PR 开始

适用于“GitHub 已经有人提了 issue / PR”。

```text
setup-matt-pocock-skills
        ↓
triage
        ↓
grilling / domain-modeling（如果信息不够）
        ↓
ready-for-agent
        ↓
implement
```

`triage` 负责把 raw issue / PR 分成：

```text
needs-info
ready-for-agent
ready-for-human
wontfix
```

### 路线 C：从 bug 开始

适用于“某个东西坏了”。

```text
diagnosing-bugs
        ↓
tdd（可选）
        ↓
implement
```

如果 bug 来自 GitHub issue：

```text
triage
        ↓
diagnosing-bugs
        ↓
implement
```

### 路线 D：改善代码架构

适用于“扫描架构问题、寻找模块 deepening 机会”。

```text
improve-codebase-architecture
        ↓
codebase-design
        ↓
grill-me / grill-with-docs
        ↓
to-prd 或直接写计划
        ↓
to-issues
        ↓
implement
```

### 路线 E：不知道该用哪个

适用于“我知道目标，但不知道应该走哪个 skill”。

```text
ask-matt
        ↓
按推荐进入对应路线
```

## 14. 当前全景图功能的推荐链路

当前“画布全景图能力”已经具备这些条件：

- 已经读过当前代码库。
- 已经用 `codebase-design` 重写过计划文档。
- 已经确认 `AiConfig.size = "2:1"` 由后端支持。
- 已经确认第一版不把生成编排大迁移作为 blocker。
- 已经有明确的第一版范围和 out of scope。

所以推荐链路是：

```text
setup-matt-pocock-skills
        ↓
to-prd
        ↓
to-issues
        ↓
implement
```

其中：

- `setup-matt-pocock-skills` 用来补齐 GitHub issue tracker、triage labels 和 domain docs 配置。
- `to-prd` 用来把 `docs/canvas-panorama-integration-plan.md` 和对话确认内容整理成 PRD issue。
- `to-issues` 用来把 PRD 拆成几个可独立实现的 tracer bullet issue。
- `implement` 用来逐个实现这些 issue。

这个功能当前不需要先走 `triage`，因为它不是外部提交的 raw issue，而是已经讨论清楚的 feature plan。

## 15. 使用口诀

可以用下面这组判断来快速选择：

```text
第一次使用这套工程技能？
        -> setup-matt-pocock-skills

不知道该用哪个 skill？
        -> ask-matt

想设计模块和接口？
        -> codebase-design

需求还不清楚？
        -> grilling / grill-me / grill-with-docs

方案清楚了，要变成 PRD？
        -> to-prd

PRD 太大，要拆成可执行 issue？
        -> to-issues

已有 issue / PR 要分拣？
        -> triage

已经有明确 issue / PRD，要写代码？
        -> implement

要测试先行？
        -> tdd

东西坏了，要查原因？
        -> diagnosing-bugs

上下文太长，要交接？
        -> handoff
```

## 16. 当前项目的建议落地顺序

对 `my-canvas`，建议先做：

```text
1. 执行 setup-matt-pocock-skills
2. 确认使用 GitHub Issues
3. 确认 PRs as request surface = no
4. 确认 triage labels 使用默认标签名
5. 确认 domain docs 使用 CONTEXT.md + docs/adr/
6. 用 to-prd 发布全景图 PRD
7. 用 to-issues 拆全景图实施 issue
8. 用 implement 开始第一条 issue
```

这样之后每一步都有清晰输入和输出，不需要每次重新解释仓库工作流。
