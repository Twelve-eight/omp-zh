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

  // ---- 18.2.1+ bytecode 布局:零位移外科手术 ----
  // 布局: [前缀区 Z(=53MB,含 mod0 的 45MB bytecode + 结构数据)][contents][names][table][tailZone][argv][offsets][marker]
  // 运行时优先执行 mod0 bytecode -> 改源码无效(实测).做法:
  //   1) 失效 mod0 bytecode 指针(rest+8/+12 置 0) -> 运行时回退 JS 源码
  //   2) 失效后的 45MB 空间成为自由区;被改模块的新内容写入该区,只改其记录(off/len)
  //   3) 其余字节(前缀/未改模块/表位置/argv/offsets/marker/文件大小)完全不动 -> 无需重排,
  //      前缀内指向 contents 的 66 万处指针与 rest 内跨区指针全部保持有效
  const bcOff0 = mods.length ? buf.readUInt32LE(dataStart + modOff + 24) : 0;
  const bcLen0 = mods.length ? buf.readUInt32LE(dataStart + modOff + 28) : 0;
  if (bcOff0 > 0 && bcLen0 > 0 && !process.env.OMP_LEGACY_REBUILD) {
    const out = Buffer.from(buf); // 就地修改副本
    const freeStart = bcOff0;
    const freeEnd = bcOff0 + bcLen0;
    let cursor = freeStart;
    let placed = 0, unchanged = 0;
    for (let i = 0; i < mods.length; i++) {
      if (newContents[i] === undefined) { unchanged++; continue; }
      const body = newContents[i];
      if (cursor + body.length + 1 > freeEnd) {
        throw new Error('rebuild: bytecode free region too small (' + (freeEnd - freeStart) + ' B) for module ' + i + ' (' + body.length + ' B)');
      }
      out.write(body.toString('latin1'), dataStart + cursor, 'latin1');
      out[dataStart + cursor + body.length] = 0; // NUL 终止
      const p = dataStart + modOff + i * 52;
      out.writeUInt32LE(cursor, p + 8);
      out.writeUInt32LE(body.length, p + 12);
      cursor += body.length + 1;
      placed++;
    }
    // 失效 mod0 bytecode(其空间已被复用)
    out.writeUInt32LE(0, dataStart + modOff + 24);
    out.writeUInt32LE(0, dataStart + modOff + 28);
    if (process.env.OMP_REBUILD_STATS) {
      console.error('rebuild[modeB]: placed=' + placed + ' unchanged=' + unchanged + ' free=' + (freeEnd - freeStart) + ' used=' + (cursor - freeStart));
    }
    return out;
  }

  // ---- 18.2.1+: 模块级 bytecode 失效化(源码路径回退) ----
  // 18.2.1 起 mod0 的 rest+8/+12 指向 dataStart 处 45MB 预编译 bytecode(前缀区),
  // 运行时优先执行 bytecode -> 改 JS 源码无效(实测:就地改源码 --help 不变).
  // 实测:清零该模块 bytecode 指针/长度后,Bun 回退到 JS 源码(改源码立即生效,
  // --help/--version 正常).故汉化构建一律清除 bytecode 指针(仅 mod0 有值;
  // 其余模块该槽位为 0).副作用:失去预编译加速(启动略慢),换来可翻译性.
  const STRIP_BYTECODE = process.env.OMP_KEEP_BYTECODE ? false : true;
  const contents = mods.map((m, i) => (newContents[i] !== undefined ? newContents[i] : m.contents.slice(0, m.contents.length - 1)));

  // ---- 18.1.17 布局适配(2026-09-11 发现) ----
  // Bun 1.4.2 打包图布局: [contents 区][names 区][模块表][尾部区域][offsets][marker]
  // - names 不再与 contents 交错,集中打包在 contents 之后(18.1.16 及以前为逐模块交错)
  // - 模块表(modOff+modLen)与 argv 之间新增区域(18.1.17: 1268B 零+u32=1;含义未知,loader 运行时读取)
  //   丢失该区域 -> 启动段错误(零改动 roundtrip 也崩,已实测)
  // 策略: 按新布局重建 contents/names/table;尾部区域零字节区与 argv 原样保留,
  //       offsets 结构按新位置重新生成(其 byte_count 为自引用指针)
  const tableEnd = modOff + modLen;
  const argvAbs = dataStart + argvOff;
  const marker = buf.slice(dataStart + header - 16, dataStart + header); // '\n---- Bun! ----\n'
  const tailZone = buf.slice(dataStart + tableEnd, argvAbs);            // 表尾与 argv 之间的区域,原样保留

  // ---- 18.2.1 布局适配(2026-09-16 发现) ----
  // 新布局: [前缀区 Z][contents 区][names 区][模块表][尾部区][argv][offsets][marker]
  // 前缀区(Z = 首个被引用偏移,18.2.1 约 53MB)存放**模块级预编译 bytecode**,非填充:
  //   - 非零内容约 40MB;mod0 的 bytecode 位于 prefix+120,长度 45,542,072(rest+8/rest+12)
  //   - 每个模块的 rest+32 均指向前缀区内(320/320)
  //   - 前缀内还有 662,483 个 u32 落在 [Z, tableEnd) 内(指向 contents/names 区)
  // 因此: 前缀必须原样保留,contents/names/table 整体后移 Z,且**所有跨区绝对偏移需按
  //       新位置重写**:rest 各槽位 u32 落在 [Z, tableEnd) 者加 delta;前缀内同类引用无法
  //       安全改写(字节码内部结构未知)-> 该布局下前缀引用失效,见下方 fail-fast 判定.
  let Z = Infinity;
  for (let i = 0; i < mods.length; i++) {
    const p = dataStart + modOff + i * 52;
    Z = Math.min(Z, buf.readUInt32LE(p), buf.readUInt32LE(p + 8));
  }
  if (!Number.isFinite(Z)) Z = 0;
  const prefix = buf.slice(dataStart, dataStart + Z); // 原样保留

  // contents 区(模块序, 各自 NUL 结尾)
  const cParts = [];
  const cOffs = [];
  let cOff = Z;
  mods.forEach((m, i) => {
    cOffs.push(cOff);
    const b = Buffer.concat([contents[i], Buffer.from([0])]);
    cParts.push(b);
    cOff += b.length;
  });
  // names 区(原样含 NUL, 模块序)
  const nParts = [];
  const nOffs = [];
  let nOff = cOff;
  mods.forEach((m, i) => {
    nOffs.push(nOff);
    nParts.push(m.name);
    nOff += m.name.length;
  });
  const tableStart = nOff;

  // 模块表: name/contents 偏移重写;rest 内落在 [Z, tableEnd) 的 u32 按位移重定位
  const delta = tableStart - Z; // 相对原布局的位移(原 contents 起点即 Z)
  const tableBytes = Buffer.alloc(modLen);
  let relocated = 0;
  let stripped = 0;
  mods.forEach((m, i) => {
    const p = i * 52;
    tableBytes.writeUInt32LE(nOffs[i], p);
    tableBytes.writeUInt32LE(m.name.length - 1, p + 4);
    tableBytes.writeUInt32LE(cOffs[i], p + 8);
    tableBytes.writeUInt32LE(contents[i].length, p + 12);
    m.rest.copy(tableBytes, p + 16);
    if (STRIP_BYTECODE) {
      // rest+8(bytecode offset)/rest+12(bytecode length): 置 0 -> 运行时回退源码
      const bcOff = tableBytes.readUInt32LE(p + 24);
      if (bcOff !== 0) { tableBytes.writeUInt32LE(0, p + 24); tableBytes.writeUInt32LE(0, p + 28); stripped++; }
    }
    for (let k = 16; k < 52; k += 4) {
      const v = tableBytes.readUInt32LE(p + k);
      if (v >= Z && v < tableEnd) { tableBytes.writeUInt32LE(v + delta, p + k); relocated++; }
    }
  });

  // 尾部: prefix + contents + names + table + tailZone + argv\0 + offsets + marker
  const argvStart = tableStart + modLen + tailZone.length;
  const byteCount = argvStart + argv.length + 1;
  const offsets = Buffer.alloc(32);
  offsets.writeUInt32LE(byteCount, 0);
  offsets.writeUInt32LE(0, 4);
  offsets.writeUInt32LE(tableStart, 8);
  offsets.writeUInt32LE(modLen, 12);
  offsets.writeUInt32LE(entryPointId, 16);
  offsets.writeUInt32LE(argvStart, 20);
  offsets.writeUInt32LE(argvLen, 24);
  offsets.writeUInt32LE(flags, 28);
  const newData = Buffer.concat([prefix].concat(cParts, nParts, [tableBytes, tailZone, argv, Buffer.from([0]), offsets, marker]));
  if (newData.length > 0xFFFFFFFF - 8) throw new Error('data too big');
  if (process.env.OMP_REBUILD_STATS) {
    console.error('rebuild: Z=' + Z + ' delta=' + delta + ' restRelocated=' + relocated + ' bytecodeStripped=' + stripped + ' modules=' + mods.length);
  }

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
  const headBytes = buf.slice(0, bun.rawPtr);
  const tailPad = Buffer.alloc(newRawSize - newVSize);
  return Buffer.concat([headBytes, newHeader, newData, tailPad]);
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
