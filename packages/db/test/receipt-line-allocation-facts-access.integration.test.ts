// CI ONLY. These tests start real PostgreSQL; deliberately not run in the builder sandbox.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, seedWorkPractice, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { RecoveryLineAllocationRepository } from "../src/receipt-line-allocation-repository.js";
let f: WorkFixture, practice: Awaited<ReturnType<typeof seedWorkPractice>>;
const prior = process.env.JOBGUARD_ENV;
beforeAll(async () => { f = await createWorkFixture(); practice = await seedWorkPractice(f); }, 120_000);
afterAll(async () => { await closeWorkFixture(f); if (prior === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = prior; });
it("A2: current owner reaches an explicit source handoff hold, never a fabricated success", async () => {
 const { auth, jobId } = practice;
 const repository = new RecoveryLineAllocationRepository(f.runtime, "synthetic_demo");
 await expect(repository.view(auth.context, auth, auth.digest, jobId)).rejects.toMatchObject({ code: "RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED" });
 await expect(repository.command(auth.context, auth, auth.digest, jobId, { version: "receipt-line-allocation-command.v1", action: "review", commandId: randomUUID(), paymentId: randomUUID(), expectedSourceRevision: 1 })).rejects.toMatchObject({ code: "RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED" });
});
it("A2/A7: wrong-session and wrong-job return the same denial before source lookup", async () => {
 const other = await seedWorkPractice(f), { auth, jobId } = practice;
 const repository = new RecoveryLineAllocationRepository(f.runtime, "synthetic_demo");
 for (const [session, job] of [[other.auth.digest, jobId], [auth.digest, randomUUID()]]) {
  await expect(repository.readCurrent(auth.context, auth, session!, { jobId: job! })).rejects.toMatchObject({ code: "RECEIPT_LINE_FORBIDDEN" });
 }
});
it("A2: runtime has no direct write/truncate privilege, no ownership or BYPASSRLS", async () => {
 const { auth } = practice;
 for (const table of ["command", "review", "revision", "source", "line"]) {
  const name = `app.receipt_allocation_fact_${table}`;
  const catalog = (await f.admin.query(`SELECT c.relrowsecurity,c.relforcerowsecurity,r.rolname owner,
   has_table_privilege('jobguard_runtime',c.oid,'INSERT') ins,has_table_privilege('jobguard_runtime',c.oid,'UPDATE') upd,
   has_table_privilege('jobguard_runtime',c.oid,'DELETE') del,has_table_privilege('jobguard_runtime',c.oid,'TRUNCATE') trunc
   FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid=$1::regclass`, [name])).rows[0];
  expect(catalog).toEqual({ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration", ins: false, upd: false, del: false, trunc: false });
  await expect(workTenant(f.runtime, auth.context.tenantId, db => db.query(`INSERT INTO ${name} DEFAULT VALUES`))).rejects.toMatchObject({ code: "42501" });
  await expect(workTenant(f.runtime, auth.context.tenantId, db => db.query(`TRUNCATE ${name}`))).rejects.toMatchObject({ code: "42501" });
  await expect(workTenant(f.runtime, auth.context.tenantId, db => db.query(`UPDATE ${name} SET job_id=job_id`))).rejects.toMatchObject({ code: "42501" });
  await expect(workTenant(f.runtime, auth.context.tenantId, db => db.query(`DELETE FROM ${name}`))).rejects.toMatchObject({ code: "42501" });
  await expect(workTenant(f.runtime, auth.context.tenantId, db => db.query(`SELECT * FROM ${name}`))).rejects.toMatchObject({ code: "42501" });
  for (const sql of [`UPDATE ${name} SET job_id=job_id`, `DELETE FROM ${name}`, `TRUNCATE ${name}`]) {
   await expect(workTenant(f.admin, auth.context.tenantId, db => db.query(sql))).rejects.toThrow();
  }
 }
 expect((await f.admin.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='jobguard_runtime'")).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
});
it("A1/A2/A5/A6: direct controlled calls refuse forged artifacts and all four effects", async () => {
 const { auth, jobId } = practice;
 for (const action of ["review", "approve", "review_reverse", "reverse"]) {
  await expect(workTenant(f.runtime, auth.context.tenantId, async db => {
   await db.query("SELECT set_config('app.receipt_line_environment','synthetic_demo',true)");
   await db.query("SELECT app.write_receipt_allocation_facts($1,$2,$3,$4,$5)", [auth.context.tenantId, jobId, auth.digest,
    { version: "receipt-line-allocation-command.v1", action, commandId: randomUUID(), expectedSourceRevision: 1 },
    { version: "receipt-line-allocation-artifact.v1", eligibilityApproved: true, gross: { numerator: "1", denominator: "3" }, approvalHash: "a".repeat(64) }]);
  })).rejects.toThrow("RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED");
 }
});

it("A2: forged actor and revoked owner cannot read held source existence", async () => {
 const { auth, jobId } = practice, repository = new RecoveryLineAllocationRepository(f.runtime, "synthetic_demo");
 await expect(repository.view(auth.context, { ...auth, identityUserId: randomUUID() }, auth.digest, jobId)).rejects.toMatchObject({ code: "RECEIPT_LINE_FORBIDDEN" });
 await workTenant(f.admin, auth.context.tenantId, db => db.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [auth.context.tenantId, auth.membershipId]));
 try {
  await expect(repository.view(auth.context, auth, auth.digest, jobId)).rejects.toMatchObject({ code: "RECEIPT_LINE_FORBIDDEN" });
 } finally {
  await workTenant(f.admin, auth.context.tenantId, db => db.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2", [auth.context.tenantId, auth.membershipId]));
 }
});
