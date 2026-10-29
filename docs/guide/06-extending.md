# 扩展 omp

omp 自带工具之外，还可以用磁盘上的文件扩展它：技能、斜杠命令、钩子、MCP 服务器、自定义工具、扩展模块和插件。本章按「写一个文件就能用」的顺序介绍每一种，给出最小示例和放置位置。路径按 Windows 写成 `%USERPROFILE%\.omp\...`，在 macOS/Linux 上对应 `~/.omp/...`。

## 先看全景

| 类型 | 用来做什么 | 放在哪里 | 谁触发 |
| --- | --- | --- | --- |
| 技能（Skill） | 按需读取的知识或流程说明 | `.omp/skills/<名字>/SKILL.md`、`~/.omp/agent/skills/<名字>/SKILL.md` | 模型按需 `read`、或你输入 `/skill:<名字>` |
| 斜杠命令 / 提示模板 | 你常用的提示词入口 | `.omp/commands/*.md`、`.omp/prompts/**/*.md` | 你输入 `/名字` |
| 钩子（Hook） | 拦截工具调用、改写上下文、审计 | `.omp/hooks/pre/`、`.omp/hooks/post/` | 运行时事件 |
| MCP 服务器 | 接入外部工具服务 | `.omp/mcp.json`、`~/.omp/agent/mcp.json` | 模型调用 MCP 工具 |
| 自定义工具 | 给模型一个可调用的新函数 | `.omp/tools/*.ts`、`~/.omp/agent/tools/*.ts` | 模型调用 |
| 扩展（Extension） | 事件、工具、命令、快捷键打包成一个模块 | `.omp/extensions/*.ts`、`~/.omp/agent/extensions/*.ts` | 事件/命令/工具 |
| 插件与市场 | 把上面这些打包分发和安装 | `~/.omp/plugins/`、`.omp/plugins/` | 安装后参与发现 |

项目级位置只对当前仓库生效，用户级位置对所有项目生效。这几类资源都在会话启动时发现，新增文件后重启会话最稳妥；加载出错时先看 `~/.omp/logs/` 下的日志。下面出现的设置键如何落盘、按什么优先级合并，见 [配置与项目上下文](./05-config-and-context.md)。

## 技能（Skills）

技能是给模型看的 Markdown 说明，不是可执行代码，适合放团队约定、操作步骤、某个库的用法。平时只把名字和描述放进上下文，需要时才读全文。

### 目录结构

一个技能一个目录，`SKILL.md` 直接放在目录下，扫描只向下看一层：

```text
%USERPROFILE%\.omp\agent\skills\
  └─ release-notes\
       ├─ SKILL.md          ← 被发现
       └─ references\
            └─ format.md     ← 用 skill://release-notes/references/format.md 读取
```

`skills/team/internal/SKILL.md` 这类嵌套不会被发现。确有分类需求时，把 `skills.customDirectories` 指向嵌套的上一层；自定义目录同样按 `*/SKILL.md` 扫描，不递归。

### SKILL.md 写法

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | 技能名，默认取目录名 |
| `description` | string | 一句话说明；原生的 `.omp` 来源要求必填，缺了技能不会被加载 |
| `globs`、`alwaysApply` | string[]、boolean | 仅作为元数据，不会自动触发技能 |
| `hide` | boolean | 不在系统提示里列出，仍可通过 `skill://` 和 `/skill:<名字>` 使用 |
| `disableModelInvocation` | boolean | `hide` 的标准写法 |
| `enabled` | boolean | 设为 `false` 时跳过该技能 |

保存为 `%USERPROFILE%\.omp\agent\skills\release-notes\SKILL.md`：

```markdown
---
name: release-notes
description: 从 git 历史生成发布说明。用户要求写 changelog 或发布说明时使用。
---

# Release notes

1. 运行 `git log --oneline <上一个标签>..HEAD`。
2. 按 feat / fix / chore 分组，输出 Markdown 列表。
```

### 模型怎么找到技能

启动时 omp 把所有技能的 `name` 和 `description` 放进系统提示（前提是会话里有能读 `skill://` 的工具，默认的 `read` 满足条件），正文留在磁盘上。模型判断相关时用 `read` 读取 `skill://<名字>` 拿到 `SKILL.md`，用 `skill://<名字>/<相对路径>` 读技能目录里的其他文件。绝对路径和 `..` 会被拒绝。

`skills.enableSkillCommands` 默认为 `true`，每个技能因此多一条斜杠命令：`/skill:release-notes 1.4.0`。命令后面带的内容作为参数附加在正文之后，正文里引用的相对路径以技能目录为基准。

同名技能冲突时，优先级高的保留裸名字，其余以 `<命名空间>/<名字>` 并存。`skills.ignoredSkills` 用于排除，`skills.includeSkills` 是白名单，都接受 glob。想装别人写好的技能，用 `omp skill install @alice/pdf-tools` 从 Skillshare 注册表（skills.omp.sh）安装，加 `-g` 装到用户级。

## 自定义斜杠命令

斜杠命令是一个 Markdown 文件，文件名就是命令名。项目里的 `.omp/commands/*.md` 优先于用户目录 `~/.omp/agent/commands/*.md`，两层都只扫描一层。

保存为 `%USERPROFILE%\.omp\agent\commands\triage.md`：

```markdown
---
description: 按严重程度整理最近的提交
argument-hint: "[commit-range]"
---
审查提交范围 $ARGUMENTS（没有参数时用 HEAD~5..HEAD）。
按阻塞、重要、可选三档列出问题，每条给出文件与行号。
```

之后输入 `/triage HEAD~10..HEAD` 即可。可用的占位符：

| 占位符 | 替换为 |
| --- | --- |
| `$1`、`$2` … | 第 N 个参数 |
| `$@`、`$ARGUMENTS` | 全部参数 |
| `$@[2]` | 从第 2 个参数到末尾 |
| `$@[2:3]` | 从第 2 个参数起取 3 个 |

参数按引号感知的方式切分，`"two words"` 算一个参数，不支持反斜杠转义。模板里完全没用到占位符时，参数会追加到展开结果的末尾。

frontmatter 认三个键：`description`（命令列表里的说明，缺省取正文第一行）、`argument-hint`（输入时的参数提示）、`side`。`side: true` 让命令以侧问方式运行，问答都不进入主对话，可以在回合进行中执行：

```markdown
---
description: Situation report for this session
argument-hint: "[focus]"
side: true
---
Situation report. Focus on $ARGUMENTS if given, else the whole session.
```

### 提示模板

提示模板放在 `prompts/` 目录，递归扫描 `**/*.md`：

- 用户级：`~/.omp/agent/prompts/`
- 项目级：`.omp/prompts/`

文件名（去掉 `.md`）就是调用名，输入 `/名字 参数` 时正文展开后发送。正文先做 `$1`、`$@`、`$ARGUMENTS` 替换，再按 Handlebars 渲染，所以也能用 `{{arguments}}` 取全部参数；`description` 取自 frontmatter，缺省取正文第一行。

和 `commands/*.md` 的区别：目录不同、可以嵌套子目录、没有 `side` 和 `argument-hint`；同名时命令优先。展开顺序是内置命令 → 扩展命令 → 自定义命令 → 文件斜杠命令 → 提示模板 → 发送。未知的 `/...` 不会被拒绝，会当作普通提示词发给模型。

## 钩子（Hooks）

钩子是在 agent 循环旁边运行的拦截器，适合统一的策略、脱敏、上下文裁剪和审计。模块默认导出一个函数，用 `pi.on(...)` 注册处理器。

### 放置位置

原生发现只扫两个子目录，扩展名支持 `.ts` 和 `.js`：

- 项目：`.omp/hooks/pre/*.ts`、`.omp/hooks/post/*.ts`
- 用户：`%USERPROFILE%\.omp\agent\hooks\pre\*.ts`、`...\hooks\post\*.ts`

直接放在 `hooks/` 下的文件不会被发现。目录名只用于去重，不会自动绑定事件，处理器仍要自己写 `pi.on(...)`。

### 最小示例

保存为 `%USERPROFILE%\.omp\agent\hooks\pre\guard.ts`：

```ts
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function hook(pi: HookAPI): void {
  pi.on("tool_call", async (event) => {
    const command = String(event.input.command ?? "");
    if (event.toolName === "bash" && command.includes("rm -rf")) {
      return { block: true, reason: "blocked by policy" };
    }
  });
}
```

重启 omp 后生效。任何处理器返回 `{ block: true }` 都会阻止这次工具调用，`reason` 成为模型看到的错误文本；处理器抛异常同样阻止执行（fail-closed）。

### 常用事件

| 事件 | 时机 | 可返回 |
| --- | --- | --- |
| `tool_call` | 工具执行前 | `{ block }`、`{ reason }`、`{ input }`、`{ additionalContext }` |
| `tool_result` | 工具执行后 | `{ content }`、`{ details }`、`{ isError }`、`{ additionalContext }` |
| `context` | 每次请求模型前 | `{ messages }` |
| `before_agent_start` | 一轮开始前 | `{ message }` |
| `turn_start`、`turn_end` | 单次迭代前后 | — |
| `session_start`、`session_shutdown` | 会话开始/结束 | — |
| `session_before_compact`、`session_compact` | 压缩前后 | `{ cancel }`、`{ compaction }` |
| `session.compacting` | 压缩过程中 | `{ context }`、`{ prompt }` |

`tool_result` 返回的 `content` 整段替换模型看到的结果，适合脱敏；`additionalContext` 不混进工具输出，而是作为可信说明单独送达。会话级的 `session_before_*` 返回 `{ cancel: true }` 可以中止切换、分支或压缩。

新功能建议直接用扩展 API：正常会话里 `hooks/pre|post/` 下的工厂也是通过扩展运行器绑定的，共享同一套事件名。

## MCP 服务器

MCP 服务器把外部服务的能力变成模型可调用的工具。omp 能读多个工具的 MCP 配置，推荐只用它自己的文件：

| 文件 | 作用域 |
| --- | --- |
| `.omp/mcp.json` | 项目级，按工作目录 |
| `~/.omp/agent/mcp.json` | 用户级 |
| `~/.omp/profiles/<名字>/agent/mcp.json` | 命名 profile 的用户级配置 |

项目级配置对所有 profile 生效，profile 只隔离用户级那一个文件。文件顶部加 `$schema` 可获得编辑器补全和校验。

### 配置示例

```json
{
  "$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\work\\projects"]
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${GITHUB_TOKEN}" }
    }
  }
}
```

`mcpServers` 下的每个键是一个服务器。有 `command` 是 stdio，有 `url` 是 http 或 sse（发现时会自动推断，建议仍显式写出 `type`）。stdio 可选 `args`、`env`、`cwd`；http/sse 可选 `headers`。Windows 路径在 JSON 里要写双反斜杠。`env` 和 `headers` 的值三种写法：`${VAR}` 在发现配置时展开；整段值正好是环境变量名时从环境读取；以 `!` 开头时用命令输出填充。

其余常用字段：`enabled` 为 `false` 时跳过该服务器；`timeout` 是请求超时毫秒数（`0` 关闭，缺省 30 秒）；`instructions` 控制是否把服务器自带说明放进系统提示（默认 `true`）；`auth`、`oauth` 是托管 OAuth 的凭据与客户端设置，通常由 `/mcp reauth` 自动维护。

用户级文件顶层还可以写 `disabledServers`（最高优先级黑名单）和 `enabledServers`（强制启用别处标了 `enabled: false` 的同名条目）。

### 检查状态

在 TUI 里用 `/mcp` 子命令：

| 命令 | 作用 |
| --- | --- |
| `/mcp add <名字> [--scope project\|user] [--url <url>] [-- <命令...>]` | 引导式添加服务器 |
| `/mcp list` | 列出服务器，并显示各自来自哪个配置文件 |
| `/mcp test <名字>` | 测试单个服务器能否连上 |
| `/mcp reload` | 重新发现配置并连接 |
| `/mcp reconnect <名字>` | 只重连一个服务器 |
| `/mcp enable <名字>`、`/mcp disable <名字>` | 开关单个服务器 |
| `/mcp reauth <名字>`、`/mcp unauth <名字>` | 重新授权或清除 OAuth 凭据 |

改完 JSON 后执行 `/mcp reload`，再用 `/mcp list` 确认来源文件对不对。连不上时先看 `/mcp test` 的输出：二进制或镜像是否存在、环境变量是否设置、URL 是否可达。

一个容易踩的坑：内置浏览器能力可用时（`browser.enabled` 默认为 `true`），omp 会在连接前丢弃 playwright、puppeteer 这类浏览器自动化 MCP 服务器，而且不报错。确实要用外部浏览器 MCP，就把 `browser.enabled` 设为 `false`。

## 自定义工具

自定义工具是模型可以直接调用的函数，和内置工具走同一条执行管线（内置工具和子代理见 [内置工具与子代理](./07-tools-and-subagents.md)）。它比技能重：技能是文字，工具是代码。

工具模块默认导出工厂函数，返回一个工具或数组。自动扫描认 `.ts` 和 `.js`：

- 项目：`.omp/tools/`，也认 `.omp/tools/<名字>/index.ts`
- 用户：`%USERPROFILE%\.omp\agent\tools\`

保存为 `%USERPROFILE%\.omp\agent\tools\repo-stats.ts`：

```ts
import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";

const factory: CustomToolFactory = (pi) => ({
  name: "repo_stats",
  label: "Repo Stats",
  description: "统计被 git 跟踪的 TypeScript 文件数量",
  parameters: pi.zod.object({ glob: pi.zod.string().optional() }),
  async execute(toolCallId, params, onUpdate, ctx, signal) {
    const result = await pi.exec("git", ["ls-files", params.glob ?? "**/*.ts"], {
      signal,
      cwd: pi.cwd,
    });
    if (result.code !== 0) throw new Error(result.stderr || "git ls-files failed");
    const files = result.stdout.split("\n").filter(Boolean);
    return {
      content: [{ type: "text", text: `Found ${files.length} files` }],
      details: { count: files.length },
    };
  },
});

export default factory;
```

要点：参数 schema 用 `pi.zod`（也可用 `pi.arktype`、`pi.typebox`）；`pi.exec` 执行子进程，把 `signal` 传下去才能被中断；`execute` 抛异常即工具失败，模型收到 `isError` 结果。工具名在会话里必须唯一，不能和内置工具重名。

`tools/` 里的 `.md`、`.json` 会被当作元数据，不会加载成工具；`.mjs`、`.cjs` 只支持显式路径或插件清单声明。新增文件后重启会话，工具才会出现在模型可用的列表里。

## 扩展（Extensions）

扩展是一个 TS/JS 模块，默认导出工厂函数，拿到 `ExtensionAPI`。它能把事件处理器、工具、命令、快捷键、渲染器放进同一个模块，也能注册 provider 和 CLI 标志。只有扩展能同时做到这些；钩子只做事件拦截，自定义工具只暴露一个函数，技能只是纯文本。

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("我的扩展已加载", "info");
  });
}
```

保存为 `%USERPROFILE%\.omp\agent\extensions\hello.ts`，重启 omp 后会看到通知。

### 从哪里加载

1. 原生目录：项目 `.omp/extensions/`、用户 `~/.omp/agent/extensions/`
2. `hooks/pre/`、`hooks/post/` 下发现的 TS/JS 钩子工厂
3. 已启用插件清单声明的入口（`package.json` 的 `omp.extensions`，旧字段 `pi.extensions`）
4. 显式配置：`omp --extension ./my-ext.ts`（`-e` 同义，`--hook` 也是别名），以及 `config.yml` 里的 `extensions:` 数组

路径指向目录时，解析顺序是 `package.json` 的 `omp.extensions` → `index.ts` → `index.js`。同一路径只加载一次，先出现的胜出。

加载期只能注册，不能调用运行时动作：模块顶层调用 `pi.sendMessage()` 会抛 `ExtensionRuntimeNotInitializedError`，发消息要写在事件或命令里；`pi.exec()` 在加载期可用。

关闭和限制：

```yaml
# ~/.omp/agent/config.yml
disabledExtensions:
  - extension-module:hello
```

`omp --no-extensions` 跳过自动发现，显式 `-e/--extension` 仍会加载；`omp --trusted-extension C:\abs\path\mod.ts` 只加载指定的绝对路径文件，可重复。停用名由路径推导：`hello.ts` 是 `hello`，`bar/index.ts` 是 `bar`；显式写出的文件路径不受这个过滤影响。

## 插件与市场

插件是打包好的目录，可以包含 skills、commands、agents、rules、hooks、tools、MCP 配置、LSP 配置等。市场是 Git 仓库、本地目录，或直接指向目录清单 JSON 的 URL；目录清单放在 `.omp-plugin/marketplace.json`（兼容 Claude Code 时用 `.claude-plugin/marketplace.json`）。插件用 `名字@市场` 标识。

### 在 TUI 里管理

| 命令 | 作用 |
| --- | --- |
| `/marketplace add <来源>` | 添加市场，例如 `anthropics/claude-plugins-official` |
| `/marketplace discover [市场]` | 浏览可安装插件 |
| `/marketplace install [--scope user\|project] 名字@市场` | 安装插件 |
| `/marketplace installed` | 列出已安装的市场插件 |
| `/marketplace uninstall [--scope user\|project] 名字@市场` | 卸载 |
| `/marketplace upgrade [名字@市场]` | 升级 |
| `/plugins list` | 列出 npm/链接安装和市场的全部插件 |
| `/plugins enable <插件>`、`/plugins disable <插件>` | 开关插件 |

### 在命令行里管理

```powershell
omp plugin marketplace add anthropics/claude-plugins-official
omp plugin install --scope project wordpress.com@claude-plugins-official
omp plugin list
omp plugin uninstall wordpress.com@claude-plugins-official
omp install ./my-ext
```

`omp install` 是 `plugin install` / `plugin link` 的别名，目标可以是本地路径、npm 包名或 `名字@市场`。`omp plugin` 的其他动作还有 `doctor`、`features`、`config`、`enable`、`disable`、`discover`、`upgrade`。

作用域：`user` 是默认值，记录在 `~/.omp/plugins/installed_plugins.json`，所有项目可用；`project` 记录在最近的 `.omp/`（没有时用最近的 Git 根目录）下的 `plugins/installed_plugins.json`，只对当前项目生效。项目级安装会遮蔽同名的用户级安装。缓存和软链接由 omp 维护在 `~/.omp/plugins/` 下，不需要手动复制文件。

### 安装之后

`/plugins enable` 和 `/plugins disable` 会立即刷新当前会话的任务代理、技能、斜杠命令和 MCP 服务器。其他市场操作只改磁盘状态，需要执行 `/reload-plugins`（重载插件）刷新这些内容；新安装的非 MCP 工具、钩子和扩展模块要重启会话才生效。

## 相关文档

- [Skills](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/skills.md)
- [Slash command internals](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/slash-command-internals.md)
- [Hooks](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/hooks.md)
- [Authoring Hooks](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/skills/authoring-hooks.md)
- [MCP configuration in OMP](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/mcp-config.md)
- [MCP runtime lifecycle](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/mcp-runtime-lifecycle.md)
- [Custom Tools](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/custom-tools.md)
- [Extensions](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/extensions.md)
- [Extension Loading (TypeScript/JavaScript Modules)](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/extension-loading.md)
- [Authoring Extensions](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/skills/authoring-extensions.md)
- [Marketplace plugin system](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/marketplace.md)
- [Configuration Discovery and Resolution](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/config-usage.md)
