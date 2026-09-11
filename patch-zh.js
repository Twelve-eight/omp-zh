// 汉化补丁：对新提取的官方 cli.js 应用确定性文本补丁
// 1. catalog: deepseek-v4-flash/v4-pro（aimlapi）compat.supportsForcedToolChoice:false
//    （thinking 模式下强制 tool_choice 会 400；17.4.0 起 efforts 已原生含 "max"，无需再加）
// 2. focus 补丁已移除：17.4.0 showTreeSelector 关闭回调原生调用 focusActiveEditorArea()
// 3. Windows 控制台泄漏修复（18.0.1 起打）：强制基础设施子进程 windowsHide:true
// 4. 停止恢复无上限（18.0.3 起打）：empty-stop/unexpected-stop/session-stop 续跑/yield 阶梯上限抬至 1e6
// 5. 重放渲染完整性（18.0.3 起打）：transcript 重建应用 retryRecovery + 尾条 usage 无条件 flush
// 用法: node patch-zh.js <cli.js路径>   （原地修改；失败仅警告，不中断）
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('usage: node patch-zh.js <cli.js>'); process.exit(2); }
let s = fs.readFileSync(file, 'utf8');

let ok = 0, warn = 0;

// ---- 补丁 1: catalog compat（仅 deepseek-v4-flash / v4-pro 条目内 supportsForcedToolChoice → false） ----
// 注意幂等检查必须限定在这两个条目窗口内：全文件有大量其他模型的 supportsForcedToolChoice:false
const MODELS = ['"deepseek-v4-flash"', '"deepseek-v4-pro"'];
// 18.1.2 起 catalog 扁平化：条目带 provider: 字段，同一模型出现在多个目录表。
// 语义：把这两个模型在【所有 provider 条目】里的 supportsForcedToolChoice 改 false
//（历史动机：thinking 模式强制 tool_choice 400；扩到全部 provider 保持行为一致）。
for (const name of MODELS) {
  let i = -1, patched = 0, distinct = [];
  while ((i = s.indexOf(name, i + 1)) !== -1) {
    const win = s.slice(i, i + 2500);
    if (win.includes('supportsForcedToolChoice: true')) distinct.push(i);
  }
  // 同一条目内 name 出现多次（id/name 行），按 200 字符去重
  const dd = distinct.filter((x, k) => k === 0 || x - distinct[k - 1] > 200);
  // 从后往前替换，避免偏移失效
  for (let k = dd.length - 1; k >= 0; k--) {
    const win = s.slice(dd[k], dd[k] + 2500);
    s = s.slice(0, dd[k]) + win.replace('supportsForcedToolChoice: true', 'supportsForcedToolChoice: false') + s.slice(dd[k] + win.length);
    patched++;
  }
  if (patched > 0) {
    ok++;
    console.log('patch OK: ' + name + ' supportsForcedToolChoice → false (' + patched + ' entries)');
  } else if (s.includes(name) && s.slice(s.indexOf(name), s.indexOf(name) + 2500).includes('supportsForcedToolChoice: false')) {
    ok++;
    console.log('patch SKIP: ' + name + ' compat already patched');
  } else {
    console.log('patch WARN: ' + name + ' has no supportsForcedToolChoice field (upstream changed?)');
    warn++;
  }
}
// ---- 补丁 2: Windows 控制台泄漏修复 ----
// 症状：子进程日志直绘进 TUI（光标处出现 [INFO]，重绘把旧帧顶上去成"时空图"），
//       甚至落进其它 omp 实例的窗口。
// 机制：win32 + TUI 下 hostHasInheritableConsole()=true，多处 spawn 用 windowsHide:false
//       → 子进程附着 omp 控制台，孙进程经 NULL 句柄默认规则直写 CONOUT$；
//       broker 由首个实例孵化且 unref 长存、按项目目录共享 → 其 daemon 的日志进孵化者窗口。
// 修复：基础设施 spawn 强制 windowsHide:true（Bun 映射 CREATE_NO_WINDOW，脱离控制台）。
// 例外：eval kernel 三处不动——上游 #1960：CREATE_NO_WINDOW 致 NumPy 等 native 扩展
//       LoadLibraryExW 死锁；且 kernel 自身输出本就被管道捕获。
const LEAK_PATCHES = [
  { name: 'daemon/broker spawn options', expect: 1,
    find: '  return {\n    detached: false,\n    windowsHide: !e.hostHasInheritableConsole\n  };',
    repl: '  return {\n    detached: false,\n    windowsHide: true\n  };',
    done: '    detached: false,\n    windowsHide: true\n  };' },
  { name: 'MCP stdio spawn options', expect: 1,
    find: 'const n = t.hostHasInheritableConsole === undefined ? true : !t.hostHasInheritableConsole;',
    repl: 'const n = true;',
    done: null },
  // 18.0.9 锚点：上游给四个 spawn 加了 cwd 参数（tunnel cwd:j7()、ssh cwd:homedir、uploader-sh cwd:j7()、uploader cwd:l）
  // 18.1.12 锚点：cwd helper sj()->rj()、oRt->CRt（上一轮误扫 18.1.11 产物所致修正）
  // 18.1.16 锚点:cwd helper rj()->kj(),TRt->KRt
  // 18.1.17 锚点:cwd helper kj()->Fj(),KRt->wwt
  { name: 'blob-broker tunnel (18.1.17)', expect: 1,
    find: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: Fj() })',
    repl: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: Fj(), windowsHide: true })',
    done: 'stdout: o, stderr: o, cwd: Fj(), windowsHide: true })' },
  { name: 'blob-broker ssh tunnel (18.1.17)', expect: 1,
    find: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: wwt.homedir() })',
    repl: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: wwt.homedir(), windowsHide: true })',
    done: 'stderr: "ignore", cwd: wwt.homedir(), windowsHide: true })' },
  { name: 'uploader self-hosted (18.1.17)', expect: 1,
    find: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: \"ignore\",\n          stderr: \"pipe\",\n          cwd: Fj()\n        })',
    repl: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: \"ignore\",\n          stderr: \"pipe\",\n          cwd: Fj(),\n          windowsHide: true\n        })',
    done: 'cwd: Fj(),\n          windowsHide: true' },
  { name: 'blob-broker tunnel (18.1.16)', expect: 1,
    find: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: kj() })',
    repl: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: kj(), windowsHide: true })',
    done: 'stdout: o, stderr: o, cwd: kj(), windowsHide: true })' },
  { name: 'blob-broker ssh tunnel (18.1.16)', expect: 1,
    find: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: KRt.homedir() })',
    repl: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: KRt.homedir(), windowsHide: true })',
    done: 'stderr: "ignore", cwd: KRt.homedir(), windowsHide: true })' },
  { name: 'uploader self-hosted (18.1.16)', expect: 1,
    find: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: \"ignore\",\n          stderr: \"pipe\",\n          cwd: kj()\n        })',
    repl: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: \"ignore\",\n          stderr: \"pipe\",\n          cwd: kj(),\n          windowsHide: true\n        })',
    done: 'cwd: kj(),\n          windowsHide: true' },
  { name: 'blob-broker tunnel (18.1.12)', expect: 1,
    find: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: rj() })',
    repl: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: rj(), windowsHide: true })',
    done: 'stdout: o, stderr: o, cwd: rj(), windowsHide: true })' },
  { name: 'blob-broker ssh tunnel (18.1.13)', expect: 1,
    find: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: TRt.homedir() })',
    repl: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: TRt.homedir(), windowsHide: true })',
    done: 'stderr: "ignore", cwd: TRt.homedir(), windowsHide: true })' },
  { name: 'blob-broker ssh tunnel (18.1.12)', expect: 1,
    find: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: CRt.homedir() })',
    repl: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: CRt.homedir(), windowsHide: true })',
    done: 'stderr: "ignore", cwd: CRt.homedir(), windowsHide: true })' },
  { name: 'uploader self-hosted (18.1.12)', expect: 1,
    find: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: rj()\n        })',
    repl: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: rj(),\n          windowsHide: true\n        })',
    done: 'cwd: rj(),\n          windowsHide: true' },
  // 18.1.11 锚点：cwd helper M9()→sj()、AEt→oRt；chrome launch 已带 windowsHide（上游吸收）
  { name: 'blob-broker tunnel (18.1.11)', expect: 1,
    find: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: sj() })',
    repl: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: sj(), windowsHide: true })',
    done: 'stdout: o, stderr: o, cwd: sj(), windowsHide: true })' },
  { name: 'blob-broker ssh tunnel (18.1.11)', expect: 1,
    find: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: oRt.homedir() })',
    repl: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: oRt.homedir(), windowsHide: true })',
    done: 'stderr: "ignore", cwd: oRt.homedir(), windowsHide: true })' },
  { name: 'uploader self-hosted (18.1.11)', expect: 1,
    find: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: sj()\n        })',
    repl: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: sj(),\n          windowsHide: true\n        })',
    done: 'cwd: sj(),\n          windowsHide: true' },

  // 18.1.2 锚点：cwd helper g6()→M9()、DSt→AEt、chrome launch 变量 d→c
  { name: 'blob-broker tunnel (18.1.2)', expect: 1,
    find: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: M9() })',
    repl: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: M9(), windowsHide: true })',
    done: 'stdout: o, stderr: o, cwd: M9(), windowsHide: true })' },
  { name: 'blob-broker ssh tunnel (18.1.2)', expect: 1,
    find: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: AEt.homedir() })',
    repl: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: AEt.homedir(), windowsHide: true })',
    done: 'stderr: "ignore", cwd: AEt.homedir(), windowsHide: true })' },
  { name: 'uploader self-hosted (18.1.2)', expect: 1,
    find: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: M9()\n        })',
    repl: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: M9(),\n          windowsHide: true\n        })',
    done: 'cwd: M9(),\n          windowsHide: true' },
  { name: 'browser chrome launch (18.1.2)', expect: 1,
    find: 'const c = Bun.spawn([s, ...p], {\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    });',
    repl: 'const c = Bun.spawn([s, ...p], {\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });',
    done: 'const c = Bun.spawn([s, ...p], {\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });' },
  // 18.0.11 锚点：cwd helper j7()→g6()、pSt→DSt（uploader 两处与 18.0.9 相同，未漂）
  { name: 'blob-broker tunnel (18.0.11)', expect: 1,
    find: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: g6() })',
    repl: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: g6(), windowsHide: true })',
    done: 'stdout: o, stderr: o, cwd: g6(), windowsHide: true })' },
  { name: 'blob-broker ssh tunnel (18.0.11)', expect: 1,
    find: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: DSt.homedir() })',
    repl: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: DSt.homedir(), windowsHide: true })',
    done: 'stderr: "ignore", cwd: DSt.homedir(), windowsHide: true })' },
  { name: 'uploader self-hosted (18.0.11)', expect: 1,
    find: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: g6()\n        })',
    repl: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: g6(),\n          windowsHide: true\n        })',
    done: 'cwd: g6(),\n          windowsHide: true' },
  { name: 'blob-broker tunnel (18.0.9)', expect: 1,
    find: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: j7() });',
    repl: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, cwd: j7(), windowsHide: true });',
    done: 'stdout: o, stderr: o, cwd: j7(), windowsHide: true });' },
  { name: 'blob-broker ssh tunnel (18.0.9)', expect: 1,
    find: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: pSt.homedir() });',
    repl: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: pSt.homedir(), windowsHide: true });',
    done: 'stderr: "ignore", cwd: pSt.homedir(), windowsHide: true });' },
  { name: 'uploader self-hosted (18.0.9)', expect: 1,
    find: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: j7()\n        })',
    repl: 'Bun.spawn(d, {\n          stdin: u.bytes,\n          stdout: "ignore",\n          stderr: "pipe",\n          cwd: j7(),\n          windowsHide: true\n        })',
    done: 'cwd: j7(),\n          windowsHide: true' },
  { name: 'uploader (18.0.9)', expect: 1,
    find: 'Bun.spawn(a, { stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: l })',
    repl: 'Bun.spawn(a, { stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: l, windowsHide: true })',
    done: 'stderr: "pipe", cwd: l, windowsHide: true })' },
  { name: 'direnv probe', expect: 1,
    find: 'stdout: "pipe",\n    stderr: "pipe",\n    signal: i\n  });',
    repl: 'stdout: "pipe",\n    stderr: "pipe",\n    windowsHide: true,\n    signal: i\n  });',
    done: 'windowsHide: true,\n    signal: i' },
  { name: 'browser chrome launch', expect: 1,
    find: 'const d = Bun.spawn([s, ...p], {\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore"\n    });',
    repl: 'const d = Bun.spawn([s, ...p], {\n      stdout: "ignore",\n      stderr: "ignore",\n      stdin: "ignore",\n      windowsHide: true\n    });',
    done: 'stdin: "ignore",\n      windowsHide: true' },
  { name: 'browser version probe', expect: 1,
    find: 'const s = Bun.spawn([e, "--version"], {\n      stdout: "pipe",\n      stderr: "ignore",\n      signal: AbortSignal.timeout(t),\n      killSignal: "SIGKILL"\n    });',
    repl: 'const s = Bun.spawn([e, "--version"], {\n      stdout: "pipe",\n      stderr: "ignore",\n      signal: AbortSignal.timeout(t),\n      killSignal: "SIGKILL",\n      windowsHide: true\n    });',
    done: 'killSignal: "SIGKILL",\n      windowsHide: true' },
];
for (const p of LEAK_PATCHES) {
  const c = s.split(p.find).length - 1;
  if (c === p.expect) {
    s = s.split(p.find).join(p.repl);
    ok++;
    console.log('patch OK: [leak] ' + p.name);
  } else if (c === 0 && (p.done ? s.includes(p.done) : s.includes(p.repl))) {
    ok++;
    console.log('patch SKIP: [leak] ' + p.name + ' (already patched)');
  } else {
    console.log('patch WARN: [leak] ' + p.name + ' found=' + c + ' expected=' + p.expect + ' (upstream changed?)');
    warn++;
  }
}
// ---- 补丁 3: 停止恢复无上限（"任何可重试情况，agent 不在用户要求前停止"）----
// 上游四处硬编码放弃上限全部抬到 1000000（实际等效无限）：空停止重试 3、意外停止重试 3、
// session-stop 续跑 8、子代理 yield 提醒阶梯 3。结构性保护不受影响：预算停止折叠阶梯、
// 终端错误跳过提醒、loopGuard/用户中断始终优先。锚点含压缩变量名，跨版本会漂移——
// 漂移时按 DEVLOG「模块横幅注释定位法」重新抓取字节。
const STOPCAP_PATCHES = [
  // 18.1.17 锚点(整簇再改名:Xbo/Qbo/Zbo,xxo 续跑,vda/zct yield)
  { name: 'empty/unexpected/malformed stop retries (18.1.17)', expect: 1,
    find: 'Xbo = 3, c0a = 4000, Qbo = 3, Zbo = 3, d0a = 1000,',
    repl: 'Xbo = 1000000, c0a = 4000, Qbo = 1000000, Zbo = 1000000, d0a = 1000,',
    done: 'Xbo = 1000000, c0a = 4000, Qbo = 1000000, Zbo = 1000000' },
  { name: 'session-stop continuation cap (18.1.17)', expect: 1,
    find: 'var xxo = 8, ',
    repl: 'var xxo = 1000000, ',
    done: 'var xxo = 1000000' },
  { name: 'subagent yield ladder (18.1.17)', expect: 1,
    find: 'vda = 6, zct = 3;',
    repl: 'vda = 6, zct = 1000000;',
    done: 'zct = 1000000' },
  // 18.1.16 锚点(整簇再改名:jko/Kko/Vko,Cbo 续跑,sca/fct yield)
  { name: 'empty/unexpected/malformed stop retries (18.1.16)', expect: 1,
    find: 'jko = 3, FOa = 4000, Kko = 3, Vko = 3, NOa = 1000,',
    repl: 'jko = 1000000, FOa = 4000, Kko = 1000000, Vko = 1000000, NOa = 1000,',
    done: 'jko = 1000000, FOa = 4000, Kko = 1000000, Vko = 1000000' },
  { name: 'session-stop continuation cap (18.1.16)', expect: 1,
    find: 'var Cbo = 8, ',
    repl: 'var Cbo = 1000000, ',
    done: 'var Cbo = 1000000' },
  { name: 'subagent yield ladder (18.1.16)', expect: 1,
    find: 'sca = 6, fct = 3;',
    repl: 'sca = 6, fct = 1000000;',
    done: 'fct = 1000000' },
  // 18.1.13 锚点（簇内 delay/1000 常量改名 EMa->OMa、vMa->IMa；yield rua/Upt->uua/Upt）
  { name: 'empty/unexpected/malformed stop retries (18.1.13)', expect: 1,
    find: 'xwo = 3, OMa = 4000, Swo = 3, Ewo = 3, IMa = 1000,',
    repl: 'xwo = 1000000, OMa = 4000, Swo = 1000000, Ewo = 1000000, IMa = 1000,',
    done: 'xwo = 1000000, OMa = 4000, Swo = 1000000, Ewo = 1000000' },
  { name: 'subagent yield ladder (18.1.13)', expect: 1,
    find: 'uua = 6, Upt = 3;',
    repl: 'uua = 6, Upt = 1000000;',
    done: 'Upt = 1000000' },
  // 18.1.12 锚点（真实常量：xwo unexpected/Swo empty/Ewo malformed、Qwo 续跑、rua/Gpt yield）
  { name: 'empty/unexpected/malformed stop retries (18.1.12)', expect: 1,
    find: 'xwo = 3, EMa = 4000, Swo = 3, Ewo = 3, vMa = 1000,',
    repl: 'xwo = 1000000, EMa = 4000, Swo = 1000000, Ewo = 1000000, vMa = 1000,',
    done: 'xwo = 1000000, EMa = 4000, Swo = 1000000, Ewo = 1000000' },
  { name: 'session-stop continuation cap (18.1.12)', expect: 1,
    find: 'var Qwo = 8, ',
    repl: 'var Qwo = 1000000, ',
    done: 'var Qwo = 1000000' },
  { name: 'subagent yield ladder (18.1.12)', expect: 1,
    find: 'rua = 6, Gpt = 3;',
    repl: 'rua = 6, Gpt = 1000000;',
    done: 'Gpt = 1000000' },
  // 18.1.11 锚点（簇扩为 5 常量：URo unexpected / GRo empty / zRo malformed-call 均抬 1e6；续跑 mwo、yield Ept）
  { name: 'empty/unexpected/malformed stop retries (18.1.11)', expect: 1,
    find: ', URo = 3, Sva = 4000, GRo = 3, zRo = 3, Eva = 1000,',
    repl: ', URo = 1000000, Sva = 4000, GRo = 1000000, zRo = 1000000, Eva = 1000,',
    done: 'URo = 1000000, Sva = 4000, GRo = 1000000, zRo = 1000000' },
  { name: 'session-stop continuation cap (18.1.11)', expect: 1,
    find: 'var mwo = 8, ',
    repl: 'var mwo = 1000000, ',
    done: 'var mwo = 1000000' },
  { name: 'subagent yield ladder (18.1.11)', expect: 1,
    find: 'ola = 6, Ept = 3;',
    repl: 'ola = 6, Ept = 1000000;',
    done: 'Ept = 1000000' },
  // 18.1.2 锚点（再漂移：q_o/L_o/OBa/IBa、uPo、Xxa/Ygt）
  { name: 'empty/unexpected stop retries (18.1.2)', expect: 1,
    find: ', q_o = 3, OBa = 4000, L_o = 3, IBa = 1000,',
    repl: ', q_o = 1000000, OBa = 4000, L_o = 1000000, IBa = 1000,',
    done: 'q_o = 1000000, OBa = 4000, L_o = 1000000' },
  { name: 'session-stop continuation cap (18.1.2)', expect: 1,
    find: 'var uPo = 8, ',
    repl: 'var uPo = 1000000, ',
    done: 'var uPo = 1000000' },
  { name: 'subagent yield ladder (18.1.2)', expect: 1,
    find: 'Xxa = 6, Ygt = 3;',
    repl: 'Xxa = 6, Ygt = 1000000;',
    done: 'Ygt = 1000000' },
  // 18.0.11 锚点（再漂移：MIo/OIo/aHa/lHa、s_o、mba/Rmt）
  { name: 'empty/unexpected stop retries (18.0.11)', expect: 1,
    find: ', MIo = 3, aHa = 4000, OIo = 3, lHa = 1000,',
    repl: ', MIo = 1000000, aHa = 4000, OIo = 1000000, lHa = 1000,',
    done: 'MIo = 1000000, aHa = 4000, OIo = 1000000' },
  { name: 'session-stop continuation cap (18.0.11)', expect: 1,
    find: 'var s_o = 8, ',
    repl: 'var s_o = 1000000, ',
    done: 'var s_o = 1000000' },
  { name: 'subagent yield ladder (18.0.11)', expect: 1,
    find: 'mba = 6, Rmt = 3;',
    repl: 'mba = 6, Rmt = 1000000;',
    done: 'Rmt = 1000000' },
  // 18.0.9 锚点（WAo 名字保留，其余再漂移：oWa/rWa、pMo、uCa/Yft）
  { name: 'empty/unexpected stop retries (18.0.9)', expect: 1,
    find: ', WAo = 3, oWa = 4000, UAo = 3, rWa = 1000,',
    repl: ', WAo = 1000000, oWa = 4000, UAo = 1000000, rWa = 1000,',
    done: 'WAo = 1000000, oWa = 4000, UAo = 1000000' },
  { name: 'session-stop continuation cap (18.0.9)', expect: 1,
    find: 'var pMo = 8, ',
    repl: 'var pMo = 1000000, ',
    done: 'var pMo = 1000000' },
  { name: 'subagent yield ladder (18.0.9)', expect: 1,
    find: 'uCa = 6, Yft = 3;',
    repl: 'uCa = 6, Yft = 1000000;',
    done: 'Yft = 1000000' },
  // 18.0.7 锚点（18.0.6 为 GAo/HAo/fvo/Jdt/gfa，再漂移：WAo/GAo/sUa/nUa、dMo、DTa/Rgt）
  { name: 'empty/unexpected stop retries (18.0.7)', expect: 1,
    find: ', WAo = 3, sUa = 4000, GAo = 3, nUa = 1000,',
    repl: ', WAo = 1000000, sUa = 4000, GAo = 1000000, nUa = 1000,',
    done: 'WAo = 1000000' },
  { name: 'session-stop continuation cap (18.0.7)', expect: 1,
    find: 'var dMo = 8, ',
    repl: 'var dMo = 1000000, ',
    done: 'var dMo = 1000000' },
  { name: 'subagent yield ladder (18.0.7)', expect: 1,
    find: 'DTa = 6, Rgt = 3;',
    repl: 'DTa = 6, Rgt = 1000000;',
    done: 'Rgt = 1000000' },
  // 18.0.6 锚点（历史版本重跑时仍可命中）
  { name: 'empty/unexpected stop retries (18.0.6)', expect: 1,
    find: ', GAo = 3, V1a = 4000, HAo = 3, $1a = 1000,',
    repl: ', GAo = 1000000, V1a = 4000, HAo = 1000000, $1a = 1000,',
    done: 'GAo = 1000000' },
  { name: 'session-stop continuation cap (18.0.6)', expect: 1,
    find: 'var fvo = 8, ',
    repl: 'var fvo = 1000000, ',
    done: 'var fvo = 1000000' },
  { name: 'subagent yield ladder (18.0.6)', expect: 1,
    find: 'gfa = 6, Jdt = 3;',
    repl: 'gfa = 6, Jdt = 1000000;',
    done: 'Jdt = 1000000' },
  // 18.0.4 锚点（历史版本重跑时仍可命中）
  { name: 'empty/unexpected stop retries (18.0.4)', expect: 1,
    find: ', uSo = 3, $_a = 4000, cSo = 3, V_a = 1000,',
    repl: ', uSo = 1000000, $_a = 4000, cSo = 1000000, V_a = 1000,',
    done: 'uSo = 1000000' },
  { name: 'session-stop continuation cap (18.0.4)', expect: 1,
    find: 'var YHs = 8, ',
    repl: 'var YHs = 1000000, ',
    done: 'var YHs = 1000000' },
  { name: 'subagent yield ladder (18.0.4)', expect: 1,
    find: 'Aaa = 6, ppt = 3;',
    repl: 'Aaa = 6, ppt = 1000000;',
    done: 'ppt = 1000000' },
];
for (const p of STOPCAP_PATCHES) {
  const c = s.split(p.find).length - 1;
  if (c === p.expect) {
    s = s.split(p.find).join(p.repl);
    ok++;
  } else if (c === 0 && (p.done ? s.includes(p.done) : s.includes(p.repl))) {
    ok++;
    console.log('patch SKIP: [stopcap] ' + p.name + ' (already patched)');
  } else {
    console.log('patch WARN: [stopcap] ' + p.name + ' found=' + c + ' expected=' + p.expect + ' (upstream changed?)');
    warn++;
  }
}
// ---- 补丁 4: 重放渲染完整性 ----
// A) 上游仅实时路径应用 retryRecovery，历史重建不画 → "error; retried" 恢复后消失；
//    在 assistant 追加函数尾部对主组件补调 applyRetryRecovery。
const REPLAY_PATCHES = [
  // 18.1.17 锚点(helper _Y/v_;showTurnTime 方法 #x)
  { name: 'retryRecovery replay (18.1.17)', expect: 1,
    find: '    this.#n = ke.get("display.showTokenUsage") && _Y(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#i = e.timestamp;\n    this.#l = this.#n ? v_(e) : undefined;\n    this.#u = this.#n && ke.get("display.showTurnTime") ? this.#x(e) : undefined;\n  }',
    repl: '    this.#n = ke.get("display.showTokenUsage") && _Y(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#i = e.timestamp;\n    this.#l = this.#n ? v_(e) : undefined;\n    this.#u = this.#n && ke.get("display.showTurnTime") ? this.#x(e) : undefined;\n    if (e.retryRecovery)\n      o.applyRetryRecovery(e.retryRecovery);\n  }',
    done: 'o.applyRetryRecovery' },
  // flush gate 回归(上游 18.1.2 撤回无条件 flush,17 又把 add 方法改名 #g、flush #R)
  { name: 'tail usage flush (18.1.17)', expect: 2,
    find: 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#R();',
    repl: 'this.#R();',
    done: 'for (const t of e)\n      this.#g(t);\n    this.#R();' },
  // 18.1.16 锚点(helper g8/R_;showTurnTime 方法 #S;usage-text 字段 #l->#u 变量重排)
  { name: 'retryRecovery replay (18.1.16)', expect: 1,
    find: '    this.#n = ke.get("display.showTokenUsage") && g8(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#i = e.timestamp;\n    this.#l = this.#n ? R_(e) : undefined;\n    this.#u = this.#n && ke.get("display.showTurnTime") ? this.#S(e) : undefined;\n  }',
    repl: '    this.#n = ke.get("display.showTokenUsage") && g8(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#i = e.timestamp;\n    this.#l = this.#n ? R_(e) : undefined;\n    this.#u = this.#n && ke.get("display.showTurnTime") ? this.#S(e) : undefined;\n    if (e.retryRecovery)\n      o.applyRetryRecovery(e.retryRecovery);\n  }',
    done: 'o.applyRetryRecovery' },
  // 18.1.12 锚点（helper eY/d_；showTurnTime 方法 #x；flush gate #y(t)+#k()）
  { name: 'retryRecovery replay (18.1.12)', expect: 1,
    find: '    this.#n = ke.get("display.showTokenUsage") && eY(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#i = e.timestamp;\n    this.#l = this.#n ? d_(e) : undefined;\n    this.#a = this.#n && ke.get("display.showTurnTime") ? this.#x(e) : undefined;\n  }',
    repl: '    this.#n = ke.get("display.showTokenUsage") && eY(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#i = e.timestamp;\n    this.#l = this.#n ? d_(e) : undefined;\n    this.#a = this.#n && ke.get("display.showTurnTime") ? this.#x(e) : undefined;\n    if (e.retryRecovery)\n      o.applyRetryRecovery(e.retryRecovery);\n  }',
    done: 'o.applyRetryRecovery' },
  { name: 'tail usage flush (18.1.12)', expect: 2,
    find: 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#k();',
    repl: 'this.#k();',
    done: 'this.#y(t);\n    this.#k();' },
  // 18.1.11 锚点（helper Q8/u_；字段序变化 #l=usage文本 #a=showTurnTime；flush gate 仍在需打）
  { name: 'retryRecovery replay (18.1.11)', expect: 1,
    find: '    this.#n = ke.get("display.showTokenUsage") && Q8(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#i = e.timestamp;\n    this.#l = this.#n ? u_(e) : undefined;\n    this.#a = this.#n && ke.get("display.showTurnTime") ? this.#S(e) : undefined;\n  }',
    repl: '    this.#n = ke.get("display.showTokenUsage") && Q8(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#i = e.timestamp;\n    this.#l = this.#n ? u_(e) : undefined;\n    this.#a = this.#n && ke.get("display.showTurnTime") ? this.#S(e) : undefined;\n    if (e.retryRecovery)\n      o.applyRetryRecovery(e.retryRecovery);\n  }',
    done: 'o.applyRetryRecovery' },
  { name: 'tail usage flush (18.1.11)', expect: 2,
    find: 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#k();',
    repl: 'this.#k();',
    done: 'this.#y(t);\n    this.#k();' },
  // 18.1.2 锚点（helper uQ/BP/ke；上游回退了 flush 无条件化——gate 复活，需再打；方法 #b→#S、组件 _c→Pp）
  { name: 'retryRecovery replay (18.1.2)', expect: 1,
    find: '    this.#n = ke.get("display.showTokenUsage") && uQ(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? BP(e) : undefined;\n    this.#l = this.#n && ke.get("display.showTurnTime") ? this.#k(e) : undefined;\n  }',
    repl: '    this.#n = ke.get("display.showTokenUsage") && uQ(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? BP(e) : undefined;\n    this.#l = this.#n && ke.get("display.showTurnTime") ? this.#k(e) : undefined;\n    if (e.retryRecovery)\n      o.applyRetryRecovery(e.retryRecovery);\n  }',
    done: 'o.applyRetryRecovery' },
  { name: 'tail usage flush (18.1.2)', expect: 2,
    find: 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#w();',
    repl: 'this.#w();',
    done: 'this.#y(t);\n    this.#w();' },
  // 18.0.11 锚点（helper xX/ke/_c；flush 门上游已原生无条件化——18.0.9 的 tail-flush 规则在此版本起自然失配，保留无害）
  { name: 'retryRecovery replay (18.0.11)', expect: 1,
    find: '    this.#n = ke.get("display.showTokenUsage") && _X(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? IP(e) : undefined;\n    this.#l = this.#n && ke.get("display.showTurnTime") ? this.#k(e) : undefined;\n  }',
    repl: '    this.#n = ke.get("display.showTokenUsage") && _X(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? IP(e) : undefined;\n    this.#l = this.#n && ke.get("display.showTurnTime") ? this.#k(e) : undefined;\n    if (e.retryRecovery)\n      o.applyRetryRecovery(e.retryRecovery);\n  }',
    done: 'o.applyRetryRecovery' },
  // 18.0.9 锚点（helper xX/IP→oX/CP；新增 showTurnTime 行；flush #y()→#C()；settings be→Re）
  { name: 'retryRecovery replay (18.0.9)', expect: 1,
    find: '    this.#n = Re.get("display.showTokenUsage") && oX(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? CP(e) : undefined;\n    this.#l = this.#n && Re.get("display.showTurnTime") ? this.#k(e) : undefined;\n  }',
    repl: '    this.#n = Re.get("display.showTokenUsage") && oX(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? CP(e) : undefined;\n    this.#l = this.#n && Re.get("display.showTurnTime") ? this.#k(e) : undefined;\n    if (e.retryRecovery)\n      o.applyRetryRecovery(e.retryRecovery);\n  }',
    done: 'o.applyRetryRecovery' },
  { name: 'tail usage flush (18.0.9)', expect: 2,
    find: 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#C();',
    repl: 'this.#C();',
    done: 'this.#w(t.message);\n    this.#C();' },
  // 18.0.6 锚点（18.0.4 为 _X/RP + #t/#e/#y，已漂移）
  { name: 'retryRecovery replay', expect: 1,
    find: '    this.#n = be.get("display.showTokenUsage") && fQ(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? BP(e) : undefined;\n  }',
    repl: '    this.#n = be.get("display.showTokenUsage") && fQ(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? BP(e) : undefined;\n    if (e.retryRecovery)\n      o.applyRetryRecovery(e.retryRecovery);\n  }',
    done: 'o.applyRetryRecovery' },
  // 18.0.7 锚点（helper fQ/BP→xX/IP；flush 锚与 18.0.4 相同：#T(t.message)+#y()）
  { name: 'retryRecovery replay (18.0.7)', expect: 1,
    find: '    this.#n = be.get("display.showTokenUsage") && xX(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? IP(e) : undefined;\n  }',
    repl: '    this.#n = be.get("display.showTokenUsage") && xX(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? IP(e) : undefined;\n    if (e.retryRecovery)\n      o.applyRetryRecovery(e.retryRecovery);\n  }',
    done: 'o.applyRetryRecovery' },
  { name: 'tail usage flush', expect: 2,
    find: 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#T();',
    repl: 'this.#T();',
    done: 'this.#y(t.message);\n    this.#T();' },
  // 18.0.4 锚点（历史版本重跑时仍可命中）
  { name: 'retryRecovery replay (18.0.4)', expect: 1,
    find: '    this.#n = be.get("display.showTokenUsage") && _X(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? RP(e) : undefined;\n  }',
    repl: '    this.#n = be.get("display.showTokenUsage") && _X(e.usage) ? e.usage : undefined;\n    this.#o = e.duration;\n    this.#r = e.ttft;\n    this.#a = e.timestamp;\n    this.#i = this.#n ? RP(e) : undefined;\n    if (e.retryRecovery)\n      o.applyRetryRecovery(e.retryRecovery);\n  }',
    done: 'o.applyRetryRecovery' },
  { name: 'tail usage flush', expect: 2,
    find: 'if (this.#t.size === 0 && this.#e.size === 0)\n      this.#y();',
    repl: 'this.#y();',
    done: 'this.#T(t.message);\n    this.#y();' },
];
for (const p of REPLAY_PATCHES) {
  const c = s.split(p.find).length - 1;
  if (c === p.expect) {
    s = s.split(p.find).join(p.repl);
    ok++;
    console.log('patch OK: [replay] ' + p.name);
  } else if (c === 0 && (p.done ? s.includes(p.done) : s.includes(p.repl))) {
    ok++;
    console.log('patch SKIP: [replay] ' + p.name + ' (already patched)');
  } else {
    console.log('patch WARN: [replay] ' + p.name + ' found=' + c + ' expected=' + p.expect + ' (upstream changed?)');
    warn++;
  }
}

// ---- 补丁 5: encrypted-content 回放失败自愈(18.1.17 起打) ----
// 背景:agentrouter 等第三方 Responses 网关背后是上游账号池,encrypted_content(gAAA.. Fernet)
//       只能由产出它的同一上游账号解密.下次请求落到别的池成员时回放密文 -> 400
//       "The encrypted content .. could not be verified. Reason: Encrypted content could not
//        be decrypted or parsed."(agentrouter astra 实测为 Azure OpenAI 资源池:
//       密文绑定创建它的 Azure 资源,回放落别的资源报 different Azure OpenAI resource;
//       strip 密文回放也报 Item with id .. not found -- 回放 reasoning item 完全不可行)
// 上游 omp 已有 StaleResponsesItem 自愈路径(错误分类 -> resetCurrentResponsesProviderSession
//       -> nativeHistoryReplayWarmed=false -> 重试不再回放加密推理),但分类条件 oRr(e) =
//       Xzs[0].test(e) || Xzs[1].test(e) && PCr.test(e) 中,agentrouter 文案既不命中
//       Xzs[0](Item with id .. not found)也不命中 Xzs[1](previous response),PCr 也不匹配.
// 另外主请求路径 Xni()/Obe() 硬编码 includeThinkingSignatures: true,重置 provider session
//       也挡不住下一轮回放 -- 对账号池型网关必须完全关闭 reasoning item 回放.
// 修复(共四处,单锚点各一):
//   a) Xzs[0] 增加分支 `|\\bencrypted content\\b[^.'\"]{0,200}?could not be (?:verified|decrypted|parsed)`
//      (密文 base64 夹在中间,不能写死相邻文案)
//   b) PCr 增加 |encrypted content could not be decrypted(双保险,覆盖 Xzs[1] 路径)
//   c) compat schema 增加 `replayResponsesReasoning?`: boolean(用户可在 models.yml 模型级
//      compat 里设 false,关闭该模型的 Responses reasoning item 回放)
//   d) T7 的 gate 钳制:`const c = ..` 前判 `e.model?.compat?.replayResponsesReasoning === false`
//      -> c = false -> bKe 跳过 thinking 回放(所有调用点共用 T7,单一入口)
// 效果:该 400 归为 stale-responses-item 零延迟重试(g=0)+ 会话自动恢复;对账号池型网关
//       配置 replayResponsesReasoning: false 后彻底不再回放 reasoning item,不再 400.
const ENCSTALE_PATCHES = [
  {
    name: 'Xzs[0] += encrypted-content-verify',
    find: "Xzs = [/\\bItem with id ['\"][^'\"]+['\"] not found\\.?/i, /previous[ _]?response/i];",
    repl: "Xzs = [/\\bItem with id ['\"][^'\"]+['\"] not found\\.?|\\bencrypted content\\b[^.'\"]{0,200}?could not be (?:verified|decrypted|parsed)/i, /previous[ _]?response/i];",
    done: 'encrypted content',
  },
  {
    name: 'PCr += encrypted-content-decrypt',
    find: 'PCr = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention/i;',
    repl: 'PCr = /not[ _]?found|invalid|expired|stale|zero[ _-]?data[ _-]?retention|encrypted content could not be decrypted/i;',
    done: 'encrypted content could not be decrypted',
  },
  {
    name: 'compat schema += replayResponsesReasoning',
    find: '"requiresToolResultId?": "boolean",\n      "replayUnsignedThinking?": "boolean"\n    };',
    repl: '"requiresToolResultId?": "boolean",\n      "replayUnsignedThinking?": "boolean",\n      "replayResponsesReasoning?": "boolean"\n    };',
    done: 'replayResponsesReasoning?',
  },
  {
    name: 'T7 gate honors replayResponsesReasoning=false',
    find: 'const c = e.includeThinkingSignatures ?? e.nativeHistory?.replay ?? true;',
    repl: 'const c = e.model?.compat?.replayResponsesReasoning === false ? false : e.includeThinkingSignatures ?? e.nativeHistory?.replay ?? true;',
    done: 'replayResponsesReasoning === false ? false :',
  },
];
for (const p of ENCSTALE_PATCHES) {
  const c = s.split(p.find).length - 1;
  if (c === 1) {
    s = s.split(p.find).join(p.repl);
    console.log('patch OK: [encstale] ' + p.name);
  } else if (c === 0 && s.includes(p.done)) {
    console.log('patch SKIP: [encstale] ' + p.name + ' (already patched)');
  } else {
    console.log('patch WARN: [encstale] ' + p.name + ' found=' + c + ' (upstream changed?)');
    warn++;
  }
}


fs.writeFileSync(file, s);
console.log('patched:', file, '| ok=' + ok + ' warn=' + warn);
process.exit(warn > 0 ? 1 : 0);
