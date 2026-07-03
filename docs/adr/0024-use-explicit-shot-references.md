# Studio 镜头使用显式引用而不是名称匹配

Issue 7 的 Storyboard 镜头候选生成不采用“角色、场景或道具名称出现在镜头文本中就视为引用”的默认机制。`StudioShot` 应保存对本集角色、场景和道具的显式引用，Script 解析和结构草稿保存流程负责产出或维护这些引用，Storyboard 生成再根据这些引用读取 Cast selected reference images。

**Considered Options**

- 先用名称匹配推断 shot 引用，后续再升级为显式引用。
- Issue 7 直接引入 shot-level 显式引用。

**Consequences**

这个选择让 Storyboard 的一致性链路更接近 LumenX 的 `character_ids` / `scene_id` / `prop_ids` 模型，也避免用户因为文案改写、别名、省略称呼或中文分词边界而得到不可解释的参考图选择。实现上需要让 Script 解析结果、手工结构草稿和 Storyboard 派生模型都认识 `StudioShot.metadata.references`，并在 UI 中展示和处理缺失引用，而不是把名称匹配作为默认兜底。
