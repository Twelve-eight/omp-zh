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
const DL_EXE = T + '/work/omp-dl.exe';
const DL_SUMS = T + '/work/SHA256SUMS.txt';
const LOCAL_EXE = 'G:/omp/omp-zh.exe'; // 检测汉化版自身版本（原读官方版 omp.exe 导致检测与实际使用脱节）
const DELIVER = 'G:/omp/omp-zh.exe';
const LAST_VER_FILE = T + '/work/.omp-zh-last-version';

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

// ---- 2. 最新 release tag ----
function latestTag() {
  const out = sh('gh', ['api', `repos/${REPO}/releases/latest`, '--jq', '.tag_name']);
  return out.trim().replace(/^v/, '');
}

// ---- 3. 下载 + 校验（支持复用本地已下载文件） ----
function download(tag) {
  const url = `https://github.com/${REPO}/releases/download/v${tag}/${ASSET}`;
  const sumsUrl = `https://github.com/${REPO}/releases/download/v${tag}/SHA256SUMS.txt`;
  const sumsTagFile = `${DL_SUMS}.${tag}`; // 每版本独立缓存，防止旧版 SUMS 误校验新版文件
  const haveSums = () => { if (fs.existsSync(sumsTagFile)) return sumsTagFile; if (fs.existsSync(DL_SUMS)) return DL_SUMS; return null; };
  const fetchSums = () => { sh('curl', ['-fL', '--connect-timeout', '30', '-o', sumsTagFile, sumsUrl], { timeout: 120000 }); return sumsTagFile; };
  // 本地已有文件：先尝试只用校验文件验证（无校验文件则下载）
  if (fs.existsSync(DL_EXE)) {
    try {
      const sumsPath = haveSums() || fetchSums();
      const sums = fs.readFileSync(sumsPath, 'utf8');
      const line = sums.split('\n').find(l => l.includes(ASSET));
      if (line) {
        const expected = line.trim().split(/\s+/)[0].toLowerCase();
        const actual = crypto.createHash('sha256').update(fs.readFileSync(DL_EXE)).digest('hex');
        if (expected === actual) {
          log('reusing pre-downloaded ' + ASSET + ' (sha256 OK: ' + actual.slice(0, 16) + '…)');
          return DL_EXE;
        }
        log('pre-downloaded file sha256 mismatch — re-downloading');
      }
    } catch (e) { log('local reuse check failed: ' + e.message + ' — downloading'); }
  }
  log('downloading ' + ASSET + ' v' + tag);
  sh('curl', ['-fL', '--connect-timeout', '30', '--retry', '3', '-C', '-', '-o', DL_EXE, url], { timeout: 1800000 });
  const sumsPath = haveSums() || fetchSums();
  const sums = fs.readFileSync(sumsPath, 'utf8');
  // 校验
  const line = sums.split('\n').find(l => l.includes(ASSET));
  if (!line) throw new Error('SHA256SUMS.txt missing entry for ' + ASSET);
  const expected = line.trim().split(/\s+/)[0].toLowerCase();
  const actual = crypto.createHash('sha256').update(fs.readFileSync(DL_EXE)).digest('hex');
  if (expected !== actual) throw new Error(`sha256 mismatch for ${ASSET}: expected ${expected}, got ${actual}`);
  log('sha256 OK: ' + actual.slice(0, 16) + '…');
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

  // 差异发现（新增英文文本）
  log('scanning translation gaps');
  const dicts = ['dict-help.json','dict-help-extra.json','dict-inline.json','dict-tui.json','dict-settings-a.json','dict-settings-b.json','dict-tools.json','dict-slash.json','dict-plan.json']
    .map(f => T + '/' + f);
  let gaps = '';
  try { gaps = sh('node', [T + '/scan-gaps.js', cliNew, ...dicts]); } catch (e) { gaps = 'scan-gaps failed: ' + e.message; }
  const gapMatch = gaps.match(/UNTRANSLATED_COUNT:\s*(\d+)/);
  const untranslated = gapMatch ? Number(gapMatch[1]) : -1;
  log('untranslated sentence-like literals: ' + (untranslated >= 0 ? untranslated : 'n/a'));
  fs.writeFileSync(T + '/work/gaps-' + latest + '.txt', gaps);

  // 构建汉化版（Temp 输出；交付按 flag）
  log('building zh exe');
  const buildArgs = ['--src', exePath, '--cli', cliNew, '--dst', T + '/work/omp-zh.exe'];
  if (!NO_DELIVER) buildArgs.push('--deliver', DELIVER);
  sh('node', [T + '/build-zh.js', ...buildArgs]);

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
  // 冒烟：--version 含新版本号，--help 含 CJK
  const smoke = execFileSync(T + '/work/omp-zh.exe', ['--version'], { encoding: 'utf8', timeout: 60000 });
  if (!smoke.includes('omp/' + latest)) { log('SMOKE FAIL: --version = ' + smoke.trim()); process.exitCode = 1; return; }
  const help = execFileSync(T + '/work/omp-zh.exe', ['--help'], { encoding: 'utf8', timeout: 120000 });
  const cjk = (help.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cjk < 20) { log('SMOKE FAIL: --help CJK chars = ' + cjk); process.exitCode = 1; return; }
  log('smoke OK: version=' + smoke.trim() + ' helpCJK=' + cjk);

  fs.writeFileSync(LAST_VER_FILE, latest);
  log('done. version ' + latest + ' processed');
  if (NO_DELIVER) log('(no-deliver mode: G:/omp/omp-zh.exe NOT replaced)');
}

main().catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; });
