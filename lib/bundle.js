// Helpers for reading Bun standalone executables and the module sources they embed.
'use strict';
const { parseExe, readModules } = require('./rebuild.js');

// Locate the module table of a Bun standalone exe and return its modules.
function loadModules(buf) {
  const { bun } = parseExe(buf);
  const ds = bun.rawPtr + 8;
  const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
  const O = ds + hdr - 16 - 32;
  const modOff = buf.readUInt32LE(O + 8);
  const modLen = buf.readUInt32LE(O + 12);
  return { mods: readModules(buf, ds, modOff, modLen), ds, O, modOff, modLen };
}

const moduleName = (m) => m.name.toString('latin1').replace(/\0/g, '');
const moduleSource = (m) => m.contents.slice(0, -1).toString('utf8');

// The Bun standalone loader decodes module sources as latin1, so every non-ASCII character is
// written as a \uXXXX escape. Pure-ASCII source means the same thing under any decoding.
function asciiEscape(s) {
  return s.replace(/[^\x00-\x7F]+/g, (m) => {
    let out = '';
    for (let i = 0; i < m.length; i++) {
      const c = m.charCodeAt(i);
      out += c <= 0xFFFF ? '\\u' + c.toString(16).padStart(4, '0') : m[i];
    }
    return out;
  });
}

const unescapeU = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// Literals that the code compares, switches on or enumerates. Translating any of them changes
// program logic (for example "removed" -> "移除d"), so the build refuses a dictionary that
// contains one of them.
function comparedLiterals(mods) {
  const compared = new Set();
  const pats = [
    /(?:===|!==|==|!=)\s*["']([^"'\n]{1,120})["']/g,
    /case\s+["']([^"'\n]{1,120})["']/g,
    /\b(?:act|type|kind|op|purpose|mode|status|action)\s*===\s*["']([^"'\n]{1,120})["']/g,
    /values:\s*\[([^\]]{1,400})\]/g,
  ];
  for (const m of mods) {
    const s = m.contents.toString('utf8');
    for (const re of pats) {
      re.lastIndex = 0;
      let x;
      while ((x = re.exec(s)) !== null) {
        if (re === pats[3]) {
          for (const q of x[1].matchAll(/["']([^"'\n]{1,120})["']/g)) compared.add(q[1]);
        } else {
          compared.add(x[1]);
        }
      }
    }
  }
  return compared;
}

module.exports = { loadModules, moduleName, moduleSource, asciiEscape, unescapeU, comparedLiterals };
