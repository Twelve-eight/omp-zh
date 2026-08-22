// scan-gaps.js — 新英文文本发现器
// 检测新版 cli.js 中未被字典覆盖的句子型英文字面量 + 死条目清单。
// 用法: node scan-gaps.js <cli.js路径> [dict1.json dict2.json ...]   （字典可多个，未传则只输出字面量统计）
// 复用 translate.js 的 scanStrings / translate。只读既有文件，不修改任何字典/源码。
'use strict';
const fs = require('fs');
const path = require('path');
const { translate, scanStrings } = require(path.join(__dirname, 'translate.js'));

const cliPath = process.argv[2];
if (!cliPath) {
  console.error('用法: node scan-gaps.js <cli.js路径> [dict1.json dict2.json ...]');
  process.exit(2);
}
const dictFiles = process.argv.slice(3);

// ---------- 字典加载 + 合并去重（与 build-zh.js 一致：from|mode） ----------
const dict = [];
const seen = new Set();
for (const f of dictFiles) {
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    console.error(`无法读取字典 ${f}: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(arr)) {
    console.error(`字典格式错误（应为 JSON 数组）: ${f}`);
    process.exit(1);
  }
  for (const e of arr) {
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') continue;
    const mode = e.mode === 'sub' ? 'sub' : 'full';
    const key = e.from + '|' + mode;
    if (seen.has(key)) continue;
    seen.add(key);
    dict.push({ from: e.from, to: e.to, mode });
  }
}

// ---------- 扫描字面量 ----------
const src = fs.readFileSync(cliPath, 'utf8');
const literals = scanStrings(src);
const total = literals.length;
const templates = literals.filter((l) => l.isTemplate).length;
const nonTemplates = total - templates;

// ---------- 权威命中统计（translate.js 的 translate()） ----------
const { code, count, changed } = translate(src, dict);

// ---------- 逐字面量命中分类（与 translate() 的 applyTo 语义一致） ----------
const fulls = dict.filter((e) => e.mode === 'full');
const subs = dict.filter((e) => e.mode === 'sub');

function stripInterp(s) {
  return s.replace(/\$\{[^}]*\}/g, '');
}

// 返回 'full' | 'sub' | null —— 该字面量是否会被字典命中
function classify(lit) {
  if (lit.isTemplate) {
    for (const e of fulls) if (lit.content === e.from) return 'full';
    const outside = stripInterp(lit.content);
    for (const e of subs) if (outside.includes(e.from)) return 'sub';
    return null;
  }
  for (const e of fulls) if (lit.content === e.from) return 'full';
  for (const e of subs) if (lit.content.includes(e.from)) return 'sub';
  return null;
}

let fullHits = 0;
let subHits = 0;
for (const l of literals) {
  const c = classify(l);
  if (c === 'full') fullHits++;
  else if (c === 'sub') subHits++;
}

// ---------- 未命中句子型过滤 ----------
const RE_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/; // 纯标识符
const RE_NUM = /^[+-]?(?:\d[\d,_]*)(?:\.\d+)?%?$/; // 纯数字
const RE_URL = /^[a-z][a-z0-9+.-]*:\/\/\S*$/i; // URL
const RE_WINPATH = /^[A-Za-z]:[\\/]/; // Windows 路径开头

function isNonUi(s) {
  if (s.length < 6 || s.length > 200) return true;
  if (!/\s/.test(s)) return true; // 需含空格
  if (/[\r\n]/.test(s)) return true; // 无换行
  if (s.includes('${')) return true; // 无插值
  if (RE_IDENT.test(s)) return true;
  if (RE_NUM.test(s)) return true;
  if (RE_URL.test(s)) return true;
  if (RE_WINPATH.test(s)) return true;
  return false;
}

// 疑似 UI 文本排序分：大写开头词/连词/常见 UI 词/标点加分
const UI_WORDS = /^(the|a|an|and|or|of|to|for|with|by|from|in|on|at|is|are|was|were|be|been|this|that|these|those|you|your|please|press|enter|select|choose|usage|error|type|run|use|using|file|command|option|value|name|help|mode|list|show|set|get|new|not|no|yes|true|false)$/i;
function uiScore(s) {
  const words = s.split(/\s+/);
  let score = 0;
  for (const w of words) {
    const clean = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (!clean) continue;
    // 全大写词（SQL 关键字、flag 等）不给分，避免 SELECT/FROM/AND 类噪音排前
    if (/^[A-Z]{3,}$/.test(clean)) continue;
    if (/^[A-Z]/.test(clean)) score += 3; // 首字母大写 → 疑似标题/标签
    else if (clean.length >= 5) score += 1;
    if (UI_WORDS.test(clean)) score += 1;
    else if (/[a-z]/i.test(clean) && clean.length >= 3) score += 1;
  }
  if (/[.!?:]$/.test(s)) score += 2;
  return score;
}

const gapContents = new Set();
for (const l of literals) {
  if (classify(l)) continue;
  if (isNonUi(l.content)) continue;
  gapContents.add(l.content);
}
const gaps = [...gapContents].sort(
  (a, b) => uiScore(b) - uiScore(a) || b.length - a.length || a.localeCompare(b)
);

// ---------- 死条目检测（full 需完全相等，sub 需包含） ----------
const dead = [];
for (const e of dict) {
  const hit = e.mode === 'full'
    ? literals.some((l) => l.content === e.from)
    : literals.some((l) => l.content.includes(e.from));
  if (!hit) dead.push(e);
}

// ---------- 报告 ----------
console.log('========== 字面量统计 ==========');
console.log(`总字面量: ${total}（模板: ${templates}，非模板: ${nonTemplates}）`);
console.log('');
console.log('========== 命中统计 ==========');
console.log(`full 命中: ${fullHits}`);
console.log(`sub 命中: ${subHits}`);
console.log(`translate() 替换处数: ${count}（命中字面量: ${changed}）`);
console.log('');
console.log(`========== 未命中句子型清单（疑似 UI 文本，共 ${gaps.length} 条）==========`);
for (const g of gaps) console.log(`"${g}"`);
console.log('');
console.log(`========== 死条目清单（${dead.length} 条）==========`);
for (const e of dead) console.log(`[${e.mode}] ${e.from}`);
console.log('');
console.log(`UNTRANSLATED_COUNT: ${gaps.length}`);
