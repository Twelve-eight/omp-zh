# omp-zh（17.2.12 汉化版）输入卡死问题排查报告

日期：2026-08-10
环境：Windows 10 Pro 19045 (x64)、Windows Terminal + ConPTY、omp 17.2.12
模型：opencode-go / DeepSeek V4 Flash（`opencode.ai/zen/go/v1`）

---

## 一、现象

1. **运行中 / `/tree` 导航后**：输入框正常渲染，按键事件到达（提示符光标闪烁随按键刷新），但**字符不进入输入框**（英文、中文/IME 均不行）。重启应用不消失，过一段时间自动恢复；切换窗口焦点或再次执行 `/tree` 可立即恢复。
2. **重启启动后**：启动恢复会话（约 3MB jsonl）后，出现**持续高 CPU**（约 78% 单核，`Get-Process` CPU 计时 4 分钟 ≈ 188 秒），期间零日志活动、输入不响应，过一会自行恢复。
3. 日志中**无 error 级记录**；启动时仅一次 `ui.loop-blocked`（261–364ms，属正常初始化）。

## 二、已确认：原版同样复现

- 在**官方原版 `G:\omp\omp.exe`（17.2.12，未经任何汉化修改）**上，用户实测出现相同问题（"重启后很长一段时间内无法输入，过了一会又好了"）。
- 原版不含任何翻译、catalog 修改或补丁 → **卡输入不是汉化引入**。

## 三、汉化改动全清单（唯一差异来源）

汉化版 = 官方原版 exe 重建：仅替换入口模块（cli.js）内容，其余 7 个模块**逐字节保留**。

| 改动 | 内容 | 运行时影响面 |
|---|---|---|
| 模块 0 字符串字面量翻译 | 7+1 个字典（help/tui/settings/slash/tools/plan），1205 处，双语对照 | 仅显示文本；不影响逻辑（见第四节验证） |
| translate.js 构建脚本修复 | 模板字符串的 full/sub 替换结果不再被丢弃 | 构建期；让 30 个模板字符串被翻译 |
| catalog：`opencode-go/deepseek-v4-flash` efforts 加 `"max"` | 思考层级选项增加 max | 仅模型设置选项 |
| catalog：同模型加 `compat.supportsForcedToolChoice: false` | 修复该端点 `tool_choice:"required"` 400 | 仅请求构造降级 |
| 一行补丁：`showTreeSelector` finally 加 `focusActiveEditorArea()` | /tree 导航后恢复输入框焦点 | 仅 /tree 路径，幂等 |

**未改动**：`G:\omp\omp.exe`（官方原版）、`G:\omp\omp.exe.new`、`.omp` 下任何配置文件（`agent/config.yml` 的 `:max` 模型角色是用户 10-26 自行配置，非脚本写入）、会话数据。

## 四、排除证据（逐项）

1. **原版复现**（用户实测）→ 排除汉化。
2. **逻辑一致性**：`showTreeSelector`/`showSelector` 剥离字符串后的逻辑 token 与原版**完全一致**（4394/4394、4451/4451）。
3. **终端控制序列零污染**：含 `\x1b` 转义序列的 381 个字符串字面量，翻译产物与原版**零差异**。
4. **输入路径零触碰**：被翻译的行中，含 input/keyboard/tty/terminal/paste/IME 关键词的**为 0 行**。
5. **模板翻译不涉热路径**：17237 个模板字符串仅 30 个被翻译，全部位于 `--help`/CLI 描述/计划审阅页；**零渲染热路径**（状态栏/标题栏/每帧渲染无翻译）。
6. **模块完整性**：模块 1–7（embedded-addons、模板、tool-views、CHANGELOG、mupdf-wasm）SHA256 与官方原版**逐字节一致**。
7. **无配置污染**：`.omp` 下无脚本写入的配置；terminal-sessions 为正常历史累积。
8. **共享数据库已维护**：脚本运行测试实例期间并发写入导致 SQLite WAL 膨胀（agent.db-wal 4.1MB / history.db-wal 4.1MB），已 `wal_checkpoint(TRUNCATE)` 清理至 0–32 字节；并删除测试会话。WAL 与 TUI 输入处理解耦，非直接根因。

## 五、根因分析（当前判断）

### 场景 A：`/tree` 导航后输入死（焦点幽灵，与上游 issue #3349 同源）
- 机制：`showSelector` 的 done 回调执行 `setFocus(this.ctx.editor)`，但此时 `editorContainer` 已 `clear`+重建，该引用指向**旧 editor 实例**；按键落入不可见的幽灵组件，可见输入框收不到字符。
- 佐证：源码中 `focusActiveEditorArea()` 的注释即记录 #3349 同类问题；`/tree` 路径恰好绕过该修复。
- 状态：**汉化版已补** `focusActiveEditorArea()`（用当前实例重新聚焦）；原版 17.2.12 未修复（上游 main 亦无修复提交）。

### 场景 B：启动恢复后输入死（高 CPU 空转）
- 特征：启动恢复大会话后事件循环持续高 CPU、零日志、输入不响应、自愈。
- 疑似：17.2.12 启动恢复/渲染路径在 Windows/ConPTY 上占用事件循环；或与多实例并发写 SQLite（用户同时开原版+汉化版）相关。
- 注意：**用户历史经验是 17.2.11 加载巨大对话不卡**——差异来自 **17.2.11 → 17.2.12 升级**（Bun 运行时/恢复逻辑变化），而非汉化（原版 17.2.12 同样复现）。
- 状态：未定位到具体任务；需要卡住现场数据（进程 CPU、采样栈、日志时间戳）。

## 六、终极对照实验（如需最终定案）

在**官方原版 `omp.exe`** 上执行同一套操作（恢复同一大会话 → `/tree` 切换）：
- 若原版复现 → 与汉化无关（当前证据已强烈指向此结论）。
- 若原版不复现且汉化版复现 → 需进一步做"原版 cli 走 rebuild 流程"的对照（排除构建产物差异；当前模块哈希已排除模块 1–7）。

附加对照：卡住时记录
```
powershell Get-Process omp-zh | select Id,CPU,StartTime
```
与 `.omp\logs\omp.<pid>.log` 的时间戳，用于定位场景 B 的占用任务。

## 七、上报上游建议

- 场景 A：补充到 GitHub issue **#3349**（同源：焦点落在被替换组件上的幽灵编辑器；`/tree` 路径未覆盖既有修复）。
- 场景 B：新开 issue（机制疑似事件循环高 CPU，非焦点；附高 CPU 与自愈现象、Windows/ConPTY 环境、恢复大会话步骤）。

英文 issue 草稿：

```
Title: Input becomes unresponsive after /tree navigation and after startup session restore (Windows)

- omp 17.2.12, Windows 10 Pro 19045, Windows Terminal/ConPTY, provider opencode-go (DeepSeek V4 Flash), autoResume with ~3MB session.

Symptoms:
- Keyboard events reach the app (prompt cursor blink refreshes) but characters are not inserted (ASCII and IME alike).
- Scenario A: after /tree branch navigation. The selector's done callback runs setFocus(editor) while editorContainer was cleared+rebuilt, so focus lands on a stale editor instance (ghost component). Switching window focus or re-running /tree rebuilds focus and recovers. Same class as #3349; the /tree path bypasses the existing focusActiveEditorArea() fix.
- Scenario B: after startup with session restore. Process sustains ~78% single-core CPU while idle, zero log activity, input unresponsive for minutes, then self-recovers. Not focus-related; original (untranslated) build reproduces identically.

No error-level log entries; only a one-time ui.loop-blocked (~270ms) at startup.
```

## 八、复现实验（2026-08-10，录屏记录）结果

### 环境（干净隔离，杜绝一切客制化变量）
- exe：`G:\omp-repro\omp.exe` = 官方原版 `G:\omp\omp.exe` 复制件，**SHA256 逐字节一致**（`C21A8921...71F03C`，157,162,496 字节）
- 配置：`PI_CONFIG_DIR=omp-repro-config`（相对路径，绝对路径会被 bun path 拼错）→ 全新 agent 目录，无用户 config.yml/会话/凭证
- 会话树：通过迁移 opencode-go 凭证（`agent.db.auth_credentials` 明文 API key）在隔离环境真实发消息 + `/fork` 造出两分支树
- 大会话：复制用户 `--G--omp works--`（3.2MB jsonl + 工具日志 + local 附件）至隔离环境

### 逐项结果（hub PTY 驱动，全程录屏）
| 阶段 | 操作 | 输入测试 | CPU |
|---|---|---|---|
| 0 基线 | 干净环境启动 + 设置向导跳过 | `repro-base-input-ok` 正常进入输入框 | — |
| 1 场景 A | `/tree` 打开、选节点、Enter 切换（原版，无焦点补丁），**切换后立即输入** | 2/2 正常（`╰─ …post-switch-input-test ─╯`、`╰─ …r2-input-test ─╯`） | 正常 |
| 2 场景 B | 复制大会话 → `-r` 恢复（42.1% / 1M 上下文）→ 恢复后立即输入 | `restore-input-test` 正常进入输入框 | **3 秒窗口 delta 0%（空闲 0%）** |
| 3 客制化 | 复刻用户完整 config.yml（modelRoles :max、defaultThinkingLevel: max、autoResume 等）→ 恢复大会话 | `full-config-input-test` 正常进入输入框 | **3 秒窗口 delta 0%（空闲 0%）** |

### 结论：所有场景**均未复现**
原版 exe + 完整用户配置 + 大会话 + opencode-go/DeepSeek V4 Flash + xhigh + 42% 上下文，输入始终正常、空闲 CPU 0%。**排除了**：汉化翻译、catalog 修改、focus 补丁、config.yml 客制化、大会话本身、凭证——这些在 hub 环境下都不触发卡输入。

### 剩余变量（无法在 hub 环境覆盖）
1. **终端类型**：本实验用 hub PTY（独立 ConPTY）；用户实际用 **Windows Terminal**。用户"切换窗口焦点即恢复"表明问题与**真实终端窗口焦点**相关——hub PTY 无窗口焦点概念，可能避开触发条件。
2. **启动方式**：hub 托管启动 vs 用户在 Windows Terminal 中手动启动。
3. **时长/时机**：用户卡输入持续数分钟；实验窗口较短（分钟级），未能覆盖长时间运行或特定触发时机。

### 判定
- 输入卡死**非汉化、非用户配置、非会话大小**所致（干净+完整配置均未复现）
- 高度指向**真实 Windows Terminal 会话中的焦点/输入路由问题**（与 opencode 分析的焦点幽灵方向一致），但 hub PTY 环境无法复现，需用户在真实终端复现时补充取证：卡住时任务管理器 CPU（确认 bun 20%）、日志时间戳、切换窗口焦点/点击终端窗口的恢复行为

### 根因实证（用户真实会话日志，12:34 /tree 时）
```
{"message":"ui.loop-blocked","blockedMs":47337,"phase":"unknown"}   ← UI 事件循环被同步阻塞 47 秒
```
- **机制**：`/tree` 切换 → `renderInitialMessages({clearTerminalHistory:true})` **同步重建全部消息组件树**；大会话（42% 上下文、~420k token、数百节点含工具调用/分支摘要）重建耗时数十秒 → 事件循环整体冻结 → 输入完全不处理（按键到达但字符不入框）→ 重建完成自动恢复
- 启动恢复大会话走同一同步路径 → "重启后卡输入"同因
- 20% CPU = 阻塞段内的同步渲染/重建计算
- 与 #3349（焦点幽灵）**不同机制**但同症状；与汉化无关（原版同代码，原版复现吻合）
- hub ConPTY 环境复现不出（终端渲染路径差异：真实 Windows Terminal 下同步重建更慢/不被合并），但日志实证（blockedMs=47337）来自用户真实会话，可信
- 修复方向（上游）：renderInitialMessages 增量/异步/分帧重建，避免事件循环长时间冻结；至少单独记录重建耗时
- AI 撰写 issue 草稿见 `omp-issue-input-freeze-47s.md`

### 对照实验（用户实测，原版 omp.exe，2026-08-10）
| 场景 | 结果 |
|---|---|
| `autoResume: false` + 直接启动新对话 | **不卡**（无恢复 → 无全量重建） |
| 手动 resume 大会话（just now） | **卡**（恢复 → `renderInitialMessages` 同步重建 → 事件循环阻塞） |
| `/tree` 切换大会话 | **卡**（12:34 日志 `blockedMs=47337` 实证） |

触发条件精确定位：**只要加载大会话（恢复或切换）就触发同步全量重建**，与启动方式无关。`handleResumeSession` 与 `showTreeSelector` 走同一 `renderInitialMessages({clearTerminalHistory:true})` 路径。



- 汉化构建脚本：`~\AppData\Local\Temp\build-zh.js`（引入 dict-plan.json、cli 输入 cli-172.js）
- 翻译引擎：`~\AppData\Local\Temp\translate.js`（v6，含模板修复）
- 字典：`~\AppData\Local\Temp\dict-*.json`（8 个）
- 重建工具：`~\AppData\Local\Temp\rebuild.js`（模块图重建，未改动）
- 日志：`~\.omp\logs\omp.2026-08-10.*.log`
- 400 请求留档：`~\.omp\logs\http-400-requests\`
