// 提取 omp exe 的入口模块 (cli.js) → 输出文件
// 用法: node extract-cli.js [src.exe] [out.js]
// 默认: node extract-cli.js G:/omp/omp.exe %TEMP%/cli-172.js
const fs = require('fs');
const { parseExe, readModules } = require('./rebuild.js');

const SRC = process.argv[2] || 'G:/omp/omp.exe';
const OUT = process.argv[3] || __dirname + '/work/cli.js';

const buf = fs.readFileSync(SRC);
const { bun } = parseExe(buf);
console.log('.bun section: rawPtr=' + bun.rawPtr + ' rawSize=' + bun.rawSize + ' vsize=' + bun.vsize);

const dataStart = bun.rawPtr + 8;
const header = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = dataStart + header - 16 - 32; // Offsets 记录在数据块末尾
const modOff = buf.readUInt32LE(O + 8);
const modLen = buf.readUInt32LE(O + 12);
console.log('header=' + header + ' modOff=' + modOff + ' modLen=' + modLen);

const mods = readModules(buf, dataStart, modOff, modLen);
console.log('modules: ' + mods.length);

// 入口模块约定为索引 0（rebuild.js 的 newContents[0]）。
// 17.x 名为 */cli.js；18.0.0 起改名为 B:/~BUN/root/omp-windows-x64——断言放宽为「内容是 JS」。
const m0 = mods[0];
const m0name = m0.name.toString('latin1').replace(/\0/g, '');
const body = m0.contents.slice(0, m0.contents.length - 1); // 不含结尾 \0
const head = body.slice(0, 64).toString('utf8');
if (!m0name.includes('cli.js') && !head.includes('@bun')) {
  throw new Error('module 0 is neither cli.js nor a JS entry: ' + m0name);
}
fs.writeFileSync(OUT, body);

// 17.4.0 起：同时导出 Web UI 资产模块（mod3 导出页 HTML / mod4 主题 JS / mod5 工具视图）
// 供 build-zh.js → web-translate.js 使用；命名 work/mod<i>-<basename>
for (let i = 2; i < mods.length; i++) {
  const name = mods[i].name.toString('latin1').replace(/\0/g, '');
  const base = name.split('/').pop().replace(/-[a-z0-9]+(\.\w+)?$/, '$1');
  const out2 = __dirname.replace(/\\/g, '/') + '/work/mod' + i + '-' + base;
  fs.writeFileSync(out2, mods[i].contents.slice(0, mods[i].contents.length - 1));
  console.log('wrote: ' + out2);
}
console.log('wrote: ' + OUT + ' (' + body.length + ' bytes)');
