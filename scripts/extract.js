// Dump every module of a Bun standalone executable to disk, for locating patch anchors.
//
//   node scripts/extract.js <exe> [<out-dir>]
//
// Default out-dir: work/modules-<basename>/. Each module is written as <index>-<name>, and
// index.tsv lists index, size and original module path. Read-only on the exe.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadModules, moduleName } = require('../lib/bundle.js');

const [exe, outArg] = process.argv.slice(2);
if (!exe) { console.error('usage: node scripts/extract.js <exe> [<out-dir>]'); process.exit(2); }
const out = outArg || path.join(__dirname, '..', 'work', 'modules-' + path.basename(exe, path.extname(exe)));
const { mods } = loadModules(fs.readFileSync(exe));
fs.mkdirSync(out, { recursive: true });
const index = [];
mods.forEach((m, i) => {
  const name = moduleName(m);
  const base = name.replace(/^.*[\\/]/, '').replace(/[^\w.-]/g, '_') || 'module';
  fs.writeFileSync(path.join(out, `${i}-${base}`), m.contents.slice(0, -1));
  index.push(`${i}\t${m.contents.length - 1}\t${name}`);
});
fs.writeFileSync(path.join(out, 'index.tsv'), index.join('\n') + '\n');
console.log(`${mods.length} modules -> ${out}`);
