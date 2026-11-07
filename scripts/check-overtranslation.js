// Report translated literals that sit in code positions (over-translation) for one built exe.
//
//   node scripts/check-overtranslation.js <version> [--exe <localized.exe>]
//
// build.js already runs the same scan as a hard gate; this CLI exists to re-check an installed or
// archived build without rebuilding, e.g. after a dictionary change from another session.
// Exit 0 = clean, 1 = violations, 2 = usage/IO error.
'use strict';
const fs = require('fs');
const path = require('path');
const { scan } = require('../lib/overtranslation.js');
const { loadModules, moduleName } = require('../lib/bundle.js');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : null;
};
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
if (!version) {
  console.error('usage: node scripts/check-overtranslation.js <version> [--exe <localized.exe>]');
  process.exit(2);
}
const root = path.join(__dirname, '..');
const tag = version.replace(/\./g, '');
const exe = opt('exe') || path.join(root, 'work', `omp-zh-${tag}.exe`);
if (!fs.existsSync(exe)) {
  console.error(`executable not found: ${exe}`);
  process.exit(2);
}

const { mods } = loadModules(fs.readFileSync(exe));
const modules = mods.map((m, index) => ({ index, name: moduleName(m), text: m.contents.toString('latin1') }));
const violations = scan(modules);

if (violations.length === 0) {
  console.log(`OK: no translated literal sits in a code position (${modules.length} modules, ${path.basename(exe)})`);
  process.exit(0);
}
console.error(`${violations.length} translated literals sit in code positions (${path.basename(exe)}):`);
for (const v of violations.slice(0, 60)) {
  console.error(`  ! mod ${v.module} [${v.kind}] ${v.literal}`);
  if (v.context) console.error(`      ${v.context.slice(-120)}`);
}
if (violations.length > 60) console.error(`  ... ${violations.length - 60} more`);
console.error('Delete or narrow the offending dictionary entries (docs/dictionary.md).');
process.exit(1);
