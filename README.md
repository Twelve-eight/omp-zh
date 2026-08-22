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
update-zh.js      主控：检测新版本 → 下载校验 → 提取 → 补丁 → 构建 → 验证 → 交付
extract-cli.js    从 Bun standalone exe 提取入口 JS 与 Web 资产模块
patch-zh.js       确定性模型兼容补丁
scan-gaps.js      新增英文文本发现器（差距清单 + 死条目）
build-zh.js       字典合并 → 翻译 → ASCII 转义预补偿 → 重建 exe → 交付
verify-zh.js      产物验证（字面量一致/字符串闭合/括号/CJK 注入）
translate.js      翻译引擎（full/sub 双模式字典命中）
dict-*.json       9 个领域字典，2400+ 条目
docs/             管线文档与排查报告
DEVLOG.md         开发日志（完整决策与踩坑记录）
```

### 日常更新

```sh
node update-zh.js            # 上游发新版后一键重建
node update-zh.js --check-only   # 只检测
```

## License

MIT — 见 [LICENSE](LICENSE)。版权归上游原作者所有；汉化部分同样以 MIT 发布。
