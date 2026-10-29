# 会话管理

本章讲 omp 把会话存在哪里、怎么继续上一次对话、怎么挑一个更早的会话，以及 `/tree` 怎么在同一个会话文件里换分支。然后对比 `/new`、`/clear`、`/fresh`、`/delete` 和 fork，最后讲导出、分享、压缩和交接。

## 会话存在哪里

默认位置：

```text
%USERPROFILE%\.omp\agent\sessions\<encoded-cwd>\<timestamp>_<sessionId>.jsonl
```

- 每个工作目录一个目录桶。`<encoded-cwd>` 由规范化后的 cwd 生成：在用户主目录下时是 `-<相对路径>`（例如 `C:\Users\you\src\proj` 得到 `-src-proj`），在临时目录下时是 `-tmp-<相对路径>`，其余情况是 `--<绝对路径>--`（例如 `D:\work\app` 得到 `--D--work-app--`），盘符和分隔符都变成 `-`。
- 文件是 JSONL，一行一个 JSON 对象。开头是一个固定 256 字节的标题槽，跟着是会话头（`type: "session"`），然后是各条记录。标题自动生成，`--no-title` 关闭生成。
- 文件名里的 `<timestamp>` 是 ISO 时间戳，`:` 和 `.` 换成 `-`；`<sessionId>` 是自动生成的 id。`--resume` 的 id 前缀匹配就是拿它比。
- 图片等大块内容按哈希存到 `%USERPROFILE%\.omp\agent\blobs\<sha256>`，会话文件里只留引用。
- 子代理的对话和文件产物放在与会话文件同名的目录下，例如 `<session>/<AgentId>.jsonl`。
- 每个终端在 `%USERPROFILE%\.omp\agent\terminal-sessions\<terminal-id>` 写一个面包屑文件，内容是 cwd 和会话文件路径。`--continue` 靠它找回「这个终端上次的会话」。

相关的启动开关：

| 开关 | 作用 |
| --- | --- |
| `--session-dir <dir>` | 换一个目录做会话存储和查找 |
| `--no-session` | 不落盘（临时会话）；`/share` 仍可用，fork 不行 |
| `--profile <name>` | 用一套独立的认证、会话、设置和缓存目录 |

想把会话连同产物和图片一起搬到另一台机器：`pack` 打包，`unpack` 解到指定目录并打印会话文件路径，`moved` 标记本地副本已搬走（以后恢复它会走 fork）。

```powershell
omp session pack ~/.omp/agent/sessions/<project>/<file>.jsonl .\session.tar
omp session unpack .\session.tar --cwd ~/src/project
omp session moved <file>.jsonl --to cloud
```

## 继续上一个会话

```powershell
omp --continue
omp -c "接着上次那个问题继续说"
```

`--continue` 的解析顺序：

1. 先读当前终端的面包屑。
2. 面包屑指向的会话文件不存在、但记录为 `fresh`（`/new` 之后还没写过内容）时，开新会话，而不是把上一个对话拉回来。
3. 否则打开面包屑指向的会话；面包屑属于别的 cwd 时，取当前目录最新的、有内容的会话。
4. 一个都没有就新建。

`--continue <完整-uuid>` 在 uuid 是唯一位置参数时会被当成 `--resume <uuid>` 处理。

omp 默认不会自动接上上一次会话。每次启动都要接上，打开 `autoResume`：

```powershell
omp config set autoResume true
```

这个设置对应 `/settings` 里的「自动恢复（Auto Resume）」。`--goal` 会绕过它，直接全新开始。

崩溃、断电或被杀进程之后想接着跑，用 `--restore`：

```powershell
omp --restore <session-id|path>
```

它先按 `--resume` 的方式选会话，然后补完上一个进程没做完的事：先让被中断的子代理各跑完一轮，再重试主会话被切断的那一轮。只能交互式使用，不能和 `--continue`、`--fork`、导入、`--goal`、`--no-session` 同时给。

omp 没有交互式 `/continue` 命令，`--continue` 只在启动时生效。会话中途想换文件，用 `/resume`。`/restart` 会保留启动配置重新拉起进程，当前会话已落盘时自动带上 `--resume <当前 id>`。

## 挑一个更早的会话

```powershell
omp --resume          # 打开全屏选择器
omp --resume 3f2a     # 按 id 前缀
omp --resume .\old.jsonl
```

`--resume <值>` 的匹配规则：

1. 像路径的值（含 `/`、`\`，或以 `.jsonl` 结尾）直接打开。文件不存在时报 `Session "<path>" not found.`，不会在那个位置新建。
2. 否则先按 id 前缀、完整文件名前缀、或文件名里时间戳之后的 id 后缀匹配当前作用域，再查所有项目（给了 `--session-dir` 时不查全局）。
3. 都没有时，报 `Session "<value>" not found.`。

如果选中的会话记录的目录已经不存在，CLI 会问：

```text
Session's directory no longer exists (...). Move (re-root) it into the current directory? [Y/n]
```

回车把会话挪到当前目录，答 `n` 取消启动。跨项目恢复会同时把进程 cwd、项目级设置和插件缓存切到目标目录，不会因为跨项目就复制一份。

不带值的 `omp --resume` 打开全屏选择器：

| 按键 | 作用 |
| --- | --- |
| `Enter` | 打开选中的会话 |
| `Tab` | 在当前文件夹和所有项目两个范围之间切换 |
| 上下键 / `Page Up` / `Page Down` | 移动 |
| 输入 | 搜索，覆盖 id、标题、cwd、首条消息和路径 |
| `Delete`，或搜索为空时 `Backspace` | 确认后删除会话文件及其产物 |
| `Esc` | 取消，打印「未选择会话（No session selected）」并退出 |

当前文件夹没有会话时显示「当前文件夹中没有会话。按 Tab 查看全部（No sessions in current folder. Press Tab to view all.）」；全局也没有会话才打印「未找到会话（No sessions found）」。两种选择器都把被固定的会话排在最前；在 TUI 里打开时，当前会话还会标为 `current`。

在 TUI 里换会话：

```text
/resume              # 打开同一个选择器
/resume <id 前缀>     # 直接切换
/resume @claude      # 打开 Claude Code 会话的导入选择器
/resume @codex       # 打开 Codex 会话的导入选择器
```

`/resume` 对应「恢复另一个会话」。导入的会话会以新的 omp 会话身份落盘再切换过去；命令行上的对应开关是 `--from-claude` 和 `--from-codex`。想把常用会话固定在恢复列表顶部，用 `/pin [session id]`（「在恢复列表顶部固定或取消固定会话」）。

默认情况下，当前文件夹范围也包含同一仓库其它 worktree 的会话。要把它们分开（`/settings` 里叫「恢复会话的工作树范围（Resume Worktree Scope）」，改回 `repo` 恢复默认）：

```powershell
omp config set session.worktreeScope directory
```

会话被接着写进同目录的另一个文件时（新文件头里的 `continuationOf` 指向前一个），继续和恢复都会打开带最新一轮的那个副本，并提示涉及的两个文件。

## 用 `/tree` 在同一会话里换分支

`/tree` 对应「导航会话树（切换分支）」。它按当前会话文件的记录画出树，让你跳到任意一条记录，从那里继续。这是同一个文件内的叶子移动，不新建会话文件，也不导出任何东西。

三种打开方式：

- 输入 `/tree`。
- 按绑定了 `app.session.tree` 动作的键。
- 在空编辑器上连按两次 `Esc`。这个快捷键由 `doubleEscapeAction` 决定：默认 `rewind` 打开对话回退选择器，设为 `tree` 才打开会话树，设为 `none` 关闭。

### 界面与按键

树按记录的 `id` 和 `parentId` 渲染。同级子节点按时间升序排列，包含当前叶子的分支排在最前，活动路径上的节点前面有圆点，标签以 `[label]` 形式显示在节点文本之前。

| 按键 | 作用 |
| --- | --- |
| `Up` / `Down` | 移动选择（首尾循环） |
| `Alt+Up` / `Alt+Down` | 跳到上一个 / 下一个 user 或 assistant 轮次 |
| `Page Up` / `Page Down`，或 `Left` / `Right` | 翻页 |
| `Home` / `End` | 第一个 / 最后一个可见项 |
| `Enter` | 选中节点 |
| `Shift+Enter` | 带摘要切换（文案「摘要并切换（Summarize & switch）」），跳过摘要选择 |
| `Esc` | 有搜索时清除搜索，否则关闭选择器 |
| `Ctrl+C` | 关闭选择器 |
| 直接输入 / `Backspace` | 编辑搜索串 |
| `Shift+L` | 给选中节点编辑标签（搜索为空时） |
| `Ctrl+O` / `Shift+Ctrl+O` | 向前 / 向后循环过滤器 |
| `Alt+D` `Alt+T` `Alt+U` `Alt+L` `Alt+A` | 直接跳到某个过滤器 |

`app.tree.previousBranch` 和 `app.tree.nextBranch` 默认没有绑定，可以在 `keybindings.yml` 里绑到 `Shift+Left` / `Shift+Right`，用于在可见分支之间跳转。

### 过滤器与搜索

过滤器顺序是 `default`、`no-tools`、`user-only`、`labeled-only`、`all`。打开时的初始值来自 `treeFilterMode` 设置（默认 `default`），在 `/settings` 里叫「会话树过滤器（Session Tree Filter）」。

| 过滤器 | 显示内容 |
| --- | --- |
| `default` | 对话节点和没有被显式隐藏的记录；隐藏 label、custom、model_change、thinking_level_change、model_usage、service_tier_change、title_change、credential_pin、session_init、ttsr_injection、mode_change、reset_boundary |
| `no-tools` | 同 `default`，再去掉工具结果消息 |
| `user-only` | 只显示用户请求，包括普通 user 消息和用户主动调用的 skill / 协作提示 |
| `labeled-only` | 只显示有标签的节点 |
| `all` | 全部记录，记账类记录以元数据行显示 |

只包含工具调用、没有正文的助手消息在所有过滤器下都隐藏，除非它出错或被中止，或者它就是当前叶子。

搜索按空格分词，所有词都要命中（AND），匹配规则是大小写不敏感的子序列模糊匹配。参与匹配的文本包括标签、角色、消息正文、分支摘要和工具命令片段。

### 选中节点后发生什么

- **user 消息**：新叶子移到它的父节点，消息文本和图片附件变回编辑器里的草稿。编辑器里已经有内容时不覆盖。
- **`custom_message`**：普通自定义消息同上。用户主动调用的 skill / 协作提示会恢复原始草稿；代理自动注入的 `skill-prompt` 不可编辑，选中它就是把叶子移到该节点。
- **过去的 `ask` 工具结果**：重新打开原来的提问界面，新答案作为兄弟节点追加，旧答案分支保留。原问题无法还原时退化为普通的叶子移动。
- **其他节点**：叶子直接移到该节点，编辑器不填内容。
- **当前叶子**：一般直接关闭并提示「已处于此位置（Already at this point）」；当前叶子是 `ask` 结果时例外，仍可重新回答。

### 切换时的摘要

是否弹出摘要选择由 `branchSummary.enabled` 控制，默认 `false`。开启后普通 `Enter` 会先问：`No summary`、`Summarize`、`Summarize with custom prompt`。`Shift+Enter` 不看这个设置，直接摘要并切换。

摘要会作为 `branch_summary` 记录追加在目标位置，让离开的分支留下上下文，之后还能回来接着用。摘要过程中按 `Esc` 会取消并重开选择器，叶子不移动。没东西可摘要时，切换照常进行，只是不写摘要记录。

### 标签

`Shift+L` 输入标签，留空则删除，提示是「标签（留空移除）：（Label (empty to remove):）」。标签以追加的 `label` 记录保存，树里显示的是解析后的当前状态。之后按 `Alt+L` 只看有标签的节点，用标签当分支书签。

`/branch`（别名 `/rewind`）是另一个入口，对应「回退到之前的消息，并将旧路径保留为分支」。它打开对话回退选择器，在同一个文件里移动叶子，并把用户请求的草稿还原到编辑器；默认连按两次 `Esc` 打开的就是它。

## `/new`、`/clear`、`/fresh`、`/delete` 和 fork

| 操作 | 会话文件 | 对话内容 | 用途 |
| --- | --- | --- | --- |
| `/new` | 新建，先把头写好 | 清空消息、队列、todo、检查点和工具状态；模型和设置保留 | 换一个话题 |
| `/clear` | 保留同一个文件 | 清空当前上下文，追加 `reset_boundary`；id、标题、cwd、模型保留 | 上下文乱了，但想留在同一个会话 |
| `/fresh` | 不变 | 可见对话和模型上下文都保留，只重置提供商侧的流状态和缓存句柄 | 提示词缓存过期、流卡住、服务端会话 id 漂移 |
| `/delete` | 删除当前文件及其产物，然后切到一个惰性新会话 | 清空 | 这个会话不再需要 |
| `/fork` | 新建文件并切过去；头里 `parentSession` 指向原会话，产物目录复制过去 | 完整复制当前对话 | 保留当前进度，开一个平行尝试 |
| `/fork pane` / `/fork window` / `/fork tab` | 父会话不变，在新终端里启动子进程 | 子进程拿到独立的 fork 会话 | 同时开两个终端 |
| `--fork <id\|path>` | 启动时从指定会话新建 fork 到当前目录 | 复制 | 从命令行开分支 |

几条限制：

- `/clear` 只在 TUI 可用，流式输出中或前台 bash / Python 执行时会被拒绝；压缩进行中会先中止压缩再清空。
- `/fresh` 在流式输出中不可用。它可以处理提示词缓存过期、回合中途出错、服务端会话 id 漂移这类问题，代价最小，因为什么都还在。
- `/new` 会丢掉继承的缓存身份、todo、检查点和提升过的记忆上下文，但保留当前模型和思考层级。
- `/delete` 的后续会话是惰性的：不发消息就退出，不会留下一个空会话文件。
- `/fork` 在流式输出中会被拒绝；`/fork pane` / `window` / `tab` 在流式输出中会先询问再启动。放在终端里需要 tmux、Zellij、Herdr、Orca 或 CMUX，普通终端和 `screen` 会收到明确报错，改用裸 `/fork`。
- `--no-session` 的内存会话不能 fork，会报 `Fork failed (session not persisted or cancelled)`；`--fork` 找不到源文件时直接失败，不会生成空 fork。

`/tree` 和 `/branch` 不在上表里，因为它们既不新建也不切换文件，只在同一个会话文件内移动叶子。要复制整个文件用 `/fork`，要换文件用 `/resume`。

## 导出与分享

| 命令 | 产物 | 说明 |
| --- | --- | --- |
| `/export [--themes] [path]` | HTML 文件，默认 `omp-session-<会话文件名主干>.html` | TUI 里会在浏览器打开，`--themes` 用当前主题配色 |
| `omp --export <session.jsonl> [outputPath]` | HTML 文件 | 不进会话，导出后打印 `Exported to: ...` 并退出 |
| `/dump` | 剪贴板文本，加上临时目录里的 `omp-llm-request-<id>.json` | 导出的是当前活动上下文，不是完整历史 |
| `/dump all` | 临时目录里的 `omp-dump-<id>.zip` | 含 `session.md`、`llm-request.json` 和 `subagents/*.md` |
| `/share` | 加密分享链接 | 上传主会话快照 |
| `omp share <id\|path> [--gist]` | 加密分享链接 | 对已保存的会话做同样的事 |

`/export` 写入会话头、全部记录、当前叶子，以及当前的 system prompt 和工具描述；子代理的记录会作为 `subSessions` 一并嵌入。在 TUI 里对着聚焦的子代理执行 `/export`，导出的是那个子代理自己的记录；`/dump` 和 `/share` 始终面向主会话。

两点注意：HTML 导出不脱敏也不加密，里面可能有原始上下文、图片和扩展负载；解析按空格切分，路径里有空格时参数会拆错，所以用不带空格的路径。

`/dump` 导出的是内存里的活动消息，不是每条分支；`/clear` 或压缩之后再 `/dump`，看到的就是当前上下文。旁边的 JSON 附件会一直留在系统临时目录，同样可能含密钥。

`/share` 做的事情：

1. 组一份主会话快照：header、entries、leafId，加上当前 system prompt 和工具描述。不收集子代理记录。
2. 默认开启 `share.redactSecrets`，把已知和正则识别出的密钥从文本字段里逐项抹掉；不透明的提供商回放字段和非类型化的扩展负载直接丢弃，不做遍历。
3. JSON 先 gzip，再用一次性生成的 AES-256-GCM 密钥封装。
4. 按 `share.store` 选择上传目标。默认 `blob`，POST 到 `share.serverUrl`（默认 `https://my.omp.sh/s`），上限 1 MB；超限时先删内联图片，再把长字符串截到 32768、8192、2048、512 字符，最后删最旧的记录，仍超限就报失败。设成 `gist` 时，用已登录的 `gh` 上传成 secret gist 里的 `session.ompshare.txt`，`gh` 不可用时回退到服务器。
5. 链接形如 `<share.serverUrl>/<id>#<base64url key>`。密钥只在 URL 片段里，不会出现在任何 HTTP 请求中。

所以离开这台机器的是：一份加密的会话快照，默认已经抹掉密钥；解密密钥放在链接片段里，只到拿到链接的人手上。`/share` 对 `--no-session` 的内存会话也有效，因为快照直接用活着的记录组装。

有两个例外值得知道：

- 在 `%USERPROFILE%\.omp\agent` 放一个 `share.ts`（或 `share.js`、`share.mjs`），TUI 的 `/share` 会改用它。传给这个函数的是普通 HTML 导出文件的路径，不是加密快照，发布和加密策略完全由它自己决定；它一旦存在但加载或执行失败，命令直接报错，不会回退到默认流程。headless 和 ACP 不加载这个脚本。
- `/dump` 的 JSON 附件和 `/dump all` 的压缩包都是明文，可能含密钥，放在系统临时目录里，用完自己删掉。

## 上下文压缩

压缩把当前分支上的旧历史换成摘要，作为一条 `compaction` 记录写进会话。重建模型上下文时是「摘要 + 从 `firstKeptEntryId` 开始的保留消息 + 之后的新记录」。JSONL 里压缩前的记录不会被删除，完整导出还能看到。

### 什么时候自动发生

- 一轮成功后上下文超过阈值（`compaction.enabled` 默认 `true`）。
- 工具循环中途、下一次请求之前再次超过阈值（`compaction.midTurnEnabled` 默认 `true`）。
- 上下文溢出错误之后。
- 输出被长度上限截断之后。
- 空闲维护（`compaction.idleEnabled` 默认 `false`）。
- 手动 `/compact`。

`compaction.asyncEnabled`（默认 `true`）会在阈值之前的一个区间里先在后台做摘要，真正越过阈值时直接接上，把等待藏掉。

默认阈值由预留决定：预留是上下文窗口的 15% 和 16384 里较大的那个，阈值是窗口减预留。`compaction.thresholdTokens` 给正数时优先，其次是 `compaction.thresholdPercent`。

### 手动触发

```text
/compact
/compact 把认证部分整理成要点
/compact soft
/compact remote
/compact snapcompact
```

- `soft`：用当前模型在本地总结，不用服务端压缩（「使用活动模型在本地总结（跳过服务器压缩）」）。
- `remote`：走 OpenAI 兼容的服务端压缩，失败回退到本地总结（「通过 OpenAI 兼容服务器压缩进行汇总，然后回退到本地汇总」）。
- `snapcompact`：把历史压缩成密集位图图片供模型读回，不调用 LLM（「把历史压缩成密集位图图片供模型读回（不调用 LLM）」），所以不接受后续的 focus 文本。

不带模式时按 `compaction.methodOrder` 依次尝试。手动压缩会先中止正在进行的操作；如果被中止的是一轮正在跑的对话，摘要提交后会自动接着跑（`compaction.autoContinue` 默认 `true`）。会话太小或已经压缩过时按无操作处理。

### 保留什么

- 摘要覆盖旧对话的要点，保留段是最近的消息，预算由 `compaction.keepRecentTokens` 控制（默认 `20000` tokens）。
- 摘要会带上累计的文件操作记录，压缩后仍然知道这轮改过哪些文件。
- 会话文件保留全部记录；压缩只影响送给模型的那份上下文。

### 常用设置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `compaction.enabled` | `true` | 自动压缩总开关 |
| `compaction.methodOrder` | `remote, snapcompact, handoff, shake, soft` | 方法顺序，不可用或失败就换下一个 |
| `compaction.thresholdTokens` | `-1` | 固定 token 阈值，正数生效，优先于百分比 |
| `compaction.thresholdPercent` | `-1` | 按窗口百分比触发 |
| `compaction.modelThresholds` | `{}` | 按 `provider/model-id` 或 `provider/*` 前缀单独设阈值 |
| `compaction.reserveTokens` | 未设置 | 预留下限；未设置时是 15% 窗口和 16384 里较大的那个 |
| `compaction.keepRecentTokens` | `20000` | 保留的最近历史预算 |
| `compaction.midTurnEnabled` | `true` | 工具循环中途检查阈值 |
| `compaction.idleEnabled` | `false` | 空闲时压缩 |
| `compaction.asyncEnabled` | `true` | 后台预摘要 |
| `compaction.autoContinue` | `true` | 压缩后自动继续 |

这些键都能用 `omp config set` 改，配置文件的层级和 `/settings` 的用法见 [配置与项目上下文](./05-config-and-context.md)。

## 交接（`/handoff`）

`/handoff [focus instructions]` 对应「将会话总结为交接文档并就地压缩」。它让模型用当前会话生成一份交接文档，作为压缩摘要写进当前会话，不新建会话。

```text
/handoff
/handoff 重点写数据库迁移的进度
```

规则和限制：

- 至少要有两条消息记录，否则提示没有可交接的内容。
- 流式输出中或压缩进行中会被拒绝。
- 生成走的是和正常一轮相同的侧请求通道：同一份基础 system prompt、同一套工具、同一个提示词缓存键，交接指令作为最后一条 user 消息追加；`toolChoice` 为 `none`，返回内容只取文本块。
- 提交时保留最近的历史，边界同样来自压缩准备阶段；会话 id、会话文件和提示词缓存键都不变。
- `compaction.handoffSaveToDisk`（默认 `false`）开启后，自动触发的交接还会把 `handoff-<ISO 时间戳>.md` 写进会话的产物目录。手动 `/handoff` 不受这个设置影响。

`handoff` 也是 `compaction.methodOrder` 里的一个方法。自动压缩按顺序走到它时，生成的文档会以同样的方式提交成压缩摘要。

## 相关文档

- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/session.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/session-operations-export-share-fork-resume.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/session-switching-and-recent-listing.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/tree.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/compaction.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/handoff-generation-pipeline.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/settings.md
