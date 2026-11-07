// Detect over-translation: a translated literal that the code uses as a value rather than as
// display text. A word can be both — `Power` is a settings section label and a puppeteer key
// name — and the dictionary matches text only, so a shared literal cannot be scoped by position.
// The 2026-11-08 audit found `Power: { key: "电源/Power", code: "电源/Power" }` in puppeteer's
// USKeyboardLayout this way; that broke `keyboard.press("Power")`.
//
// Positions checked (a hit is always a defect, not a style choice):
//   object key            { "…": … }
//   computed index        o["…"]  and  o?.["…"]
//   comparison            === / !== / == / != / case
//   Map/Set key argument  .set("…"), .get("…"), .has("…"), .delete("…")
//   matcher argument      .includes/.startsWith/.endsWith/.indexOf/.lastIndexOf/.split("…")
//   RegExp source         new RegExp("…")
//   structural fields     key/code/type/id/role: "…"
//
// Strings holding both Chinese and English (the house style is "中文/English") are display text and
// never match a comparison or a key, because the code compares the original English only.
'use strict';

const CJK = '[\\u4e00-\\u9fff]';

const RULES = [
  ['object key', new RegExp(`[{,]\\s*("[^"\\n]*${CJK}[^"\\n]*")\\s*:`, 'g')],
  // A base token must sit immediately before the bracket: `foo["…"]`, `foo?.["…"]`,
  // `f()["…"]`. `return ["…"]` and `keys: ["…"]` are array literals, not index reads.
  ['computed index', new RegExp(`(?:[A-Za-z0-9_$)\\]]|\\?\\.)\\[\\s*("[^"\\n]*${CJK}[^"\\n]*")\\s*\\]`, 'g')],
  ['comparison', new RegExp(`(?:===|!==|==|!=|case)\\s*("[^"\\n]*${CJK}[^"\\n]*")`, 'g')],
  ['Map/Set key', new RegExp(`\\.(?:set|get|has|delete)\\(\\s*("[^"\\n]*${CJK}[^"\\n]*")`, 'g')],
  ['matcher argument', new RegExp(`\\.(?:includes|startsWith|endsWith|indexOf|lastIndexOf|split)\\(\\s*("[^"\\n]*${CJK}[^"\\n]*")`, 'g')],
  ['RegExp source', new RegExp(`new RegExp\\(\\s*("[^"\\n]*${CJK}[^"\\n]*")`, 'g')],
  ['structural field', new RegExp(`(?:^|[{,])\\s*(?:key|code|type|id|role):\\s*"[^"\\n]*${CJK}[^"\\n]*"`, 'g')],
];

function unescapeUnicode(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// modules: [{ index, text }] where text is already decoded UTF-8 source (or ascii-escaped; both work)
function scan(modules) {
  const violations = [];
  for (const m of modules) {
    const text = m.text.includes('\\u') ? unescapeUnicode(m.text) : m.text;
    for (const [kind, re] of RULES) {
      re.lastIndex = 0;
      let hit;
      while ((hit = re.exec(text)) !== null) {
        violations.push({
          kind,
          module: m.index,
          literal: hit[0].slice(0, 120).replace(/\s+/g, ' '),
          context: text.slice(Math.max(0, hit.index - 70), hit.index + hit[0].length + 30).replace(/\s+/g, ' '),
        });
      }
    }
  }
  return violations;
}

module.exports = { scan, RULES };
