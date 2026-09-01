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
