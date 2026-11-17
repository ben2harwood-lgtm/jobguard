// Real PostgreSQL property histories; no in-memory state substitutes for committed effects.
import { afterAll, beforeAll, expect, it } from "vitest";
import { derivedUuid } from "../src/index.js";
import { cluster, crews, intent, submit, freshRuntime, seeded, shuffled, committed, command, revise, facts, chain, type Cluster } from "./offline-risk-test-utils.js";
let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 60_000);
afterAll(async () => { await c?.close(); });

it("M31-S15 real database multi-crew convergence", async () => {
 for (const seed of [17, 73, 251, 991]) {
  let baseline: unknown;
  for (const schedule of ["ordered", "reordered_delayed", "concurrent"] as const) {
   const { f, actors } = await crews(c), next = seeded(seed);
   const originals = Array.from({ length: 6 }, (_, i) => {
    const raw = intent(f.jobId, i);
    raw.body.commandId = `00000000-0000-7000-8000-${String(seed * 100 + i).padStart(12, "0")}`;
    // Equal clocks across distinct crews, backwards clocks and far-ahead clocks all occur.
    raw.clientMetadata.hlc = { wallTimeMs: i < 3 ? 1 : i % 2 ? 0 : Number.MAX_SAFE_INTEGER, logical: 0, nodeId: `fictional-crew-${i % 3}` };
    return { raw, crew: i % 3 };
   });
   const deliveries = [...originals, originals[0]!, originals[0]!, originals[4]!];
   const history = schedule === "ordered" ? deliveries : schedule === "concurrent"
    ? [originals[0]!, originals[0]!, originals[0]!, ...shuffled([...originals.slice(1), originals[4]!], next)]
    : shuffled(deliveries, next);
   const label = JSON.stringify({ seed, schedule, history: history.map(x => ({ command: x.raw.body.commandId, crew: x.crew })) });
   const before = await facts(c, f);
   const apply = async (entry: typeof originals[number]) => freshRuntime(c, async pool => {
    const result = await submit(pool, f, actors[entry.crew]!.member, entry.raw);
    expect(result.variationId, label).toBe(derivedUuid(`extra:${f.p.tenantId}:${f.jobId}:${entry.raw.body.commandId}`));
    return result;
   });
   try {
    if (schedule === "concurrent") {
     for (let i = 0; i < history.length; i += 3) {
      // Release each batch together, with one independently owned pool for every delivery.
      let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
      const batch = history.slice(i, i + 3).map(async entry => { await barrier; return apply(entry); });
      release(); await Promise.all(batch);
     }
    } else for (const entry of history) await apply(entry);
    const after = await facts(c, f);
    for (const table of ["receipts", "scopes", "variations", "origins", "events", "audit"] as const) expect(after[table].length - before[table].length, `${label}: ${table}`).toBe(6);
    const semantics = [];
    for (const entry of originals) {
     const first = await apply(entry);
     const origin = await committed(c, f, actors[entry.crew]!.member, entry.raw, first);
     expect(origin.work_order_revision_id, label).toBe((await c.admin.query("SELECT revision_id FROM app.work_order_current WHERE tenant_id=$1 AND work_order_id=$2", [f.p.tenantId, f.orderId])).rows[0]!.revision_id);
     semantics.push({ command: origin.command_id, crew: entry.crew, note: entry.raw.body.note, description: entry.raw.body.description });
    }
    if (baseline === undefined) baseline = semantics;
    else expect(semantics, label).toEqual(baseline);
    expect(await facts(c, f), label).toEqual(after); await chain(c, f);
   } catch (error) { throw new Error(label, { cause: error }); }
  }
 }
}, 120_000);

it("M31-S15 generated authority and baseline changes have explicit outcomes", async () => {
 for (const seed of [101, 202, 303, 404]) {
  const { f, actors } = await crews(c), selected = actors[seed % 3]!, raw = intent(f.jobId, seed);
  const next = seeded(seed), operations = shuffled(["capture", "revoke", "revise"] as const, next);
  const label = JSON.stringify({ seed, operations, command: raw.body.commandId });
  const revisionBefore = (await c.admin.query("SELECT revision_id FROM app.work_order_current WHERE tenant_id=$1 AND work_order_id=$2", [f.p.tenantId, f.orderId])).rows[0]!.revision_id;
  // Race capture with revocation; defer baseline revision past both (FIX-LATER: LOCK-ORDER-1).
  const results: PromiseSettledResult<unknown>[] = await Promise.allSettled(operations.filter(operation => operation !== "revise").map(operation => operation === "capture"
   ? freshRuntime(c, pool => submit(pool, f, selected.member, raw))
   : command(c, f, { kind: "grant.revoke", grantId: selected.grant })));
  results.splice(operations.indexOf("revise"), 0, ...await Promise.allSettled([
   revise(c, f, actors.map(a => a.member.membershipId), 2)
  ]));
  for (const operation of ["revoke", "revise"] as const) expect(results[operations.indexOf(operation)]!.status, label).toBe("fulfilled");
  const capture = results[operations.indexOf("capture")]!;
  const revisionAfter = (await c.admin.query("SELECT revision_id FROM app.work_order_current WHERE tenant_id=$1 AND work_order_id=$2", [f.p.tenantId, f.orderId])).rows[0]!.revision_id;
  expect(revisionAfter, label).not.toBe(revisionBefore);
  if (capture.status === "fulfilled") {
   const first = capture.value as { variationId: string };
   const origin = await committed(c, f, selected.member, raw, first);
   expect([revisionBefore, revisionAfter], label).toContain(origin.work_order_revision_id);
  } else {
   // A failed in-flight capture must leave no receipt/effect. These are existing current-authority/conflict refusals.
   expect(["NOT_FOUND", "EXTRA_FORBIDDEN", "STALE_REVISION"], label).toContain((capture.reason as { code?: string }).code);
   expect((await c.admin.query("SELECT command_id FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.body.commandId])).rows, label).toEqual([]);
   expect((await c.admin.query("SELECT command_id FROM app.extra_origin WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.body.commandId])).rows, label).toEqual([]);
  }
  const before = await facts(c, f);
  for (const request of [raw, intent(f.jobId, seed + 1)]) await expect(submit(c.runtime, f, selected.member, request), label).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await facts(c, f), label).toEqual(before); await chain(c, f);
 }
}, 120_000);
