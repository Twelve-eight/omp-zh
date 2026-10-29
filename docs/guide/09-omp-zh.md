# omp-zh 与官方版的差异

本章说明 omp-zh 改了什么、没改什么，以及在两个版本之间切换时要注意的事。安装步骤见 [第一章](./01-getting-started.md)。

## 构建方式

omp-zh 不从源码编译。每个版本都取官方发布的 `omp-windows-x64.exe`，校验官方摘要后读出其中打包的 JavaScript 模块，改写一部分字符串和少量代码，再按原格式写回。因此：

- 版本号与上游一一对应，`omp --version` 输出的就是上游版本号，例如 `omp/18.13.3`。
- 只有 Windows x64 版本。
- 上游发版后，汉化版要等补丁迁移、补译和检查完成才会发布。
- 同样的输入构建出逐字节相同的文件，任何人都可以用本仓库的源码复现 Releases 中的 exe。

## 翻译了什么

界面上给人看的文字改为「中文/English」双语，例如：

```text
标志/FLAGS
  -c, --continue    继续上一个会话/Continue previous session
```

覆盖范围：

| 位置 | 示例 |
|---|---|
| 命令行帮助 | `omp --help` 与各子命令的 `--help` |
| 交互界面 | 状态行、提示条、确认框、选择器标题、按键提示 |
| 设置界面 | `/settings` 中的分组、设置名、说明与选项标签 |
| 斜杠命令 | 输入 `/` 时列出的命令说明 |
| 登录向导 | 各提供商的登录提示与错误信息 |
| 模型与会话选择器 | `/model`、`/resume`、`/tree` 中的标签和提示 |

双语格式让你能直接把英文原文拿去搜索上游文档或 issue。

## 保持英文的部分

下面这些文字在 omp-zh 中仍是英文，这是有意为之：

- **发给模型的文字**：系统提示、工具说明、工具返回给模型的结果、提示词模板。翻译它们会改变模型的行为，有些输出还要被程序按原文解析。
- **代码使用的值**：设置项的取值（`auto`、`off`、`high` 等）、枚举值、HTTP 头名、模型名、提供商 ID。这些值在代码里参与比较，翻译后对应的功能会失效。
- **产品名和协议名**：Bash、LSP、MCP、Amazon S3 等。
- **日志**：`%USERPROFILE%\.omp\logs\` 下的日志保持英文，便于对照上游排查。
- **尚未翻译的新文字**：上游每个版本都会新增文字，汉化版会逐步补齐。看到英文界面文字时欢迎 [提交翻译问题](https://github.com/Twelve-eight/omp-zh/issues/new?template=translation.yml)。

所以，在 omp-zh 里输入的命令、设置键和配置文件内容都与官方版完全相同，官方文档可以直接照用。

## 行为补丁

omp-zh 另外修改了几处程序行为，主要针对 Windows 和第三方 API 网关：

| 改动 | 效果 |
|---|---|
| 子进程隐藏窗口 | 后台进程（隧道、浏览器、Python 内核等）不再借用 omp 的控制台，输出不会盖在界面上，也不会出现在另一个 omp 窗口里。 |
| 自动恢复不设次数上限 | 模型空回复、意外停止、子代理没有交付结果时，自动提醒与重试不会在 3 次或 8 次后放弃。按 `Esc` 中断仍然立即生效。 |
| 加密推理错误可重试 | 部分网关返回 “encrypted content could not be verified” 时，按可重试错误处理并重置会话状态。 |
| 不强制 `tool_choice` | 通过 OpenAI 兼容接口调用时不发送强制工具选择，避免 DeepSeek 等推理模型经第三方网关时返回 400。 |
| 会话记录用量显示 | 恢复会话时，被中断那一轮的用量和耗时照常显示。 |

每处补丁对应的上游源码与原因见 [docs/patches.md](../patches.md)。

一个已知取舍：Python 内核始终隐藏窗口。上游说明这在少数情况下会让加载 NumPy 等原生模块的内核卡住，或收不到中断信号。遇到 `eval` 中 Python 代码无故卡住时，请用官方版对照一次并反馈。

## 与官方版共用数据

两个版本读写同一个 `%USERPROFILE%\.omp`：登录凭据、`config.yml`、`models.yml`、会话、技能、插件全部共用。因此：

- 从官方版换到 omp-zh，或者反过来，都不需要重新配置。
- 两个版本可以同时运行。设置在保存前会重新读取 `config.yml`，另一个进程改过的其他设置会保留；两边改了同一项时，后保存的一方跳过这一项并写一条警告日志。
- 会话文件格式相同，一个版本创建的会话可以在另一个版本中继续。

想让 omp-zh 使用完全独立的配置，可以启动时加 `--profile <名字>`，详见 [第五章](./05-config-and-context.md)。

## 更新

不要对 omp-zh 运行 `omp update`。它从官方服务器下载英文版，并覆盖当前的 exe。

更新步骤：

1. 在 [Releases](https://github.com/Twelve-eight/omp-zh/releases) 下载新的 `omp-zh-<版本>.exe` 和 `SHA256SUMS.txt`。
2. 用 `Get-FileHash` 校验。
3. 退出所有 omp 会话，用新文件替换旧的 `omp.exe`。

在本仓库页面点 Watch → Custom → Releases，有新版本时会收到通知。

## 换回官方版

用官方安装方式（见 [第一章](./01-getting-started.md)）安装后，删除或替换 omp-zh 的 exe 即可。数据无需迁移。

## 反馈问题

先用同版本的官方 omp 复现一次：

- 官方版也有的问题，提交到 [上游](https://github.com/can1357/oh-my-pi/issues)。
- 只在 omp-zh 中出现的问题，提交到 [本仓库](https://github.com/Twelve-eight/omp-zh/issues/new/choose)，附上 `omp --version` 的输出和复现步骤。

## 相关文档

- [docs/patches.md](../patches.md)：行为补丁的源码位置与原因
- [docs/dictionary.md](../dictionary.md)：翻译规则与术语表
- [docs/architecture.md](../architecture.md)：构建原理
- [上游 README](https://github.com/can1357/oh-my-pi/blob/v18.13.3/README.md)
