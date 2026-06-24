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
桌面端保存和使用的用户素材集合，第一阶段由当前前端本地持久化承载，不归 mange-backend 所有。
_Avoid_: 后端素材库、云素材库

**本地提示词库**:
桌面端内置或本地保存的提示词集合，第一阶段由当前前端静态数据或本地持久化承载，不归 mange-backend 所有。
_Avoid_: 后端提示词库、云提示词库

**AI 漫剧生成流程**:
桌面端后续计划新增的工具流程，和画布并列作为工具入口页上的一个功能入口。
_Avoid_: 画布子功能、后端管理功能

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
