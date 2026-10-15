const fs = require('fs');
const { parseExe, readModules, rebuild } = require('./rebuild.js');
const { translate } = require('./translate.js');

function asciiEscape(s) {
  return s.replace(/[^\x00-\x7F]+/g, (m) => {
    let out = '';
    for (let i = 0; i < m.length; i++) {
      const c = m.charCodeAt(i);
      if (c <= 0xFFFF) {
        out += '\\u' + c.toString(16).padStart(4, '0');
      } else {
        out += m[i];
      }
    }
    return out;
  });
}

const SRC = './work/omp-dl-18111.exe';
const buf = fs.readFileSync(SRC);
const { bun } = parseExe(buf);
const ds = bun.rawPtr + 8;
const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = ds + hdr - 16 - 32;
const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
const mods = readModules(buf, ds, modOff, modLen);

console.log('Module count:', mods.length);

// 1. Load dictionaries
const dictFiles = fs.readdirSync('.').filter(f => f.startsWith('dict-') && f.endsWith('.json'));
let allEntries = [];
dictFiles.forEach(f => {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  allEntries = allEntries.concat(d);
});
const seen = new Map();
allEntries.forEach(e => {
  const k = e.from + '|' + e.mode;
  if (!seen.has(k)) seen.set(k, e);
});
const dedup = [...seen.values()];
console.log('Deduped dict entries:', dedup.length);

// 2. Patch map for 18.11.1 anchors
const patchMap = {
  // compat: mod 29
  29: s => {
    const re = /supportsForcedToolChoice:\s*!t\.requiresEnabledThinking && !\(t\.isOpenCodeHost && t\.isDeepseekReasoning\) && !\(t\.isClinePass && [A-Za-z0-9_$]+\),/;
    if (!re.test(s)) throw new Error('mod 29 compat regex not matched');
    return s.replace(re, 'supportsForcedToolChoice: false,');
  },
  // stopcap: mod 640
  640: s => {
    const target = 'var X = 3;\nvar fe = 15000;\nvar J = 3;\nvar z = 3;\nvar Y = 3;';
    const repl   = 'var X = 1000000;\nvar fe = 15000;\nvar J = 1000000;\nvar z = 1000000;\nvar Y = 1000000;';
    if (!s.includes(target)) throw new Error('mod 640 stopcap cluster not matched');
    return s.replace(target, repl);
  },
  // sessionStop + yieldLadder: mod 777
  777: s => {
    // sessionStop: x$ = 8 -> 1000000
    if (!s.includes('var x$ = 8;')) throw new Error('mod 777 sessionStop x$ not found');
    s = s.replace('var x$ = 8;', 'var x$ = 1000000;');
    // yieldLadder: uS = 3 -> 1000000 (and sx, ih, ZQ if they are yield-related)
    if (!s.includes('var uS = 3;')) throw new Error('mod 777 yieldLadder uS not found');
    s = s.replace('var uS = 3;', 'var uS = 1000000;');
    return s;
  },
  // tunnel + ssh + uploader: mod 84
  84: s => {
    // tunnel
    const t1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: a2() })';
    const r1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: a2(), windowsHide: true })';
    if (!s.includes(t1)) throw new Error('mod 84 tunnel not found');
    s = s.replace(t1, r1);
    // ssh
    const t2 = 'cwd: Se.homedir() })';
    const r2 = 'cwd: Se.homedir(), windowsHide: true })';
    if (!s.includes(t2)) throw new Error('mod 84 ssh not found');
    s = s.replace(t2, r2);
    // uploader
    const t3 = 'cwd: a2()\n        });\n        const U = await new Response';
    const r3 = 'cwd: a2(),\n          windowsHide: true\n        });\n        const U = await new Response';
    if (!s.includes(t3)) throw new Error('mod 84 uploader not found');
    s = s.replace(t3, r3);
    return s;
  },
  // chrome: mod 352
  352: s => {
    const t1 = 'Bun.spawn([s, ...d], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"';
    const r1 = 'Bun.spawn([s, ...d], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true';
    if (!s.includes(t1)) throw new Error('mod 352 chrome not found');
    return s.replace(t1, r1);
  },
  // pythonKernel: mod 72 - force return true
  72: s => {
    const t1 = 'function FJ(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}';
    const r1 = 'function FJ(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}';
    if (!s.includes(t1)) throw new Error('mod 72 pythonKernel not found');
    return s.replace(t1, r1);
  },
  // pythonKernelCall: mod 361, 799 - replace FJ({...}) with true
  361: s => {
    const t1 = 'windowsHide: FJ({\n        platform: "win32",\n        hostHasInheritableConsole: Xv()\n      })';
    const r1 = 'windowsHide: true';
    if (!s.includes(t1)) throw new Error('mod 361 pythonKernelCall not found');
    return s.replace(t1, r1);
  },
  799: s => {
    const t1 = 'windowsHide: FJ({\n        platform: "win32",\n        hostHasInheritableConsole: Xv()\n      })';
    const r1 = 'windowsHide: true';
    if (!s.includes(t1)) throw new Error('mod 799 pythonKernelCall not found');
    return s.replace(t1, r1);
  },
  // encstale: mod 24 - extend ce and bt regexes
  24: s => {
    const t1 = 'var ce = [/\\bItem with id [\x27\x22][^\x27\x22]+[\x27\x22] not found\\.?/i, /previous[ _]?response/i];';
    const r1 = 'var ce = [/\\bItem with id [\x27\x22][^\x27\x22]+[\x27\x22] not found\\.?|\\bencrypted content\\b[^\x27\x22]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];';
    const t2 = 'var bt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;';
    const r2 = 'var bt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;';
    if (!s.includes(t1)) throw new Error('mod 24 encstale ce not found');
    if (!s.includes(t2)) throw new Error('mod 24 encstale bt not found');
    return s.replace(t1, r1).replace(t2, r2);
  },
  // flush: mod 169 - remove gate
  169: s => {
    const target = 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#w();';
    const c = s.split(target).length - 1;
    if (c !== 2) throw new Error('mod 169 flush gate count = ' + c + ' (expected 2)');
    return s.split(target).join('this.#w();');
  }
};

// 3. Build newContents
const newContents = [];
let transCount = 0;
let patchedCount = 0;

mods.forEach((m, idx) => {
  const nm = m.name.toString('latin1').replace(/\0/g, '');
  let code = m.contents.slice(0, -1).toString('utf8');
  let isModified = false;

  // Apply patch if in patchMap
  if (patchMap[idx]) {
    code = patchMap[idx](code);
    patchedCount++;
    isModified = true;
  }

  // Apply translation if JS module
  if (nm.endsWith('.js')) {
    const { code: transCode, count } = translate(code, dedup);
    if (count > 0) {
      code = transCode;
      transCount += count;
      isModified = true;
    }
  }

  if (isModified) {
    newContents[idx] = Buffer.from(asciiEscape(code), 'latin1');
  }
});

console.log(`Applied ${patchedCount} patches and translated ${transCount} literals.`);

const out = rebuild(buf, newContents);
const DST = './work/omp-zh-18111.exe';
fs.writeFileSync(DST, out);
console.log('Built: ' + DST + ' (size=' + out.length + ')');
