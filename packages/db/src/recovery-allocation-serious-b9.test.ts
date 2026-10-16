import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { RecoveryAllocationRepository } from "./recovery-allocation-repository.js";

// Exercise the existing reader before the database guard; these doubles prove no PostgreSQL guarantees.
const invoice = randomUUID(), payment = randomUUID(), movement = randomUUID(), line = randomUUID(), evidence = randomUUID();
const at = "2026-10-16T10:00:00.000001Z";
const receipt = { id: payment, invoice_id: invoice, movement_id: movement, movement_at: at, invoice_net_pence: "32000", invoice_gross_pence: "38400" };
const command = { action: "review", grossPence: 38400, paymentId: payment };
const baseLine = { id: line, net_pence: "32000", gross_pence: "38400", invoice_net_pence: "32000", invoice_gross_pence: "38400", existed_at: "2026-10-15T10:00:00Z" };
const saved = { version: "recovery-remittance.v1", paymentId: payment, invoiceId: invoice, shares: [{ lineId: line, gross: { numerator: "38400", denominator: "1" } }] };
function png(content: string) {
 const prefix = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");
 const payload = Buffer.from(`jobguard-remittance\0${content}`), kind = Buffer.from("tEXt"), crcInput = Buffer.concat([kind,payload]);
 let crc = 0xffffffff;
 for (const octet of crcInput) { crc ^= octet; for (let b=0;b<8;b++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
 const header=Buffer.alloc(4), trailer=Buffer.alloc(4);header.writeUInt32BE(payload.length);trailer.writeUInt32BE((crc^0xffffffff)>>>0);
 return Buffer.concat([prefix,header,kind,payload,trailer,Buffer.from("0000000049454e44ae426082","hex")]);
}
async function read(options: { rows?: any[]; original?: any; prior?: any[]; recorded?: boolean; invalidated?: boolean; cumulative?: boolean; receipt?: any; grossPence?: number } = {}) {
 const { createHash } = await import("node:crypto"), bytes=png(JSON.stringify(saved));
 const queries: string[] = [];
 const db = { $client: { query: async (sql: string) => {
  queries.push(sql);
  if (sql.includes("SELECT l.*") || sql.includes("recovery_allocation_invoice_lines")) return { rows: options.rows ?? (options.cumulative && !sql.includes("recovery_allocation_invoice_lines") ? [baseLine, { ...baseLine, id: randomUUID(), net_pence: "80000" }] : [baseLine]) };
  if (sql.includes("SELECT 1 FROM app.recovery_case_allocation")) return { rows: [], rowCount: 0 };
  if (sql.includes("SELECT artifact FROM app.recovery_allocation_review")) return { rows: [{ artifact: { remittanceEvidenceId: evidence } }] };
  if (sql.includes("SELECT o.bytes")) return { rows: options.invalidated ? [] : [{ bytes, sha256: createHash("sha256").update(bytes).digest("hex") }] };
  if (sql.includes("remittanceEvidenceId")) return { rows: options.recorded ? [{ evidence_id: evidence }] : [] };
  if (sql.includes("receipt_line_allocation")) return { rows: (options.prior ?? []).filter(row => !row.after_receipt) };
  return { rows: [], rowCount: 0 };
 } } };
 const original=options.original;
 const snapshot={ lines: options.prior ?? [], allocations: [], reversals: [] };
 const repo=new RecoveryAllocationRepository({} as Pool);
 const facts=await (repo as any).lineFacts(db, { tenantId: randomUUID() }, randomUUID(), options.receipt ?? receipt, original ? { action: "review_reverse", grossPence: 38400 } : { ...command, grossPence: options.grossPence ?? command.grossPence }, snapshot, original, original ? randomUUID() : null);
 return { facts, queries };
}
describe("SERIOUS-B9 reader regressions", () => {
 it("S28 uses issued integer line tax instead of requiring a blended ratio", async () => {
  const second=randomUUID();
  const { facts }=await read({ rows: [{ ...baseLine, net_pence: "16001", gross_pence: "19201" }, { ...baseLine, id: second, net_pence: "15999", gross_pence: "19199" }] });
  expect(facts.lines.map((row: any)=>row.net)).toEqual([{ numerator: "16001", denominator: "1" }, { numerator: "15999", denominator: "1" }]);
 });
 it("S29 excludes cumulative account work outside the issued subset", async () => {
  const { facts }=await read({ cumulative: true });
  expect(facts.lines).toHaveLength(1);
  expect(facts.lines[0].net).toEqual({ numerator: "32000", denominator: "1" });
 });
 it("S29 records separate-invoice priority only from a saved supplementary binding", async () => {
  const { facts }=await read({ rows:[{...baseLine,separate_invoice:true}] });
  expect(facts.lines[0]).toMatchObject({rule:"separate_invoice",sourceRef:invoice});
 });
 it("S30 resolves saved remittance when the caller omits its ID", async () => {
  const { facts }=await read({ recorded: true });
  expect(facts.lines[0]).toMatchObject({ rule: "explicit", sourceRef: evidence });
 });
 it("S31 excludes a later credit from an earlier receipt denominator", async () => {
  const second=randomUUID(), allocation=randomUUID();
  const prior=[{ id: randomUUID(), invoice_id: invoice, line_id: line, allocation_id: allocation, gross_numerator: "19200", gross_denominator: "1" },
   { id: randomUUID(), invoice_id: invoice, line_id: second, allocation_id: allocation, gross_numerator: "19200", gross_denominator: "1" },
   { id: randomUUID(), invoice_id: invoice, line_id: second, allocation_id: allocation, gross_numerator: "-19200", gross_denominator: "1", after_receipt: true }];
  const { facts }=await read({ prior, grossPence:300000, receipt:{...receipt,invoice_net_pence:"282000",invoice_gross_pence:"338400"},
   rows:[{...baseLine,net_pence:"141000",gross_pence:"169200",invoice_net_pence:"282000",invoice_gross_pence:"338400"},
    {...baseLine,id:second,net_pence:"141000",gross_pence:"169200",invoice_net_pence:"282000",invoice_gross_pence:"338400"}] });
  expect(facts.lines.find((row:any)=>row.lineId===second).net).toEqual({ numerator: "125000", denominator: "1" });
 });
 it("S32 reverses saved line facts after original remittance invalidation", async () => {
  const allocation=randomUUID();
  const prior=[{ id: randomUUID(), invoice_id: invoice, line_id: line, allocation_id: allocation, gross_numerator: "38400", gross_denominator: "1", reverses_id: null }];
  const { facts }=await read({ original: { id: allocation, review_id: randomUUID(), gross_pence: "38400" }, prior, invalidated: true });
  expect(facts.lines[0]).toMatchObject({ gross: { numerator: "-38400", denominator: "1" }, reversesId: prior[0]!.id });
  expect(facts.remittanceEvidenceId).toBeNull();
 });
});
