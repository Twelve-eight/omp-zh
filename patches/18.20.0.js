// Behavior patches for upstream omp v18.20.0 (3747 modules).
//
// Keys are module indexes in the Bun standalone module table. Every anchor is asserted with an
// exact occurrence count before replacement, so a drifted anchor fails the build instead of
// silently shipping an unpatched binary. What each patch does and why: docs/patches.md.
//
// Anchors re-located for this release by source semantics (nearest `// packages/...` header plus
// use sites), not carried over from 18.19.0:
//   P1 compat + P11 emptystop: mod 49 (catalog/src/compat/resolve.ts, ai/src/providers/
//      transform-messages.ts; the empty-stop predicate is now `FY` and the `ak` right after it
//      shares the first line).
//   P2 stopcap: mod 332 turn-recovery.ts; caps are se/ie/ne/oe, `Ae = 15000` and `Me = 2` and
//      `Ee = 1000` are other constants and stay untouched.
//   P3/P4: mod 475 — `var $x = 8;` (SESSION_STOP_CONTINUATION_CAP) and `var Ic = 3;`
//      (MAX_YIELD_RETRIES).
//   P5: mod 43 blob-broker exposure.ts (`cwd: R$()`) + uploaders-self-hosted.ts; P6: mod 1184
//      @puppeteer/browsers launch.js child_process spawn; P7: mod 25 eval/py/spawn-options.ts
//      helper `Ose`; P8: mod 46 ai/src/error/flags.ts (`_e` / `Yt`); P9: mod 127
//      tui/src/chat/chat-transcript-builder.ts; P10: mod 61 agent/src/tokenizer.ts.
'use strict';

function replaceExact(s, mod, label, find, repl, count = 1) {
  const n = s.split(find).length - 1;
  if (n !== count) throw new Error(`mod ${mod} ${label}: anchor found ${n} times (expected ${count})`);
  return s.split(find).join(repl);
}

module.exports = {
  version: '18.20.0',
  moduleCount: 3747,
  patches: {
    // P1 compat (catalog/src/compat/resolve.ts) + P11 empty-stop drop (same bundle module)
    49: (s) => {
      s = replaceExact(s, 49, 'compat',
        'supportsForcedToolChoice: !t.requiresEnabledThinking && !(t.isOpenCodeHost && t.isDeepseekReasoning),',
        'supportsForcedToolChoice: false,');
      // P11: upstream keeps thinking-only stop turns (replay round-trips); only a turn with no
      // content parts at all is dropped — the empty reply a relay returns.
      return replaceExact(s, 49, 'empty stop drop',
        'function FY(e) {\n  const t = e.stopReason === "length" || e.stopReason === "error" || e.stopReason === "aborted";\n  return t && !e.content.some((r) => r.type === "toolCall" || r.type === "text");\n}',
        'function FY(e) {\n  const t = e.stopReason === "length" || e.stopReason === "error" || e.stopReason === "aborted";\n  return t && !e.content.some((r) => r.type === "toolCall" || r.type === "text") || Array.isArray(e.content) && e.content.length === 0 && e.stopReason === "stop";\n}');
    },

    // P2 stopcap (coding-agent/src/session/turn-recovery.ts)
    332: (s) => replaceExact(s, 332, 'stopcap cluster',
      'var se = 3;\nvar Ae = 15000;\nvar ie = 3;\nvar ne = 3;\nvar oe = 3;',
      'var se = 1000000;\nvar Ae = 15000;\nvar ie = 1000000;\nvar ne = 1000000;\nvar oe = 1000000;'),

    // P3 sessionStop + P4 yieldLadder (agent-session.ts, task/executor.ts)
    475: (s) => {
      s = replaceExact(s, 475, 'sessionStop $x', 'var $x = 8;', 'var $x = 1000000;');
      return replaceExact(s, 475, 'yieldLadder Ic', 'var Ic = 3;', 'var Ic = 1000000;');
    },

    // P5 tunnel + ssh + uploader (blob-broker/exposure.ts, uploaders-self-hosted.ts)
    43: (s) => {
      s = replaceExact(s, 43, 'tunnel',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: R$() });',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: R$(), windowsHide: true });');
      s = replaceExact(s, 43, 'ssh', 'cwd: Se.homedir() });', 'cwd: Se.homedir(), windowsHide: true });');
      return replaceExact(s, 43, 'uploader',
        'cwd: R$()\n        });\n        const U = await new Response(g.stderr)',
        'cwd: R$(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr)');
    },

    // P6 chrome (mod 1184, @puppeteer/browsers launch.js): puppeteer spawns the browser through
    // `import os from "child_process"`; add windowsHide to that one spawn.
    1184: (s) => replaceExact(s, 1184, 'chrome launcher',
      'os.spawn(this.#e, this.#t, {\n      detached: e.detached,\n      env: r,\n      stdio: t\n    });',
      'os.spawn(this.#e, this.#t, {\n      detached: e.detached,\n      env: r,\n      stdio: t,\n      windowsHide: true\n    });'),

    // P7 pythonKernel helper (eval/py/spawn-options.ts) — every call site funnels through it.
    25: (s) => replaceExact(s, 25, 'pythonKernel',
      'function Ose(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}',
      'function Ose(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}'),

    // P8 encstale (ai/src/error/flags.ts): _e = stale-response patterns, Yt = not-found family
    46: (s) => {
      s = replaceExact(s, 46, 'encstale _e',
        'var _e = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?/i, /previous[ _]?response/i];',
        'var _e = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?|\\bencrypted content\\b[^\'"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];');
      return replaceExact(s, 46, 'encstale Yt',
        'var Yt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;',
        'var Yt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;');
    },

    // P10 floor (agent/src/tokenizer.ts): the compaction floor arm no longer counts native thinking
    // text for readers not priced per signature (x = thinkingReplayTokens === "signature").
    61: (s) => replaceExact(s, 61, 'floor thinking',
      '            s.push(R.thinking);\n            if (R.thinkingSignature && !t && x && typeof c !== "number" && this.#r(e)) {',
      '            if (!t || x)\n              s.push(R.thinking);\n            if (R.thinkingSignature && !t && x && typeof c !== "number" && this.#r(e)) {'),

    // P9 flush (tui/src/chat/chat-transcript-builder.ts; #R = #flushPendingUsage)
    127: (s) => replaceExact(s, 127, 'flush gate',
      'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#R();', 'this.#R();', 2),
  },
};
