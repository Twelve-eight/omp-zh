# 字典规则

omp-zh 不修改上游源码，而是在官方 exe 里逐个替换字符串字面量。替换以字典为准，规则写错就会改坏程序。本文说明字典格式、构建如何使用字典，以及哪些文字不能翻译。

## 格式

字典是 `dict/` 下的 JSON 数组，每条三个字段：

```json
{ "from": "Show hidden files", "to": "显示隐藏文件/Show hidden files", "mode": "full" }
```

| 字段 | 含义 |
|---|---|
| `from` | 上游源码里的字面量内容，逐字符一致，包括首尾空格和 `\u2026` 这类转义（JSON 里写成 `\\u2026`）。 |
| `to` | 替换后的内容。界面文字统一写成「中文/English」双语形式，英文部分照抄原文。 |
| `mode` | `full`：整个字面量等于 `from` 时替换。`sub`：字面量包含 `from` 时只替换这一段，用于带插值的模板字符串。 |

`dict/*.json` 按主题分文件；`dict/staging/*.json` 存放按版本追加的条目。两组都按文件名排序加载，同一个 `from|mode` 只有第一次出现的条目生效。`node scripts/check-dict.js` 会把重复条目、错误字段和 `to` 中的换行报为错误。

## 构建怎样使用字典

`lib/translate.js` 扫描每个 JS 模块的字符串和模板字面量，对每个字面量先查 `full` 条目，再按长度从长到短应用 `sub` 条目。翻译后的模块中所有非 ASCII 字符写成 `\uXXXX`，原因是 Bun standalone 加载器按 latin1 解码模块源码。

扫描器会跳过以下位置的字面量，它们是代码的一部分：

- 对象键：左边是 `{` 或 `,`，右边是 `:`，例如 `{ "Cache-Control": v }`。
- 索引：`[` 前面是标识符、`)` 或 `]`，例如 `o["Low"]`。
- 成员判断数组：`[...]` 后面紧跟 `.includes(`、`.indexOf(` 或 `.lastIndexOf(`。
- 字符串匹配方法的实参：`startsWith`、`endsWith`、`includes`、`indexOf`、`lastIndexOf`。

构建还会收集所有用于比较的字面量（`===`、`!==`、`case`、`values: [...]`），字典里只要有一条 `from` 与之相同，构建就以退出码 3 中止。

已知未覆盖：可选链索引 `o?.["X"]` 不在跳过范围内。v18.13.3 中没有译文落在这个位置，新增条目时请留意。

## 不能翻译的文字

**发给模型的文字。** 系统提示、提示词模板（`*.md`、`*.txt`）、工具说明，以及工具返回给模型的结果。它们是模型与程序之间的协议，翻译后模型看到的内容会变，有时还会导致程序无法识别模型的输出。源码位置主要在 `packages/agent`、`packages/ai`，以及 `packages/coding-agent/src/` 下的 `tools`、`prompts`、`commit`、`lsp`、`task`、`hub`、`advisor`、`session`、`mcp`、`acp`。例如 todo 工具返回的 `Remaining items: none.` 曾被误译，`verify/18.13.3.js` 里有一项检查专门防止这类回归。

**代码使用的值。** 枚举值、设置项的取值（`auto`、`off`、`high` 这类小写词）、HTTP 头名、模型名、提供商 ID。同一个英文词可能既是界面标签又是比较值，例如 `"removed"` 被 `sub` 条目 `remove → 移除` 改成 `"移除d"` 之后，`type === "removed"` 的分支就不再命中。

**专有名词。** 产品名和协议名保持英文，例如 Bash、LSP、MCP、Amazon S3。

## 新增条目

1. 运行 `node scripts/scan-gaps.js <版本>`，在 `work/gaps-<版本>.txt` 里找到要翻译的英文。报告按模块列出，模块名能看出它属于界面还是提示词。
2. 确认原文出现在上游源码的界面代码里（`packages/coding-agent/src/modes`、`packages/tui`、`slash-commands`、设置定义等），不在上面“不能翻译”的范围内。
3. 把条目写进合适的 `dict/*.json`，或写进 `dict/staging/out-<版本>.json`。
4. 运行 `node scripts/check-dict.js`、`node build.js <版本>`、`node verify.js <版本>`。构建报 `GATE FAIL` 时删掉列出的条目。
5. 启动构建出的 exe，到对应界面确认显示正确。

## 术语

同一个英文概念只用一个译名。常用译名：

| 英文 | 译名 |
|---|---|
| provider | 提供商 |
| session | 会话 |
| agent / subagent | 代理 / 子代理 |
| skill | 技能 |
| hook | 钩子 |
| extension / plugin | 扩展 / 插件 |
| compaction | 压缩 |
| thinking level | 思考层级 |
| slash command | 斜杠命令 |
| model role | 模型角色 |
| prompt | 提示词 |
