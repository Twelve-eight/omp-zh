# 参与 omp-zh

感谢你愿意改进 omp-zh。下面说明能做什么、怎么做，以及提交前要跑哪些检查。

## 可以帮忙的事

- **报告翻译问题**：错译、漏译、术语前后不一，或者某段文字应该保持英文。用 [翻译问题](https://github.com/Twelve-eight/omp-zh/issues/new?template=translation.yml) 模板，附上截图最好。
- **报告汉化版独有的问题**：崩溃、乱码、某个功能在官方版正常而在 omp-zh 中异常。用 [问题反馈](https://github.com/Twelve-eight/omp-zh/issues/new?template=bug_report.yml) 模板。官方版也能复现的问题请提交到 [上游](https://github.com/can1357/oh-my-pi/issues)。
- **补充译文**：在 `dict/` 中增改条目。
- **适配上游新版本**：迁移补丁与检查集，见 [docs/updating.md](docs/updating.md)。
- **改进工具与文档**：`build.js`、`lib/`、`scripts/`、`docs/`。

## 开发环境

- Node.js 20 或更高版本，不需要安装依赖。
- `curl`（Windows 10 及以上自带）。
- 构建与验证需要 Windows：检查集会运行构建出的 exe。修改字典时只跑 `node scripts/check-dict.js` 也可以。

```powershell
git clone https://github.com/Twelve-eight/omp-zh.git
cd omp-zh
node scripts/fetch-upstream.js 18.14.0
node build.js 18.14.0
node verify.js 18.14.0
```

## 修改译文

1. 先读 [docs/dictionary.md](docs/dictionary.md)。重点是三类不能翻译的文字：发给模型的文字、代码用来比较的值、专有名词。
2. `from` 必须与上游源码中的字面量逐字一致。不确定时用 `node scripts/extract.js work/omp-dl-<tag>.exe` 导出模块后搜索。
3. 界面文字写成「中文/English」双语，英文部分照抄原文。
4. 术语与 [docs/dictionary.md](docs/dictionary.md#术语) 中的表保持一致。

## 修改补丁或构建脚本

- 每处补丁先断言锚点存在，找不到时抛错，不能静默跳过。
- 补丁要能说清动机，并写进 [docs/patches.md](docs/patches.md)。
- `verify/<版本>.js` 中加入对应检查，并确认它在上游原版 exe 上会失败。

## 提交前

```powershell
node scripts/check-dict.js
node test/install.test.js
node build.js <版本>     # 改了字典、补丁或 lib/ 时
node verify.js <版本>
```

Pull Request 里请写清改了什么、为什么改；翻译类改动请列出英文原文。CI 会运行字典检查、安装脚本测试与语法检查。

## 提交说明

一行摘要，用英文或中文均可，说明改了什么，例如 `dict: translate model selector hints` 或 `18.14.0: relocate patches`。

## 行为准则

参与本项目即表示同意遵守 [行为准则](CODE_OF_CONDUCT.md)。

## 许可

提交的内容以 [MIT 许可证](LICENSE) 发布。
