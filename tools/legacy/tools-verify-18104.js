const fs = require('fs');
const { spawnSync } = require('child_process');
const { parseExe, readModules } = require('./rebuild.js');

const EXE = './work/omp-zh-18104.exe';
const buf = fs.readFileSync(EXE);
const { bun } = parseExe(buf);
const ds = bun.rawPtr + 8;
const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = ds + hdr - 16 - 32;
const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
const mods = readModules(buf, ds, modOff, modLen);

const checks = [
  // 1. 基本布局与模块数
  ['module count is 2917', mods.length === 2917],
  ['modLen matches 2917 * 52', modLen === 2917 * 52],
  ['argvStart correctly points to valid --user-agent', (() => {
    const argvOff = buf.readUInt32LE(O + 20), argvLen = buf.readUInt32LE(O + 24);
    const s = buf.slice(ds + argvOff, ds + argvOff + argvLen).toString('latin1');
    return s === '--user-agent=omp/18.10.4';
  })()],
  // 2. 补丁 1: compat (mod 40)
  ['patch 1: compat supportsForcedToolChoice is false', (() => {
    const s = mods[40].contents.toString('utf8');
    return s.includes('supportsForcedToolChoice: false,') && !s.includes('!(t.isClinePass && W)');
  })()],
  // 3. 补丁 2: leaks (mod 34, 323, 17)
  ['patch 2: blob-broker tunnel has windowsHide (mod 34)', (() => {
    const s = mods[34].contents.toString('utf8');
    return s.includes('cwd: CU(), windowsHide: true });');
  })()],
  ['patch 2: blob-broker ssh has windowsHide (mod 34)', (() => {
    const s = mods[34].contents.toString('utf8');
    return s.includes('cwd: Se.homedir(), windowsHide: true });');
  })()],
  ['patch 2: uploader self-hosted has windowsHide (mod 34)', (() => {
    const s = mods[34].contents.toString('utf8');
    return s.includes('cwd: CU(),\n          windowsHide: true\n        });');
  })()],
  ['patch 2: browser chrome launch has windowsHide (mod 323)', (() => {
    const s = mods[323].contents.toString('utf8');
    return s.includes('stdin: "ignore",\n      windowsHide: true\n    });');
  })()],
  ['patch 2: python kernel probe force-true (mod 17)', (() => {
    const s = mods[17].contents.toString('utf8');
    return s.includes('function j7(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}');
  })()],
  // 4. 补丁 3: stopcap (mod 597, 686)
  ['patch 3: unexpected stop retries raised to 1000000 (mod 597)', (() => {
    const s = mods[597].contents.toString('utf8');
    return s.includes('var X = 1000000;') && s.includes('var J = 1000000;') && s.includes('var z = 1000000;') && s.includes('var Y = 1000000;');
  })()],
  ['patch 3: session-stop continuation cap raised to 1000000 (mod 686)', (() => {
    const s = mods[686].contents.toString('utf8');
    return s.includes('var l1 = 1000000;');
  })()],
  ['patch 3: subagent yield ladder raised to 1000000 (mod 686)', (() => {
    const s = mods[686].contents.toString('utf8');
    return s.includes('var fy = 1000000;');
  })()],
  // 5. 补丁 4: replay flush (mod 173)
  ['patch 4: transcript builder flush gate eliminated (mod 173)', (() => {
    const s = mods[173].contents.toString('utf8');
    return !s.includes('if (this.#t.size === 0 && this.#e.size === 0)\n      this.#w();') && (s.match(/this\.#T\(p\);\n    this\.#w\(\);/g) || []).length === 2;
  })()],
  // 6. 补丁 5: encstale (mod 38)
  ['patch 5: encstale ce regex extended (mod 38)', (() => {
    const s = mods[38].contents.toString('utf8');
    return s.includes('encrypted content') && s.includes('could not be (?:verified|decrypted|parsed)');
  })()],
  ['patch 5: encstale _t regex extended (mod 38)', (() => {
    const s = mods[38].contents.toString('utf8');
    return s.includes('encrypted content could not be decrypted');
  })()],
  // 7. 汉化验证
  ['translation: mod 750 has models help translation', (() => {
    const s = mods[750].contents.toString('utf8');
    return s.includes('\\u7528\\u4e8e\\u5faa\\u73af\\u5207\\u6362\\u7684\\u6a21\\u578b\\u6a21\\u5f0f');
  })()],
  ['runtime smoke: --version matches omp/18.10.4', (() => {
    const r = spawnSync(EXE, ['--version'], { encoding: 'utf8', timeout: 30000 });
    return (r.stdout || '').trim() === 'omp/18.10.4';
  })()],
  ['runtime smoke: --help CJK >= 1650', (() => {
    const r = spawnSync(EXE, ['--help'], { encoding: 'utf8', timeout: 30000 });
    const cjk = ((r.stdout || '').match(/[\u4e00-\u9fff]/g) || []).length;
    return cjk >= 1650;
  })()]
];

let fail = 0;
checks.forEach(([name, pass]) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name);
  if (!pass) fail++;
});
console.log(fail === 0 ? 'ALL ' + checks.length + ' VERIFICATIONS PASS' : 'FAILURES: ' + fail);
if (fail > 0) process.exit(1);
