// tools-verify-order.js - omp-zh 管线"先验证后交付"端到端回归(R15-01,2026-09-22)
//
// 目的:用**真实更新器**(update-zh.js -> patch-zh.js -> build-zh.js -> verify-zh.js -> 冒烟 -> deliver-zh.js)
// 在隔离 fixture 里跑完整失败/成功路径,证明:
//   1) 补丁规则 miss / 子进程失败 / 超时 / verify 失败 -> 正式目标字节不变,不遗留可自动交付的候选,
//      不写成功版本标记;
//   2) 正常路径 -> 交付的就是刚通过 verify+冒烟的那一份字节(sha256 相等);
//   3) 目标被占用 -> 延迟交付,且看护搬动的仍是同一 sha256 的候选.
//
// 隔离手段:fixture 是脚本 + work/ + 目标 exe 的**独立副本**,更新器通过 OMP_ZH_* 覆盖路径,
// 不写 G:/omp,不写 Steam,不碰共享 mod_configs.
//
// 用法: node tools-verify-order.js [--scenario ok|miss|patchfail|patchtimeout|verifyfail|locked|all]
//       node tools-verify-order.js --keep    # 保留 fixture 目录供人工检查
// 退出码: 0 = 全部断言通过;1 = 有失败;2 = 用法/前置错误
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const T = __dirname;
const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const wantIdx = args.indexOf('--scenario');
const WANT = wantIdx >= 0 ? args[wantIdx + 1] : 'all';

const ROOT = process.env.A4_FIXTURE_ROOT || 'G:/omp works/.tmp/report-fixes-20260922/verification/a4-fixture';
const LOGDIR = process.env.A4_LOG_DIR || 'G:/omp works/.tmp/report-fixes-20260922/verification/a4-logs';
const REAL_SRC = T + '/work/omp-dl-1828.exe';   // vanilla 18.2.8(下载产物,只读)
const VERSION = '18.2.8';
const SCRIPT_FILES = [
  'update-zh.js', 'patch-zh.js', 'build-zh.js', 'verify-zh.js', 'extract-cli.js',
  'translate.js', 'web-translate.js', 'rebuild.js', 'scan-gaps.js',
  'deliver-zh.js', 'deliver-pending.js',
];
const DICT_FILES = [
  'dict-help.json', 'dict-help-extra.json', 'dict-inline.json', 'dict-tui.json',
  'dict-settings-a.json', 'dict-settings-b.json', 'dict-tools.json', 'dict-slash.json', 'dict-plan.json',
];
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
// 被 FileShare.None 锁住时读不了 -> 返回 null 而不是抛(断言里按"未变/未知"处理)
const safeSha = (p) => { try { return sha256(p); } catch { return null; } };
// FileShare.None 下 open 失败但 stat 仍可读 -> 用 size+mtime 证明目标没被换过
const statId = (p) => { try { const st = fs.statSync(p); return st.size + '@' + st.mtimeMs; } catch { return null; } };
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const rmrf = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ } };
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }

// ---- fixture 文件集合快照(路径集合 + 字节),用于"整个 fixture 的路径集合与字节"比较 ----
function snapshot(dir, skip = []) {
  const out = {};
  const walk = (d) => {
    let es;
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p).replace(/\\/g, '/');
      if (skip.some((s) => rel === s || rel.startsWith(s + '/'))) continue;
      if (e.isDirectory()) walk(p);
      else {
        try { const st = fs.statSync(p); out[rel] = st.size + ':' + (st.size > 64 * 1024 * 1024 ? 'big:' + st.size : sha256(p)); }
        catch { out[rel] = 'unreadable'; }
      }
    }
  };
  walk(dir);
  return out;
}
function diffSets(a, b) {
  const added = Object.keys(b).filter((k) => !(k in a));
  const removed = Object.keys(a).filter((k) => !(k in b));
  const changed = Object.keys(a).filter((k) => k in b && a[k] !== b[k]);
  return { added, removed, changed };
}

// ---- fixture 构建 ----
function buildFixture(name, opts = {}) {
  const dir = path.join(ROOT, name);
  rmrf(dir);
  mkdirp(path.join(dir, 'work'));
  for (const f of SCRIPT_FILES) fs.copyFileSync(path.join(T, f), path.join(dir, f));
  for (const f of DICT_FILES) fs.copyFileSync(path.join(T, f), path.join(dir, f));
  // 可信摘要缓存(provenance 同 tag 且来源 official-sums)-> 全程离线,不走网络
  for (const f of ['SHA256SUMS.txt.' + VERSION, 'SHA256SUMS.provenance.json']) {
    fs.copyFileSync(path.join(T, 'work', f), path.join(dir, 'work', f));
  }
  // 源 exe:硬链接(同卷 0 字节);失败则退化为复制
  const dl = path.join(dir, 'work', 'omp-dl.exe');
  try { fs.linkSync(REAL_SRC, dl); }
  catch { fs.copyFileSync(REAL_SRC, dl); }
  // 交付目标:小哨兵文件(内容无关紧要;交付只按字节替换)
  const target = path.join(dir, 'install-omp-zh.exe');
  fs.writeFileSync(target, 'A4 FIXTURE SENTINEL ' + name + '\n');
  // S2:patch-zh.js 换成"打印规则 miss 后以非零码退出"的桩 -> 真实非零退出路径
  if (opts.breakPatchZh) {
    fs.writeFileSync(path.join(dir, 'patch-zh.js'),
      "console.log('patch WARN: [a4fixture] stub rule miss found=0 (upstream changed?)');\n" +
      "console.error('a4fixture stub: simulating a crashed patcher');\n" +
      'process.exit(3);\n');
  }
  if (opts.forceRuleMiss) {
    const p = path.join(dir, 'patch-zh.js');
    const s = fs.readFileSync(p, 'utf8');
    const anchor = '// 规则自检(所有数组已声明后执行)';
    if (!s.includes(anchor)) throw new Error('fixture: RULE-BUG anchor not found in patch-zh.js');
    // done:null 且 repl 不得是 bundle 里已有的子串,否则会被判成 SKIP 而不是 miss
    fs.writeFileSync(p, s.replace(anchor, "ENCSTALE_PATCHES.push({name:'A4 fixture forced miss (live, no version tag)',expect:1,find:'A4FIXTURE_NEVER_MATCHES_9f3a',repl:'A4FIXTURE_NEVER_WRITTEN_9f3a',done:null});\n" + anchor));
  }
  return { dir, target, dl };
}

function runUpdater(fx, env = {}, extraArgs = ['--force']) {
  const e = Object.assign({}, process.env, {
    OMP_ZH_LOCAL_EXE: path.join(fx.dir, 'nonexistent-local.exe'), // 强制走"未知本地版本"分支,避免依赖真实安装
    OMP_ZH_DELIVER: fx.target,
    OMP_NO_PROXY: '1', // fixture 全程离线
  }, env);
  const r = spawnSync('node', [path.join(fx.dir, 'update-zh.js')].concat(extraArgs), {
    encoding: 'utf8', timeout: 900000, env: e, cwd: fx.dir,
  });
  return { status: r.status, signal: r.signal, error: r.error && r.error.code, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// ---- 目标占用:PowerShell FileShare.None 句柄 ----
// 必须**同步**确认句柄已建立:子进程 spawn 是异步的,不等就开跑会在锁生效前完成交付.
// 用"写哨兵文件"而不是读管道(匿名管道上的 readSync 不会阻塞等待,拿不到数据).
function holdLock(file, ms) {
  const flag = file + '.lockflag';
  try { fs.rmSync(flag, { force: true }); } catch { /* ignore */ }
  const script = "$f=[System.IO.File]::Open('" + file.replace(/\\/g, '\\\\') + "','Open','Read','None');"
    + " [System.IO.File]::WriteAllText('" + flag.replace(/\\/g, '\\\\') + "','LOCKED');"
    + " Start-Sleep -Milliseconds " + ms + "; $f.Close();"
    + " [System.IO.File]::WriteAllText('" + flag.replace(/\\/g, '\\\\') + "','RELEASED')";
  const ps = spawn('powershell', ['-NoProfile', '-Command', script], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try { if (fs.readFileSync(flag, 'utf8').includes('LOCKED')) return { ps, released: () => { try { ps.kill(); } catch { /* ignore */ } } }; }
    catch { /* not yet */ }
    spawnSync('node', ['-e', 'setTimeout(()=>{},150)']);
  }
  try { ps.kill(); } catch { /* ignore */ }
  throw new Error('lock helper failed to acquire the lock on ' + file);
}

// ---- 断言收集 ----
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  -- ' + detail : ''));
}

// ================= 场景 =================
function scenarioMiss() {
  console.log('\n=== S1 patch rule miss (live rule that cannot match) ===');
  const fx = buildFixture('miss', { forceRuleMiss: true });
  const before = snapshot(fx.dir, ['work/omp-dl.exe']);
  const targetShaBefore = sha256(fx.target);
  const r = runUpdater(fx);
  console.log('exit=' + r.status);
  console.log(r.stdout.split('\n').filter((l) => /FAILED|patch WARN|patch gate|NOT written|building/.test(l)).join('\n'));
  const after = snapshot(fx.dir, ['work/omp-dl.exe']);
  const d = diffSets(before, after);
  check('S1 exit non-zero', r.status !== 0, 'status=' + r.status);
  check('S1 aborts at patch gate', /FAILED: patch-zh exited 1/.test(r.stdout), '');
  check('S1 did not build', !/building zh exe/.test(r.stdout), '');
  check('S1 target bytes unchanged', sha256(fx.target) === targetShaBefore, '');
  check('S1 no staged candidate', !exists(fx.target + '.new'), '');
  check('S1 no built artifact', !exists(path.join(fx.dir, 'work', 'omp-zh.exe')), '');
  check('S1 no success marker', !exists(path.join(fx.dir, 'work', '.omp-zh-last-version')), '');
  check('S1 no leftover .patched.tmp', !Object.keys(after).some((k) => k.endsWith('.patched.tmp')), '');
  check('S1 cli input left unpatched', sameCliAsExtract(fx), 'patched cli must equal freshly extracted cli');
  check('S1 fixture new paths only under work/', d.added.every((p) => p.startsWith('work/')), JSON.stringify(d.added.slice(0, 6)));
  return { r, d };
}

function sameCliAsExtract(fx) {
  // 独立重算:把 patch-zh 的产物与"重新提取的 cli"比较,证明未被写回半成品
  const cli = path.join(fx.dir, 'work', 'cli-' + VERSION.replace(/\./g, '_') + '.js');
  if (!exists(cli)) return false;
  const probe = path.join(fx.dir, 'work', 'cli-probe.js');
  const ex = spawnSync('node', [path.join(fx.dir, 'extract-cli.js'), path.join(fx.dir, 'work', 'omp-dl.exe'), probe], { encoding: 'utf8', timeout: 300000 });
  if (ex.status !== 0 || !exists(probe)) return false;
  const same = sha256(cli) === sha256(probe);
  rmrf(probe);
  return same;
}

function scenarioPatchFail() {
  console.log('\n=== S2 patch-zh exits non-zero (crashed patcher stub) ===');
  const fx = buildFixture('patchfail', { breakPatchZh: true });
  const targetShaBefore = sha256(fx.target);
  const r = runUpdater(fx);
  console.log('exit=' + r.status);
  console.log(r.stdout.split('\n').filter((l) => /FAILED|building/.test(l)).join('\n'));
  check('S2 exit non-zero', r.status !== 0, 'status=' + r.status);
  check('S2 abort names non-zero exit', /FAILED: patch-zh exited 3/.test(r.stdout), '');
  check('S2 did not build', !/building zh exe/.test(r.stdout), '');
  check('S2 target bytes unchanged', sha256(fx.target) === targetShaBefore, '');
  check('S2 no staged candidate', !exists(fx.target + '.new'), '');
  check('S2 no success marker', !exists(path.join(fx.dir, 'work', '.omp-zh-last-version')), '');
  return { r };
}

function scenarioPatchTimeout() {
  console.log('\n=== S3 patch-zh timeout (killed subprocess) ===');
  const fx = buildFixture('patchtimeout');
  const targetShaBefore = sha256(fx.target);
  const r = runUpdater(fx, { OMP_ZH_PATCH_TIMEOUT_MS: '1' });
  console.log('exit=' + r.status);
  console.log(r.stdout.split('\n').filter((l) => /FAILED|building/.test(l)).join('\n'));
  check('S3 exit non-zero', r.status !== 0, 'status=' + r.status);
  check('S3 abort names timeout', /FAILED: patch-zh timed out after 1ms/.test(r.stdout), '');
  check('S3 did not build', !/building zh exe/.test(r.stdout), '');
  check('S3 target bytes unchanged', sha256(fx.target) === targetShaBefore, '');
  check('S3 no staged candidate', !exists(fx.target + '.new'), '');
  check('S3 no success marker', !exists(path.join(fx.dir, 'work', '.omp-zh-last-version')), '');
  return { r };
}

function scenarioVerifyFail() {
  console.log('\n=== S4 verify failure (translation breaks literal pairing) ===');
  const fx = buildFixture('verifyfail');
  // 先做一次真实提取,挑一个真实存在的普通字面量做注入
  const prep = spawnSync('node', [path.join(fx.dir, 'extract-cli.js'), path.join(fx.dir, 'work', 'omp-dl.exe'),
    path.join(fx.dir, 'work', 'cli-' + VERSION.replace(/\./g, '_') + '.js')], { encoding: 'utf8', timeout: 300000 });
  if (prep.status !== 0) throw new Error('fixture prep extract failed: ' + prep.stderr.slice(-300));
  const { scanStrings } = require(path.join(fx.dir, 'translate.js'));
  const cliText = fs.readFileSync(path.join(fx.dir, 'work', 'cli-' + VERSION.replace(/\./g, '_') + '.js'), 'utf8');
  const lits = scanStrings(cliText).filter((l) => !l.isTemplate && l.quote === '"' && l.content.length > 12 && !l.content.includes('\\'));
  if (!lits.length) throw new Error('fixture: no plain literal found for injection');
  const victim = lits[Math.floor(lits.length / 2)];
  fs.writeFileSync(path.join(fx.dir, 'work', 'out-a4fixture.json'),
    JSON.stringify([{ from: victim.content, mode: 'full', to: 'A4注入中文"破引号' }], null, 1));
  const targetShaBefore = sha256(fx.target);
  const r = runUpdater(fx);
  console.log('exit=' + r.status);
  console.log(r.stdout.split('\n').filter((l) => /FAILED|VERIFY|building|smoke|deliver/.test(l)).join('\n'));
  check('S4 exit non-zero', r.status !== 0, 'status=' + r.status);
  check('S4 built isolated artifact (reached gate 2)', /building zh exe/.test(r.stdout), '');
  check('S4 verify failed', /VERIFY FAILED/.test(r.stdout), '');
  check('S4 never reached delivery', !/deliver-zh|delivery confirmed|deliver DEFERRED/.test(r.stdout), '');
  check('S4 target bytes unchanged', sha256(fx.target) === targetShaBefore, '');
  check('S4 no staged candidate', !exists(fx.target + '.new'), '');
  check('S4 no success marker', !exists(path.join(fx.dir, 'work', '.omp-zh-last-version')), '');
  return { r };
}

function scenarioOk() {
  console.log('\n=== S5 normal path: verify+smoke before delivery ===');
  const fx = buildFixture('ok');
  const targetShaBefore = sha256(fx.target);
  const r = runUpdater(fx);
  console.log('exit=' + r.status);
  console.log(r.stdout.split('\n').filter((l) => /FAILED|built sha256|verify-zh PASS|smoke OK|deliver|delivery|done\./.test(l)).join('\n'));
  const built = path.join(fx.dir, 'work', 'omp-zh.exe');
  check('S5 exit zero', r.status === 0, 'status=' + r.status);
  check('S5 patch gate passed', /patch gate PASS/.test(r.stdout), '');
  check('S5 built', exists(built), '');
  // 用真实交付日志行做序判定(不能只搜 'deliver' —— build-zh 的说明文字里也含该词)
  const iVerify = r.stdout.indexOf('verify-zh PASS');
  const iSmoke = r.stdout.indexOf('smoke OK (isolated)');
  const iDeliver = r.stdout.indexOf('delivered: ' + fx.target);
  check('S5 order: verify PASS before delivery', iVerify >= 0 && iDeliver > iVerify, 'verify@' + iVerify + ' deliver@' + iDeliver);
  check('S5 order: smoke before delivery', iSmoke >= 0 && iDeliver > iSmoke, 'smoke@' + iSmoke + ' deliver@' + iDeliver);
  const deliveredSha = sha256(fx.target);
  check('S5 target replaced', deliveredSha !== targetShaBefore, '');
  check('S5 delivered bytes == built bytes', exists(built) && deliveredSha === sha256(built), 'target=' + deliveredSha.slice(0, 16) + ' built=' + (exists(built) ? sha256(built).slice(0, 16) : 'n/a'));
  check('S5 no leftover candidate', !exists(fx.target + '.new'), '');
  check('S5 success marker written', exists(path.join(fx.dir, 'work', '.omp-zh-last-version')), '');
  check('S5 delivered exe self-reports version', (() => {
    const v = spawnSync(fx.target, ['--version'], { encoding: 'utf8', timeout: 120000 });
    return v.status === 0 && (v.stdout || '').includes('omp/' + VERSION);
  })(), '');
  return { r, deliveredSha };
}

// S6 直接测交付层(deliver-zh.js + deliver-pending.js),用小文件而不是 250MB 产物.
// 理由:deferred/锁定/sha256 全部逻辑都在交付层;完整更新器链路由 S1-S5 覆盖.
// 这样 S6 的成本从 ~0.55GB 降到 ~2MB,G: 盘紧张时也能跑.
function scenarioLocked() {
  console.log('\n=== S6 target locked: deferred, watcher delivers the same bytes (delivery layer) ===');
  const dir = path.join(ROOT, 'locked');
  rmrf(dir); mkdirp(path.join(dir, 'work'));
  for (const f of ['deliver-zh.js', 'deliver-pending.js']) fs.copyFileSync(path.join(T, f), path.join(dir, f));
  const built = path.join(dir, 'built.exe');       // 扮演"已通过 verify+冒烟"的产物
  const target = path.join(dir, 'install.exe');
  fs.writeFileSync(built, 'A4 VERIFIED ARTIFACT ' + 'x'.repeat(400000) + '\n');
  fs.writeFileSync(target, 'A4 SENTINEL original target\n');
  const builtSha = sha256(built);
  const targetShaBefore = sha256(target);
  const targetIdBefore = statId(target);
  const tmp = target + '.new';
  const dargs = (extra) => [path.join(dir, 'deliver-zh.js'), '--src', built, '--target', target,
    '--expect-sha256', builtSha, '--retries', '2', '--interval-ms', '1000'].concat(extra);

  // S6a:sha256 不符 -> 拒绝,不碰目标,不留候选
  const bad = spawnSync('node', dargs([]).map((a) => (a === builtSha ? 'f'.repeat(64) : a)), { encoding: 'utf8', timeout: 120000 });
  const badOut = (bad.stdout || '') + (bad.stderr || '');
  console.log(badOut.trim().split('\n').slice(-2).join('\n'));
  check('S6a exit non-zero on sha mismatch', bad.status !== 0, 'status=' + bad.status);
  check('S6a names the mismatch', /src sha256 .* != expected/.test(badOut), '');
  check('S6a target untouched', sha256(target) === targetShaBefore, '');
  check('S6a no candidate left', !exists(tmp), '');

  // S6b:目标被锁 + --no-watch -> exit 1,候选删除,目标不变
  let lock = holdLock(target, 12000);
  let r = spawnSync('node', dargs(['--no-watch']), { encoding: 'utf8', timeout: 180000 });
  let out = (r.stdout || '') + (r.stderr || '');
  check('S6b exit non-zero when locked and no watcher', r.status !== 0, 'status=' + r.status);
  check('S6b reports locked', /deliver FAILED: target locked/.test(out), '');
  check('S6b target untouched while locked', safeSha(target) === targetShaBefore || statId(target) === targetIdBefore, 'sha=' + safeSha(target) + ' id=' + statId(target) + ' want=' + targetIdBefore);
  check('S6b candidate removed', !exists(tmp), '');

  // S6c:目标被锁 + 看护在位 -> deferred(exit 0),锁释放后看护搬同一 sha256
  lock.released();
  lock = holdLock(target, 12000);
  r = spawnSync('node', dargs([]), { encoding: 'utf8', timeout: 180000 });
  out = (r.stdout || '') + (r.stderr || '');
  console.log(out.trim().split('\n').slice(-2).join('\n'));
  check('S6c target untouched while locked', safeSha(target) === targetShaBefore || statId(target) === targetIdBefore, 'sha=' + safeSha(target) + ' id=' + statId(target) + ' want=' + targetIdBefore);
  check('S6c reports DEFERRED', /deliver DEFERRED/.test(out), '');
  check('S6c candidate staged', exists(tmp), '');
  const deadline = Date.now() + 60000;
  let deliveredSha = null;
  while (Date.now() < deadline) {
    spawnSync('node', ['-e', 'setTimeout(()=>{},1000)']);
    // 目标在锁释放前读不了(FileShare.None -> EBUSY),按"还没交付"处理
    let cur = null;
    try { cur = sha256(target); } catch { cur = null; }
    if (!exists(tmp) && cur !== null && cur !== targetShaBefore) { deliveredSha = cur; break; }
  }
  check('S6c watcher delivered after release', deliveredSha !== null, 'sha=' + (deliveredSha || 'none'));
  check('S6c watcher delivered the verified bytes', deliveredSha === builtSha, 'delivered=' + String(deliveredSha).slice(0, 16) + ' built=' + builtSha.slice(0, 16));
  const wlog = path.join(dir, 'work', '.deliver-pending.log');
  check('S6c watcher log records sha-verified delivery', exists(wlog) && /sha256 .* verified/.test(fs.readFileSync(wlog, 'utf8')), exists(wlog) ? fs.readFileSync(wlog, 'utf8').trim().split('\n').slice(-1)[0] : 'no log');
  return { r, deliveredSha, builtSha };
}

// ================= 主流程 =================
const SCENARIOS = { miss: scenarioMiss, patchfail: scenarioPatchFail, patchtimeout: scenarioPatchTimeout, verifyfail: scenarioVerifyFail, ok: scenarioOk, locked: scenarioLocked };

// 每个场景峰值约 550MB(源 exe 硬链接 + 248MB 构建产物 + 248MB 交付目标 + 28MB cli).
// G: 盘长期接近满,空间不足时直接拒绝开跑,避免中途 ENOSPC 把断言结果变成假失败.
function freeGB(p) {
  try {
    const st = fs.statfsSync(p);
    return (st.bavail * st.bsize) / 1073741824;
  } catch { return null; }
}

function main() {
  if (!exists(REAL_SRC)) { console.error('prerequisite missing: ' + REAL_SRC); process.exit(2); }
  mkdirp(ROOT); mkdirp(LOGDIR);
  const names = WANT === 'all' ? Object.keys(SCENARIOS) : [WANT];
  for (const n of names) {
    if (!SCENARIOS[n]) { console.error('unknown scenario: ' + n); process.exit(2); }
  }
  // 全链路场景需要 ~0.6GB(源 exe 硬链接 + 248MB 产物 + 248MB 目标 + 28MB cli);
  // locked 只测交付层,~2MB.
  const need = names.reduce((a, n) => a + (n === 'locked' ? 0.02 : 0.6), 0);
  const gb = freeGB(ROOT);
  if (gb !== null && gb < need) {
    console.error('insufficient free space: ' + gb.toFixed(2) + 'GB free, ~' + need.toFixed(1) + 'GB needed for ' + names.length + ' scenario(s)');
    process.exit(2);
  }
  const summary = {};
  for (const n of names) {
    const r = SCENARIOS[n]();
    summary[n] = r && r.r ? { exit: r.r.status, signal: r.r.signal, error: r.r.error } : {};
    fs.writeFileSync(path.join(LOGDIR, 'a4-' + n + '.log'), (r && r.r ? r.r.stdout + (r.r.stderr ? '\n--- stderr ---\n' + r.r.stderr : '') : ''), 'utf8');
    if (!KEEP) rmrf(path.join(ROOT, n)); // 逐个清理,避免多次 250MB 产物叠加
  }
  const failed = results.filter((x) => !x.ok);
  console.log('\n==== ' + (results.length - failed.length) + '/' + results.length + ' PASS ====');
  for (const f of failed) console.log('FAIL  ' + f.name + '  -- ' + f.detail);
  fs.writeFileSync(path.join(LOGDIR, 'a4-order-result.json'), JSON.stringify({
    at: new Date().toISOString(), version: VERSION, scenarios: summary, checks: results,
    pass: results.length - failed.length, total: results.length,
  }, null, 2));
  console.log('result json: ' + path.join(LOGDIR, 'a4-order-result.json'));
  process.exit(failed.length ? 1 : 0);
}
main();
