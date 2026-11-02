// Verification checks for the omp v18.15.0 localized build.
// Run through verify.js: node verify.js 18.15.0 [--exe <localized.exe>] [--official <official.exe>]
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
  ['module count is 3570', mods.length === 3570],
  ['modLen matches 3570 * 52', modLen === 3570 * 52],
  ['argvStart points to omp/18.15.0', (() => {
    const argvOff = buf.readUInt32LE(O + 20), argvLen = buf.readUInt32LE(O + 24);
    return buf.slice(ds + argvOff, ds + argvOff + argvLen).toString('latin1') === '--user-agent=omp/18.15.0';
  })()],
  // Each patch: patched text present AND original text gone (no vacuous substring checks).
  ['patch compat: mod 47', txt(47).includes('supportsForcedToolChoice: false,') && !txt(47).includes('supportsForcedToolChoice: !t.requiresEnabledThinking')],
  ['patch emptystop: mod 47 drops empty stop turns', txt(47).includes('|| e.stopReason === "stop";\n  return t && !e.content.some')],
  ['patch emptystop: behavior (empty stop dropped, textual stop kept)', (() => {
    const src = txt(47).match(/function K7\(e\) \{[\s\S]*?\n\}/);
    if (!src) return false;
    const K7 = new Function(src[0] + '; return K7;')();
    return K7({ stopReason: 'stop', content: [] }) === true
      && K7({ stopReason: 'stop', content: [{ type: 'text', text: 'hi' }] }) === false
      && K7({ stopReason: 'stop', content: [{ type: 'toolCall', name: 'read' }] }) === false
      && K7({ stopReason: 'error', content: [] }) === true
      && K7({ stopReason: 'toolUse', content: [] }) === false;
  })()],
  ['patch stopcap: mod 415 ee/te/re/se raised', txt(415).includes('var ee = 1000000;\nvar ye = 15000;\nvar te = 1000000;\nvar re = 1000000;\nvar se = 1000000;')],
  ['patch sessionStop: mod 557 hm raised', txt(557).includes('var hm = 1000000;') && !txt(557).includes('var hm = 8;')],
  ['patch yieldLadder: mod 557 Er raised', txt(557).includes('var Er = 1000000;') && !txt(557).includes('var Er = 3;')],
  ['patch tunnel: mod 40', txt(40).includes('stdout: r, stderr: r, cwd: fj(), windowsHide: true });')],
  ['patch ssh: mod 40', txt(40).includes('cwd: Se.homedir(), windowsHide: true });')],
  ['patch uploader: mod 40', txt(40).includes('cwd: fj(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr)')],
  ['patch chrome: mod 350', txt(350).includes('stdin: "ignore",\n      windowsHide: true\n    });\n    a.unref();')],
  ['patch pythonKernel: mod 23 Mne returns true', txt(23).includes('function Mne(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}')],
  ['patch encstale: mod 44', txt(44).includes('could not be (?:verified|decrypted|parsed)/i') && txt(44).includes('|encrypted content could not be decrypted/i;')],
  ['patch encstale: real gateway error now matches', (() => {
    const fe = txt(44).match(/var fe = \[(\/.+?\/i), \/previous/);
    if (!fe) return false;
    const re = new Function('return ' + fe[1])();
    return re.test("The encrypted content gAAAAB.x9Q-_z could not be verified.") && !re.test('Rate limit reached for requests');
  })()],
  ['patch flush: mod 156 gate removed', !txt(156).includes('this.#t.size === 0 && this.#e.size === 0')],
  ['patch floor: mod 59 floor arm skips Claude thinking text', txt(59).includes('if (!t || x)\n              r.push(M.thinking);')],
  ['patch anchors: every original anchor text gone from product', (() => {
    const gone = [
      [415, 'var ee = 3;\nvar ye = 15000;'], [40, 'cwd: fj() });'], [40, 'cwd: Se.homedir() });'],
      [40, 'cwd: fj()\n        });\n        const U = await new Response(g.stderr)'],
      [350, 'stdin: "ignore"\n    });\n    a.unref();'], [23, 'return !o.hostHasInheritableConsole;'],
      [44, 'not found\\.?/i, /previous'], [44, 'retention/i;'], [59, 'continue;\n            r.push(M.thinking);\n            if (M.thinkingSignature']
    ];
    return gone.every(([i, t]) => !txt(i).includes(t));
  })()],
  ['gate: enum index keys stay English', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return /\b\w\["Low"\] = "low"/.test(all) && /\b\w\["Browser"\] = "browser"/.test(all) && /\b\w\["Disabled"\] = "disabled"/.test(all);
  })()],
  ['gate: ternary branch and array element values still translated', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return /\? "[^"]*\/Monthly" :/.test(all) && !/\? "Monthly" :/.test(all) && /\["[^"]*\/Submit", /.test(all) && !/\["Submit", /.test(all);
  })()],
  ['gate: string-match args and membership arrays stay English', (() => {
    return txt(808).includes('startsWith("Retry budget exhausted")') && txt(1266).includes('["References", "External links", "See also"');
  })()],
  ['18.13.3 and 18.14.0 additions translated (settings, setup wizard, prewalk, extension links)', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return ['扩展模式控制/Extension Mode Control', '恢复会话的工作树范围/Resume Worktree Scope', '速率限制时沿回退链切换/Rate Limit Walks Chain',
      '助手思考/Assistant Thinking', '自动压缩缓冲/Auto-Compact Buffer', '恢复标注草稿/Resume an annotation draft', '重命名会话/Rename Session',
      '扩展回复渲染器/Extension Reply Renderers', '预检目标/Prewalk target', '设为默认/Set as default', '退出设置/Exit setup', '有可用更新/Update available']
      .every(t => all.includes('"' + t + '"'));
  })()],
  ['18.15.0 additions translated (per-call model, title refresh, job captions, session lease)', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return ['单次调用模型/Per-Call Model', '单次调用模型白名单/Per-Call Model Allowlist', '提示词后刷新标题/Refresh Title After Prompts',
      '每 5 条提示词/Every 5 prompts', '作业标题生成失败/Job caption failed', '没有可提交的更改/Nothing to commit',
      '启用极速（OpenAI API，或提供该能力的 Codex 与中转模型）/Enable Ultrafast (OpenAI API, or Codex and relay models that offer it)']
      .every(t => all.includes('"' + t + '"'));
  })()],
  ['model-visible text: tool results stay English; summer entries never land in tool/agent/ai sources', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    if (!all.includes('.push("Remaining items: none.")') || all.includes('剩余条目：无。')) return false;
    if (!all.includes('"Todo list is empty." : "Todo list cleared."')) return false;
    if (!all.includes('" (auto-selected after timeout)"')) return false;
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
    const s = txt(1);
    return s.includes('语义搜索') && s.includes('交互式全屏 git 界面');
  })()],
  ['no corruption: removed-suffix artifacts', (() => {
    const s = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return !s.includes('移除d') && !/value: "移除"/.test(s);
  })()],
  ['runtime smoke: --version is omp/18.15.0', (() => {
    const r = execFileSync(exe, ['--version'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    return r.trim() === 'omp/18.15.0';
  })()]
  ,
  ['vendored axe bundle is byte-identical to upstream', (() => {
    const ob = fs.readFileSync(official);
    const oP = parseExe(ob).bun, oDs = oP.rawPtr + 8;
    const oH = Number(BigInt(ob.readUInt32LE(oP.rawPtr)) | (BigInt(ob.readUInt32LE(oP.rawPtr + 4)) << 32n));
    const oO = oDs + oH - 16 - 32;
    const orig = readModules(ob, oDs, ob.readUInt32LE(oO + 8), ob.readUInt32LE(oO + 12));
    const i = orig.findIndex((m) => m.contents.toString('latin1').includes('axe.min'));
    return i >= 0 && orig[i].contents.equals(mods[i].contents);
  })()],
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
