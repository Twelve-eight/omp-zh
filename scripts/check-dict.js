// Lint the translation dictionaries. Needs no upstream binary, so it also runs in CI.
//
//   node scripts/check-dict.js
//
// Errors (exit 1): invalid JSON, wrong entry shape, raw line breaks in "to", duplicate
// `from|mode` keys across files (only the first copy would ever be used).
// Warnings: "to" without Chinese text (product names such as "Bash/Bash" are kept on purpose),
// `full` entries whose "to" does not end with "/<from>" (status lines and padded TUI tags are
// translated without the English tail on purpose).
'use strict';
const fs = require('fs');
const path = require('path');
const { dictFiles } = require('../lib/dict.js');

const root = path.join(__dirname, '..');
const errors = [];
const warnings = [];
const seen = new Map();
// Source literals keep JS escapes (\u2026, \xB7); the bilingual tail is written decoded.
const decode = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
let count = 0;
for (const file of dictFiles()) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  let arr;
  try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { errors.push(`${rel}: invalid JSON (${e.message})`); continue; }
  if (!Array.isArray(arr)) { errors.push(`${rel}: expected a JSON array`); continue; }
  arr.forEach((e, i) => {
    const at = `${rel}[${i}]`;
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string' || !e.from) { errors.push(`${at}: needs non-empty string "from" and string "to"`); return; }
    if (e.mode !== 'full' && e.mode !== 'sub') errors.push(`${at}: mode must be "full" or "sub"`);
    const extra = Object.keys(e).filter((k) => !['from', 'to', 'mode'].includes(k));
    if (extra.length) errors.push(`${at}: unknown field(s) ${extra.join(', ')}`);
    if (/[\r\n]/.test(e.to)) errors.push(`${at}: "to" contains a raw line break`);
    if (!/[\u3400-\u9fff\uff00-\uffef\u3000-\u303f]/.test(e.to)) warnings.push(`${at}: "to" has no Chinese text: ${JSON.stringify(e.to).slice(0, 60)}`);
    if (e.mode === 'full' && !e.to.endsWith('/' + e.from) && !e.to.endsWith('/' + decode(e.from))) warnings.push(`${at}: full entry without "/<from>" tail: ${JSON.stringify(e.from).slice(0, 60)}`);
    const k = e.from + '|' + e.mode;
    if (seen.has(k)) errors.push(`${at}: duplicate of ${seen.get(k)} (${JSON.stringify(e.from).slice(0, 60)})`);
    else seen.set(k, at);
    count++;
  });
}
if (errors.length) {
  errors.slice(0, 100).forEach((e) => console.error('ERROR ' + e));
  console.error(`${errors.length} problem(s) in ${count} entries`);
  process.exit(1);
}
console.log(`dictionary OK: ${count} entries in ${dictFiles().length} files` + (warnings.length ? `, ${warnings.length} warning(s) (run with --warnings to list)` : ''));
if (process.argv.includes('--warnings')) warnings.forEach((w) => console.log('WARN ' + w));
