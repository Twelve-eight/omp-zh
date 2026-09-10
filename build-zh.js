// OMP 汉化构建脚本:合并字典 -> 翻译 cli.js -> 重建 exe -> 交付
// 用法: node build-zh.js [--src <omp.exe>] [--cli <cli.js>] [--dst <out.exe>] [--deliver <path>]
//       不传 --deliver(且无 OMP_DELIVER)则只构建不交付.
// 环境变量等价: OMP_SRC / OMP_CLI / OMP_DST / OMP_DELIVER(命令行参数优先)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { translate } = require('./translate.js');
const { rebuild } = require('./rebuild.js');

const T = __dirname;

// ---- 参数解析（argv > env > 默认） ----
function arg(name, envName, def) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env[envName] || def;
}
const SRC = arg('src', 'OMP_SRC', 'G:/omp/omp.exe');
const CLI = arg('cli', 'OMP_CLI', T + '/work/cli.js');
const DST = arg('dst', 'OMP_DST', T + '/work/omp-zh.exe');
const DELIVER = arg('deliver', 'OMP_DELIVER', ''); // 空 = 不交付(--no-deliver 语义;默认必须显式 --deliver

// ---- 字典合并（保持原有相对顺序：help → help-extra → inline → tui → settings-a/b → tools → slash → plan） ----
// 17.4.0 起追加 work/out-*.json 补译 staging（存在则并入）
const dictFiles = [
  'dict-help.json', 'dict-help-extra.json', 'dict-inline.json', 'dict-tui.json',
  'dict-settings-a.json', 'dict-settings-b.json', 'dict-tools.json', 'dict-slash.json', 'dict-plan.json',
];
for (const f of fs.readdirSync(T + '/work').filter((x) => /^out-.+\.json$/.test(x)).sort()) {
  dictFiles.push('work/' + f);
}
const dict = dictFiles.map((f) => JSON.parse(fs.readFileSync(T + '/' + f, 'utf8'))).flat();

const seen = new Map();
for (const e of dict) { const k = e.from + '|' + e.mode; if (!seen.has(k)) seen.set(k, e); }
const dedup = [...seen.values()];

const cli = fs.readFileSync(CLI, 'utf8');
const { code, count } = translate(cli, dedup);
// 【18.0.0 修复】Bun 1.4.0 standalone loader 把模块源码按 latin1 解码，非 ASCII 字面量全部 mojibake。
// 预补偿：把所有非 ASCII 字符转成 \uXXXX 转义（纯 ASCII 源码在任何解码下语义不变）。
function asciiEscape(s) {
  return s.replace(/[^\x00-\x7F]+/g, (m) => {
    let out = '';
    for (const ch of m) {
      const cp = ch.codePointAt(0);
      if (cp > 0xFFFF) {
        const h = Math.floor((cp - 0x10000) / 0x400) + 0xD800;
        const l = ((cp - 0x10000) % 0x400) + 0xDC00;
        out += '\\u' + h.toString(16).padStart(4, '0') + '\\u' + l.toString(16).padStart(4, '0');
      } else {
        out += '\\u' + cp.toString(16).padStart(4, '0');
      }
    }
    return out;
  });
}
const ascii = asciiEscape(code);
fs.writeFileSync(T + '/work/cli-zh.js', ascii);
console.log('translated literals:', count, '(ascii-escaped for Bun 1.4.0 standalone)');

const srcBuf = fs.readFileSync(SRC);
// ---- Web UI 模块汉化（索引由 extract-cli.js 动态发现，18.1.11 起模块表爆炸后不再固定 3/4/5） ----
const { translateWeb } = require('./web-translate.js');
const web = translateWeb(dedup);
console.log('web translated: html=' + web.htmlCount + ' js=' + web.jsCount);
const webIdx = JSON.parse(fs.readFileSync(T + '/work/web-mod-indices.json', 'utf8'));
console.log('web module indices: ' + JSON.stringify(webIdx));
// Bun 1.4.x standalone 把所有模块源码按 latin1 解码，非 ASCII 必须预编码：
//   JS 语义模块（cli/template.js/tool-views）用 \uXXXX 转义；纯 HTML 模块用 &#xXXXX; 数字字符引用（浏览器原生解码）。
function htmlEscapeNonAscii(s) {
  return s.replace(/[^\x00-\x7F]+/g, (m) => {
    let out = '';
    for (const ch of m) out += '&#x' + ch.codePointAt(0).toString(16) + ';';
    return out;
  });
}
const newContents = [];
newContents[0] = Buffer.from(ascii);
// slots: html(导出页 HTML)/js(主题 JS)/views(工具视图) - 动态索引
newContents[webIdx.html] = Buffer.from(htmlEscapeNonAscii(web.mods.html.toString('utf8')));
newContents[webIdx.js] = Buffer.from(asciiEscape(web.mods.js.toString('utf8')));
newContents[webIdx.views] = Buffer.from(asciiEscape(web.mods.views.toString('utf8')));

// ---- 模块串区总长补偿（Bun 1.4.2 standalone 加载器 bug 规避，2026-09-07 发现） ----
// 实测：mod0(cli) 增长后再增长其他模块，模块串区总长超过原值 -> Bun 启动段错误。
// 净增长为零（如 css -800 平衡 html +751）则正常。规避：若串区总长超原值，
// 从 CHANGELOG 模块（纯 markdown、非关键）尾部裁掉等量字节补齐。
{
  const { parseExe, readModules } = require('./rebuild.js');
  const { bun } = parseExe(srcBuf);
  const dataStart = bun.rawPtr + 8;
  const hdr = Number(BigInt(srcBuf.readUInt32LE(bun.rawPtr)) | (BigInt(srcBuf.readUInt32LE(bun.rawPtr + 4)) << 32n));
  const O = dataStart + hdr - 16 - 32;
  const mods = readModules(srcBuf, dataStart, srcBuf.readUInt32LE(O + 8), srcBuf.readUInt32LE(O + 12));
  const origBlobLen = mods.reduce((a, m) => a + m.name.length + m.contents.length, 0); // name(含NUL)+contents(含NUL)
  let newBlobLen = 0;
  mods.forEach((m, i) => {
    const c = newContents[i] !== undefined ? newContents[i].length : m.contents.length - 1;
    newBlobLen += m.name.length + c + 1;
  });
  const delta = newBlobLen - origBlobLen;
  console.log('strings blob: orig=' + origBlobLen + ' new=' + newBlobLen + ' delta=' + (delta > 0 ? '+' : '') + delta);
  if (delta > 0) {
    let ci = -1;
    mods.forEach((m, i) => { if (m.name.toString('latin1').includes('CHANGELOG')) ci = i; });
    if (ci < 0) throw new Error('blob compensation needed (+' + delta + ') but no CHANGELOG module found');
    const full = mods[ci].contents.slice(0, mods[ci].contents.length - 1);
    const trimmed = full.slice(0, Math.max(0, full.length - delta));
    newContents[ci] = trimmed;
    console.log('compensated: CHANGELOG module trimmed by ' + (full.length - trimmed.length) + ' bytes');
  }
}

const out = rebuild(srcBuf, newContents);
fs.writeFileSync(DST, out);

// ---- 交付(占用规避 + 完成核验 + 锁死时延迟补交付;失败使脚本以非零码退出) ----
// 2026-09-09 前教训:copy 失败仅 console.log,update-zh.js 无感知,EBUSY 延迟交付
// 完全依赖人工记得补跑(08-22 坏版本滞留,09-06/07 两轮无人核验).现三层:
//   1) rename(<new> -> target) 覆盖交付(避开"直接写目标"的锁);失败重试等待;
//   2) 目标被运行中 exe 映像锁死(EPERM/EBUSY 且 rename/copyFile 均不可用)时,
//      拉起 detached deliver-pending.js 看护:锁释放(占用会话退出)后自动补交付
//      并核验版本(AGENTS.md Sec 11:编译照常,部署延迟到进程退出后自动补做);
//   3) 成功交付后回读目标 --version 与 work 产物核验,不符 -> exit 1.
// 注意:场景 2 不算失败--已staged且看护在位,build 以 0 退出,主控继续 verify/smoke
// (smoke 测 work 产物),日志明示"交付延迟,看护中".
if (DELIVER) {
  const deliveredVersion = (p) => {
    const r = spawnSync(p, ['--version'], { encoding: 'utf8', timeout: 30000 });
    return r.status === 0 && r.stdout ? (r.stdout.match(/omp\/([\d.]+)/) || [])[1] || null : null;
  };
  const wantVer = deliveredVersion(DST);
  if (!wantVer) {
    console.log('deliver FAILED: cannot get version from work product ' + DST);
    process.exitCode = 1;
  } else {
    const tmp = DELIVER + '.new';
    fs.rmSync(tmp, { force: true });
    try {
      fs.copyFileSync(DST, tmp);
      let done = false;
      for (let i = 0; i < 10 && !done; i++) {
        try { fs.renameSync(tmp, DELIVER); done = true; }
        catch (e) {
          spawnSync('node', ['-e', 'setTimeout(()=>{},3000)']); // 等待 3s 再试
        }
      }
      if (!done) {
        // 目标被运行中的 exe 映像锁定(rename 与 copyFile 均不可用,2026-09-09 实测)
        // -> 拉起 detached 看护,占用会话退出后自动补交付 + 核验.此路径非失败:
        // staged 文件在位,看护进程常驻,交付只是延迟.
        const { spawn } = require('child_process');
        const child = spawn(process.execPath, [T + '/deliver-pending.js', tmp, DELIVER], {
          detached: true, stdio: 'ignore', windowsHide: true,
        });
        child.unref();
        console.log('deliver DEFERRED: ' + DELIVER + ' locked by a running session.');
        console.log('staged: ' + tmp + ' - watcher pid ' + child.pid + ' will deliver on release (logs: work/.deliver-pending.log)');
      } else {
        fs.rmSync(tmp, { force: true });
        const gotVer = deliveredVersion(DELIVER);
        if (gotVer !== wantVer) {
          throw new Error('delivery verification failed: work=' + wantVer + ' delivered=' + gotVer);
        }
        console.log('delivered:', DELIVER, '(verified omp/' + gotVer + ')');
      }
    } catch (e) {
      console.log('deliver FAILED:', e.message);
      console.log('=> G:/omp/omp-zh.exe NOT updated; re-run after the running session exits.');
      process.exitCode = 1;
    }
  }
}
