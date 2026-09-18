// 生成并校验 18.2.6 补丁规则(避免展开语法折叠)
const fs = require('fs');
const D3 = String.fromCharCode(46, 46, 46);
const d = fs.readFileSync('G:/omp works/Tools/omp-zh/work/cli-18_2_6.js', 'utf8');

const rules = {
  stopcap: [
    { name: 'empty/unexpected/malformed stop retries (18.2.6)', expect: 1,
      find: 'iIn = 3, uqa = 4000, aIn = 3, lIn = 3, pqa = 1000,',
      repl: 'iIn = 1000000, uqa = 4000, aIn = 1000000, lIn = 1000000, pqa = 1000,',
      done: 'iIn = 1000000, uqa = 4000, aIn = 1000000, lIn = 1000000' },
    { name: 'session-stop continuation cap (18.2.6)', expect: 1,
      find: 'qIn = 8, Gqa = 3, qMs = 5000, zqa = 3,',
      repl: 'qIn = 1000000, Gqa = 3, qMs = 5000, zqa = 3,',
      done: 'qIn = 1000000' },
    { name: 'subagent yield ladder (18.2.6)', expect: 1,
      find: 'XIa = 6, dbt = 3;', repl: 'XIa = 6, dbt = 1000000;', done: 'dbt = 1000000' },
  ],
  leak: [
    { name: 'blob-broker tunnel (18.2.6)', expect: 1,
      find: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: n, stderr: n, cwd: Q6() })',
      repl: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: n, stderr: n, cwd: Q6(), windowsHide: true })',
      done: 'cwd: Q6(), windowsHide: true })' },
    { name: 'blob-broker ssh tunnel (18.2.6)', expect: 1,
      find: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: NIt.homedir() })',
      repl: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: t0t.homedir(), windowsHide: true })',
      done: 'cwd: t0t.homedir(), windowsHide: true })' },
    { name: 'uploader self-hosted (18.2.6)', expect: 1,
      find: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: Q6()\n        })',
      repl: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: Q6(),\n          windowsHide: true\n        })',
      done: 'cwd: Q6(),\n          windowsHide: true' },
    { name: 'browser chrome launch (18.2.6)', expect: 1,
      find: 'const d = Bun.spawn([s, ' + D3 + 'c], {\n      cwd: t.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    })',
      repl: 'const d = Bun.spawn([s, ' + D3 + 'c], {\n      cwd: t.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    })',
      done: 'stdin: "ignore",\n      windowsHide: true\n    })' },
    { name: 'python kernel windowsHide force-true (18.2.6)', expect: 1,
      find: 'windowsHide: Zts({\n          platform: "win32",\n          hostHasInheritableConsole: IW()\n        })',
      repl: 'windowsHide: true',
      done: 'windowsHide: true\n      });' },
    { name: 'python kernel console probe force-true (18.2.6)', expect: 1,
      find: 'function Zts(e) {\n  if (e.platform !== "win32")\n    return false;\n  return !e.hostHasInheritableConsole;\n}',
      repl: 'function vJt(e) {\n  if (e.platform !== "win32")\n    return false;\n  return true;\n}',
      done: 'return true;\n}' },
  ],
  replay: [
    { name: 'tail usage flush (18.2.6)', expect: 2,
      find: 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#x();', repl: 'this.#x();',
      done: 'for (const t of e)\n      this.#R(t);\n    this.#x();' },
  ],
  encstale: [
    { name: 'nso[0] += encrypted-content-verify (18.2.6)', expect: 1,
      find: "nso = [/\\bItem with id ['\"][^'\"]+['\"] not found\\.?/i, /previous[ _]?response/i];",
      repl: "uQs = [/\\bItem with id ['\"][^'\"]+['\"] not found\\.?|\\bencrypted content\\b[^.'\"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];",
      done: 'encrypted content' },
    { name: 'Z1r += encrypted-content-decrypt (18.2.6)', expect: 1,
      find: 'Z1r = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;',
      repl: 'J0r = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;',
      done: 'encrypted content could not be decrypted' },
    { name: 'QLt bKe replay gate (18.2.6)', expect: 1,
      find: 'const g = GXe(e.supportsComputerUse === true ? c : Jni(c), e, i, l, !m, a, false, true, undefined, u);',
      restore: 'const g = GXe(e.supportsComputerUse === true ? c : Jni(c), e, i, l, !m && e.compat?.replayResponsesReasoning !== false, a, false, true, undefined, u);',
      repl: 'const g = IQe(e.supportsComputerUse === true ? c : i8r(c), e, i, l, !m && process.env.OMP_NO_REPLAY_REASONING !== "1" && e.compat?.replayResponsesReasoning !== false, a, false, true, undefined, u);',
      done: '!m && process.env.OMP_NO_REPLAY_REASONING !== "1"' },
    { name: 'Xni replacement-history prepend filter (18.2.6)', expect: 1,
      find: 'return Uie(s ? [' + D3 + 's, ' + D3 + 'n] : n);',
      restore: 'return Iie(s ? (t.compat?.replayResponsesReasoning === false ? s.filter((Z) => Z?.type !== "reasoning") : s).concat(n) : n);',
      repl: 'return Iie(s ? (process.env.OMP_NO_REPLAY_REASONING === "1" || t.compat?.replayResponsesReasoning === false ? s.filter((Z) => Z?.type !== "reasoning") : s).concat(n) : n);',
      done: '"1" || t.compat?.replayResponsesReasoning === false ? s.filter' },
    { name: 'Mbe stored-items prepend filter (18.2.6)', expect: 1,
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
console.log(bad === 0 ? 'ALL 18.2.6 RULES VERIFIED' : 'FAILURES: ' + bad);
if (bad === 0) fs.writeFileSync('G:/omp works/Tools/omp-zh/work/rules-1826.json', JSON.stringify(rules, null, 1));
