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
// 【18.0.0 修复】Bun 1.4.0 standalone loader 把模块源码按 latin1 解码，非 ASCII 字面量全部 mojibake。
// 预补偿：把所有非 ASCII 字符转成 \uXXXX 转义（纯 ASCII 源码在任何解码下语义不变）。
function asciiEscape(s) {
  return s.replace(/[^\x00-\x7F]+/g, (m) => {
    let out = '';
    for (const ch of m) {
      const cp = ch.codePointAt(0);
      if (cp > 0xFFFF) {
        const h = Math.floor((cp - 0x10000) / 0x400) + 0xD800;
        const l = ((cp - 0x10000) % 0x400) + 0xDC00;
        out += '\\u' + h.toString(16).padStart(4, '0') + '\\u' + l.toString(16).padStart(4, '0');
      } else {
        out += '\\u' + cp.toString(16).padStart(4, '0');
      }
    }
    return out;
  });
}
const ascii = asciiEscape(code);
fs.writeFileSync(T + '/work/cli-zh.js', ascii);
console.log('translated literals:', count, '(ascii-escaped for Bun 1.4.0 standalone)');

const srcBuf = fs.readFileSync(SRC);
// ---- Web UI 模块汉化（mod3 导出页 HTML / mod4 主题 JS / mod5 工具视图） ----
const { translateWeb } = require('./web-translate.js');
const web = translateWeb(dedup);
console.log('web translated: html=' + web.htmlCount + ' js=' + web.jsCount);
// 模块0=cli.js；模块3/4/5=Web UI 资产；其余保持原样。
// Web 资产同样 ASCII 化——HTML/JS 模块在 Bun 1.4.0 standalone 里同样被 latin1 解码。
const asciiWeb = { 3: asciiEscape(web.mods[3].toString('utf8')), 4: asciiEscape(web.mods[4].toString('utf8')), 5: asciiEscape(web.mods[5].toString('utf8')) };
const out = rebuild(srcBuf, [Buffer.from(ascii), undefined, undefined, Buffer.from(asciiWeb[3]), Buffer.from(asciiWeb[4]), Buffer.from(asciiWeb[5])]);
fs.writeFileSync(DST, out);

try {
  fs.copyFileSync(DST, DELIVER);
  console.log('delivered:', DELIVER);
} catch (e) {
  console.log('deliver FAILED (file busy?):', e.message);
}
