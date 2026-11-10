// Real PostgreSQL; authored for CI because this sandbox cannot start a database.
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ConnectorPromotionRepository, derivedUuid, withTenant } from "../src/index.js";
import { canonicalJson } from "../src/work-order-repository.js";
import { cluster, world, type World } from "./contractor-billing-fixtures.js";
import { promptSession } from "./enterprise-live-prompt-fixtures.js";
let c: Awaited<ReturnType<typeof cluster>>, repo: ConnectorPromotionRepository;
beforeAll(async () => { c = await cluster(); repo = new ConnectorPromotionRepository(c.runtime); }, 240_000);
afterAll(async () => { await c?.close(); });
async function stage(w: World, status = "paid", eventId = `fixture:event_${randomUUID().replaceAll("-", "")}`) {
 const binding = randomUUID(), namespace = `fixture:billing_${binding.replaceAll("-", "")}`, token = "fictional-billing-promotion-token-0001";
 await c.admin.query(`INSERT INTO connector.binding(tenant_id,id,namespace,environment,endpoint_kind,token_sha256,expires_at)
 VALUES($1,$2,$3,'synthetic_demo','fake',$4,clock_timestamp()+interval '1 hour')`,
 [w.w.p.tenantId,binding,namespace,createHash("sha256").update(token).digest("hex")]);
 const receipt = (await c.admin.query("SELECT connector.intake($1,$2,$3::jsonb) value", [binding,token,JSON.stringify({version:"connector-input.v1",eventId,kind:"billing_status",subject:"fixture:invoice",revision:1,status})])).rows[0]!.value;
 return { selection: {version:"connector-promotion.v1",namespace,eventId}, receipt };
}
async function imported(w: World, eventId: string, type = "paid") {
 return w.repo.import(w.ctx,w.session,w.s.jobId,w.importInput([w.event(type,{sourceEventId:eventId})]));
}
async function moneySnapshot(w: World) {
 // Include all ENT-6 tables plus every platform money/ledger/allocation table, not a handpicked subset.
 const names = (await c.admin.query(`SELECT DISTINCT table_name FROM information_schema.columns
 WHERE table_schema='app' AND column_name='tenant_id' AND table_name ~ '(billing|allocation|ledger|journal|fee|settlement|subscription|receipt)' ORDER BY table_name`)).rows;
 const result: Record<string, unknown> = {};
 for (const {table_name: name} of names) {
  result[name] = (await c.admin.query(`SELECT count(*)::int n,coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) rows FROM app."${name}" r WHERE tenant_id=$1`,[w.w.p.tenantId])).rows[0];
 }
 return result;
}
async function direct(w: World, selection: {namespace:string;eventId:string}, result: unknown, session: string = w.session) {
 return withTenant(c.runtime,w.ctx,db => db.$client.query("SELECT app.connector_promotion($1,$2,$3,$4,$5::jsonb) value",
 [session,selection.namespace,selection.eventId,derivedUuid(`${w.w.p.tenantId}:${selection.namespace}:${selection.eventId}`),JSON.stringify(result)]));
}
it("links a completed human ENT-6 paid import once, including concurrent replay, with no monetary writes", async () => {
 const w = await world(c), e = await stage(w), invoice = await w.invoice();
 const {importId} = await w.repo.import(w.ctx,w.session,w.s.jobId,w.importInput([invoice,
  w.event("paid",{sourceEventId:e.selection.eventId,effectiveAt:"2026-10-03T12:00:00Z",reconciliationId:"fictional-paid-promotion"})]));
 expect((await c.admin.query("SELECT count(*)::int n FROM app.contractor_receipt_line_allocation WHERE tenant_id=$1",[w.w.p.tenantId])).rows[0]!.n).toBeGreaterThan(0);
 const before = await moneySnapshot(w), input = {...e.selection,billingImport:importId};
 const [first,replayed] = await Promise.all([repo.promote(w.session,input),repo.promote(w.session,input)]);
 expect(first).toEqual({version:"connector-billing-status-link.v1",billingImport:importId});
 expect(replayed).toEqual(first); expect(await repo.promote(w.session,input)).toEqual(first);
 expect(await moneySnapshot(w)).toEqual(before);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.connector_promotion WHERE tenant_id=$1 AND result->>'billingImport'=$2",[w.w.p.tenantId,importId])).rows[0]!.n).toBe(1);
 const stored = (await c.admin.query("SELECT receipt FROM connector.input_event WHERE tenant_id=$1 AND namespace=$2 AND event_id=$3",[w.w.p.tenantId,e.selection.namespace,e.selection.eventId])).rows[0]!.receipt;
 expect(stored).toEqual(e.receipt); expect(stored).toMatchObject({state:"staged",domainEffects:0});
 expect((await c.admin.query("SELECT payload->'references'->>'billingImport' id FROM app.audit_event WHERE tenant_id=$1 AND event_type='connector.human_promoted'",[w.w.p.tenantId])).rows).toEqual([{id:importId}]);
 const elsewhere = await stage(w,"paid",e.selection.eventId);
 await expect(repo.promote(w.session,{...elsewhere.selection,billingImport:importId})).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
 const otherImport = await w.repo.import(w.ctx,w.session,w.s.jobId,w.importInput([w.event("paid",{source:"another-fictional",sourceEventId:e.selection.eventId})]));
 await expect(repo.promote(w.session,{...input,billingImport:otherImport.importId})).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
});
const addedPairs = [["billed","invoiced"],["reversed","payment_reversed"],["reversed","credited"]] as const;
it.each(addedPairs)("links %s to a human %s fact once without monetary effects", async (status, factType) => {
 const w = await world(c), e = await stage(w,status), invoice = await w.invoice();
 const payment = w.event("paid",{effectiveAt:"2026-10-03T12:00:00Z",reconciliationId:"fictional-payment"});
 const fact = factType === "invoiced" ? {...invoice,sourceEventId:e.selection.eventId}
  : w.event(factType,{sourceEventId:e.selection.eventId,effectiveAt:"2026-10-04T12:00:00Z",
    originalEventId:factType === "credited" ? invoice.sourceEventId : payment.sourceEventId,
    reconciliationId:factType === "payment_reversed" ? "fictional-reversal" : null,
    ...(factType === "credited" ? {lineAdjustments:[{externalInvoiceLineId:"order",netPence:100000,vatPence:20000,grossPence:120000},
      {externalInvoiceLineId:"extra",netPence:24000,vatPence:4800,grossPence:28800}]} : {})});
 const events = factType === "invoiced" ? [fact] : factType === "credited" ? [invoice,fact] : [invoice,payment,fact];
 const {importId} = await w.repo.import(w.ctx,w.session,w.s.jobId,w.importInput(events));
 const before = await moneySnapshot(w), input = {...e.selection,billingImport:importId};
 const [first,replayed] = await Promise.all([repo.promote(w.session,input),repo.promote(w.session,input)]);
 expect(first).toEqual({version:"connector-billing-status-link.v1",billingImport:importId});
 expect(replayed).toEqual(first); expect(await repo.promote(w.session,input)).toEqual(first);
 expect(await moneySnapshot(w)).toEqual(before);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.connector_promotion WHERE tenant_id=$1 AND result->>'billingImport'=$2",[w.w.p.tenantId,importId])).rows[0]!.n).toBe(1);
 const stored = (await c.admin.query("SELECT receipt FROM connector.input_event WHERE tenant_id=$1 AND namespace=$2 AND event_id=$3",[w.w.p.tenantId,e.selection.namespace,e.selection.eventId])).rows[0]!.receipt;
 expect(stored).toEqual(e.receipt); expect(stored).toMatchObject({state:"staged",domainEffects:0});
 const elsewhere = await stage(w,status,e.selection.eventId);
 await expect(repo.promote(w.session,{...elsewhere.selection,billingImport:importId})).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
 expect(await moneySnapshot(w)).toEqual(before);
});
it.each([
 ["billed","paid"],["billed","credited"],["billed","payment_reversed"],["billed","rejected"],
 ["reversed","invoiced"],["reversed","paid"],["reversed","rejected"],
 ["paid","invoiced"],["paid","credited"],["paid","payment_reversed"],["paid","rejected"],
])("refuses disallowed pair %s -> %s without monetary effects", async (status, factType) => {
 const w = await world(c), e = await stage(w,status), {importId} = await imported(w,e.selection.eventId,factType);
 const before = await moneySnapshot(w);
 await expect(direct(w,e.selection,{version:"connector-billing-status-link.v1",billingImport:importId})).rejects.toMatchObject({message:"BILLING_COMPOSITION_REQUIRED"});
 expect(await moneySnapshot(w)).toEqual(before);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.connector_promotion WHERE tenant_id=$1",[w.w.p.tenantId])).rows[0]!.n).toBe(0);
 const stored = (await c.admin.query("SELECT receipt FROM connector.input_event WHERE tenant_id=$1 AND namespace=$2 AND event_id=$3",[w.w.p.tenantId,e.selection.namespace,e.selection.eventId])).rows[0]!.receipt;
 expect(stored).toEqual(e.receipt); expect(stored).toMatchObject({state:"staged",domainEffects:0});
});
it.each(addedPairs)("preserves authority, foreign-import and incomplete-import refusals for %s -> %s", async (status, factType) => {
 const w = await world(c), foreign = await world(c), e = await stage(w,status);
 const {importId} = await imported(w,e.selection.eventId,factType), outside = await imported(foreign,e.selection.eventId,factType);
 const owner = await promptSession(c,{member:w.w.p,grant:"unused"}), before = await moneySnapshot(w);
 await expect(direct(w,e.selection,{version:"connector-billing-status-link.v1",billingImport:importId},owner)).rejects.toMatchObject({message:"BILLING_FORBIDDEN"});
 await expect(direct(w,e.selection,{version:"connector-billing-status-link.v1",billingImport:outside.importId})).rejects.toMatchObject({message:"NOT_FOUND"});
 await expect(repo.promote(w.session,e.selection)).rejects.toMatchObject({code:"INVALID_COMMAND"});
 await expect(direct(w,e.selection,{})).rejects.toMatchObject({message:"BILLING_COMPOSITION_REQUIRED"});
 const command = w.importInput([w.event(factType,{source:"fictional-incomplete",sourceEventId:e.selection.eventId})]);
 await expect(withTenant(c.runtime,w.ctx,async db => {
  await db.$client.query("SELECT app.cb_begin($1,$2,$3,'ImportBillingStatus',$4::jsonb)",[w.session,w.s.jobId,command.commandId,canonicalJson(command)]);
  const incomplete = (await db.$client.query("SELECT app.cb_ingest($1,$2,$3,$4::jsonb) result",[w.session,w.s.jobId,command.commandId,canonicalJson(command)])).rows[0]!.result;
  await db.$client.query("SELECT app.connector_promotion($1,$2,$3,$4,$5::jsonb)",[w.session,e.selection.namespace,e.selection.eventId,derivedUuid(`${w.w.p.tenantId}:${e.selection.namespace}:${e.selection.eventId}`),JSON.stringify({version:"connector-billing-status-link.v1",billingImport:incomplete.importId})]);
 })).rejects.toMatchObject({message:"BILLING_COMPOSITION_REQUIRED"});
 expect(await moneySnapshot(w)).toEqual(before);
});
it("refuses wrong fact type, source event, foreign import, absent import, and unsupported staged status", async () => {
 const w = await world(c), foreign = await world(c), e = await stage(w);
 const mismatch = await imported(w,e.selection.eventId,"rejected"), other = await imported(w,"fixture:other"), outside = await imported(foreign,e.selection.eventId);
 const before = await moneySnapshot(w);
 for (const billingImport of [mismatch.importId,other.importId,outside.importId,randomUUID()]) {
  await expect(repo.promote(w.session,{...e.selection,billingImport})).rejects.toBeDefined();
 }
 await expect(repo.promote(w.session,e.selection)).rejects.toMatchObject({code:"INVALID_COMMAND"});
 await expect(direct(w,e.selection,{})).rejects.toMatchObject({message:"BILLING_COMPOSITION_REQUIRED"});
 for (const status of ["billed","reversed"]) {
  const unsupported = await stage(w,status);
  await expect(direct(w,unsupported.selection,{version:"connector-billing-status-link.v1",billingImport:other.importId})).rejects.toMatchObject({message:"BILLING_COMPOSITION_REQUIRED"});
 }
 expect(await moneySnapshot(w)).toEqual(before);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.connector_promotion WHERE tenant_id=$1",[w.w.p.tenantId])).rows[0]!.n).toBe(0);
});
it("rechecks finance authority on new links and replay, and rejects forged result fields", async () => {
 const w = await world(c), e = await stage(w), {importId} = await imported(w,e.selection.eventId), input = {...e.selection,billingImport:importId};
 const owner = await promptSession(c,{member:w.w.p,grant:"unused"});
 const before = await moneySnapshot(w);
 await expect(repo.promote(owner,input)).rejects.toMatchObject({code:"NOT_FOUND"});
 await expect(direct(w,e.selection,{version:"connector-billing-status-link.v1",billingImport:importId},owner)).rejects.toMatchObject({message:"BILLING_FORBIDDEN"});
 await expect(direct(w,e.selection,{version:"connector-billing-status-link.v1",billingImport:importId,paid:true})).rejects.toMatchObject({message:"COMMAND_CONFLICT"});
 expect(await moneySnapshot(w)).toEqual(before);
 await repo.promote(w.session,input);
 await c.admin.query("INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) VALUES($1,$2,$3)",[w.w.p.tenantId,randomUUID(),w.w.members.finance.grant]);
 await expect(repo.promote(w.session,input)).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("refuses an incomplete ENT-6 import in the same transaction, before a receipt can complete", async () => {
 const w = await world(c), e = await stage(w), command = w.importInput([w.event("paid",{sourceEventId:e.selection.eventId})]);
 const before = await moneySnapshot(w);
 await expect(withTenant(c.runtime,w.ctx,async db => {
  await db.$client.query("SELECT app.cb_begin($1,$2,$3,'ImportBillingStatus',$4::jsonb)",[w.session,w.s.jobId,command.commandId,canonicalJson(command)]);
  const {importId} = (await db.$client.query("SELECT app.cb_ingest($1,$2,$3,$4::jsonb) result",[w.session,w.s.jobId,command.commandId,canonicalJson(command)])).rows[0]!.result;
  await db.$client.query("SELECT app.connector_promotion($1,$2,$3,$4,$5::jsonb)",[w.session,e.selection.namespace,e.selection.eventId,derivedUuid(`${w.w.p.tenantId}:${e.selection.namespace}:${e.selection.eventId}`),JSON.stringify({version:"connector-billing-status-link.v1",billingImport:importId})]);
 })).rejects.toMatchObject({message:"BILLING_COMPOSITION_REQUIRED"});
 expect(await moneySnapshot(w)).toEqual(before);
});
it("negative control: restoring the original refusal makes a valid link fail (transaction rolled back)", async () => {
 const w = await world(c), e = await stage(w), {importId} = await imported(w,e.selection.eventId);
 const old = await readFile(new URL("../migrations/0639_connector_promotion.sql",import.meta.url),"utf8");
 const routine = old.slice(old.indexOf("CREATE FUNCTION app.connector_promotion("),old.indexOf("-- Forward fix:")).replace("CREATE FUNCTION","CREATE OR REPLACE FUNCTION");
 const db = await c.admin.connect();
 try {
  await db.query("BEGIN"); await db.query(routine);
  await db.query("SELECT set_config('app.tenant_id',$1,true)",[w.w.p.tenantId]);
  await db.query("SET LOCAL ROLE jobguard_runtime");
  await expect(db.query("SELECT app.connector_promotion($1,$2,$3,$4,$5::jsonb)",[w.session,e.selection.namespace,e.selection.eventId,derivedUuid(`${w.w.p.tenantId}:${e.selection.namespace}:${e.selection.eventId}`),JSON.stringify({version:"connector-billing-status-link.v1",billingImport:importId})])).rejects.toMatchObject({message:"BILLING_COMPOSITION_REQUIRED"});
 } finally { await db.query("ROLLBACK"); db.release(); }
 await expect(repo.promote(w.session,{...e.selection,billingImport:importId})).resolves.toMatchObject({billingImport:importId});
});

it.each(addedPairs)("negative control: equality refuses %s -> %s and rollback restores the pair", async (status, factType) => {
 const w = await world(c), e = await stage(w,status), {importId} = await imported(w,e.selection.eventId,factType);
 const latest = await readFile(new URL("../migrations/0691_connector_billing_kind_link.sql",import.meta.url),"utf8");
 const start = latest.indexOf("((e.payload->>'status'='paid'"), end = latest.indexOf("))\n    THEN",start);
 expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
 // Scratch routine exists only in this transaction; both success cases below exercise real PostgreSQL.
 const narrowed = latest.slice(0,start) + "f.payload->>'factType'=e.payload->>'status'" + latest.slice(end);
 const routine = narrowed.slice(narrowed.indexOf("CREATE OR REPLACE FUNCTION"),narrowed.indexOf("ALTER FUNCTION"));
 const db = await c.admin.connect(), before = await moneySnapshot(w);
 try {
  await db.query("BEGIN"); await db.query(routine);
  await db.query("SELECT set_config('app.tenant_id',$1,true)",[w.w.p.tenantId]);
  await db.query("SET LOCAL ROLE jobguard_runtime");
  await expect(db.query("SELECT app.connector_promotion($1,$2,$3,$4,$5::jsonb)",[w.session,e.selection.namespace,e.selection.eventId,derivedUuid(`${w.w.p.tenantId}:${e.selection.namespace}:${e.selection.eventId}`),JSON.stringify({version:"connector-billing-status-link.v1",billingImport:importId})])).rejects.toMatchObject({message:"BILLING_COMPOSITION_REQUIRED"});
 } finally { await db.query("ROLLBACK"); db.release(); }
 await expect(repo.promote(w.session,{...e.selection,billingImport:importId})).resolves.toMatchObject({billingImport:importId});
 expect(await moneySnapshot(w)).toEqual(before);
});
