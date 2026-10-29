// Build the localized executable for one upstream release.
//
//   node build.js <version> [--src <official.exe>] [--out <localized.exe>]
//
// Defaults: --src work/omp-dl-<version>.exe (see scripts/fetch-upstream.js),
//           --out work/omp-zh-<version>.exe
// Steps: apply patches/<version>.js -> translate every JS module with dict/ -> refuse dictionary
// entries that collide with compared literals -> rebuild the exe -> print its sha256.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { rebuild } = require('./lib/rebuild.js');
const { translate } = require('./lib/translate.js');
const { loadDict } = require('./lib/dict.js');
const { loadModules, moduleName, moduleSource, asciiEscape, comparedLiterals } = require('./lib/bundle.js');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
if (!version) {
  console.error('usage: node build.js <version> [--src <official.exe>] [--out <localized.exe>]');
  process.exit(2);
}
const tag = version.replace(/\./g, '');
const SRC = opt('src') || path.join(__dirname, 'work', `omp-dl-${tag}.exe`);
const OUT = opt('out') || path.join(__dirname, 'work', `omp-zh-${tag}.exe`);
const patchFile = path.join(__dirname, 'patches', `${version}.js`);
if (!fs.existsSync(patchFile)) {
  console.error(`no patch set for ${version}: create patches/${version}.js (see docs/updating.md)`);
  process.exit(2);
}
if (!fs.existsSync(SRC)) {
  console.error(`official executable not found: ${SRC}\nrun: node scripts/fetch-upstream.js ${version}`);
  process.exit(2);
}
const { patches, moduleCount } = require(patchFile);

const buf = fs.readFileSync(SRC);
const { mods } = loadModules(buf);
console.log('Module count:', mods.length);
if (moduleCount && mods.length !== moduleCount) {
  console.error(`module count ${mods.length} != ${moduleCount} expected by patches/${version}.js - wrong source exe?`);
  process.exit(1);
}

const dict = loadDict();
console.log('Dictionary entries:', dict.length);

const newContents = [];
let transCount = 0;
let patchedCount = 0;
mods.forEach((m, idx) => {
  let code = moduleSource(m);
  let modified = false;
  if (patches[idx]) {
    code = patches[idx](code);
    patchedCount++;
    modified = true;
  }
  if (moduleName(m).endsWith('.js')) {
    const { code: out, count } = translate(code, dict);
    if (count > 0) {
      code = out;
      transCount += count;
      modified = true;
    }
  }
  if (modified) newContents[idx] = Buffer.from(asciiEscape(code), 'latin1');
});
console.log(`Applied ${patchedCount} patches, translated ${transCount} literals.`);

const compared = comparedLiterals(mods);
const offenders = dict.filter((e) => compared.has(e.from)).map((e) => e.from);
if (offenders.length) {
  console.error('GATE FAIL: ' + offenders.length + ' dictionary entries collide with compared/cased literals:');
  offenders.slice(0, 40).forEach((o) => console.error('  ! ' + JSON.stringify(o)));
  console.error('Remove or narrow these entries before building (docs/dictionary.md).');
  process.exit(3);
}
console.log('Gate OK: no dictionary entry collides with ' + compared.size + ' compared/cased literals.');

const out = rebuild(buf, newContents);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
const sha = crypto.createHash('sha256').update(out).digest('hex');
console.log(`Built: ${path.relative(process.cwd(), OUT)} (size=${out.length}, sha256=${sha})`);
