// OMP exe 模块图重建工具
// 用法: node rebuild.js <src.exe> <out.exe> <m0-new.js 或 ->
// 说明: 读取 src.exe 的 .bun 模块图, 用给定文件替换模块0(入口JS)的 contents, 重建全部偏移/长度/PE头
const fs = require('fs');

const SEC_PTR = 0x3c;
function parseExe(buf) {
  const peOff = buf.readUInt32LE(SEC_PTR);
  const numSections = buf.readUInt16LE(peOff + 6);
  const optSize = buf.readUInt16LE(peOff + 20);
  const secTable = peOff + 24 + optSize;
  let bun = null;
  for (let i = 0; i < numSections; i++) {
    const p = secTable + i * 40;
    const name = buf.slice(p, p + 8).toString('latin1').replace(/\0/g, '');
    if (name === '.bun') bun = { index: i, rawPtr: buf.readUInt32LE(p + 20), rawSize: buf.readUInt32LE(p + 16), vsize: buf.readUInt32LE(p + 8), vaddr: buf.readUInt32LE(p + 12) };
  }
  if (!bun) throw new Error('.bun section not found');
  const optOff = peOff + 24;
  const sectionAlignment = buf.readUInt32LE(optOff + 32);
  const fileAlignment = buf.readUInt32LE(optOff + 36);
  const sizeOfImageOff = optOff + 56;
  const sizeOfImage = buf.readUInt32LE(sizeOfImageOff);
  return { peOff, secTable, numSections, optSize, bun, sectionAlignment, fileAlignment, sizeOfImageOff, sizeOfImage };
}

function readModules(buf, dataStart, modOff, modLen) {
  const recSize = 52;
  const count = Math.floor(modLen / recSize);
  const mods = [];
  for (let i = 0; i < count; i++) {
    const p = dataStart + modOff + i * recSize;
    mods.push({
      name: buf.slice(dataStart + buf.readUInt32LE(p), dataStart + buf.readUInt32LE(p) + buf.readUInt32LE(p + 4) + 1), // +null
      contents: buf.slice(dataStart + buf.readUInt32LE(p + 8), dataStart + buf.readUInt32LE(p + 8) + buf.readUInt32LE(p + 12) + 1),
      rest: buf.slice(p + 16, p + 52), // sourcemap/bytecode/module_info/bop SP + enums (all copied verbatim)
    });
  }
  return mods;
}

// rebuild: newContents[i] = 不含结尾\0 的新 contents 字节 (undefined = 保持原样)
function rebuild(buf, newContents) {
  const { bun, sectionAlignment, fileAlignment, sizeOfImageOff } = parseExe(buf);
  const dataStart = bun.rawPtr + 8;
  const header = Number(BigInt(buf.readUInt32LE(bun.rawPtr)) | (BigInt(buf.readUInt32LE(bun.rawPtr + 4)) << 32n));
  const O = dataStart + header - 16 - 32; // Offsets
  const modOff = buf.readUInt32LE(O + 8);
  const modLen = buf.readUInt32LE(O + 12);
  const entryPointId = buf.readUInt32LE(O + 16);
  const argvOff = buf.readUInt32LE(O + 20);
  const argvLen = buf.readUInt32LE(O + 24);
  const flags = buf.readUInt32LE(O + 28);
  const argv = buf.slice(dataStart + argvOff, dataStart + argvOff + argvLen); // 不含\0

  const mods = readModules(buf, dataStart, modOff, modLen);
  const contents = mods.map((m, i) => (newContents[i] !== undefined ? newContents[i] : m.contents.slice(0, m.contents.length - 1)));

  // strings: name\0 + contents\0
  const parts = [];
  mods.forEach((m, i) => {
    parts.push(m.name);
    parts.push(Buffer.concat([contents[i], Buffer.from([0])]));
  });
  const stringsLen = parts.reduce((a, b) => a + b.length, 0);
  const tableStart = stringsLen;
  const tableBytes = Buffer.alloc(modLen);
  let off = 0;
  mods.forEach((m, i) => {
    const p = i * 52;
    tableBytes.writeUInt32LE(off, p);            // name.offset
    tableBytes.writeUInt32LE(m.name.length - 1, p + 4); // name.length
    const coff = off + m.name.length;
    tableBytes.writeUInt32LE(coff, p + 8);       // contents.offset
    tableBytes.writeUInt32LE(contents[i].length, p + 12); // contents.length
    m.rest.copy(tableBytes, p + 16);
    off = coff + contents[i].length + 1;
  });
  const argvStart = tableStart + modLen;
  const offsets = Buffer.alloc(32);
  offsets.writeUInt32LE(argvStart + argv.length + 1, 0); // byte_count = argv起点+len+1(\0) = Offsets起点
  offsets.writeUInt32LE(0, 4);
  offsets.writeUInt32LE(tableStart, 8);
  offsets.writeUInt32LE(modLen, 12);
  offsets.writeUInt32LE(entryPointId, 16);
  offsets.writeUInt32LE(argvStart, 20);
  offsets.writeUInt32LE(argvLen, 24);
  offsets.writeUInt32LE(flags, 28);
  const newData = Buffer.concat([...parts, tableBytes, argv, Buffer.from([0]), offsets, Buffer.from('\n---- Bun! ----\n')]);
  if (newData.length > 0xFFFFFFFF - 8) throw new Error('data too big');

  // assemble exe
  const newHeader = Buffer.alloc(8);
  newHeader.writeUInt32LE(newData.length, 0);
  const newVSize = 8 + newData.length;
  const newRawSize = Math.ceil(newVSize / fileAlignment) * fileAlignment;
  const bunSec = buf.length > 0 ? (() => { const { secTable } = parseExe(buf); return secTable + bun.index * 40; })() : 0;
  // patch PE
  buf.writeUInt32LE(newVSize, bunSec + 8);
  buf.writeUInt32LE(newRawSize, bunSec + 16);
  buf.writeUInt32LE(Math.ceil((bun.vaddr + newVSize) / sectionAlignment) * sectionAlignment, sizeOfImageOff);
  const head = buf.slice(0, bun.rawPtr);
  const tail = Buffer.alloc(newRawSize - newVSize);
  const out = Buffer.concat([head, newHeader, newData, tail]);
  return out;
}

if (require.main === module) {
  const [src, dst, m0file] = process.argv.slice(2);
  const buf = fs.readFileSync(src);
  const newContents = m0file && m0file !== '-' ? [fs.readFileSync(m0file)] : [];
  const out = rebuild(buf, newContents);
  fs.writeFileSync(dst, out);
  console.log('written', dst, out.length, 'dataLen', out.length - (parseExe(buf).bun.rawPtr) - 8 + 8 - 8);
}
module.exports = { rebuild, parseExe, readModules };
