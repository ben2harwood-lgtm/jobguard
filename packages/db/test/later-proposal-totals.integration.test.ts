import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "@jobguard/core";
import { JobRepository } from "../src/job-repository.js";
import { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let fixture: WorkFixture;
const tenantId = randomUUID(), context = testTenantContext(tenantId);
beforeAll(async () => {
  fixture = await createWorkFixture();
  await fixture.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
}, 60_000);
afterAll(async () => { await closeWorkFixture(fixture); });

async function reserved() {
  const repository = new JobRepository(fixture.runtime), jobId = randomUUID();
  await repository.create(context, ["job:update"], { id: jobId, title: "Fictional money boundary job" });
  const row = await repository.reserveProposal(context, ["quote:edit"], {
    jobId, sourceHash: "a".repeat(64), sourceReference: "synthetic:proposal:1",
  });
  const input = { jobId, proposalId: row.id as string, description: "Fictional scope", quantityDecimal: "1.5", unit: "item", unitPricePence: 101, totalPence: 152 };
  const snapshot = () => workTenant(fixture.runtime, tenantId, async db => (await db.query(`SELECT
    (SELECT row_to_json(p)::text FROM app.proposal_line p WHERE tenant_id=$1 AND id=$2) proposal,
    (SELECT row_to_json(s)::text FROM app.scope_identity s WHERE tenant_id=$1 AND id=$3) identity,
    (SELECT count(*)::int FROM app.scope_revision WHERE tenant_id=$1 AND job_id=$4) revisions,
    (SELECT count(*)::int FROM app.scope_progress WHERE tenant_id=$1 AND job_id=$4) progress,
    (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1) audits`, [tenantId, row.id, row.scope_item_id, jobId])).rows[0]);
  return { repository, input, snapshot, scopeItemId: row.scope_item_id };
}

describe("LATER-B27 PostgreSQL proposal boundaries", () => {
  it("L016 confirmation rejects a total inconsistent with exact quantity times rate without state/audit changes", async () => {
    const { repository, input, snapshot, scopeItemId } = await reserved(), before = await snapshot();
    for (const totalPence of [151, 153]) {
      await expect(repository.confirmProposal(context, ["quote:edit"], { ...input, totalPence })).rejects.toMatchObject({ name: "ZodError" });
      expect(await snapshot()).toEqual(before);
    }
    const result = await repository.confirmProposal(context, ["quote:edit"], input);
    expect(result).toMatchObject({ scope_item_id: scopeItemId, total_pence: "152" });
    expect(await snapshot()).toMatchObject({ revisions: 1, progress: 1 });
  });

  it("L102 valid maximum passes and overflow is typed before database coercion with no state/audit changes", async () => {
    const { repository, input, snapshot } = await reserved(), before = await snapshot();
    for (const amount of [MAX_MONEY_PENCE + 1, -MAX_MONEY_PENCE, -MAX_MONEY_PENCE - 1, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(repository.confirmProposal(context, ["quote:edit"], { ...input, quantityDecimal: "1", unitPricePence: amount, totalPence: amount })).rejects.toMatchObject({ name: "ZodError" });
      expect(await snapshot()).toEqual(before);
    }
    await expect(repository.confirmProposal(context, ["quote:edit"], { ...input, quantityDecimal: "2", unitPricePence: MAX_MONEY_PENCE, totalPence: MAX_MONEY_PENCE })).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ params: { moneyCode: "overflow" } })]),
    });
    expect(await snapshot()).toEqual(before);
    expect(await repository.confirmProposal(context, ["quote:edit"], { ...input, quantityDecimal: "1", unitPricePence: MAX_MONEY_PENCE, totalPence: MAX_MONEY_PENCE })).toMatchObject({ total_pence: String(MAX_MONEY_PENCE) });
  });
});
