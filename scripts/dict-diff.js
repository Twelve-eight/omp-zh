// Structurally compare the working dictionary against a git revision.
//
//   node scripts/dict-diff.js [--ref <ref>] [--verbose]
//
// Why: editing dict/*.json by splicing text (brace counting, regex over object spans) can corrupt a
// file or silently merge two entries; JSON.parse only catches the syntax case. This compares the
// parsed entries by (mode, from) and reports added / removed / modified-in-place, so a cleanup can
// be proven to have touched exactly the intended entries and nothing else.
//
// Exit 0 when the diff is readable, 1 on a parse failure, 2 on usage/git errors.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : null;
};
const ref = opt('ref') || 'HEAD';
const verbose = args.includes('--verbose');
const root = path.join(__dirname, '..');
process.chdir(root);

let files;
try {
  files = execSync('git ls-files "dict/*.json" "dict/**/*.json"', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => fs.existsSync(f));
} catch (e) {
  console.error('git ls-files failed: ' + e.message.split('\n')[0]);
  process.exit(2);
}

const readRef = (f) => {
  try {
    return execSync(`git show ${ref}:${f}`, { encoding: 'utf8', maxBuffer: 1 << 28 });
  } catch {
    return null; // file is new in the working tree
  }
};

const key = (e) => `${e.mode}|${e.from}`;
const added = [], removed = [], modified = [];
for (const f of files) {
  const oldRaw = readRef(f);
  const newRaw = fs.readFileSync(f, 'utf8');
  let oldArr = [], newArr;
  try {
    if (oldRaw !== null) oldArr = JSON.parse(oldRaw);
    newArr = JSON.parse(newRaw);
  } catch (e) {
    console.error(`PARSE FAIL ${f}: ${e.message.split('\n')[0]}`);
    process.exit(1);
  }
  const oldMap = new Map(oldArr.map((e) => [key(e), e]));
  const newMap = new Map(newArr.map((e) => [key(e), e]));
  for (const [k, e] of newMap) {
    if (!oldMap.has(k)) added.push([f, e]);
    else if (JSON.stringify(oldMap.get(k)) !== JSON.stringify(e)) modified.push([f, oldMap.get(k), e]);
  }
  for (const [k, e] of oldMap) if (!newMap.has(k)) removed.push([f, e]);
}

console.log(`${ref} -> working tree: ${added.length} added, ${removed.length} removed, ${modified.length} modified in place`);
const show = (label, rows, fmt) => {
  if (!rows.length) return;
  console.log(`\n${label}:`);
  for (const r of verbose ? rows : rows.slice(0, 20)) console.log('  ' + fmt(r));
  if (!verbose && rows.length > 20) console.log(`  ... ${rows.length - 20} more (--verbose to list all)`);
};
show('added', added, ([f, e]) => `${f}  ${JSON.stringify(e.from).slice(0, 70)}`);
show('removed', removed, ([f, e]) => `${f}  ${JSON.stringify(e.from).slice(0, 70)}`);
show('modified', modified, ([f, a, b]) => `${f}  ${JSON.stringify(a.from).slice(0, 50)}\n      - ${JSON.stringify(a.to).slice(0, 80)}\n      + ${JSON.stringify(b.to).slice(0, 80)}`);
