// Shared dictionary loader for every build, scan and verify script.
//
// Load order (first entry wins on a duplicate `from|mode` key):
//   1. dict/*.json            topic dictionaries, sorted by file name
//   2. dict/staging/*.json    per-release additions, sorted by file name
// The order is part of the build contract: changing it can change which translation wins and
// therefore the bytes of the release artifact.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function dictFiles(root = ROOT) {
  const list = (dir) => {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(abs, f));
  };
  return [...list('dict'), ...list(path.join('dict', 'staging'))];
}

function validate(e, file, i) {
  const where = `${path.relative(ROOT, file)}[${i}]`;
  if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') throw new Error(`${where}: entry needs string "from" and "to"`);
  if (e.mode !== 'full' && e.mode !== 'sub') throw new Error(`${where}: mode must be "full" or "sub"`);
  // A raw line break in a JS string literal is a syntax error once the translation is written back.
  if (/[\r\n]/.test(e.to)) throw new Error(`${where}: "to" contains a raw line break; use \\n escapes as in the source literal`);
}

// Returns the merged, de-duplicated entry list.
function loadDict(root = ROOT) {
  const seen = new Map();
  for (const file of dictFiles(root)) {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(arr)) throw new Error(`${path.relative(root, file)}: expected a JSON array`);
    arr.forEach((e, i) => {
      validate(e, file, i);
      const k = e.from + '|' + e.mode;
      if (!seen.has(k)) seen.set(k, e);
    });
  }
  return [...seen.values()];
}

module.exports = { loadDict, dictFiles };
