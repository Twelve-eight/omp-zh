// 18.2.x 终验(mode C 不变量;当前 18.2.4)
//
// mode C 的做法:清零 mod0 的 bytecode 描述符(rest+8/+12)-> 运行时回退执行表项 contents
// 指向的 JS 源码;被改模块的新内容追加到**模块表之前**,表随之后移;tailZone/argv/offsets
// 依次后移.因此旧判据(表零位移/exe 大小不变/内容写入原 bytecode 区)全部不适用.
//
// 真实不变量:
//   1) [0, modOff) 与 vanilla 逐字节相同 -- mode C 安全性的全部依据
//      (前缀区 66 万处绝对偏移 + 全部 rest 字段天然有效)
//   2) blob 区字节与 vanilla 相同(从未写入)
//   3) mod0 rest+8/+12 == 0,且表项 contents off/len 指向追加区
//   4) 未改模块的表项 off/len 与 vanilla 相同(仅被改模块重定位)
//   5) 表位置 = vanilla 表位置 + 追加长度(表随内容后移,loader 接受 contents off < 表位置)
const { parseExe, readModules } = require('G:/omp works/Tools/omp-zh/rebuild.js');
const fs = require('fs');

function load(f) {
  const buf = fs.readFileSync(f);
  const { bun } = parseExe(buf);
  const ds = bun.rawPtr + 8;
  const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
  const O = ds + hdr - 16 - 32;
  const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
  const argvOff = buf.readUInt32LE(O + 20), argvLen = buf.readUInt32LE(O + 24);
  return { buf, ds, hdr, O, modOff, modLen, argvOff, argvLen, mods: readModules(buf, ds, modOff, modLen) };
}
const Z = load('G:/omp works/Tools/omp-zh/work/omp-zh.exe');
const V = load('G:/omp works/Tools/omp-zh/work/omp-dl-1828.exe');
const d = Z.mods[0].contents.toString('latin1');
const has = (s) => d.includes(s);

// 1) 前缀逐字节相同
const prefixEqual = Buffer.compare(Z.buf.slice(Z.ds, Z.ds + V.modOff), V.buf.slice(V.ds, V.ds + V.modOff)) === 0;
// 2) blob 区相同(mod0 bytecode 区)
const blobOff = V.buf.readUInt32LE(V.ds + V.modOff + 24);
const blobLen = V.buf.readUInt32LE(V.ds + V.modOff + 28);
const blobEqual = Buffer.compare(Z.buf.slice(Z.ds + blobOff, Z.ds + blobOff + blobLen), V.buf.slice(V.ds + blobOff, V.ds + blobOff + blobLen)) === 0;
// 3) mod0 bytecode 描述符清零 + 表项指向追加区
const zc0 = Z.buf.readUInt32LE(Z.ds + Z.modOff + 8), zl0 = Z.buf.readUInt32LE(Z.ds + Z.modOff + 12);
const vc0 = V.buf.readUInt32LE(V.ds + V.modOff + 8);
const mod0Relocated = zc0 !== vc0 && zc0 >= V.modOff;
// 4) 未改模块表项一致
let untouchedSame = 0, untouchedDiff = 0;
for (let i = 1; i < V.mods.length; i++) {
  const zp = Z.ds + Z.modOff + i * 52, vp = V.ds + V.modOff + i * 52;
  const same = Z.buf.readUInt32LE(zp + 8) === V.buf.readUInt32LE(vp + 8) && Z.buf.readUInt32LE(zp + 12) === V.buf.readUInt32LE(vp + 12);
  same ? untouchedSame++ : untouchedDiff++;
}
// 5) 表随内容后移
const tableShifted = Z.modOff >= V.modOff;

const checks = [
  ['prefix [0,modOff) byte-identical to vanilla', prefixEqual],
  ['shared bytecode blob untouched', blobEqual],
  ['mod0 bytecode descriptor zeroed', Z.buf.readUInt32LE(Z.ds + Z.modOff + 24) === 0 && Z.buf.readUInt32LE(Z.ds + Z.modOff + 28) === 0],
  ['vanilla had bytecode descriptor', blobOff > 0 && blobLen > 0],
  ['mod0 contents relocated into append region', mod0Relocated],
  ['only translated modules relocated (' + untouchedSame + ' untouched, ' + untouchedDiff + ' relocated)', untouchedDiff > 0 && untouchedDiff <= 8],
  ['table follows appended content', tableShifted],
  ['module count unchanged', Z.mods.length === V.mods.length],
  ['stopcap cluster=1e6', has('u_o = 1000000, sqa = 4000, p_o = 1000000, c_o = 1000000')],
  ['session cap=1e6', has('D_o = 1000000')],
  ['yield ladder=1e6', has('Xbt = 1000000')],
  ['retryRecovery natively rendered (MW)', has('function MW(e, t = 0)') && has('compact-recovered')],
  ['flush gate removed', !has('if (this.#t.size === 0 && this.#e.size === 0)')],
  ['flush x2 unconditional', (d.match(/for \(const t of e\)\n      this\.#R\(t\);\n    this\.#x\(\);/g) || []).length === 2],
  ['leak tunnel cwd+hide', has('cwd: hV(), windowsHide: true })')],
  ['leak ssh cwd+hide', has('cwd: V0t.homedir(), windowsHide: true })')],
  ['leak uploader-sh hide', has('windowsHide: true\n        })')],
  ['leak chrome launch hide', has('stdin: "ignore",\n      windowsHide: true\n    })')],
  ['python kernel windowsHide=true', has('windowsHide: true\n      });')],
  ['console probe forced true', has('function Eos(e) {\n  if (e.platform !== "win32")\n    return false;\n  return true;\n}')],
  ['catalog v4 forced-choice true=0', (d.match(/"deepseek-v4-(flash|pro)"[\s\S]{0,2500}?supportsForcedToolChoice: true/g) || []).length === 0],
  ['encstale regex extended (ern)', has('encrypted content')],
  ['encstale regex extended (mGr)', has('encrypted content could not be decrypted')],
  ['encstale compat schema', has('"replayResponsesReasoning?": "boolean"')],
  ['encstale T7 gate', has('"1" || e.model?.compat?.replayResponsesReasoning === false ? false')],
  ['encstale QLt items gate', has('"1" || e.compat?.replayResponsesReasoning === false ? undefined')],
  ['encstale QLt bKe gate', has('!m && process.env.OMP_NO_REPLAY_REASONING !== "1"')],
  ['encstale Mbe prepend filter', has('"1" || e.compat?.replayResponsesReasoning === false ? o.filter')],
  ['encstale Xni prepend filter', has('"1" || t.compat?.replayResponsesReasoning === false ? s.filter')],
  ['encstale regex matches real 400 text', (() => {
    const idx = d.indexOf('ern = [');
    if (idx < 0) return false;
    const body = d.slice(idx + 7);
    const cut = body.indexOf('/i, /');
    if (cut < 0) return false;
    try {
      const re = new RegExp(body.slice(1, cut), 'i');
      return re.test('400 OpenAI Responses bad request: The encrypted content gAAA..U04= could not be verified. Reason: Encrypted content could not be decrypted or parsed.');
    } catch (e) { return false; }
  })()],
  ['translation present in mod0 (CJK escapes)', (d.match(/\\u[4-9a-fA-F][0-9a-fA-F]{3}/g) || []).length > 1000],
];
let bad = 0;
for (const [n, ok] of checks) { if (!ok) bad++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); }
console.log(bad === 0 ? 'ALL ' + checks.length + ' PASS' : 'FAILURES: ' + bad);
