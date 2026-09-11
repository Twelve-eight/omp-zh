# omp-zh 17.4.0 大版本更新记录（2026-08-21）

## 概要
上游 v17.4.0（用户手动下载 `omp-windows-x64.exe` 到 omp-zh 根目录）。本次除常规补译外：
1. 适配了 patch-zh.js 的结构变化；2. 发现并覆盖了 exe 内 **Web UI 资产模块**（此前从未翻译）；
3. 帮助面五轮清扫至基本全汉化；4. 接入浏览器中继扩展。

## 补丁变化（patch-zh.js 重写）
- **catalog efforts+max：不再需要**。17.4.0 上游原生给 deepseek-v4-flash 加了 `max` effort
  （efforts 重构为 low/high/max，旧锚点 `minimal/low/medium/high/xhigh` 已不存在）。
- **catalog compat（保留，重写）**：v4-flash/v4-pro 的 `supportsForcedToolChoice` 仍为 `true`，
  计划模式 tool_choice 400 隐患仍在。新实现按模型名定位条目窗口（2500 字符）内替换，
  幂等检查也限定在窗口内——旧版全文件检查会被其他模型的 false 误判为「已打」。
- **focus：已移除**。17.4.0 showTreeSelector 关闭回调原生调用 focusActiveEditorArea()，上游已修复。

## Web UI 模块（本次最大发现）
exe 的 .bun 模块图有 7 个模块，此前管线只处理模块 0（cli.js）：

| idx | 内容 | 处理方式 |
|---|---|---|
| 0 | cli.js（27MB） | translate.js 字面量级翻译 |
| 1 | embedded-addons tar.gz | 不动 |
| 2 | 导出页 CSS | 无文本，不动 |
| 3 | 导出页 HTML（Session Export） | web-translate.js：仅 title=/aria-label=/placeholder= 属性值与 >text< 文本节点 |
| 4 | 导出页主题 JS | 同上（HTML 模式安全替换） |
| 5 | tool-views.generated.js（284KB，Web 协作端工具渲染器） | translate.js full 整体匹配 |

**为什么 mod3/4 不能用 translate.js**：裸词 All/Auto/Default 在其中同时是代码子串
（querySelectorAll、isDefaultPrevented），朴素替换会破坏 JS。HTML 属性/文本节点模式天然限定显示面。
管线改动：extract-cli.js 现在导出 mod2..N 到 work/mod<i>-<basename>；
build-zh.js 调用 web-translate.js 并把 mod3/4/5 传入 rebuild()（newContents 数组按索引替换）。
验证：构建后重新解析 exe 模块图，逐字节比对 mod3/4/5 与 work/web-out/ 一致。

## 翻译规模
- 差异扫描：17.3.2→17.4.0 新增句子型字面量 378 条（gaps 对比法：两版 gaps 清单集合差）。
- 深度扫描（deep-scan.js）：UI 键位模式（title:/description:/label: 等 + showStatus/showError 调用点）
  额外发现 329 条 cli.js 文本 + 41 条 Web 文本——scan-gaps 的「需含空格」过滤会漏掉单词枚举。
- 四个并行 sonic 子代理分域翻译（settings 60 / tui 28 / misc 216 / web 29）+ 主代理补译
  选择器 label 词 47 条（out-labels.json）+ 帮助面三轮 98+47+14 条 + 模板字面量 1 条。
- 最终：cli.js 翻译点 1897 处，CJK 注入 20267 字符；web 模块 html=32 js=4。
- 死条目 21 条确认删除（上游改写的 Compaction/prewalk/Advisor 文案等）。

## 安全方法论（重要经验）
full 模式是整字面量替换，但同一大写词可能既有 label 用途又有逻辑比较用途。
派发前必须跑「比较上下文检查」：对每个候选词统计 `"词"` 前面是 `==`/`includes(`/`case ` 等的次数。
本次禁译清单（有比较用途）：Default(None 5/22、Yes 4/13、Strict 3/7 等)、小写枚举值
（auto/off/all/global/project/plan/task/tab/page/name/string/clear/find/history/inherit/min/max/low/medium/high/xhigh…）、
模型名。大写 label 词经查全部安全（value 小写/label 大写天然分离）。

## 帮助面清扫方法（可复用）
跑全部子命令 `--help` → 收集无 CJK 行 → 区分 flag 描述/ARGUMENTS 描述/示例命令 →
只译描述部分 → 校验每条 from 在 cli.js 中逐字符存在（4 条因括号枚举后缀失配被修正为真实形态）。
注意：模板字面量 `` `Action: ${Phs.join(" | ")} (default serve)` `` 的 full 翻译 to 中
**不能复制插值**（双语化会产生两份插值，verify 报字面量数 MISMATCH）；to 里插值只留一份，
原文段写字面文本即可。

## 交付
- 运行中会话占用 G:\omp\omp-zh.exe（4 个进程），按用户要求不干扰 → 交付到 **G:\omp\omp-zh-17.4.0.exe**。
- 冒烟：--version=omp/17.4.0 ✓ 主帮助 CJK 1648 ✓ 全部 31 个子命令帮助残留英文仅剩 1 行（模板 ACTION 行已双语化）✓
- 浏览器中继扩展：`omp browser-relay install` 已写入 ~\.omp\browser-relay\extension，
  `browser.relay=true` 已设置，relay 服务冒烟监听 9224 ✓。
  Chrome 侧还需人工：chrome://extensions 开发者模式 → 加载已解压扩展 → 选上述目录。
- 遗留文件：G:\omp\omp.exe.new 是损坏/不完整的 PE（os error 193），待用户确认后可删。

## 下次更新注意
- update-zh.js 的 localVersion() 读 G:/omp/omp.exe（官方版，停在 17.2.12）——版本检测与实际使用的
  汉化版脱节；建议改为读 G:/omp/omp-zh.exe 或 .omp-zh-last-version。
- 交付目标仍是 G:/omp/omp-zh.exe；运行中占用时 build 只日志不失败，重跑即可。
- scan-gaps/deep-scan 双扫描都要跑：前者抓句子，后者抓键位单词。

## 2026-08-21 晚：17.4.0 交付完成 + omp-web 项目启动
- 17.4.0 汉化版已交付（G:\omp\omp-zh.exe，旧版备份 .old）。用户已重启会话运行新版。
- update-zh.js 版本检测脱节问题**未修**（localVersion 仍读官方版 omp.exe）——下次更新前先修。
- 新项目 **omp-web**（G:\omp-web\）：用户自制 omp 网页版，对标 opencode web。
  - 已完成：12 项缺陷修复（f25cc11）+ 多工作区/设置对话框功能（cd51393）。
  - bun 1.4.0 装到 G:\tools\bun\（PATH 用户级前置；C 盘 npm 全局的 1.3.14 未动）。
  - 关键机制调研结论存 G:\omp-web\work\ui-spec.md（config.yml 用 bun Bun.YAML 原子读写、
    omp config CLI 会因 SQLite 只读崩溃不可用、skill 开关=config skills 组键、
    会话桶名 qzs 编码但 cwd 以 jsonl 头为准）。

## 2026-08-22 凌晨：17.4.1 更新（进行中）
- 上游已发 17.4.1；用户手动下载到 I:\Downloads\omp-windows-x64 (1).exe（sha256 与官方 SUMS 一致）。
- **修复 update-zh.js 两处 bug**：
  1. LOCAL_EXE 改读 omp-zh.exe（版本检测脱节）
  2. SHA256SUMS 按版本缓存（sumsTagFile = DL_SUMS + '.' + tag），旧版 SUMS 不再误杀新版文件
- **修复 extract-cli.js**：17.4.0+ 的 Web UI 资产导出循环里 T 未定义 → __dirname
- 管线 --force --no-deliver 已通过：extract→patch OK(2)→gaps 11068→build→verify PASS→smoke omp/17.4.1 helpCJK=1648
- 新增 UI 文本差距：work/gaps-17.4.1-ui.txt（20 条候选，Code Mode/Session Export/侧栏等），Translate1741 子代理补译中
- 交付待办：补译完成后跑 node update-zh.js --force 正式交付（G:/omp/omp-zh.exe 当前被运行会话占用，需用户重启汉化版后再交付）
- **17.4.1 已交付到 G:\omp\omp-zh-17.4.1.exe**（主文件 omp-zh.exe 被 5 个运行会话占用无法覆盖）。
  补译 11 条（dict-help-extra.json：Code Mode/Codex Code Mode/Direct Tools/marketplace 报错/Handoff/Lazy model refresh 等），
  verify PASS（216156 字面量一致、CJK 注入 20353）、smoke omp/17.4.1 helpCJK=1648。
  用户下次重启会话时可直接用 omp-zh-17.4.1.exe，或关闭全部会话后把它复制为 omp-zh.exe。

## 2026-08-22：17.4.2 更新（主会话直接完成）
- 用户下载 I:\Downloads\omp-windows-x64 (2).exe（17.4.2）。GitHub API 当时 502，跳过 update-zh.js 版本检测，手动 extract→patch→build。
- **重大扩充：设置 UI 面首次成规模汉化**。提取 cli 全部 settings schema 的 ui.label/ui.description（2485 条），对比字典后补译 793 条入 dict-settings-b.json（现 1180 条）：
  键位动作 61、images 后端标签 117、语音/推理/量化/本地模型 112、provider 与 TTS 54（注意源码 em-dash 是字面 \u2014 六字符，from 必须按字节匹配）、选项值 86、设置描述 83、记忆/策略 48、设备/TTS/OpenRouter 44、TUI 命令面板 54、工具参数 49、发现描述 45、snapcompact 字体主题 40。
  未译保留：纯技术枚举值（q4/fp16/provider 名/引擎名）、OTel 指标、lint 工具名、代码片段类。
- **踩坑**："3 turns" 的 to 里写了真实换行符 → 破坏 JS 字面量 → exe 启动 SyntaxError。verify-zh 只查字面量数与括号不查这个。教训：to 内严禁裸换行，多行文案用「（默认）」括注形式合并单行。
- 最终：translated literals 3009（+1092）、CJK 注入 27101、verify PASS、helpCJK=1663、smoke omp/17.4.2 ✓
- **交付 G:\omp\omp-zh-17.4.2.exe**（omp-zh.exe 主文件仍被运行会话占用；用户关闭全部会话后替换即可）。

## 2026-08-22 晚：18.0.0 大版本更新
- 用户下载 I:\Downloads\omp-windows-x64 (3).exe（151MB，比 17.x 小 9MB）。
- **模块布局变化**：module 0 不再叫 cli.js（改为 B:/~BUN/root/omp-windows-x64），extract-cli.js 的名字断言失败。手动提取 module 0（29MB 主程序确认是 JS）；新增 module 1 embedded-addons.win32-x64.tar.gz（31MB 内嵌扩展包，未处理）。**extract-cli.js 待改**：断言放宽为「module 0 是 JS」+ 资产模块按内容特征识别而非哈希后缀。
- 构建：translated literals 3006、verify PASS、CJK 27030、RPC 冒烟 ✓、-p 模式 ✓
- **已直接交付 G:\omp\omp-zh.exe**（用户会话空闲时 build 自动交付成功）——当前运行的就是 18.0.0 汉化版
- **上游新问题（非汉化引入）**：18.0.0 非 TTY 的 text 输出双重编码 mojibake（--help 等 banner；UTF-8 字节被按 Latin-1 再编码）。TTY/rpc/-p 均正常。还原方法：Buffer.from(s,'latin1') 还原原始字节。待上游修复或本地补丁。

## 2026-08-22 晚（续）：18.0.0 乱码根因与修复
- **用户报告 TUI 全部中文乱码** → 深挖定位：不是上游输出 bug，是 **Bun 1.4.0 standalone loader 把模块源码按 latin1 解码**。
  证据链：① 最小中文嵌入复现（rebuild 18.0.0 exe + `console.log("用法测试")` → mojibake）；② 同样脚本嵌入 17.4.1 exe 正常；③ `\uXXXX` 转义字面量正常；④ mojibake 可用 latin1→utf8 完美还原（字节无损）；⑤ bun 1.4.0 直接跑文件正常——仅 standalone 模块加载路径受影响。17.x 的 Bun 1.3.14 无此问题。
- **修复（build-zh.js）**：翻译产物后处理——所有非 ASCII 字符转 `\uXXXX` 转义（含代理对）。纯 ASCII 源码在任何解码下语义不变，绕过 loader 缺陷。Web 资产模块（mod3/4/5）同样处理。
- 终验：--help CJK=1643 直出 ✓ verify PASS ✓ RPC ✓ --version ✓
- **交付 G:\omp\omp-zh-18.0.0.exe**（主文件被运行会话占用；用户关闭全部会话后替换 omp-zh.exe 即可）。
- 注意：此前交付的 omp-zh.exe（19:37 版）是**未修复的坏版本**，必须替换！

## 2026-08-22 晚（三）：合规审查 + web 资产转义修正
- **合规审查结论（MIT，可发布）**：
  1. 上游 MIT（Copyright Mario Zechner / Can Bölük / Stencil Labs）——修改、再分发、更名均允许
  2. 产物 exe 内 LICENSE 文本完整保留 ✓
  3. 字典 2460 条无版权文本/URL 污染；8 条长工具文档翻译属 MIT 衍生作品正常范围
  4. 发布要求：附带 LICENSE 副本、说明「基于 can1357/oh-my-pi 的非官方汉化」、不用官方 logo 站名误导即可。命名 omp-zh 无商标冲突（MIT 不含商标授权但 omp-zh 与官方 omp 足够区分）
- **自查发现并修复 web 资产转义 bug**：上一版对 mod3(HTML)/mod4(JS) 统一 \u 转义——HTML 里 \uXXXX 不会被解码。
  修正为分治：mod3 用 &#xXXXX; 数字实体（往返验证 OK）；mod4 实为纯 JS（树形字符在 JS 字符串里）改用 \u；mod5 维持 \u。
- 重建交付：G:\omp\omp-zh-18.0.0.exe（主文件仍被会话占用）

## 2026-08-22 晚（四）：公开发布
- GitHub 仓库 https://github.com/Twelve-eight/omp-zh 已建（公开，MIT）
- Release v18.0.0 已发布：omp-zh.exe (151,715,328 B) + SHA256SUMS.txt
  sha256 = dd66e710067c06e2edbb969ab75092a01f33aa4856a9d1be4dd7e89eaef6a2aa
- 合规：README 注明非官方/来源/License；LICENSE 副本随仓库分发
- git 推送注意：本机代理常掉线，push 失败时用 git -c http.proxy= -c https.proxy= push

## 2026-08-22 深夜：泄露排查 + 重试加固
- **API key 泄露排查**：云端仓库全历史、Release 资产、exe 二进制均无任何密钥（多模式扫描 sk-/ghp_/token= 等全零命中）。
  发现轻度隐私泄露：Windows 用户名 REDACTED_USER 出现在文档路径（10 处）。已修复：
  git filter-branch 全历史重写 + 强推覆盖 + 删 stash/refs/original/reflog/gc + **重打 v18.0.0 tag**（旧 tag 指向含泄露的 commit）。
  最终 `git log --all -p | grep REDACTED_USER` = 0。
- **重试加固**：retry.maxRetries 50→**；fallbackChains 曾追加第二提供商（该提供商现已从全部配置中整体移除）
  （原配置所有角色回退指向主模型自身，服务抖动时无真实备选）。"stream closed before finish_reason" 错误
  在上游归类为 Transient 可重试，** 次 + 跨提供商回退双保险。
- **用户修正**：不要跨模型回退（保持同一模型）。已撤销追加的回退项，modelFallback: false，
  仅保留 retry.maxRetries: ** 对同一模型重试(细节已隐去)。

## 2026-08-23：18.0.1 重建 + Windows 控制台泄漏修复 + 仓库敏感信息清理
- **下载校验修复（update-zh.js）**：18.0.1 资产 sha256=9367cb63…。此前误报根源：通用缓存
  SHA256SUMS.txt 是旧版本残留，haveSums 兜底回退导致新文件对旧清单校验；叠加 `curl -C -`
  断点续传在上游替换资产后拼出确定性脏文件。现改为：只信按版本清单、下载前删旧文件禁续传、
  下载后强制取当前版清单、校验失败即删。
- **TUI 泄漏 bug 定位与修复**：症状为子进程日志直绘 TUI（光标处 [INFO]、重绘顶出"时空图"、
  甚至落进其它 omp 实例窗口）。机制：win32+TUI 下 hostHasInheritableConsole()=true，
  broker/daemon/MCP stdio 等多处 spawn windowsHide:false → 子进程附着 omp 控制台，孙进程经
  NULL 句柄默认规则直写 CONOUT$；broker 由首实例孵化且 unref 长存、按项目目录共享 → 跨窗口。
  patch-zh.js 新增补丁2：九处基础设施 spawn 强制 windowsHide:true（Bun 映射 CREATE_NO_WINDOW）；
  eval kernel 三处豁免（上游 #1960：CREATE_NO_WINDOW 致 NumPy LoadLibraryExW 死锁）。
  锚点逐一验证唯一性；补丁后危险模式 0、windowsHide:true 字面量 21→29、kernel 3 处不变。
- **构建**：verify PASS，smoke OK version=omp/18.0.1 helpCJK=1643，产物 work/omp-zh.exe。
  交付延迟（G:\omp\omp-zh.exe 被运行中会话占用）：退出后跑 `node update-zh.js --force` 补交付。
  行为级验证状态：bundle 级已证伪全部危险模式；TUI 实机观察待下次会话确认。
- **本仓库敏感信息清理**：自写 G:\omp works\.tooling\git-history-filter.js（fast-export|过滤|
  fast-import，机器无 Python 故弃 filter-repo）。全史 redact：o_Obl→REDACTED_USER、
  retry.maxRetries 数值与"无限重试"表述（正文+commit message）。强推完成 HEAD=85c4622，
  tag v18.0.0 重指；`git log --all -p` 三模式零命中。原始流留档 G:\omp works\omp-zh.export.raw。
- **其它仓库**：voxy-net-lod / sts2-spire1 扫描亦见 o_Obl 与 sigdump bin/obj 构建产物入库，
  按用户指示未动，留档待决。凭据类模式（token/key/URL 凭据/私钥）三仓库及全工作区均零命中。
- **归因与上游反馈（同日）**：对官方原版资产字节级核验——v18.0.1 含全部不安全模式
  （daemon `windowsHide:!…Console`×1、MCP 三元式×1、kernel×3），v17.2.12 同类存在；
  上游 main 分支 spawn-options.ts 今日仍为 `windowsHide: !opts.hostHasInheritableConsole`。
  结论：上游 bug，与 omp-zh 改动无关（zh 仅改字符串字面量+catalog 字段）；18.0.1 与 main 均未修，
  补丁2 保留必要。已提上游 issue：
  https://github.com/can1357/oh-my-pi/issues/9463 （正文存 work/issue-body.md）
- **补丁3（18.0.3 起）：停止恢复无上限**——用户指令"任何可重试情况，agent 不在要求前停止"。
  上游四处硬编码放弃上限全部抬至 1000000：EMPTY_STOP_MAX_RETRIES=3、UNEXPECTED_STOP_MAX_RETRIES=3
  （turn-recovery.ts）、SESSION_STOP_CONTINUATION_CAP=8（agent-session.ts）、MAX_YIELD_RETRIES=3
  （task/executor.ts yield 阶梯）。结构性保护保留：预算停止折叠阶梯、终端错误跳过提醒、
  loopGuard 与用户中断优先。压缩锚点 `KRo/XRo`、`xbo`、`sct` 随版本漂移，重定位方法：
  模块横幅注释 → 常量簇 → 渲染点反查。14/14 补丁 OK，verify PASS，smoke omp/18.0.3。
- **#9463 实证回帖（同日）**：真实复现采集完成——写入者=hub daemon 启动的 STS2/Godot 游戏本体
  （autoslay-p1smoke4.log，3959 行 [INFO]，指纹行可屏上核验）；拓扑=六实例共享 broker，
  daemon 附着宿主(最早实例)控制台跨窗绘制；rewrite-readme 窗口(soundmodgui)为自身作用域
  broker 同理。报告 G:\\omp works\\.tooling\\leak-evidence\\REPORT.md；英文评论已发：
  https://github.com/can1357/oh-my-pi/issues/9463#issuecomment-5387962670 （附更窄修复选项供评估）。
- **元数据"消失"调查（08-24）**：18.0.3 实例退出后记录缺用量脚注与 "error; retried"。实测数据完整
  （usage/duration/ttft/retryRecovery 全在 jsonl）；根因=上游重放渲染缺口：retryRecovery 仅实时路径
  应用（transcript-builder 不调 applyRetryRecovery），尾条 assistant 的 pending-usage 无后继消息不 flush，
  provider-error 回合不计费本就无脚注。退出原因：03:07 sighup=误杀标签页；06:40 集群=bai 断连终结 turn
  （bai 已全配置抹除：models.yml/config.yml overrides/.env；DEVLOG 引用改写推送 0860ac6）。
  详细分析 G:\\omp works\\.tooling\\leak-evidence\\metadata-findings.md。后续 A/B/C 待定。
- **补丁4（08-24）：重放渲染完整性**——用户报三实例退出后记录缺用量脚注与 retried 标记。
  实测数据完整（usage/duration/ttft/retryRecovery 全持久化），根因为上游重放渲染缺口：
  A) retryRecovery 仅实时路径应用 → builder assistant 尾部补调 applyRetryRecovery；
  B) rebuild/append 尾 flush 带 readArgs/pendingTools 为空前置条件 → 崩溃回合工具永 pending
  扣住脚注 → 改无条件 flush（两处）。锚点 KRo/xbo/sct/#y/#T 等压缩名跨版本漂移需重抓。
  第三症状（输入横幅塌缩成细线、工具块被吞、下一条消息全量恢复）=渲染调度家族，
  上游无重复 issue，未打补丁，留作候选 issue C。构建产物待下载完成后自动接续。
- **18.0.4 重建（08-24，资产由用户提供 I:\Downloads，sha256=8e04c83f… 与官方清单一致）**：
  补丁2 九锚点原样；补丁3/4 涉及文件上游有改动 → 锚点漂移重抓：常量簇 KRo/XRo→uSo/cSo、
  续跑 xbo→YHs、yield sct→ppt；replay 尾块仅 helper 改名（tX→_X、aP→RP），#t/#e/#y 未变。
  16/16 OK，verify PASS，smoke omp/18.0.4 helpCJK=1643。产物 work\\omp-zh.exe 待交付
  （退出后 `node update-zh.js --force`）。第三症状（输入横幅塌缩/工具块被吞）仍未打补丁，
  上游无重复 issue，留作候选 issue C。

## 2026-08-27：18.0.6 重建 + gh-proxy 镜像下载
- **镜像规范落地（update-zh.js）**：exe 下载 URL 拼接 `https://gh-proxy.com/` 前缀（152MB 实测 13.7s，
  sha256 与官方 SUMS 逐位一致）；失败自动回退直连；SHA256SUMS 始终走官方源防镜像篡改。
  技能 omp-zh-update 已同步。管线 bug 修复：MIRROR 常量插入误吞 ASSET 行（下载前即 fail-fast）。
- **补丁锚点迁移（patch-zh.js，18.0.4→18.0.6）**：补丁2 九锚点原样全中；
  补丁3 常量簇 uSo/cSo→GAo/HAo、续跑 YHs→fvo、yield ppt→Jdt；
  补丁4 helper _X→fQ、RP→BP、flush #y()→#T()。语义核验：GAo=unexpected-stop 上限
  （"Assistant returned unexpected stop after retry cap"）、HAo=empty-stop、fvo=session_stop
  续跑（"session_stop continuation cap reached"）、Jdt=yield 提醒（"after 3 reminders"）。
  旧 18.0.4 锚点保留为 legacy 规则（新 bundle 上 found=0 属预期 WARN）。
  17/17 有效规则 OK，verify PASS，smoke omp/18.0.6 helpCJK=1643。
- **交付延迟**：G:\omp\omp-zh.exe 被运行中会话占用（EBUSY）；产物在
  work\omp-zh.exe（152,371,200 B）。会话退出后 `node "G:\omp works\omp-zh\update-zh.js" --force`
  交付（预下载 exe 与 SUMS 已缓存，跑一次秒级）。
- 未翻译文本 11103 句型（与 18.0.4 持平，无新增翻译债）。

## 2026-08-27（二）：18.0.7 重建
- **上游当天连发两版**。18.0.7 minifier 又改名：stopcap 簇 GAo/HAo→WAo/GAo（GAo 复用为 empty-stop）、
  续跑 fvo→dMo、yield Jdt→Rgt；replay helper fQ/BP→xX/IP、主组件类 Dc→qc、方法 #w→#R；
  flush 门在 18.0.7 原生就是 #T(t.message)+#y() 形态——18.0.4 锚直接命中（found=2）。
- 规则文件新增 18.0.7 锚（legacy 18.0.4/18.0.6 保留）。跑批输出行有丢失显示但实际全部生效
  （终验 5/5 PASS：WAo/GAo/dMo/Rgt=1e6、o.applyRetryRecovery 注入、无条件 flush ×2）。
  verify PASS，smoke omp/18.0.7 helpCJK=1643。产物 work\omp-zh.exe（18.0.7+全补丁），
  交付仍因 G:\omp\omp-zh.exe 被三个运行中会话锁定而延迟（EBUSY），退出后 --force 秒级交付。
- 未翻译 11118 句型（较 18.0.6 +15，上游新增少量文本）。

## 2026-08-28：18.0.9 重建
- **上游 18.0.8→18.0.9 连发**。18.0.9 变化：四个 leak spawn 点（tunnel/ssh/uploader-sh/uploader）
  上游加了 `cwd:` 参数（tunnel/uploader-sh 为 j7()、ssh 为 pSt.homedir()、uploader 为 l）——
  说明上游在整理工作目录语义，但 windowsHide 仍未加，补丁继续；其余 5 个 leak 锚原样命中。
- stopcap 再漂移：`WAo` 名字保留（unexpected-stop），empty-stop `GAo→UAo`、簇 `sUa/nUa→oWa/rWa`、
  续跑 `dMo→pMo`、yield `DTa/Rgt→uCa/Yft`。replay：helper `xX/IP→oX/CP`、settings `be→Re`、
  **新增 showTurnTime 行**（`this.#l = ...display.showTurnTime...`，锚点须包含）、flush `#y()→#C()`。
- 12/12 终验全 PASS（catalog、stopcap×3、replay×2、leak×6 形态校验）。verify PASS，
  smoke omp/18.0.9 helpCJK=1643。未翻译 11159（较 18.0.7 +41）。
- 交付仍 EBUSY（运行中会话锁定 G:\omp\omp-zh.exe）；产物 work\omp-zh.exe。

## 2026-08-28（二）：模型选择器/会话树补译（dict-tui +65）
- **用户报告**：tree 对话与提供商选择页有未翻译文本。扫描确认两大 UI 面完整未译：
  `modes/components/model-hub.ts`（/models 选择器）与 `tree-selector.ts` + Branch 覆盖层。
- **新增 65 条**（全部 full 整串匹配，逐条与 bundle 逐字符核验存在）：
  - model-hub：全部键盘提示条（Enter 指派/选择后备/受保护模型、↑↓ providers·→roles、
    rows·Enter replace/pick/cycle 等 12 条）、状态行（Provider unavailable/requires auth/
    not refreshed/Discovery 0 models/cached list）、Roles/All models/Models 表头、
    New role name:(letters…)、+ New role/fallback…、less than a minute ago、Type to search。
  - tree-selector：Branch from Message 标题+提示、No user messages/No matching messages、
    Synthetic input、entry 类型标签（branch summary/service tier/credential pin/ttsr
    injection/reset boundary/session init）、角色前缀（user:/developer:/assistant:/advisor:）、
    (no content)/(cleared)/(aborted)、过滤器标记 [无工具]/[用户]/[已标记]/[全部]/[默认]、
    Search:/Label (empty to remove):/enter: save esc: cancel。
- **修正 2 条漂移**：Press Backspace…/Press Alt+A… 上游删了行首双空格（dict 原带 2 空格 → 永不命中）。
  **删除 2 条死条目**：New session started with handoff context、Enter to toggle…Esc to go back
  （18.0.9 已无此文案）。
- **编码要点**：bundle 内 \xB7/\u2191 是字面反斜杠序列；dict JSON 存双反斜杠；构建时 ascii-escape
  后校验需查 \\\\u63d5 形式而非解码后字符。翻译后 142/142 条全部在产物中命中（双语对照 21/21 抽检 PASS，
  "残留原文"7 处均为对照后半段）。gap 11159→11101。verify PASS，smoke omp/18.0.9 helpCJK=1643。

## 2026-08-30：18.0.11 重建 + 镜像链改造
- **gh-proxy.com 当日瘫痪**（20s 探针 0B/s，管线下载仅 ~50KB/s）。用户指点聚合站
  github.akams.cn：从其 Next.js chunk 挖出 48 个镜像域，全量 3MB 并行探针测速，
  top5：js.jiangss.shop 1.38MB/s、ghproxy.felicity.land 1.30、cfgh.ikgy.top 1.26、
  gh.meali.top 1.21、gh.dpik.top 1.06（瞬时峰值更高，实际下载 150MB/14s ≈ 11MB/s）。
  update-zh.js 改 MIRRORS 回退链（8 镜像+直连兜底，逐个 try，>1MB 即接受、sha256 兜底校验）。
- **18.0.11 锚点再漂移**：leak 三处 cwd helper j7()→g6()、pSt→DSt（uploader 两处未变）；
  stopcap 簇 MIo/OIo/aHa/lHa、续跑 s_o、yield mba/Rmt；replay settings Re→ke（helper _X/IP 未变）。
- **上游吸收补丁4B**：rebuild/append 尾部 flush 已原生无条件化（this.#C() 直调），
  tail-flush 规则自然失配保留无害。补丁4A（retryRecovery 重放）上游仍未修，继续打。
- 12/12 终验 PASS，verify PASS，smoke omp/18.0.11 helpCJK=1618（-25：上游文案微调致个别词条失配，
  gap 11101→11276 待补译）。交付 EBUSY（本会话运行中占用），退出后 --force 秒级交付。

## 2026-09-02：18.1.2 重建（次级跳版）+ 结构扫描准则
- **用户确立开发准则**：次级版本号变动（18.0.x→18.1.x）＝大版本级变化，必须先扫整体结构再定位锚点
  （已沉淀技能）。本轮实证该准则的必要性：
- **catalog 扁平化**：provider 分节结构消失，条目内联 `provider:` 字段，同一模型散布多个目录表
  （v4-flash 6 条 / v4-pro 7 条带 supportsForcedToolChoice:true）。补丁1 重写为全表扫描：
  收集所有含 true 的条目窗口、200 字符去重（同条目 id/name 多次出现）、从后往前替换防偏移漂移。
- **上游回退 flush 无条件化**：18.0.11 采纳的原生无条件 flush 在 18.1.2 被撤回（gate 复活），
  补丁4B 需重新打——证明「上游会反复横跳，flush 门存在性每版必查」。
- 其余锚点漂移：leak cwd helper g6()→M9()、DSt→AEt、chrome launch d→c；stopcap
  q_o/L_o/OBa/IBa、uPo、Xxa/Ygt；replay helper uQ（BP/ke 未变）、方法 #b→#S、组件 _c→Pp。
- 13/13 终验 PASS（含 catalog 全表扫描后 true 清零）。verify PASS，smoke omp/18.1.2 helpCJK=1618。
  gap 11415 待补译（+314，上游 18.1.x 新增大量文本）。交付 EBUSY（运行中会话），产物
  work\omp-zh.exe（160,935,424 B）。

## 2026-09-06：18.1.11 重建（模块表爆炸修复）
- **首跑 segfault**：构建产物 --version 崩溃（Bun 段错误），原版 exe 正常。根因：18.1.11
  模块表从 7 个爆到 **309 个**（上游内联 lint 规则文档等），Web 资产模块从固定 3/4/5 漂到
  71/72/73（oauth→17）。build-zh.js 硬编码槽位把翻译后的 HTML/JS 写进了现在的 anthropic.md/
  deepseek.md 文档槽 → 模块表损坏 → 启动崩溃。
- **管线改造（结构性修复，一次到位）**：
  - extract-cli.js：动态发现 Web 资产索引（basename 匹配 + hash 后缀剥离），写
    work/web-mod-indices.json；同时输出版本无关稳定别名 web-html/web-js/web-views/web-oauth
  - web-translate.js：改为 slot 制（html/oauth/html-node + js/views 字面量），不再读 mod3/4/5
  - build-zh.js：newContents 按动态索引填充；顺带把 oauth.html 纳入 HTML 翻译面（此前从未覆盖）
- **补丁锚点（次级版本准则执行）**：leak cwd helper M9()→sj()、AEt→oRt；
  chrome launch **上游已带 windowsHide**（吸收我们的补丁，规则保留 done 检测自动 SKIP）；
  stopcap 簇扩为 5 常量（URo unexpected/GRo empty/**zRo malformed-call 新增**，三者全抬 1e6）、
  续跑 mwo、yield Ept；replay helper Q8/u_ + 字段序变化（#l=usage 文本、#a=showTurnTime）、
  flush gate 上游仍保留（继续打）。
- 12/12 终验 PASS + Web 模块落位验证（mod71 htmlEsc=89、mod72/73 jsEsc=36）。
  verify PASS，smoke omp/18.1.11 helpCJK=1577。gap 11220（较 18.1.2 -195，上游删了些文本）。
  产物 work\omp-zh.exe（160,803,328 B）；交付 EBUSY 待会话退出。

## 2026-09-07：18.1.12 重建（Bun 串区溢出段错误根因与补偿机制）
- **症状**：构建产物 --version 段错误（Bun 1.4.2 crash），原版正常；verify PASS 但 smoke 崩。
  通过 20+ 个二分构建实验定位根因：**Bun 1.4.2 standalone 加载器要求模块串区（name+contents
  blob）总长不得超过原始值**（在 mod0 已增长的前提下；净增长为零则正常，如 css -800 平衡
  html +751 的实验）。阈值并非对齐/内容相关，是总长约束。18.1.11 恰好没触发纯属尺寸运气。
- **修复（build-zh.js 补偿机制）**：构建时计算串区新旧总长，若超原值则从 CHANGELOG 模块
  （纯 markdown 非关键）尾部裁掉等量字节补齐。本轮裁 179,006 字节，串区回到与原版逐字节
  等长（74573085）。三次 --version + --help 稳定。
- **事故复盘（重要教训）**：本轮曾把 18.1.11 的 cli 常量（URo/mwo/Ept/sj/oRt）误当 18.1.12
  锚点写入规则--分析时读的是前一天遗留的 cli-18_1_11.js。教训：**重定位锚点前必须重新
  extract 当前版本 cli 并在文件名含版本号的产物上验证常量存在**（已写入本 DEVLOG 供下轮自查）。
  真实 18.1.12 常量：stopcap xwo/Swo/Ewo（5 簇）、Qwo 续跑、rua/Gpt yield；leak cwd
  sj()->rj()、oRt->CRt；replay helper eY/d_、方法 #x。
- **网络插曲**：GitHub API 当日大面积 504/502（gh api 与 api.github.com 均瘫，镜像恢复 SUMS）；
  管线改用缓存 exe 手动接续（extract->patch->scan->build->verify 全手工串联）。
  可选改进：update-zh.js 在 gh api 失败时回退用镜像查 latest tag。
- 13/13 终验 PASS（含 blob==vanilla、chrome 上游原生 hide）。verify PASS，smoke
  omp/18.1.12 helpCJK=1577。产物 work\omp-zh.exe；交付 EBUSY 待会话退出。
  gap 11235。已推送 812c6e2。

## 2026-09-09:18.1.13 补记 + 管线交付/覆盖率盲区修复 + 补译还债
- **18.1.13 轮补记(日志曾落后现实一轮,questioner 代理盲区提问揪出)**:09-07 晚完成第 5 轮
  重建并成功交付:G:\omp\omp-zh.exe --version=18.1.13,与 work\omp-zh.exe sha256 逐字节一致
  (20d10023..),交付版 helpCJK=1577。锚点(leak cwd sj()->rj() 之外本轮 commit 6a2ceac 记录的
  OMa/IMa 簇,uua/Upt,TRt ssh)与镜像 API 回退改造当时已随 6a2ceac 推送,仅 DEVLOG 缺记。
- **交付链路修复(build-zh.js)**:此前 copy 失败仅 console.log,EBUSY 延迟交付完全依赖人工补跑
  (08-22 曾因此把坏版本留在主文件位,09-06/09-07 连续两轮"交付待会话退出"后无人核验)。
  现改为:写 `<target>.new` 后 rename 交付(规避运行中 exe 的写锁,rename 失败重试 10x3s),
  成功后回读交付目标 --version 与 work 产物比对核验,任一失败 **exit 1**。
- **冒烟目标修复(update-zh.js)**:smoke 原测 work 产物,交付失败照样绿灯并写 last-version——
  "work 产物好但用户手里还是旧版"的盲区。现 smoke 改测交付目标(no-deliver 模式仍测 work)。
- **覆盖率环比门槛(update-zh.js,新)**:每轮把 {version, helpCJK, gap} 追加进
  work/.omp-zh-cov-history.json;helpCJK 环比下降或 gap 环比上升 -> 显式 WARN(不阻断,
  但须记本日志并还债)。历史基线已按 DEVLOG 各轮实测回填(18.0.9 起六轮)。
  此前四轮 helpCJK 1643->1618->1618->1577->1577 静默回退,gap 11101->11235,无任何告警。
- **dict 死条目清理**:18.1.13 死条目 155 条已确认(上游改文案即失配),本轮清理。
- **补译还债**:08-28 以来首次。18.1.14 未命中句子型清单筛选(帮助/设置/TUI 面),按
  dict-* 分域补译,细节见下。

## 2026-09-10:18.1.16 补译还债 + 交付看护机制 + 管线三处契约修正
- **背景**:18.1.14 轮(09-09)完成管线修复后,另一会话于 09-10 构建了 18.1.16(commit 4a8425e,
  锚点 jko/Kko/Vko 簇,Cbo,sca/fct,kj/KRt leak,g8/R_ replay;上游 dispatch #y->#h,flush 补丁仍需
  并已打).本会话在其上完成还债与收尾.两轮 gap 数据:18.1.16 首建 11305(上游 +70 新文本),
  本轮补译后 **11101(-204)**.helpCJK 1577 持平(登录向导/状态行不在 --help 面).
- **补译还债(08-28 以来首次实付)**:
  - 新增 `work/out-login.json` 188 条(全部 full):OAuth/登录向导全链路--各提供商 "Paste/Copy
    your XX API key"、凭据缺失提示(No xAI/DeepInfra/Anthropic/Codex/Kagi/Synthetic/Parallel
    credentials..)、Smithery 全家、OAuth 错误/刷新/回调、Xiaomi 三区域 Token Plan、
    QwenCloud 区域选择、GitHub Copilot 401/403、无模型/选择类短句、Nothing to copy 家族.
  - 新增 `work/out-status.json` 16 条:TUI 状态行(Loading xx/Checking xx/Verifying xx,
    8 条为 `\u2026` 字面转义形态).
  - **死条目清理**:18.1.13 的 155 条 + 18.1.16 新死 4 条(loop 模式/Rename session 描述变更
    及 2 条 tools 长文本)全部删除,dict-tools 17->3;staging out-*.json 清死 54+1 条.
    复扫死条目 0.
  - **编码陷阱(本轮实证,记档)**:(a) 终端/工具链显示层把三个 ASCII 点折叠成两个 --
    `cli.includes(两点串)` 会因"两点是三点的子串"假通过,凡以 `..` 结尾的 from 必须用
    codepoint 级比对定真身(本轮 7 条因此报废重修);(b) `http://127.0.0.1:8080;` 后的
    `customize).` 尾括号句点形态要以 scanStrings 实收字面量为准,不能手抄;
    (c) `->` 实为 `\u2192`,`—` 实为 `\u2014`(dict 存双反斜杠形态).
- **交付看护机制(新文件 deliver-pending.js)**:运行中会话的映像锁使 rename/copyFile 双双
  EPERM/EBUSY(09-09 实测,普通 r+ 句柄不等价).build-zh.js 检测到锁死时拉起 detached
  node 看护:每 30s 试 rename,成功即交付(rename 原子移动),24h 超时自然退出;staged 文件
  消失视为他处已交付,幂等退出.看护不 spawn 目标 exe(Bun 运行时行为不可控,且避免抢
  第二实例).**演练实证**:模拟句柄锁 8s 释放,看护 exit 0,目标被替换为 staged 内容.
  当前实况:G:\omp\omp-zh.exe 仍 18.1.13(被运行中会话 pid 18688 锁定),`.new` 已 staged
  为 18.1.16 含全部还债,看护 20188 在位,锁释放后自动交付.
- **管线三处契约修正**:
  1. build-zh.js `--deliver` 改为显式 opt-in(默认空 = 只构建不交付) -- 原默认值
     G:/omp/omp-zh.exe 使任何不带 flag 的调用都悄悄改主文件位,--no-deliver 契约名存实亡.
  2. update-zh.js gap 扫描并入 work/out-*.json staging(与 build-zh 字典合并同源)--
     否则补译后 gap 环比虚高,覆盖率门槛失真.
  3. update-zh.js 冒烟三态:交付目标已是新版(DELIVERED)/旧版但 staged 在位(DEFERRED,
     测 work 产物)/都不满足(FAIL).杜绝"work 产物好但用户手里旧版"盲区,同时不再把
     看护中的延迟交付误判为失败.
- **18.1.16 终验**:extract->patch(25/47,锚点见 4a8425e)->scan(死 0/gap 11101)->
  build(3234 字面量,串区补偿 -195264)->verify PASS->smoke DEFERRED version=18.1.16
  helpCJK=1577.cov-history 已记 {18.1.16, 1577, 11101}.

## 2026-09-11:18.1.17 构建 -- Bun 1.4.2 打包布局变更(rebuild.js 重写)+ watchdog 构建检验入规范
- **背景**:上游 18.1.16 -> 18.1.17.常规锚点重定位外,首次命中 **rebuild.js 布局级不兼容**:
  产物 smoke 段错误,零改动 roundtrip 也崩 -- 排除补丁/翻译因素(bisect 四组各自单独构建
  全崩),根因在打包图重建.
- **Bun 1.4.2 打包布局变更(实证,18.1.17 vs 18.1.16)**:
  1. **names 与 contents 分离打包**:旧版逐模块交错 `[name\0 contents\0]`,新版
     `[全部 contents(模块序)][全部 names(模块序)][模块表]`.旧 rebuild 按交错布局重排,
     模块表位置提前 199B,覆盖 311-314 号模块的 name 串 -> 启动即段错误.
  2. **模块表与 argv 之间新增 1268B 区域**(1243 零 + u32=1,用途未知但 loader 运行时读取):
     旧 rebuild 丢弃 -> 同样段错误.18.1.16 布局中该区域不存在(table end == argv start).
  3. graph 尾部结构确认:`[表][新增区域][argv(24B 'user-agent=omp/x.y.z')][offsets(32B,
     byte_count 字段自引用)][16B marker '\n---- Bun! ----\n']`,header u64 = 全部长度.
- **rebuild.js 重写**:按新布局重建 contents 区/names 区/模块表;tailZone
  ([表尾, argv) 原 slice)与 argv 原样保留;offsets 按新位置重新生成.
  验证:零改动 roundtrip 与 vanilla 字节数完全相等(161,257,984),315 模块重解析全等,
  `--version` 正常;`--deliver` 全链路通过.
- **18.1.17 锚点迁移**(minifier 全改名,簇形不变):
  - stopcap:`Xbo/c0a/Qbo/Zbo/d0a` 簇(A/C/D->1e6),续跑 `xxo`(8->1e6),yield `vda/zct`
  - leak:tunnel `kj()->Fj()`,ssh `KRt->wwt`,uploader-sh 同步改
  - replay:`g8->_Y`,`R_->v_`,showTurnTime `#S->#x`;**flush 门回归**(18.1.16 曾原生
    无条件化,18.1.17 又加回 gate `#t/#e` 判定 -> 补丁重新启用,`#g(t)+#R()` x2 无条件)
- **omp-watchdog 构建时检验(入规范)**:update-zh.js smoke 之后新增检查块:
  1) `watchdog.js --once` 跑通(扫描逻辑健康);
  2) wmic 查常驻进程(命令行恰为 `node watchdog.js`,排除一次性调用误命中).
  失败不阻断交付(watchdog 是旁路告警),WARN 显式提醒.已端到端验证输出
  `watchdog check OK: --once pass, resident process alive`.
- **终验**:12/12 PASS(stopcap x3 / replay 注入 / flush 门清零 x2 / leak x4 / catalog v4
  true=0 / 串区 == vanilla 75,153,248).smoke `omp/18.1.17 helpCJK=1577`,verify PASS.
  交付 DEFERRED(会话占用,`.new` staged + 看护在位).

## 2026-09-11(晚):补丁 5 encrypted-content 回放自愈(18.1.17 增量,未升级版本)
- **背景**:agentrouter(ps.air-outer.com)新增 gpt-6-astra,走 Responses 线。omp 回放上一轮
  encrypted_content(Fernet `gAAA..`)时偶发 400 `The encrypted content .. could not be verified.
  Reason: Encrypted content could not be decrypted or parsed.`。会话时间线实证:前 3 次回放成功、
  第 4 次失败 -- 上游是账号池,密文与产出账号绑定,轮换后无法解密。
- **根因链(源码级)**:Responses 线 T7/bKe 无条件重放 thinkingSignature(含 encrypted_content);
  上游 omp 已有自愈(错误归类 StaleResponsesItem -> #jo 重置 provider session ->
  nativeHistoryReplayWarmed=false -> 重试裸发),但分类正则 PCr 不覆盖该文案 -> 400 被判为
  永久错误,重试死循环。
- **补丁 5(patch-zh.js)**:第一版只扩 PCr 不够 -- 分类条件 `oRr(e) = Xzs[0].test(e) ||
  Xzs[1].test(e) && PCr.test(e)` 要求文案同时含 `previous response`(Xzs[1]),agentrouter 文案
  命不中.且实测(2026-09-12 凌晨)agentrouter 的 astra 是 **Azure OpenAI 资源池**:密文绑定
  创建它的资源,回放落别的资源报 `different Azure OpenAI resource`;strip 密文回放报
  `Item with id .. not found` -- reasoning item 回放完全不可行.主路径 Xni()/Obe() 硬编码
  `includeThinkingSignatures: true`,重置 provider session 也挡不住下一轮回放.
  修正版四处补丁:
  a) `Xzs[0]` 加分支 `|\bencrypted content\b[^.'"]{0,200}?could not be (?:verified|decrypted|parsed)`
     (密文 base64 夹在中间,不能写死相邻文案;模拟分类实测通过)
  b) `PCr` 加 `|encrypted content could not be decrypted`(双保险,覆盖 Xzs[1] 路径)
  c) compat schema 加 `replayResponsesReasoning?`: boolean
  d) T7 gate 钳制:`e.model?.compat?.replayResponsesReasoning === false` -> c=false
     -> bKe 跳过 thinking 回放(所有调用点共用 T7,单一入口)
  效果:该 400 归为 stale-responses-item 零延迟重试(g=0)+ 会话自动恢复;models.yml 给
  agentrouter-responses/gpt-6-astra 设 `compat.replayResponsesReasoning: false` 后彻底
  不回放 reasoning item.端到端验证:function_call -> function_call_output -> 追问 全通.
  最终版已交付(7E1302C8..),中途版 2E14C040(缺 c/d)16:06 曾误交付后被替换.
- **构建**:src 必须用 work/omp-dl.exe(缓存的官方 18.1.17 vanilla,315 模块),不能用
  G:/omp/omp.exe(旧版 8 模块,产物 prelude 解析崩)。delta +195,077,CHANGELOG 补偿。
  产物 161,257,984 B 与上一版同尺寸,`--version` = omp/18.1.17,正则已注入。
- **交付**:G:/omp/omp-zh.exe 被本会话占用(EPERM/EBUSY),deliver-pending.js 看护挂起,退出后自动替换。
- **注意**:patch-zh 补丁 1(deepseek supportsForcedToolChoice)在 18.1.17 报 WARN -- 上游已原生
  改为 `false`,补丁目标达成,SKIP 分支未覆盖该表述(良性,下次升级可顺手收敛)。
- **配置侧**:models.yml 新增 agentrouter-responses 块(api: openai-responses,astra),
  config.yml default 角色指向 agentrouter-responses/gpt-6-astra:xhigh。详见
  G:/omp works/docs/omp-agentrouter-config.md。
