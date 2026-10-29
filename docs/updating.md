# 适配上游新版本

上游 omp 发版频繁，每个版本的 exe 都重新压缩，变量名与模块序号都会变。适配新版本时，要为它写一份补丁集和一份检查集，补齐新增文字，再构建和验证。

下文用 `<new>` 表示新版本号（如 `18.14.0`），`<prev>` 表示仓库里已有的最近版本。

## 1. 下载并校验官方 exe

```powershell
node scripts/fetch-upstream.js --check --exe <你正在用的 omp.exe>
node scripts/fetch-upstream.js <new>
```

文件写到 `work/omp-dl-<tag>.exe`（`<tag>` 是去掉点的版本号）。期望的 sha256 只取自官方 Releases（`SHA256SUMS.txt` 资产或 API 的 `digest` 字段），镜像只负责传输字节。官方摘要拿不到时脚本失败；你可以自行核实摘要后用 `OMP_TRUST_DIGEST=<64 位十六进制>` 重跑。

## 2. 确认打包格式没变

```powershell
node -e "const fs=require('fs');const {rebuild}=require('./lib/rebuild.js');const b=fs.readFileSync('work/omp-dl-<tag>.exe');fs.writeFileSync('work/roundtrip.exe',rebuild(b,[]));"
work\roundtrip.exe --version
```

不做任何修改的重建应当输出 `omp/<new>`。如果启动崩溃，说明 Bun 的 standalone 格式变了，需要先改 `lib/rebuild.js`，这一步通过之前不要继续。格式说明见 [architecture.md](architecture.md)。

## 3. 准备上游源码

补丁锚点要按源码语义定位，不能凭上一版的压缩名猜。

```powershell
git clone https://github.com/can1357/oh-my-pi.git upstream
git -C upstream checkout v<new>
node scripts/extract.js work/omp-dl-<tag>.exe
```

`extract.js` 把每个模块写到 `work/modules-omp-dl-<tag>/`，`index.tsv` 列出序号与模块路径。模块里保留了 `// packages/<pkg>/src/<file>` 分节注释，可以从源码文件反查它落在哪个模块。

## 4. 迁移补丁

```powershell
copy patches\<prev>.js patches\<new>.js
```

对 [patches.md](patches.md) 中的每一处补丁：

1. 在上游源码中确认它针对的代码还在，动机仍然成立。上游已经修好的，删掉这处补丁。
2. 在 `extract.js` 导出的模块中找到对应代码，记下模块序号和新的压缩名。
3. 更新 `patches/<new>.js` 中的模块序号、锚点文本和替换文本，以及文件顶部的 `version` 与 `moduleCount`。

每处补丁都必须先断言锚点存在。锚点出现多次时要断言次数，不能只替换第一处。

## 5. 迁移检查集

```powershell
copy verify\<prev>.js verify\<new>.js
```

更新模块数、`--version` 期望值，以及每处补丁的“新文本存在、原锚点不存在”两项检查。检查集要能区分好坏产物：用上游原版 exe 跑一遍，补丁相关的检查应当全部失败。

```powershell
node verify.js <new> --exe work/omp-dl-<tag>.exe
```

## 6. 补译

```powershell
node scripts/scan-gaps.js <new>
```

报告列出未翻译的句子型字面量和已经失效的字典条目。补译规则见 [dictionary.md](dictionary.md)。失效条目通常是上游改了文案，找到新文案后更新 `from`；确认文案已删除的条目可以删掉，前提是删除后旧版本的构建结果不变或不再需要。

## 7. 构建与验证

```powershell
node scripts/check-dict.js
node build.js <new>
node verify.js <new>
```

构建要看到 `Gate OK` 和 `Built:` 两行。之后启动 `work/omp-zh-<tag>.exe`，打开设置、模型选择、`/tree` 等界面，确认显示正常。

## 8. 发布

```powershell
git add patches/<new>.js verify/<new>.js dict
git commit -m "<new>: relocate patches, add translations"
node scripts/release.js <new>
```

`release.js` 会再次运行验证，确认工作区干净，同步 `package.json`，生成 `SHA256SUMS.txt`，打 `v<new>-zh` 标签并创建 Release。先用 `--dry-run` 看一遍要执行的动作。

## 9. 更新本机安装（可选）

```powershell
node scripts/install-local.js --src work/omp-zh-<tag>.exe --target <你的 omp.exe> --version <new> --expect-sha256 <构建输出的 sha256>
```

目标被正在运行的 omp 占用时，脚本会把文件暂存为 `<target>.new`，并启动一个后台进程，在所有 omp 会话退出后替换。
