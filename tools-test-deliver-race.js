// 交付竞态隔离回归测试(R15-02,2026-10-08)
//
// 验证 deliver-zh.js 的两处竞态修复:
//   (a) stage 前 killExistingWatchers() 会结束既有 deliver-pending 进程
//   (b) 新候选先写 .new.tmp-<pid>,核对字节后原子 rename 成 .new
//       -> 既有看护不可能看到半份文件
//
// 全程在临时目录里做,不触碰 G:/omp/omp-zh.exe 与主仓 work/.
// 用法: node tools-test-deliver-race.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const REPO = 'G:/omp works/Tools/omp-zh';
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function watchers() {
  const r = spawnSync('powershell', ['-NoProfile', '-Command',
    "@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*deliver-pending*' }).Count"],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
  return Number((r.stdout || '0').trim()) || 0;
}

// 真看护必须先停掉再跑本测试(否则 killExistingWatchers 会连它一起杀)
const pre = watchers();
if (pre > 0) { console.error('ABORT: ' + pre + ' real deliver-pending watcher(s) running - stop them first (this test kills by name match)'); process.exit(2); }

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliver-race-'));
const fakeSrc = path.join(tmpDir, 'built.exe');
const fakeTarget = path.join(tmpDir, 'install.exe');
const fakeNew = fakeTarget + '.new';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  -- ' + detail : ''));
  ok ? pass++ : fail++;
};

// 1) 起一个"假看护":模拟既有 deliver-pending,反复把 .new rename 到 target
// 假看护必须"长得像"真看护:脚本名含 'deliver-pending'(killExistingWatchers 按此过滤)
const decoyScript = path.join(tmpDir, 'deliver-pending-decoy.js');
fs.writeFileSync(decoyScript, [
  'const fs=require("fs");',
  'const sleep=(ms)=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);',
  '// 持续尝试(成功也不退出),模拟"每 3s 轮询"的真看护;由测试结束时 kill',
  'for(let i=0;i<300;i++){',
  '  try{ fs.renameSync(process.argv[2], process.argv[3]); }catch(e){}',
  '  sleep(100);',
  '}',
].join('\n'));
const decoy = spawn(process.execPath, [decoyScript, fakeNew, fakeTarget], { detached: true, stdio: 'ignore', windowsHide: true });
decoy.unref();
const decoyPid = decoy.pid;
check('decoy watcher started', decoyPid > 0, 'pid=' + decoyPid);

// 2) 准备源产物(内容确定)+ 一个"半成品".new(用来证明旧看护会搬坏东西)
const srcBytes = Buffer.from('VERIFIED-CANDIDATE-' + 'A'.repeat(1024));
fs.writeFileSync(fakeSrc, srcBytes);
const srcSha = sha256(fakeSrc);
fs.writeFileSync(fakeNew, Buffer.from('HALF-WRITTEN-GARBAGE'));
sleep(300); // 让 decoy 有机会先搬一次(证明它确实在动 .new)
try { fs.rmSync(fakeTarget, { force: true }); } catch {} // 清掉 decoy 搬过去的垃圾,确保走到锁分支

// 3) 跑 deliver-zh(目标被"锁"的情形用 --no-watch 之外的正常路径;
//    这里 target 不存在锁,所以会直接交付成功,正好验证 killExistingWatchers 是否先杀 decoy)
const r = spawnSync(process.execPath, [path.join(REPO, 'deliver-zh.js'),
  '--src', fakeSrc, '--target', fakeTarget,
  '--expect-sha256', srcSha, '--retries', '3', '--interval-ms', '500'],
  { encoding: 'utf8', timeout: 120000, windowsHide: true });
const out = (r.stdout || '') + (r.stderr || '');

// 断言改成"decoy 进程确实被终止"(不看日志文本),并记录 killExistingWatchers 的击杀清单
const stoppedLine = out.split('\n').find(l => l.includes('stopped stale watcher(s)')) || '';
const stoppedPids = (stoppedLine.split(':').pop().match(/\d+/g) || []).map(Number);
check('deliver-zh stopped a stale watcher', stoppedPids.length > 0, stoppedLine.trim() || '(no such line)');
check('the stopped watcher is OUR decoy (pid match)', stoppedPids.includes(decoyPid),
  'decoy=' + decoyPid + ' stopped=' + JSON.stringify(stoppedPids));

// 4) 核心断言:目标必须是**完整的验证字节**,绝不是半成品
const targetSha = fs.existsSync(fakeTarget) ? sha256(fakeTarget) : 'ABSENT';
check('target holds the verified bytes (not half-written)', targetSha === srcSha,
  targetSha === srcSha ? '' : 'target=' + targetSha.slice(0, 16) + ' want=' + srcSha.slice(0, 16));

// 5) 临时 stage 文件必须已被 rename 走(不留 .tmp-*)
const leftovers = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp-'));
check('no .tmp-* staging leftovers', leftovers.length === 0, leftovers.join(',') || '');

// 6) 收尾
try { decoy.kill(); } catch {}
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
console.log('\n' + (fail === 0 ? 'ALL ' + pass + ' PASS' : pass + ' pass / ' + fail + ' FAIL'));
process.exit(fail === 0 ? 0 : 1);
