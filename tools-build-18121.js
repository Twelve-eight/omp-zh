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

const SRC = process.argv[2] || './work/omp-dl-18121.exe';
const buf = fs.readFileSync(SRC);
const { bun } = parseExe(buf);
const ds = bun.rawPtr + 8;
const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = ds + hdr - 16 - 32;
const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
const mods = readModules(buf, ds, modOff, modLen);

console.log('Module count:', mods.length);

// Load dictionaries: root dict-*.json first, then work/out-*.json staging (same order as build-zh.js)
const dictFiles = fs.readdirSync('.').filter(f => f.startsWith('dict-') && f.endsWith('.json'));
const staging = [];
for (const dir of ['dict/staging', 'work']) {
  if (!fs.existsSync('./' + dir)) continue;
  for (const f of fs.readdirSync('./' + dir).filter(x => /^out-.+\.json$/.test(x)).sort()) {
    staging.push(dir + '/' + f);
  }
}
staging.forEach(f => dictFiles.push(f));
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
console.log('Deduped dict entries:', dedup.length, '| staging files:', staging.length);

// Patch map for 18.12.1
const patchMap = {
  28: s => {
    const re = /supportsForcedToolChoice:\s*!t\.requiresEnabledThinking && !\(t\.isOpenCodeHost && t\.isDeepseekReasoning\),/;
    if (!re.test(s)) throw new Error('mod 28 compat regex not matched');
    return s.replace(re, 'supportsForcedToolChoice: false,');
  },
  646: s => {
    const target = 'var X = 3;\nvar fe = 15000;\nvar J = 3;\nvar z = 3;\nvar Y = 3;';
    const repl   = 'var X = 1000000;\nvar fe = 15000;\nvar J = 1000000;\nvar z = 1000000;\nvar Y = 1000000;';
    if (!s.includes(target)) throw new Error('mod 646 stopcap cluster not matched');
    return s.replace(target, repl);
  },
  783: s => {
    // sessionStop: rD = 8 -> 1000000 (compared as #Vn >= rD)
    if (!s.includes('var rD = 8;')) throw new Error('mod 783 sessionStop rD not found');
    s = s.replace('var rD = 8;', 'var rD = 1000000;');
    // yieldLadder: bh = 3 -> 1000000 (while (!p.yieldCalled() && de < bh))
    if (!s.includes('var bh = 3;')) throw new Error('mod 783 yieldLadder bh not found');
    s = s.replace('var bh = 3;', 'var bh = 1000000;');
    return s;
  },
  75: s => {
    const t1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: GU() });';
    const r1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: GU(), windowsHide: true });';
    const t2 = 'cwd: Se.homedir() });';
    const r2 = 'cwd: Se.homedir(), windowsHide: true });';
    const t3 = 'cwd: GU()\n        });\n        const U = await new Response';
    const r3 = 'cwd: GU(),\n          windowsHide: true\n        });\n        const U = await new Response';
    if (!s.includes(t1)) throw new Error('mod 75 tunnel not found');
    if (!s.includes(t2)) throw new Error('mod 75 ssh not found');
    if (!s.includes(t3)) throw new Error('mod 75 uploader not found');
    return s.replace(t1, r1).replace(t2, r2).replace(t3, r3);
  },
  355: s => {
    const t1 = 'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    });';
    const r1 = 'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });';
    if (!s.includes(t1)) throw new Error('mod 355 chrome not found');
    return s.replace(t1, r1);
  },
  63: s => {
    const t1 = 'function SQ(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}';
    const r1 = 'function SQ(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}';
    if (!s.includes(t1)) throw new Error('mod 63 pythonKernel not found');
    return s.replace(t1, r1);
  },
  25: s => {
    const t1 = 'var de = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?/i, /previous[ _]?response/i];';
    const r1 = 'var de = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?|\\bencrypted content\\b[^\'"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];';
    const t2 = 'var Mt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;';
    const r2 = 'var Mt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;';
    if (!s.includes(t1)) throw new Error('mod 25 encstale de not found');
    if (!s.includes(t2)) throw new Error('mod 25 encstale Mt not found');
    return s.replace(t1, r1).replace(t2, r2);
  },
  167: s => {
    const target = 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#v();';
    const c = s.split(target).length - 1;
    if (c !== 2) throw new Error('mod 167 flush gate count = ' + c + ' (expected 2)');
    return s.split(target).join('this.#v();');
  }
};

const newContents = [];
let transCount = 0;
let patchedCount = 0;

mods.forEach((m, idx) => {
  const nm = m.name.toString('latin1').replace(/\0/g, '');
  let code = m.contents.slice(0, -1).toString('utf8');
  let isModified = false;

  if (patchMap[idx]) {
    code = patchMap[idx](code);
    patchedCount++;
    isModified = true;
  }

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

console.log(`Applied ${patchedCount} patches, translated ${transCount} literals.`);

// ---- HARD GATE: comparison-context audit (single-pass extraction, then set intersection) ----
// A dict entry whose `from` is also compared/cased in code corrupts logic (e.g. "removed" -> "移除d").
// Extract every compared/cased literal once, then intersect with dict `from` values.
{
  const compared = new Set();
  const pats = [
    /(?:===|!==|==|!=)\s*["']([^"'\n]{1,120})["']/g,
    /case\s+["']([^"'\n]{1,120})["']/g,
    /\b(?:act|type|kind|op|purpose|mode|status|action)\s*===\s*["']([^"'\n]{1,120})["']/g,
    /values:\s*\[([^\]]{1,400})\]/g,
  ];
  for (const m of mods) {
    const s = m.contents.toString('utf8');
    for (const re of pats) {
      re.lastIndex = 0;
      let x;
      while ((x = re.exec(s)) !== null) {
        if (re === pats[3]) {
          for (const q of x[1].matchAll(/["']([^"'\n]{1,120})["']/g)) compared.add(q[1]);
        } else {
          compared.add(x[1]);
        }
      }
    }
  }
  const offenders = dedup.filter(e => compared.has(e.from)).map(e => e.from);
  if (offenders.length) {
    console.error('GATE FAIL: ' + offenders.length + ' dict entries collide with code comparisons:');
    offenders.slice(0, 40).forEach(o => console.error('  ! ' + JSON.stringify(o)));
    console.error('Remove or narrow these entries before building.');
    process.exit(3);
  }
  console.log('Gate OK: no dict entry collides with ' + compared.size + ' compared/cased literals.');
}

const out = rebuild(buf, newContents);
const DST = './work/omp-zh-18121.exe';
fs.writeFileSync(DST, out);
console.log('Built: ' + DST + ' (size=' + out.length + ')');
