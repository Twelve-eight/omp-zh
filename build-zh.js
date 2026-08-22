// OMP 汉化构建脚本：合并字典 → 翻译 cli.js → 重建 exe → 交付
// 用法: node build-zh.js [--src <omp.exe>] [--cli <cli.js>] [--dst <out.exe>] [--deliver <path>]
// 环境变量等价: OMP_SRC / OMP_CLI / OMP_DST / OMP_DELIVER（命令行参数优先）
const fs = require('fs');
const path = require('path');
const { translate } = require('./translate.js');
const { rebuild } = require('./rebuild.js');

const T = __dirname;

// ---- 参数解析（argv > env > 默认） ----
function arg(name, envName, def) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env[envName] || def;
}
const SRC = arg('src', 'OMP_SRC', 'G:/omp/omp.exe');
const CLI = arg('cli', 'OMP_CLI', T + '/work/cli.js');
const DST = arg('dst', 'OMP_DST', T + '/work/omp-zh.exe');
const DELIVER = arg('deliver', 'OMP_DELIVER', 'G:/omp/omp-zh.exe');

// ---- 字典合并（保持原有相对顺序：help → help-extra → inline → tui → settings-a/b → tools → slash → plan） ----
// 17.4.0 起追加 work/out-*.json 补译 staging（存在则并入）
const dictFiles = [
  'dict-help.json', 'dict-help-extra.json', 'dict-inline.json', 'dict-tui.json',
  'dict-settings-a.json', 'dict-settings-b.json', 'dict-tools.json', 'dict-slash.json', 'dict-plan.json',
];
for (const f of fs.readdirSync(T + '/work').filter((x) => /^out-.+\.json$/.test(x)).sort()) {
  dictFiles.push('work/' + f);
}
const dict = dictFiles.map((f) => JSON.parse(fs.readFileSync(T + '/' + f, 'utf8'))).flat();

const seen = new Map();
for (const e of dict) { const k = e.from + '|' + e.mode; if (!seen.has(k)) seen.set(k, e); }
const dedup = [...seen.values()];

const cli = fs.readFileSync(CLI, 'utf8');
const { code, count } = translate(cli, dedup);
fs.writeFileSync(T + '/work/cli-zh.js', code);
console.log('translated literals:', count);

const srcBuf = fs.readFileSync(SRC);
// ---- Web UI 模块汉化（mod3 导出页 HTML / mod4 主题 JS / mod5 工具视图） ----
const { translateWeb } = require('./web-translate.js');
const web = translateWeb(dedup);
console.log('web translated: html=' + web.htmlCount + ' js=' + web.jsCount);
// 模块0=cli.js；模块3/4/5=Web UI 资产；其余保持原样
const out = rebuild(srcBuf, [Buffer.from(code), undefined, undefined, web.mods[3], web.mods[4], web.mods[5]]);
fs.writeFileSync(DST, out);

try {
  fs.copyFileSync(DST, DELIVER);
  console.log('delivered:', DELIVER);
} catch (e) {
  console.log('deliver FAILED (file busy?):', e.message);
}
