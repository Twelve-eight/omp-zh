# 03 交互界面

本章讲 omp 的终端界面：屏幕分成哪几块，提示怎么输入和编辑，`@` 文件引用与 `!` shell 怎么用，哪些斜杠命令值得记住，以及审批模式、计划模式、魔法关键词和 Vim 模式如何开关。会话的恢复、分支、压缩等命令只在表格里出现，细节见 [04 会话](./04-sessions.md)；设置的层级与项目级覆盖见 [05 配置与项目上下文](./05-config-and-context.md)。omp-zh 的界面文字是「中文/English」双语，本章提到界面元素时写中文那一半。

## 屏幕布局

omp 的界面直接画在终端里，从上到下分成三块。

- 对话区（transcript）：用户消息、助手回复、思考块、工具调用与结果。滚出屏幕的行交给终端自己的回滚缓冲区。
- 输入框（composer）：底部带边框的编辑区，边框颜色跟随会话与当前模式。
- 状态栏（status line）：输入框下方的一行，由若干分段拼成，常见的是模型、工作目录、上下文占用百分比、会话名、git 分支、PR 和会话费用。

输入框上方还会临时出现几类条块：等待回答的工具审批条、排队消息、固定显示的实时子代理跳转列表。选择器、设置面板和计划审阅以覆盖层的形式出现，关闭后回到输入框。

输入框形状由 `composer.shape` 决定，默认 `band`；内置形状还有 `box`、`claude`、`pi`、`borderless`、`rule`、`field`、`rail`，扩展也能注册自己的形状。状态栏预设由 `statusLine.preset` 决定，可选 `default`、`minimal`、`compact`、`full`、`nerd`、`ascii`、`custom`；`custom` 时用 `statusLine.leftSegments` 与 `statusLine.rightSegments` 指定分段顺序。这两项都在 `/settings` 的外观（Appearance）标签页里。

启动时的欢迎头部会在内容首次溢出后退场。`startup.quiet` 关闭包括启动画面在内的欢迎界面，`startup.showSplash` 单独控制完整的启动动画。

## 输入与编辑

`Enter` 发送提示，`Shift+Enter` 或 `Ctrl+J` 插入换行。多行草稿里方向键按行移动，`Ctrl+A`、`Ctrl+E` 到行首行尾，`Ctrl+W` 删前一个词，`Ctrl+U`、`Ctrl+K` 删到行首行尾，`Ctrl+Y` 粘贴刚删掉的内容。

输入框识别这几种前缀：

- `/` 开头是斜杠命令，会弹出命令补全。
- `!` 开头按 shell 执行，`$ ` 开头按 Python 执行；这两种模式会改变输入框边框颜色。
- `@` 是文件引用，会弹出文件选择器。

在草稿里输入 `#` 会弹出快速操作，例如复制当前行、复制整个提示、撤销、跳转光标。

### 历史与召回

`Up`、`Down` 在输入框里浏览之前提交的提示；`Ctrl+R` 搜索提示历史，并把选中的一条放回输入框。`Ctrl+C` 清空当前草稿，随后按 `Up` 能把清掉的草稿找回来，继续保持可编辑，直到你再次提交。被清掉的草稿只留在当前编辑器的有限历史里（100 条），不写入持久历史，也不会出现在 `Ctrl+R` 的结果里。这个召回默认开启，可在 `/settings` 的交互（Interaction）→ 输入（Input）里关掉「召回已清除的草稿（Recall Cleared Drafts）」，或设 `composer.recallClearedDrafts: false`。

### 粘贴与图片

粘贴走终端的标准粘贴通道，多行内容在输入框里显示成一个折叠标记，例如 `[Paste #2, +30 lines]`。

- 一次粘贴达到 `paste.largeMenuThreshold` 行（默认 100）时，会弹出「大段粘贴菜单（Large Paste Menu）」，可以包进代码块、包进 XML 标签，或存成文件；设为 `0` 关闭菜单，大段内容仍然折叠成 `[Paste]` 标记。
- `Ctrl+Shift+V`（或 `Alt+Shift+V`）按原样粘贴文本，不做折叠。
- `Ctrl+V` 粘贴剪贴板内容，优先图片。Windows Terminal 可能先把 `Ctrl+V` 当成自己的粘贴，图片没反应时改用 `Alt+V`；剪贴板里没有图片时，同一个按键会粘贴文本。
- 图片以 `[Image #1, 800x600]` 这类占位符显示，随消息一起发给模型。把单个图片文件的路径粘贴进输入框，也会被当作图片附件加载。

`Ctrl+G` 用 `$VISUAL` / `$EDITOR` 指定的编辑器编辑当前草稿，存盘退出后内容回到输入框。

### 中断、退出与排队

`Esc` 中断当前操作（`app.interrupt`），`interruptMode` 可选 `immediate`（默认）或 `wait`。空输入框连按两次 `Esc` 默认打开回退选择器，可用 `doubleEscapeAction` 改成打开会话树（`tree`）或什么都不做（`none`）。

`Ctrl+C` 清空草稿，500 毫秒内再按一次退出；`Ctrl+D` 在草稿为空时退出（退出时会保存当前草稿），草稿里有文字时它只是删除光标处的字符。空会话里直接输入 `exit`、`quit` 或 `q` 也能退出（`input.bareExitOnEmptySession` 默认开启）。

代理正在输出时，`Ctrl+Enter` 或 `Ctrl+Q` 把当前草稿排进队列（`app.message.followUp`），`Alt+Up` 或 `Shift+Up` 把排队的消息取回输入框（`app.message.dequeue`）。Windows Terminal 会拦下 `Ctrl+Enter`，所以 `Ctrl+Q` 是主要入口。

草稿以 `->` 或 `=>` 开头时进入排队模式：输入框首行变成 `Queueing` 标签，提交后作为排队消息处理，代理正忙时等它产出后再发送，空闲时直接开始一轮。在排队模式里写连续编号的列表（`1.`、`2.`…），每条会拆成一条单独的排队消息。`/queue <消息>` 是同一件事的命令形式。

## 常用按键

`/hotkeys` 显示当前生效的完整快捷键表；下表是最常用的一批。

| 按键 | 动作 ID | 作用 |
| --- | --- | --- |
| `Enter` | `tui.input.submit` | 发送提示 |
| `Shift+Enter`、`Ctrl+J` | `tui.input.newLine` | 插入换行 |
| `Esc` | `app.interrupt` | 中断当前操作 |
| `Ctrl+C` | `app.clear` | 清空草稿（连按两次退出） |
| `Ctrl+D` | `app.exit` | 空草稿时退出；有文字时删除光标处字符 |
| `Ctrl+R` | `app.history.search` | 搜索提示历史 |
| `Ctrl+O` | `app.tools.expand` | 展开或收起工具输出 |
| `Ctrl+Shift+O` | `app.tools.toggleVisibility` | 显示或隐藏工具活动 |
| `Ctrl+T` | `app.thinking.toggle` | 显示或隐藏思考块 |
| `Shift+Tab` | `app.thinking.cycle` | 循环切换思考层级 |
| `Ctrl+P`、`Shift+Ctrl+P` | `app.model.cycleForward`、`app.model.cycleBackward` | 在当前角色的模型间前后切换 |
| `Alt+P` | `app.model.selectTemporary` | 临时为本会话挑选模型 |
| `Alt+M` | `app.model.select` | 打开模型选择器并设置角色模型 |
| `Alt+Shift+P` | `app.plan.toggle` | 切换计划模式 |
| `Ctrl+G` | `app.editor.external` | 用外部编辑器编辑草稿 |
| `Ctrl+Enter`、`Ctrl+Q` | `app.message.followUp` | 排队一条后续消息 |
| `Alt+Up`、`Shift+Up` | `app.message.dequeue` | 把排队消息取回输入框 |
| `F5`、`Alt+R` | `app.retry` | 重试上一轮失败的回复 |
| `Alt+L` | `app.display.reset` | 重绘终端显示 |
| `Alt+A` | `app.agents.hub` | 打开代理中心（Agent Hub） |

`Ctrl+P` 只是在你为当前角色配置过的模型之间循环；要给某个角色换模型，用 `Alt+M` 或 `/model`。

### 自定义按键

用户改键写在 `%USERPROFILE%\.omp\agent\keybindings.yml`，是一个 YAML 映射：键为上面的动作 ID，值为一个按键串或按键串数组。按键名大小写不敏感，写法与界面提示一致。

```yaml
app.model.cycleForward: Ctrl+P
app.plan.toggle: Alt+Shift+P
app.history.search: []
```

把某个动作设成空数组即禁用。使用命名 profile 时，先加载默认 profile 的 `keybindings.yml`，再由当前 profile 的 `keybindings.yml` 按动作逐条覆盖。旧文件名 `keybindings.json` 仍会被接受并迁移，`keybindings.yaml` 也可用。

## `@` 文件引用

在提示里写 `@路径`，omp 会把该文件的内容作为一条文件引用（`fileMention`）消息随本轮一起发送，模型不必再自己读一次。输入 `@` 会弹出补全选择器，选中后插入完整路径。

- 路径按当前工作目录精确解析；找不到同名文件时，`@foo` 只是普通文字。
- 写目录时会展开成条目列表。
- 图片按附件处理；文本模型会先收到一段图片描述。
- 单个文本文件超过 5 MB、图片超过 25 MB 时只保留路径，不自动读取。

`AGENTS.md` 等上下文文件里的 `@path` 是另一套导入展开机制，见 [05 配置与项目上下文](./05-config-and-context.md)。

## `!` shell 与 `$` Python

- `!命令` 在你的用户 shell 里执行，结果作为一条命令记录进入对话。
- `!!命令` 同样执行，但这条记录不进入模型上下文。
- `$ 代码` 用 Python 执行；`$$` 不入上下文。`$` 后面必须跟空白，所以 `$HOME` 这类写法仍按普通文字处理。
- 输入框边框会用 bash 或 Python 模式的颜色区分。

交互式 `!` 使用 `shellPath` 指定的外部 shell；代理工具调用里的 `bash` 默认走内置 shell，两者环境不完全相同。简单的一条 `cd` 会改变会话的工作目录，但代理正在输出时这种改目录会被拒绝。交互式命令默认只显示最后若干行，可用 `Ctrl+O` 展开。

## 常用斜杠命令

输入 `/` 就能浏览全部命令：内置命令、扩展注册的命令、文件命令和提示模板命令，以及启用后的 `/skill:<name>`。下表列出日常最常用的 30 个，描述用 omp-zh 的显示文字。

| 命令 | 作用 |
| --- | --- |
| `/settings` | 打开设置菜单 |
| `/model` | 切换本会话的模型（在 TUI 里打开模型选择器） |
| `/fast` | 切换快速服务（OpenAI service_tier=priority 或 ultrafast，Anthropic speed=fast，Google priority） |
| `/slow` | 切换慢速模式：OpenAI/Google 使用 flex 层级；Anthropic 在 Claude 会话限额后以低优先级继续 |
| `/plan` | 切换计划模式（代理在执行前先规划） |
| `/plan-review` | 重新打开最新计划的计划审查（仅计划模式） |
| `/vibe` | 切换 vibe 模式（直接持久化快速/优质工作会话；只读工具集） |
| `/compact` | 手动压缩会话上下文 |
| `/handoff` | 将会话总结为交接文档并就地压缩 |
| `/context` | 浏览上下文用量与详细内容 |
| `/new` | 启动新会话 |
| `/resume` | 恢复另一个会话 |
| `/tree` | 导航会话树（切换分支） |
| `/branch` | 回退到之前的消息，并将旧路径保留为分支 |
| `/clear` | 原地清空对话上下文，保留会话 |
| `/fresh` | 在不改变本地对话记录的情况下重置提供商流状态 |
| `/todo` | 查看或修改代理的待办列表 |
| `/tools` | 显示当前对代理可见的工具 |
| `/agents` | 打开代理中心（按代理设模型、prewalk 与 advisor） |
| `/git` | 打开 git 界面（分栏 diff 查看器、暂存、提交编辑器） |
| `/hotkeys` | 显示所有快捷键 |
| `/usage` | 显示提供商用量和限额 |
| `/stats` | 启动本地统计控制面板 |
| `/export` | 将会话导出为 HTML 文件 |
| `/share` | 通过加密链接分享会话（分享服务器或 secret gist） |
| `/copy` | 从对话中选取文本或代码以复制 |
| `/setup` | 打开提供商设置 |
| `/mcp` | 管理 MCP 服务器（添加、列出、移除、测试） |
| `/btw` | 提出一个旁支问题，或浏览本会话的 BTW 历史 |
| `/exit` | 退出应用程序 |

分工如下：会话类命令的细节在 [04 会话](./04-sessions.md)，模型与角色在 [02 模型与提供商](./02-models-and-providers.md)，`/settings` 与配置文件在 [05 配置与项目上下文](./05-config-and-context.md)，`/mcp`、`/skills`、`/marketplace` 在 [06 扩展](./06-extending.md)，`/agents`、`/hub` 在 [07 工具与子代理](./07-tools-and-subagents.md)。

## 审批模式

工具调用按三档分级：`read` 只读，`write` 改工作区或会话状态，`exec` 执行代码、起 shell、驱动浏览器或派生子代理。没有声明分级的工具按 `exec` 处理，MCP 服务器工具按 `write` 处理。`tools.approvalMode` 决定哪些档位需要你点头。

| 取值 | 自动放行 | 需要确认 |
| --- | --- | --- |
| `always-ask` | `read` | `write`、`exec` |
| `always-ask-cached` | 无文件目标的 `read`、已授权的文件和目录 | 文件读取、`write`、`exec` |
| `write` | `read`、`write` | `exec` |
| `yolo`（默认） | 全部 | 无 |

在 `/settings` 的交互（Interaction）→ 批准（Approvals）里改「工具批准（Tool Approval）」，或者直接写进设置：

```powershell
omp config set tools.approvalMode write
```

单次运行可以用 `--approval-mode <mode>` 覆盖；`--auto-approve` 和 `--yolo` 强制 `yolo`，但工具本身的 `deny`、显式的 `prompt` 策略和提供商的待处理安全检查仍然生效。`tools.approval.<toolName>` 可以按工具单独设 `allow`、`deny` 或 `prompt`，它覆盖模式本身，但不能绕过工具自己的 `deny`/`prompt` 策略。

审批条停在输入框上方，直到你作答。选项是 `Approve`、`Approve <tool> for this session`、`Deny`：输入框为空时用方向键选、`Enter` 确认，`Ctrl+Enter` 或 `Ctrl+Q` 直接批准本次，`Esc` 拒绝。刚出现的半秒内 `Enter` 和批准键会被忽略，免得你正在打字时误批。

`always-ask-cached` 会额外提供按文件或文件夹记住的选项，以及 `Remember across sessions` 开关；记住的授权写进代理目录下的 `approval-cache.db`。`/forget-approvals` 清空这份数据库和本会话的授权。`tools.restrictedFolders` 里的目录在包括 `yolo` 在内的所有模式下都逐次询问，不受记住的授权影响。

## 计划模式

计划模式让代理先只读地探索、把方案写成计划，等你批准后再动手。工作树和系统在计划模式下是只读的：不能新建、修改、删除或重命名工作区文件，也不能跑 `git commit`、装依赖这类会改变状态的命令；允许写的是会话本地的 `local://` 计划文件。

开关方式：

- `/plan` 进入，再执行一次退出；`/plan <提示>` 进入并把这段话作为第一轮规划请求。
- `Alt+Shift+P`（`app.plan.toggle`）随时切换。
- `plan.enabled`（默认 `true`）控制这个功能是否启用；`plan.defaultOnStartup`（默认 `false`）让每个新会话从计划模式开始。

进入时会把模型切到 `plan` 角色，状态行出现计划模式标记，并提示计划文件的位置。代理把计划写进 `local://<slug>-plan.md`，然后通过 `xd://propose` 提交，界面弹出计划审阅（Plan Review）覆盖层，其中有这些选择：

- `Approve and execute`：清空当前会话上下文，用全新的上下文执行计划。
- `Approve and compact context`：先把规划讨论压缩成摘要，再在本会话执行。
- `Approve and keep context`：保留探索过程，直接在本会话执行。
- `Refine plan`：留在计划模式，把补充意见当作下一轮提示继续打磨计划。
- `Save and quit`：把计划复制到指定路径，然后开一个新会话。

`/plan-review` 能在计划模式里重新打开最近一份计划的审阅。退出时如果计划文件里已有内容，会先问你确认。`plan.autosave` 打开后，批准的计划会自动存盘，默认目录是项目下的 `.omp/plans/`，可用 `plan.autosaveDir` 改。

无界面的一次性流程用 `--plan-yolo`；print 模式的整体用法见 [08 自动化与集成](./08-automation.md)。

## 魔法关键词

在提示的正文里单独写某个小写单词，会给这一轮追加一条隐藏指令。这些词只对包含它的那一轮生效，正文里的单词本身仍然留在你的消息里。

| 关键词 | 效果 |
| --- | --- |
| `ultrathink` | 要求更细致地多步推理；自动思考开启时，本轮使用当前模型支持的最高推理强度 |
| `orchestrate` | 要求把任务拆成可并行的独立部分，派生子代理分头完成并逐段验证 |
| `workflowz` | 要求在 `eval` 里搭建确定性的多子代理工作流 |
| `jevify` | 要求用 `eval` 的 `judge()` 对整批条目一次性判定，只读被标记的结果 |

匹配规则是刻意收紧的：必须小写，必须是独立的正文单词；`orchestrated`、`orchestrate.ts`、`orchestrate()` 都不触发。围栏代码块、行内代码、HTML/XML 标签与注释里的词会被忽略。这些词在输入框里会带动画高亮，发送后保留静态高亮。

在 `/settings` 的交互（Interaction）→ 魔法关键词（Magic Keywords）里可以整体或逐个关闭，也可以直接改设置：

```powershell
omp config set magicKeywords.enabled false
omp config set magicKeywords.ultrathink false
```

`workflowz` 对应的设置键是 `magicKeywords.workflow`。全局开关只挡隐藏指令和输入框动画，静态高亮与拼写豁免仍然保留。

## Vim 模式

Vim 编辑模式默认关闭。在 `/settings` 的交互（Interaction）→ 输入（Input）里打开「Vim 编辑模式（Vim Editing Mode）」，或设置 `tui.vimMode: true`。

打开后提示从插入模式开始，`Esc` 进入普通模式，`i`、`a`、`I`、`A`、`o`、`O` 回到插入；`v`、`V` 进入可视与可视行模式。普通模式下 `h` `j` `k` `l`、`w` `b` `e`、`0` `^` `$`、`gg` `G`、`dd` `yy` `cc`、`dw` `diw` `ca(`、`p` `u` `.` 这些常用操作都可用，支持数字前缀和 `3w`、`2dd` 这类组合。`Ctrl` 组合键、`Enter`、`Tab` 在所有模式下保持原有行为，所以普通模式里 `Enter` 仍然发送。

这是 Vim 的一个实用子集，不是完整实现。状态行会显示当前模式、待输入的指令和可视选区大小，显示样式由 `tui.vimModeDisplay` 决定：`text`（默认）、`icon`、`none`。输入框边框颜色也会随模式变化，bash/Python 模式的颜色优先。

## 相关文档

- [README.md](https://github.com/can1357/oh-my-pi/blob/v18.13.3/README.md)：Prompt controls、Session controls、模型角色与 `Ctrl+P`
- [docs/keybindings.md](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/keybindings.md)：动作 ID、`keybindings.yml`、清除草稿的召回、Vim 模式
- [docs/magic-keywords.md](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/magic-keywords.md)：关键词表、匹配规则与设置项
- [docs/approval-mode.md](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/approval-mode.md)：审批分级、四种模式、记住授权、受限目录
- [docs/vibe-mode.md](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/vibe-mode.md)：`/vibe` 与两类 worker
- [docs/bash-tool-runtime.md](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/bash-tool-runtime.md)：交互式 `!` 命令与 `!!`
- [docs/slash-command-internals.md](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/slash-command-internals.md)：命令来源、补全与 `/plan-review`
- [docs/settings.md](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/settings.md)：状态栏、输入框、计划与交互相关设置
- [packages/coding-agent/src/slash-commands/builtin-registry.ts](https://github.com/can1357/oh-my-pi/blob/v18.13.3/packages/coding-agent/src/slash-commands/builtin-registry.ts)：内置斜杠命令注册表
