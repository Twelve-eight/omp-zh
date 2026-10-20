// tools-verify-18123.js — omp-zh 18.12.3 验证套件
const fs = require('fs');
const { execSync } = require('child_process');
const { parseExe, readModules } = require('./rebuild.js');

const EXE = './work/omp-zh-18123.exe';
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
  ['module count is 3438', mods.length === 3438],
  ['modLen matches 3438 * 52', modLen === 3438 * 52],
  ['argvStart points to omp/18.12.3', (() => {
    const argvOff = buf.readUInt32LE(O + 20), argvLen = buf.readUInt32LE(O + 24);
    return buf.slice(ds + argvOff, ds + argvOff + argvLen).toString('latin1') === '--user-agent=omp/18.12.3';
  })()],
  ['patch compat: mod 28 supportsForcedToolChoice false', txt(28).includes('supportsForcedToolChoice: false,')],
  ['patch stopcap: mod 333 retry cluster raised', (() => {
    const s = txt(333);
    return s.includes('var oe = 1000000;') && s.includes('var ae = 1000000;') && s.includes('var le = 1000000;') && s.includes('var ce = 1000000;');
  })()],
  ['patch sessionStop: mod 788 FD raised', txt(788).includes('var FD = 1000000;')],
  ['patch yieldLadder: mod 788 fh raised', txt(788).includes('var fh = 1000000;')],
  ['patch tunnel: mod 75 windowsHide', txt(75).includes('cwd: c3(), windowsHide: true')],
  ['patch ssh: mod 75 windowsHide', txt(75).includes('cwd: Se.homedir(), windowsHide: true')],
  ['patch uploader: mod 75 windowsHide', txt(75).includes('cwd: c3(),\n          windowsHide: true')],
  ['patch chrome: mod 362 windowsHide', txt(362).includes('stdin: "ignore",\n      windowsHide: true')],
  ['patch pythonKernel: mod 63 returns true', txt(63).includes('return true;\n}')],
  ['patch pythonKernelCall: mod 370 -> true', txt(370).includes('windowsHide: true')],
  ['patch pythonKernelCall: mod 809 -> true', txt(809).includes('windowsHide: true')],
  ['patch encstale: mod 25 de extended', txt(25).includes('encrypted content')],
  ['patch flush: mod 167 gate removed', !txt(167).includes('this.#t.size === 0 && this.#e.size === 0')],
  ['translation: help has CJK >= 2000', (() => {
    const r = execSync('work\\\\omp-zh-18123.exe --help', { encoding: 'utf8', timeout: 60000 });
    return (r.match(/[\u4e00-\u9fff]/g) || []).length >= 2000;
  })()],
  ['translation: subcommands translated', (() => {
    const s = txt(3);
    return s.includes('语义搜索') && s.includes('交互式全屏 git 界面');
  })()],
  ['no corruption: removed-suffix artifacts', (() => {
    const s = txt(167);
    return !s.includes('移除d') && !/value: "移除"/.test(s);
  })()],
  ['runtime smoke: --version is omp/18.12.3', (() => {
    const r = execSync('work\\\\omp-zh-18123.exe --version', { encoding: 'utf8', timeout: 30000 });
    return r.trim() === 'omp/18.12.3';
  })()]
];

let fail = 0;
checks.forEach(([name, pass]) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name);
  if (!pass) fail++;
});
console.log(fail === 0 ? 'ALL ' + checks.length + ' VERIFICATIONS PASS' : 'FAILURES: ' + fail);
if (fail > 0) process.exit(1);
