const fs = require('fs');
const { parseExe, readModules } = require('./rebuild.js');

const SRC = './work/omp-dl-18111.exe';
const buf = fs.readFileSync(SRC);
const { bun } = parseExe(buf);
const ds = bun.rawPtr + 8;
const hdr = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
const O = ds + hdr - 16 - 32;
const modOff = buf.readUInt32LE(O + 8), modLen = buf.readUInt32LE(O + 12);
const mods = readModules(buf, ds, modOff, modLen);

console.log('Module count:', mods.length);
console.log('modLen:', modLen);
console.log('Expected (2917):', 2917 * 52);

// Check entry point and key modules
mods.forEach((m, i) => {
  const name = m.name.toString('latin1').replace(/\0/g, '');
  if (i < 15 || name.includes('omp-windows') || name.includes('CHANGELOG')) {
    const bcOff = m.contents.length > 24 ? m.contents.readUInt32LE(24) : 0;
    const bcLen = m.contents.length > 28 ? m.contents.readUInt32LE(28) : 0;
    console.log(`mod ${i}: ${name.substring(0,50)} size=${m.contents.length} bytecode=[${bcOff},${bcLen})`);
  }
});

// Verify argv start
const argvOff = buf.readUInt32LE(O + 20), argvLen = buf.readUInt32LE(O + 24);
const argvStr = buf.slice(ds + argvOff, ds + argvOff + argvLen).toString('latin1');
console.log('argv:', argvStr);
