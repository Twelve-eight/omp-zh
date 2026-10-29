# 配置与项目上下文

omp 的行为由一组 YAML 设置控制，这些设置按作用域分层加载，高优先级的层覆盖低优先级的层。除了设置之外，omp 还会在会话开始前自动读取项目里的说明文件、规则、记忆和机密配置，把它们拼进发给模型的上下文。本章说明这些文件放在哪里、如何修改，以及它们之间谁覆盖谁。

## 配置文件放在哪里

设置分两个作用域：用户级（全局）和项目级。

| 作用域 | 路径 | 说明 |
| --- | --- | --- |
| 全局 | `%USERPROFILE%\.omp\agent\config.yml` | 主要的持久化设置文件 |
| 全局（兼容名） | `%USERPROFILE%\.omp\agent\config.yaml` | 已存在时直接读写这个文件 |
| 全局（旧格式） | `%USERPROFILE%\.omp\agent\settings.json` | 只用于迁移；迁移成功后会改名为 `settings.json.bak` |
| 项目 | `<项目目录>\.omp\config.yml` | 只在该目录下启动 omp 时加载 |
| 项目（旧格式） | `<项目目录>\.omp\settings.json` | 仍会读取，项目 `config.yml` 覆盖它 |
| 一次性覆盖 | 任意文件，通过 `--config <文件>` 传入 | 可重复传入，只对本次进程生效 |
| 运行时 | 命令行开关，例如 `--approval-mode` | 只存在内存里，不写盘 |

用 `omp config path` 可以打印当前生效的用户级设置目录，确认自己改的是哪个文件。

项目级设置有一个容易踩的限制：omp 只读取当前工作目录下的 `.omp\`，不会向上级目录查找。所以在子目录里启动时，仓库根目录的 `.omp\config.yml` 不会生效；要么在仓库根目录启动，要么把设置写进当前目录。

### 覆盖顺序

从低到高排列，一个设置项的有效值来自：

```text
内置默认值  <  全局 config.yml  <  项目 config.yml  <  --config 覆盖  <  运行时开关  <  该设置项自己的环境变量
```

各层按深合并组合：对象按键递归合并，标量和数组整体替换。也就是说，项目里写了一个数组，它不会和全局数组拼接，而是完全取代全局数组。配置里的 `null` 在读取时按“未设置”处理。

设置项自己的环境变量通常高于配置文件，也不会被写回 `config.yml`；少数 `fallback` 型变量只替换内置默认值（如 `SEARXNG_*`、`MNEMOPI_EMBEDDING_MODEL`），已配置的非空值会压过它们。例如 `PI_SMOL_MODEL` 覆盖 `modelRoles.smol`，`PI_PY` 覆盖 `eval.py`。`PI_CONFIG_FILES` 可以一次传入多个覆盖文件，Windows 上用分号分隔路径。

全局或项目 YAML 语法错误、或顶层不是映射时，omp 会把该文件移动成 `.broken-<时间戳>-<pid>-<uuid>` 备份，然后带着原文件和备份路径报错退出。`--config` 覆盖文件更严格：文件不存在、YAML 非法、顶层是数组或标量都直接报错，不会退回低优先级的值。

## 三种修改设置的方式

### 在会话里用 `/settings`

在会话中输入 `/settings` 打开「设置（Settings）」面板。面板列出所有带界面编辑器的设置项，按分组排列，可以直接修改。

面板显示和编辑的是设置层的合并结果，不包括环境变量提供的值。某个设置项被环境变量覆盖时，面板会在描述里注明，因此环境里的凭据既不会被预填，也不会被写进配置文件。

### 直接编辑 `config.yml`

设置就是普通的 YAML 映射。带点的键要写成嵌套结构：

```yaml
theme:
  dark: titanium
  light: light

tools:
  approvalMode: write
  approval:
    bash: prompt
```

手工编辑的键必须是真实存在的设置路径，拼错的键不会生效。互动会话、RPC 和 RPC-UI 会监视全局文件、项目设置和覆盖文件，保存后短暂延迟即重新加载。解析失败的层会保留上一次有效值并记录警告，其他层照常刷新。

### 用 `omp config` 命令

在 shell 里可以用 `omp config` 读写设置。不带子命令时它等价于列出所有设置。

| 子命令 | 作用 |
| --- | --- |
| `omp config list` | 列出全部设置、当前值和类型；`--scope global` 或 `--scope project` 只列出该层文件里写的键 |
| `omp config get <键>` | 打印单个键的有效值 |
| `omp config set <键> <值>` | 按类型解析值，写入全局主 YAML 文件 |
| `omp config reset <键>` | 从全局文件里删除该键，让默认值或其他层生效 |
| `omp config path` | 打印当前生效的用户设置目录 |
| `omp config init-xdg` | 在 Linux 和 macOS 上创建 XDG 目录；其他平台以非零状态退出 |

```powershell
omp config list
omp config get theme.dark
omp config set tools.approvalMode write
omp config set defaultThinkingLevel medium
omp config reset tools.approvalMode
```

`omp config set` 的键必须与 schema 完全一致，没有简写：写 `theme.dark`，不能写 `theme`。值的写法由键的类型决定，布尔接受 `true`/`false`/`yes`/`no`/`on`/`off`/`1`/`0`，数组和记录要传 JSON，例如：

```powershell
omp config set tools.approval '{"bash":"prompt"}'
```

`omp config list` 会按分组打印全部可配置项，是查询键名和默认值的权威来源；下面表格只覆盖新手最常改的部分。

### 写入目标是全局文件

`omp config set`、`omp config reset` 和 `/settings` 的持久化写入都落在当前用户级（或当前 profile 的）`config.yml`。设置命令不会把任意键写进项目的 `<项目目录>\.omp\config.yml`。

唯一的例外是模型角色：当 `modelRoleStorage: project` 时，在模型选择器里分配或清除的角色只写进项目配置的 `modelRoles`，项目里缺失的角色再回退到全局角色。其他项目级键需要手工编辑项目文件。

## 常用设置

| 键 | 含义 | 默认值 |
| --- | --- | --- |
| `theme.dark` | 深色终端背景使用的主题 | `titanium` |
| `theme.light` | 浅色终端背景使用的主题 | `light` |
| `symbolPreset` | 界面符号集：`unicode`、`nerd`、`ascii` | `unicode` |
| `statusLine.preset` | 状态栏布局：`default`、`minimal`、`compact`、`full`、`nerd`、`ascii`、`custom` | `default` |
| `defaultThinkingLevel` | 新会话默认思考层级：`minimal`、`low`、`medium`、`high`、`xhigh`、`max`、`auto` | `high` |
| `hideThinkingBlock` | 隐藏输出里的思考块，只影响显示 | `false` |
| `tools.approvalMode` | 批准模式：`always-ask`、`always-ask-cached`、`write`、`yolo` | `yolo` |
| `tools.approval` | 按工具名设定 `allow`、`deny`、`prompt` | `{}` |
| `compaction.enabled` | 自动压缩对话历史 | `true` |
| `compaction.thresholdPercent` | 上下文占用到百分之多少时触发压缩，`-1` 表示按预留值推算 | `-1` |
| `memory.backend` | 记忆后端：`off`、`local`、`hindsight`、`mnemopi`、`sharpshooter` | `off` |
| `secrets.enabled` | 在发给提供商前对机密做脱敏 | `false` |
| `modelRoles` | 各角色（`default`、`smol`、`slow`、`plan` 等）的主模型 | `{}` |
| `ask.timeout` | 无人作答多少秒后自动选中推荐选项，`0` 关闭 | `0` |
| `startup.showSplash` | 普通启动时播放完整开场动画，不会重跑初始化 | `false` |

- `defaultThinkingLevel` 可以用 `--thinking` 单次覆盖；思考层级的选择见 [模型与提供商](./02-models-and-providers.md)。
- `tools.approvalMode` 的批准交互见 [交互式界面](./03-interactive.md)；压缩与交接的细节见 [会话](./04-sessions.md)；`modelRoles` 与 `retry.fallbackChains` 的配合见 [模型与提供商](./02-models-and-providers.md)。

## Profiles：多套互不干扰的配置

一个 profile 会把用户级的 OMP 路径整体改到另一个目录，让不同项目或不同身份使用各自的设置、凭据、会话和缓存。

```powershell
omp --profile work
omp --profile work config path
```

| 方式 | 说明 |
| --- | --- |
| `omp --profile <名称>` | 显式选择，优先级最高 |
| `$env:OMP_PROFILE = "work"` | 环境变量选择 |
| `$env:PI_PROFILE = "work"` | 仅在 `OMP_PROFILE` 未定义时作为兼容回退 |
| `omp --profile default` | 回到默认 profile |

选择命名 profile 后，文中写作 `%USERPROFILE%\.omp\agent\` 的用户级路径都变成 `%USERPROFILE%\.omp\profiles\<名称>\agent\`，例如 `config.yml` 位于 `%USERPROFILE%\.omp\profiles\work\agent\config.yml`。profile 只能看到自己的 OMP 配置，看不到默认 profile 的 agent 配置。

项目级路径和其他工具的路径不随 profile 迁移：`<项目目录>\.omp`、`%USERPROFILE%\.claude`、`%USERPROFILE%\.codex`、`%USERPROFILE%\.gemini` 在每个 profile 下加载结果相同。键位绑定是唯一例外，命名 profile 会先合并默认 profile 的 `keybindings.*`，再用自己的文件逐条覆盖。

`--alias <命令>` 本身不选择 profile，只有和 `--profile` 一起用时才会为该 profile 生成 shell 快捷方式。命名 profile 生效时，状态栏的 `pi` 段会带上 profile 名（例如 `π-work`），便于区分；不需要时设 `statusLine.segmentOptions.pi.showProfile: false`。

## 项目上下文文件

除了设置，omp 还会在会话开始时自动发现并注入一组 Markdown 说明文件。你不需要提示 agent 去读 `AGENTS.md`，相关的文件已经在上下文里。

### 原生 `.omp/AGENTS.md`

| 文件 | 作用域 | 行为 |
| --- | --- | --- |
| `%USERPROFILE%\.omp\agent\AGENTS.md` | 用户 | 用户级上下文，主会话和 advisor 会收到，task 子代理不继承 |
| `<最近的非空 .omp 目录>\AGENTS.md` | 项目 | 项目上下文，只从「最近的非空 `.omp/` 目录」读取 |
| `%USERPROFILE%\.omp\agent\RULES.md` | 用户 | 用户级常驻规则，不是上下文文件 |
| `<最近的非空 .omp 目录>\RULES.md` | 项目 | 项目常驻规则 |

项目文件的查找从当前目录向仓库根目录爬升，一旦遇到非空的 `.omp/` 就停下，只从该目录读 `AGENTS.md` 和 `RULES.md`；文件缺失也不会继续向上找。空的 `.omp/` 目录、空的 `AGENTS.md` 或 `RULES.md` 都不贡献内容。

注意和设置的区别：设置只看当前目录的 `.omp/`，而原生上下文文件会向上找到最近的非空 `.omp/`。

### 其他工具的文件

omp 也识别其他工具的约定，已有项目不用迁移：

| 来源 | 路径 | 备注 |
| --- | --- | --- |
| Claude | `~/.claude/CLAUDE.md`（用户）、`<当前目录>/.claude/CLAUDE.md`（项目） | 项目文件不向上查找 |
| Codex | `~/.codex/AGENTS.md` | 只有用户级 |
| Gemini | `~/.gemini/GEMINI.md` | 用户级和当前目录 |
| 独立文件 | 从当前目录向上找到仓库根的 `AGENTS.md`、`CLAUDE.md` | 不放在配置目录里的那种 |

其他工具的用户级来源默认不开启，需要在 `config.yml` 里列出：

```yaml
enabledProviders:
  - claude
  - github
```

项目级文件默认就会读取。`disabledProviders` 优先于这里的开启列表。

上下文文件的去重按作用域进行：所有来源里只保留一个用户级文件（原生 `.omp/AGENTS.md` 优先级最高），每个目录深度只保留一个项目级文件，同深度下优先级高的来源遮蔽其他来源。跨深度可以多个文件共存，最终注入顺序是用户文件在前、越靠近当前目录的项目文件越靠后。

### 额外文件名

内置发现只认固定文件名。要让 omp 加载其他名字，把它们列进 `contextFiles.extra`：

```yaml
contextFiles:
  extra:
    - AGENTS.local.md
```

也可以在「设置（Settings）」的「上下文（Context）」里找到「额外上下文文件（Extra Context Files）」，填入 JSON 数组，例如 `["AGENTS.local.md", "TEAM.md"]`。列表默认为空；填 `[]` 关闭全局额外文件，清空输入框则移除这条全局覆盖。条目是文件名而不是路径，内置名（`AGENTS.md`、`CLAUDE.md` 等）会被拒绝。

### 一个 `AGENTS.md` 的例子

```markdown
# 项目说明

## 构建与测试
- 安装依赖后先跑一次完整测试再提交。
- 只改一个包时，用包内的测试命令。
## 约定
- 提交信息用英文，一句话说明改了什么。
- 新增公开接口要补类型和文档注释。
## 详细资料
架构说明见 @docs/architecture.md。
```

`@path` 会在注入前展开成文件内容。相对路径从被引用文件自己所在的目录解析，`~/` 从用户主目录解析，代码块和行内代码里的 `@` 不会被展开，展开最多五跳。

主会话会收到发现的 `AGENTS.md` 和 `CLAUDE.md`。task 子代理不继承任何名为 `AGENTS.md` 的文件（`CLAUDE.md` 仍会继承），但仍会拿到 `RULES.md`，所以子代理必须遵守的硬性要求放进 `RULES.md`。通过 `@` 导入进来的文本不会被这个过滤命中。

## 定制系统提示词

系统提示词由多个块拼成。你可以只追加几句，也可以整体替换默认的指令模板。

| 文件 | 位置 | 作用 |
| --- | --- | --- |
| `APPEND_SYSTEM.md` | 用户级或项目级 | 在提示词末尾追加纯文本，默认指令模板保持不变 |
| `SYSTEM.md` | 用户级或项目级 | 替换默认的指令模板，保留技能、规则和项目上下文等生成内容 |
| `SYSTEM_TEMPLATE.md` | 用户级或项目级 | 用 Handlebars 模板替换指令块 |
| `TITLE_SYSTEM.md` | 用户级或项目级 | 覆盖自动生成会话标题的系统提示词 |
| `PERSONALITY.md` | 用户级 `%USERPROFILE%\.omp\agent\` | 替换 `personality` 预设里的语气段落 |

选择顺序是项目级优先、其次用户级；同一作用域内纯文本优先于模板，即项目 `SYSTEM.md` > 项目 `SYSTEM_TEMPLATE.md` > 用户 `SYSTEM.md` > 用户 `SYSTEM_TEMPLATE.md`。

命令行开关的优先级更高：`--system-prompt`、`--system-prompt-template` 压过发现的 `SYSTEM.md` 和 `SYSTEM_TEMPLATE.md`，`--append-system-prompt` 压过 `APPEND_SYSTEM.md`。`--system-prompt` 与 `--system-prompt-template` 互斥。

### 追加还是替换

只想补充几条要求时，用 `APPEND_SYSTEM.md`：

```text
# %USERPROFILE%\.omp\agent\APPEND_SYSTEM.md
改动公开函数后，先跑测试再结束本轮。
回答里引用文件时写完整路径。
```

用 `SYSTEM.md` 会换掉默认指令模板里的角色描述、工具清单、工作流和内部 URL 说明，但技能、规则、机密脱敏提示和末尾的项目上下文块仍会生成。需要保留默认工具策略时，不要用 `SYSTEM.md`，要么改用 `APPEND_SYSTEM.md`，要么自己把需要的内容写进 `SYSTEM.md`。

`SYSTEM_TEMPLATE.md` 走 Handlebars 模板路线，模板文件在启动时读取一次；修改后要重启 omp 才生效。`SYSTEM.md`、`APPEND_SYSTEM.md` 和命令行传入的文本都按纯文本插入，里面的 `{{...}}` 不会被当作模板执行。

`TITLE_SYSTEM.md` 只影响自动生成会话标题的那段提示词，不改变正常对话的系统提示词。

## 规则

规则是 Markdown 文件，放在 `.omp/rules/` 下，可用 frontmatter 声明元数据：

```text
<项目目录>\.omp\rules\*.md
%USERPROFILE%\.omp\agent\rules\*.md
```

```markdown
---
description: 修改存储层时必须遵守
globs: ["src/storage/**"]
alwaysApply: false
---

改动存储格式前，先写迁移脚本并补一个回滚测试。
```

规则名取自文件名。`alwaysApply: true` 的规则会一直留在上下文里；其余带 `description` 的规则进入规则清单，模型可以按需通过 `rule://` 读取，没有 `description` 的规则不会出现在清单里。顶层 `RULES.md` 是常驻规则，用户级和项目级各一份，两者都会被强制设为始终生效。

规则还有一类运行方式：带 `condition`（正则）、`astCondition`（ast-grep 结构模式）或 `question`（judge 模型判定的问题）的规则会在生成过程中检查模型输出。命中 `condition` 时，omp 默认打断当前输出，把这条规则注入后重试这一段；`astCondition` 在工具调用参数定稿后检查；`question` 规则不打断，只在判定为“是”时给出一条警告。这些行为由 `ttsr.*` 设置控制，设 `ttsr.enabled: false` 可整体关闭。规则格式和匹配细节属于扩展内容，见 [扩展 omp](./06-extending.md)。

## 记忆

记忆默认关闭。用 `memory.backend` 选择后端：

| 值 | 存储与行为 |
| --- | --- |
| `off` | 不使用记忆 |
| `local` | 从已保存的会话里提取摘要和教训，按项目存放 |
| `hindsight` | 远程的 bank 级记忆 |
| `mnemopi` | 本地 SQLite 记忆 |
| `sharpshooter` | 按项目记录决策文件，后台合并 |

打开本地摘要管线：

```yaml
memory:
  backend: local
```

会话启动时，如果当前项目已有合并后的摘要或手工记录的教训，它会被注入系统提示词，作为 `Memory Guidance` 块。这些内容是启发式的，与仓库当前状态冲突时应以仓库为准。

常用子命令：`/memory view` 显示当前注入内容，`/memory stats` 显示后端统计，`/memory queue` 显示等待合并的增量，`/memory sync` 立即执行一次合并，`/memory clear` 或 `/memory reset` 删除当前后端的记忆数据，`/memory rebuild` 是 `enqueue` 的别名，登记一次合并维护供下次启动处理。

设置 `autolearn.enabled: true` 后会提供 `learn` 工具；本地后端激活时，它把明确的长期教训写进项目的 `learned.md`。教训按最新在前排序、去重、脱敏，最多保留 100 条，从下一次会话开始注入。本地后端的记忆文件可以用 `memory://root`、`memory://root/MEMORY.md`、`memory://root/learned.md` 读取。

## 机密

`secrets.enabled` 默认是 `false`。打开后，omp 在把消息发给模型提供商之前，把匹配到的机密替换成占位符，例如 `$$3P8W5JH1TK2Q$$`；模型调用工具时，占位符在执行前会被还原。这样发给提供商的内容里不会出现明文密钥。

```yaml
secrets:
  enabled: true
```

机密来源包括：名字匹配 `KEY`、`SECRET`、`TOKEN`、`PASSWORD`、`AUTH`、`CREDENTIAL` 等模式且长度至少 8 个字符的环境变量；连接串环境变量（如 `DATABASE_URL`）里 `scheme://user:password@host` 形态的口令；`secrets.yml` 里的条目；以及内置的凭据形态正则，覆盖 GitHub、GitLab、OpenAI、Anthropic、AWS、Google、Slack、npm、Stripe、Hugging Face、SendGrid 的令牌和 JWT、Bearer 头、PEM 私钥块。

`secrets.yml` 有两个位置，项目条目按 `content` 覆盖全局条目：

| 位置 | 用途 |
| --- | --- |
| `%USERPROFILE%\.omp\agent\secrets.yml` | 该 agent 目录下所有项目共用 |
| `<项目目录>\.omp\secrets.yml` | 只对该项目生效 |

```yaml
- type: plain
  content: <your-api-key>

- type: regex
  content: "AKIA[0-9A-Z]{16}"
  friendlyName: AWS Key
```

每条目支持 `type`（`plain` 或 `regex`）、`content`、`mode`、`replacement`、`flags` 和 `friendlyName`。`obfuscate` 是默认模式，替换成确定性的 `$$HASH$$` 占位符，可以还原；`replace` 替换成 `replacement` 或等长的确定性值，不可还原。

脱敏只作用于会话内容：静态系统提示词、静态工具定义和二进制数据不会被改写。

## 主题

深浅两套主题分别由 `theme.dark` 和 `theme.light` 指定，默认是 `titanium` 和 `light`。界面符号由 `symbolPreset` 控制。

```powershell
omp config set theme.dark titanium
omp config set symbolPreset nerd
```

自定义主题是 JSON 文件，放在 `%USERPROFILE%\.omp\agent\themes\<名称>.json`（命名 profile 下是对应 profile 的 `agent\themes`）。文件必须有 `name` 和完整的 `colors`，可选 `vars`、`export` 和 `symbols`。同名时内置主题优先。

创建后到「设置（Settings）」的「外观（Appearance）」里，用「深色主题（Dark Theme）」或「浅色主题（Light Theme）」选中它。主题选择会写进当前 agent 目录的 `config.yml`。

## 相关文档

- [Configuration Discovery and Resolution](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/config-usage.md)
- [Settings](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/settings.md)
- [Context files](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/context-files.md)
- [System Prompt Customization](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/system-prompt-customization.md)
- [Rulebook Matching Pipeline](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/rulebook-matching-pipeline.md)
- [TTSR Injection Lifecycle](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/ttsr-injection-lifecycle.md)
- [Autonomous Memory](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/memory.md)
- [Secret Obfuscation](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/secrets.md)
- [Theming Reference](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/theme.md)
