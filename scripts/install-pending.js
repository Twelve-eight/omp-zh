// Deferred install watcher, started by scripts/install-local.js when the target exe is locked.
//
//   node scripts/install-pending.js <staged.exe> <target.exe> [--expect-sha256 <64 hex>] [--interval-ms <ms>]
//
// Every interval it tries to rename the staged file over the target. It only ever moves bytes
// whose sha256 matches --expect-sha256, checks the target again after the rename, and gives up
// after 24 hours. It never runs the target exe. Log: work/install-pending.log.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : null; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const [src, dst] = positional;
if (!src || !dst) { console.error('usage: node scripts/install-pending.js <staged.exe> <target.exe> [--expect-sha256 <64 hex>] [--interval-ms <ms>]'); process.exit(2); }
const EXPECT = (opt('expect-sha256') || '').trim().toLowerCase();
const INTERVAL_MS = Math.max(1000, Number(opt('interval-ms') || 30000));
if (EXPECT && !/^[0-9a-f]{64}$/.test(EXPECT)) { console.error('--expect-sha256 must be 64 hex characters'); process.exit(2); }

const WORK = path.join(__dirname, '..', 'work');
const LOG = path.join(WORK, 'install-pending.log');
const log = (m) => { try { fs.mkdirSync(WORK, { recursive: true }); fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch { /* best effort */ } };
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const maxTries = Math.ceil((24 * 3600 * 1000) / INTERVAL_MS);

log('watching: ' + src + ' -> ' + dst + (EXPECT ? ' (expect sha256 ' + EXPECT.slice(0, 16) + '..)' : ''));

if (EXPECT) {
  let got = null;
  try { got = sha256(src); } catch (e) { log('staged file unreadable: ' + e.message); process.exit(1); }
  if (got !== EXPECT) {
    log('ABORT: staged sha256 ' + got + ' != expected ' + EXPECT + '; staged file removed, target untouched');
    fs.rmSync(src, { force: true });
    process.exit(1);
  }
}

for (let i = 0; i < maxTries; i++) {
  // The staged file disappearing means another watcher or a manual step already installed it.
  if (!fs.existsSync(src)) { log('staged file gone: ' + src + ' (installed elsewhere)'); process.exit(0); }
  try {
    fs.renameSync(src, dst);
    const got = sha256(dst);
    if (EXPECT && got !== EXPECT) { log('MISMATCH after rename: target sha256 ' + got + ' != expected ' + EXPECT); process.exit(1); }
    log('installed: ' + dst + ' (sha256 ' + got.slice(0, 16) + '.. verified)');
    process.exit(0);
  } catch { /* target still locked */ }
  sleep(INTERVAL_MS);
}
log('gave up after 24h: ' + src + ' was not installed');
process.exit(1);
