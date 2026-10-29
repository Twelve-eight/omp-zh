# 行为补丁

omp-zh 在翻译之外改了少量程序行为。本文列出每处改动对应的上游源码、改了什么、为什么改，以及不改会怎样。

补丁定义在 `patches/<版本>.js`。上游发布的 exe 经过压缩，变量名每个版本都会变，所以补丁按版本各写一份：以模块序号为键，在该模块源码里找到一段精确的锚点文本再替换。锚点找不到时构建直接失败，不会产出漏打补丁的文件。下表的源码位置以 v18.14.0 为准。

## 补丁一览

| 编号 | 上游源码 | 改动 |
|---|---|---|
| P1 | `packages/catalog/src/compat/resolve.ts` | OpenAI 兼容端点的 `supportsForcedToolChoice` 固定为 `false` |
| P2 | `packages/coding-agent/src/session/turn-recovery.ts` | 空回复、意外停止、畸形工具调用、流卡顿四类自动重试上限从 3 改为 1000000 |
| P3 | `packages/coding-agent/src/session/agent-session.ts` | `SESSION_STOP_CONTINUATION_CAP` 从 8 改为 1000000 |
| P4 | `packages/coding-agent/src/task/executor.ts` | `MAX_YIELD_RETRIES`（子代理交付提醒次数）从 3 改为 1000000 |
| P5 | `packages/coding-agent/src/blob-broker/exposure.ts`、`uploaders-self-hosted.ts` | 隧道、SSH、上传器三处 `Bun.spawn` 加 `windowsHide: true` |
| P6 | `packages/coding-agent/src/tools/browser/registry.ts` | 启动浏览器的 `Bun.spawn` 加 `windowsHide: true` |
| P7 | `packages/coding-agent/src/eval/py/spawn-options.ts`、`eval/py/kernel.ts`、`ida/supervisor.ts` | Python 内核与 IDA 子进程在 Windows 上始终隐藏窗口 |
| P8 | `packages/ai/src/error/flags.ts` | “加密内容无法解密”类错误归入可重试的过期响应错误 |
| P9 | `packages/tui/src/chat/chat-transcript-builder.ts` | 重建会话记录时，无条件输出最后一条消息的用量信息 |
| P10 | `packages/agent/src/tokenizer.ts` | 自动压缩的本地下限不再计入 Claude 系列模型的历史思考文本 |

## P1：不强制 `tool_choice`

上游在 `detectOpenAICompat()` 里按端点和模型计算 `supportsForcedToolChoice`。只有直连 DeepSeek 官方 API 或 OpenCode 托管时，DeepSeek 推理模型才被判定为不支持强制工具选择。通过第三方 OpenAI 兼容网关使用 DeepSeek 推理模型时，计算结果是 `true`，计划模式等需要强制调用工具的请求会带上 `tool_choice`，网关在思考模式下返回 400。

补丁把整个表达式替换为 `false`。读到 `false` 后，OpenAI Completions 与 Responses 两条传输把强制选择改为 `auto`（`openai-completions.ts`、`openai-responses.ts`），`utils/tool-choice.ts` 的 `buildNamedToolChoice()` 也不再生成指定工具的选择，请求仍能完成。

这个改动对所有经 `detectOpenAICompat()` 判定的 OpenAI 兼容端点生效，Anthropic 与 Bedrock 不受影响。代价是原本支持强制选择的端点也不再使用它：todo 提醒、子代理交付提醒等原本强制调用某个工具的轮次，改由模型自行决定是否调用。

## P2–P4：自动恢复不在固定次数后放弃

上游对几类“模型停下来了但任务没完成”的情况会自动提醒并继续，但次数有上限：

- `turn-recovery.ts`：`UNEXPECTED_STOP_MAX_RETRIES`、`EMPTY_STOP_MAX_RETRIES`、`MALFORMED_FUNCTION_CALL_MAX_RETRIES`、`STREAM_STALL_CONTINUE_MAX_RETRIES`，都是 3。
- `agent-session.ts`：`SESSION_STOP_CONTINUATION_CAP = 8`。
- `task/executor.ts`：`MAX_YIELD_RETRIES = 3`，子代理没有交付结果时最多提醒 3 次。

服务不稳定时，长任务会因为这些上限中途停下，需要人回来手动输入“继续”。补丁把上限抬到 1000000。上游的其他保护不受影响：用户按 `Esc` 中断、预算耗尽、不可重试的错误、循环检测，都照常终止任务。

## P5–P7：子进程不借用控制台

在 Windows 终端里运行 omp 时，上游用 `hostHasInheritableConsole()` 判断宿主有可继承的控制台，于是多处子进程以 `windowsHide: false` 启动，附着在 omp 的控制台上。这些子进程（以及它们再启动的进程）的输出会直接写到终端，盖在 TUI 画面上；后台常驻的 broker 由第一个 omp 实例启动并在多个实例间共享，输出还可能出现在另一个 omp 窗口里。

补丁让下列子进程一律以 `windowsHide: true` 启动（Bun 映射为 `CREATE_NO_WINDOW`）：

- P5：blob broker 的隧道进程、SSH 进程、自托管上传器。
- P6：浏览器工具启动的 Chrome/Chromium。
- P7：`shouldHideKernelWindow()` 在 Windows 上返回 `true`，`eval/py/kernel.ts` 与 `ida/supervisor.ts` 两处调用点直接使用 `true`。

P7 与上游的取舍相反。上游注释（issue #1960）说明，没有控制台的 Python 内核在加载部分原生模块（如 NumPy）时可能在 `LoadLibraryExW` 中卡住，也收不到 `Ctrl+C` 中断信号。omp-zh 选择不让内核输出污染界面；如果你的 Python 代码依赖这类原生模块并出现卡住，请换用官方版对比，并在本仓库提交问题。

## P8：加密推理内容错误可重试

部分 OpenAI Responses 兼容网关背后是多个上游账号或资源。上一轮返回的加密推理内容只能由产生它的那个账号解密，下一次请求被路由到别处时会返回 400：`The encrypted content ... could not be verified`。

上游在 `flags.ts` 里用 `STALE_RESPONSE_ITEM_PATTERNS` 识别“过期的响应条目”，命中后重置提供商会话并重试，但匹配规则不包含这条报错。补丁在两条正则里加入这类报错文本，让它走上游已有的重试路径。补丁只改错误分类，不删除也不改写请求里的推理内容。

## P9：会话记录用量信息不丢失

`chat-transcript-builder.ts` 在重建会话记录（例如恢复会话）时，只有当前没有未完成的工具调用才输出待显示的用量信息。程序崩溃或被中断的那一轮常常留有未完成的工具调用，它后面的用量与耗时就不再显示。补丁去掉这个条件，改为每次都输出。

## P10：Claude 思考文本不计入压缩下限

自动压缩按两个数中较大的一个判断是否超过阈值：上一轮提供商计费的上下文 token 数，以及本地对已存会话的估算（`compactionContextTokens()`，`packages/agent/src/compaction/compaction.ts`）。本地估算是一个下限，用来防止载荷压缩扩展让计费数偏低。上游在这个下限里计入了历史回合的思考文本（`packages/agent/src/tokenizer.ts` 的 `#measureMessage`）。

经第三方网关使用 Claude 时，历史回合的思考并不计费，下限因此远高于实际用量。一个 Claude Opus 会话的实测数据：计费约 185K–232K token，日志中的压缩判断值为 611K，超过 60% 阈值（600K），状态栏显示 16% 时就触发了 shake 和自动交接。用上游 Tokenizer 重算这个会话的消息，下限为 504K，其中历史思考文本约 317K。

补丁让下限在思考按输出计价的模型上（Claude 系列，compat 规则 `thinking-replay-tokens "output"`）不再计入思考文本。同一会话的下限降为 190K，与计费数一致。计费数仍然参与判断，不受影响。

代价：同时使用载荷压缩扩展（如 Headroom）和 Claude 时，下限会偏低，压缩可能晚一些触发。上游 `packages/agent/test/tokenizer.test.ts` 中有 4 项测试断言下限包含思考文本，与本补丁的取舍相反。已报告上游：[can1357/oh-my-pi#17422](https://github.com/can1357/oh-my-pi/issues/17422)。

## 适配新版本

上游每次发版后要为新版本写一份 `patches/<版本>.js`，并核对每处补丁的动机是否仍然成立。上游自己修好的问题应删掉对应补丁，不再迁移。步骤见 [updating.md](updating.md)。
