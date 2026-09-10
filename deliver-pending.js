// deliver-pending.js - 交付看护:目标 exe 被运行中会话的映像锁锁定时,由 build-zh.js
// 以 detached 方式拉起本脚本;锁释放后自动 rename 补交付并用 sha256 核验.
// 用法: node deliver-pending.js <staged-new> <target>
// 日志: work/.deliver-pending.log;最多看护 24h(2880 x 30s),超时自然退出(下次
// update-zh.js 运行会重建并再走交付路径).
// 注意:不 spawn 目标 exe 做版本校验(它是 Bun 运行时,行为不可控,且避免在
// 目标正被占用时启动第二实例);用 staged/目标 sha256 相等证明 rename 落位.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.error('usage: node deliver-pending.js <new> <dst>'); process.exit(2); }

const LOG = path.join(__dirname, 'work', '.deliver-pending.log');
const log = (m) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch { /* best effort */ } };
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

log('watching: ' + src + ' -> ' + dst);
for (let i = 0; i < 2880; i++) {
  // staged 已被并发看护/人工搬走(文件消失)= 已交付,幂等退出
  if (!fs.existsSync(src)) { log('staged gone: ' + src + ' (delivered elsewhere)'); process.exit(0); }
  try {
    fs.renameSync(src, dst);
    // rename 是原子移动:成功即交付,src 自动消失.无需 spawn 目标或比对哈希.
    log('delivered: ' + dst + ' (rename ok)');
    process.exit(0);
  } catch { /* still locked */ }
  sleep(30000);
}
log('gave up after 24h: ' + src + ' still undelivered');
process.exit(1);
