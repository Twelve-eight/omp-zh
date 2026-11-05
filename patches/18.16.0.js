// Behavior patches for upstream omp v18.16.0 (commit 650f3a1082, 3575 modules).
//
// Keys are module indexes in the Bun standalone module table; each function receives the module's
// JS source and returns the patched source. Every anchor is asserted with an exact occurrence
// count before replacement, so a drifted anchor fails the build instead of silently shipping an
// unpatched binary. What each patch does and why: docs/patches.md.
//
// Minified names were located in this release's modules by source semantics (use sites), not
// carried over from 18.15.0:
//   P2 mod 414 turn-recovery.ts: retry caps are still ee/te/re/se (`#x > cap` + `maxRetries:`);
//      `Z` remains the string "thinking-loop-redirect", `ye = 15000` the stall timeout and
//      `be = 1000` the backoff base — none of those are touched.
//   P3 mod 553 agent-session.ts: `var im = 8;` is SESSION_STOP_CONTINUATION_CAP (`this.#ms >= im`,
//      "session_stop continuation cap reached", `cap: im`). Modules merged further in 18.16.0, so
//      this cap and the executor's yield cap now sit ~12k lines apart in the same module.
//   P4 mod 553 task/executor.ts: `var Ar = 3;` is MAX_YIELD_RETRIES (`!s.yieldCalled() && Y < Ar`).
//   P11 mod 35 ai/src/providers/transform-messages.ts: the predicate is now `N9` (was `K7`). The
//      body string is unique in the module; `L9` right after it has a similar first line and must
//      not be matched.
'use strict';

function replaceExact(s, mod, label, find, repl, count = 1) {
  const n = s.split(find).length - 1;
  if (n !== count) throw new Error(`mod ${mod} ${label}: anchor found ${n} times (expected ${count})`);
  return s.split(find).join(repl);
}

module.exports = {
  version: '18.16.0',
  moduleCount: 3575,
  patches: {
    // P1 compat (catalog/src/compat/resolve.ts) + P11 empty-stop drop (same bundle module)
    35: (s) => {
      s = replaceExact(s, 35, 'compat',
        'supportsForcedToolChoice: !t.requiresEnabledThinking && !(t.isOpenCodeHost && t.isDeepseekReasoning),',
        'supportsForcedToolChoice: false,');
      // P11 emptystop: upstream deliberately keeps thinking-only stop turns (replay round-trips),
      // so only a turn with no content parts at all is dropped — that is the empty reply a relay
      // returns, which otherwise stays in history and is replayed on every later request.
      return replaceExact(s, 35, 'empty stop drop',
        'function N9(e) {\n  const t = e.stopReason === "length" || e.stopReason === "error" || e.stopReason === "aborted";\n  return t && !e.content.some((r) => r.type === "toolCall" || r.type === "text");\n}',
        'function N9(e) {\n  const t = e.stopReason === "length" || e.stopReason === "error" || e.stopReason === "aborted";\n  return t && !e.content.some((r) => r.type === "toolCall" || r.type === "text") || e.content.length === 0 && e.stopReason === "stop";\n}');
    },

    // P2 stopcap (coding-agent/src/session/turn-recovery.ts)
    414: (s) => replaceExact(s, 414, 'stopcap cluster',
      'var ee = 3;\nvar ye = 15000;\nvar te = 3;\nvar re = 3;\nvar se = 3;',
      'var ee = 1000000;\nvar ye = 15000;\nvar te = 1000000;\nvar re = 1000000;\nvar se = 1000000;'),

    // P3 sessionStop + P4 yieldLadder (agent-session.ts, task/executor.ts)
    553: (s) => {
      s = replaceExact(s, 553, 'sessionStop im', 'var im = 8;', 'var im = 1000000;');
      return replaceExact(s, 553, 'yieldLadder Ar', 'var Ar = 3;', 'var Ar = 1000000;');
    },

    // P5 tunnel + ssh + uploader (blob-broker/exposure.ts, uploaders-self-hosted.ts)
    27: (s) => {
      s = replaceExact(s, 27, 'tunnel',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: qj() });',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: qj(), windowsHide: true });');
      s = replaceExact(s, 27, 'ssh', 'cwd: Se.homedir() });', 'cwd: Se.homedir(), windowsHide: true });');
      return replaceExact(s, 27, 'uploader',
        'cwd: qj()\n        });\n        const U = await new Response(g.stderr)',
        'cwd: qj(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr)');
    },

    // P6 chrome (tools/browser/registry.ts)
    350: (s) => replaceExact(s, 350, 'chrome',
      'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    });',
      'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });'),

    // P7 pythonKernel helper (eval/py/spawn-options.ts). Every call site in this release funnels
    // through this helper, so the return value alone decides `windowsHide`.
    99: (s) => replaceExact(s, 99, 'pythonKernel',
      'function nre(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}',
      'function nre(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}'),

    // P8 encstale (ai/src/error/flags.ts)
    32: (s) => {
      s = replaceExact(s, 32, 'encstale fe',
        'var Ee = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?/i, /previous[ _]?response/i];',
        'var Ee = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?|\\bencrypted content\\b[^\'"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];');
      return replaceExact(s, 32, 'encstale Xt',
        'var Xt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;',
        'var Xt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;');
    },

    // P10 floor (agent/src/tokenizer.ts #measureMessage): the compaction floor arm
    // (t = excludeEncryptedReasoning) no longer counts native thinking text for readers that bill
    // replayed thinking at output size (x = thinkingReplayTokens === "signature" is false).
    47: (s) => replaceExact(s, 47, 'floor thinking',
      '            s.push(R.thinking);\n            if (R.thinkingSignature && !t && x && typeof c !== "number" && this.#a(e)) {',
      '            if (!t || x)\n              s.push(R.thinking);\n            if (R.thinkingSignature && !t && x && typeof c !== "number" && this.#a(e)) {'),

    // P9 flush (tui/src/chat/chat-transcript-builder.ts; #k = #flushPendingUsage)
    168: (s) => replaceExact(s, 168, 'flush gate',
      'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#k();', 'this.#k();', 2),
  },
};
