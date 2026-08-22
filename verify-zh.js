// verify-zh.js — omp 汉化自动化管线：翻译产物验证器
// 用法: node verify-zh.js <orig-cli.js> <zh-cli.js>
// 退出码: 0 = 通过(PASS), 1 = 失败(FAIL), 2 = 用法错误
//
// 检查项:
//   1. 字面量数一致性 —— 复用 translate.js 的 scanStrings，模板/非模板分开比较；
//      数量不等说明翻译破坏了引号配对（注入了未转义引号）
//   2. 引号/模板配对 —— 对 zh 全文词法扫描（复用 scanStrings 的
//      skipString/findTemplateEnd 思路），报告无法闭合的字符串/模板位置
//   3. 语法粗查 —— 统计花括号/圆括号/方括号配对（忽略字符串内），报告不平衡
//   4. CJK 注入统计 —— zh 相对 orig 新增的 CJK 字符数（信息性，不参与成败）
// 任一失败 → 打印 FAIL 并 exit 1；全过 → 打印 PASS 并 exit 0
'use strict';

const fs = require('fs');
const path = require('path');
const { scanStrings } = require(path.join(__dirname, 'translate.js'));

// ---------- 词法辅助（与 translate.js 的 skipString/findTemplateEnd 完全同思路） ----------
function makeLexer(code) {
  const n = code.length;

  function isRegexStart(i) {
    if (code[i] !== '/') return false;
    if (code[i + 1] === '/' || code[i + 1] === '*') return false; // comment
    let j = i - 1;
    while (j >= 0 && /\s/.test(code[j])) j--;
    if (j < 0) return true;
    const c = code[j];
    if ('([{:;,=!&|?+-*%^~<>'.includes(c)) return true;
    const wm = code.slice(Math.max(0, j - 8), j + 1).match(/[A-Za-z_$][\w$]*$/);
    if (wm && ['return', 'typeof', 'instanceof', 'delete', 'void', 'new', 'case', 'in', 'of', 'do', 'else', 'yield', 'await'].includes(wm[0])) return true;
    return false;
  }

  function skipRegex(i) {
    // i at regex start '/'
    let j = i + 1;
    let inClass = false;
    while (j < n) {
      const c = code[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) return j + 1;
      j++;
    }
    return n;
  }

  function skipRegexAt(i) {
    return isRegexStart(i) ? skipRegex(i) : -1;
  }

  function skipString(i) {
    // i at opening quote; returns index after closing quote (or n if 无法闭合)
    const q = code[i];
    let j = i + 1;
    while (j < n) {
      if (code[j] === '\\') { j += 2; continue; }
      if (code[j] === q) return j + 1;
      j++;
    }
    return n;
  }

  function skipInterpolation(i) {
    // i = first char after ${ ; returns index after matching } (or n)
    let depth = 1;
    while (i < n) {
      const c = code[i];
      if (c === '`') { i = findTemplateEnd(i); continue; }
      if (c === '"' || c === "'") { i = skipString(i); continue; }
      if (c === '/' && code[i + 1] === '*') { const e = code.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === '/' && code[i + 1] === '/') { const e = code.indexOf('\n', i); i = e < 0 ? n : e + 1; continue; }
      if (c === '/') { const e = skipRegexAt(i); if (e > 0) { i = e; continue; } }
      if (c === '\\') { i += 2; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return i + 1; }
      i++;
    }
    return n;
  }

  function findTemplateEnd(tickPos) {
    // returns index after the template's closing tick (or n)
    let j = tickPos + 1;
    while (j < n) {
      const c = code[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') return j + 1;
      if (c === '$' && code[j + 1] === '{') {
        j = skipInterpolation(j + 2);
        continue;
      }
      j++;
    }
    return n;
  }

  return { skipString, findTemplateEnd, skipRegexAt };
}

// ---------- 检查 2 + 3：词法扫描，找未闭合字符串/模板，同时统计括号 ----------
function lexScan(code) {
  const n = code.length;
  const L = makeLexer(code);
  const unclosed = [];
  let curly = 0, paren = 0, square = 0;

  let i = 0;
  while (i < n) {
    const c = code[i];
    if (c === '"' || c === "'") {
      const e = L.skipString(i);
      if (e >= n) {
        // 无法闭合：记录位置，跳过该引号继续扫，尽可能多报告
        unclosed.push({ kind: 'string', pos: i, quote: c });
        i += 1;
        continue;
      }
      i = e;
      continue;
    }
    if (c === '`') {
      const e = L.findTemplateEnd(i);
      if (e >= n) {
        unclosed.push({ kind: 'template', pos: i });
        i += 1;
        continue;
      }
      i = e;
      continue;
    }
    if (c === '/' && code[i + 1] === '/') { const e = code.indexOf('\n', i); i = e < 0 ? n : e + 1; continue; }
    if (c === '/' && code[i + 1] === '*') { const e = code.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '/') { const e = L.skipRegexAt(i); if (e > 0) { i = e; continue; } }
    if (c === '{') curly++;
    else if (c === '}') curly--;
    else if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === '[') square++;
    else if (c === ']') square--;
    i++;
  }
  return { unclosed, brackets: { curly, paren, square } };
}

function summarizeLiterals(lits) {
  let strings = 0, templates = 0;
  for (const l of lits) {
    if (l.isTemplate) templates++; else strings++;
  }
  return { strings, templates, total: lits.length };
}

// ---------- 检查 4：CJK 字符统计（含 CJK 标点/假名/扩展区/全角） ----------
const CJK_RE = /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/g;
function countCJK(code) {
  const m = code.match(CJK_RE);
  return m ? m.length : 0;
}

function posToLineCol(code, pos) {
  let line = 1, col = 1;
  const end = Math.min(pos, code.length);
  for (let i = 0; i < end; i++) {
    if (code[i] === '\n') { line++; col = 1; } else { col++; }
  }
  return { line, col };
}

// ---------- 主流程 ----------
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('用法: node verify-zh.js <orig-cli.js> <zh-cli.js>');
    process.exit(2);
  }
  const [origPath, zhPath] = args;
  const orig = fs.readFileSync(origPath, 'utf8');
  const zh = fs.readFileSync(zhPath, 'utf8');

  // 1. 字面量数一致性
  const origLits = summarizeLiterals(scanStrings(orig));
  const zhLits = summarizeLiterals(scanStrings(zh));
  const litOk = origLits.strings === zhLits.strings && origLits.templates === zhLits.templates;

  // 2 + 3. 未闭合检测 + 括号平衡（zh 为判定对象，orig 供参考）
  const zhScan = lexScan(zh);
  const origScan = lexScan(orig);
  const bracketsOk = zhScan.brackets.curly === 0 && zhScan.brackets.paren === 0 && zhScan.brackets.square === 0;

  // 4. CJK 增量
  const cjkOrig = countCJK(orig);
  const cjkZh = countCJK(zh);

  // ---- 报告 ----
  console.log('=== verify-zh 翻译产物验证 ===');
  console.log(`原文件:   ${origPath}`);
  console.log(`译文文件: ${zhPath}`);
  console.log('');

  console.log('[1] 字面量数一致性 (scanStrings)');
  console.log(`  orig: 普通字符串=${origLits.strings}, 模板=${origLits.templates}, 合计=${origLits.total}`);
  console.log(`  zh:   普通字符串=${zhLits.strings}, 模板=${zhLits.templates}, 合计=${zhLits.total}`);
  if (litOk) console.log('  结果: OK');
  else console.log('  结果: MISMATCH —— 翻译破坏了引号配对（可能注入了未转义引号）');

  console.log('');
  console.log('[2] 引号/模板配对 (zh 全文词法扫描)');
  if (zhScan.unclosed.length === 0) {
    console.log('  未闭合: 无');
  } else {
    for (const u of zhScan.unclosed) {
      const p = posToLineCol(zh, u.pos);
      console.log(`  未闭合${u.kind === 'template' ? '模板' : '字符串'} @ 第${p.line}行 第${p.col}列 (pos ${u.pos}, quote ${u.quote || '`'})`);
    }
  }
  console.log(zhScan.unclosed.length === 0 ? '  结果: OK' : '  结果: FAIL —— 存在无法闭合的字符串/模板');

  console.log('');
  console.log('[3] 括号配对粗查 (忽略字符串内)');
  const bo = origScan.brackets, b = zhScan.brackets;
  console.log(`  orig: { ${bo.curly} }  ( ${bo.paren} )  [ ${bo.square} ]`);
  console.log(`  zh:   { ${b.curly} }  ( ${b.paren} )  [ ${b.square} ]`);
  console.log(bracketsOk ? '  结果: OK' : '  结果: FAIL —— 括号不平衡');

  console.log('');
  console.log('[4] CJK 注入统计');
  console.log(`  orig: ${cjkOrig} 个 CJK 字符`);
  console.log(`  zh:   ${cjkZh} 个 CJK 字符`);
  console.log(`  新增: ${cjkZh - cjkOrig} 个 CJK 字符（zh 相对 orig）`);
  console.log('');

  const failures = [];
  if (!litOk) failures.push('字面量数不一致');
  if (zhScan.unclosed.length > 0) failures.push('存在未闭合字符串/模板');
  if (!bracketsOk) failures.push('括号不平衡');

  if (failures.length === 0) {
    console.log('VERIFY_RESULT: PASS');
    process.exit(0);
  } else {
    console.log('VERIFY_RESULT: FAIL');
    console.log('失败原因: ' + failures.join('; '));
    process.exit(1);
  }
}

main();
