// 18.2.1 终验:bytecode 失效 + 五组补丁 + 串区/自由区不变量
const { parseExe, readModules } = require('G:/omp works/Tools/omp-zh/rebuild.js');
const fs = require('fs');
function load(f) {
  const buf = fs.readFileSync(f);
  const { bun } = parseExe(buf);
  const ds = bun.rawPtr + 8;
  const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
  const O = ds + hdr - 16 - 32;
  const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
  return { buf, ds, modOff, modLen, mods: readModules(buf, ds, modOff, modLen), O, hdr };
}
const Z = load('G:/omp works/Tools/omp-zh/work/omp-zh.exe');
const V = load('G:/omp works/Tools/omp-zh/work/omp-dl-1821.exe');
const d = Z.mods[0].contents.toString('latin1');
const has = (s) => d.includes(s);
const checks = [
  ['mod0 bytecode pointer stripped', Z.buf.readUInt32LE(Z.ds + Z.modOff + 24) === 0 && Z.buf.readUInt32LE(Z.ds + Z.modOff + 28) === 0],
  ['vanilla had bytecode', V.buf.readUInt32LE(V.ds + V.modOff + 24) > 0],
  ['mod0 contents relocated into free region', Z.buf.readUInt32LE(Z.ds + Z.modOff + 8) === V.buf.readUInt32LE(V.ds + V.modOff + 24)],
  ['module count unchanged', Z.mods.length === V.mods.length],
  ['table offset unchanged (zero-shift)', Z.modOff === V.modOff && Z.modLen === V.modLen],
  ['exe size unchanged', Z.buf.length === V.buf.length],
  ['stopcap cluster=1e6', has('eNn = 1000000, oWa = 4000, tNn = 1000000, sNn = 1000000')],
  ['session cap=1e6', has('MNn = 1000000')],
  ['yield ladder=1e6', has('LCt = 1000000')],
  ['replay retryRecovery injected', has('this.applyRetryRecovery(e.retryRecovery)')],
  ['flush gate removed', !has('if (this.#t.size === 0 && this.#e.size === 0)')],
  ['flush x2 unconditional', (d.match(/for \(const t of e\)\n      this\.#y\(t\);\n    this\.#S\(\);/g) || []).length === 2],
  ['leak tunnel cwd+hide', has('cwd: V7(), windowsHide: true })')],
  ['leak ssh cwd+hide', has('cwd: jOt.homedir(), windowsHide: true })')],
  ['leak uploader-sh hide', has('windowsHide: true\n        })')],
  ['leak chrome launch hide', has('stdin: "ignore",\n      windowsHide: true\n    })')],
  ['python kernel windowsHide=true', has('windowsHide: true\n      });')],
  ['console probe forced true', has('function iZt(e) {\n  if (e.platform !== "win32")\n    return false;\n  return true;\n}')],
  ['catalog v4 forced-choice true=0', (d.match(/"deepseek-v4-(flash|pro)"[\s\S]{0,2500}?supportsForcedToolChoice: true/g) || []).length === 0],
  ['encstale regex extended (C$s)', has('encrypted content')],
  ['encstale regex extended (IOr)', has('encrypted content could not be decrypted')],
  ['encstale compat schema', has('"replayResponsesReasoning?": "boolean"')],
  ['encstale T7 gate', has('"1" || e.model?.compat?.replayResponsesReasoning === false ? false')],
  ['encstale QLt items gate', has('"1" || e.compat?.replayResponsesReasoning === false ? undefined')],
  ['encstale QLt bKe gate', has('!m && process.env.OMP_NO_REPLAY_REASONING !== "1"')],
  ['encstale Mbe prepend filter', has('"1" || e.compat?.replayResponsesReasoning === false ? n.filter')],
  ['encstale Xni prepend filter', has('"1" || t.compat?.replayResponsesReasoning === false ? s.filter')],
  ['CHANGELOG untouched (no compensation)', Z.mods.some((m, i) => m.name.toString('latin1').includes('CHANGELOG') && m.contents.length === V.mods[i].contents.length)],
];
let bad = 0;
for (const [n, ok] of checks) { if (!ok) bad++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); }
console.log(bad === 0 ? 'ALL ' + checks.length + ' PASS' : 'FAILURES: ' + bad);
