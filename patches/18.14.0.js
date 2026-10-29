// Behavior patches for upstream omp v18.14.0 (commit 31147f9d1a, 3557 modules).
//
// Keys are module indexes in the Bun standalone module table; each function receives the module's
// JS source and returns the patched source. Every anchor is asserted with an exact occurrence
// count before replacement, so a drifted anchor fails the build instead of silently shipping an
// unpatched binary. What each patch does and why: docs/patches.md.
//
// Minified names were located in this release's modules by source semantics (use sites), not
// carried over from 18.13.3:
//   P2 mod 413 turn-recovery.ts: Z/ee/te/re = UNEXPECTED_STOP / EMPTY_STOP / MALFORMED_FUNCTION_CALL
//      / STREAM_STALL_CONTINUE _MAX_RETRIES (`#i > Z`, `#c > ee`, `maxRetries: te`, `maxRetries: re`).
//   P3 mod 553 agent-session.ts: sm = SESSION_STOP_CONTINUATION_CAP (`this.#us >= sm`,
//      "session_stop continuation cap reached"). `var rE = 8;` in the same module is the vibe
//      slice length and must stay untouched.
//   P4 mod 553 task/executor.ts: kr = MAX_YIELD_RETRIES (`!s.yieldCalled() && H < kr`).
'use strict';

function replaceExact(s, mod, label, find, repl, count = 1) {
  const n = s.split(find).length - 1;
  if (n !== count) throw new Error(`mod ${mod} ${label}: anchor found ${n} times (expected ${count})`);
  return s.split(find).join(repl);
}

module.exports = {
  version: '18.14.0',
  moduleCount: 3557,
  patches: {
    // P1 compat (catalog/src/compat/resolve.ts)
    33: (s) => replaceExact(s, 33, 'compat',
      'supportsForcedToolChoice: !t.requiresEnabledThinking && !(t.isOpenCodeHost && t.isDeepseekReasoning),',
      'supportsForcedToolChoice: false,'),

    // P2 stopcap (coding-agent/src/session/turn-recovery.ts)
    413: (s) => replaceExact(s, 413, 'stopcap cluster',
      'var Z = 3;\nvar me = 15000;\nvar ee = 3;\nvar te = 3;\nvar re = 3;',
      'var Z = 1000000;\nvar me = 15000;\nvar ee = 1000000;\nvar te = 1000000;\nvar re = 1000000;'),

    // P3 sessionStop + P4 yieldLadder (agent-session.ts, task/executor.ts)
    553: (s) => {
      s = replaceExact(s, 553, 'sessionStop sm', 'var sm = 8;', 'var sm = 1000000;');
      return replaceExact(s, 553, 'yieldLadder kr', 'var kr = 3;', 'var kr = 1000000;');
    },

    // P5 tunnel + ssh + uploader (blob-broker/exposure.ts, uploaders-self-hosted.ts)
    68: (s) => {
      s = replaceExact(s, 68, 'tunnel',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: j3() });',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: j3(), windowsHide: true });');
      s = replaceExact(s, 68, 'ssh', 'cwd: Se.homedir() });', 'cwd: Se.homedir(), windowsHide: true });');
      return replaceExact(s, 68, 'uploader',
        'cwd: j3()\n        });\n        const U = await new Response(g.stderr)',
        'cwd: j3(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr)');
    },

    // P6 chrome (tools/browser/registry.ts)
    349: (s) => replaceExact(s, 349, 'chrome',
      'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    });',
      'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });'),

    // P7 pythonKernel helper (eval/py/spawn-options.ts) and its call sites (eval/py/kernel.ts, ida/supervisor.ts)
    56: (s) => replaceExact(s, 56, 'pythonKernel',
      'function Yte(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}',
      'function Yte(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}'),
    302: (s) => replaceExact(s, 302, 'pythonKernelCall',
      'Yte({\n        platform: "win32",\n        hostHasInheritableConsole: xT()\n      })', 'true'),
    573: (s) => replaceExact(s, 573, 'pythonKernelCall',
      'Yte({\n        platform: "win32",\n        hostHasInheritableConsole: xT()\n      })', 'true'),

    // P8 encstale (ai/src/error/flags.ts)
    30: (s) => {
      s = replaceExact(s, 30, 'encstale fe',
        'var fe = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?/i, /previous[ _]?response/i];',
        'var fe = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?|\\bencrypted content\\b[^\'"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];');
      return replaceExact(s, 30, 'encstale Xt',
        'var Xt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;',
        'var Xt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;');
    },

    // P10 floor (agent/src/tokenizer.ts #measureMessage): the compaction floor arm
    // (t = excludeEncryptedReasoning) no longer counts native thinking text for readers that bill
    // replayed thinking at output size (T = signaturesPriced is false, i.e. Claude lineage).
    81: (s) => replaceExact(s, 81, 'floor thinking',
      '            r.push(M.thinking);\n            if (M.thinkingSignature && !t && T && typeof u !== "number") {',
      '            if (!t || T)\n              r.push(M.thinking);\n            if (M.thinkingSignature && !t && T && typeof u !== "number") {'),

    // P9 flush (tui/src/chat/chat-transcript-builder.ts; #k = #flushPendingUsage)
    162: (s) => replaceExact(s, 162, 'flush gate',
      'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#k();', 'this.#k();', 2),
  },
};
