import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWatchdogHarness } from "./watchdog-command-harness.js";

// CH-2 upgrade rule for command ids: an id that the previous schema persisted belongs to the command that persisted it, so no OTHER
// kind of watchdog command may claim it, before or after that command's own first replay. The previous schema is reproduced exactly:
// run the real command, then remove the two bookkeeping tables migration 0050 added (identity, stored result), leaving only the
// stores that existed before it. Where an id persisted is found by looking at every uuid column in the app schema, not by trusting
// a list in the code under test. The commands are the registry's 17.
const h = createWatchdogHarness("legacy-ids", 63000);
const { cases, live, norm, CONFLICT } = h;
beforeAll(() => h.boot(), 120000);
afterAll(() => h.stop());

const BOOKKEEPING = new Set(["watchdog_command_identity", "watchdog_command_result", "proof_application_response"]);
let probe: string | undefined;
/** Every table.column in the app schema holding this uuid, bookkeeping aside. */
async function persistedIn(id: string): Promise<string[]> {
  if (!probe) {
    const columns = (await h.admin.query<{ t: string; c: string }>("SELECT table_name t, column_name c FROM information_schema.columns WHERE table_schema='app' AND data_type='uuid' ORDER BY 1,2")).rows.filter(row => !BOOKKEEPING.has(row.t));
    probe = columns.map(({ t, c }) => `SELECT '${t}.${c}' AS found FROM app."${t}" WHERE "${c}"=$1`).join(" UNION ALL ");
  }
  return (await h.admin.query<{ found: string }>(probe, [id])).rows.map(row => row.found);
}
const previousSchema = async (id: string) => {
  await h.admin.query("DELETE FROM app.watchdog_command_result WHERE command_id=$1", [id]);
  await h.admin.query("DELETE FROM app.proof_application_response WHERE command_id=$1", [id]).catch(() => undefined);
  await h.admin.query("DELETE FROM app.watchdog_command_identity WHERE command_id=$1", [id]);
};
const identityRows = async (id: string) => Number((await h.admin.query("SELECT count(*) n FROM app.watchdog_command_identity WHERE command_id=$1", [id])).rows[0].n);

// The commands whose id the previous schema persisted. The other four (order revision, document intake, goods receipt, finalisation)
// had no command id before migration 0050, so there is nothing to protect.
const PERSISTED_BEFORE = [
  "discrepancy-repository.ts#evaluate", "discrepancy-repository.ts#review", "discrepancy-repository.ts#supersede", "evidence.ts#beginUpload",
  "inbox-relevance-repository.ts#dismiss", "inbox-relevance-repository.ts#seed", "proof-repository.ts#complete", "purchase-order-repository.ts#place",
  "readiness-repository.ts#advance", "readiness-repository.ts#record", "supplier-document-repository.ts#confirm", "supplier-match-repository.ts#correct", "supplier-match-repository.ts#create",
];

describe("previous-schema command ids cannot be claimed by another kind of command", () => {
  it("names the commands whose ids the previous schema persisted, found by looking in the database", async () => {
    const found: string[] = [];
    for (const c of cases) {
      const job = await live(); await c.prepare(job);
      const id = randomUUID(); await c.run(job, id, "base"); await previousSchema(id);
      if ((await persistedIn(id)).length) found.push(c.key);
    }
    expect(found.sort()).toEqual([...PERSISTED_BEFORE].sort());
  }, 300000);

  it.each(cases.filter(c => PERSISTED_BEFORE.includes(c.key)).map(c => [c.key, c] as const))("%s: every other kind is refused the id before the first original replay, and the original still replays", async (_key, c) => {
    const job = await live(); await c.prepare(job);
    const id = randomUUID(), first = norm(await c.run(job, id, "base"));
    await c.later(job);
    await previousSchema(id);
    expect((await persistedIn(id)).length, "the id must still be persisted by the previous-schema stores").toBeGreaterThan(0);
    for (const other of cases) {
      if (other === c) continue;
      const foreign = await h.probeJob(other);
      await expect(other.run(foreign, id, "base"), `${other.key} must not claim ${c.key}'s previous-schema id`).rejects.toThrow(CONFLICT);
      expect(await identityRows(id), `${other.key} must not have claimed the id`).toBe(0);
    }
    // Nothing else changed: the original command's replay still returns what it first returned...
    expect(norm(await c.run(job, id, "base"))).toEqual(first);
    // ...and after that replay every other kind is still refused the id.
    for (const other of cases) {
      if (other === c) continue;
      await expect(other.run(await h.probeJob(other), id, "base"), `${other.key} must still not claim ${c.key}'s id after its replay`).rejects.toThrow(CONFLICT);
    }
    // And a changed payload or another job still conflicts after that replay.
    await expect(c.run(job, id, "changed")).rejects.toThrow(CONFLICT);
  }, 300000);

  it("an id persisted by two kinds in the previous schema is refused to both: no winner is picked", async () => {
    const review = cases.find(c => c.key === "discrepancy-repository.ts#review")!, supersede = cases.find(c => c.key === "discrepancy-repository.ts#supersede")!;
    const jobA = await live(), jobB = await live(); await review.prepare(jobA); await supersede.prepare(jobB);
    const a = randomUUID(), b = randomUUID(), shared = randomUUID();
    await review.run(jobA, a, "base"); await supersede.run(jobB, b, "base");
    // The collision the old schema allowed: one id in the review store and in the supersession store.
    await h.admin.query("UPDATE app.discrepancy_review_outcome SET command_id=$2 WHERE command_id=$1", [a, shared]);
    await h.admin.query("UPDATE app.supplier_bill_supersession SET command_id=$2 WHERE command_id=$1", [b, shared]);
    await previousSchema(a); await previousSchema(b);
    expect((await persistedIn(shared)).sort()).toEqual(["discrepancy_review_outcome.command_id", "supplier_bill_supersession.command_id"]);
    // The documented pre-deploy check (MIGRATIONS.md) names exactly this id.
    const docs = await readFile(new URL("../MIGRATIONS.md", import.meta.url), "utf8");
    const check = docs.match(/```sql\n(-- 0050 pre-deploy collision check[\s\S]*?)```/u)?.[1];
    expect(check, "MIGRATIONS.md must contain the 0050 pre-deploy collision check").toBeTruthy();
    expect((await h.admin.query<{ command_id: string; kinds: string; jobs: string }>(check!)).rows.map(row => [row.command_id, Number(row.kinds), Number(row.jobs)])).toEqual([[shared, 2, 2]]);
    await expect(review.run(jobA, shared, "base")).rejects.toThrow(CONFLICT);
    await expect(supersede.run(jobB, shared, "base")).rejects.toThrow(CONFLICT);
    expect(await identityRows(shared)).toBe(0);
    // A third kind is refused as well.
    const third = cases.find(c => c.key === "readiness-repository.ts#record")!;
    await expect(third.run(await h.probeJob(third), shared, "base")).rejects.toThrow(CONFLICT);
  }, 120000);

  it("an id the previous schema never persisted is still granted to the first kind that claims it", async () => {
    for (const c of cases) {
      const job = await live(); await c.prepare(job);
      await expect(c.run(job, randomUUID(), "base")).resolves.toBeDefined();
    }
  }, 300000);
});
