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
- **重试加固**：retry.maxRetries 50→**；fallbackChains 全部角色追加第二提供商 bai/deepseek-v4-flash
  （原配置所有角色回退指向主模型自身，服务抖动时无真实备选）。"stream closed before finish_reason" 错误
  在上游归类为 Transient 可重试，** 次 + 跨提供商回退双保险。
- **用户修正**：不要跨模型回退（保持同一模型）。已撤销 bai 回退项，modelFallback: false，
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
