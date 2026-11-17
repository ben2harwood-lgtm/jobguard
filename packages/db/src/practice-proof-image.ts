import { deflateSync } from "node:zlib";

function crc32(bytes: Buffer) {
 let crc = 0xffffffff;
 for (const value of bytes) {
  crc ^= value;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
 }
 return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
 const name = Buffer.from(type), out = Buffer.alloc(data.length + 12);
 out.writeUInt32BE(data.length, 0);
 name.copy(out, 4); data.copy(out, 8);
 out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
 return out;
}
/** Generated fictional originals. Keep default bytes stable for existing proof
 * hashes; J3 adds an explicit caption rather than pretending to analyse pixels. */
export function generatePracticePng(fixture: "completion-photo" | "j3-drainage-photo" = "completion-photo") {
 const header = Buffer.alloc(13);
 header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4);
 header[8] = 8; header[9] = 2;
 const pixels = Buffer.from([0, 36, 110, 64, 60, 130, 74, 0, 48, 120, 68, 72, 145, 82]);
 return Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
  ...(fixture === "j3-drainage-photo" ? [chunk("tEXt", Buffer.from("Description\0Fictional practice photo: fitted garden drainage. Estimated extra: £500 net.", "latin1"))] : []),
  chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
 ]);
}
