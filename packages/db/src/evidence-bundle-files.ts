/** Deliberately small export subset: PDF 1.4 text pages and ZIP STORE, no compression or executable content. */
export function bundlePdf(lines: string[]): Buffer {
  // The readable index uses ASCII IDs/hashes; source bytes stay in their separate artifacts.
  const literal = (text: string) => `(${text.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&')})`;
  lines = lines.flatMap(line => line.match(/.{1,100}/g) ?? ['']);
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / 45)) }, (_, i) => lines.slice(i * 45, i * 45 + 45));
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'];
  const kids: string[] = [];
  for (const page of pages) {
    const id = objects.length + 1;
    kids.push(`${id} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`);
    const stream = `BT /F1 8 Tf 36 756 Td 15 TL\n${page.map(line => `${literal(line)} Tj T*`).join('\n')}\nET\n`;
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`);
  }
  objects[1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(' ')}] >>`;
  let text = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const safePath = (path: string) => /^(?:manifest\.json|summary\.pdf|sources\/[a-f0-9]{64}\.json)$/u.test(path);
/** Fixed DOS epoch, ASCII paths, sorted members. No timestamps or host metadata vary between exports. */
export function bundleZip(files: ReadonlyMap<string, Buffer>): Buffer {
  if (files.size > 10000) throw new Error('BUNDLE_ARCHIVE_INVALID');
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [path, bytes] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (!safePath(path) || bytes.length > 32 * 1024 * 1024) throw new Error('BUNDLE_ARCHIVE_INVALID');
    const name = Buffer.from(path), crc = crc32(bytes), local = Buffer.alloc(30), directory = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(bytes.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    locals.push(local, name, bytes); central.push(directory, name); offset += local.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
/** Accept only our bounded STORE subset. Exact re-encoding rejects duplicate paths, overlaps and inconsistent central headers. */
export function readBundleZip(zip: Buffer): Map<string, Buffer> {
  if (zip.length > 64 * 1024 * 1024) throw new Error('BUNDLE_ARCHIVE_INVALID');
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18), length = zip.readUInt16LE(offset + 26), extra = zip.readUInt16LE(offset + 28);
    const start = offset + 30 + length + extra, end = start + size;
    const path = zip.subarray(offset + 30, offset + 30 + length).toString('ascii');
    if (end > zip.length || !safePath(path) || files.has(path) || files.size >= 10000) throw new Error('BUNDLE_ARCHIVE_INVALID');
    files.set(path, zip.subarray(start, end)); offset = end;
  }
  if (!bundleZip(files).equals(zip)) throw new Error('BUNDLE_ARCHIVE_INVALID');
  return files;
}
