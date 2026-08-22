// 汉化翻译工具 v6：扫描器支持嵌套模板/插值，其余逻辑同 v5
const fs = require('fs');

function makeScanner(code) {
  const n = code.length;
  const results = [];
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
    // i at opening quote; returns index after closing quote (or n)
    const q = code[i];
    let j = i + 1;
    while (j < n) {
      if (code[j] === '\\') { j += 2; continue; }
      if (code[j] === q) return j + 1;
      j++;
    }
    return n;
  }
  function findTemplateEnd(tickPos) {
    // returns index after the template's closing tick
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
  function skipInterpolation(i) {
    // i = first char after ${ ; returns index after matching }
    let depth = 1;
    while (i < n) {
      const c = code[i];
      if (c === '`') { i = findTemplateEnd(i); continue; }
      if (c === '"' || c === "'") { i = skipString(i); continue; }
      if (c === '/' && code[i + 1] === '*') { const e = code.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === '/' && code[i + 1] === '/') { const e = code.indexOf('\n', i); i = e < 0 ? n : e + 1; continue; }
      if (c === '/' ) { const e = skipRegexAt(i); if (e > 0) { i = e; continue; } }
      if (c === '\\') { i += 2; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return i + 1; }
      i++;
    }
    return n;
  }
  // scan region [start,end) for string literals (used inside interpolations)
  function scanRegion(start, end) {
    let i = start;
    while (i < end) {
      const c = code[i];
      if (c === '"' || c === "'") {
        const q = c;
        let j = i + 1;
        let content = '';
        let closed = false;
        while (j < end) {
          const ch = code[j];
          if (ch === '\\') { content += code[j] + (code[j + 1] ?? ''); j += 2; continue; }
          if (ch === q) { results.push({ start: i, end: j + 1, quote: q, content }); i = j + 1; closed = true; break; }
          content += ch; j++;
        }
        if (!closed) { results.push({ start: i, end, quote: q, content }); i = end; }
      } else if (c === '`') {
        const e = findTemplateEnd(i);
        if (e <= i) { i++; continue; }
        // record nested template, then scan its interpolations
        results.push({ start: i, end: e, quote: '`', content: code.slice(i + 1, e - 1), isTemplate: true });
        let k = i + 1;
        while (k < e - 1) {
          if (code[k] === '\\') { k += 2; continue; }
          if (code[k] === '$' && code[k + 1] === '{') {
            const m = skipInterpolation(k + 2);
            scanRegion(k + 2, Math.min(m, e - 1));
            k = m;
          } else k++;
        }
        i = e;
      } else if (c === '/' && code[i + 1] === '/') {
        const e = code.indexOf('\n', i); i = e < 0 || e >= end ? end : e + 1;
      } else if (c === '/' && code[i + 1] === '*') {
        const e = code.indexOf('*/', i + 2); i = e < 0 || e >= end ? end : e + 2;
      } else if (c === '/') {
        const e = skipRegexAt(i);
        if (e > 0 && e <= end) { i = e; continue; }
        i++;
      } else { i++; }
    }
  }
  // main scan
  let i = 0;
  while (i < n) {
    const c = code[i];
    if (c === '"' || c === "'") {
      const e = skipString(i);
      if (e >= n) break;
      results.push({ start: i, end: e, quote: c, content: code.slice(i + 1, e - 1) });
      i = e;
    } else if (c === '`') {
      const e = findTemplateEnd(i);
      if (e >= n) { results.push({ start: i, end: n, quote: '`', content: code.slice(i + 1), isTemplate: true }); break; }
      results.push({ start: i, end: e, quote: '`', content: code.slice(i + 1, e - 1), isTemplate: true });
      // nested literals inside interpolations
      let k = i + 1;
      while (k < e - 1) {
        if (code[k] === '\\') { k += 2; continue; }
        if (code[k] === '$' && code[k + 1] === '{') {
          const m = skipInterpolation(k + 2);
          scanRegion(k + 2, Math.min(m, e - 1));
          k = m;
        } else k++;
      }
      i = e;
    } else if (c === '/' && code[i + 1] === '/') {
      const e = code.indexOf('\n', i); i = e < 0 ? n : e + 1;
    } else if (c === '/' && code[i + 1] === '*') {
      const e = code.indexOf('*/', i + 2); i = e < 0 ? n : e + 2;
    } else if (c === '/') {
      const e = skipRegexAt(i);
      if (e > 0) { i = e; continue; }
      i++;
    } else { i++; }
  }
  results.sort((a, b) => a.start - b.start);
  const out = [];
  let prev = null;
  for (const r of results) {
    if (prev && prev.start === r.start && prev.end === r.end) continue;
    out.push(r);
    prev = r;
  }
  return out;
}

function replaceOutsideInterp(text, from, to) {
  if (!text.includes(from)) return text;
  let res = '';
  let idx = 0;
  const re = /\$\{[^}]*\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    res += text.slice(idx, m.index).split(from).join(to) + m[0];
    idx = m.index + m[0].length;
  }
  res += text.slice(idx).split(from).join(to);
  return res;
}

function translate(src, dict) {
  const fulls = dict.filter((e) => e.mode === 'full').sort((a, b) => b.from.length - a.from.length);
  const subs = dict.filter((e) => e.mode === 'sub').sort((a, b) => b.from.length - a.from.length);
  const literals = makeScanner(src);

  function applyTo(content, isTemplate) {
    for (const e of fulls) {
      if (content === e.from) return { content: e.to, hit: true };
    }
    let hit = false;
    subs.forEach((e, idx) => {
      const ph = '\uE000' + idx + '\uE001';
      const before = content;
      content = isTemplate ? replaceOutsideInterp(content, e.from, ph) : content.split(e.from).join(ph);
      if (content !== before) hit = true;
    });
    subs.forEach((e, idx) => {
      const ph = '\uE000' + idx + '\uE001';
      if (content.includes(ph)) content = content.split(ph).join(e.to);
    });
    return { content, hit };
  }

  const repl = new Map();
  let changed = 0;
  for (const l of literals) {
    if (l.isTemplate) {
      const nested = literals.filter((x) => !x.isTemplate && x.start > l.start && x.end < l.end);
      let content = l.content;
      let delta = 0;
      let nestedHit = false;
      for (const x of nested) {
        const r = applyTo(x.content, false);
        if (r.hit) {
          const relStart = x.start - l.start - 1 + delta, relEnd = x.end - l.start - 1 + delta;
          const piece = x.quote + r.content + x.quote;
          content = content.slice(0, relStart) + piece + content.slice(relEnd);
          delta += piece.length - (relEnd - relStart);
          nestedHit = true;
        }
      }
      const r = applyTo(content, true);
      if (r.hit || nestedHit) { repl.set(l.start, r.hit ? r.content : content); changed++; }
    } else {
      const r = applyTo(l.content, false);
      if (r.hit) { repl.set(l.start, r.content); changed++; }
    }
  }

  const out = [];
  let last = 0;
  let count = 0;
  for (const l of literals) {
    if (l.start < last) continue;
    out.push(src.slice(last, l.start));
    if (repl.has(l.start)) {
      out.push(l.quote + repl.get(l.start) + l.quote);
      count++;
    } else {
      out.push(l.quote + l.content + l.quote);
    }
    last = l.end;
  }
  out.push(src.slice(last));
  return { code: out.join(''), count, changed };
}

if (require.main === module) {
  const [src, dst, dictFile] = process.argv.slice(2);
  const dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'));
  const { code, count, changed } = translate(fs.readFileSync(src, 'utf8'), dict);
  fs.writeFileSync(dst, code);
  console.log('strings changed:', count, '/ literals', changed);
}
module.exports = { translate, scanStrings: (code) => makeScanner(code) };
