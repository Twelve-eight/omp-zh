// Verification checks for the omp v18.13.3 localized build.
// Run through verify.js: node verify.js 18.13.3 [--exe <localized.exe>] [--official <official.exe>]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseExe, readModules } = require('../lib/rebuild.js');

module.exports = function checks({ exe, official, root }) {
  const buf = fs.readFileSync(exe);
  const { bun } = parseExe(buf);
  const ds = bun.rawPtr + 8;
  const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
  const O = ds + hdr - 16 - 32;
  const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
  const mods = readModules(buf, ds, modOff, modLen);
  const dec = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const txt = (i) => dec(mods[i].contents.toString('utf8'));

  return [
  ['module count is 3488', mods.length === 3488],
  ['modLen matches 3488 * 52', modLen === 3488 * 52],
  ['argvStart points to omp/18.13.3', (() => {
    const argvOff = buf.readUInt32LE(O + 20), argvLen = buf.readUInt32LE(O + 24);
    return buf.slice(ds + argvOff, ds + argvOff + argvLen).toString('latin1') === '--user-agent=omp/18.13.3';
  })()],
  // Each patch: patched text present AND original text gone (no vacuous substring checks).
  ['patch compat: mod 43', txt(43).includes('supportsForcedToolChoice: false,') && !txt(43).includes('supportsForcedToolChoice: !t.requiresEnabledThinking')],
  ['patch stopcap: mod 656 Z/ee/te/re raised', txt(656).includes('var Z = 1000000;\nvar ge = 15000;\nvar ee = 1000000;\nvar te = 1000000;\nvar re = 1000000;')],
  ['patch sessionStop: mod 801 L0 raised', txt(801).includes('var L0 = 1000000;') && !txt(801).includes('var L0 = 8;')],
  ['patch yieldLadder: mod 801 mh raised', txt(801).includes('var mh = 1000000;') && !txt(801).includes('var mh = 3;')],
  ['patch tunnel: mod 37', txt(37).includes('stdout: r, stderr: r, cwd: k4(), windowsHide: true });')],
  ['patch ssh: mod 37', txt(37).includes('cwd: Se.homedir(), windowsHide: true });')],
  ['patch uploader: mod 37', txt(37).includes('cwd: k4(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr)')],
  ['patch chrome: mod 355', txt(355).includes('stdin: "ignore",\n      windowsHide: true\n    });\n    a.unref();')],
  ['patch pythonKernel: mod 23 lte returns true', txt(23).includes('function lte(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}')],
  ['patch pythonKernelCall: mod 363', txt(363).includes('stderr: "pipe",\n      windowsHide: true\n    });\n    _.setProcess(a);') && !txt(363).includes('hostHasInheritableConsole: YT()')],
  ['patch pythonKernelCall: mod 823', txt(823).includes('detached: false,\n      windowsHide: true\n    });\n    const s = new vae(') && !txt(823).includes('hostHasInheritableConsole: YT()')],
  ['patch encstale: mod 41', txt(41).includes('could not be (?:verified|decrypted|parsed)/i') && txt(41).includes('|encrypted content could not be decrypted/i;')],
  ['patch flush: mod 159 gate removed', !txt(159).includes('this.#t.size === 0 && this.#e.size === 0')],
  ['patch anchors: every original anchor text gone from product', (() => {
    const gone = [
      [656, 'var Z = 3;\nvar ge = 15000;'], [37, 'cwd: k4() });'], [37, 'cwd: Se.homedir() });'],
      [37, 'cwd: k4()\n        });\n        const U = await new Response(g.stderr)'],
      [355, 'stdin: "ignore"\n    });\n    a.unref();'], [23, 'return !o.hostHasInheritableConsole;'],
      [41, 'not found\\.?/i, /previous'], [41, 'retention/i;']
    ];
    return gone.every(([i, t]) => !txt(i).includes(t));
  })()],
  ['gate: enum index keys stay English', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return all.includes('o["Low"] = "low"') && all.includes('e["Browser"] = "browser"') && all.includes('e["Disabled"] = "disabled"');
  })()],
  ['gate: ternary branch and array element values still translated', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return /\? "[^"]*\/Monthly" :/.test(all) && !/\? "Monthly" :/.test(all) && /\["[^"]*\/Submit", /.test(all) && !/\["Submit", /.test(all);
  })()],
  ['gate: string-match args and membership arrays stay English', (() => {
    return txt(713).includes('startsWith("Retry budget exhausted")') && txt(1234).includes('["References", "External links", "See also"');
  })()],
  ['18.13.3 additions translated (settings, context viewer, annotate, session rename)', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return ['扩展模式控制/Extension Mode Control', '恢复会话的工作树范围/Resume Worktree Scope', '速率限制时沿回退链切换/Rate Limit Walks Chain',
      '助手思考/Assistant Thinking', '自动压缩缓冲/Auto-Compact Buffer', '恢复标注草稿/Resume an annotation draft', '重命名会话/Rename Session']
      .every(t => all.includes('"' + t + '"'));
  })()],
  ['model-visible text: tool results stay English; summer entries never land in tool/agent/ai sources', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    if (!all.includes('.push("Remaining items: none.")') || all.includes('剩余条目：无。')) return false;
    if (!all.includes('"Todo list is empty." : "Todo list cleared."')) return false;
    const summer = JSON.parse(fs.readFileSync(path.join(root, 'dict', 'staging', 'out-summer-18131.json'), 'utf8'));
    // Bundle chunks keep `// packages/<pkg>/src/<path>` section headers; split on them.
    const model = /^\/\/ packages\/(agent|ai)\/src\/|^\/\/ packages\/coding-agent\/src\/(tools|commit|prompts|lsp|task|hub|advisor|session|mcp)\//;
    const sections = all.split(/\n(?=\/\/ packages\/)/).filter(s => model.test(s.slice(0, 160)));
    if (sections.length < 500) return false;
    return sections.every(sec => summer.every(e => !sec.includes(e.to)));
  })()],
  ['translation: help has CJK >= 2000', (() => {
    const r = execFileSync(exe, ['--help'], { encoding: 'utf8', timeout: 60000, windowsHide: true });
    return (r.match(/[\u4e00-\u9fff]/g) || []).length >= 2000;
  })()],
  ['translation: subcommands translated', (() => {
    const s = txt(3);
    return s.includes('语义搜索') && s.includes('交互式全屏 git 界面');
  })()],
  ['no corruption: removed-suffix artifacts', (() => {
    const s = txt(159);
    return !s.includes('移除d') && !/value: "移除"/.test(s);
  })()],
  ['runtime smoke: --version is omp/18.13.3', (() => {
    const r = execFileSync(exe, ['--version'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    return r.trim() === 'omp/18.13.3';
  })()]
  ,
  ['header keys stay ASCII and match upstream count (object-key gate)', (() => {
    const all = mods.map(m => m.contents.toString('utf8')).join('\n');
    // Object-key pollution: a quoted string holding a literal \uXXXX escape used as a
    // map key — delimited by { or , on the left, ':' on the right.
    const bad = all.match(/[{,]\s*["'][A-Za-z][A-Za-z -]*\\u[0-9a-fA-F]{4}[^"']*["']\s*:/g) || [];
    const ob = fs.readFileSync(official);
    const oP = parseExe(ob).bun, oDs = oP.rawPtr + 8;
    const oH = Number(BigInt(ob.readUInt32LE(oP.rawPtr)) | (BigInt(ob.readUInt32LE(oP.rawPtr + 4)) << 32n));
    const oO = oDs + oH - 16 - 32;
    const orig = readModules(ob, oDs, ob.readUInt32LE(oO + 8), ob.readUInt32LE(oO + 12)).map(m => m.contents.toString('utf8')).join('\n');
    const cc = (s) => (s.match(/"Cache-Control"\s*:/g) || []).length;
    return bad.length === 0 && cc(orig) > 0 && cc(all) === cc(orig);
  })()]
  ];
};
