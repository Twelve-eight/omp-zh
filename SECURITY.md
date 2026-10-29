# 安全策略

## 支持的版本

只维护最新发布的版本。旧版本的问题请先升级到 [最新版](https://github.com/Twelve-eight/omp-zh/releases/latest) 再确认。

## 报告漏洞

请不要在公开 issue 中报告安全问题。通过 GitHub 的 [私密安全报告](https://github.com/Twelve-eight/omp-zh/security/advisories/new) 提交，写明受影响的版本、复现步骤和可能的影响。

先判断问题出在哪一边：

- **omp-zh 引入的问题**：构建产物与官方版不一致导致的风险，例如补丁或翻译改变了权限、审批、网络请求等行为，或者构建、下载、校验、安装脚本存在缺陷。请报告到本仓库。
- **omp 本身的问题**：官方版同样存在的漏洞，请按 [上游安全策略](https://github.com/can1357/oh-my-pi/security/policy) 报告给上游。

## 构建产物的可信性

- 每个 Release 附带 `SHA256SUMS.txt`。下载后请用 `Get-FileHash <文件> -Algorithm SHA256` 核对。
- 构建只使用官方发布的 exe，期望摘要只取自官方 Releases，不信任镜像提供的摘要（见 `scripts/fetch-upstream.js`）。
- 构建是确定性的：用本仓库对应标签的源码和同一个官方 exe，可以构建出与 Release 逐字节相同的文件。
- 发布的 exe 没有代码签名。官方 Windows 版同样未签名，首次运行时 Windows SmartScreen 可能提示。
