// web-translate.js — 对 exe 内 Web UI 模块（mod3 导出页 HTML / mod4 主题 JS / mod5 工具视图）应用汉化
// 安全策略：
//   mod3/mod4（HTML 为主）：仅替换完整属性值 title="X"/aria-label="X"/placeholder="X" 与完整文本节点 >X<
//   mod5（压缩 JS）：用 translate.js 的字面量级替换（full 整体相等才命中）
// 导出: translateWeb(dictOrPath) → { 3:Buffer, 4:Buffer, 5:Buffer }（同时写 work/web-out/ 供检查）
// CLI : node web-translate.js <dict.json>
'use strict';
const fs = require('fs');
const path = require('path');
const { translate } = require(path.join(__dirname, 'translate.js'));

const T = __dirname;

function translateWeb(dictOrPath) {
  const dict = Array.isArray(dictOrPath) ? dictOrPath : JSON.parse(fs.readFileSync(dictOrPath, 'utf8'));
  const zhOf = (from) => {
    const e = dict.find((x) => x.from === from);
    return e ? e.to.split('/')[0] : null;
  };
  fs.mkdirSync(T + '/work/web-out', { recursive: true });
  let nHtml = 0, nJs = 0;
  const out = {};

  // ---- mod3 / mod4: HTML 属性与文本节点 ----
  for (const idx of [3, 4]) {
    const f = idx === 3 ? 'mod3-template' : 'mod4-template';
    let s = fs.readFileSync(T + '/work/' + f, 'utf8');
    // 完整属性值: title="X" | aria-label="X" | placeholder="X"
    s = s.replace(/(title|aria-label|placeholder)="([^"]*)"/g, (full, attr, val) => {
      const zh = zhOf(val);
      if (!zh || zh === val) return full;
      nHtml++;
      return attr + '="' + zh + '/' + val + '"';
    });
    // 完整文本节点: >X< （X 非空、无标签字符）
    s = s.replace(/>([^<>{}]+)</g, (full, val) => {
      const v = val.trim();
      if (!v) return full;
      const zh = zhOf(v);
      if (!zh || zh === v) return full;
      nHtml++;
      return '>' + val.replace(v, zh + '/' + v) + '<';
    });
    out[idx] = Buffer.from(s, 'utf8');
    fs.writeFileSync(T + '/work/web-out/' + f, s);
  }

  // ---- mod5: JS 字面量级翻译 ----
  {
    const src = fs.readFileSync(T + '/work/mod5-tool-views.generated', 'utf8');
    const { code, count } = translate(src, dict);
    out[5] = Buffer.from(code, 'utf8');
    nJs = count;
    fs.writeFileSync(T + '/work/web-out/mod5-tool-views.generated', code);
  }
  return { mods: out, htmlCount: nHtml, jsCount: nJs };
}

module.exports = { translateWeb };

if (require.main === module) {
  const dictFile = process.argv[2];
  if (!dictFile) { console.error('usage: node web-translate.js <dict.json>'); process.exit(2); }
  const r = translateWeb(dictFile);
  console.log('web-translate: html attrs/nodes=' + r.htmlCount + ', js literals=' + r.jsCount);
}
