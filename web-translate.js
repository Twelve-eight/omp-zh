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

  // ---- HTML 模块（导出页 template.html + oauth.html）：HTML 属性与文本节点 ----
  for (const slot of ['html', 'oauth']) {
    const f = slot === 'html' ? 'web-html' : 'web-oauth';
    let s = fs.readFileSync(T + '/work/' + f, 'utf8');
    s = s.replace(/(title|aria-label|placeholder)="([^"]*)"/g, (full, attr, val) => {
      const zh = zhOf(val);
      if (!zh || zh === val) return full;
      nHtml++;
      return attr + '="' + zh + '/' + val + '"';
    });
    s = s.replace(/>([^<>{}]+)</g, (full, val) => {
      const v = val.trim();
      if (!v) return full;
      const zh = zhOf(v);
      if (!zh || zh === v) return full;
      nHtml++;
      return '>' + val.replace(v, zh + '/' + v) + '<';
    });
    out[slot] = Buffer.from(s, 'utf8');
    fs.writeFileSync(T + '/work/web-out/' + f, s);
  }

  // ---- JS 模块（template.js 主题 + tool-views 工具视图）：字面量级翻译 ----
  for (const slot of ['js', 'views']) {
    const f = slot === 'js' ? 'web-js' : 'web-views';
    const src = fs.readFileSync(T + '/work/' + f, 'utf8');
    const { code, count } = translate(src, dict);
    out[slot] = Buffer.from(code, 'utf8');
    nJs += count;
    fs.writeFileSync(T + '/work/web-out/' + f, code);
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
