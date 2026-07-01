# My Canvas

My Canvas 是一个画布客户端前端，后续会通过桌面壳交付，并连接独立的账号与 AI relay 后端。

## Language

**当前前端**:
当前仓库 `web` 中承载画布、素材、提示词和 AI 交互体验的客户端应用。
_Avoid_: 当前后端、内置后台

**桌面端**:
由当前前端加桌面壳形成的客户端形态，面向终端用户使用。
_Avoid_: 后端一体包、单机后端

**工具入口页**:
用户登录后进入的桌面端首页，用于进入画布、AI 漫剧生成流程和后续新增工具。
_Avoid_: 营销落地页、单一画布首页

**外部端**:
后续可能上线给外部用户访问的 Web 形态，届时可以单独增加营销页和公开访问体验。
_Avoid_: 当前桌面端、当前工具入口页

**mange-backend**:
桌面端依赖的独立账号、额度和 AI relay 后端，是登录态和模型调用凭据的所有者。
_Avoid_: 当前项目后端、前端内置后端

**mange-backend 网页端**:
mange-backend 自带的网页管理与用户入口，用于注册、登录相关网页流程、模型渠道配置、用户和 Key 管理。
_Avoid_: 桌面端管理后台、当前前端 admin

**业务后端**:
当前前端自身拥有账号、管理、素材、提示词或模型渠道等业务数据与规则的服务端能力。
_Avoid_: 同源请求适配层、薄代理

**同源请求适配层**:
当前前端用于统一请求入口、转发登录态请求和屏蔽后端地址差异的轻量边界，本身不拥有业务数据。
_Avoid_: 业务后端、内置后台

**核心代理路径**:
同源请求适配层第一阶段允许转发的 `mange-backend` 登录、用户信息、relay 初始化和用户态 AI relay 路径。
_Avoid_: 万能代理、旧业务接口代理

**后端服务地址**:
同源请求适配层或桌面壳保存的 `mange-backend` API 与网页端地址配置，React 业务代码不直接拼接。
_Avoid_: 组件内后端 URL、分散 API baseUrl

**relay API Key**:
mange-backend 内部持有的模型调用凭据，用于访问 OpenAI 兼容 relay 接口，不暴露给桌面端。
_Avoid_: 登录 token、dashboard access token、前端 API Key

**用户摘要**:
桌面端本地保存的非敏感用户信息，用于恢复 UI 和发送 `New-Api-User`，不代表登录凭据。
_Avoid_: token、relay API Key、dashboard access token

**桌面端登录**:
桌面端第一阶段支持的用户名密码登录流程，成功后依赖 mange-backend session cookie 和用户摘要恢复状态。
_Avoid_: OAuth 登录、Passkey 登录、完整网页登录流程

**relayReady**:
桌面端记录的非敏感状态，表示 mange-backend 已为当前用户准备好后端代持 relay API Key。
_Avoid_: relay API Key、登录 token

**本地素材库**:
桌面端保存和使用的 asset 集合，包含用户成功生成、导入或上传的图片、视频、音频和文本素材，由当前前端资产仓储边界承载，不归 mange-backend 所有。
_Avoid_: 后端素材库、云素材库、仅精选素材、临时缓存

**Studio 候选媒体**:
本地素材库中的 asset 在 Studio 项目、镜头、角色、场景或道具中的候选引用关系；即使未被选中，只要候选关系仍在项目记录中就应保留。
_Avoid_: 未入库结果、独立媒体文件、Canvas 节点媒体、临时缓存

**Canvas 节点媒体**:
本地素材库中的 asset 在画布节点中的引用关系，画布项目负责节点位置、尺寸、连线和画布上下文。
_Avoid_: 独立素材库、Studio 候选媒体、画布资产系统

**素材沉淀**:
用户对本地素材库中的 asset 进行收藏、打标签、归档到项目资产、标记精选或整理复用的动作，不是生成结果进入素材库的前置条件。
_Avoid_: 生成入库、直接互通、隐式同步

**资产引用**:
Studio 项目、Canvas 项目或素材库视图对同一个 asset 的使用关系，通常保存 asset id、storageKey 和使用上下文，而不是复制媒体文件。
_Avoid_: 媒体文件副本、跨模块直接拷贝

**资产删除保护**:
删除本地素材库 asset 前检查 Studio 和 Canvas 是否仍有资产引用的保护规则，第一阶段默认阻止硬删仍被引用的 asset。
_Avoid_: 级联清空引用、默认强制删除、静默删除

**本地提示词库**:
桌面端内置或本地保存的提示词集合，第一阶段由当前前端静态数据或本地持久化承载，不归 mange-backend 所有。
_Avoid_: 后端提示词库、云提示词库

**AI 漫剧生成流程**:
桌面端后续计划新增的工具流程，和画布并列作为工具入口页上的一个功能入口。
_Avoid_: 画布子功能、后端管理功能

**Studio 短漫剧模块**:
桌面端围绕剧本、分镜、角色、场景、道具和镜头生产组织的项目制创作入口，和画布并列存在。
_Avoid_: Playground、画布子页面、后端管理功能

**Studio 系列**:
Studio 短漫剧模块中的作品级容器，用于承载跨集共享的画风、角色、场景、道具和生成偏好。
_Avoid_: 单集项目、Canvas 项目、素材库文件夹

**Studio 剧集**:
Studio 系列下的一集内容，用于承载本集剧本、分镜、镜头候选、镜头视频和流程状态。
_Avoid_: 系列、独立素材、画布节点

**Studio 统一 R2V 流程**:
Studio 短漫剧模块第一阶段采用的主工作流，由剧本、画风、演员表、R2V 分镜工作台和视频组装构成。
_Avoid_: 旧 i2v legacy 流程、完整 Playground 迁移

**Studio 最小生成闭环**:
Studio 短漫剧模块第一阶段必须跑通的真实 relay 链路，从剧本解析到镜头候选生成并回填到本地项目数据。
_Avoid_: 纯静态壳、完整视频生产系统

**Studio 生成适配层**:
当前前端中承载 Studio 剧本解析、提示词组装、结构化结果校验和生成调用的 TypeScript 服务层，底层使用现有用户态 AI relay。
_Avoid_: LumenX Python 后端、mange-backend Studio 业务接口

**Studio 模型候选来源**:
Studio 短漫剧模块第一阶段可选择的模型列表，来自当前用户在 mange-backend 下可用的模型列表和当前项目配置体系。
_Avoid_: LumenX model catalog、Studio 自有渠道列表

**Studio 本地模型偏好**:
Studio 项目本地保存的 text、image、video 模型默认选择和少量生成参数，用于保持长项目内的生成一致性。
_Avoid_: 模型渠道、候选模型列表、mange-backend 配置

**Studio 本地项目数据**:
Studio 短漫剧模块第一阶段保存在桌面端本地数据仓储边界内的项目、剧本、分镜、角色、场景、道具和镜头状态。
_Avoid_: mange-backend 业务数据、云端 Studio 数据

**Studio 本地数据仓储边界**:
Studio 短漫剧模块读写本地项目数据的服务边界，组件和业务模型不得直接依赖 localforage、IndexedDB、本地文件、SQLite 或项目 manifest 等具体存储引擎。
_Avoid_: 组件内 localforage、直接 IndexedDB、存储引擎泄漏

**asset 媒体存储边界**:
本地素材库保存 asset 媒体文件的服务边界，当前 Web 阶段可复用 `image-storage` 和 `file-storage` 存入 IndexedDB，未来 Electron 阶段可迁移到本地文件系统。
_Avoid_: Studio 自有媒体存储、Canvas 自有媒体存储、业务模型直接落盘

**Studio 云端业务后端**:
未来为 Studio 短漫剧模块提供云同步、跨设备、团队协作或成片资产托管的业务服务端能力，不属于第一阶段 mange-backend relay 边界。
_Avoid_: mange-backend、同源请求适配层、第一阶段本地数据

**WebDAV 同步**:
桌面端可选的外部文件同步能力，不属于账号、额度或 AI relay 主链路，也不属于 mange-backend 同源请求适配层。
_Avoid_: 后端数据同步、mange-backend 同步

**远程模式**:
桌面端通过 mange-backend 登录态和用户态 AI relay 使用模型的默认调用方式。
_Avoid_: 后端渠道管理、本地 API Key 模式

**本地直连模式**:
桌面端高级用户自行填写 OpenAI 兼容 `baseUrl` 和 API Key 后直接调用模型服务的可选方式。
_Avoid_: 默认模式、mange-backend relay

**模型渠道**:
mange-backend 网页端管理的模型供应商、接口地址、Key、模型列表和额度策略配置。
_Avoid_: 桌面端渠道配置、当前前端 settings

**远程默认配置**:
桌面端远程模式启动时使用的本地默认 AI 配置，登录后由 mange-backend 用户可用模型补充模型列表。
_Avoid_: 后端公共 settings、桌面端渠道配置
