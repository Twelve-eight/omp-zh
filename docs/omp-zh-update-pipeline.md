# omp 上游更新自动汉化管线（omp-zh auto-update pipeline）

项目目录：`G:\omp works\omp-zh\`（脚本/字典在根，中间产物在 `work\`，文档在 `docs\`）

## 管线组成

```
update-zh.js      ← 主控（检测→下载→提取→补丁→差异→构建→验证→交付）
extract-cli.js    提取 exe 的 .bun 模块 0（cli.js）+ Web UI 资产模块（mod2..N → work/mod*）
patch-zh.js       对官方 cli.js 应用确定性汉化补丁（幂等；17.4.0 起仅 catalog compat）
web-translate.js  Web UI 模块汉化（mod3/4 HTML 属性/文本节点模式；mod5 字面量级）
scan-gaps.js      新英文文本发现器（未命中清单+死条目）     [node scan-gaps.js <cli.js> dict*.json...]
deep-scan.js      深度扫描（work/ 内）：UI 键位 + showStatus 调用点 + Web 模块文本
build-zh.js       合并字典→翻译 cli+Web→重建 exe→交付      [参数化: --src/--cli/--dst/--deliver 或 OMP_* 环境变量]
verify-zh.js      翻译产物验证（字面量一致/未闭合/括号/CJK）[node verify-zh.js <orig> <zh>]
rebuild.js        模块图重建（newContents 数组按索引替换任意模块）
translate.js      翻译引擎 v6（未改动）
dict-*.json       9 个字典（17.4.0 补译已并入，共 333+ 条新增）
```

## 使用方式

### 日常检查（是否有新版本）
```
node update-zh.js --check-only
```

### 自动更新 + 汉化 + 交付（无新版本时直接退出）
```
node update-zh.js
```
流程：GitHub latest tag vs 本地 `omp.exe --version` → 相同则退出；不同则下载 `omp-windows-x64.exe`（curl，断点续传）→ SHA256SUMS 校验 → 提取 → patch → 差异扫描 → build → verify → 冒烟（--version 含新版本号、--help 含 CJK）→ 交付 `G:\omp\omp-zh.exe`。

### 手动下载复用（网络慢时）
把新版本 exe 放到 `~\AppData\Local\Temp\omp-dl.exe`，管线检测到且 SHA256 匹配即跳过下载。SHA256SUMS.txt 可放同目录（否则管线只下载这个小文件）。

### 其他参数
```
node update-zh.js --force        # 忽略版本比较，强制处理（重跑当前版本）
node update-zh.js --no-deliver   # 只构建到 Temp\omp-zh.exe，不替换 G:\omp\omp-zh.exe
```

## 新增版本时的补译工作流（唯一需人工的环节）

1. 跑一次 `node update-zh.js --force --no-deliver`，产出 `gaps-<ver>.txt`（未命中句子型清单 + 死条目）
2. 看 `UNTRANSLATED_COUNT` 与清单：大多数是内嵌提示词/工具文档（可不翻）；真正的新 UI 文本（帮助/设置/TUI 命令）筛选出来
3. 补译：新条目加入对应 dict 文件（from 必须与源码字面量**逐字符一致**；整句用 full，片段用 sub；to 用「中文/原文」双语格式）
4. 重跑 `node update-zh.js --force`（无 --no-deliver 则交付）

死条目（字典中已不匹配的条目）清理：scan-gaps 输出的 dead entries 逐条确认后从字典删除。

## 汉化补丁（patch-zh.js 固化，上游更新后自动重放）

| 补丁 | 内容 | 失效后果（patch WARN 时） |
|---|---|---|
| catalog max | opencode-go/deepseek-v4-flash efforts 加 "max" | 设置里开不到 max |
| catalog compat | 同模型 `supportsForcedToolChoice:false` | 计划模式 tool_choice 400 回退 |
| focus | showTreeSelector finally 恢复 editor 焦点 | /tree 切换偶发焦点丢失 |

补丁基于精确文本锚点；上游改了结构会 WARN（管线继续，但需人工检查补丁是否仍适用）。补丁幂等：每次从官方 exe 重新提取再打，不重复累积。

## 验证体系（管线内置，防坏 JS）

1. `verify-zh.js`：字面量数一致性（翻译破坏了引号配对会 MISMATCH）、未闭合字符串/模板检测、括号平衡、CJK 增量统计
2. 冒烟：`omp-zh.exe --version` 含新版本号 + `--help` 含 ≥20 个 CJK 字符
3. sha256 校验下载文件（SHA256SUMS.txt 对照）

## 维护注意点

- **交付被占用**：build-zh.js 的 copy 失败仅打日志（G:\omp\omp-zh.exe 被运行中会话占用时）；此时重启汉化版后再跑一次即可
- **版本记录**：`.omp-zh-last-version` 文件记录上次处理版本（供追溯）
- **字典版本漂移**：dict 生成脚本（gen-*.js）输入仍指向 v17.2.11 的 cli.js——新增文本用 scan-gaps 发现即可，旧生成脚本仅作候选辅助
- **源码构建路线（可选，未纳入管线）**：上游 can1357/oh-my-pi 支持 Windows 本地源码构建（bun≥1.3.14 + npm 预编译 addon leaf `@oh-my-pi/pi-natives-win32-x64@<ver>` → `bun run ci:release:build-binaries --targets win32-x64`）。若未来要"源码级汉化"（翻译提示词等 exe 级翻不到的文本）再启用；当前 exe 级管线已覆盖字典目标面（命中率 99.5%）

## 端到端验证记录（2026-08-10）

```
node update-zh.js --force --no-deliver
→ reuse omp-dl.exe (sha256 c21a8921…) → extract → patch OK(2) → gaps 10536
→ build → verify-zh PASS → smoke OK (omp/17.2.12, helpCJK=1563)
→ 交付：G:\omp\omp-zh.exe --version → omp/17.2.12 ✓
```

## 17.4.0 大版本更新记录（2026-08-21）

- **补丁重构**：efforts max 上游原生支持（删除）；focus 上游修复（删除）；catalog compat 重写为按模型名窗口内替换 supportsForcedToolChoice（旧全文件幂等检查会被其他模型误判）
- **Web UI 模块首次覆盖**：exe 内 mod3（导出页 HTML）/mod4（主题 JS）/mod5（tool-views.generated.js）此前从未翻译。mod3/4 用 HTML 属性/文本节点模式（裸词 All/Auto/Default 在其中是代码子串，朴素替换会破坏 JS）；mod5 用 translate.js full 匹配
- **翻译规模**：新增句子型字面量 378 + 键位扫描 370 + 帮助面三轮 ~160 + 选择器 label 47；cli.js 翻译点 1897、CJK 注入 20267 字符
- **交付**：运行中会话占用 omp-zh.exe → 交付到 `G:\omp\omp-zh-17.4.0.exe`；浏览器中继扩展已安装（`browser.relay=true`，扩展在 ~\.omp\browser-relay\extension，Chrome 需手动加载一次）
- 完整经验与安全方法论见 DEVLOG.md 与 skill「大版本更新额外步骤」
