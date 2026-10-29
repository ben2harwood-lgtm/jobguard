// CI ONLY. A stale watermark cannot authorize dependent work. A read is not an allocation approval.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedWorkPractice } from "./job-work-state-fixtures.js";
import { createLockFixture, closeLockFixture, type LockFixture } from "./recovery-attribution-fixture.js";
import { RecoveryLineAllocationRepository } from "../src/receipt-line-allocation-repository.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { withTenant } from "../src/tenant-context.js";
let f: LockFixture;
const prior = process.env.JOBGUARD_ENV;
beforeAll(async () => { f = await createLockFixture(); }, 120_000);
afterAll(async () => { await closeLockFixture(f); if (prior === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = prior; });
it("A3/A6: concurrent approvals cannot turn a held source into current facts", async () => {
 const { auth, jobId } = await seedWorkPractice(f), repository = new RecoveryLineAllocationRepository(f.runtime, "synthetic_demo");
 const command = { version: "receipt-line-allocation-command.v1", action: "approve", commandId: randomUUID(), expectedSourceRevision: 1, reviewId: randomUUID(), approvalHash: "a".repeat(64) };
 const results = await Promise.allSettled([1, 2].map(() => repository.command(auth.context, auth, auth.digest, jobId, command)));
 expect(results.map(result => result.status)).toEqual(["rejected", "rejected"]);
 for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED" });
 expect((await f.admin.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_revision")).rows[0].n).toBe(0);
});
it.each(["hash", "revision"] as const)("A3: caller-owned transaction rejects a stale %s before dependent work", async field => {
 const { auth, jobId } = await seedWorkPractice(f), repository = new RecoveryLineAllocationRepository(f.runtime, "synthetic_demo");
 const current = await repository.readCurrent(auth.context, auth, auth.digest, { jobId });
 const expected = { revision: current.revision, sourceHash: current.sourceHash };
 if (field === "revision") expected.revision++;
 else expected.sourceHash = current.sourceHash === "a".repeat(64) ? "b".repeat(64) : "a".repeat(64);
 let dependentWorkReached = false;
 await expect(withTenant(practiceMaterialPool(f.runtime, auth.digest), auth.context, async db => {
  await repository.readCurrentInTransaction(db, auth.context, auth, auth.digest, { jobId }, expected);
  dependentWorkReached = true;
 })).rejects.toMatchObject({ code: "40001" });
 expect(dependentWorkReached).toBe(false);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_revision")).rows[0].n).toBe(0);
});
