// tools-build-18131.js — omp-zh 18.13.1 构建脚本
// 上游 v18.13.1 (commit 0838d2ab44), 3466 模块, --user-agent=omp/18.13.1
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

const SRC = process.argv[2] || './work/omp-dl-18131.exe';
const buf = fs.readFileSync(SRC);
const { bun } = parseExe(buf);
const ds = bun.rawPtr + 8;
const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = ds + hdr - 16 - 32;
const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
const mods = readModules(buf, ds, modOff, modLen);

console.log('Module count:', mods.length);

// Load dictionaries: root dict-*.json first, then staging (dict/staging is the tracked source of
// truth; work/ is still scanned for local scratch, but a same-named file there is SHADOWED).
const dictFiles = fs.readdirSync('.').filter(f => f.startsWith('dict-') && f.endsWith('.json'));
const staging = [];
const seenNames = new Map();
for (const dir of ['dict/staging', 'work']) {
  if (!fs.existsSync('./' + dir)) continue;
  for (const f of fs.readdirSync('./' + dir).filter(x => /^out-.+\.json$/.test(x)).sort()) {
    if (seenNames.has(f)) {
      console.warn(`WARN: ${dir}/${f} is shadowed by ${seenNames.get(f)} (first wins) - edits there have NO effect`);
      continue;
    }
    seenNames.set(f, dir + '/' + f);
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

// Patch map for 18.13.1
const patchMap = {
  // compat: mod 22
  22: s => {
    const t = 'supportsForcedToolChoice: !t.requiresEnabledThinking && !(t.isOpenCodeHost && t.isDeepseekReasoning),';
    if (!s.includes(t)) throw new Error('mod 22 compat not found');
    return s.replace(t, 'supportsForcedToolChoice: false,');
  },
  // stopcap: mod 331 (le/de/ue/he = 3 -> 1000000; each has `#x > K` + `maxRetries: K` use-sites)
  331: s => {
    const t = 'var le = 3;\nvar Be = 15000;\nvar de = 3;\nvar ue = 3;\nvar he = 3;';
    const r = 'var le = 1000000;\nvar Be = 15000;\nvar de = 1000000;\nvar ue = 1000000;\nvar he = 1000000;';
    if (!s.includes(t)) throw new Error('mod 331 stopcap cluster not found');
    return s.replace(t, r);
  },
  // sessionStop + yieldLadder: mod 792 (h0=8 via `#En >= h0`, vh=3 via loop/maxRetries)
  792: s => {
    if (!s.includes('var h0 = 8;')) throw new Error('mod 792 sessionStop h0 not found');
    s = s.replace('var h0 = 8;', 'var h0 = 1000000;');
    if (!s.includes('var vh = 3;')) throw new Error('mod 792 yieldLadder vh not found');
    return s.replace('var vh = 3;', 'var vh = 1000000;');
  },
  // tunnel + ssh + uploader: mod 105
  105: s => {
    const t1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: t4() });';
    const r1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: t4(), windowsHide: true });';
    const t2 = 'cwd: Se.homedir() });';
    const r2 = 'cwd: Se.homedir(), windowsHide: true });';
    const t3 = 'cwd: t4()\n        });\n        const U = await new Response(b.stderr)';
    const r3 = 'cwd: t4(),\n          windowsHide: true\n        });\n        const U = await new Response(b.stderr)';
    if (!s.includes(t1)) throw new Error('mod 105 tunnel not found');
    if (!s.includes(t2)) throw new Error('mod 105 ssh not found');
    if (!s.includes(t3)) throw new Error('mod 105 uploader not found');
    return s.replace(t1, r1).replace(t2, r2).replace(t3, r3);
  },
  // chrome: mod 360
  360: s => {
    const t = 'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    });';
    const r = 'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });';
    if (!s.includes(t)) throw new Error('mod 360 chrome not found');
    return s.replace(t, r);
  },
  // pythonKernel helper: mod 93
  93: s => {
    const t = 'function Eee(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}';
    const r = 'function Eee(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}';
    if (!s.includes(t)) throw new Error('mod 93 pythonKernel not found');
    return s.replace(t, r);
  },
  // pythonKernel call sites: mod 368, 814
  368: s => {
    const t = 'Eee({\n        platform: "win32",\n        hostHasInheritableConsole: MT()\n      })';
    if (!s.includes(t)) throw new Error('mod 368 pythonKernelCall not found');
    return s.replace(t, 'true');
  },
  814: s => {
    const t = 'Eee({\n        platform: "win32",\n        hostHasInheritableConsole: MT()\n      })';
    if (!s.includes(t)) throw new Error('mod 814 pythonKernelCall not found');
    return s.replace(t, 'true');
  },
  // encstale: mod 19
  19: s => {
    const t1 = 'var de = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?/i, /previous[ _]?response/i];';
    const r1 = 'var de = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?|\\bencrypted content\\b[^\'"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];';
    const t2 = 'var Mt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;';
    const r2 = 'var Mt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;';
    if (!s.includes(t1)) throw new Error('mod 19 encstale de not found');
    if (!s.includes(t2)) throw new Error('mod 19 encstale Mt not found');
    return s.replace(t1, r1).replace(t2, r2);
  },
  // flush: mod 168
  168: s => {
    const target = 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#v();';
    const c = s.split(target).length - 1;
    if (c !== 2) throw new Error('mod 168 flush gate count = ' + c + ' (expected 2)');
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
const DST = './work/omp-zh-18131.exe';
fs.writeFileSync(DST, out);
console.log('Built: ' + DST + ' (size=' + out.length + ')');
