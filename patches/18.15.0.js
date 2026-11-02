// Behavior patches for upstream omp v18.15.0 (commit 3fedf8d532, 3570 modules).
//
// Keys are module indexes in the Bun standalone module table; each function receives the module's
// JS source and returns the patched source. Every anchor is asserted with an exact occurrence
// count before replacement, so a drifted anchor fails the build instead of silently shipping an
// unpatched binary. What each patch does and why: docs/patches.md.
//
// Minified names were located in this release's modules by source semantics (use sites), not
// carried over from 18.14.0. 18.15.0 merged many modules into large files, so module indexes moved
// by hundreds and several caps live thousands of lines into one module:
//   P2 mod 415 turn-recovery.ts: retry caps are ee/te/re/se (`#i > ee`, `#c > te`, `#a > re`,
//      `#l > se`, each also `maxRetries:`). `Z` is now the string "thinking-loop-redirect",
//      `ye = 15000` is the stall timeout, `be = 1000` the backoff base: all three stay untouched.
//   P3 mod 557 agent-session.ts: hm = SESSION_STOP_CONTINUATION_CAP (`this.#ms >= hm`,
//      "session_stop continuation cap reached"). `var aA = 40;` next to it is untouched.
//   P4 mod 557 task/executor.ts: Er = MAX_YIELD_RETRIES (`!s.yieldCalled() && V < Er`). `Sm = 4`
//      beside it is untouched.
//   P7 mod 23: pythonKernel helper is `Mne` (`return !o.hostHasInheritableConsole;`). Every
//      18.15.0 call site funnels through it — including the module-level constant
//      `var _ = A({ platform: "win32", hostHasInheritableConsole: PT() });` in mod 33 — so the
//      helper alone decides `windowsHide`; the 18.14.0 inline call-site patches are redundant here.
'use strict';

function replaceExact(s, mod, label, find, repl, count = 1) {
  const n = s.split(find).length - 1;
  if (n !== count) throw new Error(`mod ${mod} ${label}: anchor found ${n} times (expected ${count})`);
  return s.split(find).join(repl);
}

module.exports = {
  version: '18.15.0',
  moduleCount: 3570,
  patches: {
    // P1 compat (catalog/src/compat/resolve.ts) + P11 empty-stop drop (same bundle module)
    47: (s) => {
      s = replaceExact(s, 47, 'compat',
        'supportsForcedToolChoice: !t.requiresEnabledThinking && !(t.isOpenCodeHost && t.isDeepseekReasoning),',
        'supportsForcedToolChoice: false,');
      // P11 emptystop (ai/src/messages/transform.ts shouldDropTruncatedThinkingOnlyAssistant, K7):
      // upstream only drops length/error/aborted turns, so an assistant reply that ended with
      // stopReason "stop" and no text or tool call stays in the transcript and is replayed on every
      // later request. A relay that returns empty replies then keeps returning them. Treating an
      // empty "stop" turn as droppable removes it from the replayed history.
      return replaceExact(s, 47, 'empty stop drop',
        'function K7(e) {\n  const t = e.stopReason === "length" || e.stopReason === "error" || e.stopReason === "aborted";\n  return t && !e.content.some((r) => r.type === "toolCall" || r.type === "text");\n}',
        'function K7(e) {\n  const t = e.stopReason === "length" || e.stopReason === "error" || e.stopReason === "aborted" || e.stopReason === "stop";\n  return t && !e.content.some((r) => r.type === "toolCall" || r.type === "text");\n}');
    },

    // P2 stopcap (coding-agent/src/session/turn-recovery.ts)
    415: (s) => replaceExact(s, 415, 'stopcap cluster',
      'var ee = 3;\nvar ye = 15000;\nvar te = 3;\nvar re = 3;\nvar se = 3;',
      'var ee = 1000000;\nvar ye = 15000;\nvar te = 1000000;\nvar re = 1000000;\nvar se = 1000000;'),

    // P3 sessionStop + P4 yieldLadder (agent-session.ts, task/executor.ts)
    557: (s) => {
      s = replaceExact(s, 557, 'sessionStop hm', 'var hm = 8;', 'var hm = 1000000;');
      return replaceExact(s, 557, 'yieldLadder Er', 'var Er = 3;', 'var Er = 1000000;');
    },

    // P5 tunnel + ssh + uploader (blob-broker/exposure.ts, uploaders-self-hosted.ts)
    40: (s) => {
      s = replaceExact(s, 40, 'tunnel',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: fj() });',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: fj(), windowsHide: true });');
      s = replaceExact(s, 40, 'ssh', 'cwd: Se.homedir() });', 'cwd: Se.homedir(), windowsHide: true });');
      return replaceExact(s, 40, 'uploader',
        'cwd: fj()\n        });\n        const U = await new Response(g.stderr)',
        'cwd: fj(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr)');
    },

    // P6 chrome (tools/browser/registry.ts)
    350: (s) => replaceExact(s, 350, 'chrome',
      'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    });',
      'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });'),

    // P7 pythonKernel helper (eval/py/spawn-options.ts)
    23: (s) => replaceExact(s, 23, 'pythonKernel',
      'function Mne(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}',
      'function Mne(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}'),

    // P8 encstale (ai/src/error/flags.ts)
    44: (s) => {
      s = replaceExact(s, 44, 'encstale fe',
        'var fe = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?/i, /previous[ _]?response/i];',
        'var fe = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?|\\bencrypted content\\b[^\'"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];');
      return replaceExact(s, 44, 'encstale Xt',
        'var Xt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;',
        'var Xt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;');
    },

    // P10 floor (agent/src/tokenizer.ts #measureMessage): the compaction floor arm
    // (t = excludeEncryptedReasoning) no longer counts native thinking text for readers that bill
    // replayed thinking at output size (x = signaturesPriced is false, i.e. Claude lineage).
    59: (s) => replaceExact(s, 59, 'floor thinking',
      '            r.push(M.thinking);\n            if (M.thinkingSignature && !t && x && typeof u !== "number") {',
      '            if (!t || x)\n              r.push(M.thinking);\n            if (M.thinkingSignature && !t && x && typeof u !== "number") {'),

    // P9 flush (tui/src/chat/chat-transcript-builder.ts; #S = #flushPendingUsage)
    156: (s) => replaceExact(s, 156, 'flush gate',
      'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#S();', 'this.#S();', 2),
  },
};
