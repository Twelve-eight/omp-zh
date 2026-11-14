// Verification checks for the omp v18.20.0 localized build.
// Run through verify.js: node verify.js 18.20.0 [--exe <localized.exe>] [--official <official.exe>]
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
  ['module count is 3747', mods.length === 3747],
  ['modLen matches 3747 * 52', modLen === 3747 * 52],
  ['argvStart points to omp/18.20.0', (() => {
    const argvOff = buf.readUInt32LE(O + 20), argvLen = buf.readUInt32LE(O + 24);
    return buf.slice(ds + argvOff, ds + argvOff + argvLen).toString('latin1') === '--user-agent=omp/18.20.0';
  })()],
  // Each patch: patched text present AND original text gone (no vacuous substring checks).
  ['patch compat: mod 49', txt(49).includes('supportsForcedToolChoice: false,') && !txt(49).includes('supportsForcedToolChoice: !t.requiresEnabledThinking')],
  ['patch emptystop: mod 49 drops empty stop turns', txt(49).includes('|| Array.isArray(e.content) && e.content.length === 0 && e.stopReason === "stop";')],
  ['patch emptystop: behavior (empty stop dropped, thinking-only stop kept)', (() => {
    const src = txt(49).match(/function FY\(e\) \{[\s\S]*?\n\}/);
    if (!src) return false;
    const K7 = new Function(src[0] + '; return FY;')();
    return K7({ stopReason: 'stop', content: [] }) === true
      && K7({ stopReason: 'stop', content: [{ type: 'thinking', thinking: 'x' }] }) === false
      && K7({ stopReason: 'stop', content: [{ type: 'text', text: 'hi' }] }) === false
      && K7({ stopReason: 'stop', content: [{ type: 'toolCall', name: 'read' }] }) === false
      && K7({ stopReason: 'error', content: [] }) === true
      && K7({ stopReason: 'toolUse', content: [] }) === false
      && K7({ stopReason: 'stop', content: null }) === false
      && K7({ stopReason: 'stop' }) === false;
  })()],
  ['patch stopcap: mod 332 se/ie/ne/oe raised', txt(332).includes('var se = 1000000;\nvar Ae = 15000;\nvar ie = 1000000;\nvar ne = 1000000;\nvar oe = 1000000;')],
  ['patch sessionStop: mod 475 $x raised', txt(475).includes('var $x = 1000000;') && !txt(475).includes('var $x = 8;')],
  ['patch yieldLadder: mod 475 Ic raised', txt(475).includes('var Ic = 1000000;') && !txt(475).includes('var Ic = 3;')],
  ['patch tunnel: mod 43', txt(43).includes('stdout: r, stderr: r, cwd: R$(), windowsHide: true });')],
  ['patch ssh: mod 43', txt(43).includes('cwd: Se.homedir(), windowsHide: true });')],
  ['patch uploader: mod 43', txt(43).includes('cwd: R$(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr)')],
  ['patch chrome: mod 1184 launcher spawn hides the console window', txt(1184).includes('stdio: t,\n      windowsHide: true\n    });')],
  ['patch pythonKernel: mod 25 Ose returns true', txt(25).includes('function Ose(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}')],
  ['patch encstale: mod 46', txt(46).includes('could not be (?:verified|decrypted|parsed)/i') && txt(46).includes('|encrypted content could not be decrypted/i;')],
  ['patch encstale: real gateway error now matches', (() => {
    const fe = txt(46).match(/var _e = \[(\/.+?\/i), \/previous/);
    if (!fe) return false;
    const re = new Function('return ' + fe[1])();
    return re.test("The encrypted content gAAAAB.x9Q-_z could not be verified.") && !re.test('Rate limit reached for requests');
  })()],
  ['patch flush: mod 127 gate removed', !txt(127).includes('this.#t.size === 0 && this.#e.size === 0')],
  ['model-visible: codex web-search system prompt stays English', (() => {
    // A `sub` dictionary entry rewrites every literal containing its text, so a short entry such as
    // "Search the web" leaked Chinese into this prompt (fixed 2026-11-14). Keep this guard.
    const s = txt(1153);
    const i = s.indexOf('You are a helpful assistant with web search capabilities.');
    return i >= 0 && !/[\u4e00-\u9fff]/.test(s.slice(i, i + 200));
  })()],
  ['patch floor: mod 61 floor arm skips Claude thinking text', txt(61).includes('if (!t || x)\n              s.push(R.thinking);')],
  // Line-anchored form of the same patch: the guard sits on a 12-space line and the push moved to
  // 14 spaces. A mis-patch that inserts the guard but leaves the old unconditional push behind would
  // still contain the substring above, so count the lines themselves.
  ['patch floor: exactly one guarded push, no unguarded push left', (() => {
    const lines = txt(61).split('\n');
    const guarded = lines.filter((l) => l === '              s.push(R.thinking);').length;
    const bare = lines.filter((l) => l === '            s.push(R.thinking);').length;
    const guard = lines.filter((l) => l === '            if (!t || x)').length;
    return guarded === 1 && bare === 0 && guard === 1;
  })()],
  ['patch anchors: every original anchor text gone from product', (() => {
    const gone = [
      [332, 'var se = 3;\nvar Ae = 15000;'], [43, 'cwd: R$() });'], [43, 'cwd: Se.homedir() });'],
      [43, 'cwd: R$()\n        });\n        const U = await new Response(g.stderr)'],
      [25, 'return !o.hostHasInheritableConsole;'],
      [1184, 'env: r,\n      stdio: t\n    });'],
      [46, 'not found\\.?/i, /previous'], [46, 'retention/i;'],
      [61, 'continue;\n            s.push(R.thinking);\n            if (R.thinkingSignature']
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
    return txt(882).includes('startsWith("Retry budget exhausted")') && txt(1292).includes('["References", "External links", "See also"');
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
  ['18.16.0 additions translated (Mistral sign-in, /btw steering, Hindsight scope)', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return ['Mistral 登录失败/Mistral sign-in failed', '正在等待 Mistral 登录完成…/Waiting for Mistral sign-in to complete...',
      '/btw 引导注入/btw Steering Inject', '注入主会话/Inject into main session', 'Hindsight 全局作用域/Hindsight Global Scope',
      '没有可恢复的内容/Nothing to resume']
      .every(t => all.includes('"' + t + '"'));
  })()],
  ['18.20.0 additions translated (auto-update, motion/fps, shell viz, worker threads)', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return ['自动更新/Auto Update', '最大帧率/Max Frames Per Second', 'Shell 可视化/Shell Visualization',
      '子代理工作线程/Subagent Worker Threads', '提示词缓存/Prompt Cache', '自动更新：已停止/auto-update: stopped']
      .every(t => all.includes('"' + t + '"'));
  })()],
  ['model-visible text: tool results stay English; summer entries never land in tool/agent/ai sources', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    if (!all.includes('.push("Remaining items: none.")') || all.includes('剩余条目：无。')) return false;
    if (!all.includes('"Todo list is empty." : "Todo list cleared."')) return false;
    if (!all.includes('auto-selected after timeout \u2014 not a user choice')) return false;
    const summer = JSON.parse(fs.readFileSync(path.join(root, 'dict', 'staging', 'out-summer-18131.json'), 'utf8'));
    // Bundle chunks keep `// packages/<pkg>/src/<path>` section headers; split on them.
    const model = /^\/\/ packages\/(agent|ai)\/src\/|^\/\/ packages\/coding-agent\/src\/(tools|commit|prompts|lsp|task|hub|advisor|session|mcp)\//;
    const sections = all.split(/\n(?=\/\/ packages\/)/).filter(s => model.test(s.slice(0, 160)));
    if (sections.length < 500) return false;
    return sections.every(sec => summer.every(e => !sec.includes(e.to)));
  })()],
  ['translation: help has CJK >= 2000', (() => {
    const r = execFileSync(exe, ['--help'], { encoding: 'utf8', timeout: 60000, windowsHide: true });
    return (r.match(/[\u4e00-\u9fff]/g) || []).length >= 2000 && r.includes('用法/USAGE') && r.includes('内置工具（--tools 接受的名称）') && r.includes('# 默认启用');
  })()],
  ['translation: subcommands translated', (() => {
    const s = txt(3);
    return s.includes('语义搜索') && s.includes('交互式全屏 git 界面');
  })()],
  ['no corruption: removed-suffix artifacts', (() => {
    const s = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return !s.includes('移除d') && !/value: "移除"/.test(s);
  })()],
  ['runtime smoke: --version is omp/18.20.0', (() => {
    const r = execFileSync(exe, ['--version'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    return r.trim() === 'omp/18.20.0';
  })()]
  ,
  ['code value: AWS XML tag name stays English', (() => {
    const s = txt(49);
    return /\w\(\w+, "Message"\)/.test(s) && !s.includes('消息/Message');
  })()],
  ['code value: compaction read/write markers stay English', (() => {
    const s = txt(61);
    return s.includes('.set(c, "Read")') && s.includes('"RW" : "Write"') && !s.includes('读取/Read') && !s.includes('写入/Write');
  })()],
  ['code value: no CJK in key/code/type/id fields', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    return !/(?:^|[{,])\s*(?:key|code|type|id|role):\s*"[^"\n]*[\u4e00-\u9fff]/.test(all);
  })()],
  ['code value: puppeteer keyboard layout stays ASCII', (() => {
    const s = txt(1184);
    return s.includes('Power: { key: "Power", code: "Power" }');
  })()],
  ['code value: changelog section headings stay English', (() => {
    const s = txt(663);
    return s.includes('"Breaking Changes"') && s.includes('"Security"') && !s.includes('安全/Security');
  })()],
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
