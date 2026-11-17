import assert from "node:assert/strict";

/** Independent strict reader for the uncompressed PDF subset emitted by the invoice writer.
 * Checks byte offsets, object references, stream lengths and readable page text; no PDF-header-only pass.
 */
export function readInvoicePdf(bytes: Buffer): { pages: number; text: string } {
 const pdf = bytes.toString("latin1");
 assert.match(pdf, /^%PDF-1\.4\n/u);
 const tail = /startxref\n(\d+)\n%%EOF\s*$/u.exec(pdf);
 assert.ok(tail, "PDF needs a cross-reference trailer");
 const xref = Number(tail[1]);
 assert.equal(pdf.slice(xref, xref + 5), "xref\n");
 const entries = /^xref\n0 (\d+)\n([\s\S]*?)trailer << \/Size (\d+) \/Root 1 0 R >>/u.exec(pdf.slice(xref));
 assert.ok(entries, "xref and catalog root must be present");
 const count = Number(entries[1]);
 assert.equal(count, Number(entries[3]));
 const offsets = entries[2]!.trimEnd().split("\n");
 assert.equal(offsets.length, count);
 const objects = new Map<number, string>();
 for (let id = 1; id < count; id++) {
  const offset = Number(offsets[id]!.slice(0, 10));
  assert.equal(pdf.slice(offset, offset + `${id} 0 obj\n`.length), `${id} 0 obj\n`);
  const end = pdf.indexOf("\nendobj\n", offset);
  assert.ok(end > offset);
  objects.set(id, pdf.slice(offset + `${id} 0 obj\n`.length, end));
 }
 assert.match(objects.get(1)!, /\/Type \/Catalog \/Pages 2 0 R/u);
 const tree = objects.get(2)!;
 const pageIds = [...tree.matchAll(/(\d+) 0 R/gu)].map(m => Number(m[1]));
 assert.equal(pageIds.length, Number(/\/Count (\d+)/u.exec(tree)?.[1]));
 assert.ok(pageIds.length > 0);
 const texts: string[] = [];
 for (const id of pageIds) {
  const page = objects.get(id)!;
  assert.match(page, /\/Type \/Page /u);
  assert.match(objects.get(Number(/\/F1 (\d+) 0 R/u.exec(page)?.[1]))!, /\/Type \/Font/u);
  const content = objects.get(Number(/\/Contents (\d+) 0 R/u.exec(page)?.[1]))!;
  const stream = /<< \/Length (\d+) >>\nstream\n([\s\S]*)\nendstream$/u.exec(content);
  assert.ok(stream);
  assert.equal(Buffer.byteLength(stream[2]!, "latin1"), Number(stream[1]));
  const rows = [...stream[2]!.matchAll(/\(((?:\\[\s\S]|[^\\()])*)\) Tj/gu)];
  assert.ok(rows.length > 0, "each page must have readable text");
  texts.push(...rows.map(r => r[1]!.replace(/\\([\\()])/gu, "$1")));
 }
 return { pages: pageIds.length, text: texts.join("\n") };
}
