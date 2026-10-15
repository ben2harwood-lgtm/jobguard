import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertJob, jobDoorCounts, jobDoorsActor, jobDoorsDatabase, transaction, type InitialShape, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(); }, 300_000);
afterAll(async () => { await db?.close(); });

describe("LP-2 ordinary insertion boundary (tests first; implementation stopped)", () => {
  it("[LP2-A02] ordinary safe draft insertion succeeds and persists through a fresh connection", async () => {
    const actor = await jobDoorsActor(db.owner), id = randomUUID();
    await transaction(db.runtime, actor.tenant, client => insertJob(client, actor.tenant, id));
    const client = await db.owner.connect();
    try {
      expect((await client.query(`SELECT status,revision,provenance,accepted_quote_version_id,baseline_quote_version_id,
        accepted_net_value_pence,recovery_cap_pence,fee_policy_version FROM app.job WHERE tenant_id=$1 AND id=$2`, [actor.tenant, id])).rows).toEqual([{
        status: "draft", revision: 0, provenance: "system_generated_quote", accepted_quote_version_id: null,
        baseline_quote_version_id: null, accepted_net_value_pence: null, recovery_cap_pence: null, fee_policy_version: null,
      }]);
    } finally { client.release(); }
  });

  const prohibited: Array<[string, InitialShape]> = [
    ...["quoting", "accepted", "live", "invoiced", "paid", "lost"].map(status => [`status ${status}`, { status }] as [string, InitialShape]),
    ["nonzero revision", { revision: 1 }],
    ["accepted quote pointer", { accepted_quote_version_id: randomUUID() }],
    ["baseline quote pointer", { baseline_quote_version_id: randomUUID() }],
    ["net value", { accepted_net_value_pence: 0 }],
    ["recovery cap", { recovery_cap_pence: 0 }],
    ["fee policy", { fee_policy_version: "reference_fee_policy_v1" }],
    ["complete initial commercial baseline", { baseline_quote_version_id: randomUUID(), accepted_net_value_pence: 100100,
      fee_policy_version: "reference_fee_policy_v1", recovery_cap_pence: 1502 }],
    ["state plus revision", { status: "quoting", revision: 5 }],
    ["all prohibited fields", { status: "live", revision: 3, accepted_quote_version_id: randomUUID(),
      baseline_quote_version_id: randomUUID(), accepted_net_value_pence: 100100, fee_policy_version: "reference_fee_policy_v1", recovery_cap_pence: 1502 }],
  ];
  it.each(prohibited)("[LP2-A02] runtime refuses %s before constraints and leaves no side effect", async (_name, shape) => {
    const actor = await jobDoorsActor(db.owner), before = await jobDoorCounts(db.owner, actor.tenant);
    await expect(transaction(db.runtime, actor.tenant, client => insertJob(client, actor.tenant, randomUUID(), shape))).rejects.toMatchObject({ code: "42501" });
    expect(await jobDoorCounts(db.owner, actor.tenant)).toEqual(before);
  });
});
