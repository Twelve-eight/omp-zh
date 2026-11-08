# 更新日志

本文件记录 omp-zh 各版本的变化。版本号与上游 [oh-my-pi](https://github.com/can1357/oh-my-pi/releases) 一致，标签格式为 `v<上游版本>-zh`。上游自身的改动请看上游的发布说明。

## 未发布

- 删除 63 条「英文重复」条目：`to` 的中文半区是纯 ASCII（多数等于原文），界面会显示成 `Glob/Glob`、`1 KB/1 KB`、`OpenAI API/OpenAI API`。删除后这些标签回到纯英文，`check-dict` 警告 88 → 35。
- 删除条目 `Security`：它落在 Keep-a-Changelog 小节名数组里（`["Breaking Changes", …, "Security"]`），被 `!v.includes(h)` 与 `new Set(…)` 当查找集用，导致 `/changelog` 的安全分类永远不匹配（对抗性复核发现）。过度汉化门新增「成员数组」规则。
- P11 加固：`content` 为 `null` 或缺失时不再抛 TypeError，仅对真正的空数组生效。
- 新增过度汉化硬门：`build.js` 写盘前扫描对象键、计算索引（含 `?.[`）、比较值、Map/Set 键、匹配实参、成员数组、`new RegExp` 实参与 `key/code/type/id/role` 结构字段，命中即 `GATE FAIL`（退出码 3）。对已构建/已安装产物可用 `node scripts/check-overtranslation.js <版本>` 复查（`--self-test` 是门自身的负对照）。判据与排查步骤写入 [docs/dictionary.md](docs/dictionary.md#过度汉化每个版本都要排查) 与 [docs/updating.md](docs/updating.md)。

## 18.18.0-zh（2026-11-05）

- 适配上游 v18.18.0（3631 个模块，较 18.16.0 增加 56 个；上游这一版新增 42 万行）。补丁 P1–P11 全部按新版本源码重新定位：P1/P11 在模块 47（判定函数由 `N9` 更名 `tY`），P2 在 330（上限簇改为 `te/be/re/ie/ne`，其中 `be = 15000` 是流卡顿超时不动），P3/P4 在 465（`var Ix = 8`、`var wc = 3`），P5 在 40，P6 在 240，P7 在 23，P8 在 44（`var Gt` 取代 `Xt`），P9 在 118，P10 在 59。
- 新增 77 条界面翻译：自动更新（设置、首次引导、状态与失败提示）、动效与帧率设置（No animation / 转圈间隔 / 最大帧率 / 彩色 Markdown）、Shell 可视化、子代理工作线程、OpenAI Responses WebSockets、Spotlight 实验、扩展转录呈现器、提示词缓存原因说明、Windsurf 与 Keenable 登录错误等。
- 删除条目 `Power`：它把 puppeteer 键盘布局里的 `key: "Power"` / `code: "Power"` 改成了中文，会破坏 CDP 键盘描述符（设置页的分组标签随之回到英文）。验证新增两项：`key/code/type/id` 字段不含中文、键盘布局保持 ASCII。
- 修复 13 条失效字典条目（上游改写文案：动效说明、edit 工具变体、WebSocket 策略、PAL 后端说明、转录呈现器、扩展链接选择器等），删除 1 条已被上游移除的条目（`Hover`）；13 条改锚点的条目同时按新文案重写了中文（其中「动画样式」「PAL 后端」两条的旧中文因英文里含 `/` 被截断，已修复）。

## 18.16.0-zh（2026-11-05）

- 适配上游 v18.16.0（3575 个模块）。模块继续合并：会话续跑上限（现为 `var im = 8`）与子代理让出上限（`var Ar = 3`）在同一个模块里相距一万多行；空回复判定函数由 `K7` 更名为 `N9`，紧随其后的 `L9` 有相似的首行，锚点按完整函数体断言唯一。
- 补丁内容未变：P1–P11 全部按新版本源码重新定位（P1 与 P11 同处模块 35，P2 在 414，P3/P4 在 553，P5 在 27，P6 在 350，P7 在 99，P8 在 32，P9 在 168，P10 在 47）。
- 新增 26 条界面翻译：Mistral 登录流程（10 条）、`/btw` 引导注入（6 条）、Hindsight 全局作用域（4 条）、预测备选、`gh` 远端检查失败、中继分离报告超时、没有可恢复的内容。
- 删除 1 条失效且属模型可见范围的条目（浏览器工具说明 `release every managed tab`，上游改写为 `… this agent opened`）。

## 18.15.0-zh（2026-11-03）

- 适配上游 v18.15.0。上游这一版把大量模块合并成大文件（3557 → 3570 个模块，若干模块上万行），全部补丁按源码语义重新定位：`turn-recovery` 的重试上限现在是 `ee/te/re/se` 四个（`Z` 变成字符串、`ye` 是流卡顿超时，都不再改）；会话续跑与子代理让出上限在 `agent-session` 同一模块的第 10935、21861 行。
- 新增补丁 P11：中转返回空回复（`content: []`、`stopReason: "stop"`）时，该消息被当作历史反复重放，会话从此永远空转。补丁只丢弃这种真正为空的消息；带思考的 `stop` 消息上游有意保留（思考回放往返），不受影响（见 [docs/patches.md](docs/patches.md#p11空回复不再留在历史里)）。
- 新增 40 条界面翻译：单次调用模型及其白名单、提示词后刷新标题、作业标题与排队压缩的提示、`session lease` 子命令、ACP 句柄记录失败提示等。
- 删除 3 条会改坏代码的条目：`Message`（AWS 错误 XML 的标签名）、`Read`/`Write`（压缩摘要的读写标记）——它们同时用作界面标签与代码取值，保留翻译会让查表失败。构建新增 "Advisory: N entries sit in argument/tag positions" 提示，验证新增两项常量检查。
- 修复 16 条失效字典条目：`--model` 说明、git 保护说明、snapcompact 四类提示、Ultrafast 与服务层级说明、计划模型交接、本地快捷方式（改为 `sub`，随模板插值）、超时自动选择（上游改用 `\u2014` 转义）；删除 4 条上游已移除的文案（OAuth 粘贴提示、`Selected model`、`Returned to main session` 等）。

## 未发布

- 常见问题新增“运行中部分输出暂时不见”一条（`tui.completeScrollback`，上游 [#17423](https://github.com/can1357/oh-my-pi/issues/17423)）。
- `scripts/release.js`：上次运行在推送标签前中断时，重跑会检查远端并补推标签。
- P10 的问题已报告上游：[#17422](https://github.com/can1357/oh-my-pi/issues/17422)。

## 18.14.0-zh（2026-10-30）

- 适配上游 v18.14.0，全部补丁按新版本源码重新定位。
- 新增补丁 P10：Claude 系列模型的历史思考文本不再计入自动压缩的本地下限。修复经第三方网关使用 Claude 时，上下文远低于阈值就触发 shake 和自动交接的问题（见 [docs/patches.md](docs/patches.md#p10claude-思考文本不计入压缩下限)）。
- 新增 43 条界面翻译：首次运行设置向导、预检（prewalk）规划模型与目标、扩展链接选择、会话置顶、out:// 回复设置、从文件读取任务说明等；`--model` 与 git 保护设置的说明随上游更新。

### 仓库

- 构建改为通用入口：`node build.js <版本>` 与 `node verify.js <版本>`。每个版本的补丁放在 `patches/<版本>.js`，检查放在 `verify/<版本>.js`，不再为每个版本复制一份构建脚本。
- 新增 `scripts/fetch-upstream.js`（下载并校验官方 exe）、`scripts/scan-gaps.js`（扫描全部模块的未译文字与失效条目）、`scripts/check-dict.js`（字典检查）、`scripts/extract.js`（导出模块）、`scripts/install-local.js`（安装到本机）、`scripts/release.js`（发布）。
- 字典移入 `dict/`；删除 392 条在 v18.13.3 中已不匹配任何文字的条目、292 条重复条目和 1 条含裸换行的条目。构建产物与 v18.13.3-zh 逐字节相同。
- 新增使用教程 `docs/guide/`（十章）、补丁说明 `docs/patches.md`、字典规则 `docs/dictionary.md`、适配新版本步骤 `docs/updating.md`、工作原理 `docs/architecture.md`。
- 新增 CI（字典检查、安装脚本测试、语法检查）、issue 与 PR 模板、行为准则。

## 18.13.3-zh（2026-10-29）

- 适配上游 v18.13.3，全部补丁重新定位。
- 新增 44 条界面翻译：扩展模式控制、xd:// 挂载通知、会话恢复的工作树范围、速率限制回退、新的上下文查看器分类等。

## 18.13.1-zh（2026-10-27）

- 适配上游 v18.13.1。
- 新增 15 条设置翻译。
- 吸收社区译文约 850 条（来自 summer-omp-cn 的 zh-CN 词表，只收多词长句，排除模型可见文字和与现有译法冲突的条目）。
- 修正：todo 工具返回给模型的 `Remaining items: none.` 不再被翻译；新增检查防止外部译文进入工具、代理与提供商源码。
- 修正：字典门禁收窄为只跳过真正的对象键与索引，此前误跳过的三元表达式与数组中的界面文字恢复翻译；字符串匹配方法的实参与成员判断数组保持英文。

## 18.12.6-zh（2026-10-22）

- 适配上游 v18.12.4 至 v18.12.6。
- 修正：`/stats` 刷新时报 `Invalid header name`。HTTP 头名 `Cache-Control` 曾被当作界面文字翻译，现在对象键、索引和 header 方法的实参一律不翻译。

## 18.12.3-zh（2026-10-20）

- 适配上游 v18.12.3。
- 翻译上游新增的 17 个子命令与 5 个选项的帮助文字，以及约 160 条新设置项。
- 发布流程自动化，版本号以构建产物自报的版本为准。
- 补译字典纳入版本控制，干净克隆即可复现发布产物。

## 18.12.1-zh（2026-10-18）

- 适配上游 v18.12.1。
- 翻译设置界面、模型角色页与状态行。
- 新增比较值门禁：字典中不允许出现代码用来比较的字面量，删除 10 条与枚举值冲突的条目。
