// List untranslated English strings and dead dictionary entries for one upstream release.
//
//   node scripts/scan-gaps.js <version> [--src <official.exe>] [--out <report.txt>]
//
// Scans every JS module of the official executable. A "gap" is a sentence-like literal (has a
// space, 6-200 characters, no interpolation, not an identifier/number/URL/path) that no
// dictionary entry matches. A "dead" entry is a dictionary entry that matches nothing.
// Most gaps are prompt text or log messages that must stay English (docs/dictionary.md);
// the list is a starting point for review, not a to-do list.
'use strict';
const fs = require('fs');
const path = require('path');
const { scanStrings } = require('../lib/translate.js');
const { loadDict } = require('../lib/dict.js');
const { loadModules, moduleName, moduleSource } = require('../lib/bundle.js');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
if (!version) { console.error('usage: node scripts/scan-gaps.js <version> [--src <official.exe>] [--out <report.txt>]'); process.exit(2); }
const tag = version.replace(/\./g, '');
const root = path.join(__dirname, '..');
const SRC = opt('src') || path.join(root, 'work', `omp-dl-${tag}.exe`);
const OUT = opt('out') || path.join(root, 'work', `gaps-${version}.txt`);
if (!fs.existsSync(SRC)) { console.error(`official executable not found: ${SRC}`); process.exit(2); }

const dict = loadDict();
const fulls = new Set(dict.filter((e) => e.mode === 'full').map((e) => e.from));
const subs = dict.filter((e) => e.mode === 'sub');
const stripInterp = (s) => s.replace(/\$\{[^}]*\}/g, '');
const hits = (lit) => {
  if (fulls.has(lit.content)) return true;
  const text = lit.isTemplate ? stripInterp(lit.content) : lit.content;
  return subs.some((e) => text.includes(e.from));
};
const isNonUi = (s) => s.length < 6 || s.length > 200 || !/\s/.test(s) || /[\r\n]/.test(s) || s.includes('${') ||
  /^[A-Za-z_$][\w$]*$/.test(s) || /^[+-]?\d[\d,_]*(?:\.\d+)?%?$/.test(s) || /^[a-z][a-z0-9+.-]*:\/\/\S*$/i.test(s) || /^[A-Za-z]:[\\/]/.test(s);

const { mods } = loadModules(fs.readFileSync(SRC));
const gaps = new Map(); // literal -> first module name
const used = new Set();
let total = 0;
for (const m of mods) {
  const name = moduleName(m);
  if (!name.endsWith('.js')) continue;
  for (const lit of scanStrings(moduleSource(m))) {
    total++;
    if (fulls.has(lit.content)) used.add(lit.content + '|full');
    for (const e of subs) if (lit.content.includes(e.from)) used.add(e.from + '|sub');
    if (!lit.codeKey && !hits(lit) && !isNonUi(lit.content) && !gaps.has(lit.content)) gaps.set(lit.content, name);
  }
}
const dead = dict.filter((e) => !used.has(e.from + '|' + e.mode));

const lines = [`# omp ${version}: ${total} literals scanned, ${gaps.size} untranslated sentence-like, ${dead.length} dead entries`, '', '## Untranslated'];
for (const [s, mod] of [...gaps].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))) lines.push(`${mod.replace(/^.*\/~BUN\/root\//, '')}\t${JSON.stringify(s)}`);
lines.push('', '## Dead entries');
for (const e of dead) lines.push(`[${e.mode}] ${JSON.stringify(e.from)}`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`${total} literals, ${gaps.size} untranslated sentence-like, ${dead.length} dead entries -> ${path.relative(process.cwd(), OUT)}`);
