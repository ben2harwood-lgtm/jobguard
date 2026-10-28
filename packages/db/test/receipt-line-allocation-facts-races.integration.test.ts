// CI ONLY. No source-watermark atomicity claim: that acceptance remains STOP-SOURCE-LOCK.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, seedWorkPractice, type WorkFixture } from "./job-work-state-fixtures.js";
import { RecoveryLineAllocationRepository } from "../src/receipt-line-allocation-repository.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { withTenant } from "../src/tenant-context.js";
let f: WorkFixture;
const prior = process.env.JOBGUARD_ENV;
beforeAll(async () => { f = await createWorkFixture(); }, 120_000);
afterAll(async () => { await closeWorkFixture(f); if (prior === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = prior; });
it("A3/A6: concurrent approvals cannot turn a held source into current facts", async () => {
 const { auth, jobId } = await seedWorkPractice(f), repository = new RecoveryLineAllocationRepository(f.runtime, "synthetic_demo");
 const command = { version: "receipt-line-allocation-command.v1", action: "approve", commandId: randomUUID(), expectedSourceRevision: 1, reviewId: randomUUID(), approvalHash: "a".repeat(64) };
 const results = await Promise.allSettled([1, 2].map(() => repository.command(auth.context, auth, auth.digest, jobId, command)));
 expect(results.map(result => result.status)).toEqual(["rejected", "rejected"]);
 for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED" });
 expect((await f.admin.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_revision")).rows[0].n).toBe(0);
});
it("A3: caller-owned transaction cannot use a held read as a positive-use watermark", async () => {
 const { auth, jobId } = await seedWorkPractice(f), repository = new RecoveryLineAllocationRepository(f.runtime, "synthetic_demo");
 await expect(withTenant(practiceMaterialPool(f.runtime, auth.digest), auth.context, async db => {
  await repository.readCurrentInTransaction(db, auth.context, auth, auth.digest, { jobId }, { revision: 1, sourceHash: "a".repeat(64) });
  throw new Error("UNSAFE_DEPENDENT_WRITE_REACHED");
 })).rejects.toMatchObject({ code: "RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED" });
});
