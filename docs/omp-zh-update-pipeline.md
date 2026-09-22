# omp 上游更新自动汉化管线（omp-zh auto-update pipeline）

项目目录：`G:\omp works\Tools\omp-zh\`（脚本/字典在根，中间产物在 `work\`，文档在 `docs\`）

## 管线组成

```
update-zh.js      <- 主控(检测->下载->提取->补丁门->差异->隔离构建->验证->冒烟->交付)
extract-cli.js    提取 exe 的 .bun 模块 0（cli.js）+ Web UI 资产模块（mod2..N → work/mod*）
patch-zh.js       对官方 cli.js 应用确定性汉化补丁（幂等；17.4.0 起仅 catalog compat）
web-translate.js  Web UI 模块汉化（mod3/4 HTML 属性/文本节点模式；mod5 字面量级）
scan-gaps.js      新英文文本发现器（未命中清单+死条目）     [node scan-gaps.js <cli.js> dict*.json...]
deep-scan.js      深度扫描（work/ 内）：UI 键位 + showStatus 调用点 + Web 模块文本
build-zh.js       合并字典->翻译 cli+Web->重建 exe(**只构建,不交付**)  [参数化: --src/--cli/--dst 或 OMP_SRC/OMP_CLI/OMP_DST]
deliver-zh.js     唯一交付入口(sha256 复核 + 原子 rename + 落位后回读)   [--src <built> --target <install> --version <ver> --expect-sha256 <64hex>]
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
流程:GitHub latest tag vs 本地汉化版 `--version` -> 相同则退出;不同则下载 `omp-windows-x64.exe`(curl)-> 官方摘要校验 -> 提取 -> **补丁门**(warn>0 即中止,不写回 cli)-> 差异扫描 -> **隔离构建**(只写 work/omp-zh.exe)-> **verify** -> **冒烟** -> **交付**(deliver-zh.js 复核 sha256 后替换 `G:\omp\omp-zh.exe`).任一门失败都不碰正式目标,不写成功版本标记.

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

| 补丁 | 内容 | 失效后果(patch WARN 时) |
|---|---|---|
| catalog compat | v4-flash/v4-pro `supportsForcedToolChoice:false`(18.2.8 起为计算式整体替换) | 计划模式 tool_choice 400 回退 |
| leak(6 处) | 基础设施 spawn 强制 `windowsHide:true` | 子进程日志绘进 TUI("时空图") |
| stopcap(3 处) | 空/意外/畸形停止重试与续跑、yield 阶梯抬到 1e6 | 未到用户要求即停止 |
| replay(1 处) | 尾条 usage 无条件 flush(上游反复横跳,每版必查) | 恢复后 "error; retried" 消失 |
| encstale(14 条规则 / 2 类) | 账号池网关 encrypted-content 错误分类(正则扩展,不动 reasoning) | 跨轮 400,会话无法恢复 |

补丁基于精确文本锚点,分五组。**现役规则**(名字不带版本号,或带本文件最新版本号)一旦 miss:
`patch-zh.js` 报 WARN,`warn>0` 时**不写回 cli** 并以非零码退出,`update-zh.js` 把它当硬门
直接中止(不构建/不交付).老版锚点带旧版本号 -> 报 LEGACY,不计 warn(见 DEVLOG 2026-09-22
与 2026-09-19).补丁幂等:每次从官方 exe 重新提取再打,不重复累积.

## 验证体系（管线内置，防坏 JS）

0. **门序(硬)**:补丁门 -> 隔离构建 -> `verify-zh.js` -> 冒烟 -> 交付.前四门全部作用于
   `work/omp-zh.exe`,正式目标在门 5 之前一次都没被碰过.
1. `verify-zh.js`:字面量数一致性(翻译破坏了引号配对会 MISMATCH),未闭合字符串/模板检测,括号平衡,CJK 增量统计
2. 冒烟:`work/omp-zh.exe --version` 含新版本号 + `--help` 含 >=20 个 CJK 字符
3. 交付前:产物 sha256 与自报版本复核;落位后回读目标 sha256
4. 下载:sha256 校验下载文件(官方摘要,见"校验信任边界")

## 维护注意点

- **交付被占用**:目标 `G:\omp\omp-zh.exe` 被运行中会话占用时,`deliver-zh.js` 报
  `deliver DEFERRED`,已验证候选 staged 为 `<target>.new`,看护(`deliver-pending.js`)在占用
  会话退出后按同一 sha256 补交付.此路径**不写** `.omp-zh-last-version`,下次运行会重新核对.
  若想立即落位:退出全部汉化版会话后重跑 `node update-zh.js --force`.
- **版本记录**:`.omp-zh-last-version` 只在产物真的落位(或显式 `--no-deliver`)时写;
  `.omp-zh-last-delivery.json` 记录最近一次交付的目标/sha256/模式(审计用).
- **字典版本漂移**：dict 生成脚本（gen-*.js）输入仍指向 v17.2.11 的 cli.js——新增文本用 scan-gaps 发现即可，旧生成脚本仅作候选辅助
- **交付顺序回归**:`node tools-verify-order.js`(隔离 fixture 跑真实更新器,不碰 `G:/omp`);
  需要 ~0.6GB/场景空闲空间,不足会直接拒绝开跑.单场景:`--scenario miss|patchfail|patchtimeout|verifyfail|ok|locked`

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

## 2026-08-23：v18.0.1 重建 + 补丁2（Windows 控制台泄漏修复）
- **下载校验**：update-zh.js 只认按版本清单（SHA256SUMS.txt.<tag>），下载前删旧文件禁 `-C -` 续传，下载后强制取当前版清单校验，失败即删脏文件。通用缓存 SHA256SUMS.txt 已删除（旧版残留曾致确定性误报）。
- **补丁2 动机**：win32+TUI 下 hostHasInheritableConsole()=true 使 broker/daemon/MCP stdio/blob-broker/direnv/browser 等 spawn 附着控制台；孙进程 NULL 句柄默认规则直写 CONOUT$ → 日志绘入 TUI（"时空图"）；broker 由首实例孵化且 unref 长存、按项目目录共享 → 跨实例窗口泄漏。
- **补丁2 内容**：9 处基础设施 spawn 强制 windowsHide:true；eval kernel（py/jl/rb shouldHideKernelWindow）豁免——上游 #1960 CREATE_NO_WINDOW 致 NumPy LoadLibraryExW 死锁，且 kernel 输出本就被管道捕获。
- **验证方法**：改前对每个 find 串在 bundle 内计数（须 ==expect；本次 8 处唯一 + MCP 1 处，kernel 3 处不动）；补丁后复查危险模式归零、windowsHide:true 字面量 21→29、kernel 调用点不变。产物 verify PASS + smoke OK（omp/18.0.1，help CJK 1643）。
- **交付**：宿主会话占用 G:\omp\omp-zh.exe 时用 --no-deliver 先构建，退出后 `node update-zh.js --force` 补交付。
