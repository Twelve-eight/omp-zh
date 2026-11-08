// Run the verification suite for one localized build.
//
//   node verify.js <version> [--exe <localized.exe>] [--official <official.exe>]
//
// Defaults: --exe work/omp-zh-<version>.exe, --official work/omp-dl-<version>.exe.
// Exit code 0 only when every check passes.
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
if (!version) { console.error('usage: node verify.js <version> [--exe <localized.exe>] [--official <official.exe>]'); process.exit(2); }
const tag = version.replace(/\./g, '');
const root = __dirname;
const exe = path.resolve(opt('exe') || path.join(root, 'work', `omp-zh-${tag}.exe`));
const official = path.resolve(opt('official') || path.join(root, 'work', `omp-dl-${tag}.exe`));
const suite = path.join(root, 'verify', `${version}.js`);
for (const [what, p] of [['verification suite', suite], ['localized exe', exe], ['official exe', official]]) {
  if (!fs.existsSync(p)) { console.error(`${what} not found: ${p}`); process.exit(2); }
}

const checks = require(suite)({ exe, official, root });

// Structural guard: a suite that was edited incrementally has twice shipped a duplicated or
// half-written entry, which runs fine but silently drops a check. Fail fast instead.
{
  const bad = [];
  const names = new Map();
  for (const [i, c] of checks.entries()) {
    if (!Array.isArray(c) || c.length !== 2) { bad.push(`entry ${i} is not [name, pass]`); continue; }
    const [name, pass] = c;
    if (typeof name !== 'string' || name.trim() === '') bad.push(`entry ${i} has no name`);
    if (typeof pass !== 'boolean') bad.push(`check "${name}" did not evaluate to a boolean (got ${typeof pass})`);
    if (names.has(name)) bad.push(`duplicate check name "${name}" (entries ${names.get(name)} and ${i})`);
    else names.set(name, i);
  }
  if (bad.length) {
    console.error('SUITE INVALID:');
    for (const b of bad) console.error('  ! ' + b);
    process.exit(2);
  }
}

let fail = 0;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name);
  if (!pass) fail++;
}
console.log(fail === 0 ? 'ALL ' + checks.length + ' VERIFICATIONS PASS' : 'FAILURES: ' + fail);
process.exit(fail ? 1 : 0);
