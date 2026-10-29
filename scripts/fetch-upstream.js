// Download and verify the official Windows build of omp.
//
//   node scripts/fetch-upstream.js [<version>|latest]      download to work/omp-dl-<tag>.exe
//   node scripts/fetch-upstream.js --check [--exe <path>]  compare a local exe with the latest release
//
// Trust: the expected sha256 comes only from the official release, never from a mirror. Sources,
// in order: OMP_TRUST_DIGEST=<64 hex> (verified by you out of band), the release's
// SHA256SUMS.txt asset, the GitHub Releases API `assets[].digest` field. If none is available
// the script fails without writing an exe.
//
// Network: curl honours HTTPS_PROXY / ALL_PROXY. OMP_ZH_MIRRORS=<prefix>[,<prefix>...] lists
// download mirrors that are tried before github.com (each prefix is prepended to the official
// URL, e.g. https://example-mirror/). Mirrors only carry bytes; the digest check still applies.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const REPO = 'can1357/oh-my-pi';
const ASSET = 'omp-windows-x64.exe';
const WORK = path.join(__dirname, '..', 'work');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const log = (m) => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + m);
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function run(cmd, argv, timeout = 300000) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}: ${(r.stderr || '').trim().slice(-300)}`);
  return r.stdout;
}

// GitHub API through gh when available (authenticated, higher rate limit), else curl.
function api(p) {
  try { return JSON.parse(run('gh', ['api', p], 60000)); } catch { /* fall back */ }
  return JSON.parse(run('curl', ['-fsSL', '--max-time', '60', '-H', 'Accept: application/vnd.github+json', `https://api.github.com/${p}`], 90000));
}

const latestVersion = () => String(api(`repos/${REPO}/releases/latest`).tag_name).replace(/^v/, '');

function trustedDigest(version) {
  const op = (process.env.OMP_TRUST_DIGEST || '').trim().toLowerCase();
  if (op) {
    if (!/^[0-9a-f]{64}$/.test(op)) throw new Error('OMP_TRUST_DIGEST must be a 64-character hex sha256');
    return { hex: op, source: 'operator' };
  }
  try {
    const sums = run('curl', ['-fsSL', '--max-time', '60', `https://github.com/${REPO}/releases/download/v${version}/SHA256SUMS.txt`], 90000);
    const line = sums.split('\n').find((l) => l.trim().endsWith(ASSET));
    if (line) return { hex: line.trim().split(/\s+/)[0].toLowerCase(), source: 'official SHA256SUMS.txt' };
  } catch { /* upstream stopped publishing SHA256SUMS.txt in v18.2.1 */ }
  try {
    const rel = api(`repos/${REPO}/releases/tags/v${version}`);
    const a = (rel.assets || []).find((x) => x.name === ASSET);
    const hex = a && String(a.digest || '').replace(/^sha256:/i, '').toLowerCase();
    if (hex && /^[0-9a-f]{64}$/.test(hex)) return { hex, source: 'GitHub Releases API digest' };
  } catch { /* fall through */ }
  throw new Error(`no official digest available for v${version}. Verify the release digest yourself and re-run with OMP_TRUST_DIGEST=<64 hex>.`);
}

function fetch(version) {
  const tag = version.replace(/\./g, '');
  const dst = path.join(WORK, `omp-dl-${tag}.exe`);
  fs.mkdirSync(WORK, { recursive: true });
  const { hex, source } = trustedDigest(version);
  log(`expected sha256 ${hex.slice(0, 16)}.. (${source})`);
  if (fs.existsSync(dst) && sha256(dst) === hex) { log(`already present: ${path.relative(process.cwd(), dst)}`); return dst; }

  const url = `https://github.com/${REPO}/releases/download/v${version}/${ASSET}`;
  const mirrors = (process.env.OMP_ZH_MIRRORS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const tmp = dst + '.part';
  for (const prefix of [...mirrors, '']) {
    fs.rmSync(tmp, { force: true });
    log('downloading via ' + (prefix || 'github.com'));
    try {
      run('curl', ['-fL', '--retry', '2', '--connect-timeout', '30', '-o', tmp, prefix + url], 1800000);
    } catch (e) { log('  failed: ' + e.message); continue; }
    const got = sha256(tmp);
    if (got === hex) {
      fs.renameSync(tmp, dst);
      log(`sha256 OK -> ${path.relative(process.cwd(), dst)}`);
      return dst;
    }
    log(`  sha256 mismatch (${got.slice(0, 16)}..), discarded`);
  }
  fs.rmSync(tmp, { force: true });
  throw new Error('download failed from every source');
}

try {
  if (args.includes('--check')) {
    const latest = latestVersion();
    const exe = opt('exe');
    let local = null;
    if (exe) {
      const m = execFileSync(exe, ['--version'], { encoding: 'utf8', timeout: 60000, windowsHide: true }).match(/omp\/([\d.]+)/);
      local = m ? m[1] : null;
    }
    console.log(`latest upstream: ${latest}` + (exe ? `\nlocal ${exe}: ${local || 'unknown'}` : ''));
    if (exe) console.log(local === latest ? 'up to date' : 'update available');
  } else {
    const want = args.find((a) => !a.startsWith('--')) || 'latest';
    const version = want === 'latest' ? latestVersion() : want.replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('version must look like 18.13.3');
    fetch(version);
  }
} catch (e) {
  console.error('FAILED: ' + e.message);
  process.exit(1);
}
