# 内置工具与子代理

本章说明 omp 自带哪些工具、代理怎样调用它们，以及如何用 `task` 把工作交给子代理。还会介绍 `todo`、`ask`、`eval`、浏览器、LSP、Agent Hub 与 Collab，最后给出开关工具的设置键。这些工具都随 `omp` 提供，不需要单独安装；依赖外部程序的条目在表中注明（`github` 需要 `gh`，`ida` 需要本机 IDA）。

## 代理如何使用工具

代理看到的是一组带 JSON 参数的工具。核心工具（`read`、`write`、`edit`、`bash` 等）直接以顶层工具出现；不常用的可发现工具挂在 `xd://` 设备后面，`read xd://` 列出它们，`write xd://<tool>` 运行一次（`tools.xdev` 开启时，默认开启）。每次调用按读、写、执行三档审批，`tools.approvalMode` 决定默认策略，`tools.approval` 可以按工具名覆盖成 `allow`、`deny` 或 `prompt`。输出过大时按 `tools.artifactSpillThreshold`（默认 50 KB）落盘，正文只保留头尾。代理通常会在调用前附一句意图（`tools.intentTracing` 默认开启），你可以在界面上看到它准备做什么。

会话的工具集可以用 `--tools` 固定：

```powershell
omp --tools read,edit,bash,grep
```

审批模式、计划模式与输入编辑器的细节见 [第 03 章](./03-interactive.md)。

## 内置工具一览

下表的“类别”只是阅读顺序，工具本身都在同一个命名空间里。

| 类别 | 工具 | 说明 |
| --- | --- | --- |
| 文件 | `read` | 用一个 `path` 读文件、目录、压缩包、SQLite、PDF、notebook、网页和 `ssh://` 等内部资源；支持 `:50-120`、`:raw`、`:img`、`:conflicts` 选择器。 |
| 文件 | `write` | 新建或覆盖文件、压缩包条目、SQLite 行，也能解析 `conflict://` 合并冲突。 |
| 文件 | `edit` | 默认 hashline 模式，按内容哈希锚点改现有文件；`edit.mode` 可切到 `apply_patch`、`patch`、`replace`、`sloppy`。 |
| 文件 | `ast_edit` | 用 ast-grep 做结构化重写，先预览再应用，可以一次替换多个文件。 |
| 搜索 | `grep` | 正则搜内容，路径可以是文件、目录、glob 或内部 URL，多个路径用分号分隔。 |
| 搜索 | `glob` | 按 glob 找路径，默认最多 200 条，默认包含隐藏文件。 |
| 搜索 | `find` | 语义搜索：用自然语言描述要找的行为，返回文件与行范围，并给出相关性分数。 |
| 搜索 | `ast_grep` | 结构化代码查询，覆盖 50 多种 tree-sitter 语法，适合“找出所有这种写法”。 |
| Shell 与执行 | `bash` | 在工作区跑 shell 命令；默认超时 300 秒，可指定 `cwd`、`pty`、`async`，或起命名服务。 |
| Shell 与执行 | `eval` | 一次调用执行一个 Python 或 JavaScript 单元格，状态跨调用保留。 |
| Shell 与执行 | `lsp` | 查询语言服务器：诊断、跳转、引用、符号、重命名、代码操作。 |
| Shell 与执行 | `debug` | 驱动一个 DAP 调试会话：断点、单步、线程、调用栈、变量。 |
| Web 与浏览器 | `web_search` | 一个查询走配置好的搜索链，返回答案与引用来源。 |
| Web 与浏览器 | `browser` | Eval 里的浏览器前端：打开、复用、脚本化 Chromium、Electron、CDP 或 relay 标签页。 |
| Web 与浏览器 | `computer` | Eval 里的桌面前端：窗口、截图、原生输入、辅助功能树、剪贴板。 |
| Web 与浏览器 | `github` | GitHub CLI 操作：仓库、文件、PR、搜索、Actions 运行监视；需要 PATH 上有 `gh`。 |
| 规划与交互 | `task` | 派生子代理，可在一次调用里并行多个，也可以隔离工作区。 |
| 规划与交互 | `wait` | 无参数，阻塞到下一个后台结果、同伴消息或插话中断；单次最多等 30 分钟。 |
| 规划与交互 | `todo` | 对会话待办列表做一次变更，支持阶段与阻塞原因。 |
| 规划与交互 | `ask` | 向交互用户提一个或多个问题，选项或自由输入。 |
| 规划与交互 | `checkpoint` | 标记当前会话状态，供之后的 `rewind` 折叠探索过程。 |
| 规划与交互 | `rewind` | 结束 checkpoint，剪掉探索上下文，只保留一份报告。 |
| 记忆 | `retain` | 把持久事实写入当前记忆库。 |
| 记忆 | `recall` | 在记忆库里搜索原始记忆条目。 |
| 记忆 | `reflect` | 在记忆库上综合出一个答案。 |
| 记忆 | `memory_edit` | 按 id 更新、忘记或作废记忆（仅 Mnemopi 后端）。 |
| 记忆 | `learn` | 记录可复用的经验，必要时提升为托管技能。 |
| 其他 | `generate_image` | 生成或编辑位图，结果写到临时路径。 |
| 其他 | `tts` | 把文本合成语音写入 `output_path`，`.wav` 之外的后缀输出 MP3。 |
| 其他 | `security_scan` | 计划并运行安全审查，校验已存发现，或调用 Codex Security 云扫描。 |
| 其他 | `ida` | 打开、编辑、脚本化 IDA Pro（idalib）数据库；需要本机安装 IDA。 |
| 其他 | `new_context` | 在实验性 notes 上下文管理下请求一个新窗口，保留 notebook 与可恢复分支。 |

`github`、`security_scan`、`generate_image`、`tts`、`checkpoint`、`rewind` 和记忆工具默认关闭，开启方法见本章最后一节。notebook 由 `read` 处理：读 `.ipynb` 时转成可编辑的单元格文本。会话的恢复、分支与压缩见 [第 04 章](./04-sessions.md)，技能、hooks 与插件的完整写法见 [第 06 章](./06-extending.md)。

## 子代理与 task 工具

`task` 把一项工作交给子代理，父会话只拿结果，不共享子代理的上下文。默认是批量形状：一次调用带一个共享 `context` 和一组 `tasks`，每个 item 写自己的 `task` 和 `solutionSpace`。

```json
{
  "context": "Review the current change in this repository.",
  "tasks": [
    {
      "agent": "reviewer",
      "task": "Report concrete correctness findings.",
      "solutionSpace": "Review cause and failure modes are open; no known defect."
    }
  ]
}
```

`context` 是所有子代理共享的背景，`solutionSpace` 描述问题有多开放（方案是否已给定、原因是否已知），它会影响子代理的思考力度。要指定专家时在 item 里写 `agent`；批量形状不接受顶层 `agent`。把 `task.batch` 关掉会回到每次调用只派生一个的扁平形状。

`async.enabled` 默认开启时，派生的子代理作为后台任务运行，结果自动送回父会话。父会话被阻塞时调用 `wait`；`read proc://<id>` 查看进度而不消费结果，`write proc://<id>/kill` 取消，`write agent://<id>` 给子代理发消息或催办。每个子代理必须通过隐藏的 `yield` 工具结束，可以用 `outputSchema` 约束它的输出结构，`schemaMode` 选择 `permissive` 或 `strict`。

产物放在会话的 artifacts 目录：

- `<id>.md` 是最终输出，`agent://<id>` 指向它；带结构数据时另有 `<id>.json`。
- `<id>.jsonl` 是子代理的会话记录，`history://<id>` 读成简洁转录。
- 嵌套子代理的 id 是 `<id>.<child>`，`agent://<id>/<key>` 按 JSON 路径取字段。

并发由 `task.maxConcurrency` 控制（默认 32，`0` 表示不限），派生深度由 `task.maxRecursionDepth` 控制（默认 2）。需要隔离工作区时打开 `task.isolation.enabled`，并给 item 加 `isolated: true`。

### 内置代理类型

| 名称 | 用途 | 默认模型 |
| --- | --- | --- |
| `task` | 通用子代理，完整能力，可以继续派生 | `@task`，思考层级自动 |
| `scout` | 只读探索与快速代码分析，返回压缩过的上下文 | `@smol` |
| `reviewer` | 代码审查，可再派生 `scout` | `@slow` |
| `security-reviewer` | 只读安全审查，给出有证据的漏洞发现 | 未指定 |
| `sonic` | 低推理，只做机械改动或数据收集 | `@smol` |
| `seance` | 只读咨询一个历史会话及其嵌套转录，仅在可派生时列出 | 未指定 |

### 自定义代理

代理定义就是一个 Markdown 文件：frontmatter 写配置，正文就是它的系统提示。项目级放在 `.omp/agents/*.md`，用户级放在 `%USERPROFILE%\.omp\agent\agents\*.md`。

```md
---
name: reviewer
description: Review a change for correctness.
model: "@review"
---

Review the assigned change and report concrete findings.
```

`@review` 这样的角色别名在 `~/.omp/agent/config.yml` 里映射到具体模型：

```yaml
modelRoles:
  review: openai/gpt-5.4:high
```

必填字段是 `name` 和 `description`，`main` 与 `sub` 是保留名。可选字段包括 `model`、`tools`（CSV 或数组，省略则用默认内置工具集）、`spawns`、`thinking-level`、`output`（结构化输出 schema）、`blocking`、`structured`、`autoloadSkills`、`read-summarize`、`prewalk` 和 `advisor`。

同名定义先到先得：项目覆盖用户，用户覆盖扩展包与内置代理，名称区分大小写。自定义代理文件解析失败只会跳过该文件，不影响其他代理。`/agents` 可以查看已发现的代理，并调整启用状态、模型覆盖、prewalk 与 advisor。

## todo 与 ask

`todo` 每次调用只施加一个变更，`op` 取 `init`、`start`、`done`、`drop`、`block`、`unblock`、`rm`、`append` 或 `view`。任务状态有 `pending`、`in_progress`、`completed`、`abandoned`、`blocked`；`start` 会把其他进行中的任务降回 `pending`，`view` 只读。子代理默认不继承父会话的待办列表。

`ask` 一次可以问一组问题。每个问题有 `id`、`question` 和 `options`，可选 `multi`（多选）与 `recommended`（推荐项下标）。`ask.timeout` 控制等待秒数，默认 `0` 表示不超时；超时会自动选推荐项或第一项，并在结果里标明。`ask.notify` 控制是否发终端通知。计划模式下不设超时。没有交互界面的会话拿不到这个工具。

## eval 与 Python 内核

`eval` 一次调用执行一个单元格，`language` 取 `py` 或 `js`，同一个语言的状态在后续调用间保留。默认超时 30 秒，`0` 关闭；`reset: true` 在本次调用前重建该语言的运行时。

Python 默认 `python.kernelMode: session`，同一会话复用一个子进程；改成 `per-call` 则每次新建。解释器按当前 venv、`%USERPROFILE%\.omp\python-env`、`PATH` 的顺序解析，也可以用 `python.interpreter` 指定绝对路径。支持的 IPython 风格魔法包括 `%pip`、`%cd`、`%env`、`%time`、`%who`、`%load`、`%run`、`%%bash`、`%%capture`、`%%writefile` 和 `!cmd`。

内核可以回调代理自己的工具：在 Python 或 JavaScript 里调用 `read`、搜索或 `task`，通过回环桥接到宿主。`eval.tools.enabled` 决定内核里定义的工具能否传给子代理。`eval.py` 与 `eval.js` 分别开关两个后端，环境变量 `PI_PY`、`PI_JS` 可以按进程覆盖。

## 浏览器与 relay

`browser` 不是顶层工具，而是 Eval 里的前端，只在 Eval 与 `browser.enabled`（默认开启）同时可用时存在。所有浏览器宿主操作都按执行档审批。

```js
const tab = await browser.open({ name: "main", url: "https://example.com", wait_until: "load" });
const observation = await tab.observe();
await tab.id(observation.elements[0].id).click();
await tab.close();
```

`browser.tabs()` 列出受管标签页，`tab.run(fn, { args })` 在页面里执行代码。只读静态网页用 `read <url>` 就够；需要登录态、交互或执行 JavaScript 时才用 `browser`。

relay 让你已有的 Chrome 标签页被 `browser` 驱动，不必用调试端口重启 Chrome：

```powershell
omp browser-relay install
```

然后打开 `chrome://extensions`，启用开发者模式，选择 Load unpacked，指向 `%USERPROFILE%\.omp\browser-relay\extension`。

启用方式二选一。单次调用传 `app: { relay: true }`；或者设为该配置下的默认：

```powershell
omp config set browser.relay true
```

`app.target` 按 URL 或标题子串借用指定标签页；不传时 omp 在后台开自己的标签页，不动你当前的选择和焦点。被驱动的标签会收进每个窗口的 “omp” 标签组，`omp browser-relay --no-group` 可以关掉分组。relay 只绑定回环地址；如果担心本机其他进程，用 `omp browser-relay --token <secret>`，并在扩展选项里填同一个值。

`chrome://`、DevTools、Web Store 和其他扩展页面无法附加；标签页开着 DevTools 时也不能附加。

## LSP

`lsp` 把语言服务器的能力交给代理，`action` 可取 `diagnostics`、`definition`、`references`、`hover`、`symbols`、`rename`、`rename_file`、`code_actions`、`type_definition`、`implementation`、`status`、`reload`、`capabilities`、`request`。`rename` 默认直接应用，`code_actions` 默认只列出。重命名走 `workspace/willRenameFiles`，所以再导出、桶文件和别名导入会一起更新。

自动检测只看两件事：当前目录命中服务器的 `rootMarkers`，并且服务器二进制可用（先查项目内 bin 目录，再查 `PATH`）。常见项目不需要写配置。

配置文件从低到高合并：家目录的 `lsp.json`、插件、用户配置目录、`<cwd>/.omp/lsp.*`、`<cwd>/lsp.*`。常用位置是 `%USERPROFILE%\.omp\agent\lsp.json` 和项目的 `.omp/lsp.json`。合并按服务器浅覆盖，`settings`、`initOptions`、`capabilities` 这类对象整体替换。

```json
{
  "servers": {
    "rust-analyzer": {
      "disabled": true
    }
  },
  "idleTimeoutMs": 300000
}
```

改完配置后调用 `lsp` 工具的 `action: "reload", file: "*"` 重新加载。相关设置：`lsp.enabled`（默认开启，`--no-lsp` 可单次关闭）、`lsp.lazy`（按需启动）、`lsp.diagnosticsOnWrite`（默认开）、`lsp.diagnosticsOnEdit`（默认关）、`lsp.formatOnWrite`（默认关）、`lsp.requestTimeout`（默认 10 秒）。

## 计算机操作

`computer` 也是 Eval 前端，直接操作真实桌面：枚举窗口与显示器、截图、发送原生输入、走系统辅助功能树、读写剪贴板。它没有浏览器 DOM，也不认识网页里的选择器。

默认关闭，在配置里打开：

```yaml
computer:
  enabled: true
tools:
  approvalMode: write
```

`/computer`、`/computer on`、`/computer off`、`/computer status` 只在当前会话切换，不写配置。

安全提示：屏幕内容是未受信数据，不能作为授权依据。有风险的工作用独立账户或虚拟机。发送、发布、购买、删除、改权限这类不可逆操作要先确认。按物理 `Esc` 会停止接管型输入。同一时刻只允许一个 `computer.run`。`read_only: true` 只约束 facade，不阻止代码通过宿主 API 修改系统，它不是沙箱。

## Agent Hub 与 Collab

Agent Hub 是观察和控制子代理的 TUI。`Alt+A` 或 `Ctrl+S` 打开或关闭；编辑区上方的「子代理（Subagents）」固定列表也能看到运行中的代理（`display.pinnedAgents`，默认 `collapsed`）。

名册显示状态（`running`、`idle`、`parked`、`aborted`）、模型、耗时和用量。`j`/`k` 选择，`Enter` 打开，`t` 切换父子树，`/` 过滤，`1`/`2` 切换名册与活动日志，`r` 复活停放或已终止的代理，`x` 终止并释放。进入某个子代理后直接输入消息即可插话；空编辑器按 `Esc` 或双击 `←` 回到主会话。打开与关闭这两个动作可以在 `~/.omp/agent/keybindings.yml` 里改（`app.agents.hub`、`app.session.observe`）。

Collab 把当前会话实时共享给另一个 omp 或浏览器：

```text
/collab
```

输出一条加入命令和一个浏览器链接。guest 在自己的 TUI 里原生渲染同一会话，可以提示和中断；工具都跑在宿主机器上。`/collab view` 只给只读链接，`/collab status` 看参与者，`/collab stop` 停止共享，`/leave` 退出。命令行加入用 `omp join "<link>"`。

载荷在客户端用 AES-256-GCM 密封，relay 只看到房间号、连接数、密文帧及其大小。只读链接只含 32 字节房间密钥，完整链接另含 16 字节写令牌。把 `collab.autoStart` 设为 `view` 或 `control` 可以让每个交互会话自动共享，relay 地址由 `collab.relayUrl` 指定。

## 打开和关闭工具

启动时用 `--tools` 给白名单，用 `--no-tools` 全关，用 `--no-lsp` 单独关掉 LSP、格式化与诊断：

```powershell
omp --tools read,edit,bash,web_search
omp --no-tools
omp --no-lsp
```

内建工具与 Eval 前端各有开关，可以用 `omp config set` 写配置，也可以在「设置（Settings）」→「工具（Tools）」里改：

| 键 | 默认 | 作用 |
| --- | --- | --- |
| `bash.enabled` | true | `bash` 工具 |
| `launch.enabled` | true | 命名服务与 `proc://` |
| `eval.py` / `eval.js` | true | Python / JavaScript 内核 |
| `glob.enabled` / `grep.enabled` | true | 路径与内容搜索 |
| `browser.enabled` | true | `browser` 前端 |
| `computer.enabled` | false | `computer` 前端 |
| `astGrep.enabled` | false | 结构化搜索 |
| `astEdit.enabled` | true | 结构化重写 |
| `find.enabled` | `auto` | 语义搜索 |
| `web_search.enabled` | true | 联网搜索 |
| `fetch.enabled` | true | 网页抓取 |
| `github.enabled` | false | `github` 工具 |
| `security.enabled` | false | `security_scan` |
| `checkpoint.enabled` | false | `checkpoint` 与 `rewind` |
| `generate_image.enabled` | false | `generate_image` |
| `speechgen.enabled` | false | `tts` |
| `memory.backend` | `off` | 记忆后端，决定 `retain`/`recall`/`reflect` |
| `autolearn.enabled` | false | `learn` 与托管技能 |
| `task.batch` | true | `task` 批量形状 |
| `task.isolation.enabled` | false | 子代理隔离工作区 |
| `tools.xdev` | true | 可发现工具挂到 `xd://` |
| `tools.approvalMode` | `yolo` | 全局审批策略 |
| `tools.approval` | `{}` | 按工具名设 `allow`/`deny`/`prompt` |

```powershell
omp config set github.enabled true
omp config set tools.approval '{"bash":"prompt"}'
```

`tools.approval` 只改审批，不改变工具是否注册；要彻底移除一个工具，用 `--tools` 白名单或对应的 `*.enabled` 键。

## 相关文档

- [README（工具清单与特性）](https://github.com/can1357/oh-my-pi/blob/v18.13.3/README.md)
- [task 工具](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/tools/task.md)
- [子代理发现与选择](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/task-agent-discovery.md)
- [todo 工具](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/tools/todo.md)
- [ask 工具](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/tools/ask.md)
- [eval 工具](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/tools/eval.md)
- [Python 后端](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/python-repl.md)
- [browser 前端](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/tools/browser.md)
- [LSP 配置](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/lsp-config.md)
- [Agent Hub](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/agent-hub.md)
- [Collab](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/collab.md)
- [脚本化桌面操作](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/computer-use.md)
- [设置目录](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/settings.md)
- [CLI 参考](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/cli-reference.md)
