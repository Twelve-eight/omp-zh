// Install a verified build over your local omp executable.
//
//   node scripts/install-local.js --src <built.exe> --target <installed.exe>
//                                 [--version <x.y.z>] [--expect-sha256 <64 hex>]
//                                 [--retries <n>] [--interval-ms <ms>] [--no-watch]
//
// Checks before the target is touched: the source sha256 equals --expect-sha256 (the bytes you
// verified are the bytes you install), the source reports `omp/<version>`, and the staged copy
// matches the source. The target is replaced with an atomic rename and re-hashed afterwards.
//
// A running omp session keeps its exe locked on Windows. In that case the verified copy is staged
// as <target>.new and a detached watcher (scripts/install-pending.js) renames it into place once
// every session has exited. Pass --no-watch to fail instead.
//
// Exit codes: 0 installed, or staged with a watcher; 1 not installed; 2 usage error.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const WORK = path.join(__dirname, '..', 'work');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : null; };
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const log = (m) => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + m);
const fail = (m) => { console.error('install FAILED: ' + m); process.exit(1); };

const SRC = opt('src');
const TARGET = opt('target');
const VERSION = opt('version');
const EXPECT = (opt('expect-sha256') || '').trim().toLowerCase();
const RETRIES = Number(opt('retries') || 10);
const INTERVAL_MS = Number(opt('interval-ms') || 3000);
const NO_WATCH = args.includes('--no-watch');

if (!SRC || !TARGET) {
  console.error('usage: node scripts/install-local.js --src <built.exe> --target <installed.exe> [--version <x.y.z>] [--expect-sha256 <64 hex>] [--retries n] [--interval-ms ms] [--no-watch]');
  process.exit(2);
}
if (EXPECT && !/^[0-9a-f]{64}$/.test(EXPECT)) { console.error('--expect-sha256 must be 64 hex characters'); process.exit(2); }
if (!fs.existsSync(SRC)) fail('source not found: ' + SRC);

// 1) The source must be the bytes that were verified.
const srcSha = sha256(SRC);
if (EXPECT && srcSha !== EXPECT) fail(`source sha256 ${srcSha} != expected ${EXPECT}`);

// 2) The source must report the expected version. Only the source is executed, never the target.
if (VERSION) {
  const r = spawnSync(SRC, ['--version'], { encoding: 'utf8', timeout: 120000, windowsHide: true });
  const out = (r.stdout || '').trim();
  if (r.status !== 0 || !out.includes('omp/' + VERSION)) fail(`source --version = ${JSON.stringify(out)}, want omp/${VERSION}`);
  log(`source OK: ${out}, sha256 ${srcSha.slice(0, 16)}..`);
}

// 3) Stage the candidate: stop older watchers, write under a temporary name, then rename to
//    <target>.new, so a watcher can never pick up a half-written file.
const staged = TARGET + '.new';
const tmp = staged + '.tmp-' + process.pid;
function stopOldWatchers() {
  if (process.platform !== 'win32') return;
  const r = spawnSync('powershell', ['-NoProfile', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*install-pending.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; $_.ProcessId }"],
  { encoding: 'utf8', timeout: 30000, windowsHide: true });
  const killed = (r.stdout || '').trim();
  if (killed) log('stopped previous watcher(s): ' + killed.replace(/\s+/g, ' '));
}
stopOldWatchers();
fs.rmSync(tmp, { force: true });
try { fs.copyFileSync(SRC, tmp); } catch (e) { fail('cannot stage ' + tmp + ': ' + e.message); }
if (sha256(tmp) !== srcSha) { fs.rmSync(tmp, { force: true }); fail('staged copy does not match the source'); }
try { fs.renameSync(tmp, staged); } catch (e) { fs.rmSync(tmp, { force: true }); fail('cannot publish staged copy: ' + e.message); }

// 4) Atomic replace, retried while a running session holds the target.
let lastErr = null;
for (let i = 0; i < RETRIES; i++) {
  try {
    fs.renameSync(staged, TARGET);
    const got = sha256(TARGET);
    if (got !== srcSha) fail(`target sha256 ${got} != verified ${srcSha} after rename`);
    writeRecord('immediate');
    log(`installed: ${TARGET} (sha256 ${got.slice(0, 16)}.. verified)`);
    process.exit(0);
  } catch (e) {
    lastErr = e;
    if (i < RETRIES - 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, INTERVAL_MS);
  }
}

// 5) Still locked: hand the same bytes to a detached watcher.
const reason = lastErr && (lastErr.code || lastErr.message);
if (NO_WATCH) { fs.rmSync(staged, { force: true }); fail(`target locked (${reason}) and --no-watch given; staged copy removed`); }
const child = spawn(process.execPath, [path.join(__dirname, 'install-pending.js'), staged, TARGET, '--expect-sha256', srcSha], {
  detached: true, stdio: 'ignore', windowsHide: true,
});
child.unref();
writeRecord('deferred');
log(`install DEFERRED: ${TARGET} is in use (${reason}).`);
log(`staged ${staged}; watcher pid ${child.pid} installs it after every omp session exits (log: work/install-pending.log)`);
process.exit(0);

function writeRecord(mode) {
  try {
    fs.mkdirSync(WORK, { recursive: true });
    fs.writeFileSync(path.join(WORK, 'last-install.json'), JSON.stringify({
      target: TARGET, src: SRC, version: VERSION || null, sha256: srcSha, mode, at: new Date().toISOString(),
    }, null, 2));
  } catch { /* best effort */ }
}
