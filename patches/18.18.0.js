// Behavior patches for upstream omp v18.18.0 (commit b5a6b2f7e5, 3631 modules).
//
// Keys are module indexes in the Bun standalone module table; each function receives the module's
// JS source and returns the patched source. Every anchor is asserted with an exact occurrence
// count before replacement, so a drifted anchor fails the build instead of silently shipping an
// unpatched binary. What each patch does and why: docs/patches.md.
//
// Minified names were located in this release's modules by source semantics (use sites), not
// carried over from 18.16.0:
//   P2 mod 330 turn-recovery.ts: retry caps are te/re/ie/ne (`#x > cap` + `maxRetries:`);
//      `ee` is now the string "thinking-loop-redirect", `be = 15000` is
//      UNEXPECTED_STOP_TIMEOUT_MS and `Re = 1000` SIBLING_UNBLOCK_BUFFER_MS.
//   P3 mod 465 agent-session.ts: `var Ix = 8;` is SESSION_STOP_CONTINUATION_CAP (`this.#Ts >= Ix`,
//      "session_stop continuation cap reached", `cap: Ix`).
//   P4 mod 465 task/executor.ts: `var wc = 3;` is MAX_YIELD_RETRIES (`!s.yieldCalled() && Y < wc`).
//   P11 mod 47 ai/src/providers/transform-messages.ts: the predicate is `tY` (exported as
//      shouldDropTruncatedThinkingOnlyAssistant); `nY` right after it shares the first line.
'use strict';

function replaceExact(s, mod, label, find, repl, count = 1) {
  const n = s.split(find).length - 1;
  if (n !== count) throw new Error(`mod ${mod} ${label}: anchor found ${n} times (expected ${count})`);
  return s.split(find).join(repl);
}

module.exports = {
  version: '18.18.0',
  moduleCount: 3631,
  patches: {
    // P1 compat (catalog/src/compat/resolve.ts) + P11 empty-stop drop (same bundle module)
    47: (s) => {
      s = replaceExact(s, 47, 'compat',
        'supportsForcedToolChoice: !t.requiresEnabledThinking && !(t.isOpenCodeHost && t.isDeepseekReasoning),',
        'supportsForcedToolChoice: false,');
      // P11 emptystop: upstream deliberately keeps thinking-only stop turns (replay round-trips),
      // so only a turn with no content parts at all is dropped — the empty reply a relay returns.
      return replaceExact(s, 47, 'empty stop drop',
        'function tY(e) {\n  const t = e.stopReason === "length" || e.stopReason === "error" || e.stopReason === "aborted";\n  return t && !e.content.some((i) => i.type === "toolCall" || i.type === "text");\n}',
        'function tY(e) {\n  const t = e.stopReason === "length" || e.stopReason === "error" || e.stopReason === "aborted";\n  return t && !e.content.some((i) => i.type === "toolCall" || i.type === "text") || e.content.length === 0 && e.stopReason === "stop";\n}');
    },

    // P2 stopcap (coding-agent/src/session/turn-recovery.ts)
    330: (s) => replaceExact(s, 330, 'stopcap cluster',
      'var te = 3;\nvar be = 15000;\nvar re = 3;\nvar ie = 3;\nvar ne = 3;',
      'var te = 1000000;\nvar be = 15000;\nvar re = 1000000;\nvar ie = 1000000;\nvar ne = 1000000;'),

    // P3 sessionStop + P4 yieldLadder (agent-session.ts, task/executor.ts)
    465: (s) => {
      s = replaceExact(s, 465, 'sessionStop Ix', 'var Ix = 8;', 'var Ix = 1000000;');
      return replaceExact(s, 465, 'yieldLadder wc', 'var wc = 3;', 'var wc = 1000000;');
    },

    // P5 tunnel + ssh + uploader (blob-broker/exposure.ts, uploaders-self-hosted.ts)
    40: (s) => {
      s = replaceExact(s, 40, 'tunnel',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: i, stderr: i, cwd: iq() });',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: i, stderr: i, cwd: iq(), windowsHide: true });');
      s = replaceExact(s, 40, 'ssh', 'cwd: Se.homedir() });', 'cwd: Se.homedir(), windowsHide: true });');
      return replaceExact(s, 40, 'uploader',
        'cwd: iq()\n        });\n        const U = await new Response(g.stderr)',
        'cwd: iq(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr)');
    },

    // P6 chrome (tools/browser/registry.ts)
    240: (s) => replaceExact(s, 240, 'chrome',
      'Bun.spawn([s, ...w], {\n      cwd: t.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    });',
      'Bun.spawn([s, ...w], {\n      cwd: t.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });'),

    // P7 pythonKernel helper (eval/py/spawn-options.ts). Every call site in this release funnels
    // through this helper, so the return value alone decides `windowsHide`.
    23: (s) => replaceExact(s, 23, 'pythonKernel',
      'function noe(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}',
      'function noe(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}'),

    // P8 encstale (ai/src/error/flags.ts): Ee = stale-response patterns, Gt = not-found family
    44: (s) => {
      s = replaceExact(s, 44, 'encstale Ee',
        'var Ee = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?/i, /previous[ _]?response/i];',
        'var Ee = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?|\\bencrypted content\\b[^\'"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];');
      return replaceExact(s, 44, 'encstale Gt',
        'var Gt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;',
        'var Gt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;');
    },

    // P10 floor (agent/src/tokenizer.ts): the compaction floor arm (t = excludeEncryptedReasoning)
    // no longer counts native thinking text for readers not priced per signature
    // (x = thinkingReplayTokens === "signature"; the axis only has "output" and "signature").
    59: (s) => replaceExact(s, 59, 'floor thinking',
      '            i.push(M.thinking);\n            if (M.thinkingSignature && !t && x && typeof c !== "number" && this.#a(e)) {',
      '            if (!t || x)\n              i.push(M.thinking);\n            if (M.thinkingSignature && !t && x && typeof c !== "number" && this.#a(e)) {'),

    // P9 flush (tui/src/chat/chat-transcript-builder.ts; #S = #flushPendingUsage)
    118: (s) => replaceExact(s, 118, 'flush gate',
      'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#S();', 'this.#S();', 2),
  },
};
