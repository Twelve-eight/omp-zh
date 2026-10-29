# 模型与提供商

本章说明 omp 怎样决定用哪个提供商和模型，怎样登录或配置 API 密钥，怎样在 `models.yml` 里接入一个 OpenAI 兼容端点，以及模型角色、从命令行选模型、思考层级和回退的用法。安装和首次启动见 [第一章](./01-getting-started.md)。

## omp 如何选择提供商

omp 用「提供商/模型」两级命名。提供商是账号或后端命名空间，例如 `anthropic`、`openai`、`google`、`ollama`；模型是提供商下的具体模型，写成 `anthropic/claude-opus-4-6` 这样的选择器。选择器的第一段是提供商 ID，其余是模型 ID，模型 ID 自身可以再含 `/`。

一个模型要出现在选择列表里，必须同时满足两个条件：

1. 它的提供商 ID 不在生效的 `disabledProviders` 列表中；
2. 提供商要么不需要凭据（本地引擎、`auth: none` 的自定义提供商），要么已经配置了凭据。

`disabledProviders` 先于凭据检查。提供商一旦被禁用，存好的密钥、OAuth 会话、环境变量、`.env` 条目和 `models.yml` 的 `apiKey` 都不能让它重新可选。可用性只是配置检查，不验证密钥是否有效，也不刷新 OAuth 令牌。配置错误的密钥可能显示为可用，直到真正发请求才失败。

提供商列表由四部分合成：内置模型目录；`models.yml` 里的自定义提供商和模型；本地引擎以及开启发现（discovery）的托管提供商的缓存与运行时发现结果；扩展注册的提供商和模型。合并时先读 `models.yml` 建立覆盖、自定义模型和模型覆盖，再载入内置目录，再合并发现到的行，最后应用自定义模型和扩展模型。`provider + id` 相同的条目会替换传输元数据并补丁已定义的模型字段，新 ID 则追加。

启动时按此顺序挑初始模型：命令行显式给出的提供商和模型 → 第一个被作用域限制的模型（续接会话时不适用）→ 保存的默认提供商/模型 → 可用模型中已知的提供商默认模型 → 第一个可用模型。自动回退会先把候选池限制在有具体凭据的提供商上，本地无密钥引擎也算有凭据。

查看当前可用的模型：

```powershell
omp models
omp models find qwen
omp models --kind all
```

`omp models` 默认只列聊天模型并按提供商分组；`--kind chat|tiny|image|tts|stt|search|judge` 切换目录种类。`omp models <provider>` 是带提供商过滤的列表，例如 `omp models openai-codex`。

## 登录与凭据

### 会话内登录

在交互会话里用斜杠命令：

- `/login` 打开 OAuth/密钥选择器；`/login <provider>` 直接进入某个提供商，例如 `/login anthropic`；需要粘贴回调地址的 OAuth 流程用 `/login <redirect-url>` 完成。
- `/logout` 打开提供商选择器并删除已存凭据。

登录是提供商级别的：登录 `anthropic` 不等于登录 `openai`，每个提供商各自记录凭据。登录成功后 omp 会在线刷新该提供商的模型目录，新解锁的模型随即出现。首次启动时最省事的做法就是在会话里运行 `/login`。

### 终端登录

```powershell
omp login
omp login anthropic
```

不带参数时显示编号选择器；带参数时直接登录该提供商。终端登录会打印认证链接并在浏览器中打开，从 stdin 读取提示，凭据写入会话使用的同一个存储。本地凭据默认保存在 `%USERPROFILE%\.omp\agent\agent.db`。

无头或远程环境配合共享 auth broker 时，用 `omp auth-broker login <provider>` 和 `omp auth-broker logout`。

### 凭据解析顺序

需要密钥时，omp 按下面的顺序取第一个命中的来源：

1. 运行时覆盖：`--api-key` 这类只对当前进程生效、不落盘的密钥。
2. `models.yml` 里的 `apiKey`：自定义提供商上固定的密钥。它故意排在存储的 OAuth 之前，这样自定义 `baseUrl` 或网关的密钥不会被上游 OAuth 令牌顶掉。
3. 已存储的 OAuth 凭据：需要时自动刷新，多账号会排序并自动轮换。
4. `/login` 保存的 API 密钥凭据。
5. 扩展配置回退：同时提供 `apiKey` 引用和登录流程的扩展提供商，排在存储的 OAuth 和登录密钥之后。
6. 提供商环境变量，包括从 `.env` 文件读到的值。
7. 其它已存储的 API 密钥，例如从 broker 迁移过来的密钥，作为最后手段。

### 迁移凭据

`omp auth` 把已存凭据（API 密钥和 OAuth 登录）导出或导入为 JSON；导出文件含明文凭据，需要妥善保管。

```powershell
omp auth export > credentials.json
omp auth import credentials.json
```

也可用管道直接送到另一台机器：`omp auth export | ssh host omp auth import -`。

## 用环境变量和 `.env` 提供密钥

常见提供商的环境变量：

| 提供商 ID | 环境变量 |
| --- | --- |
| `anthropic` | `ANTHROPIC_OAUTH_TOKEN`，其次 `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `openai-codex` | `OPENAI_CODEX_OAUTH_TOKEN` |
| `google` | `GEMINI_API_KEY` |
| `groq` | `GROQ_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |
| `xai` | `XAI_API_KEY` |
| `xai-oauth` | `XAI_OAUTH_TOKEN`，其次 `XAI_API_KEY` |
| `github-copilot` | `COPILOT_GITHUB_TOKEN` |

`.env` 会在查找提供商之前加载进进程环境，每个变量取第一个非空来源。优先级从高到低：

1. 进程环境里已有的非空值；
2. 当前项目的 `.env`；
3. agent 目录的 `.env`，默认 `%USERPROFILE%\.omp\agent\.env`；
4. 配置根目录的 `.env`，默认 `%USERPROFILE%\.omp\.env`；
5. `%USERPROFILE%\.env`。

非空的进程变量不会被覆盖；非空的项目值优先于 agent、配置根和主目录文件。给单个仓库配网关或本地端点时，项目 `.env` 最省事：

```dotenv
OPENROUTER_API_KEY=sk-or-...
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

键名必须匹配 `[A-Za-z_][A-Za-z0-9_]*`，其它名字和含 NUL 字节的值会被丢弃。环境变量在解析顺序里排在存储的 OAuth 和登录密钥之后，所以想让它生效，先确认没有更早的来源在提供密钥。

## 在 `models.yml` 中添加 OpenAI 兼容端点

自定义提供商写在 `%USERPROFILE%\.omp\agent\models.yml`（同目录下 `models.yml` 优先于 `models.yaml`）。`providers` 是注册表唯一读取的根键。用命名 profile 时路径是 `%USERPROFILE%\.omp\profiles\<name>\agent\models.yml`。

下面是最小示例，取自上游 `docs/models.md` 的「Local OpenAI-compatible endpoint」一节（1130-1139 行）：本地有一个 OpenAI 兼容服务，不需要认证。

```yaml
providers:
  local-openai:
    baseUrl: http://127.0.0.1:8000/v1
    auth: none
    api: openai-completions
    models:
      - id: Qwen/Qwen2.5-Coder-32B-Instruct
        name: Qwen 2.5 Coder 32B (local)
```

端点需要密钥时，删掉 `auth: none`，改成 `apiKey: LOCAL_OPENAI_KEY`。值是「环境变量名或字面量」：如果该字符串正好是一个大小写匹配、值非空的环境变量，就使用变量的值，否则字符串本身就是密钥。以 `!` 开头的值会被当作 shell 命令执行，取去掉首尾空白的 stdout。完整示例见 `docs/providers.md` 86-104 行。

常用字段：

| 字段 | 作用 |
| --- | --- |
| `baseUrl` | 端点根地址 |
| `api` | 传输协议，必填（提供商级或每个模型上） |
| `apiKey` | 密钥，环境变量名或字面量，`!` 前缀表示命令 |
| `auth` | `apiKey`（默认）、`none` 或 `oauth` |
| `authHeader` | 设 `true` 时把密钥作为 `Authorization: Bearer <key>` 注入每个请求 |
| `disableStrictTools` | 对拒绝 strict 字段的 Anthropic 兼容端点设为 `true` |
| `discovery.type` | 运行时从端点发现模型，例如 `openai-models-list` |
| `models[].id` / `name` | 模型 ID（必须与端点接受的模型 ID 一致）和显示名 |
| `models[].contextWindow` / `maxTokens` | 上下文窗口与最大输出 token |

`api` 的常用取值是 `openai-completions`、`openai-responses`、`anthropic-messages`、`bedrock-converse-stream`、`google-generative-ai`、`google-vertex`。服务暴露 `/v1/chat/completions` 就用 `openai-completions`，暴露 `/v1/responses` 就用 `openai-responses`。

校验规则：带 `models` 的提供商必须有 `baseUrl`、认证（`apiKey`，除非 `auth: none` 或 `auth: oauth`）以及提供商级或每个模型上的 `api`。不带 `models` 的覆盖式提供商只需定义至少一个支持的覆盖项，例如 `baseUrl`、`headers`、`apiKey`、`auth: none`、`compat`、`disableStrictTools`、`modelOverrides` 或 `discovery`。

写好后验证：

```powershell
omp models local-openai
omp models find qwen
```

`omp models` 也是校验 `models.yml` 的手段：YAML 或 schema 出错时注册表会跳过整个自定义文件，继续用内置模型运行，错误会显示在界面和通知里。确认可用后，在会话里打开 `/model` 选择；或运行 `omp setup` 在默认模型步骤里选它；也可以在 `config.yml` 里直接写角色：

```yaml
modelRoles:
  # 提供商 local-openai，模型 id 为 Qwen/Qwen2.5-Coder-32B-Instruct
  default: local-openai/Qwen/Qwen2.5-Coder-32B-Instruct
```

## 模型角色

角色把模型选择器绑定到一类工作负载。角色配置写在 `%USERPROFILE%\.omp\agent\config.yml` 的 `modelRoles` 下，不写进 `models.yml`，后者只定义提供商和模型元数据。

聊天角色：

| 角色 | 用途 |
| --- | --- |
| `default` | 常规对话 |
| `smol` | 轻量任务和便宜的子代理并行分派 |
| `slow` | 深度推理 |
| `plan` | plan 模式的架构规划 |
| `commit` | 提交信息和 changelog |
| `vision` | 图像分析用的聊天模型 |
| `tiny` | 会话标题等后台工作；未设置时按 `@smol` 解析 |
| `memory` | 记忆提取；未设置时按 `@tiny` 解析 |
| `task` | 任务子代理 |
| `advisor` | 每轮被动审查的第二个模型；未设置时用显式配置的 `slow` 或自己的强模型优先级链 |
| `widget` | 后台任务实时小组件的规格生成；未设置时按 `smol` 解析 |

模型类角色选择非聊天种类的 runner：

| 角色 | 用途 |
| --- | --- |
| `image` | 图像生成（`generate_image`） |
| `web` | 搜索与联网检索的聊天 |
| `speech` | 文本转语音 |
| `dictation` | 语音转文本 |
| `judge` | 判定 runner |

`vision` 和 `image` 是两种工作负载：`vision` 选一个聊天模型来分析图片（例如 `read screenshot.png?q=...`），`image` 选目录种类为 `image` 的模型来生成图片。把模型指派给 `vision` 不会让它自动获得图像输入能力，图片问题还会检查该模型能否向提供商发送图像输入。

在会话里打开 `/model`（别名 `/models`），进入「角色（Roles）」视图即可指派模型和编辑回退行。聊天角色和模型类角色分组显示，选择器只列出该角色接受的模型。指派非 `default` 角色通常只保存选择器，不切换当前会话模型：工作负载被调用时才使用该角色。指派 `default` 一般也会切换当前模型。会话内的模型选择器只换当前模型，不改写角色分配。在该视图里按 `s` 可以把当前配置存成预设，也可用 `/modelpreset save <name>` 与 `/modelpreset switch <name>` 保存和切换；预设存放在 `config.yml` 的 `modelPresets` 下，内容是所有角色分配加 `defaultThinkingLevel`。

`config.yml` 里的写法（摘自 `docs/settings.md` 的 `modelRoles` 示例，节选）：

```yaml
modelRoles:
  default: anthropic/claude-sonnet-4-5
  smol: openai/gpt-4.1-mini
  slow: anthropic/claude-opus-4-5:high
  plan: anthropic/claude-opus-4-5
```

角色值可以是 `provider/modelId`、裸模型 id 或模糊匹配；可以用 `@smol` 这样的别名引用另一个角色，`*` 表示 `@default`，YAML 里要加引号，例如 `plan: "@slow"`；聊天角色还可以追加 `:low`、`:high` 这样的思考层级后缀；值可以是用逗号分隔的多个选择器，分配时取第一个可用项，这不是逐请求的重试链，请求失败后的换模型见「回退」一节。

相关设置：

| 设置键 | 作用 |
| --- | --- |
| `modelRoleStorage` | 角色分配保存到 `global`（默认）还是 `project`；`project` 只把角色写进 `<cwd>/.omp/config.yml` |
| `cycleOrder` | 模型切换器循环的角色，默认 `["smol","default","slow"]` |
| `enabledModels` | 聊天模型允许列表；为空表示所有可用模型 |
| `modelProviderOrder` | 同一模型 id 出现在多个提供商时的提供商优先顺序 |

## 从命令行选择模型

`--model` 支持几种写法：

| 写法 | 示例 |
| --- | --- |
| 精确选择器 | `--model anthropic/claude-opus-4-6` |
| 裸模型 id | `--model gpt-5.2` |
| 模糊匹配 | `--model opus` |
| 带思考层级 | `--model anthropic/claude-opus-4-6:high` |

```powershell
omp --model opus
omp --model openai/gpt-5.2 -p "总结这个仓库的构建步骤"
omp --model sonnet --thinking high
```

其它与模型有关的启动参数：

| 参数 | 作用 |
| --- | --- |
| `--smol` | 轻量任务的模型，也可用 `PI_SMOL_MODEL` 环境变量 |
| `--slow` | 深度推理的模型，也可用 `PI_SLOW_MODEL` |
| `--plan` | 规划用的模型，也可用 `PI_PLAN_MODEL` |
| `--models` | 逗号分隔的模型模式，供会话内 `Ctrl+P` 在角色间循环，例如 `openai/*,*sonnet*` |
| `--provider` | 旧选项，建议用 `--model` |
| `--api-key` | 本次运行的密钥，默认从环境变量取，不落盘 |

`--smol`、`--slow`、`--plan` 只是临时覆盖对应角色，命令行优先于环境变量。`--models` 的 glob 模式只作用于聊天模型：它限制 `Ctrl+P` 的循环范围、启动模型和 `/model` 里的聊天角色；judge、搜索、图像和语音模型不受影响，仍可用于各自角色。快捷键细节见 [第三章](./03-interactive.md)。

## 思考层级

`--thinking` 接受这些值：

| 值 | 说明 |
| --- | --- |
| `off` | 关闭思考 |
| `minimal` | 最小预算 |
| `low` | 低预算 |
| `medium` | 中等预算 |
| `high` | 高预算，`defaultThinkingLevel` 的默认值 |
| `xhigh` | 更高预算 |
| `max` | 最高预算 |
| `auto` | 由分类器决定，上限由 `providers.autoThinkingMaxEffort` 决定（默认 `xhigh`） |

`defaultThinkingLevel` 的默认值是 `high`，可选值为 `minimal` 到 `max` 以及 `auto`；`--thinking` 对单次运行覆盖它。

模型选择器支持 `:层级` 后缀，给某个模型固定层级：

```powershell
omp --model anthropic/claude-opus-4-5:medium
```

角色值也支持同样的后缀，例如 `slow: anthropic/claude-opus-4-5:high`。

`thinkingBudgets.<level>` 覆盖各层级的 token 预算：`minimal` 1024、`low` 2048、`medium` 8192、`high` 16384、`xhigh` 32768、`max` 32768。它只对接受 reasoning token 预算的传输生效（Anthropic、Google/Gemini、Bedrock Claude 等）。`openai-completions` 的提供商（例如本地 llama.cpp、Ollama）用自己的思考/effort 控制，改这些预算不会影响它们的请求体。

TUI 里 `Shift+Tab` 循环思考层级，`Ctrl+T` 切换思考块的显示。这两个快捷键见 [第三章](./03-interactive.md)。

## 回退

`retry.modelFallback` 默认开启。当前聊天模型持续失败（429、配额耗尽、提供商故障）时，会话按 `retry.fallbackChains` 换模型，并继续这一轮剩余工作。

链条可以按角色、按具体模型或按提供商通配符配置（摘自 `docs/settings.md` 的示例，节选）：

```yaml
retry:
  fallbackChains:
    default:
      - anthropic/claude-opus-4-5
      - openai/gpt-5.5
    smol:
      - openai/gpt-5.5-mini
    google-antigravity/*:
      - google/*
      - google-vertex/*
```

规则：

- 含 `/` 的键是模型键，优先于角色键：`provider/model-id` 匹配该模型，`provider/*` 匹配该提供商的每个模型，当前或将来出现的都算；
- `provider/*` 作为条目时保留失败模型的 id、只换提供商，目标提供商没有的 id 会被跳过，相近的 id 会模糊解析；
- `[]` 显式表示该角色不回退；
- 模型类角色（`image`、`web`、`speech`、`dictation`、`judge`）未设置链条时使用自己的内置链，`default` 链不会作用于它们；
- 裸回退条目继承失败那一轮的思考层级，显式后缀（包括 `:auto`）会替换它；
- `retry.fallbackRevertPolicy` 默认 `cooldown-expiry`，主模型冷却结束后回到主模型；设为 `never` 则停在回退模型，直到手动切换；
- `retry.modelFallback: false` 关闭链条切换；同模型重试和压缩仍然可用。

角色值里的逗号分隔选择器与这里的回退链不是一回事：前者在分配时只选第一个可用项，后者在请求失败时才走动。回退链与上下文提升（context promotion）也相互独立。

## 本地模型

Ollama、llama.cpp 和 LM Studio 不需要写 `models.yml` 就会自动发现：

| 提供商 ID | Base URL（环境变量 → 默认） | 说明 |
| --- | --- | --- |
| `ollama` | `OLLAMA_BASE_URL`，其次 `OLLAMA_HOST`，否则 `http://127.0.0.1:11434` | 默认无需密钥 |
| `llama.cpp` | `LLAMA_CPP_BASE_URL`，否则 `http://127.0.0.1:8080` | 未配置认证时无需密钥 |
| `lm-studio` | `LM_STUDIO_BASE_URL`，否则 `http://127.0.0.1:1234/v1` | 默认无需密钥 |

发现到的模型直接出现在列表里：

```powershell
omp models ollama
```

自动发现会在两种情况下被跳过：`models.yml` 已经定义了同名提供商（显式配置优先），或该提供商 ID 出现在 `disabledProviders` 中。本地引擎第一次必须能响应才会产生模型；之后缓存的行可能仍然可见，但真正推理仍然需要引擎在线。`OLLAMA_CONTEXT_LENGTH` 只影响 omp 的上下文预算，不会修改 Ollama 自己的 `num_ctx`。

macOS arm64 上还有一个进程内的 `apple/on-device`（Apple Foundation Models）。它不会自动选中，用 `--model apple/on-device` 显式选择。

## 排查

- 提供商的模型不可选。确认它有凭据（`/login <provider>`、导出的环境变量或 `models.yml` 的 `apiKey`），并且 ID 不在 `disabledProviders` 里。规则是「未禁用 且（无需密钥 或 有凭据）」。
- 用的密钥不对，例如 `.env` 里残留了旧密钥。按解析顺序逐项检查：`--api-key`、`models.yml` 的 `apiKey`、存储的 OAuth、`/login` 保存的密钥、扩展回退、环境变量或 `.env`、其它存储密钥。非空的进程环境变量优先于所有 `.env`；非空的项目 `.env` 优先于主目录文件。清掉不该生效的那一个。
- 禁用了提供商但它仍然出现。`disabledProviders` 数组是替换而不是合并：项目的 `config.yml` 会整体覆盖全局数组；路径作用域条目只在配置路径及其子目录生效。用 `omp config get disabledProviders` 查看合并后的值。
- 禁用了发现提供商但模型没变化，或反过来。ID 命名空间是共享的：`gemini`、`codex`、`claude`、`native`、`agents` 是发现来源 ID，Google 模型后端是 `google`。要隐藏 Gemini API 模型，禁用的是 `google`。
- 自定义 `models.yml` 提供商没有加载。YAML 或 schema 错误会让注册表跳过整个自定义文件。用 `omp models` 或 `omp models find <substr>` 验证。带 `models` 的提供商需要 `baseUrl`、认证和 `api`。

两个常用诊断命令：`omp models refresh` 强制重新拉取在线目录（等价于删掉模型缓存），`omp token <provider>` 打印某提供商当前使用的密钥或 OAuth 令牌，用来确认密钥来源。

## 相关文档

- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/providers.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/models.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/settings.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/environment-variables.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/README.md
