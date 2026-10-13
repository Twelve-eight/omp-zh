const fs = require('fs');
const { spawnSync } = require('child_process');
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

const SRC = './work/omp-dl-18104.exe';
const buf = fs.readFileSync(SRC);
const { bun } = parseExe(buf);
const ds = bun.rawPtr + 8;
const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = ds + hdr - 16 - 32;
const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
const mods = readModules(buf, ds, modOff, modLen);

// 1. 字典合并
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

// 2. 补丁定义表 (针对 18.10.4 独立 chunk 实施补丁)
const patchMap = {
  // 1. compat in mod 40
  40: s => {
    const re = /supportsForcedToolChoice:\s*!t\.requiresEnabledThinking && !\(t\.isOpenCodeHost && t\.isDeepseekReasoning\) && !\(t\.isClinePass && [A-Za-z0-9_$]+\),/;
    if (!re.test(s)) throw new Error('mod 40 compat regex not matched');
    return s.replace(re, 'supportsForcedToolChoice: false,');
  },
  // 2. stopcap in mod 597 (X, J, z, Y -> 1000000)
  597: s => {
    const target = 'var X = 3;\nvar pe = 15000;\nvar J = 3;\nvar z = 3;\nvar Y = 3;';
    const repl   = 'var X = 1000000;\nvar pe = 15000;\nvar J = 1000000;\nvar z = 1000000;\nvar Y = 1000000;';
    if (!s.includes(target)) throw new Error('mod 597 stopcap cluster not matched');
    return s.replace(target, repl);
  },
  // 3. session stop & yield ladder in mod 686 (l1 = 8 -> 1000000, fy = 3 -> 1000000)
  686: s => {
    if (!s.includes('var l1 = 8;')) throw new Error('mod 686 l1 not found');
    if (!s.includes('var fy = 3;')) throw new Error('mod 686 fy not found');
    return s.replace('var l1 = 8;', 'var l1 = 1000000;').replace('var fy = 3;', 'var fy = 1000000;');
  },
  // 4. leaks in mod 34 (tunnel, ssh, uploader)
  34: s => {
    const t1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: i, stderr: i, cwd: CU() });';
    const r1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: i, stderr: i, cwd: CU(), windowsHide: true });';
    const t2 = 'cwd: Se.homedir() });';
    const r2 = 'cwd: Se.homedir(), windowsHide: true });';
    const t3 = 'cwd: CU()\n        });\n        const U = await new Response(g.stderr).text();';
    const r3 = 'cwd: CU(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr).text();';
    if (!s.includes(t1)) throw new Error('mod 34 tunnel not found');
    if (!s.includes(t2)) throw new Error('mod 34 ssh not found');
    if (!s.includes(t3)) throw new Error('mod 34 uploader not found');
    return s.replace(t1, r1).replace(t2, r2).replace(t3, r3);
  },
  // 5. chrome in mod 323
  323: s => {
    const t1 = 'Bun.spawn([o, ...w], {\n      cwd: t.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    });';
    const r1 = 'Bun.spawn([o, ...w], {\n      cwd: t.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });';
    if (!s.includes(t1)) throw new Error('mod 323 chrome not found');
    return s.replace(t1, r1);
  },
  // 6. python kernel in mod 17
  17: s => {
    const t1 = 'function j7(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}';
    const r1 = 'function j7(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}';
    if (!s.includes(t1)) throw new Error('mod 17 python kernel probe not found');
    return s.replace(t1, r1);
  },
  // 7. encstale in mod 38
  38: s => {
    const t1 = 'var ce = [/\\bItem with id [\x27\x22][^\x27\x22]+[\x27\x22] not found\\.?/i, /previous[ _]?response/i];';
    const r1 = 'var ce = [/\\bItem with id [\x27\x22][^\x27\x22]+[\x27\x22] not found\\.?|\\bencrypted content\\b[^\x27\x22]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];';
    const t2 = 'var _t = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;';
    const r2 = 'var _t = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;';
    if (!s.includes(t1)) throw new Error('mod 38 encstale ce not found');
    if (!s.includes(t2)) throw new Error('mod 38 encstale _t not found');
    return s.replace(t1, r1).replace(t2, r2);
  },
  // 8. replay flush in mod 173
  173: s => {
    const target = 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#w();';
    const c = s.split(target).length - 1;
    if (c !== 2) throw new Error('mod 173 flush gate count = ' + c + ' (expected 2)');
    return s.split(target).join('this.#w();');
  }
};

// 3. 构建 newContents
const newContents = [];
let transCount = 0;
let patchedCount = 0;

mods.forEach((m, idx) => {
  const nm = m.name.toString('latin1').replace(/\0/g, '');
  let code = m.contents.slice(0, -1).toString('utf8');
  let isModified = false;

  // 先应用 patch (如果在 patchMap 中)
  if (patchMap[idx]) {
    code = patchMap[idx](code);
    patchedCount++;
    isModified = true;
  }

  // 如果是 JS 模块，应用翻译
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

console.log(`Applied ${patchedCount} patches and translated ${transCount} literals across modules.`);

const out = rebuild(buf, newContents);
const DST = './work/omp-zh-18104.exe';
fs.writeFileSync(DST, out);
console.log('Built executable: ' + DST + ' (size=' + out.length + ')');

// 4. 冒烟检验
const rVer = spawnSync(DST, ['--version'], { encoding: 'utf8', timeout: 30000 });
console.log('Smoke --version:', (rVer.stdout || '').trim(), 'status=' + rVer.status);

const rHelp = spawnSync(DST, ['--help'], { encoding: 'utf8', timeout: 30000 });
const helpOut = rHelp.stdout || '';
const cjk = (helpOut.match(/[\u4e00-\u9fff]/g) || []).length;
console.log('Smoke --help: status=' + rHelp.status + ' helpCJK=' + cjk);

const modelsLine = helpOut.split('\n').find(l => l.includes('--models'));
console.log('Smoke --models line:', modelsLine);
