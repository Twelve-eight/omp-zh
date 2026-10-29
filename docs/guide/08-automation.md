# 08 非交互与集成

这一章讲怎么把 omp 从交互界面里拿出来用：一次性执行的 print 模式、机器可读的输出、通过 stdio 驱动的 RPC、Node SDK 与三种语言的 RPC 客户端、给编辑器用的 ACP，以及 `omp commit`、工作树这类能直接写进脚本的子命令。交互界面本身见 [03 交互界面](./03-interactive.md)，模型与 provider 的选择见 [02 模型与提供商](./02-models-and-providers.md)。

## print 模式（`-p`）

`omp -p "<提示>"` 不进入 TUI：它处理完提示，把最后一条助手回复写到 stdout，然后退出。文本在整轮结束后一次性输出，不逐 token 打印，进度提示走 stderr。

```powershell
omp -p "总结上一次提交改了什么"
```

脚本里常用的组合：

| 需求 | 写法 |
| --- | --- |
| 只跑一次并要答案 | `omp -p "<提示>"` |
| 从标准输入读提示 | `<命令> \| omp -p` |
| 指定模型或模型角色 | `omp -p --model <id-or-role> "<提示>"` |
| 机器可读输出 | `omp -p --mode json "<提示>"` |
| 输出里带思考块 | `omp -p --print-thoughts "<提示>"` |
| 限制时长与花费 | `omp -p --max-time 10m --max-cost 0.50 "<提示>"` |
| 等后台任务跑完再退出 | `omp -p --wait-async "<提示>"` |

标准输入不是 TTY 时，omp 会把它读到 EOF 当作提示文本，并且在省略 `--mode` 时自动选择 print 模式。管道内容、`@<path>` 附件和第一个位置参数会合并成初始提示，其余位置参数作为后续轮次发送。

### 管道输入

把 diff 直接交给 omp，不需要临时文件：

```powershell
git diff | omp -p --model opus --thinking high "只列出会破坏现有测试的改动"
```

`--thinking` 的取值是 `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`、`auto`，各档含义见 `./02-models-and-providers.md`。

### 选择模型

`--model` 接受模型 id、角色（`slow` 或 `@slow`），也接受模糊匹配（`opus`、`gpt-5.2`、`openai/gpt-5.2`）：

```powershell
omp -p --model openai/gpt-5.2 "把 src 下所有 TODO 汇总成一张表"
```

### 结构化输出

`--mode json` 先输出一条会话头，之后每行一个 JSON 事件。写入文件时在 PowerShell 里显式指定编码：

```powershell
omp -p --mode json "列出 src 下所有 TODO" | Out-File -Encoding utf8 todos.json
```

增量 `message_update` 事件不带完整的部分消息快照，完整消息在 `message_end` 里；provider 的私有重放载荷不会输出。

### 退出状态与边界

- 整轮失败时，text 与 json 模式都返回非零退出码。
- 被 `--max-cost` 截断的运行以 `3` 退出：上限信息写到 stderr（JSON 模式是一条 `cost-gate` 通知），并且不打印答案。
- print 模式默认单次执行：回答完就销毁会话，从而取消这次运行启动的后台任务（模型异步发起的 `bash`、`task` 调用）。加 `--wait-async`，或设置 `async.printWake: true`，才会等待它们；每个后台结果作为同一会话的新一轮送进来，直到没有任务和未交付的结果为止。
- `plan.defaultOnStartup` 在 print 模式被忽略，因为没有计划审核界面；无人值守的「先规划再执行」用 `--plan-yolo`。
- `--` 之后的内容一律当作字面提示文本，即使看起来像参数。

```powershell
omp -p --wait-async --max-time 2h "在后台跑集成测试，失败的就修掉"
```

## 输出模式（`--mode`）

| 模式 | 说明 |
| --- | --- |
| `text` | 渲染后的文本。省略 `--mode` 时进入 TUI；显式写 `--mode text` 才是非交互文本输出。 |
| `json` | 逐行 JSON 事件流，给无头环境或机器消费；可以不写 `-p`。 |
| `rpc` | 通过 stdio 的行分隔 JSON 命令、响应、事件通道（不是 JSON-RPC 2.0）。 |
| `rpc-ui` | 在 RPC 之上打开扩展 UI 事件。 |
| `acp` | 基于 stdio 的 Agent Client Protocol 服务器，等价于 `acp` 子命令。 |

`--no-ui` 与 `--mode rpc` 或 `--mode rpc-ui` 一起用时，扩展以无界面方式运行：`ctx.hasUI` 为 `false`，扩展对话框取默认值，展示类更新被丢弃。`rpc-ui` 下 `ask` 这类工具 UI 仍会发出 `extension_ui_request` 交给宿主回答；宿主发起的 `login` 不受影响。

## 通过 stdio 驱动：RPC

`omp --mode rpc` 把 omp 变成一个子进程协议：stdin 收命令（`RpcCommand`）、扩展 UI 应答、宿主工具与宿主 URI 的结果；stdout 输出 ready 帧、命令响应、会话事件和各种请求。每个对象一行 JSON，这是自定义的 JSONL 协议，不是 JSON-RPC 2.0。

```powershell
omp --mode rpc --no-session
```

启动后先收到 ready 帧，它声明协议版本和传输上限：v1 的单个 stdout 帧上限 1 MiB，协商到 v2 后可把大帧拆成 `rpc_chunk` 分片，重组上限 64 MiB。RPC 模式拒绝 `@file` 参数，并关闭会话标题自动生成。stdin 关闭时，进程会拒绝未完成的请求、排空已接受的命令、销毁会话、把待发的 stdout 交付完，然后以 `0` 退出。

### 一次请求与响应

stdin：

```json
{ "id": "req_1", "type": "prompt", "message": "Summarize this repo" }
```

stdout（省略了消息内容）：

```json
{ "id": "req_1", "type": "response", "command": "prompt", "success": true }
{ "type": "agent_start" }
{ "type": "message_update", "messageId": "msg-2", "assistantMessageEvent": { "type": "text_delta", "delta": "..." }, "message": { "role": "assistant", "content": [] } }
{ "type": "agent_end", "messages": [], "isTerminal": true, "yielded": true }
{ "type": "prompt_result", "id": "req_1", "agentInvoked": true, "status": "completed", "sessionSettled": true }
{ "type": "session_settled" }
```

要点：`prompt` 的 `response` 只表示消息已被接收（排队或被本轮接受），不代表模型轮次结束；真正的结果由同 `id` 的 `prompt_result` 报告，`session_settled` 表示会话彻底空闲。所有命令都可以带可选的 `id`，响应会原样回显它，宿主靠这个做请求关联。

想直接看线格式，可以把一行命令喂进去，stdin 关闭后进程会输出帧并退出：

```powershell
'{"id":"r1","type":"prompt","message":"list .ts files"}' | omp --mode rpc --no-session
```

常驻宿主则应保持 stdin 打开，逐行读写。

### 常用命令

| 类型 | 命令 |
| --- | --- |
| 提示 | `prompt`、`steer`、`abort`、`abort_and_prompt` |
| 模型 | `set_model`（`provider` + `modelId`）、`cycle_model` |
| 思考 | `set_thinking_level`、`cycle_thinking_level` |
| 状态 | `get_state`、`get_session_stats`、`get_messages`、`get_messages_page` |
| 会话 | `compact`、`export_html`、`open_session` |
| 工具 | `bash`、`set_host_tools`、`set_host_uri_schemes` |

完整命令表、事件流和各子协议见上游 `docs/rpc.md`。

## RPC 客户端：Python、Go、Rust

三个客户端的协议类型与命令方法都由 wire schema 生成（传输层手写），自动协商协议 v2、重组 `rpc_chunk` 分片，并处理请求关联、消息分页、扩展 UI 和宿主工具。

| 语言 | 包 / 模块 | 主要入口 | 说明 |
| --- | --- | --- | --- |
| Python | `omp-rpc`，导入名 `omp_rpc` | `RpcClient` | 默认启动 `omp --mode rpc`；提供 `prompt_and_wait()`、逐事件监听、`open_session`、host 工具助手 |
| Go | `github.com/can1357/oh-my-pi/sdk/go/omp-rpc`，包名 `omprpc` | `Client` | 只用标准库；`PromptAndWait`、消息分页、宿主工具与 URI 方案 |
| Rust | crate `omp-rpc` | `Client::spawn`、`Client::from_io` | 阻塞式传输；`call`、`prompt_and_wait`、`get_messages`，事件走接收端 |

Python 的最小用法：

```python
from omp_rpc import RpcClient

with RpcClient(provider="anthropic", model="claude-sonnet-4-5") as client:
    turn = client.prompt_and_wait("Reply with just the word hello")
    print(turn.require_assistant_text())
```

`RpcClient` 的构造参数直接对应 `omp --mode rpc` 的常见启动参数，例如 `thinking="high"`、`no_session=True`、`no_ui=True`、`tools=("read", "edit", "write")`。三个客户端的源码在仓库 `sdk/python`、`sdk/go`、`sdk/rust` 下，各自的 README 是完整 API 说明。

## Node SDK：把会话嵌进自己的进程

需要在 Bun 进程里直接拿到会话对象、事件流和工具装配时用 SDK；需要跨语言或进程隔离时用上面的 RPC。安装：

```bash
bun add @oh-my-pi/pi-coding-agent
```

要求 Bun 1.4.4 或更高版本。第一次带模型的提示之前必须先配好 provider 凭据，或者用无需密钥的本地 provider，否则会话能建起来但提示会失败。

最小例子：

```ts
import { createAgentSession } from "@oh-my-pi/pi-coding-agent";

const { session, modelFallbackMessage } = await createAgentSession();

if (modelFallbackMessage) {
  process.stderr.write(`${modelFallbackMessage}\n`);
}

const unsubscribe = session.subscribe((event) => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("Summarize this repository in 3 bullets.");
unsubscribe();
await session.dispose();
```

`createAgentSession()` 的规则是「给了就覆盖，没给就自动发现」：`cwd`、`~/.omp/agent`、认证存储、`models.yml`、设置、文件持久化的会话管理器、技能与规则、上下文文件、扩展、内置工具、MCP 与 LSP 都有默认值。要在内存里跑或自己管凭据，显式传 `sessionManager`、`authStorage`、`modelRegistry`。会话用完记得 `await session.dispose()`，它是幂等的。

## ACP：给编辑器用

`omp acp` 让 omp 以 ACP（Agent Client Protocol）服务器的身份跑在 stdio 上，由编辑器作为子进程拉起；`omp --mode acp` 等价。在编辑器的 agent server 配置里把命令设成 `omp acp` 即可，例如 Zed 的 `agent_servers` 配置。手动在终端里运行它没有意义：omp 检测到 stdin 是 TTY、没有客户端连接时，会在 stderr 说明这一点并继续等待协议帧。

`omp acp` 自己没有子命令参数；审批参数直接跟在 `acp` 后面传入，写在子命令前面的启动参数同样会转发给 ACP 模式。编辑器声明能力后，工具 I/O 走编辑器的通道：

| omp 工具 | ACP 路由 |
| --- | --- |
| `bash` | `terminal/create` + `terminal/output` |
| `read` | `fs/read_text_file` |
| `write` | `fs/write_text_file` |
| `edit`、`bash` | `session/request_permission` |

权限沿用普通启动的设置解析：全局 `~/.omp/agent/config.yml`、ACP 会话 `cwd` 的项目配置、以及传给 ACP 进程的 `--config` 叠加层都生效。显式开启自动批准：

```powershell
omp acp --approval-mode yolo
omp acp --auto-approve
omp acp --yolo
omp acp --config .\acp-yolo.yml   # 文件内容为 tools.approvalMode: yolo
```

优先级依次是运行参数、`--config` 叠加层、项目配置、全局配置。`tools.approvalMode` 的 schema 默认值也是 `yolo`，但没有显式开启时，未匹配的 bash 命令和破坏性文件操作仍然需要编辑器授权一次。ACP 目前没有按会话设置审批策略的字段，需要单独策略的客户端应另起一个带上述参数的 `omp acp` 进程。

ACP 会话的 MCP 服务器由 ACP 客户端提供，omp 在这些会话里关闭磁盘上的 MCP 发现。

## `omp commit`

`omp commit` 读工作区，把不相关的改动拆成若干个原子提交，并按依赖顺序排列；有环的拆分在写入前就被拒绝。源文件的权重高于测试、文档和配置，所以主要提交排在最前，锁文件完全不参与分析。它同时更新变更日志。

| 参数 | 说明 |
| --- | --- |
| `--dry-run` | 只预览，不提交 |
| `--push` | 提交后推送 |
| `--no-changelog` | 跳过变更日志更新 |
| `-c, --context <text>` | 给模型补充上下文 |
| `-m, --model <id>` | 覆盖模型选择 |
| `--legacy` | 使用旧的确定性流水线 |

```powershell
omp commit --dry-run
omp commit -c "这批改动属于同一个重构" --push
```

## 工作树

`omp worktree`（别名 `wt`）管理 git 工作树，默认动作是列出。

| 动作 / 参数 | 说明 |
| --- | --- |
| `omp worktree` / `list` | 列出工作树，`--json` 输出机器可读结果 |
| `add <path> [commit]` | 新增工作树，`-b/--branch` 建新分支，`-B/--force-branch` 建或重置分支，`-d/--detach` 分离 HEAD，`-C/--cwd` 指定仓库目录，`-q/--quiet` 静默 |
| `clear` | 清理工作树，`--all` 连正在使用的 PR 检出工作树一起清，`-n/--dry-run` 只打印会删什么 |

```powershell
omp worktree
omp worktree add -b feature ..\feature origin/main
omp worktree add --detach ..\review HEAD~2
omp worktree clear --dry-run
```

启用 `worktree.clone` 后，`omp worktree add` 会把 `node_modules` 这类可搬迁且被忽略的缓存带进新工作树；含 `pyvenv.cfg` 或 `CMakeCache.txt` 的目录不会被带过去，Python 环境和 CMake 构建目录要在新工作树里重建。保留源工作树未提交改动时，跳过针对目标提交忽略规则的清理。

## 其他适合脚本的子命令

| 命令 | 用途 |
| --- | --- |
| `omp read <path>` | 打印 read 工具会返回的内容；支持 `:50-100` 行范围与 `:raw` 原始模式，也接受 URL 和 `issue://123` 这类内部 URI。 |
| `omp grep <pattern> [path]` | 在命令行里试 grep 工具：`-g/--glob`、`-l/--limit`、`-C/--context`、`-f/--files`、`-c/--count`、`--no-gitignore`。 |
| `omp search <query>` | 试 web search provider：`--recency` 时间过滤、`-l/--limit`、`--compact` 精简输出。 |
| `omp shell` | 交互式 shell 控制台：`-C/--cwd` 指定工作目录，`-t/--timeout` 设每条命令的超时毫秒数，`--no-snapshot` 不加载用户 shell 快照。 |
| `omp git [REVISION]` | 全屏 git 界面（差异、暂存、提交），`-C/--dir` 指定目录；交互式，不适合管道。 |
| `omp stats` | 用量统计。默认在 `http://127.0.0.1:3847` 起本地面板（`--port`、`--host` 可改）；`--summary` 打印摘要，`--json` 输出 JSON 后退出。 |
| `omp session pack\|unpack\|moved` | 把会话连同产物和图片打包、在另一台机器解包（`--cwd` 指定续接目录）、或标记本地副本已迁走。 |
| `omp share <session>` | 用加密链接分享保存的会话；`--gist` 改为上传到 GitHub 的 secret gist。 |
| `omp token <provider>` | 取某个 provider 的 API key 或 OAuth token：`--raw`、`--force-refresh`、`-l/--list` 列账户、`-a/--account <n>` 选第 n 个账户。 |

## 相关文档

- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/cli-reference.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/rpc.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/sdk.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/approval-mode.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/README.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/sdk/python/omp-rpc/README.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/sdk/go/omp-rpc/README.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/sdk/rust/omp-rpc/README.md
