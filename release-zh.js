// release-zh.js — 一条命令完成发版：校验 -> 打 tag -> 建 Release -> 上传资产 -> 同步版本号
// 用法: node release-zh.js <version>           例: node release-zh.js 18.12.3
//       node release-zh.js <version> --dry-run  只打印将要执行的动作
//
// 设计原则：版本号只有一个真相来源 = 构建产物自报的 `omp/<version>`。
// README 不写死版本号（指向 /releases/latest），package.json 由本脚本同步，
// 避免"每次发版都要记得手改一处"的失效模式。
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const T = __dirname;
const args = process.argv.slice(2);
const version = (args.find((a) => /^\d+\.\d+\.\d+$/.test(a)) || '').trim();
const DRY = args.includes('--dry-run');
const PROXY = process.env.OMP_NO_PROXY ? '' : (process.env.OMP_PROXY || 'http://127.0.0.1:7897');
const gitProxy = PROXY ? ['-c', 'http.proxy=' + PROXY, '-c', 'https.proxy=' + PROXY] : [];

if (!version) {
  console.error('用法: node release-zh.js <version> [--dry-run]');
  process.exit(2);
}

const EXE = path.join(T, 'work', `omp-zh-${version.replace(/\./g, '')}.exe`);
const TAG = `v${version}-zh`;

function sh(cmd, argv, opts = {}) {
  return execFileSync(cmd, argv, { encoding: 'utf8', cwd: T, timeout: opts.timeout || 600000, ...opts });
}
function log(m) { console.log((DRY ? '[dry] ' : '') + m); }

// ---- 1. 前置校验 ----
if (!fs.existsSync(EXE)) {
  console.error(`FAIL: 构建产物不存在: ${EXE}\n先运行: node tools-build-${version.replace(/\./g, '')}.js`);
  process.exit(1);
}
const sha = crypto.createHash('sha256').update(fs.readFileSync(EXE)).digest('hex');
let reported;
try {
  reported = sh(EXE, ['--version']).trim();
} catch (e) {
  console.error('FAIL: 产物无法执行 --version: ' + e.message);
  process.exit(1);
}
if (reported !== `omp/${version}`) {
  console.error(`FAIL: 产物自报 ${reported}，与请求的 ${version} 不符`);
  process.exit(1);
}
log(`产物校验通过: ${path.basename(EXE)} sha256=${sha.slice(0, 16)}.. 自报=${reported}`);

// 比较上下文硬门（构建脚本已跑，这里复核产物中是否存在已知污染形态）
{
  const dirty = sh('node', [path.join(T, 'tools-verify-' + version.replace(/\./g, '') + '.js')]);
  if (!/ALL \d+ VERIFICATIONS PASS/.test(dirty)) {
    console.error('FAIL: 验证套件未全绿:\n' + dirty);
    process.exit(1);
  }
  log('验证套件全绿');
}

// ---- 2. 工作区必须干净（tag 要指向已提交的树） ----
const status = sh('git', ['status', '--porcelain']).trim();
if (status && !DRY) {
  console.error('FAIL: 工作区有未提交改动，先 commit 再发版:\n' + status);
  process.exit(1);
}
if (status) log('(dry) 工作区有未提交改动，真实发版会拒绝');

// ---- 3. 同步 package.json 版本 ----
const pkgPath = path.join(T, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.version !== version) {
  log(`package.json: ${pkg.version} -> ${version}`);
  if (!DRY) {
    pkg.version = version;
    pkg.scripts.build = `node tools-build-${version.replace(/\./g, '')}.js`;
    pkg.scripts.verify = `node tools-verify-${version.replace(/\./g, '')}.js`;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    sh('git', ['add', 'package.json']);
    sh('git', ['commit', '-m', `chore: sync package.json to ${version}`]);
    log('package.json 已同步并提交');
  }
} else {
  log('package.json 版本已是最新');
}

// ---- 4. 生成校验和（裸文件名，sha256sum -c 可用） ----
const sumsPath = path.join(T, 'work', 'SHA256SUMS.txt');
const sumsBody = `${sha}  ${path.basename(EXE)}\n`;
if (!DRY) fs.writeFileSync(sumsPath, sumsBody);
log('SHA256SUMS.txt: ' + sumsBody.trim());

// ---- 5. tag 指向当前 HEAD ----
const head = sh('git', ['rev-parse', 'HEAD']).trim();
const tagExists = (() => {
  try { return sh('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${TAG}`]).trim(); } catch { return null; }
})();
if (tagExists === head) {
  log(`tag ${TAG} 已指向 HEAD (${head.slice(0, 8)})`);
} else {
  log(`tag ${TAG}: ${tagExists ? tagExists.slice(0, 8) + ' -> ' : ''}${head.slice(0, 8)}`);
  if (!DRY) {
    if (tagExists) sh('git', ['tag', '-f', TAG, head]);
    else sh('git', ['tag', TAG, head]);
    sh('git', ['push', ...gitProxy, '--force', 'origin', `refs/tags/${TAG}`]);
    log('tag 已推送');
  }
}

// ---- 6. 建/更新 Release 并上传资产 ----
const notes = [
  `中文汉化版 omp v${version}`,
  '',
  `- 对应上游 can1357/oh-my-pi v${version}`,
  `- 产物 sha256: ${sha}`,
  '',
  '校验: `sha256sum -c SHA256SUMS.txt`',
].join('\n');

if (!DRY) {
  let exists = false;
  try { sh('gh', ['release', 'view', TAG, '--json', 'tagName']); exists = true; } catch { exists = false; }
  if (exists) {
    sh('gh', ['release', 'upload', TAG, EXE, sumsPath, '--clobber']);
    log(`Release ${TAG} 资产已更新`);
  } else {
    sh('gh', ['release', 'create', TAG, '--title', `omp-zh v${version}`, '--notes', notes, EXE, sumsPath]);
    log(`Release ${TAG} 已创建`);
  }
} else {
  log(`(dry) 将创建/更新 Release ${TAG} 并上传 ${path.basename(EXE)} + SHA256SUMS.txt`);
}

// ---- 7. 推送提交 ----
if (!DRY) {
  try {
    sh('git', ['push', ...gitProxy, 'origin', 'HEAD']);
    log('提交已推送');
  } catch (e) {
    console.error('WARN: push 失败（提交已在本地）: ' + String(e.message).slice(0, 200));
  }
}

console.log(`\n完成: ${TAG}  sha256=${sha}`);
