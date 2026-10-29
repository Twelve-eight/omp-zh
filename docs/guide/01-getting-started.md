# 安装与第一次使用

本章讲三件事：在 Windows 上安装 omp-zh（非官方汉化版），完成第一次登录，然后跑通第一次对话。安装、更新、卸载都在这里讲完，具体功能留给后面各章。

## omp 是什么

omp（Oh My Pi）是一个把 IDE 能力接进来的编程代理（coding agent），是 Pi 的分叉。它的核心约 8 万行 Rust，内置 31 个工具，支持 60 多个模型提供商，macOS、Linux、Windows 都能运行。

命令名是 `omp`。不带参数启动时进入交互界面（TUI），在哪个目录启动，就把哪个目录当作工作区。

## omp-zh 是什么

omp-zh 是非官方汉化构建：取官方 Windows 二进制，把面向用户的文本替换成 `中文/English` 双语，再打上少量行为补丁。

它和官方版共用同一个数据目录 `~/.omp`（Windows 上是 `%USERPROFILE%\.omp`），所以配置、会话、技能都通用，两个版本可以随时互换。汉化范围与行为补丁的细节见 [omp-zh 说明](./09-omp-zh.md)。

## 安装 omp-zh

omp-zh 只发布 Windows x64 构建。到 Releases 页面下载两个文件：

https://github.com/Twelve-eight/omp-zh/releases/latest

| 文件 | 用途 |
| --- | --- |
| `omp-zh-18133.exe` | 汉化版可执行文件，`18133` 对应上游 18.13.3 |
| `SHA256SUMS.txt` | 校验和清单 |

文件名形如 `omp-zh-<上游版本号>.exe`，版本号随上游更新变化。

### 校验下载结果

在下载目录打开 PowerShell，计算 SHA256：

```powershell
Get-FileHash .\omp-zh-18133.exe -Algorithm SHA256
```

把输出里的 `Hash` 与 `SHA256SUMS.txt` 中同一文件名的十六进制串逐字符比对。不一致就不要运行，重新下载。

### 改名并加入 PATH

omp-zh 的 exe 可以直接当 `omp` 用。把它改名成 `omp.exe`，放进一个已在 `PATH` 里的目录，本章和后面各章的命令都写作 `omp`。保留 `omp-zh.exe` 这个名字也能运行，只是命令要相应改写。

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\bin" | Out-Null
Move-Item .\omp-zh-18133.exe "$env:USERPROFILE\bin\omp.exe"

# 只对当前窗口生效，先确认能运行
$env:Path = "$env:USERPROFILE\bin;$env:Path"
omp --version
```

`omp --version`（或 `-v`）打印已安装的版本后退出。要长期生效，把 `%USERPROFILE%\bin` 加入用户的 `PATH` 环境变量，然后开一个新窗口。

### 与官方版共存

omp-zh 和官方构建读写同一份 `%USERPROFILE%\.omp` 数据。先用官方版登录过，换到 omp-zh 不用重新登录；反过来也一样。两个版本可以同时留在磁盘上，但不要指望它们有各自独立的配置。

## 官方安装方式

想用英文原版，按上游 README 的方式安装：

```sh
# macOS / Linux
curl -fsSL https://omp.sh/install | sh

# Homebrew
brew install can1357/tap/omp

# Bun（推荐）
bun install -g @oh-my-pi/pi-coding-agent

# Nix
nix profile add github:can1357/oh-my-pi

# mise
mise use -g github:can1357/oh-my-pi
```

```powershell
# Windows（PowerShell）
irm https://omp.sh/install.ps1 | iex
```

需要固定版本时给安装脚本加参数 `--binary --ref v<version>`：

```sh
curl -fsSL https://omp.sh/install | sh -s -- --binary --ref v<version>
```

只写 `--ref` 会改成从源码安装，不再下载预编译二进制。PowerShell 用 `& ([scriptblock]::Create((irm https://omp.sh/install.ps1))) -Binary -Ref v<version>`。

### Shell 补全

`omp` 自己生成补全脚本，支持 bash、zsh、fish：

```sh
# zsh，写进 ~/.zshrc
eval "$(omp completions zsh)"

# bash，写进 ~/.bashrc
eval "$(omp completions bash)"

# fish
omp completions fish > ~/.config/fish/completions/omp.fish
```

`omp completions` 的 `SHELL` 参数只接受这三个值，PowerShell 没有对应的补全脚本。

## 第一次运行

在项目目录里启动：

```powershell
cd <你的项目目录>
omp
```

启动后进入交互界面，当前目录就是工作区。

不要在用户主目录里直接启动：omp 默认会切到一个临时目录，只有加 `--allow-home` 才允许以 `~` 为工作区。

还没有任何凭据时，omp 会提示你运行 `/login` 或设置对应提供商的环境变量。下面两条路选一条即可。

### 方式一：在界面里登录

在输入框输入：

```text
/login
```

会弹出「选择要登录的提供商（Select provider to login）」，选中后按提示在浏览器完成授权。已知提供商时可以直接跳过选择：

```text
/login anthropic
```

需要粘贴回调地址的 OAuth 流程，用 `/login <redirect-url>` 把流程补完。登录成功后凭据保存在本机，下次启动不用再登。

终端里也能登录，不必先进界面：

```powershell
omp login
omp login anthropic
```

### 方式二：用环境变量给密钥

已经有 API 密钥时，先放进环境变量再启动：

```powershell
$env:ANTHROPIC_API_KEY = "<your-api-key>"
omp
```

常用变量：

| 提供商 | 环境变量 |
| --- | --- |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Groq | `GROQ_API_KEY` |
| xAI | `XAI_API_KEY` |

上面的写法只影响当前 PowerShell 窗口。要长期保存，用 Windows 的“环境变量”设置写入用户变量。

也可以写进 `.env` 文件。omp 依次读取 `<项目>/.env`、`%USERPROFILE%\.omp\agent\.env`、`%USERPROFILE%\.omp\.env` 和 `%USERPROFILE%\.env`，先出现的非空值生效：

```dotenv
ANTHROPIC_API_KEY=<your-api-key>
```

提供商、凭据优先级、`models.yml` 自定义提供商和模型角色都在 [模型与提供商](./02-models-and-providers.md) 里讲。

### 选模型

启动时用默认模型。想临时换一个，用 `--model`：

```powershell
omp --model opus
```

进入界面后，`/model` 打开模型选择器。思考层级、模型角色等内容见 [模型与提供商](./02-models-and-providers.md)。

## 第一次对话

在输入框里写清楚要做什么，按 `Enter` 发送：

```text
读一下 src/main.ts，告诉我入口做了什么
```

模型开始流式回复，并自行调用工具完成任务：

| 工具 | 作用 |
| --- | --- |
| `read` | 读取文件内容 |
| `grep`、`glob` | 按内容或文件名查找 |
| `edit`、`write` | 修改或新建文件 |
| `bash` | 执行 shell 命令 |
| `todo` | 维护任务清单 |

`python` 工具需要先运行 `omp setup python` 安装依赖。

每次工具调用都会显示在对话里，能看到改了哪些文件、命令输出了什么。`Ctrl+O` 展开工具输出，`Ctrl+Shift+O` 显示或隐藏工具活动。

默认审批模式是 `yolo`，所有工具调用自动批准，不再逐个询问。想让 omp 在执行命令前先询问，启动时加 `--approval-mode write`；要连写文件也询问，用 `--approval-mode always-ask`。审批模式也可以写进 `tools.approvalMode` 设置，完整说明见 [配置与项目上下文](./05-config-and-context.md)。

### 中断与排队

`Esc` 中断当前操作，包括正在生成的回复和正在运行的工具。

回复还在生成时，`Ctrl+Q`（或 `Ctrl+Enter`）把新消息排进队列，等这一轮结束再发送，不用等它写完。`Alt+Up` 把排队中的消息取回输入框。

### 退出

| 操作 | 效果 |
| --- | --- |
| `/quit`（别名 `/q`） | 退出应用（Quit the application） |
| `/exit` | 退出应用程序（Exit the application） |
| `Ctrl+D` | 输入框为空时退出应用；输入框有内容时是向前删除字符 |
| 连按两次 `Ctrl+C` | 退出应用 |

只按一次 `Ctrl+C` 是清空当前草稿，不是退出；草稿清空后按 `Up` 可以找回。

会话默认自动保存。下次在同一个目录运行 `omp --continue`（或 `-c`）继续上一次会话；会话的恢复、分支和导出见 [会话与分支](./04-sessions.md)。

## 更新

`omp update` 检查并安装更新：

| 参数 | 作用 |
| --- | --- |
| （无参数） | 更新到最新版本 |
| `-c`, `--check` | 只检查，不安装 |
| `-f`, `--force` | 强制重装 |
| `-l`, `--plugins` | 更新已安装的插件 |
| `--canary` | 切换到 canary 通道并更新 |
| `--stable` | 切回 stable 通道并更新 |

对独立 exe 安装，`omp update` 从官方构建服务下载对应平台的构建，替换 `PATH` 上那个可执行文件本身。

**因此在 omp-zh 的 exe 上，一旦 `omp update` 真的安装了更新，就会把它换成官方英文构建，汉化不会保留。** 已经是最新版本时它只打印 `Already up to date`，不改动文件；`--force` 会强制重装。omp-zh 的更新走 Releases：

```powershell
# 1. 从 Releases 下载新的 omp-zh-<版本号>.exe 与 SHA256SUMS.txt
# 2. 校验
Get-FileHash .\omp-zh-<版本号>.exe -Algorithm SHA256

# 3. 替换旧文件，保持 omp.exe 这个名字
Move-Item .\omp-zh-<版本号>.exe "$env:USERPROFILE\bin\omp.exe" -Force
```

手动替换时 omp 不能正在运行，否则 Windows 不允许覆盖正在使用的 exe。

## 卸载

卸载分两步：删程序，再决定要不要删数据。

程序就是那个 exe。`%USERPROFILE%\bin` 如果只放了这个 exe，可以连目录一起删；否则只删 exe：

```powershell
Remove-Item "$env:USERPROFILE\bin\omp.exe"
```

数据在 `%USERPROFILE%\.omp`：

| 路径 | 内容 |
| --- | --- |
| `agent\config.yml` | 全局设置 |
| `agent\agent.db` | 登录凭据与 API 密钥 |
| `agent\sessions\` | 会话记录（`.jsonl`） |
| `agent\blobs\` | 会话引用的大对象 |
| `agent\models.yml` | 自定义提供商与模型 |
| `agent\keybindings.yml` | 自定义快捷键 |
| `agent\approval-cache.db` | 审批授权缓存 |
| `.env` | 环境变量文件 |

命名 profile 的数据在 `%USERPROFILE%\.omp\profiles\<name>\agent` 下。项目内的 `<项目>\.omp\` 属于项目自己，删不删由项目决定。

只想确认数据目录在哪，运行：

```powershell
omp config path
```

它打印当前生效的 agent 目录。删掉 `%USERPROFILE%\.omp` 会连同会话和凭据一起清掉，两个版本都会受影响。

## 相关文档

- https://github.com/can1357/oh-my-pi/blob/v18.13.3/README.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/providers.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/keybindings.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/approval-mode.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/cli-reference.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/session.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/settings.md
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/config-usage.md
