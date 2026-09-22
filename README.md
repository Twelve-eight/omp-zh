# omp-zh — Oh My Pi 非官方中文汉化版

基于 [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) 的 **非官方中文汉化构建**。
上游以 [MIT 许可证](LICENSE) 发布，本仓库遵循同一许可证。

> ⚠️ 本项目与官方 oh-my-pi / omp.sh 无任何关联。问题反馈请优先到本仓库，不要去上游。

## 当前版本

**18.0.0**（对应上游 v18.0.0）

- 界面全量汉化：CLI 帮助、TUI、设置界面（含全部 settings schema 标签与描述）、Web 导出页
- 3006+ 处翻译、双语对照格式（`中文/English`）
- 附带三个行为补丁：deepseek-v4-flash/pro 模型 `supportsForcedToolChoice` 兼容修复
- 已适配 Bun 1.4.0 standalone latin1 解码缺陷（翻译文本 `\u` 转义预补偿）

## 使用

从 [Releases](../../releases) 下载 `omp-zh.exe`（或带版本号的副本），替换/运行即可。配置、会话、技能与官方版完全兼容（共用 `~/.omp`）。

## 构建管线（本仓库内容）

```
update-zh.js      主控:检测新版本 -> 下载校验 -> 提取 -> 补丁门 -> 构建 -> 验证 -> 冒烟 -> 交付
extract-cli.js    从 Bun standalone exe 提取入口 JS 与 Web 资产模块
patch-zh.js       确定性模型兼容补丁(warn>0 不写回,直接中止管线)
scan-gaps.js      新增英文文本发现器(差距清单 + 死条目)
build-zh.js       字典合并 -> 翻译 -> ASCII 转义预补偿 -> 重建 exe(只构建,不交付)
deliver-zh.js     唯一交付入口(复核 sha256/版本 -> 原子 rename -> 落位后回读)
verify-zh.js      产物验证（字面量一致/字符串闭合/括号/CJK 注入）
translate.js      翻译引擎（full/sub 双模式字典命中）
dict-*.json       9 个领域字典，2400+ 条目
docs/             管线文档与排查报告
DEVLOG.md         开发日志（完整决策与踩坑记录）
```

### 校验信任边界

镜像只用于传输 exe 字节,不提供期望摘要.摘要按序取自操作者 `OMP_TRUST_DIGEST=<64hex>`,
官方 `SHA256SUMS.txt` 资产,官方 Releases API 的 `assets[].digest`;三者都不可用时管线
失败关闭,不交付.上游自 v18.2.1 起不再发布 `SHA256SUMS.txt`,正常走 API digest.
官方源不可达时,自行核实发布摘要后重跑:

```
set OMP_TRUST_DIGEST=<64 hex sha256>
node update-zh.js
```

### 日常更新

```sh
node update-zh.js            # 上游发新版后一键重建
node update-zh.js --check-only   # 只检测
```

### 交付顺序

顺序是硬的:**补丁门 -> 隔离构建 -> verify -> 冒烟 -> 交付**.前四步只作用于 `work\omp-zh.exe`,
正式安装目标在最后一步之前不会被替换;任一步失败都不碰目标,不留可自动交付的候选,
不写成功版本标记.交付只搬"刚通过验证的那一份字节"(sha256 复核).
目标被运行中的会话锁定时报 `deliver DEFERRED`:已验证候选 staged,占用退出后自动补交付.

## License

MIT — 见 [LICENSE](LICENSE)。版权归上游原作者所有；汉化部分同样以 MIT 发布。
