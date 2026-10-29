// Publish a verified build as a GitHub release.
//
//   node scripts/release.js <version> [--dry-run]
//
// Steps: the artifact work/omp-zh-<tag>.exe reports omp/<version> -> node verify.js <version>
// passes -> the working tree is clean -> package.json is synced -> SHA256SUMS.txt is written ->
// tag v<version>-zh points at HEAD -> the release is created or updated -> commits are pushed.
// The version comes from the artifact itself, so README and docs never hard-code it.
// Requires: git and an authenticated gh CLI with push access to the repository.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const version = (args.find((a) => /^\d+\.\d+\.\d+$/.test(a)) || '').trim();
const DRY = args.includes('--dry-run');
if (!version) { console.error('usage: node scripts/release.js <version> [--dry-run]'); process.exit(2); }

const tagNum = version.replace(/\./g, '');
const EXE = path.join(root, 'work', `omp-zh-${tagNum}.exe`);
const TAG = `v${version}-zh`;
const sh = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { encoding: 'utf8', cwd: root, timeout: 600000, windowsHide: true, ...opts });
const log = (m) => console.log((DRY ? '[dry-run] ' : '') + m);
const die = (m) => { console.error('FAIL: ' + m); process.exit(1); };

// 1. Artifact and verification.
if (!fs.existsSync(EXE)) die(`artifact not found: ${EXE}\nbuild it first: node build.js ${version}`);
const sha = crypto.createHash('sha256').update(fs.readFileSync(EXE)).digest('hex');
let reported;
try { reported = sh(EXE, ['--version']).trim(); } catch (e) { die('artifact cannot run --version: ' + e.message); }
if (reported !== `omp/${version}`) die(`artifact reports ${reported}, expected omp/${version}`);
log(`artifact OK: ${path.basename(EXE)} sha256=${sha.slice(0, 16)}.. reports ${reported}`);
try { sh(process.execPath, [path.join(root, 'verify.js'), version, '--exe', EXE]); } catch (e) { die('verification failed:\n' + (e.stdout || e.message)); }
log('verification passed');

// 2. The tag must point at committed sources.
const status = sh('git', ['status', '--porcelain']).trim();
if (status && !DRY) die('working tree has uncommitted changes; commit them first:\n' + status);

// 3. package.json version.
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.version !== version) {
  log(`package.json: ${pkg.version} -> ${version}`);
  if (!DRY) {
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    sh('git', ['add', 'package.json']);
    sh('git', ['commit', '-m', `chore: release ${version}`]);
  }
}

// 4. Checksums (bare file name, so `sha256sum -c` works next to the download).
const sumsPath = path.join(root, 'work', 'SHA256SUMS.txt');
const sums = `${sha}  ${path.basename(EXE)}\n`;
if (!DRY) fs.writeFileSync(sumsPath, sums);
log('SHA256SUMS.txt: ' + sums.trim());

// 5. Tag. Checked against the remote as well, so a run that died after tagging locally but
// before pushing still publishes the tag when re-run.
const head = sh('git', ['rev-parse', 'HEAD']).trim();
let tagged = null;
try { tagged = sh('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${TAG}^{commit}`]).trim(); } catch { /* new tag */ }
if (tagged !== head) {
  log(`tag ${TAG} -> ${head.slice(0, 8)}`);
  if (!DRY) sh('git', ['tag', '-f', TAG, head]);
}
const remoteTag = (sh('git', ['ls-remote', '--tags', 'origin', `refs/tags/${TAG}`]).trim().split(/\s+/)[0]) || null;
if (remoteTag !== head) {
  log(`push tag ${TAG} (remote: ${remoteTag ? remoteTag.slice(0, 8) : 'none'})`);
  if (!DRY) sh('git', ['push', '--force', 'origin', `refs/tags/${TAG}`]);
}

// 6. Release notes and assets.
const notes = [
  `omp-zh ${version}，对应上游 [can1357/oh-my-pi v${version}](https://github.com/can1357/oh-my-pi/releases/tag/v${version})。`,
  '',
  `- 下载 \`${path.basename(EXE)}\`，改名为 \`omp.exe\` 后放进 \`PATH\`，用法见[使用教程](https://github.com/Twelve-eight/omp-zh/tree/main/docs/guide)。`,
  '- 与官方版共用 `~/.omp` 下的配置、会话和技能，可以随时换回官方版。',
  `- 上游更新内容见 [上游发布说明](https://github.com/can1357/oh-my-pi/releases/tag/v${version})。`,
  '',
  '校验：',
  '',
  '```powershell',
  `Get-FileHash .\\${path.basename(EXE)} -Algorithm SHA256`,
  '```',
  '',
  `sha256: \`${sha}\``,
].join('\n');
if (DRY) {
  log(`would create/update release ${TAG} with ${path.basename(EXE)} and SHA256SUMS.txt`);
} else {
  let exists = false;
  try { sh('gh', ['release', 'view', TAG, '--json', 'tagName']); exists = true; } catch { /* new release */ }
  if (exists) {
    sh('gh', ['release', 'edit', TAG, '--notes', notes]);
    sh('gh', ['release', 'upload', TAG, EXE, sumsPath, '--clobber']);
    log(`release ${TAG} updated`);
  } else {
    sh('gh', ['release', 'create', TAG, '--title', `omp-zh ${version}`, '--notes', notes, EXE, sumsPath]);
    log(`release ${TAG} created`);
  }
  try { sh('git', ['push', 'origin', 'HEAD']); log('commits pushed'); } catch (e) { console.error('WARN: push failed (commits are local): ' + String(e.message).slice(0, 200)); }
}
console.log(`\ndone: ${TAG} sha256=${sha}`);
