// Behavior patches for upstream omp v18.13.3 (commit 413d278a87, 3488 modules).
//
// Keys are module indexes in the Bun standalone module table; each function receives the module's
// JS source and returns the patched source. Every anchor is asserted before replacement, so a
// drifted anchor fails the build instead of silently shipping an unpatched binary.
// What each patch does and why: docs/patches.md.
'use strict';

module.exports = {
  version: '18.13.3',
  moduleCount: 3488,
  patches: {
  // compat: mod 43
  43: s => {
    const t = 'supportsForcedToolChoice: !t.requiresEnabledThinking && !(t.isOpenCodeHost && t.isDeepseekReasoning),';
    if (!s.includes(t)) throw new Error('mod 43 compat not found');
    return s.replace(t, 'supportsForcedToolChoice: false,');
  },
  // stopcap: mod 656 (Z/ee/te/re = 3 -> 1000000; each has `#x > K` + `maxRetries: K` use-sites)
  656: s => {
    const t = 'var Z = 3;\nvar ge = 15000;\nvar ee = 3;\nvar te = 3;\nvar re = 3;';
    const r = 'var Z = 1000000;\nvar ge = 15000;\nvar ee = 1000000;\nvar te = 1000000;\nvar re = 1000000;';
    if (!s.includes(t)) throw new Error('mod 656 stopcap cluster not found');
    return s.replace(t, r);
  },
  // sessionStop + yieldLadder: mod 801 (L0=8 via `#hs >= L0`, mh=3 via loop/maxRetries)
  801: s => {
    if (!s.includes('var L0 = 8;')) throw new Error('mod 801 sessionStop L0 not found');
    s = s.replace('var L0 = 8;', 'var L0 = 1000000;');
    if (!s.includes('var mh = 3;')) throw new Error('mod 801 yieldLadder mh not found');
    return s.replace('var mh = 3;', 'var mh = 1000000;');
  },
  // tunnel + ssh + uploader: mod 37
  37: s => {
    const t1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: k4() });';
    const r1 = 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: r, stderr: r, cwd: k4(), windowsHide: true });';
    const t2 = 'cwd: Se.homedir() });';
    const r2 = 'cwd: Se.homedir(), windowsHide: true });';
    const t3 = 'cwd: k4()\n        });\n        const U = await new Response(g.stderr)';
    const r3 = 'cwd: k4(),\n          windowsHide: true\n        });\n        const U = await new Response(g.stderr)';
    if (!s.includes(t1)) throw new Error('mod 37 tunnel not found');
    if (!s.includes(t2)) throw new Error('mod 37 ssh not found');
    if (!s.includes(t3)) throw new Error('mod 37 uploader not found');
    return s.replace(t1, r1).replace(t2, r2).replace(t3, r3);
  },
  // chrome: mod 355
  355: s => {
    const t = 'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    });';
    const r = 'Bun.spawn([s, ...w], {\n      cwd: o.cwd,\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });';
    if (!s.includes(t)) throw new Error('mod 355 chrome not found');
    return s.replace(t, r);
  },
  // pythonKernel helper: mod 23
  23: s => {
    const t = 'function lte(o) {\n  if (o.platform !== "win32")\n    return false;\n  return !o.hostHasInheritableConsole;\n}';
    const r = 'function lte(o) {\n  if (o.platform !== "win32")\n    return false;\n  return true;\n}';
    if (!s.includes(t)) throw new Error('mod 23 pythonKernel not found');
    return s.replace(t, r);
  },
  // pythonKernel call sites: mod 363, 823
  363: s => {
    const t = 'lte({\n        platform: "win32",\n        hostHasInheritableConsole: YT()\n      })';
    if (!s.includes(t)) throw new Error('mod 363 pythonKernelCall not found');
    return s.replace(t, 'true');
  },
  823: s => {
    const t = 'lte({\n        platform: "win32",\n        hostHasInheritableConsole: YT()\n      })';
    if (!s.includes(t)) throw new Error('mod 823 pythonKernelCall not found');
    return s.replace(t, 'true');
  },
  // encstale: mod 41
  41: s => {
    const t1 = 'var Ee = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?/i, /previous[ _]?response/i];';
    const r1 = 'var Ee = [/\\bItem with id [\'"][^\'"]+[\'"] not found\\.?|\\bencrypted content\\b[^\'"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];';
    const t2 = 'var Xt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;';
    const r2 = 'var Xt = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;';
    if (!s.includes(t1)) throw new Error('mod 41 encstale Ee not found');
    if (!s.includes(t2)) throw new Error('mod 41 encstale Xt not found');
    return s.replace(t1, r1).replace(t2, r2);
  },
  // flush: mod 159
  159: s => {
    const target = 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#S();';
    const c = s.split(target).length - 1;
    if (c !== 2) throw new Error('mod 159 flush gate count = ' + c + ' (expected 2)');
    return s.split(target).join('this.#S();');
  }
  },
};
