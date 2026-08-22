// 汉化补丁：对新提取的官方 cli.js 应用确定性文本补丁
// 1. catalog: deepseek-v4-flash/v4-pro（aimlapi）compat.supportsForcedToolChoice:false
//    （thinking 模式下强制 tool_choice 会 400；17.4.0 起 efforts 已原生含 "max"，无需再加）
// 2. focus 补丁已移除：17.4.0 showTreeSelector 关闭回调原生调用 focusActiveEditorArea()
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


fs.writeFileSync(file, s);
console.log('patched:', file, '| ok=' + ok + ' warn=' + warn);
process.exit(warn > 0 ? 1 : 0);
