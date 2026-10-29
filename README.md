# omp-zh

[![CI](https://github.com/Twelve-eight/omp-zh/actions/workflows/ci.yml/badge.svg)](https://github.com/Twelve-eight/omp-zh/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Twelve-eight/omp-zh?label=release)](https://github.com/Twelve-eight/omp-zh/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Oh My Pi](https://github.com/can1357/oh-my-pi)（`omp`）的非官方简体中文版，面向 Windows。

omp 是一个在终端里运行的编程代理（coding agent）。omp-zh 用官方发布的 Windows 可执行文件重新打包：界面文字改为「中文/English」双语对照，另加几处针对 Windows 的行为修正。功能、配置格式和数据目录与官方版一致。

> 本项目与 omp 官方没有关联。汉化版自身的问题请在本仓库提交；官方英文版也能复现的问题请提交到[上游](https://github.com/can1357/oh-my-pi/issues)。

## 安装

1. 从 [Releases](https://github.com/Twelve-eight/omp-zh/releases/latest) 下载 `omp-zh-<版本>.exe` 和 `SHA256SUMS.txt`。
2. 校验文件，输出的哈希应与 `SHA256SUMS.txt` 中的一致：

   ```powershell
   Get-FileHash .\omp-zh-18133.exe -Algorithm SHA256
   ```

3. 改名为 `omp.exe`，放进 `PATH` 中的任意目录，然后在项目目录里运行 `omp`。

omp-zh 与官方版共用 `%USERPROFILE%\.omp`，配置、会话和技能可以直接沿用，两者随时可以互换。目前只发布 Windows x64 版本。

不要用 `omp update` 更新汉化版：它会下载官方英文版并覆盖当前文件。新版本请从 Releases 下载。

## 文档

- [使用教程](docs/guide/README.md)：从安装、登录模型到会话、配置、扩展和自动化，共十章。
- [汉化版说明](docs/guide/09-omp-zh.md)：翻译范围、行为补丁、与官方版的差异。
- [常见问题](docs/guide/10-faq.md)

## 与官方版的差异

| 方面 | 内容 |
|---|---|
| 界面文字 | CLI 帮助、TUI、设置界面、斜杠命令说明、登录向导等约 3700 条文字双语显示。 |
| 保持英文 | 发给模型的文字（系统提示、工具说明、工具结果）、代码里用来比较的字符串、HTTP 头和对象键。翻译它们会改变程序行为。 |
| 行为补丁 | 子进程不再弹出或借用控制台窗口；自动续跑与重试不在固定次数后放弃；部分网关的加密推理错误按可重试处理；OpenAI 兼容端点不再强制 `tool_choice`（DeepSeek 推理模型经第三方网关时会因此返回 400）。详见 [docs/patches.md](docs/patches.md)。 |
| 未改动 | 模型调用、权限与审批、会话格式、配置格式、网络请求。 |

## 从源码构建

需要 Node.js 20 或更高版本，以及 `curl`。只能构建 `patches/` 下已有补丁集的上游版本。

```powershell
git clone https://github.com/Twelve-eight/omp-zh.git
cd omp-zh
node scripts/fetch-upstream.js 18.13.3   # 下载官方 exe 并校验官方摘要
node build.js 18.13.3                    # 输出 work/omp-zh-18133.exe
node verify.js 18.13.3                   # 运行该版本的全部检查
```

同一份源码与同一个官方 exe 构建出的文件逐字节相同，可以和 Releases 中的哈希直接比对。

适配上游新版本的步骤见 [docs/updating.md](docs/updating.md)，代码结构见 [docs/architecture.md](docs/architecture.md)。

## 参与

欢迎提交错译、漏译和术语问题，也欢迎补丁与工具改进。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [字典规则](docs/dictionary.md)。

## 许可

[MIT](LICENSE)。omp 的版权归上游作者所有，汉化部分同样以 MIT 发布。
