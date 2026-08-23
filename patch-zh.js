// 汉化补丁：对新提取的官方 cli.js 应用确定性文本补丁
// 1. catalog: deepseek-v4-flash/v4-pro（aimlapi）compat.supportsForcedToolChoice:false
//    （thinking 模式下强制 tool_choice 会 400；17.4.0 起 efforts 已原生含 "max"，无需再加）
// 2. focus 补丁已移除：17.4.0 showTreeSelector 关闭回调原生调用 focusActiveEditorArea()
// 3. Windows 控制台泄漏修复（18.0.1 起打）：强制基础设施子进程 windowsHide:true
// 4. 停止恢复无上限（18.0.3 起打）：empty-stop/unexpected-stop/session-stop 续跑/yield 阶梯上限抬至 1e6
// 用法: node patch-zh.js <cli.js路径>   （原地修改；失败仅警告，不中断）
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('usage: node patch-zh.js <cli.js>'); process.exit(2); }
let s = fs.readFileSync(file, 'utf8');

let ok = 0, warn = 0;

// ---- 补丁 1: catalog compat（仅 deepseek-v4-flash / v4-pro 条目内 supportsForcedToolChoice → false） ----
// 注意幂等检查必须限定在这两个条目窗口内：全文件有大量其他模型的 supportsForcedToolChoice:false
const MODELS = ['"deepseek-v4-flash"', '"deepseek-v4-pro"'];
for (const name of MODELS) {
  const i = s.indexOf(name);
  if (i < 0) {
    console.log('patch WARN: ' + name + ' not found (upstream changed?) — tool_choice fix NOT applied');
    warn++;
    continue;
  }
  const win = s.slice(i, i + 2500);
  if (win.includes('supportsForcedToolChoice: false')) {
    console.log('patch SKIP: ' + name + ' compat already patched');
    ok++;
  } else if (win.includes('supportsForcedToolChoice: true')) {
    s = s.slice(0, i) + win.replace('supportsForcedToolChoice: true', 'supportsForcedToolChoice: false') + s.slice(i + win.length);
    ok++;
    console.log('patch OK: ' + name + ' supportsForcedToolChoice → false');
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
  { name: 'blob-broker tunnel', expect: 1,
    find: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o })',
    repl: 'Bun.spawn(e, { env: process.env, stdin: "ignore", stdout: o, stderr: o, windowsHide: true })',
    done: 'stdout: o, stderr: o, windowsHide: true })' },
  { name: 'blob-broker ssh tunnel', expect: 1,
    find: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore" });',
    repl: '], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore", windowsHide: true });',
    done: 'stderr: "ignore", windowsHide: true });' },
  { name: 'uploader self-hosted', expect: 1,
    find: 'const f = Bun.spawn(d, { stdin: u.bytes, stdout: "ignore", stderr: "pipe" });',
    repl: 'const f = Bun.spawn(d, { stdin: u.bytes, stdout: "ignore", stderr: "pipe", windowsHide: true });',
    done: 'stdin: u.bytes, stdout: "ignore", stderr: "pipe", windowsHide: true });' },
  { name: 'uploader', expect: 1,
    find: 'const l = Bun.spawn(a, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });',
    repl: 'const l = Bun.spawn(a, { stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true });',
    done: 'stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true });' },
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
  { name: 'empty/unexpected stop retries', expect: 1,
    find: ', KRo = 3, VIa = 4000, XRo = 3, YIa = 1000,',
    repl: ', KRo = 1000000, VIa = 4000, XRo = 1000000, YIa = 1000,',
    done: 'KRo = 1000000' },
  { name: 'session-stop continuation cap', expect: 1,
    find: 'var xbo = 8, ',
    repl: 'var xbo = 1000000, ',
    done: 'var xbo = 1000000' },
  { name: 'subagent yield ladder', expect: 1,
    find: 'voa = 6, sct = 3;',
    repl: 'voa = 6, sct = 1000000;',
    done: 'sct = 1000000' },
];
for (const p of STOPCAP_PATCHES) {
  const c = s.split(p.find).length - 1;
  if (c === p.expect) {
    s = s.split(p.find).join(p.repl);
    ok++;
    console.log('patch OK: [stopcap] ' + p.name);
  } else if (c === 0 && (p.done ? s.includes(p.done) : s.includes(p.repl))) {
    ok++;
    console.log('patch SKIP: [stopcap] ' + p.name + ' (already patched)');
  } else {
    console.log('patch WARN: [stopcap] ' + p.name + ' found=' + c + ' expected=' + p.expect + ' (upstream changed?)');
    warn++;
  }
}


fs.writeFileSync(file, s);
console.log('patched:', file, '| ok=' + ok + ' warn=' + warn);
process.exit(warn > 0 ? 1 : 0);
