// OMP 上游更新自动汉化管线主控
// 用法:
//   node update-zh.js                 # 完整流程：检测→下载→提取→差异→构建→验证→交付
//   node update-zh.js --check-only    # 只检测是否有新版本
//   node update-zh.js --no-deliver    # 构建到 Temp，不替换 G:\omp\omp-zh.exe
//   node update-zh.js --force         # 忽略版本比较，强制处理
// 依赖: extract-cli.js / build-zh.js / scan-gaps.js / verify-zh.js（同目录）
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const T = __dirname;
const REPO = 'can1357/oh-my-pi';
const ASSET = 'omp-windows-x64.exe';
// 镜像回退链（2026-08-30 从 github.akams.cn 聚合站 48 个镜像实测 3MB 探针排序；
// gh-proxy.com 当日已瘫 0B/s 故垫底）。SHA256SUMS 始终走官方源，镜像篡改会被校验拦截。
const MIRRORS = [
  'https://js.jiangss.shop/',
  'https://ghproxy.felicity.land/',
  'https://cfgh.ikgy.top/',
  'https://gh.meali.top/',
  'https://gh.dpik.top/',
  'https://gh.927223.xyz/',
  'https://github.tbap.top/',
  'https://gh-proxy.com/',
  '', // 直连 GitHub 兜底
];
const DL_EXE = T + '/work/omp-dl.exe';
const DL_SUMS = T + '/work/SHA256SUMS.txt';
// 校验信任锚(WS-0916-01,2026-09-16):摘要只能来自独立可信来源,镜像只允许传 exe 字节.
// 旧实现允许 SHA256SUMS 走镜像链,同一不可信端可同时控制 exe 与摘要 -> 哈希相等只证明二者一致,
// 不证明来自官方.现在:
//   1) OMP_TRUST_DIGEST=<64hex> 由操作者独立核验后提供,优先级最高;
//   2) 官方直连 https://github.com/<repo>/releases/download/v<tag>/SHA256SUMS.txt;
//   3) 官方 API releases/tags/v<tag> 的 assets[].digest(gh api 优先,curl 直连 api.github.com 兜底);
//   三者全部不可用 -> 失败关闭(不交付),并在错误里说明如何提供可信摘要.
const TRUST_DIGEST = (process.env.OMP_TRUST_DIGEST || '').trim().toLowerCase();
const SUMS_PROVENANCE = T + '/work/SHA256SUMS.provenance.json';
// 缓存摘要文件的来源标记:无标记或标记为 mirror 的缓存一律视为不可信,必须重新获取.
function readSumsProvenance() {
  try { return JSON.parse(fs.readFileSync(SUMS_PROVENANCE, 'utf8')); } catch { return null; }
}
function writeSumsProvenance(tag, source, hex) {
  try { fs.writeFileSync(SUMS_PROVENANCE, JSON.stringify({ tag, source, hex, at: new Date().toISOString() }, null, 2)); } catch { /* 非致命 */ }
}
const LOCAL_EXE = 'G:/omp/omp-zh.exe'; // 检测汉化版自身版本（原读官方版 omp.exe 导致检测与实际使用脱节）
const DELIVER = 'G:/omp/omp-zh.exe';
const LAST_VER_FILE = T + '/work/.omp-zh-last-version';
// 代理加速(2026-09-16):本地 7897 代理实测远快于镜像链;curl 显式 -x.
// OMP_NO_PROXY=1 关闭(镜像链仍可用).
const PROXY = process.env.OMP_NO_PROXY ? '' : (process.env.OMP_PROXY || 'http://127.0.0.1:7897');
const curlProxyArgs = PROXY ? ['-x', PROXY] : [];

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check-only');
const NO_DELIVER = args.includes('--no-deliver');
const FORCE = args.includes('--force');

function sh(cmd, argsList, opts = {}) {
  const r = spawnSync(cmd, argsList, { encoding: 'utf8', timeout: opts.timeout || 300000, ...opts });
  if (r.error) throw new Error(`${cmd} spawn: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${argsList.join(' ')} exited ${r.status}: ${(r.stderr || '').slice(-500)}`);
  return r.stdout;
}

function log(m) { console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + m); }

// ---- 1. 本地版本 ----
function localVersion() {
  try {
    const out = execFileSync(LOCAL_EXE, ['--version'], { encoding: 'utf8', timeout: 30000 });
    const m = out.match(/omp\/([\d.]+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

// ---- 2. 最新 release tag（gh api 优先，失败走镜像代理 API） ----
function latestTag() {
  try {
    const out = sh('gh', ['api', `repos/${REPO}/releases/latest`, '--jq', '.tag_name']);
    return out.trim().replace(/^v/, '');
  } catch (e) {
    log('gh api failed (' + String(e.message).slice(0, 80) + ') - trying mirror API proxies');
  }
  // 镜像代理 API 回退（与下载同一镜像链；实测 gh-proxy.com 可代理 api.github.com，
  // js.jiangss.shop 会撞未认证限流）。响应体里 grep tag_name，JSON 解析失败也能容错。
  for (const m of MIRRORS) {
    if (!m) continue; // 直连 api.github.com 已由 gh api 尝试过
    try {
      const out = sh('curl', ['-fsSL', '--connect-timeout', '15', '--max-time', '30'].concat(curlProxyArgs, [m + `https://api.github.com/repos/${REPO}/releases/latest`]), { timeout: 45000 });
      const t = (out.match(/"tag_name":\s*"[^"]+"/) || [])[0];
      if (t) {
        const tag = t.split('"')[3].replace(/^v/, '');
        log('latest tag via mirror ' + m + ': ' + tag);
        return tag;
      }
    } catch { /* try next mirror */ }
  }
  throw new Error('all methods failed to fetch latest release tag');
}

// ---- 3. 下载 + 校验（支持复用本地已下载文件；镜像回退链） ----
function download(tag) {
  const ghUrl = `https://github.com/${REPO}/releases/download/v${tag}/${ASSET}`;
  const sumsUrl = ghUrl.replace(ASSET, 'SHA256SUMS.txt');
  const sumsTagFile = `${DL_SUMS}.${tag}`; // 每版本独立缓存，防止旧版 SUMS 误校验新版文件
  const haveSums = () => { if (fs.existsSync(sumsTagFile) && fs.statSync(sumsTagFile).size > 0) return sumsTagFile; return null; };
  // 可信摘要缓存判定:文件存在,且 provenance 记录的 tag 与 source 都可信(operator/official-*).
  const haveTrustedSums = (tag) => {
    if (!haveSums()) return null;
    const p = readSumsProvenance();
    if (!p || p.tag !== tag) return null;
    if (p.source !== 'operator' && p.source !== 'official-sums' && p.source !== 'official-api') return null;
    return sumsTagFile;
  };
  const writeTrustedSums = (tag, source, hex) => {
    fs.writeFileSync(sumsTagFile, hex + '  ' + ASSET + '\n');
    writeSumsProvenance(tag, source, hex);
    return sumsTagFile;
  };
  // 从官方 SHA256SUMS 内容里取出本资产的期望摘要,用于 provenance 审计记录.
  const digestFromSums = (p) => {
    try {
      const line = fs.readFileSync(p, 'utf8').split('\n').find(l => l.includes(ASSET));
      return line ? line.trim().split(/\s+/)[0].toLowerCase() : null;
    } catch { return null; }
  };
  // 唯一允许的摘要来源:操作者显式提供(最高优先级).
  const fetchOperatorDigest = (tag) => {
    if (!TRUST_DIGEST) return null;
    if (!/^[0-9a-f]{64}$/.test(TRUST_DIGEST)) {
      throw new Error('OMP_TRUST_DIGEST is not a 64-char hex sha256: ' + TRUST_DIGEST.slice(0, 16));
    }
    log('using operator-provided digest for ' + ASSET + ' (' + TRUST_DIGEST.slice(0, 16) + '..)');
    return writeTrustedSums(tag, 'operator', TRUST_DIGEST);
  };
  // 官方直连摘要(不经镜像):github.com release 资产,或 API 的 assets[].digest.
  const fetchOfficialSums = () => {
    sh('curl', ['-fsSL', '--connect-timeout', '30'].concat(curlProxyArgs, ['-o', sumsTagFile, sumsUrl]), { timeout: 120000 });
    if (fs.existsSync(sumsTagFile) && fs.statSync(sumsTagFile).size > 0) {
      writeSumsProvenance(tag, 'official-sums', digestFromSums(sumsTagFile));
      return sumsTagFile;
    }
    throw new Error('empty sums from official source');
  };
  // SUMS 资产缺失回退(2026-09-16,上游 v18.2.1 起不再发布 SHA256SUMS.txt):
  // 改用 releases API 的 assets[].digest 字段("sha256:<hex>")作为期望值,写成本地清单格式.
  // 只走官方端点(gh api,或直连 api.github.com);镜像 API 代理不参与,否则又回到"同一端控制两边".
  const fetchDigestFromApi = () => {
    const apiUrl = `https://api.github.com/repos/${REPO}/releases/tags/v${tag}`;
    const parse = (out) => {
      const j = JSON.parse(out);
      const a = (j.assets || []).find(x => x.name === ASSET);
      if (!a || !a.digest) return null;
      const hex = String(a.digest).replace(/^sha256:/i, '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(hex)) return null;
      log('SUMS asset missing - using official API digest for ' + ASSET + ' (' + hex.slice(0, 16) + '..)');
      return writeTrustedSums(tag, 'official-api', hex);
    };
    try { return parse(sh('gh', ['api', `repos/${REPO}/releases/tags/v${tag}`])); } catch (e) { /* 直连兜底 */ }
    return parse(sh('curl', ['-fsSL', '--connect-timeout', '20', '--max-time', '40'].concat(curlProxyArgs, [apiUrl]), { timeout: 60000 }));
  };
  // 按可信度顺序取摘要;全不可用则失败关闭.注意:这里没有任何镜像回退.
  const resolveTrustedSums = () => {
    const cached = haveTrustedSums(tag);
    if (cached) return cached;
    const op = fetchOperatorDigest(tag);
    if (op) return op;
    try { return fetchOfficialSums(); } catch (e) { log('official SUMS unavailable (' + e.message.slice(0, 80) + ') - trying official API digest'); }
    try { return fetchDigestFromApi(); } catch (e) { /* fall through to fail-closed */ }
    throw new Error(
      'no trusted digest source for v' + tag + ': official SHA256SUMS.txt, official API digest and OMP_TRUST_DIGEST all unavailable. ' +
      'Refusing to deliver on a mirror-provided digest. Verify the release digest out of band and re-run with OMP_TRUST_DIGEST=<64hex>.'
    );
  };
  // 可信摘要只解析一次,且在任何"可能被吞掉"的分支之前:摘要来源不可用时必须直接失败关闭,
  // 不能被下面的本地复用 try/catch 降级成"改走镜像下载",那会把信任错误伪装成网络错误.
  const sumsPath = resolveTrustedSums();
  const expectedDigest = (() => {
    const sums = fs.readFileSync(sumsPath, 'utf8');
    const line = sums.split('\n').find(l => l.includes(ASSET));
    if (!line) throw new Error('trusted digest list missing entry for ' + ASSET);
    return line.trim().split(/\s+/)[0].toLowerCase();
  })();
  const sha256Of = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

  // 本地已有文件:用已解析的可信摘要直接比对(这里不再解析摘要,失败即下载)
  if (fs.existsSync(DL_EXE)) {
    try {
      const actual = sha256Of(DL_EXE);
      if (expectedDigest === actual) {
        log('reusing pre-downloaded ' + ASSET + ' (sha256 OK: ' + actual.slice(0, 16) + '..)');
        return DL_EXE;
      }
      log('pre-downloaded file sha256 mismatch - re-downloading');
    } catch (e) { log('local reuse check failed: ' + e.message + ' - downloading'); }
  }
  fs.rmSync(DL_EXE, { force: true }); // 禁用断点续传语义：上游替换资产后 -C - 会把新旧字节拼成确定性脏文件
  log('downloading ' + ASSET + ' v' + tag);
  // 镜像链依序尝试;最后一个条目是直连 GitHub 兜底.镜像产物只提供字节,期望摘要必须来自可信来源.
  let lastErr = null;
  for (const m of MIRRORS) {
    const url = m + ghUrl;
    try {
      sh('curl', ['-fL', '--connect-timeout', '30', '--retry', '2'].concat(curlProxyArgs, ['-o', DL_EXE, url]), { timeout: 1800000 });
      if (fs.existsSync(DL_EXE) && fs.statSync(DL_EXE).size > 1000000) break; // 基本完整（后续 sha256 兜底）
      throw new Error('file too small (' + (fs.existsSync(DL_EXE) ? fs.statSync(DL_EXE).size : 0) + ' bytes)');
    } catch (e) {
      lastErr = e;
      log('download failed via ' + (m || 'direct GitHub') + ': ' + e.message);
      fs.rmSync(DL_EXE, { force: true });
    }
  }
  if (!fs.existsSync(DL_EXE)) throw new Error('all mirrors failed, last error: ' + (lastErr && lastErr.message));
  // 镜像只负责传字节;期望摘要已在上方从可信来源解析,这里只做比对.
  const actual = sha256Of(DL_EXE);
  if (expectedDigest !== actual) {
    fs.rmSync(DL_EXE, { force: true });
    fs.rmSync(SUMS_PROVENANCE, { force: true }); // 摘要与实际字节不符:连带作废缓存摘要,避免下一轮沿用
    throw new Error(`sha256 mismatch for ${ASSET}: expected ${expectedDigest}, got ${actual}`);
  }
  log('sha256 OK: ' + actual.slice(0, 16) + '..');
  return DL_EXE;
}

// ---- 主流程 ----
async function main() {
  const cur = localVersion();
  log('local version: ' + (cur || 'unknown'));
  const latest = latestTag();
  log('latest release: ' + latest);

  if (!FORCE && cur === latest) {
    log('already up to date (' + cur + ') — nothing to do');
    fs.writeFileSync(LAST_VER_FILE, latest);
    return;
  }
  if (CHECK_ONLY) { log('update available: ' + cur + ' -> ' + latest); return; }

  log('update needed: ' + (cur || 'none') + ' -> ' + latest);

  // 下载 + 校验
  const exePath = download(latest);

  // 提取 cli.js
  const cliNew = `${T}/work/cli-${latest.replace(/\./g, '_')}.js`;
  log('extracting cli.js');
  sh('node', [T + '/extract-cli.js', exePath, cliNew]);

  // 应用汉化补丁（catalog max/compat + focus；失败仅警告）
  log('applying zh patches');
  const patchRes = spawnSync('node', [T + '/patch-zh.js', cliNew], { encoding: 'utf8', timeout: 60000 });
  if (patchRes.stdout) log(patchRes.stdout.trim().split('\n').map(l => '  ' + l).join('\n'));
  if (patchRes.status !== 0) log('WARN: patch-zh exited ' + patchRes.status + ' — some fixes may be missing');

  // 差异发现(新增英文文本)
  log('scanning translation gaps');
  const dicts = ['dict-help.json','dict-help-extra.json','dict-inline.json','dict-tui.json','dict-settings-a.json','dict-settings-b.json','dict-tools.json','dict-slash.json','dict-plan.json']
    .map(f => T + '/' + f)
    .concat(fs.readdirSync(T + '/work').filter((x) => /^out-.+\.json$/.test(x)).map((x) => T + '/work/' + x)); // staging 与 build-zh 同源(2026-09-10 修正:gap 指标须含 staging,否则环比虚报)
  let gaps = '';
  try { gaps = sh('node', [T + '/scan-gaps.js', cliNew].concat(dicts)); } catch (e) { gaps = 'scan-gaps failed: ' + e.message; }
  const gapMatch = gaps.match(/UNTRANSLATED_COUNT:\s*(\d+)/);
  const untranslated = gapMatch ? Number(gapMatch[1]) : -1;
  log('untranslated sentence-like literals: ' + (untranslated >= 0 ? untranslated : 'n/a'));
  fs.writeFileSync(T + '/work/gaps-' + latest + '.txt', gaps);

  // ---- 覆盖率环比门槛(2026-09-09 加;此前 helpCJK 1643->1577 连续四轮回退无任何告警) ----
  // 历史基线存 work/.omp-zh-cov-history.json;helpCJK 下降或 gap 增大 -> WARN(不阻断交付,
  // 但必须显式记录在 DEVLOG,补译还债后基线回升).上一版本无基线(首记)仅记录.
  const covFile = T + '/work/.omp-zh-cov-history.json';
  let covHist = [];
  try { covHist = JSON.parse(fs.readFileSync(covFile, 'utf8')); } catch { covHist = []; }
  const prevCov = covHist.length ? covHist[covHist.length - 1] : null;

  // 构建汉化版(Temp 输出;交付按 flag)
  log('building zh exe');
  const buildArgs = ['--src', exePath, '--cli', cliNew, '--dst', T + '/work/omp-zh.exe'];
  if (!NO_DELIVER) buildArgs.push('--deliver', DELIVER);
  sh('node', [T + '/build-zh.js'].concat(buildArgs)); // 交付失败 -> build-zh exit 1 -> sh 抛错中止(不写 last-version)

  // 验证
  log('verifying');
  try {
    sh('node', [T + '/verify-zh.js', cliNew, T + '/work/cli-zh.js']);
    log('verify-zh PASS');
  } catch (e) {
    log('VERIFY FAILED: ' + e.message);
    process.exitCode = 1;
    return;
  }

  // 冒烟三态判定:
  //   a) 交付目标已是新版本 -> smoke DELIVERED(常规交付成功);
  //   b) 交付目标仍旧版本 且 staged .new 在位(交付延迟,看护在跑)-> smoke DEFERRED
  //      (测 work 产物;看护会在占用会话退出后补交付并核验版本);
  //   c) 都不是 -> FAIL(交付真失败:build-zh exit 1 或无 staged 无新版本).
  // 2026-09-09 前盲区:smoke 只测 work 产物,交付失败照样绿灯 + 写 last-version,
  // 用户手里还是旧版(08-22 坏版本滞留,09-06/07 两轮无人核验均为此形态).
  const staged = DELIVER + '.new';
  const targetIsNew = (() => {
    try { return execFileSync(DELIVER, ['--version'], { encoding: 'utf8', timeout: 60000 }).includes('omp/' + latest); }
    catch { return false; }
  })();
  const deferred = !NO_DELIVER && !targetIsNew && fs.existsSync(staged);
  const smokeTarget = NO_DELIVER || deferred ? T + '/work/omp-zh.exe' : DELIVER;
  const smoke = execFileSync(smokeTarget, ['--version'], { encoding: 'utf8', timeout: 60000 });
  if (!smoke.includes('omp/' + latest)) { log('SMOKE FAIL: ' + smokeTarget + ' --version = ' + smoke.trim()); process.exitCode = 1; return; }
  const help = execFileSync(smokeTarget, ['--help'], { encoding: 'utf8', timeout: 120000 });
  const cjk = (help.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cjk < 20) { log('SMOKE FAIL: --help CJK chars = ' + cjk); process.exitCode = 1; return; }
  if (!NO_DELIVER && !targetIsNew && !deferred) {
    log('SMOKE FAIL: delivery not confirmed - target old, no staged file. Check build-zh output.');
    process.exitCode = 1; return;
  }
  log('smoke OK: ' + (deferred ? 'DEFERRED (staged, watcher armed)' : NO_DELIVER ? 'work' : 'DELIVERED') + ' version=' + smoke.trim() + ' helpCJK=' + cjk);

  // ---- omp-watchdog 构建时检验(2026-09-11 起规范;部署形态 09-14 改为计划任务) ----
  // watchdog 是"模型出错静默中断"告警链的载体.部署形态演进:长驻进程(hub PTY 与 detached)
  // 三次被外部静默杀死(TerminateProcess 式,handler 无留痕)-> 现为 Windows 计划任务
  // omp-error-watchdog 每 5 分钟跑一次 --once:无长驻进程可被杀,机器重启自动恢复,
  // 冷却/去重状态存 watchdog-state.json.本检查每次构建后执行,失败不阻断交付
  // (旁路告警链,不影响 omp 功能),但显式 WARN 提醒人工修复:
  //   1) --once 跑通(扫描逻辑健康)
  //   2) 心跳新鲜(计划任务在按期执行;判据与语言无关,不解析 schtasks 本地化输出)
  try {
    sh('node', ['G:/omp works/Tools/omp-watchdog/watchdog.js', '--once']);
    const hbPath = 'G:/omp works/Tools/omp-watchdog/watchdog-heartbeat.log';
    let hbAgeMin = null;
    try {
      const lines = fs.readFileSync(hbPath, 'utf8').trim().split('\n');
      const last = lines[lines.length - 1] || '';
      const ts = Date.parse(last.split(' ')[0]);
      if (!Number.isNaN(ts)) hbAgeMin = (Date.now() - ts) / 60000;
    } catch {}
    if (hbAgeMin === null) {
      log('WARN: watchdog heartbeat unreadable (' + hbPath + ') - check scheduled task omp-error-watchdog');
    } else if (hbAgeMin > 15) {
      log('WARN: watchdog heartbeat stale (' + hbAgeMin.toFixed(1) + 'min > 15min) - scheduled task omp-error-watchdog not running? schtasks /query /tn omp-error-watchdog /v /fo list');
    } else {
      log('watchdog check OK: --once pass, heartbeat fresh (' + hbAgeMin.toFixed(1) + 'min)');
    }
  } catch (e) {
    log('WARN: omp-watchdog --once FAILED (' + e.message + ') - watchdog broken, fix before next build');
  }

  // 环比判定(在 smoke 得到 cjk 之后)
  if (prevCov) {
    if (cjk < prevCov.helpCJK) log('WARN: helpCJK 环比下降 ' + prevCov.helpCJK + ' -> ' + cjk + '(补译债未还或上游文案失配,须记 DEVLOG)');
    if (untranslated >= 0 && prevCov.gap >= 0 && untranslated > prevCov.gap) log('WARN: gap 环比上升 ' + prevCov.gap + ' -> ' + untranslated + '(上游新增文本待补译,须记 DEVLOG)');
  }
  covHist.push({ version: latest, helpCJK: cjk, gap: untranslated, at: new Date().toISOString() });
  fs.writeFileSync(covFile, JSON.stringify(covHist, null, 2));

  fs.writeFileSync(LAST_VER_FILE, latest);
  log('done. version ' + latest + ' processed');
  if (NO_DELIVER) log('(no-deliver mode: G:/omp/omp-zh.exe NOT replaced)');
}

main().catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; });
