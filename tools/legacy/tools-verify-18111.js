const fs = require('fs');
const { execSync } = require('child_process');
const { parseExe, readModules } = require('./rebuild.js');

const EXE = './work/omp-zh-18111.exe';
const buf = fs.readFileSync(EXE);
const { bun } = parseExe(buf);
const ds = bun.rawPtr + 8;
const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = ds + hdr - 16 - 32;
const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
const mods = readModules(buf, ds, modOff, modLen);

const checks = [
  ['module count is 3389', mods.length === 3389],
  ['modLen matches 3389 * 52', modLen === 3389 * 52],
  ['argvStart correctly points to valid --user-agent', (() => {
    const argvOff = buf.readUInt32LE(O + 20), argvLen = buf.readUInt32LE(O + 24);
    const s = buf.slice(ds + argvOff, ds + argvOff + argvLen).toString('latin1');
    return s === '--user-agent=omp/18.11.1';
  })()],
  ['patch compat: mod 29 supportsForcedToolChoice is false', (() => {
    const s = mods[29].contents.toString('utf8');
    return s.includes('supportsForcedToolChoice: false,');
  })()],
  ['patch stopcap: mod 640 has 1000000 constants', (() => {
    const s = mods[640].contents.toString('utf8');
    return s.includes('var X = 1000000;') && s.includes('var J = 1000000;');
  })()],
  ['patch sessionStop: mod 777 BD raised', (() => {
    const s = mods[777].contents.toString('utf8');
    return s.includes('var BD = 1000000;');
  })()],
  ['patch yieldLadder: mod 777 P6 raised', (() => {
    const s = mods[777].contents.toString('utf8');
    return s.includes('var P6 = 1000000;');
  })()],
  ['patch tunnel: mod 84 has windowsHide', (() => {
    const s = mods[84].contents.toString('utf8');
    return s.includes('cwd: a2(), windowsHide: true');
  })()],
  ['patch ssh: mod 84 has windowsHide', (() => {
    const s = mods[84].contents.toString('utf8');
    return s.includes('cwd: Se.homedir(), windowsHide: true');
  })()],
  ['patch uploader: mod 84 has windowsHide', (() => {
    const s = mods[84].contents.toString('utf8');
    return s.includes('cwd: a2(),\n          windowsHide: true');
  })()],
  ['patch chrome: mod 352 has windowsHide', (() => {
    const s = mods[352].contents.toString('utf8');
    return s.includes('stdin: "ignore",\n      windowsHide: true');
  })()],
  ['patch pythonKernel: mod 72 returns true', (() => {
    const s = mods[72].contents.toString('utf8');
    return s.includes('return true;\n}');
  })()],
  ['patch pythonKernelCall: mod 361 windowsHide true', (() => {
    const s = mods[361].contents.toString('utf8');
    return s.includes('windowsHide: true');
  })()],
  ['patch pythonKernelCall: mod 799 windowsHide true', (() => {
    const s = mods[799].contents.toString('utf8');
    return s.includes('windowsHide: true');
  })()],
  ['patch encstale: mod 24 ce extended', (() => {
    const s = mods[24].contents.toString('utf8');
    return s.includes('encrypted content');
  })()],
  ['patch flush: mod 169 gate removed', (() => {
    const s = mods[169].contents.toString('utf8');
    return !s.includes('this.#t.size === 0 && this.#e.size === 0');
  })()],
  ['runtime smoke: --version matches omp/18.11.1', (() => {
    const r = execSync('work\\\\omp-zh-18111.exe --version', { encoding: 'utf8', timeout: 30000 });
    return r.trim() === 'omp/18.11.1';
  })()],
  ['runtime smoke: --help CJK >= 1650', (() => {
    const r = execSync('work\\\\omp-zh-18111.exe --help', { encoding: 'utf8', timeout: 30000 });
    const cjk = (r.match(/[\u4e00-\u9fff]/g) || []).length;
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
