// Behavior patches for upstream omp v18.19.0 (3738 modules).
//
// Keys are module indexes in the Bun standalone module table. Every anchor is asserted with an
// exact occurrence count before replacement, so a drifted anchor fails the build instead of
// silently shipping an unpatched binary. What each patch does and why: docs/patches.md.
//
// Located in this release's modules by source semantics (nearest `// packages/...` header + use
// sites), not carried over from 18.18.0:
//   P1 compat + P11 emptystop: mod 50 (catalog/src/compat/resolve.ts, ai/src/providers/
//      transform-messages.ts; predicate renamed `CY`, the `nE` right after it shares the first line).
//   P2 stopcap: mod 341 turn-recovery.ts. Caps are se/ie/ne/oe (`maxRetries:` + `#x > cap`);
//      `re` is the "thinking-loop-redirect" string, `Ae = 15000` and `Me = 2` and `Ee = 1000` are
//      other constants and stay untouched.
//   P3/P4: mod 482 — `var Ex = 8;` (SESSION_STOP_CONTINUATION_CAP) and `var Rc = 3;`
//      (MAX_YIELD_RETRIES).
//   P5: mod 44 blob-broker exposure.ts + uploaders-self-hosted.ts (`cwd: b$()`); P7: mod 26
//      eval/py/spawn-options.ts helper `kse`; P8: mod 47 ai/src/error/flags.ts (`pe` / `Yt`);
//      P10: mod 62 agent/src/tokenizer.ts; P9: mod 135 tui/src/chat/chat-transcript-builder.ts.
//   P6: mod 1184 @puppeteer/browsers launch.js — the browser is no longer spawned by a direct
//      Bun.spawn in the browser tool; it goes through puppeteer, which spawns via child_process.
'use strict';

function replaceExact(s, mod, label, find, repl, count = 1) {
  const n = s.split(find).length - 1;
  if (n !== count) throw new Error(`mod ${mod} ${label}: anchor found ${n} times (expected ${count})`);
  return s.split(find).join(repl);
}

module.exports = {
  version: '18.19.0',
  moduleCount: 3738,
  patches: {
    // P1 compat (catalog/src/compat/resolve.ts) + P11 empty-stop drop (same bundle module)
    50: (s) => {
      s = replaceExact(s, 50, 'compat',
        'supportsForcedToolChoice: !t.requiresEnabledThinking && !(t.isOpenCodeHost && t.isDeepseekReasoning),',
        'supportsForcedToolChoice: false,');
      // P11: upstream keeps thinking-only stop turns (replay round-trips); only a turn with no
      // content parts at all is dropped — the empty reply a relay returns.
      return replaceExact(s, 50, 'empty stop drop',
        'function CY(e) {\n  const t = e.stopReason === "length" || e.stopReason === "error" || e.stopReason === "aborted";\n  return t && !e.content.some((i) => i.type === "toolCall" || i.type === "text");\n}',
        'function CY(e) {\n  const t = e.stopReason === "length" || e.stopReason === "error" || e.stopReason === "aborted";\n  return t && !e.content.some((i) => i.type === "toolCall" || i.type === "text") || Array.isArray(e.content) && e.content.length === 0 && e.stopReason === "stop";\n}');
    },

    // P2 stopcap (coding-agent/src/session/turn-recovery.ts)
    341: (s) => replaceExact(s, 341, 'stopcap cluster',
      'var se = 3;\nvar Ae = 15000;\nvar ie = 3;\nvar ne = 3;\nvar oe = 3;',
      'var se = 1000000;\nvar Ae = 15000;\nvar ie = 1000000;\nvar ne = 1000000;\nvar oe = 1000000;'),

    // P3 sessionStop + P4 yieldLadder (agent-session.ts, task/executor.ts)
    482: (s) => {
      s = replaceExact(s, 482, 'sessionStop Ex', 'var Ex = 8;', 'var Ex = 1000000;');
      return replaceExact(s, 482, 'yieldLadder Rc', 'var Rc = 3;', 'var Rc = 1000000;');
    },

    // P5 tunnel + ssh + uploader (blob-broker/exposure.ts, uploaders-self-hosted.ts)
    44: (s) => {
      s = replaceExact(s, 44, 'tunnel',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: i, stderr: i, cwd: b$() });',
        'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: i, stderr: i, cwd: b$(), windowsHide: true });');
      s = replaceExact(s, 44, 'ssh', 'cwd: Se.homedir() });', 'cwd: Se.homedir(), windowsHide: true });');
      return replaceExact(s, 44, 'uploader',
        'cwd: b$()\n        });\n        const U = await new Response(g.stderr)',
        'cwd: b$(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr)');
    },

    // P6 chrome (mod 1184, @puppeteer/browsers launch.js): 18.19.0 moved browser launch from a
    // direct `Bun.spawn([s, ...w], …)` to puppeteer, whose Launcher spawns through `import os from
    // "child_process"` — `os.spawn(this.#e, this.#t, { detached, env, stdio })`. Same one-line fix.
    1184: (s) => replaceExact(s, 1184, 'chrome launcher',
      'os.spawn(this.#e, this.#t, {\n      detached: e.detached,\n      env: r,\n      stdio: t\n    });',
      'os.spawn(this.#e, this.#t, {\n      detached: e.detached,\n      env: r,\n      stdio: t,\n      windowsHide: true\n    });'),

    // P7 pythonKernel helper (eval/py/spawn-options.ts) — every call site funnels through it.
    26: (s) => replaceExact(s, 26, 'pythonKernel',
      'function kse(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}',
      'function kse(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}'),

    // P8 encstale (ai/src/error/flags.ts): pe = stale-response patterns, Yt = not-found family
    47: (s) => {
      s = replaceExact(s, 47, 'encstale pe',
        'var pe = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?/i, /previous[ _]?response/i];',
        'var pe = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?|\\bencrypted content\\b[^\'"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];');
      return replaceExact(s, 47, 'encstale Yt',
        'var Yt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;',
        'var Yt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;');
    },

    // P10 floor (agent/src/tokenizer.ts): the compaction floor arm (t = excludeEncryptedReasoning)
    // no longer counts native thinking text for readers not priced per signature
    // (A = thinkingReplayTokens === "signature"; the axis only has "output" and "signature").
    62: (s) => replaceExact(s, 62, 'floor thinking',
      '            i.push(k.thinking);\n            if (k.thinkingSignature && !t && A && typeof c !== "number" && this.#r(e)) {',
      '            if (!t || A)\n              i.push(k.thinking);\n            if (k.thinkingSignature && !t && A && typeof c !== "number" && this.#r(e)) {'),

    // P9 flush (tui/src/chat/chat-transcript-builder.ts; #x = #flushPendingUsage)
    135: (s) => replaceExact(s, 135, 'flush gate',
      'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#x();', 'this.#x();', 2),
  },
};
