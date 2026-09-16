// 18.1.22 终验:逐项检查补丁在产物中的实际效果
const { parseExe, readModules } = require('G:/omp works/Tools/omp-zh/rebuild.js');
const fs = require('fs');
function load(f) {
  const buf = fs.readFileSync(f);
  const { bun } = parseExe(buf);
  const ds = bun.rawPtr + 8;
  const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
  const O = ds + hdr - 16 - 32;
  return readModules(buf, ds, buf.readUInt32LE(O + 8), buf.readUInt32LE(O + 12));
}
const z = load('G:/omp works/Tools/omp-zh/work/omp-zh.exe');
const v = load('G:/omp works/Tools/omp-zh/work/omp-dl.exe');
const d = z[0].contents.toString('latin1');
let vt = 0, zt = 0;
v.forEach(m => vt += m.name.length + m.contents.length);
z.forEach(m => zt += m.name.length + m.contents.length);
const has = (s) => d.includes(s);
const flushPat = /for \(const t of e\)\n      this\.#h\(t\);\n    this\.#R\(\);/g;
const catPat = /"deepseek-v4-(flash|pro)"[\s\S]{0,2500}?supportsForcedToolChoice: true/g;
const v5 = d.slice(d.indexOf('V5s = [')).slice(0, 240);
const checks = [
  ['stopcap cluster=1e6', has('aAo = 1000000, _La = 4000, lAo = 1000000, uAo = 1000000')],
  ['stopcap session cap=1e6', has('var qAo = 1000000')],
  ['stopcap yield=1e6', has('Cmt = 1000000')],
  ['replay retryRecovery injected', has('o.applyRetryRecovery(e.retryRecovery)')],
  ['flush gate removed', !has('if (this.#t.size === 0 && this.#e.size === 0)')],
  ['flush x2 unconditional', (d.match(flushPat) || []).length === 2],
  ['leak tunnel cwd+hide', has('cwd: qK(), windowsHide: true })')],
  ['leak ssh cwd+hide', has('cwd: gxt.homedir(), windowsHide: true })')],
  ['leak uploader-sh cwd+hide', has('windowsHide: true\n        })')],
  ['leak chrome launch hide', has('stdin: "ignore",\n      windowsHide: true\n    })')],
  ['leak broker detached+hide', has('detached: false,\n    windowsHide: true\n  };')],
  ['catalog v4 true=0', (d.match(catPat) || []).length === 0],
  ['encstale V5s regex extended', v5.includes('encrypted content')],
  ['encstale jSr regex extended', has('retention|encrypted content could not be decrypted')],
  ['encstale compat schema', has('"replayResponsesReasoning?": "boolean"')],
  ['encstale T7 gate', has('"1" || e.model?.compat?.replayResponsesReasoning === false ? false')],
  ['encstale QLt items gate', has('"1" || e.compat?.replayResponsesReasoning === false ? undefined')],
  ['encstale QLt bKe gate', has('!m && process.env.OMP_NO_REPLAY_REASONING !== "1"')],
  ['encstale Mbe prepend filter', has('"1" || e.compat?.replayResponsesReasoning === false ? o.filter')],
  ['encstale Xni prepend filter', has('"1" || t.compat?.replayResponsesReasoning === false ? s.filter')],
  ['strings region <= vanilla (' + zt + ' / ' + vt + ')', zt <= vt],
];
let bad = 0;
for (const [n, ok] of checks) { if (!ok) bad++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); }
console.log(bad === 0 ? 'ALL ' + checks.length + ' PASS' : 'FAILURES: ' + bad);
