// tools-verify-18131.js — omp-zh 18.13.1 验证套件
const fs = require('fs');
const { execSync } = require('child_process');
const { parseExe, readModules } = require('./rebuild.js');

const EXE = './work/omp-zh-18131.exe';
const buf = fs.readFileSync(EXE);
const { bun } = parseExe(buf);
const ds = bun.rawPtr + 8;
const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = ds + hdr - 16 - 32;
const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
const mods = readModules(buf, ds, modOff, modLen);

const dec = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const txt = (i) => dec(mods[i].contents.toString('utf8'));

const checks = [
  ['module count is 3466', mods.length === 3466],
  ['modLen matches 3466 * 52', modLen === 3466 * 52],
  ['argvStart points to omp/18.13.1', (() => {
    const argvOff = buf.readUInt32LE(O + 20), argvLen = buf.readUInt32LE(O + 24);
    return buf.slice(ds + argvOff, ds + argvOff + argvLen).toString('latin1') === '--user-agent=omp/18.13.1';
  })()],
  // Each patch: patched text present AND original text gone (no vacuous substring checks).
  ['patch compat: mod 22', txt(22).includes('supportsForcedToolChoice: false,') && !txt(22).includes('supportsForcedToolChoice: !t.requiresEnabledThinking')],
  ['patch stopcap: mod 331 le/de/ue/he raised', txt(331).includes('var le = 1000000;\nvar Be = 15000;\nvar de = 1000000;\nvar ue = 1000000;\nvar he = 1000000;')],
  ['patch sessionStop: mod 792 h0 raised', txt(792).includes('var h0 = 1000000;') && !txt(792).includes('var h0 = 8;')],
  ['patch yieldLadder: mod 792 vh raised', txt(792).includes('var vh = 1000000;') && !txt(792).includes('var vh = 3;')],
  ['patch tunnel: mod 105', txt(105).includes('stdout: r, stderr: r, cwd: t4(), windowsHide: true });')],
  ['patch ssh: mod 105', txt(105).includes('cwd: Se.homedir(), windowsHide: true });')],
  ['patch uploader: mod 105', txt(105).includes('cwd: t4(),\n          windowsHide: true\n        });\n        const U = await new Response(b.stderr)')],
  ['patch chrome: mod 360', txt(360).includes('stdin: "ignore",\n      windowsHide: true\n    });\n    a.unref();')],
  ['patch pythonKernel: mod 93 Eee returns true', txt(93).includes('function Eee(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}')],
  ['patch pythonKernelCall: mod 368', txt(368).includes('stderr: "pipe",\n      windowsHide: true\n    });\n    d.setProcess(a);') && !txt(368).includes('hostHasInheritableConsole: MT()')],
  ['patch pythonKernelCall: mod 814', txt(814).includes('detached: false,\n      windowsHide: true\n    });\n    const s = new Lse(') && !txt(814).includes('hostHasInheritableConsole: MT()')],
  ['patch encstale: mod 19', txt(19).includes('could not be (?:verified|decrypted|parsed)/i') && txt(19).includes('|encrypted content could not be decrypted/i;')],
  ['patch flush: mod 168 gate removed', !txt(168).includes('this.#t.size === 0 && this.#e.size === 0')],
  ['patch anchors: every original anchor text gone from product', (() => {
    const gone = [
      [331, 'var le = 3;\nvar Be = 15000;'], [105, 'cwd: t4() });'], [105, 'cwd: Se.homedir() });'],
      [105, 'cwd: t4()\n        });\n        const U = await new Response(b.stderr)'],
      [360, 'stdin: "ignore"\n    });\n    a.unref();'], [93, 'return !o.hostHasInheritableConsole;'],
      [19, 'not found\\.?/i, /previous'], [19, 'retention/i;']
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
    return txt(706).includes('startsWith("Retry budget exhausted")') && txt(1225).includes('["References", "External links", "See also"');
  })()],
  ['model-visible text: tool results stay English; summer entries never land in tool/agent/ai sources', (() => {
    const all = mods.map(m => dec(m.contents.toString('utf8'))).join('\n');
    if (!all.includes('.push("Remaining items: none.")') || all.includes('剩余条目：无。')) return false;
    if (!all.includes('"Todo list is empty." : "Todo list cleared."')) return false;
    const summer = JSON.parse(fs.readFileSync('./dict/staging/out-summer-18131.json', 'utf8'));
    // Bundle chunks keep `// packages/<pkg>/src/<path>` section headers; split on them.
    const model = /^\/\/ packages\/(agent|ai)\/src\/|^\/\/ packages\/coding-agent\/src\/(tools|commit|prompts|lsp|task|hub|advisor|session|mcp)\//;
    const sections = all.split(/\n(?=\/\/ packages\/)/).filter(s => model.test(s.slice(0, 160)));
    if (sections.length < 500) return false;
    return sections.every(sec => summer.every(e => !sec.includes(e.to)));
  })()],
  ['translation: help has CJK >= 2000', (() => {
    const r = execSync('work\\\\omp-zh-18131.exe --help', { encoding: 'utf8', timeout: 60000 });
    return (r.match(/[\u4e00-\u9fff]/g) || []).length >= 2000;
  })()],
  ['translation: subcommands translated', (() => {
    const s = txt(3);
    return s.includes('语义搜索') && s.includes('交互式全屏 git 界面');
  })()],
  ['no corruption: removed-suffix artifacts', (() => {
    const s = txt(168);
    return !s.includes('移除d') && !/value: "移除"/.test(s);
  })()],
  ['runtime smoke: --version is omp/18.13.1', (() => {
    const r = execSync('work\\\\omp-zh-18131.exe --version', { encoding: 'utf8', timeout: 30000 });
    return r.trim() === 'omp/18.13.1';
  })()]
  ,
  ['header keys stay ASCII and match upstream count (object-key gate)', (() => {
    const all = mods.map(m => m.contents.toString('utf8')).join('\n');
    // Object-key pollution: a quoted string holding a literal \uXXXX escape used as a
    // map key — delimited by { or , on the left, ':' on the right.
    const bad = all.match(/[{,]\s*["'][A-Za-z][A-Za-z -]*\\u[0-9a-fA-F]{4}[^"']*["']\s*:/g) || [];
    const ob = fs.readFileSync('./work/omp-dl-18131.exe');
    const oP = parseExe(ob).bun, oDs = oP.rawPtr + 8;
    const oH = Number(BigInt(ob.readUInt32LE(oP.rawPtr)) | (BigInt(ob.readUInt32LE(oP.rawPtr + 4)) << 32n));
    const oO = oDs + oH - 16 - 32;
    const orig = readModules(ob, oDs, ob.readUInt32LE(oO + 8), ob.readUInt32LE(oO + 12)).map(m => m.contents.toString('utf8')).join('\n');
    const cc = (s) => (s.match(/"Cache-Control"\s*:/g) || []).length;
    return bad.length === 0 && cc(orig) > 0 && cc(all) === cc(orig);
  })()]
];

let fail = 0;
checks.forEach(([name, pass]) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name);
  if (!pass) fail++;
});
console.log(fail === 0 ? 'ALL ' + checks.length + ' VERIFICATIONS PASS' : 'FAILURES: ' + fail);
if (fail > 0) process.exit(1);
