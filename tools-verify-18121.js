const fs = require('fs');
const { execSync } = require('child_process');
const { parseExe, readModules } = require('./rebuild.js');

const EXE = './work/omp-zh-18121.exe';
const buf = fs.readFileSync(EXE);
const { bun } = parseExe(buf);
const ds = bun.rawPtr + 8;
const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = ds + hdr - 16 - 32;
const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
const mods = readModules(buf, ds, modOff, modLen);

const checks = [
  ['module count is 3418', mods.length === 3418],
  ['modLen matches 3418 * 52', modLen === 3418 * 52],
  ['argvStart correctly points to valid --user-agent', (() => {
    const argvOff = buf.readUInt32LE(O + 20), argvLen = buf.readUInt32LE(O + 24);
    const s = buf.slice(ds + argvOff, ds + argvOff + argvLen).toString('latin1');
    return s === '--user-agent=omp/18.12.1';
  })()],
  ['patch compat: mod 28 supportsForcedToolChoice is false', (() => {
    const s = mods[28].contents.toString('utf8');
    return s.includes('supportsForcedToolChoice: false,');
  })()],
  ['patch stopcap: mod 646 has 1000000 constants', (() => {
    const s = mods[646].contents.toString('utf8');
    return s.includes('var X = 1000000;') && s.includes('var J = 1000000;');
  })()],
  ['patch sessionStop: mod 783 rD raised', (() => {
    const s = mods[783].contents.toString('utf8');
    return s.includes('var rD = 1000000;');
  })()],
  ['patch yieldLadder: mod 783 bh raised', (() => {
    const s = mods[783].contents.toString('utf8');
    return s.includes('var bh = 1000000;');
  })()],
  ['patch tunnel: mod 75 has windowsHide', (() => {
    const s = mods[75].contents.toString('utf8');
    return s.includes('cwd: GU(), windowsHide: true');
  })()],
  ['patch ssh: mod 75 has windowsHide', (() => {
    const s = mods[75].contents.toString('utf8');
    return s.includes('cwd: Se.homedir(), windowsHide: true');
  })()],
  ['patch uploader: mod 75 has windowsHide', (() => {
    const s = mods[75].contents.toString('utf8');
    return s.includes('cwd: GU(),\n          windowsHide: true');
  })()],
  ['patch chrome: mod 355 has windowsHide', (() => {
    const s = mods[355].contents.toString('utf8');
    return s.includes('stdin: "ignore",\n      windowsHide: true');
  })()],
  ['patch pythonKernel: mod 63 returns true', (() => {
    const s = mods[63].contents.toString('utf8');
    return s.includes('return true;\n}');
  })()],
  ['patch encstale: mod 25 de extended', (() => {
    const s = mods[25].contents.toString('utf8');
    return s.includes('encrypted content');
  })()],
  ['patch flush: mod 167 gate removed', (() => {
    const s = mods[167].contents.toString('utf8');
    return !s.includes('this.#t.size === 0 && this.#e.size === 0');
  })()],
  ['runtime smoke: --version matches omp/18.12.1', (() => {
    const r = execSync('work\\\\omp-zh-18121.exe --version', { encoding: 'utf8', timeout: 30000 });
    return r.trim() === 'omp/18.12.1';
  })()],
  ['runtime smoke: --help has CJK content', (() => {
    const r = execSync('work\\\\omp-zh-18121.exe --help', { encoding: 'utf8', timeout: 30000 });
    const cjk = (r.match(/[\u4e00-\u9fff]/g) || []).length;
    return cjk >= 1650; // Restored to 1650 baseline
  })()]
];

let fail = 0;
checks.forEach(([name, pass]) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name);
  if (!pass) fail++;
});
console.log(fail === 0 ? 'ALL ' + checks.length + ' VERIFICATIONS PASS' : 'FAILURES: ' + fail);
if (fail > 0) process.exit(1);
