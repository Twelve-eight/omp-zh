// 18.2.4 锚点扫描(避免展开语法,防工具链折叠)
const fs = require('fs');
const d = fs.readFileSync('G:/omp works/Tools/omp-zh/work/cli-18_2_8.js', 'utf8');
const uniq = (arr) => Array.from(new Set(arr));
const show = (t, x) => console.log('\n=== ' + t + ' ===\n' + x);

// 1) stopcap
{
  const j = d.indexOf('unexpected stop after retry cap');
  const seg = d.slice(j - 900, j);
  const vars = uniq(Array.from(seg.matchAll(/this\.#[a-zA-Z_$]+ > ([A-Za-z_$][A-Za-z0-9_$]*)/g)).map(x => x[1]));
  show('unexpected cap vars', vars.join(','));
  for (const v of vars) { const k = d.indexOf(v + ' = 3'); if (k > 0) console.log('cluster:', JSON.stringify(d.slice(k - 30, k + 130))); }
}
// 2) session cap
{
  const k2 = d.indexOf('session_stop continuation cap reached');
  const seg2 = d.slice(k2 - 500, k2);
  const vars = uniq(Array.from(seg2.matchAll(/this\.#[a-zA-Z_$]+ >= ([A-Za-z_$][A-Za-z0-9_$]*)/g)).map(x => x[1]));
  console.log('\nsess cap vars:', vars.join(','));
  for (const v of vars) { const k = d.indexOf(v + ' = 8,'); if (k > 0) console.log('sess decl:', JSON.stringify(d.slice(k - 40, k + 90))); }
}
// 3) yield ladder
{
  const y = d.indexOf('reminders."');
  const seg3 = d.slice(y - 500, y + 500);
  console.log('\nyield:', JSON.stringify(uniq(Array.from(seg3.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*) = 6, ([A-Za-z_$][A-Za-z0-9_$]*) = 3;/g)).map(x => x[0]))));
}
// 4) leaks
{
  const re = /Bun\.spawn\(([a-z]), \{ env: process\.env, stdin: "ignore", stdout: ([a-z]), stderr: \2, cwd: ([\w$]+)\(\) \}\)/g;
  let m; while ((m = re.exec(d))) console.log('tunnel:', JSON.stringify(m[0]));
  const s = d.indexOf('"ignore", stderr: "ignore", cwd: ');
  console.log('ssh:', JSON.stringify(d.slice(s - 70, s + 95)));
  for (const mm of d.matchAll(/Bun\.spawn\([a-z], \{\n[^;]{10,320}?\n\s*\}\)/g)) {
    const ss = mm[0]; if (ss.includes('windowsHide')) continue;
    if (ss.includes('.bytes')) console.log('uploader-sh:', JSON.stringify(ss.slice(0, 190)));
  }
  const c = d.indexOf('Bun.spawn([s, ');
  if (c > 0) console.log('chrome:', JSON.stringify(d.slice(c - 40, c + 170)));
  const pw = d.indexOf('windowsHide: iZt(');
  console.log('python-kernel iZt:', pw > 0 ? JSON.stringify(d.slice(pw - 80, pw + 140)) : 'NOT FOUND');
}
// 5) replay
{
  let i2 = d.indexOf('showTokenUsage") && ');
  while (i2 !== -1) {
    const c = d.slice(i2, i2 + 360);
    if (c.includes('? e.usage : undefined')) { show('replay inject', JSON.stringify(d.slice(i2 - 6, i2 + 470))); break; }
    i2 = d.indexOf('showTokenUsage") && ', i2 + 1);
  }
  const re = /if \(this\.#([a-z])\.size === 0 && this\.#([a-z])\.size === 0\)/g;
  let m, n = 0;
  while ((m = re.exec(d)) && n < 4) { console.log('gate:', JSON.stringify(d.slice(m.index - 40, m.index + 80))); n++; }
}
// 6) encstale
{
  const re2 = /[A-Za-z_$][\w$]* = \[\/\\bItem with id/;
  const mm = re2.exec(d);
  console.log('\nstale regex array:', mm ? JSON.stringify(d.slice(mm.index, mm.index + 150)) : 'NOT FOUND');
  const re3 = /[A-Za-z_$][\w$]* = \/not\[ _\]\?found/;
  const m3 = re3.exec(d);
  console.log('retention regex:', m3 ? JSON.stringify(d.slice(m3.index, m3.index + 140)) : 'NOT FOUND');
  for (const [label, pat] of [['T7', 'includeThinkingSignatures ?? '], ['QLt items', 'const f = d?.items;'], ['compat', '"requiresToolResultId?": "boolean"']]) {
    const i = d.indexOf(pat);
    console.log(label + ':', i > 0 ? JSON.stringify(d.slice(i - 50, i + 110)) : 'NOT FOUND');
  }
  const re4 = /const g = ([\w$]+)\(e\.supportsComputerUse === true \? c : ([\w$]+)\(c\), e, i, l, ([^,]+), a, false, true, undefined, u\);/;
  const m4 = re4.exec(d);
  console.log('QLt call:', m4 ? JSON.stringify(m4[0]) : 'NOT FOUND');
  const D3 = String.fromCharCode(46, 46, 46);
  const re5 = new RegExp('return ([\\w$]+)\\(s \\? \\[' + D3 + 's, ' + D3 + '([\\w$]+)\\] : \\2\\);');
  const m5 = re5.exec(d);
  console.log('Xni:', m5 ? JSON.stringify(m5[0]) : 'NOT FOUND');
  const mb = d.indexOf('model: e.requestModelId ?? e.id');
  console.log('Mbe site:', mb > 0 ? JSON.stringify(d.slice(mb - 80, mb + 180)) : 'NOT FOUND');
}
