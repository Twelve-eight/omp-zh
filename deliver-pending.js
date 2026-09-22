// deliver-pending.js - 交付看护:目标 exe 被运行中会话的映像锁锁定时,由 deliver-zh.js
// 以 detached 方式拉起本脚本;锁释放后自动 rename 补交付,并核验落位字节与已验证产物一致.
//
// 用法: node deliver-pending.js <staged-new> <target> [--expect-sha256 <64hex>] [--interval-ms <ms>]
// 日志: work/.deliver-pending.log;最多看护 24h,超时自然退出
//       (下次 update-zh.js 运行会重建并再走交付路径).
//
// R15-01(2026-09-22):看护只搬**已经被 verify+冒烟过的那一份字节**.交付前重算 staged 的
// sha256,与调用方给定的期望值不符即放弃并删掉候选(绝不让未验证字节就位);rename 成功后
// 再核一次目标字节.不 spawn 目标 exe 做版本校验(它是 Bun 运行时,行为不可控,且避免在
// 目标正被占用时启动第二实例).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const argv = process.argv.slice(2);
function opt(name) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : null;
}
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const [src, dst] = positional;
if (!src || !dst) { console.error('usage: node deliver-pending.js <new> <dst> [--expect-sha256 <64hex>] [--interval-ms <ms>]'); process.exit(2); }
const EXPECT = (opt('expect-sha256') || '').trim().toLowerCase();
const INTERVAL_MS = Math.max(1000, Number(opt('interval-ms') || 30000));
if (EXPECT && !/^[0-9a-f]{64}$/.test(EXPECT)) { console.error('--expect-sha256 must be 64-char hex'); process.exit(2); }

const LOG = path.join(__dirname, 'work', '.deliver-pending.log');
const log = (m) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch { /* best effort */ } };
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const maxTries = Math.ceil((24 * 3600 * 1000) / INTERVAL_MS);

log('watching: ' + src + ' -> ' + dst + (EXPECT ? ' (expect sha256 ' + EXPECT.slice(0, 16) + '..)' : ' (no sha256 given)'));

// 交付前校验:staged 必须就是调用方验证过的那一份字节.
if (EXPECT) {
  let got = null;
  try { got = sha256(src); } catch (e) { log('staged unreadable: ' + e.message); process.exit(1); }
  if (got !== EXPECT) {
    log('ABORT: staged sha256 ' + got + ' != expected ' + EXPECT + ' - removing candidate, target untouched');
    try { fs.rmSync(src, { force: true }); } catch { /* ignore */ }
    process.exit(1);
  }
}

for (let i = 0; i < maxTries; i++) {
  // staged 已被并发看护/人工搬走(文件消失)= 已交付,幂等退出
  if (!fs.existsSync(src)) { log('staged gone: ' + src + ' (delivered elsewhere)'); process.exit(0); }
  try {
    fs.renameSync(src, dst);
    // rename 是原子移动:成功即落位.再用 sha256 核对目标字节,证明落位的确实是验证过的那份.
    const got = sha256(dst);
    if (EXPECT && got !== EXPECT) {
      log('MISMATCH after rename: target sha256 ' + got + ' != expected ' + EXPECT);
      process.exit(1);
    }
    log('delivered: ' + dst + ' (rename ok, sha256 ' + got.slice(0, 16) + '.. verified)');
    process.exit(0);
  } catch { /* still locked */ }
  sleep(INTERVAL_MS);
}
log('gave up after 24h: ' + src + ' still undelivered');
process.exit(1);
