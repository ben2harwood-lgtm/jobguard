// CI ONLY. This is denial/conservation-of-existing-state coverage, not a saved F5/F7 proof.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, seedWorkPractice, type WorkFixture } from "./job-work-state-fixtures.js";
import { RecoveryLineAllocationRepository } from "../src/receipt-line-allocation-repository.js";
let f: WorkFixture;
const prior = process.env.JOBGUARD_ENV;
beforeAll(async () => { f = await createWorkFixture(); }, 120_000);
afterAll(async () => { await closeWorkFixture(f); if (prior === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = prior; });
it("A1/A3/A4/A5/A6: held receipt, replay and reversal attempts leave money, command and audit rows unchanged", async () => {
 const { auth, jobId } = await seedWorkPractice(f);
 const tables = ["receipt_allocation_fact_command", "receipt_allocation_fact_review", "receipt_allocation_fact_revision", "receipt_allocation_fact_source", "receipt_allocation_fact_line",
  "customer_payment", "customer_payment_reversal", "recovery_case_allocation", "receipt_line_allocation", "audit_event"];
 const counts = async () => Promise.all(tables.map(async table => (await f.admin.query(`SELECT count(*)::text n FROM app.${table} WHERE tenant_id=$1`, [auth.context.tenantId])).rows[0].n));
 const before = await counts(), repository = new RecoveryLineAllocationRepository(f.runtime, "synthetic_demo");
 const command = { version: "receipt-line-allocation-command.v1", commandId: randomUUID(), expectedSourceRevision: 1, action: "review", paymentId: randomUUID() };
 for (const raw of [command, command, { ...command, action: "review_reverse", grossPence: 1, allocationRevisionId: randomUUID(), reversalSource: { kind: "credit_note", sourceId: randomUUID() } }]) {
  await expect(repository.command(auth.context, auth, auth.digest, jobId, raw)).rejects.toMatchObject({ code: "RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED" });
 }
 expect(await counts()).toEqual(before);
});

// Synthetic parent rows below deliberately bypass predecessor triggers/FKs ONLY
// during fixture setup. Every tested insert runs with origin triggers, real FKs,
// checks and uniqueness enabled. This proves storage rules, not source authority.
type Db = import("pg").PoolClient;
async function storageFixture(work: (db: Db, x: StorageIds) => Promise<void>, commitSetup = false) {
 const db = await f.admin.connect();
 const x: StorageIds = { tenant: randomUUID(), job: randomUUID(), payment: randomUUID(), invoice: randomUUID(),
  scope: randomUUID(), commercial: randomUUID(), source: randomUUID(), line: randomUUID(), revision: randomUUID() };
 try {
  await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'confirmed')", [x.tenant,x.job,x.scope]);
  await db.query(`INSERT INTO app.customer_payment(tenant_id,job_id,id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance)
   VALUES($1,$2,$3,$4,$5,'2026-10-23',100,'GBP','bank_transfer','synthetic-storage-fixture',true,'manual_builder_attestation')`, [x.tenant,x.job,x.payment,x.invoice,randomUUID()]);
  await parentSource(db,x);
  await parentLine(db,x,x.line);
  await db.query("SET LOCAL session_replication_role='origin'");
  if (commitSetup) await db.query("COMMIT");
  await work(db,x);
 } finally { await db.query("ROLLBACK"); db.release(); }
}
type StorageIds = { tenant: string; job: string; payment: string; invoice: string; scope: string; commercial: string; source: string; line: string; revision: string };
async function parentSource(db: Db,x: StorageIds,direction = "receipt") {
 await db.query(`INSERT INTO app.receipt_allocation_fact_revision(tenant_id,job_id,id,command_id,review_id,payment_id,source_hash,source_revision,direction)
  VALUES($1,$2,$3,$4,$5,$6,$7,1,$8)`,[x.tenant,x.job,x.revision,randomUUID(),randomUUID(),x.payment,"a".repeat(64),direction]);
 await db.query(`INSERT INTO app.receipt_allocation_fact_source(tenant_id,job_id,id,allocation_revision_id,payment_id,movement_id,movement_hash,invoice_id,revision_id,lock_id,check_id,invoice_kind,source_manifest,receipt_effective_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'final','{}','2026-10-23')`,[x.tenant,x.job,x.source,x.revision,x.payment,randomUUID(),"a".repeat(64),x.invoice,randomUUID(),randomUUID(),randomUUID()]);
}
async function parentLine(db: Db,x: StorageIds,line: string) {
 await db.query(`INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
  VALUES($1,$2,$3,$4,$5,$6,$7,'baseline',$8,100,0,100)`,[x.tenant,x.job,x.invoice,line,randomUUID(),x.scope,x.commercial,randomUUID()]);
}
async function insertLine(db: Db,x: StorageIds,options: { id?: string; line?: string; gross?: string; denominator?: string; reverses?: string; tenant?: string } = {}) {
 const id=options.id??randomUUID();
 await db.query(`INSERT INTO app.receipt_allocation_fact_line(tenant_id,job_id,id,source_id,invoice_id,line_id,scope_item_id,commercial_revision_id,rule,source_ref,gross_numerator,gross_denominator,net_numerator,net_denominator,original_line_net_pence,original_line_gross_pence,line_existed_at,reverses_line_allocation_id)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,'explicit','synthetic-fixture',$9,$10,$9,$10,100,100,'2026-10-22',$11)`,
 [options.tenant??x.tenant,x.job,id,x.source,x.invoice,options.line??x.line,x.scope,x.commercial,options.gross??"60",options.denominator??"1",options.reverses??null]);
 return id;
}
async function refused(db: Db,work: () => Promise<unknown>,code: string,detail?: string | { constraint: string }) {
 await db.query("SAVEPOINT invalid_attempt");
 try {
  await expect(work()).rejects.toMatchObject({ code, ...(typeof detail === "string" ? { message: detail } : detail ?? {}) });
 } finally { await db.query("ROLLBACK TO SAVEPOINT invalid_attempt"); }
}
// Rule-removal controls run only on the disposable PostgreSQL fixture and roll
// back both DDL and the invalid row. They establish that the negative tests
// exercise the named storage guard rather than an unrelated missing parent.
async function acceptsWithoutGuard(db: Db,ddl: string,work: () => Promise<unknown>) {
 await db.query("SAVEPOINT removed_guard");
 try { await db.query(ddl); await expect(work()).resolves.toBeDefined(); }
 finally { await db.query("ROLLBACK TO SAVEPOINT removed_guard"); }
}
const disableIntegrity = "ALTER TABLE app.receipt_allocation_fact_line DISABLE TRIGGER receipt_fact_line_integrity";
it.each([false,true])("B1-DB-1 refuses duplicate UUID identity (case variant: %s)", async mixedCase => storageFixture(async(db,x)=>{
 const id="abcdefab-abcd-4abc-8abc-abcdefabcdef", second=randomUUID();
 await db.query("SET LOCAL session_replication_role='replica'"); await parentLine(db,x,second); await db.query("SET LOCAL session_replication_role='origin'");
 await insertLine(db,x,{id,gross:"40"});
 expect((await db.query("SELECT id::text FROM app.receipt_allocation_fact_line WHERE tenant_id=$1",[x.tenant])).rows).toEqual([{id}]);
 await refused(db,()=>insertLine(db,x,{id:mixedCase?id.toUpperCase():id,line:second,gross:"40"}),"23505",{constraint:"receipt_allocation_fact_line_pkey"});
 await acceptsWithoutGuard(db,"ALTER TABLE app.receipt_allocation_fact_line DROP CONSTRAINT receipt_allocation_fact_line_pkey",
  ()=>insertLine(db,x,{id:mixedCase?id.toUpperCase():id,line:second,gross:"40"}));
}));
it("B1-DB-2 refuses 60+60 against a 100 receipt, including exact fractional excess",async()=>storageFixture(async(db,x)=>{
 const second=randomUUID();
 await db.query("SET LOCAL session_replication_role='replica'"); await parentLine(db,x,second); await db.query("SET LOCAL session_replication_role='origin'");
 await insertLine(db,x);
 await refused(db,()=>insertLine(db,x,{line:second,gross:"60"}),"23514","RECEIPT_LINE_CAPACITY_EXCEEDED");
 await refused(db,()=>insertLine(db,x,{line:second,gross:"401",denominator:"10"}),"23514","RECEIPT_LINE_CAPACITY_EXCEEDED");
 await acceptsWithoutGuard(db,disableIntegrity,()=>insertLine(db,x,{line:second,gross:"60"}));
 await insertLine(db,x,{line:second,gross:"40"}); // exact capacity is accepted
}));
it.each([false,true])("B1-DB-3 refuses a second full allocation of the same line (different invoice: %s)",async differentInvoice=>storageFixture(async(db,x)=>{
 await insertLine(db,x,{gross:"100"});
 const next={...x,payment:randomUUID(),source:randomUUID(),revision:randomUUID(),invoice:differentInvoice?randomUUID():x.invoice};
 await db.query("SET LOCAL session_replication_role='replica'");
 await db.query(`INSERT INTO app.customer_payment SELECT $1,tenant_id,job_id,$4,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance,qualifying_recovery_proof,platform_fee_settlement,created_at FROM app.customer_payment WHERE tenant_id=$2 AND id=$3`,[next.payment,x.tenant,x.payment,next.invoice]);
 if(differentInvoice) await parentLine(db,next,x.line);
 await parentSource(db,next); await db.query("SET LOCAL session_replication_role='origin'");
 await refused(db,()=>insertLine(db,next,{gross:"100"}),"23514","RECEIPT_LINE_CAPACITY_EXCEEDED");
 await acceptsWithoutGuard(db,disableIntegrity,()=>insertLine(db,next,{gross:"100"}));
}));
it("B1-DB-4 tenant-qualified source FK refuses mixed tenant rows in one distribution",async()=>storageFixture(async(db,x)=>{
 await insertLine(db,x,{gross:"40"});
 await refused(db,()=>insertLine(db,x,{tenant:randomUUID(),gross:"40"}),"23503");
 const fks=(await db.query("SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid='app.receipt_allocation_fact_line'::regclass AND contype='f'")).rows;
 expect(fks.every(r=>r.d.startsWith("FOREIGN KEY (tenant_id, job_id,"))).toBe(true);
}));
it("B1-DB-5 refuses missing originals and cumulative excess reversals",async()=>storageFixture(async(db,x)=>{
 const original=await insertLine(db,x,{gross:"60"});
 const reverse={...x,source:randomUUID(),revision:randomUUID()};
 await db.query("SET LOCAL session_replication_role='replica'"); await parentSource(db,reverse,"reversal"); await db.query("SET LOCAL session_replication_role='origin'");
 await refused(db,()=>insertLine(db,reverse,{gross:"-1",reverses:randomUUID()}),"23503");
 await refused(db,()=>insertLine(db,reverse,{gross:"-61",reverses:original}),"23514","RECEIPT_LINE_CAPACITY_EXCEEDED");
 await acceptsWithoutGuard(db,disableIntegrity,()=>insertLine(db,reverse,{gross:"-61",reverses:original}));
 await insertLine(db,reverse,{gross:"-40",reverses:original});
 const reverse2={...reverse,source:randomUUID(),revision:randomUUID()};
 await db.query("SET LOCAL session_replication_role='replica'"); await parentSource(db,reverse2,"reversal"); await db.query("SET LOCAL session_replication_role='origin'");
 await refused(db,()=>insertLine(db,reverse2,{gross:"-21",reverses:original}),"23514","RECEIPT_LINE_CAPACITY_EXCEEDED");
 await insertLine(db,reverse2,{gross:"-20",reverses:original});
}));
it.each(["pending","unmatched","duplicate_held","reversed"])("B1-DB-6 refuses saved_distribution for %s without a hold",async state=>storageFixture(async(db,x)=>{
 // Exercise the actual table CHECK, not the TypeScript parser.
 const manifest={status:"saved_distribution",holds:[],receipts:[{paymentId:x.payment,state}],rows:[{paymentId:x.payment,direction:"receipt"}]};
 await refused(db,()=>db.query(`INSERT INTO app.receipt_allocation_fact_source
  SELECT tenant_id,job_id,$1,allocation_revision_id,payment_id,movement_id,movement_hash,invoice_id,revision_id,lock_id,check_id,invoice_kind,$2::jsonb,receipt_effective_at
  FROM app.receipt_allocation_fact_source WHERE tenant_id=$3 AND id=$4`,[randomUUID(),manifest,x.tenant,x.source]),"23514",{constraint:"receipt_fact_saved_projection_safe"});
 expect((await db.query("SELECT app.receipt_fact_projection_safe($1::jsonb) ok",[{...manifest,status:"source_held"}])).rows[0].ok).toBe(true);
 // Forging a settled state cannot stand in for the held source authority either.
 expect((await db.query("SELECT app.receipt_fact_projection_safe($1::jsonb) ok",[{...manifest,receipts:[{paymentId:x.payment,state:"settled"}]}])).rows[0].ok).toBe(false);
}));
it("B1-DB capacity guard rejects non-serializable insertion before any usable fact exists",async()=>storageFixture(async(db,x)=>{
 await db.query("COMMIT"); await db.query("BEGIN");
 await expect(insertLine(db,x)).rejects.toMatchObject({code:"25001",message:"RECEIPT_LINE_SERIALIZABLE_REQUIRED"});
}));
it("B1-DB capacity survives concurrent 60+60 inserts against 100 via PostgreSQL SSI",async()=>storageFixture(async(db,x)=>{
 const second=randomUUID();
 await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role='replica'"); await parentLine(db,x,second); await db.query("COMMIT");
 const clients=await Promise.all([f.admin.connect(),f.admin.connect()]);
 try {
  await Promise.all(clients.map(c=>c.query("BEGIN ISOLATION LEVEL SERIALIZABLE")));
  const inserted=await Promise.allSettled(clients.map((c,i)=>insertLine(c,x,{line:i===0?x.line:second,gross:"60"})));
  const outcomes=await Promise.allSettled(clients.map(async(c,i)=>{
   const attempt=inserted[i]!;
   if(attempt.status==='rejected') throw attempt.reason;
   await c.query("COMMIT");
  }));
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  for(const r of outcomes) if(r.status==='rejected') expect(r.reason).toMatchObject({code:"40001"});
  expect((await db.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_line WHERE tenant_id=$1",[x.tenant])).rows[0].n).toBe(1);
 } finally { for(const c of clients){await c.query("ROLLBACK");c.release();} }
},true));
