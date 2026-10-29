import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { WorkOrderRepository, prepareWorkOrderDemo, demoFile, demoRow, withTenant } from "../src/index.js";
import { cluster, startSession, status, unchanged, type Cluster, type SessionFixture } from "./contractor-entitlement-fixtures.js";
let c: Cluster;
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; c = await cluster(); }, 120000);
afterAll(async () => { await c?.close(); });
const features = ["work_orders", "approval_chains", "sso", "accounting_export"];
const check = (f: SessionFixture, feature: string) => withTenant(c.runtime, f.context, db => db.$client.query("SELECT app.mon8_require_capability($1,'NOT_FOUND')", [feature]));
it("MON-8 capabilities require active bound status, never flags or just a reference", async () => {
 const f = await startSession(c);
 for (const feature of features) await unchanged(c, () => expect(check(f, feature)).rejects.toThrow("NOT_FOUND"));
 await status(c, f, "active");
 for (const feature of features) await unchanged(c, () => check(f, feature));
 for (const value of ["suspended", "inactive"] as const) {
  await status(c, f, value);
  for (const feature of features) await unchanged(c, () => expect(check(f, feature)).rejects.toThrow("NOT_FOUND"));
 }
 await unchanged(c, () => expect(withTenant(c.runtime, f.context, async db => {
  await db.$client.query("SELECT set_config('app.contractor_agreement_active','true',true),set_config('app.plan','Builder',true)");
  return db.$client.query("SELECT app.mon8_require_capability('sso','NOT_FOUND')");
 })).rejects.toThrow("NOT_FOUND"));
 await status(c, f, "active");
 for (const feature of features) await unchanged(c, () => check(f, feature));
 await expect(check(f, "expanded_billing")).rejects.toThrow("INVALID_COMMAND");
});
it("MON-8 tenant A cannot supply tenant B's authority or actor", async () => {
 const a = await startSession(c), b = await startSession(c);
 await status(c, a, "active");
 await unchanged(c, () => expect(check(b, "work_orders")).rejects.toThrow("NOT_FOUND"));
 await status(c, b, "active");
 await unchanged(c, () => expect(withTenant(c.runtime, b.context, db => db.$client.query("SELECT app.work_order_begin($1,$2,'Fictional foreign order')", [a.p.membershipId, randomUUID()]))).rejects.toThrow("NOT_FOUND"));
});
it("MON-8 duplicate imports fail after suspension; retained orders and receipts remain readable", async () => {
 const f = await startSession(c), orders = new WorkOrderRepository(c.runtime);
 await status(c, f, "active");
 const demo = await prepareWorkOrderDemo(c.runtime, f.p, { siteCount: 1 });
 const input = { commandId: randomUUID(), name: "fictional.csv", kind: "csv" as const, csv: demoFile([demoRow(demo, 1)]) };
 const result = await orders.importCsv(f.p, input);
 expect((await orders.importCsv(f.p, input)).replayed).toBe(true);
 const before = await orders.overview(f.p);
 await status(c, f, "suspended");
 await unchanged(c, () => expect(orders.importCsv(f.p, input)).rejects.toMatchObject({ code: "NOT_FOUND" }));
 await unchanged(c, () => expect(orders.importCsv(f.p, { ...input, commandId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" }));
 expect(await orders.overview(f.p)).toEqual(before);
 expect(await orders.batch(f.p, result.batchId)).toMatchObject({ batchId: result.batchId });
});
it("MON-8 direct receipt insertion cannot bypass the agreement service on replay", async () => {
 const f = await startSession(c), command = randomUUID();
 const receipt = () => withTenant(c.runtime, f.context, db => db.$client.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES($1,$2,'SubmitExtra',$3,$4,'processing',$5) ON CONFLICT DO NOTHING`, [f.p.tenantId, command, `fictional:${command}`, "a".repeat(64), f.p.membershipId]));
 await unchanged(c, () => expect(receipt()).rejects.toThrow("PERMISSION_DENIED"));
 await status(c, f, "active"); await receipt();
 await status(c, f, "suspended");
 await unchanged(c, () => expect(receipt()).rejects.toThrow("PERMISSION_DENIED"));
});
it("MON-8 raw agreement facts and trigger remain private", async () => {
 for (const role of ["jobguard_runtime", "jobguard_identity", "jobguard_infrastructure"]) {
  const rows = (await c.admin.query(`SELECT p.proname,has_function_privilege($1,p.oid,'EXECUTE') allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='app' AND p.proname IN('mon8_effective_agreement','mon8_approval_receipt_gate')`, [role])).rows;
  expect(rows).toHaveLength(2); expect(rows.every(row => !row.allowed)).toBe(true);
 }
});

it("MON-8 an active status on a small-builder assignment cannot grant contractor capabilities", async () => {
 const { ownerTx } = await import("./contractor-entitlement-fixtures.js");
 const { appendAuditBatch } = await import("../src/index.js");
 const f = await startSession(c), assignment = randomUUID(), actorRef = `membership:${f.p.membershipId}`;
 await status(c, f, "active");
 await ownerTx(c, f.p.tenantId, async db => {
  await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [f.p.tenantId]);
  await db.$client.query(`INSERT INTO app.commercial_track_assignment(tenant_id,id,revision,commercial_track,agreement_reference,environment,actor_ref)
   SELECT tenant_id,$2,max(revision)+1,'small_builder',$3,'synthetic_demo',$4 FROM app.commercial_track_assignment WHERE tenant_id=$1 GROUP BY tenant_id`, [f.p.tenantId, assignment, `synthetic-agreement:${randomUUID()}`, actorRef]);
  await appendAuditBatch(db, [{ id: assignment, version: "audit.v1", actorRef, eventType: "commercial_track.assigned", subjectType: "tenant", subjectRef: f.p.tenantId, payload: { references: { assignment, environment: "synthetic_demo" } } }]);
 });
 await status(c, f, "active");
 for (const feature of features) await unchanged(c, () => expect(check(f, feature)).rejects.toThrow("NOT_FOUND"));
});

it("MON-8 approval-chain configuration uses the same service as approval execution", async () => {
 const { ContractorRepository } = await import("../src/index.js");
 const { currentCommand } = await import("./contractor-practice-session-fixtures.js");
 const f = await startSession(c), repository = new ContractorRepository(c.runtime);
 await status(c, f, "active"); await prepareWorkOrderDemo(c.runtime, f.p, { siteCount: 1 });
 const contract = (await repository.query(f.p, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "contracts" })).contracts[0]!;
 const command = await currentCommand(c, f, { kind: "contract.revise", clientId: contract.client_id, contractId: contract.contract_id, document: contract.document, rules: contract.rules });
 await status(c, f, "suspended");
 await unchanged(c, () => expect(repository.command(f.p, command)).rejects.toMatchObject({ code: "FORBIDDEN" }));
});
