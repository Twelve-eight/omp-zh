// tools-verify-18126.js — omp-zh 18.12.6 验证套件
const fs = require('fs');
const { execSync } = require('child_process');
const { parseExe, readModules } = require('./rebuild.js');

const EXE = './work/omp-zh-18126.exe';
const buf = fs.readFileSync(EXE);
const { bun } = parseExe(buf);
const ds = bun.rawPtr + 8;
const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = ds + hdr - 16 - 32;
const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
const mods = readModules(buf, ds, modOff, modLen);

const dec = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const txt = (i) => dec(mods[i].contents.toString('utf8'));

const checks = [
  ['module count is 3450', mods.length === 3450],
  ['modLen matches 3450 * 52', modLen === 3450 * 52],
  ['argvStart points to omp/18.12.6', (() => {
    const argvOff = buf.readUInt32LE(O + 20), argvLen = buf.readUInt32LE(O + 24);
    return buf.slice(ds + argvOff, ds + argvOff + argvLen).toString('latin1') === '--user-agent=omp/18.12.6';
  })()],
  ['patch compat: mod 30 supportsForcedToolChoice false', txt(30).includes('supportsForcedToolChoice: false,')],
  ['patch stopcap: mod 329 retry cluster raised', (() => {
    const s = txt(329);
    return s.includes('var oe = 1000000;') && s.includes('var ae = 1000000;') && s.includes('var le = 1000000;') && s.includes('var de = 1000000;');
  })()],
  ['patch sessionStop: mod 787 jD raised', txt(787).includes('var jD = 1000000;')],
  ['patch yieldLadder: mod 787 ph raised', txt(787).includes('var ph = 1000000;')],
  ['patch tunnel: mod 23 windowsHide', txt(23).includes('cwd: k3(), windowsHide: true')],
  ['patch ssh: mod 23 windowsHide', txt(23).includes('cwd: Se.homedir(), windowsHide: true')],
  ['patch uploader: mod 23 windowsHide', txt(23).includes('cwd: k3(),\n          windowsHide: true')],
  ['patch chrome: mod 358 windowsHide', txt(358).includes('stdin: "ignore",\n      windowsHide: true')],
  ['patch pythonKernel: mod 101 returns true', txt(101).includes('return true;\n}')],
  ['patch pythonKernelCall: mod 366 -> true', txt(366).includes('windowsHide: true')],
  ['patch pythonKernelCall: mod 809 -> true', txt(809).includes('windowsHide: true')],
  ['patch encstale: mod 28 de extended', txt(28).includes('encrypted content')],
  ['patch flush: mod 168 gate removed', !txt(168).includes('this.#t.size === 0 && this.#e.size === 0')],
  ['translation: help has CJK >= 2000', (() => {
    const r = execSync('work\\\\omp-zh-18126.exe --help', { encoding: 'utf8', timeout: 60000 });
    return (r.match(/[\u4e00-\u9fff]/g) || []).length >= 2000;
  })()],
  ['translation: subcommands translated', (() => {
    const s = txt(3);
    return s.includes('语义搜索') && s.includes('交互式全屏 git 界面');
  })()],
  ['no corruption: removed-suffix artifacts', (() => {
    const s = txt(168);
    return !s.includes('移除d') && !/value: "移除"/.test(s);
  })()],
  ['runtime smoke: --version is omp/18.12.6', (() => {
    const r = execSync('work\\\\omp-zh-18126.exe --version', { encoding: 'utf8', timeout: 30000 });
    return r.trim() === 'omp/18.12.6';
  })()]
  ,
  ['header keys stay ASCII (object-key gate)', (() => {
    const all = mods.map(m => m.contents.toString('utf8')).join('\n');
    // Object-key pollution: a quoted string holding a literal \uXXXX escape used as a
    // map key — delimited by { or , on the left, ':' on the right.
    const bad = all.match(/[{,]\s*["'][A-Za-z][A-Za-z -]*\\u[0-9a-fA-F]{4}[^"']*["']\s*:/g) || [];
    return bad.length === 0 && (all.match(/"Cache-Control"\s*:/g) || []).length === 16;
  })()]
];

let fail = 0;
checks.forEach(([name, pass]) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name);
  if (!pass) fail++;
});
console.log(fail === 0 ? 'ALL ' + checks.length + ' VERIFICATIONS PASS' : 'FAILURES: ' + fail);
if (fail > 0) process.exit(1);
