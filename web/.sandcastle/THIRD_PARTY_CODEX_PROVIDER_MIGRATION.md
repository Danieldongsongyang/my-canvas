# Sandcastle 使用第三方 Codex API 迁移说明

这份文档是给另一个大模型或工程代理执行用的。目标是把任意项目里已经生成的 `.sandcastle/` 改成使用第三方 OpenAI-compatible API，而不是默认 OpenAI 或 Anthropic。

执行时请保持改动很小，只改 `.sandcastle/` 相关文件。不要重构项目代码，不要覆盖用户已有密钥，不要把真实 API Key 写进可提交文件。

## 背景

Sandcastle 的 `codex` agent 最终会在 Docker 沙箱里启动 `codex exec`。第三方 API 的配置不在 Sandcastle 库源码里，而在 Codex CLI 的 `CODEX_HOME/config.toml` 里。

官方 Codex 支持自定义 `model_provider`。关键字段是：

- `model_provider`: 当前使用的 provider id
- `[model_providers.<id>]`: provider 配置
- `base_url`: 第三方 API 的 OpenAI-compatible `/v1` 根地址
- `wire_api = "responses"`: 使用 Responses API
- `env_key`: API Key 所在环境变量名，不是 API Key 本身

第三方服务最好支持 `POST /v1/responses`。当前 Codex 对 Chat Completions 的支持已经是废弃路线，不要优先走 `/v1/chat/completions`。

参考官方文档：

- https://developers.openai.com/codex/config-advanced#custom-model-providers
- https://developers.openai.com/codex/environment-variables
- https://developers.openai.com/codex/models

## 需要用户提供的信息

开始修改前，确认或从现有文件里识别这些值：

```text
THIRD_PARTY_PROVIDER_ID   例如 mylocalhost 或 thirdparty
THIRD_PARTY_PROVIDER_NAME 例如 mylocalhost API
THIRD_PARTY_BASE_URL      例如 http://host.docker.internal:57927/v1 或 https://api.example.com/v1
THIRD_PARTY_ENV_KEY       例如 My_Localhost_API_Key 或 THIRD_PARTY_API_KEY
THIRD_PARTY_MODEL         例如 gpt-5.4
```

注意：

- 如果第三方 API 运行在宿主机本地，而 Sandcastle 在 Docker 容器里跑，`base_url` 通常要用 `http://host.docker.internal:<port>/v1`。
- 如果第三方 API 是公网服务，直接用它的 `https://.../v1` 地址。
- 如果第三方 API 支持 OpenAI 的所有模型名，`main.ts` 里已有的 `sandcastle.codex("gpt-5.4")` 可以保持不变。
- 只有当第三方 API 不支持当前模型名时，才改 `main.ts` 的模型名。

## 必改文件

通常只需要改这些文件：

```text
.sandcastle/.env
.sandcastle/.env.example
.sandcastle/.gitignore
.sandcastle/codex-home/config.toml
.sandcastle/main.ts    仅当需要替换模型名或想做环境变量化时才改
```

如果 `.sandcastle/codex-home/config.toml` 不存在，就新建。

## 推荐文件内容

### `.sandcastle/codex-home/config.toml`

把下面模板写进去，并替换占位值：

```toml
model_provider = "THIRD_PARTY_PROVIDER_ID"
model = "THIRD_PARTY_MODEL"

[model_providers.THIRD_PARTY_PROVIDER_ID]
name = "THIRD_PARTY_PROVIDER_NAME"
base_url = "THIRD_PARTY_BASE_URL"
wire_api = "responses"
env_key = "THIRD_PARTY_ENV_KEY"
```

示例：

```toml
model_provider = "mylocalhost"
model = "gpt-5.4"

[model_providers.mylocalhost]
name = "mylocalhost API"
base_url = "http://host.docker.internal:57927/v1"
wire_api = "responses"
env_key = "My_Localhost_API_Key"
```

重点：

- `base_url` 必须是合法 TOML 字符串，行尾不要加裸文本。
- `env_key` 必须是环境变量名，例如 `"My_Localhost_API_Key"`，不能填真实 key 值。
- provider id 不要用内置保留名：`openai`、`ollama`、`lmstudio`。

### `.sandcastle/.env`

加入或确认这些变量：

```env
CODEX_HOME=/home/agent/workspace/.sandcastle/codex-home
THIRD_PARTY_ENV_KEY=真实第三方APIKey
GH_TOKEN=真实GitHubToken
```

示例：

```env
CODEX_HOME=/home/agent/workspace/.sandcastle/codex-home
My_Localhost_API_Key=真实第三方APIKey
GH_TOKEN=真实GitHubToken
```

重点：

- `CODEX_HOME` 必须使用容器内路径 `/home/agent/workspace/.sandcastle/codex-home`，不要写宿主机路径。
- `.env` 是密钥文件，不要提交。
- 保留用户已有的 `GH_TOKEN`、其他 Sandcastle 变量和注释。

### `.sandcastle/.env.example`

写占位值，不要写真实密钥：

```env
CODEX_HOME=/home/agent/workspace/.sandcastle/codex-home
THIRD_PARTY_ENV_KEY=
GH_TOKEN=
```

如果项目已有 `OPENAI_KEY=`，可以删除或保留注释说明，但不要让它成为第三方 provider 的主要配置。

### `.sandcastle/.gitignore`

确保包含：

```gitignore
.env
logs/
worktrees/
codex-home/*
!codex-home/
!codex-home/config.toml
```

这样可以提交 provider 配置，但不会提交 Codex 运行时生成的 sqlite、日志、缓存、锁文件。

### `.sandcastle/main.ts`

先搜索：

```bash
rg 'sandcastle\.codex\(' .sandcastle/main.ts
```

如果第三方 API 支持当前模型名，例如支持 `gpt-5.4`，不要改这些模型字符串。

如果需要统一从环境变量读取模型，可以做这种最小改动：

```ts
const CODEX_MODEL = process.env.SANDCASTLE_CODEX_MODEL || "gpt-5.4";
```

然后把：

```ts
agent: sandcastle.codex("gpt-5.4"),
```

改成：

```ts
agent: sandcastle.codex(CODEX_MODEL),
```

并在 `.sandcastle/.env` 和 `.sandcastle/.env.example` 增加：

```env
SANDCASTLE_CODEX_MODEL=gpt-5.4
```

如果只是把 Sandcastle 接到支持 OpenAI 模型名的第三方 API，通常不需要改 `main.ts`。

## 验证步骤

### 1. 验证宿主机 Codex 配置可加载

在项目里执行。把路径换成当前项目的真实路径：

```bash
set -a
source .sandcastle/.env
set +a
CODEX_HOME="$PWD/.sandcastle/codex-home" codex doctor --json
```

期望看到：

- `config.load.status` 是 `ok`
- `auth.credentials.status` 是 `ok`
- `auth.credentials` 里显示 provider auth env var present
- `model provider` 是你配置的 provider id
- `wire API` 是 `responses`

如果 `config.load` 失败，优先检查 `config.toml` 是否是合法 TOML。

### 2. 如果 API 在宿主机本地，验证 Docker 可访问宿主机

如果已经有 Sandcastle 镜像，例如 `sandcastle:web`，执行：

```bash
docker run --rm \
  --entrypoint sh \
  --add-host=host.docker.internal:host-gateway \
  sandcastle:web \
  -lc 'node -e "fetch(\"http://host.docker.internal:57927/v1\").then(async r=>{console.log(r.status); console.log((await r.text()).slice(0,120));}).catch(e=>{console.error(e.message); process.exit(1);})"'
```

如果返回 `404` 但响应体类似 `endpoint not supported`，说明 base URL 可达。这是正常的，因为根 `/v1` 不一定是有效业务接口。

如果超时或连接失败：

- 确认本地第三方 API 服务正在监听对应端口
- 确认 Docker 能访问 `host.docker.internal`
- macOS/Windows Docker Desktop 通常直接支持
- Linux 可能需要 `--add-host=host.docker.internal:host-gateway`

### 3. 验证容器内 Codex 能读配置并看到 provider

```bash
docker run --rm \
  --entrypoint sh \
  --add-host=host.docker.internal:host-gateway \
  --env-file "$PWD/.sandcastle/.env" \
  -v "$PWD:/home/agent/workspace" \
  -w /home/agent/workspace \
  sandcastle:web \
  -lc 'codex doctor --json'
```

期望：

- `config.load.status` 是 `ok`
- `auth.credentials.status` 是 `ok`
- `network.provider_reachability.status` 是 `ok`
- `network.provider_reachability` 里 base URL 是 `host.docker.internal` 或公网第三方地址
- `network.websocket_reachability.details.wire API` 是 `responses`

### 4. 做最小模型调用测试

```bash
docker run --rm \
  --entrypoint sh \
  --add-host=host.docker.internal:host-gateway \
  --env-file "$PWD/.sandcastle/.env" \
  -v "$PWD:/home/agent/workspace" \
  -w /home/agent/workspace \
  sandcastle:web \
  -lc 'codex exec --json --ephemeral --ignore-rules --skip-git-repo-check -s read-only -m gpt-5.4 -c "approval_policy=\"never\"" "只回复 SANDCASTLE_DOCKER_OK，不要调用工具。"'
```

期望输出里出现：

```text
SANDCASTLE_DOCKER_OK
```

如果这个通过，就说明 Docker 里的 Codex 已经能通过第三方 API 调模型。

## 常见错误和修复

### `config could not be loaded`

通常是 `config.toml` 语法错。检查：

```toml
base_url = "http://host.docker.internal:57927/v1"   host.docker.internal
```

这种是错的。应改成：

```toml
base_url = "http://host.docker.internal:57927/v1"
```

### `provider auth env var missing`

说明 `env_key` 写的是某个变量名，但 `.env` 里没有这个变量。

错误示例：

```toml
env_key = "sk-xxxx"
```

正确示例：

```toml
env_key = "THIRD_PARTY_API_KEY"
```

并在 `.env` 里写：

```env
THIRD_PARTY_API_KEY=sk-xxxx
```

### 宿主机 `127.0.0.1` 通，但 Docker 里不通

容器里的 `127.0.0.1` 是容器自己，不是宿主机。把 Docker 内使用的地址改成：

```toml
base_url = "http://host.docker.internal:<port>/v1"
```

### `Not inside a trusted directory`

最小测试命令可以加：

```bash
--skip-git-repo-check
```

完整 Sandcastle 运行通常会由 Sandcastle 挂载仓库和 git 信息。如果完整运行仍然报这个错，优先确认是在项目根目录执行，且 `.git` 能被 Sandcastle 挂载。

### 模型名问题

如果第三方 API 支持 `gpt-5.4`、`gpt-5.5` 等 OpenAI 模型名，保留 `main.ts` 里的原模型名即可。

如果第三方 API 使用自己的模型名，才改 `.sandcastle/main.ts` 的 `sandcastle.codex("...")`。

## 完成标准

迁移完成时必须满足：

- `.sandcastle/codex-home/config.toml` 存在，并配置了自定义 provider
- `.sandcastle/.env` 有 `CODEX_HOME=/home/agent/workspace/.sandcastle/codex-home`
- `.sandcastle/.env` 有 `env_key` 指向的真实密钥变量
- `.sandcastle/.env.example` 只有占位值，没有真实密钥
- `.sandcastle/.gitignore` 忽略 `.env` 和 `codex-home` 运行态文件
- `codex doctor` 能加载 provider
- Docker 容器内最小 `codex exec` 能通过第三方 API 返回固定文本
- 没有把真实 API Key 写进 `config.toml`、`.env.example`、README、日志或提交文件

## 可直接交给大模型的执行提示词

把下面这段复制给执行迁移的大模型：

```text
请把当前项目的 .sandcastle 配置迁移为使用第三方 OpenAI-compatible Codex API。

只允许修改 .sandcastle/ 下的文件，不要改业务代码，不要重构，不要覆盖已有密钥。

第三方 API 信息：
- provider id: <填写，例如 mylocalhost>
- provider name: <填写，例如 mylocalhost API>
- base URL: <填写，例如 http://host.docker.internal:57927/v1 或 https://api.example.com/v1>
- API key 环境变量名: <填写，例如 My_Localhost_API_Key>
- 模型名: <填写，例如 gpt-5.4>

要求：
1. 创建或更新 .sandcastle/codex-home/config.toml，使用自定义 model_provider，wire_api 必须为 responses，env_key 必须填环境变量名，不要填真实 key。
2. 更新 .sandcastle/.env，加入 CODEX_HOME=/home/agent/workspace/.sandcastle/codex-home，并确保 API key 环境变量存在。保留已有 GH_TOKEN。
3. 更新 .sandcastle/.env.example，只写占位变量，不写真实密钥。
4. 更新 .sandcastle/.gitignore，忽略 .env、logs/、worktrees/、codex-home/*，但保留 codex-home/config.toml 可提交。
5. 如果第三方 API 支持当前 main.ts 里的模型名，例如 gpt-5.4，不要改 main.ts。只有第三方不支持该模型名时，才把 sandcastle.codex("...") 改成可用模型名或环境变量形式。
6. 验证：运行宿主机 codex doctor；如果有 Docker/Sandcastle 镜像，再运行容器内 codex doctor 和最小 codex exec。
7. 最终报告列出改了哪些文件、验证命令和结果。不要输出真实 API Key。
```

在 web/.sandcastle/ 下给 Sandcastle 专门放一个 Codex home，例如：
web/.sandcastle/codex-home/config.toml
内容类似这样：
model_provider = "thirdparty"
model = "你的第三方模型ID"

[model_providers.thirdparty]
name = "Third Party API"
base_url = "https://third-party.example.com/v1"
wire_api = "responses"
env_key = "THIRD_PARTY_API_KEY"
然后在 web/.sandcastle/.env 里加：
CODEX_HOME=/home/agent/workspace/.sandcastle/codex-home
THIRD_PARTY_API_KEY=你的第三方APIKey
GH_TOKEN=你原来的GitHubToken
这里的 /home/agent/workspace 是 Sandcastle Docker 沙箱里的 repo 路径，刚才我也从包里确认了常量就是这个路径。不要写宿主机路径 /Users/a1/...，容器里面看不到那个路径。
还要改 main.ts 里的模型名
你现在的 [web/.sandcastle/main.ts (line 81)](/Users/a1/Desktop/my-canvas/web/.sandcastle/main.ts:81) 里写死了：
agent: sandcastle.codex("gpt-5.4")
Sandcastle 最终会生成：
codex exec ... -m gpt-5.4
这个 -m gpt-5.4 会覆盖 config.toml 里的 model。所以你必须把 main.ts 里所有 sandcastle.codex("gpt-5.4") 换成第三方模型 ID，或者更好一点，改成环境变量：
const CODEX_MODEL = process.env.SANDCASTLE_CODEX_MODEL || "你的第三方模型ID";
然后把几处都改成：
agent: sandcastle.codex(CODEX_MODEL)
你的 web/.sandcastle/.env 再加：
SANDCASTLE_CODEX_MODEL=你的第三方模型ID
这样以后换模型不用再改代码。
