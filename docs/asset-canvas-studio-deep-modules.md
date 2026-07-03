# Asset / Canvas / Studio 深模块分层建议

本文把当前前端项目先看成 3 个大的深模块：

- `Asset`
- `Canvas`
- `Studio`

然后在这个基础上，继续往下划分每个大模块下面的小深模块。

目标不是为了“画一棵更复杂的树”，而是为了找到真正稳定的 seam，让复杂行为收敛在少量模块后面，让页面、组件和调用方保持轻薄。

## 1. 总体判断

把整个前端先看成 3 个大的深模块，这个思路是成立的，而且是一个很好的起点：

1. `Asset` 负责“媒体资产是什么、存哪、怎么删、谁在引用”
2. `Canvas` 负责“自由编排、节点关系、画布生成、交互编辑”
3. `Studio` 负责“短漫剧五步工作流、结构化生产、步骤间因果链”

但在实现层，不建议把所有代码都硬塞进这三棵树里。

更准确的说法是：

- 产品层可以看成 3 个大深模块
- 实现层应当是 `3 个主模块 + 少量支撑模块`

其中比较明显的支撑模块包括：

- `AI Config / Relay`
- `Local Persistence / File Storage`

它们不直接代表某一个业务域，但被 `Canvas` 和 `Studio` 共同依赖。

## 2. 推荐总图

建议把项目先理解成下面这张模块树：

```text
App
├── Asset
│   ├── Asset Catalog
│   ├── Asset Binary Storage
│   ├── Asset Reference Index
│   └── Asset Intake
├── Canvas
│   ├── Canvas Project
│   ├── Canvas Workspace Session
│   ├── Canvas Editing Engine
│   ├── Canvas Generation
│   └── Canvas Node Semantics
├── Studio
│   ├── Studio Repository
│   ├── Studio Workflow
│   ├── Studio Workspace Model
│   ├── Studio Script
│   ├── Studio Style
│   ├── Studio Cast Assets
│   ├── Studio Storyboard
│   └── Studio Assembly
└── Support
    ├── AI Config / Relay
    └── Local Persistence / File Storage
```

这张图表达的是：

- `Asset / Canvas / Studio` 是三个主模块
- 每个主模块下面继续按“不变量”和“复杂行为”划分小深模块
- 支撑模块单独存在，不混进业务模块里

## 3. Asset 模块往下怎么拆

`Asset` 这个大模块下面，建议至少划分为 4 个小深模块。

### 3.1 Asset Catalog Module

职责：

- 管理资产元数据
- 提供资产的统一结构定义
- 负责增删改查、替换、列表管理

典型接口形态：

```ts
addAsset(...)
updateAsset(...)
removeAsset(...)
replaceAssets(...)
```

这个模块的关键点是：

- 调用方只需要知道“资产是什么、怎么操作”
- 不需要知道引用保护、文件恢复、二进制清理等实现细节

它更像是资产域的主入口。

### 3.2 Asset Binary Storage Module

职责：

- 上传图片或媒体文件
- 恢复可访问 URL
- 维护 `storageKey`
- 清理未使用文件

这个模块适合承载的复杂度包括：

- `blob URL`
- 本地文件恢复
- 图片存储和视频存储的差异
- 历史数据兼容

调用方理想上只应知道：

- 给它原始数据
- 它返回一个可以保存和展示的稳定结果

### 3.3 Asset Reference Index Module

职责：

- 扫描谁在引用某个 asset
- 判断 asset 是否允许删除
- 报告引用位置

这个模块的复杂度来自跨域：

- `Studio` 会引用 asset
- `Canvas` 也会引用 asset

所以这类逻辑不应该散在多个 store 和页面里，而应该统一收在一个模块里。

理想接口可以很小：

```ts
findAssetReferences(assetId)
checkAssetDeletion(assetId)
```

### 3.4 Asset Intake Module

职责：

- 把“上传 / 生成 / 导入”的外部结果统一变成真正的 asset

这个模块当前可以继续补强，因为它非常有价值。

以后比较理想的接口形态可能是：

```ts
createAssetFromGeneratedImage(...)
createAssetFromUpload(...)
createAssetFromExternalUrl(...)
```

这样 `Canvas` 和 `Studio` 就不需要各自重复写：

```text
拿到结果
    ↓
上传二进制
    ↓
写 asset
    ↓
拿 assetId
    ↓
回填业务引用
```

### 3.5 Asset 模块的边界原则

`Asset` 不应该关心：

- `Canvas` 的节点怎么排布
- `Studio` 的角色或镜头如何选择主图

`Asset` 只应关心：

- 资产生命周期
- 资产存储
- 资产引用关系


## 5. Studio 模块往下怎么拆

`Studio` 应该按“工作流不变量”来拆，而不是只按 tab 名称来拆。

也就是说，`Script / Style / Cast / Storyboard / Assembly` 不只是页面步骤，还分别对应一组稳定的业务规则。

### 5.1 Studio Repository Module

职责：

- 管理 `Series / Episode / Entity / Shot` 的本地读写
- 隐藏具体存储细节
- 提供 Studio 数据层的主 seam

它不应该掺入：

- Script 解析规则
- Cast variants 规则
- Storyboard 生成规则

否则 repository 会变成混杂模块。

### 5.2 Studio Workflow Module

这是 `Studio` 里最值得做深的大模块。

它的 Interface 应尽量接近工作法，而不是接近底层 relay 或页面按钮。

理想形态：

```ts
parseAndApplyScript(...)
generateCastReferences(...)
generateShotCandidates(...)
assembleEpisode(...)
```

这个模块负责隐藏的复杂度包括：

- 模型选择和 fallback
- relay 调用
- 结果解析
- asset 创建
- selected/candidate 规则
- repository 回填
- 失败保护

页面层理想上只表达一件事：

- “我要推进这一工作流步骤”

### 5.3 Studio Workspace Model Module

职责：

- 把 `Episode` 派生成 UI 真正需要的 View Model
- 计算步骤状态
- 生成卡片摘要
- 读取和归一化 Style draft
- 为 Cast 和 Storyboard 提供展示模型

这个模块应保持：

- 纯计算
- 不发 I/O
- 易测试

它是一个典型的 in-process 深模块。

### 5.4 Studio Script Module

职责：

- 剧本解析 prompt 组织
- 结构 JSON 解析
- schema 校验
- 坏 JSON 容错
- 结构归一化
- 手工结构合流

这个模块是 `Studio Workflow` 下第一个已经比较自然的子模块。

它的重点不是“调一次文本模型”，而是把解析结果安全、稳定地转换成 Studio 可以继续推进的结构化数据。

### 5.5 Studio Style Module

职责：

- Art Direction draft
- 预设选择
- 正负 prompt 管理
- effective prompt 合成规则

这个模块值得单独成立，因为它不是 UI 装饰，而是后续 Cast 和 Storyboard 的视觉基线。

它尤其应该统一管理：

- Style 如何参与生成
- Style 如何被用户看见
- Style 更新时哪些字段应该保留，哪些应该重组

### 5.6 Studio Cast Assets Module

这是 `Studio` 下面最值得做深的小模块之一。

职责：

- entity prompt
- selected / candidate / reference 不变量
- 生成快照
- variants 晋升和降级
- 与 asset 的映射关系

这块的重要性很高，因为它关系到：

- 角色一致性
- 场景一致性
- 道具一致性
- 后续 Storyboard 的参考基础

它的关键不是“生成图片”，而是“管理可持续迭代的参考资产池”。

### 5.7 Studio Storyboard Module

职责：

- shot prompt
- shot candidate variants
- 基于 Cast selected refs 的镜头候选生成
- shot selected 切换

它和 Cast 很像，但不应该急着再造一套完全独立的镜头资产系统。

更好的做法是：

- 尽量复用 selected/candidate 的资产语义
- 只保留 shot 这个层级特有的规则

### 5.8 Studio Assembly Module

职责：

- final take 选择
- 镜头排序
- 时间线
- 混音
- 导出

这个模块目前可以是后续建设目标，但在架构上应当被看成一个独立深模块。

它不应该退化成一个导出按钮或一个占位页。

### 5.9 Studio 模块的边界原则

`Studio` 应该重点收拢的是：

- 五步生产法的因果关系
- 结构化生产数据
- 步骤间的业务不变量

它不应该承担：

- 资产底层存储的实现细节
- 自由画布编辑器的运行时复杂度

## 6. 支撑模块怎么理解

有些模块不适合被塞进 `Asset / Canvas / Studio` 三者之一。

它们更像整个前端系统的底座。

### 6.1 AI Config / Relay Module

职责：

- 当前用户可用模型
- 模型配置
- 认证信息
- relay 请求适配

这个模块是 `Canvas` 和 `Studio` 的共同依赖。

它不直接表达业务流程，但它是工作流成立的基础条件。

### 6.2 Local Persistence / File Storage Module

职责：

- 本地存储
- 文件恢复
- URL 恢复
- 二进制持久化策略

它也是横切能力。

更好的做法是：

- 保持它是支撑模块
- 由业务模块通过 seam 使用它
- 不让页面直接频繁接触这些底层细节

## 7. 继续往下划分时的四条规则

如果要沿着这套思路继续往下拆，建议始终遵守下面四条规则。

### 7.1 按不变量拆，不按页面拆

一个模块值得成立，不是因为它正好对应一个 tab 或一个面板，而是因为它承载了一组稳定规则。

例如：

- `Cast` 值得成为深模块，不是因为有 Cast 页
- 而是因为它有 `selected/candidate`、variants 保留、主图切换、生成快照这些稳定不变量

### 7.2 用“删除测试”判断模块是否真的有价值

判断一个模块是否值得保留，可以问：

- 如果删掉它，复杂度会不会重新散回多个页面和调用方？

如果答案是会，那么它多半是有价值的深模块。  
如果删掉后只是去掉一层转发，那它大概率只是浅模块。

### 7.3 不要把每个文件都抬成模块

模块层级太碎，会带来两个问题：

- Interface 变多
- 维护者需要学习更多 seam

所以像 `history / viewport / clipboard / selection drag` 这些，更适合作为 `Canvas Editing Engine` 内部的子模块，而不是全部提升成顶层主模块。

### 7.4 共享不变量的东西尽量归并

如果几类对象共享同一套业务规则，就尽量合并到一个模块里。

例如：

- `StudioCharacter`
- `StudioScene`
- `StudioProp`

在 Cast 阶段共享同一套 variants 规则，就不应该急着拆成三个并列深模块。

更合理的方式是：

- 一个 `Studio Cast Assets Module`
- 内部再区分角色、场景、道具的特例



