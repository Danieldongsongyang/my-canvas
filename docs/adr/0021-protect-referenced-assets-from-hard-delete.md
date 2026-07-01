# 默认保护仍被引用的 asset

本地素材库删除 asset 时，第一阶段默认检查 Studio 候选媒体和 Canvas 节点媒体引用；如果 asset 仍被 Studio 项目、镜头、角色、场景、道具或 Canvas 节点使用，则阻止硬删并展示引用位置。用户需要先在对应 Studio 或 Canvas 位置解除引用，asset 无引用后才允许删除。

**Considered Options**

- 删除 asset 时自动清空所有 Studio 和 Canvas 引用。
- 默认允许强制删除，并让引用位置显示缺失媒体。
- 默认阻止删除仍被引用的 asset，第一阶段不提供危险强删。

**Consequences**

这个选择避免 Studio 候选和 Canvas 节点在用户不知情时突然变空，也让 asset-first 媒体模型更可预测。强制删除可以作为未来高级危险操作设计，但需要影响预览、明确确认和可能的恢复策略，不属于第一阶段 MVP。
