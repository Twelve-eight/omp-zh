// Report translated literals that sit in code positions (over-translation) for one built exe.
//
//   node scripts/check-overtranslation.js <version> [--exe <localized.exe>]
//   node scripts/check-overtranslation.js --self-test
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

// Negative control: the scanner must fire on every defect shape and stay quiet on display text.
// Run it after any change to lib/overtranslation.js — an exe scan alone cannot prove the gate is
// alive, because a clean product and a blinded gate print the same OK.
if (args.includes('--self-test')) {
  const defects = [
    ['structural field', 'var k = { Power: { key: "\u7535\u6e90/Power", code: "\u7535\u6e90/Power" } };'],
    ['object key', 'var o = { "\u5df2\u542f\u7528/Enabled": 1 };'],
    ['computed index', 'var v = o["\u5df2\u542f\u7528/Enabled"];'],
    ['optional chain', 'var v = o?.["\u5df2\u542f\u7528/Enabled"];'],
    ['comparison', 'if (x === "\u5df2\u542f\u7528/Enabled") {}'],
    ['Map key', 'm.set("\u5df2\u542f\u7528/Enabled", 1);'],
    ['matcher arg', 's.includes("\u5df2\u542f\u7528/Enabled");'],
    ['RegExp source', 'new RegExp("\u5df2\u542f\u7528/Enabled");'],
    ['enum key write', 'e["\u5df2\u542f\u7528/Enabled"] = "enabled";'],
    ['membership array', 'var v = ["Breaking Changes", "\u5b89\u5168/Security"];\nfunction f(h) { return !v.includes(h); }'],
  ];
  const legit = [
    ['array literal', 'return ["\u5df2\u542f\u7528/Enabled"];'],
    ['keys array', 'var k = { keys: ["\u5df2\u542f\u7528/Enabled"] };'],
    ['label field', 'var l = { label: "\u5df2\u542f\u7528/Enabled" };'],
    ['action field', 'var a = { action: "\u590d\u5236\u5f53\u524d\u884c/Copy current line" };'],
    ['value field', 'var v = { value: "\u672a\u7f13\u5b58/Not cached" };'],
    ['display table array', 'var t = [{ label: "\u540d\u79f0/Name", value: "n" }];\nt[0].label;'],
  ];
  let failed = 0;
  for (const [name, text] of defects) {
    const hits = scan([{ index: 1, text }]).map((v) => v.kind);
    if (hits.length === 0) { console.error('SELF-TEST FAIL (not caught): ' + name); failed++; }
    else console.log('caught  ' + name + ' -> ' + hits.join(','));
  }
  for (const [name, text] of legit) {
    const hits = scan([{ index: 1, text }]).map((v) => v.kind);
    if (hits.length !== 0) { console.error('SELF-TEST FAIL (false positive): ' + name + ' -> ' + hits.join(',')); failed++; }
    else console.log('clean   ' + name);
  }
  console.log(failed === 0 ? 'self-test OK: ' + defects.length + ' defect shapes caught, ' + legit.length + ' display shapes clean' : 'self-test FAILED: ' + failed);
  process.exit(failed === 0 ? 0 : 1);
}
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
