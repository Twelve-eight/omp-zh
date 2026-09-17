// 生成并校验 18.2.4 补丁规则(避免展开语法折叠)
const fs = require('fs');
const D3 = String.fromCharCode(46, 46, 46);
const d = fs.readFileSync('G:/omp works/Tools/omp-zh/work/cli-18_2_4.js', 'utf8');

const rules = {
  stopcap: [
    { name: 'empty/unexpected/malformed stop retries (18.2.4)', expect: 1,
      find: 'kLn = 3, KGa = 4000, bLn = 3, SLn = 3, VGa = 1000,',
      repl: 'kLn = 1000000, KGa = 4000, bLn = 1000000, SLn = 1000000, VGa = 1000,',
      done: 'kLn = 1000000, KGa = 4000, bLn = 1000000, SLn = 1000000' },
    { name: 'session-stop continuation cap (18.2.4)', expect: 1,
      find: 'XLn = 8, b3a = 3, w_s = 5000, S3a = 3,',
      repl: 'XLn = 1000000, b3a = 3, w_s = 5000, S3a = 3,',
      done: 'XLn = 1000000' },
    { name: 'subagent yield ladder (18.2.4)', expect: 1,
      find: 'Vba = 6, Hwt = 3;', repl: 'Vba = 6, Hwt = 1000000;', done: 'Hwt = 1000000' },
  ],
  leak: [
    { name: 'blob-broker tunnel (18.2.4)', expect: 1,
      find: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: n, stderr: n, cwd: p6() })',
      repl: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: n, stderr: n, cwd: p6(), windowsHide: true })',
      done: 'cwd: p6(), windowsHide: true })' },
    { name: 'blob-broker ssh tunnel (18.2.4)', expect: 1,
      find: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: t0t.homedir() })',
      repl: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: t0t.homedir(), windowsHide: true })',
      done: 'cwd: t0t.homedir(), windowsHide: true })' },
    { name: 'uploader self-hosted (18.2.4)', expect: 1,
      find: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: p6()\n        })',
      repl: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: p6(),\n          windowsHide: true\n        })',
      done: 'cwd: p6(),\n          windowsHide: true' },
    { name: 'browser chrome launch (18.2.4)', expect: 1,
      find: 'const d = Bun.spawn([s, ' + D3 + 'c], {\n      cwd: t.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    })',
      repl: 'const d = Bun.spawn([s, ' + D3 + 'c], {\n      cwd: t.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    })',
      done: 'stdin: "ignore",\n      windowsHide: true\n    })' },
    { name: 'python kernel windowsHide force-true (18.2.4)', expect: 1,
      find: 'windowsHide: vJt({\n          platform: "win32",\n          hostHasInheritableConsole: kD()\n        })',
      repl: 'windowsHide: true',
      done: 'windowsHide: true\n      });' },
    { name: 'python kernel console probe force-true (18.2.4)', expect: 1,
      find: 'function vJt(e) {\n  if (e.platform !== "win32")\n    return false;\n  return !e.hostHasInheritableConsole;\n}',
      repl: 'function vJt(e) {\n  if (e.platform !== "win32")\n    return false;\n  return true;\n}',
      done: 'return true;\n}' },
  ],
  replay: [
    { name: 'retryRecovery replay (18.2.4)', expect: 1,
      find: '    this.#o = xe.get("display.showTokenUsage") && MZ(e.usage) ? e.usage : undefined;\n    this.#n = e.duration;\n    this.#r = e.ttft;\n    this.#i = e.timestamp;\n    this.#a = this.#o ? LF(e) : undefined;\n    this.#u = this.#o && xe.get("display.showTurnTime") ? this.#k(e) : undefined;\n  }',
      repl: '    this.#o = xe.get("display.showTokenUsage") && MZ(e.usage) ? e.usage : undefined;\n    this.#n = e.duration;\n    this.#r = e.ttft;\n    this.#i = e.timestamp;\n    this.#a = this.#o ? LF(e) : undefined;\n    this.#u = this.#o && xe.get("display.showTurnTime") ? this.#k(e) : undefined;\n    if (e.retryRecovery)\n      this.applyRetryRecovery(e.retryRecovery);\n  }',
      done: 'this.applyRetryRecovery' },
    { name: 'tail usage flush (18.2.4)', expect: 2,
      find: 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#S();', repl: 'this.#S();',
      done: 'for (const t of e)\n      this.#y(t);\n    this.#S();' },
  ],
  encstale: [
    { name: 'uQs[0] += encrypted-content-verify (18.2.4)', expect: 1,
      find: "uQs = [/\\bItem with id ['\"][^'\"]+['\"] not found\\.?/i, /previous[ _]?response/i];",
      repl: "uQs = [/\\bItem with id ['\"][^'\"]+['\"] not found\\.?|\\bencrypted content\\b[^.'\"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];",
      done: 'encrypted content' },
    { name: 'J0r += encrypted-content-decrypt (18.2.4)', expect: 1,
      find: 'J0r = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;',
      repl: 'J0r = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;',
      done: 'encrypted content could not be decrypted' },
    { name: 'QLt bKe replay gate (18.2.4)', expect: 1,
      find: 'const g = IQe(e.supportsComputerUse === true ? c : i8r(c), e, i, l, !m, a, false, true, undefined, u);',
      restore: 'const g = IQe(e.supportsComputerUse === true ? c : i8r(c), e, i, l, !m && e.compat?.replayResponsesReasoning !== false, a, false, true, undefined, u);',
      repl: 'const g = IQe(e.supportsComputerUse === true ? c : i8r(c), e, i, l, !m && process.env.OMP_NO_REPLAY_REASONING !== "1" && e.compat?.replayResponsesReasoning !== false, a, false, true, undefined, u);',
      done: '!m && process.env.OMP_NO_REPLAY_REASONING !== "1"' },
    { name: 'Xni replacement-history prepend filter (18.2.4)', expect: 1,
      find: 'return Iie(s ? [' + D3 + 's, ' + D3 + 'n] : n);',
      restore: 'return Iie(s ? (t.compat?.replayResponsesReasoning === false ? s.filter((Z) => Z?.type !== "reasoning") : s).concat(n) : n);',
      repl: 'return Iie(s ? (process.env.OMP_NO_REPLAY_REASONING === "1" || t.compat?.replayResponsesReasoning === false ? s.filter((Z) => Z?.type !== "reasoning") : s).concat(n) : n);',
      done: '"1" || t.compat?.replayResponsesReasoning === false ? s.filter' },
    { name: 'Mbe stored-items prepend filter (18.2.4)', expect: 1,
      find: '  const i = {\n    model: e.requestModelId ?? e.id,\n    input: n?.length ? [' + D3 + 'n, ' + D3 + 'r] : r,\n    stream: true,\n    prompt_cache_key: o\n  };',
      restore: '  const i = {\n    model: e.requestModelId ?? e.id,\n    input: n?.length ? (e.compat?.replayResponsesReasoning === false ? n.filter((Z) => Z?.type !== "reasoning") : n).concat(r) : r,\n    stream: true,\n    prompt_cache_key: o\n  };',
      repl: '  const i = {\n    model: e.requestModelId ?? e.id,\n    input: n?.length ? (process.env.OMP_NO_REPLAY_REASONING === "1" || e.compat?.replayResponsesReasoning === false ? n.filter((Z) => Z?.type !== "reasoning") : n).concat(r) : r,\n    stream: true,\n    prompt_cache_key: o\n  };',
      done: '"1" || e.compat?.replayResponsesReasoning === false ? n.filter' },
  ],
};

let bad = 0;
for (const [g, arr] of Object.entries(rules)) {
  for (const r of arr) {
    const c = d.split(r.find).length - 1;
    if (c !== r.expect) { bad++; console.log('MISS [' + g + '] ' + r.name + ' found=' + c + ' expect=' + r.expect); }
    else console.log('OK   [' + g + '] ' + r.name);
  }
}
console.log(bad === 0 ? 'ALL 18.2.4 RULES VERIFIED' : 'FAILURES: ' + bad);
if (bad === 0) fs.writeFileSync('G:/omp works/Tools/omp-zh/work/rules-1824.json', JSON.stringify(rules, null, 1));
