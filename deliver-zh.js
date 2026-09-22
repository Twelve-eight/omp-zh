// deliver-zh.js - omp 汉化管线**唯一交付入口**(R15-01,2026-09-22)
//
// 交付契约:只交付"已经被验证过的那一份字节".调用方(update-zh.js)必须先完成
//   补丁完整性门 -> 隔离构建 -> verify -> 冒烟,再把**同一份产物路径**交给本脚本.
// 本脚本自己再核三道:sha256 与调用方给定值一致 -> 产物自报版本一致 -> 落位后字节一致.
// 任一道不过 -> 不碰正式目标,不留下候选,不写成功标记,exit 1.
//
// 用法:
//   node deliver-zh.js --src <built.exe> --target <install.exe> [--version <ver>]
//                      [--expect-sha256 <64hex>] [--retries <n>] [--interval-ms <ms>] [--no-watch]
//   node deliver-zh.js --print-sha256 <file>
//
// 退出码:
//   0  已交付(immediate),或目标被占用但**已验证的候选**已 staged 且看护在位(deferred)
//   1  未交付(校验失败 / 目标被占用且 --no-watch / 看护无法拉起)
//   2  用法错误
//
// 为什么交付要独立成脚本:2026-09-22 之前 build-zh.js 带 --deliver 直接替换正式目标,
// 而 update-zh.js 是"先交付后 verify" -> verify 失败时正式目标已经被换掉,或看护已带着
// 未验证字节就位.把交付从构建里拆出来,顺序就只能是一种:先验后交.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const T = __dirname;
const args = process.argv.slice(2);
function opt(name) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : null;
}
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const log = (m) => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + m);

// ---- --print-sha256:给调用方算哈希(避免调用方重复实现) ----
if (args.includes('--print-sha256')) {
  const f = opt('print-sha256');
  if (!f || !fs.existsSync(f)) { console.error('usage: node deliver-zh.js --print-sha256 <file>'); process.exit(2); }
  console.log(sha256(f));
  process.exit(0);
}

const SRC = opt('src');
const TARGET = opt('target');
const VERSION = opt('version');
const EXPECT = (opt('expect-sha256') || '').trim().toLowerCase();
const RETRIES = Number(opt('retries') || 10);
const INTERVAL_MS = Number(opt('interval-ms') || 3000);
const NO_WATCH = args.includes('--no-watch');

if (!SRC || !TARGET) {
  console.error('usage: node deliver-zh.js --src <built.exe> --target <install.exe> [--version <ver>] [--expect-sha256 <64hex>] [--retries n] [--interval-ms ms] [--no-watch]');
  process.exit(2);
}
if (EXPECT && !/^[0-9a-f]{64}$/.test(EXPECT)) { console.error('--expect-sha256 must be 64-char hex'); process.exit(2); }
if (!fs.existsSync(SRC)) { console.error('deliver FAILED: src not found: ' + SRC); process.exit(1); }

// ---- 1) 字节校验:src 必须与调用方验证过的那一份完全一致 ----
const srcSha = sha256(SRC);
if (EXPECT && srcSha !== EXPECT) {
  console.error('deliver FAILED: src sha256 ' + srcSha + ' != expected ' + EXPECT + ' (artifact changed after verification)');
  process.exit(1);
}
// ---- 2) 产物自报版本校验(交付前最后一道;不 spawn 目标,只 spawn src) ----
if (VERSION) {
  const r = spawnSync(SRC, ['--version'], { encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '').trim();
  if (r.status !== 0 || !out.includes('omp/' + VERSION)) {
    console.error('deliver FAILED: src --version = ' + JSON.stringify(out) + ' (status ' + r.status + '), want omp/' + VERSION);
    process.exit(1);
  }
  log('src version OK: ' + out + ' sha256=' + srcSha.slice(0, 16) + '..');
} else {
  log('src sha256=' + srcSha.slice(0, 16) + '.. (no --version given, version not re-checked)');
}

// ---- 3) staged 候选:先删旧候选,再复制,再核对副本字节 ----
const tmp = TARGET + '.new';
try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
try {
  fs.copyFileSync(SRC, tmp);
} catch (e) {
  console.error('deliver FAILED: cannot stage ' + tmp + ': ' + e.message);
  process.exit(1);
}
const tmpSha = sha256(tmp);
if (tmpSha !== srcSha) {
  fs.rmSync(tmp, { force: true });
  console.error('deliver FAILED: staged copy sha256 ' + tmpSha + ' != src ' + srcSha + ' - removed candidate');
  process.exit(1);
}

// ---- 4) 落位:rename 覆盖(原子).目标被运行中 exe 映像锁定时重试 ----
let done = false;
let lastErr = null;
for (let i = 0; i < RETRIES && !done; i++) {
  try { fs.renameSync(tmp, TARGET); done = true; }
  catch (e) { lastErr = e; if (i < RETRIES - 1) spawnSync('node', ['-e', 'setTimeout(()=>{},' + INTERVAL_MS + ')']); }
}
if (done) {
  fs.rmSync(tmp, { force: true });
  const gotSha = sha256(TARGET);
  if (gotSha !== srcSha) {
    console.error('deliver FAILED: target sha256 ' + gotSha + ' != verified ' + srcSha + ' after rename');
    process.exit(1);
  }
  writeMarker('immediate');
  log('delivered: ' + TARGET + ' (sha256 ' + gotSha.slice(0, 16) + '.. verified on target)');
  process.exit(0);
}

// ---- 5) 目标被锁:拉起 detached 看护,由它带着**同一 sha256**在锁释放后补交付 ----
if (NO_WATCH) {
  fs.rmSync(tmp, { force: true });
  console.error('deliver FAILED: target locked (' + (lastErr && (lastErr.code || lastErr.message)) + ') and --no-watch given; candidate removed, target untouched');
  process.exit(1);
}
const child = spawn(process.execPath, [T + '/deliver-pending.js', tmp, TARGET, '--expect-sha256', srcSha, '--interval-ms', String(INTERVAL_MS)], {
  detached: true, stdio: 'ignore', windowsHide: true,
});
child.unref();
writeMarker('deferred');
log('deliver DEFERRED: ' + TARGET + ' locked (' + (lastErr && (lastErr.code || lastErr.message)) + ').');
log('staged: ' + tmp + ' (sha256 ' + srcSha.slice(0, 16) + '..) - watcher pid ' + child.pid + ' will deliver the same bytes on release (log: work/.deliver-pending.log)');
process.exit(0);

// 成功交付的审计记录(不是"版本标记":update-zh.js 的 work/.omp-zh-last-version 才由调用方写)
function writeMarker(mode) {
  try {
    fs.writeFileSync(path.join(T, 'work', '.omp-zh-last-delivery.json'), JSON.stringify({
      target: TARGET, src: SRC, version: VERSION || null, sha256: srcSha, mode, at: new Date().toISOString(),
    }, null, 2));
  } catch { /* best effort */ }
}
