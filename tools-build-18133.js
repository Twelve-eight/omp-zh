// tools-build-18133.js — omp-zh 18.13.3 构建脚本
// 上游 v18.13.3 (commit 413d278a87), 3488 模块, --user-agent=omp/18.13.3
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

const SRC = process.argv[2] || './work/omp-dl-18133.exe';
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

// Patch map for 18.13.3 (anchors relocated from 18.13.1 by name-independent regex scan; each unique)
const patchMap = {
  // compat: mod 43
  43: s => {
    const t = 'supportsForcedToolChoice: !t.requiresEnabledThinking && !(t.isOpenCodeHost && t.isDeepseekReasoning),';
    if (!s.includes(t)) throw new Error('mod 43 compat not found');
    return s.replace(t, 'supportsForcedToolChoice: false,');
  },
  // stopcap: mod 656 (Z/ee/te/re = 3 -> 1000000; each has `#x > K` + `maxRetries: K` use-sites)
  656: s => {
    const t = 'var Z = 3;\nvar ge = 15000;\nvar ee = 3;\nvar te = 3;\nvar re = 3;';
    const r = 'var Z = 1000000;\nvar ge = 15000;\nvar ee = 1000000;\nvar te = 1000000;\nvar re = 1000000;';
    if (!s.includes(t)) throw new Error('mod 656 stopcap cluster not found');
    return s.replace(t, r);
  },
  // sessionStop + yieldLadder: mod 801 (L0=8 via `#hs >= L0`, mh=3 via loop/maxRetries)
  801: s => {
    if (!s.includes('var L0 = 8;')) throw new Error('mod 801 sessionStop L0 not found');
    s = s.replace('var L0 = 8;', 'var L0 = 1000000;');
    if (!s.includes('var mh = 3;')) throw new Error('mod 801 yieldLadder mh not found');
    return s.replace('var mh = 3;', 'var mh = 1000000;');
  },
  // tunnel + ssh + uploader: mod 37
  37: s => {
    const t1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: k4() });';
    const r1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: k4(), windowsHide: true });';
    const t2 = 'cwd: Se.homedir() });';
    const r2 = 'cwd: Se.homedir(), windowsHide: true });';
    const t3 = 'cwd: k4()\n        });\n        const U = await new Response(g.stderr)';
    const r3 = 'cwd: k4(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr)';
    if (!s.includes(t1)) throw new Error('mod 37 tunnel not found');
    if (!s.includes(t2)) throw new Error('mod 37 ssh not found');
    if (!s.includes(t3)) throw new Error('mod 37 uploader not found');
    return s.replace(t1, r1).replace(t2, r2).replace(t3, r3);
  },
  // chrome: mod 355
  355: s => {
    const t = 'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    });';
    const r = 'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });';
    if (!s.includes(t)) throw new Error('mod 355 chrome not found');
    return s.replace(t, r);
  },
  // pythonKernel helper: mod 23
  23: s => {
    const t = 'function lte(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}';
    const r = 'function lte(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}';
    if (!s.includes(t)) throw new Error('mod 23 pythonKernel not found');
    return s.replace(t, r);
  },
  // pythonKernel call sites: mod 363, 823
  363: s => {
    const t = 'lte({\n        platform: "win32",\n        hostHasInheritableConsole: YT()\n      })';
    if (!s.includes(t)) throw new Error('mod 363 pythonKernelCall not found');
    return s.replace(t, 'true');
  },
  823: s => {
    const t = 'lte({\n        platform: "win32",\n        hostHasInheritableConsole: YT()\n      })';
    if (!s.includes(t)) throw new Error('mod 823 pythonKernelCall not found');
    return s.replace(t, 'true');
  },
  // encstale: mod 41
  41: s => {
    const t1 = 'var Ee = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?/i, /previous[ _]?response/i];';
    const r1 = 'var Ee = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?|\\bencrypted content\\b[^\'"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];';
    const t2 = 'var Xt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;';
    const r2 = 'var Xt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;';
    if (!s.includes(t1)) throw new Error('mod 41 encstale Ee not found');
    if (!s.includes(t2)) throw new Error('mod 41 encstale Xt not found');
    return s.replace(t1, r1).replace(t2, r2);
  },
  // flush: mod 159
  159: s => {
    const target = 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#S();';
    const c = s.split(target).length - 1;
    if (c !== 2) throw new Error('mod 159 flush gate count = ' + c + ' (expected 2)');
    return s.split(target).join('this.#S();');
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
const DST = './work/omp-zh-18133.exe';
fs.writeFileSync(DST, out);
console.log('Built: ' + DST + ' (size=' + out.length + ')');
