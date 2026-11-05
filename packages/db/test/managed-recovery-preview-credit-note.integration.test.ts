// Real PostgreSQL only; source fixtures are privileged synthetic facts, never live money.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ManagedRecoveryRepository } from "../src/managed-recovery-repository.js";
import { cluster, fixture, newCase, command, qualifyingAllocation, counts, type Cluster } from "./managed-recovery-fixtures.js";
let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });
it("excludes only allocations whose invoice has an unmatched credit note, without writing preview facts", async () => {
 const f=await fixture(c), caseId=await newCase(c,f), source=await qualifyingAllocation(c,f,caseId);
 const repo=new ManagedRecoveryRepository(c.runtime,f.sessionDigest);
 await repo.elect(f.context,f.job,command(caseId),f.actor);
 expect((await repo.preview(f.context,f.job,caseId,f.actor)).serviceChargeInvoice?.principal.pence).toBe(1600);
 const credit=randomUUID(), db=await c.admin.connect();
 try {
  await db.query('BEGIN');await db.query('SET LOCAL session_replication_role=replica');
  await db.query(`INSERT INTO app.customer_credit_note(tenant_id,id,job_id,invoice_id,authorization_id,credit_number,amount_pence,currency,reason,net_pence,tax_pence,total_pence)
   SELECT tenant_id,$2,job_id,invoice_id,$3,$2::text,12000,'GBP','Synthetic credit',-10000,-2000,-12000
   FROM app.recovery_case_allocation WHERE tenant_id=$1 AND id=$4`,[f.tenant,credit,randomUUID(),source.allocation]);
  await db.query('COMMIT');
 } finally {await db.query('ROLLBACK');db.release();}
 // An unaffected allocation on another invoice remains counted.
 await qualifyingAllocation(c,f,caseId);
 const before=await counts(c);
 expect((await repo.preview(f.context,f.job,caseId,f.actor)).serviceChargeInvoice?.principal.pence).toBe(1600);
 expect(await counts(c)).toEqual(before);
 const reverse=await c.admin.connect();
 try {
  await reverse.query('BEGIN');await reverse.query('SET LOCAL session_replication_role=replica');
  await reverse.query(`INSERT INTO app.recovery_case_allocation_reversal(tenant_id,id,job_id,allocation_id,command_id,review_id,authorization_id,source_kind,source_id,credit_note_id,gross_pence,eligible_net_pence,tax_pence)
   VALUES($1,$2,$3,$4,$5,$6,$7,'credit_note',$8,$8,14400,12000,2400)`,[f.tenant,randomUUID(),f.job,source.allocation,randomUUID(),randomUUID(),randomUUID(),credit]);
  await reverse.query('COMMIT');
 } finally {await reverse.query('ROLLBACK');reverse.release();}
 expect((await repo.preview(f.context,f.job,caseId,f.actor)).serviceChargeInvoice?.principal.pence).toBe(2600);
});
