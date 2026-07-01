# Studio 模型候选来自当前项目配置

Studio 短漫剧模块第一阶段的模型列表和默认选择以当前项目配置为准；LumenX model catalog 不作为模型来源，只作为 Studio 参数面板、模型分组和特殊参数支持的参考。Studio 项目可以本地保存自己的 text、image、video 模型偏好，但候选模型必须来自当前用户在 `mange-backend` 下可用的模型列表。

**Considered Options**

- 迁移 LumenX model catalog 作为 Studio 独立模型来源。
- 只使用当前项目的全局模型选择，不允许 Studio 项目保存本地模型偏好。
- 候选模型来自当前项目配置和 `mange-backend` 用户可用模型，Studio 项目只保存本地默认选择。

**Consequences**

这个选择保持账号、额度、模型权限和渠道配置仍由 `mange-backend` 和当前配置体系负责，同时允许长周期 Studio 项目拥有稳定的生成偏好。LumenX model catalog 可以用于参考参数面板、模型分组、特殊参数和交互信息，但不能把原供应商绑定或独立模型目录带进第一阶段运行时。
