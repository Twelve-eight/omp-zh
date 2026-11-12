'use strict';
// For each dead dictionary entry, find the most similar literal in the 18.19.0 bundle (token
// Jaccard), so a reworded upstream string can be re-keyed instead of losing its translation.
//   node scripts/dead-near.js [official.exe] [report.txt]
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { scanStrings } = require(path.join(root, 'lib', 'translate.js'));
const { loadModules, moduleName, moduleSource } = require(path.join(root, 'lib', 'bundle.js'));

const SRC = process.argv[2] || path.join(root, 'work', 'omp-dl-18190.exe');
const REPORT = process.argv[3] || 'G:/tmp/gaps-18190.txt';
const report = fs.readFileSync(REPORT, 'utf8');
const dead = [...report.split('## Dead entries')[1].matchAll(/^\[full\] (".*")$/gm)].map((m) => JSON.parse(m[1]));

const { mods } = loadModules(fs.readFileSync(SRC));
const pool = [];
for (const m of mods) {
  if (!moduleName(m).endsWith('.js')) continue;
  for (const lit of scanStrings(moduleSource(m))) {
    if (!lit.isTemplate && lit.content.length >= 6) pool.push(lit.content);
  }
}
const uniq = [...new Set(pool)];
const tok = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2));
const poolTok = uniq.map((p) => [p, tok(p)]);
const jac = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
const rows = [];
for (const d of dead) {
  const dt = tok(d);
  let best = ['', 0];
  for (const [p, pt] of poolTok) {
    if (Math.abs(p.length - d.length) > Math.max(40, d.length * 0.8)) continue;
    const s = jac(dt, pt);
    if (s > best[1]) best = [p, s];
  }
  rows.push([best[1].toFixed(2), JSON.stringify(d), JSON.stringify(best[0])].join('\t'));
}
console.error('pool', uniq.length, 'dead', dead.length);
console.log(rows.join('\n'));
