# 常见问题

本章收集使用 omp 和 omp-zh 时常见的问题。每条都给出原因和处理方法，细节链接到前面各章或上游文档。

## 安装与运行

### 运行 `omp` 提示“不是内部或外部命令”

exe 所在目录不在 `PATH` 中，或者改了 `PATH` 之后没有重开终端窗口。按 [第一章](./01-getting-started.md) 把目录加入用户 `PATH`，再打开一个新窗口。

### Windows 提示“已保护你的电脑”

omp 与 omp-zh 的 exe 都没有代码签名，首次运行时 SmartScreen 可能拦截。先用 `Get-FileHash` 核对 `SHA256SUMS.txt`，确认文件来自 Releases，再选择“仍要运行”。

### 在用户主目录启动后，工作目录变成了临时目录

在 `~`（`%USERPROFILE%`）下启动时，omp 默认自动切换到临时目录（`--allow-home` 的说明：“Allow starting in ~ without auto-switching to a temp dir”）。请先 `cd` 到项目目录再启动；确实要在主目录工作时加 `--allow-home`。

### 替换 exe 时提示文件正在使用

Windows 不允许覆盖正在运行的 exe。退出所有 omp 会话后再替换。omp 的后台进程也来自同一个 exe，可以在任务管理器里确认没有残留的 `omp.exe`。

## 界面

### 汉化版界面里还有英文

有三种情况：

- 发给模型的文字、设置项的取值、命令名和产品名保持英文，这是有意的，原因见 [第九章](./09-omp-zh.md)。
- 上游新版本新增的文字还没翻译。
- 双语格式本身就保留英文原文，例如 `继续上一个会话/Continue previous session`。

如果是界面上的说明文字没有翻译，欢迎 [提交翻译问题](https://github.com/Twelve-eight/omp-zh/issues/new?template=translation.yml)。

### 图标显示为方块或问号

终端字体缺少相应字符。可以把 `symbolPreset` 设为 `ascii`；装了 Nerd Font 并在终端中启用后，可以设为 `nerd`。默认值是 `unicode`。设置方法见 [第五章](./05-config-and-context.md)。

### 在 Windows Terminal 里粘贴图片没有反应

Windows Terminal 可能先处理了 `Ctrl+V`，omp 收不到按键。改用 `Alt+V` 粘贴剪贴板中的图片。

## 模型与登录

### 已经登录，但模型选择器里看不到某个提供商的模型

依次检查：

1. 该提供商有凭据：`/login <provider>`、环境变量，或 `models.yml` 中的 `apiKey`。
2. 它的 ID 不在生效的 `disabledProviders` 列表里。项目 `.omp/config.yml` 中的这个列表会整体替换全局设置，不会合并。可以用 `omp config get disabledProviders` 查看合并后的值。
3. 本地模型服务（Ollama、LM Studio 等）正在运行。

### 用的不是我想要的 API 密钥

密钥按固定顺序解析：命令行 `--api-key`、`models.yml` 中的密钥、OAuth、`/login` 保存的密钥、扩展提供的配置、环境变量或 `.env`、其他已存的密钥。进程环境变量优先于所有 `.env` 文件。出现意外的密钥时，先检查是否在系统环境变量里设过同名变量。完整顺序见 [第二章](./02-models-and-providers.md)。

### 自定义的 `models.yml` 提供商没有加载

YAML 或字段错误会让整个自定义文件被跳过。运行 `omp models` 检查，用 `omp models find <关键字>` 缩小到某个提供商。自带模型列表的提供商需要 `baseUrl`、认证（`apiKey`，或 `auth: none`、`auth: oauth`），以及 `api` 字段。

### 怎样退出登录

在 omp 里输入 `/logout`，选择要删除凭据的提供商。

### 网络需要代理

用 `PI_PROXY` 环境变量指定代理。它作用于整个进程，登录、OAuth 刷新、模型发现等请求也会经过代理。在启动 omp 的终端中设置：

```powershell
$env:PI_PROXY = "http://127.0.0.1:<端口>"
omp
```

也支持 `PI_PROXY_<提供商 ID>`（只作用于该提供商的模型请求）、`HTTPS_PROXY`、`HTTP_PROXY` 和 `ALL_PROXY`，优先级依次降低。本机地址、内网地址和 `NO_PROXY` 中列出的地址始终直连，本地模型服务和 MCP 服务不受影响。

## omp-zh 专有问题

### 运行 `omp update` 之后界面变回了英文

`omp update` 从官方服务器下载英文版并替换当前文件。重新从 Releases 下载 omp-zh 即可，配置和会话不受影响。以后更新请走 Releases，见 [第九章](./09-omp-zh.md)。

### omp-zh 什么时候跟进上游新版本

上游发版后需要迁移补丁、补齐翻译并通过全部检查才会发布。在本仓库页面点 Watch → Custom → Releases 可以收到新版本通知。等待期间可以先用官方版，两者数据互通。

### 某个问题是汉化版引起的吗

用同版本的官方 omp 运行同样的操作。官方版也有的问题与汉化无关，请提交到 [上游](https://github.com/can1357/oh-my-pi/issues)；只在 omp-zh 出现的问题请提交到 [本仓库](https://github.com/Twelve-eight/omp-zh/issues/new/choose)。

### Python 代码在 `eval` 中卡住不动

omp-zh 让 Python 内核在 Windows 上始终隐藏窗口。上游说明，没有控制台的内核在加载部分原生模块时可能卡住，也收不到中断信号。用官方版运行同样的代码对照；只有 omp-zh 卡住时请反馈。

## 排查与日志

### 日志在哪里

`%USERPROFILE%\.omp\logs\omp.<日期>.<进程号>.log`。日志不会输出到终端，以免打乱界面。用环境变量 `OMP_LOG_LEVEL` 可以把级别限制为 `error`、`warn`、`info` 或 `debug`，默认记录全部级别。

### 怎样收集问题报告

在 omp 中输入 `/debug`，它提供调试、报告和性能分析工具。提交问题前，请从日志和报告中删去密钥、路径等个人信息。

## 相关文档

- [Providers：Troubleshooting](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/providers.md#troubleshooting)
- [Environment variables](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/environment-variables.md)
- [Settings](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/settings.md)
- [Keybindings](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/keybindings.md)
- [CLI reference](https://github.com/can1357/oh-my-pi/blob/v18.13.3/docs/cli-reference.md)
