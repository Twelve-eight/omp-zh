// 审计 shard 字典：删除在代码中作为比较/枚举/switch-case 值出现的条目
const fs = require('fs');
const { parseExe, readModules } = require('./rebuild.js');

const SRC = process.argv[2] || './work/omp-dl-18121.exe';
const buf = fs.readFileSync(SRC);
const { bun } = parseExe(buf);
const ds = bun.rawPtr + 8;
const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = ds + hdr - 16 - 32;
const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
const mods = readModules(buf, ds, modOff, modLen);
const allCode = mods.map(m => m.contents.toString('utf8')).join('\n');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const files = fs.readdirSync('./work').filter(f => /^out-settings-shard\d+\.json$/.test(f)).sort();
let grand = 0;
for (const f of files) {
  const p = './work/' + f;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const bad = [];
  for (const e of d) {
    const x = esc(e.from);
    const pats = [
      new RegExp('(===|!==|==|!=)\\s*["\']' + x + '["\']'),
      new RegExp('case\\s+["\']' + x + '["\']'),
      new RegExp('\\b(act|type|kind|op|purpose|mode|status|action)\\s*===\\s*["\']' + x + '["\']'),
      new RegExp('values:\\s*\\[[^\\]]*["\']' + x + '["\']'),
    ];
    if (pats.some(p => p.test(allCode))) bad.push(e.from);
  }
  if (bad.length) {
    fs.writeFileSync(p, JSON.stringify(d.filter(e => !bad.includes(e.from)), null, 2) + '\n');
  }
  grand += bad.length;
  console.log(f + ': ' + d.length + ' -> ' + (d.length - bad.length) + ' (removed ' + bad.length + ')');
  bad.forEach(b => console.log('    ! ' + JSON.stringify(b)));
}
console.log('TOTAL REMOVED:', grand);
