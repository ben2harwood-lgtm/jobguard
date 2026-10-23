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
