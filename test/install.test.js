// Tests for scripts/install-local.js and scripts/install-pending.js in a temporary directory.
//
//   node test/install.test.js
//
// Uses a tiny Node launcher as the "exe" so no real omp binary is touched. Windows only, because
// the locked-target case relies on Windows file sharing semantics.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

if (process.platform !== 'win32') { console.log('SKIP: Windows-only test'); process.exit(0); }
const root = path.join(__dirname, '..');
const install = path.join(root, 'scripts', 'install-local.js');
const pending = path.join(root, 'scripts', 'install-pending.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-zh-install-'));
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const results = [];
const check = (name, ok) => { results.push([name, !!ok]); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name); };
const run = (argv) => spawnSync(process.execPath, argv, { encoding: 'utf8', timeout: 120000, windowsHide: true });

try {
  const src = path.join(tmp, 'built.bin');
  const target = path.join(tmp, 'installed.bin');
  fs.writeFileSync(src, crypto.randomBytes(4096));
  fs.writeFileSync(target, 'old');
  const good = sha256(src);

  // 1. Wrong expected digest: refuse, target untouched, nothing staged.
  let r = run([install, '--src', src, '--target', target, '--expect-sha256', '0'.repeat(64), '--no-watch']);
  check('digest mismatch is refused', r.status === 1 && fs.readFileSync(target, 'utf8') === 'old' && !fs.existsSync(target + '.new'));

  // 2. Unlocked target: installed immediately with the verified bytes.
  r = run([install, '--src', src, '--target', target, '--expect-sha256', good, '--no-watch']);
  check('unlocked target is replaced', r.status === 0 && sha256(target) === good && !fs.existsSync(target + '.new'));

  // 3. Locked target with --no-watch: fails, staged copy removed.
  fs.writeFileSync(target, 'old');
  const holder = spawn('powershell', ['-NoProfile', '-Command',
    `$f=[System.IO.File]::Open('${target}','Open','Read','None'); Start-Sleep -Seconds 8; $f.Close()`], { stdio: 'ignore', windowsHide: true });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2500);
  r = run([install, '--src', src, '--target', target, '--expect-sha256', good, '--retries', '2', '--interval-ms', '200', '--no-watch']);
  check('locked target with --no-watch fails cleanly', r.status === 1 && !fs.existsSync(target + '.new'));

  // 4. Watcher: a staged file whose digest does not match is removed, not installed.
  const bad = target + '.new';
  fs.writeFileSync(bad, 'tampered');
  r = run([pending, bad, target, '--expect-sha256', good, '--interval-ms', '1000']);
  check('watcher refuses tampered staged file', r.status === 1 && !fs.existsSync(bad));

  // 5. Watcher: installs the verified bytes once the lock is released.
  fs.copyFileSync(src, bad);
  r = run([pending, bad, target, '--expect-sha256', good, '--interval-ms', '1000']);
  holder.kill();
  check('watcher installs after the lock is released', r.status === 0 && sha256(target) === good && !fs.existsSync(bad));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
const failed = results.filter(([, ok]) => !ok).length;
console.log(failed ? `FAILURES: ${failed}` : `ALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
