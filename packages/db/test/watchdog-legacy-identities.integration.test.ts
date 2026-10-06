import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAuditBatch, claimCommandIdentity, withTenant, type TenantTransaction, type WatchdogCommandType } from "../src/index.js";
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

// Codex P2 4197534379: the previous application never claims, so during a mixed-version rollout or after the documented application
// rollback it can write an id the new schema has claimed, or write one between a claim's reservation check and its insert. Every
// previous-schema store therefore takes the claim's per-id lock and refuses an id claimed for another kind or job.
describe("previous-schema writers and claimed ids", () => {
  const hash = "a".repeat(64);
  /** What the previous application writes for an inbox seed: a dispatcher receipt keyed by the job. */
  const legacySeed = (db: { query: (sql: string, values: unknown[]) => Promise<unknown> }, commandId: string, job: string) =>
    db.query("INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)VALUES($1,$2,'inbox.seed',$3,$4,'processing',$5)",
      [commandId, h.tenant, `inbox:${job}`, hash, h.member]);
  /** Opens a transaction holding a claim of `commandId`; on refusal it rolls back, releases and rethrows. */
  async function claimOpen(commandId: string, job: string, kind: WatchdogCommandType) {
    const client = await h.admin.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [h.tenant]);
      await claimCommandIdentity({ $client: client } as unknown as TenantTransaction, { tenantId: h.tenant, commandId, jobId: job, kind, requestHash: hash });
      return client;
    } catch (error) { await client.query("ROLLBACK"); client.release(); throw error; }
  }
  const claim = async (commandId: string, job: string, kind: WatchdogCommandType) => { const client = await claimOpen(commandId, job, kind); await client.query("COMMIT"); client.release(); };
  const settle = (work: Promise<unknown>) => work.then(() => "committed", (error: { code?: string; message?: string }) => error.code === "23505" || error.message === "IDEMPOTENCY_CONFLICT" ? "conflict" : error);
  const stillWaiting = async (state: { done: boolean }) => { await new Promise(resolve => setTimeout(resolve, 400)); return !state.done; };

  it("refuses a previous-schema write of an id already claimed for another kind or another job, and admits its own", async () => {
    const job = await live(), other = await live();
    const otherKind = randomUUID(); await claim(otherKind, job, "readiness.record");
    await expect(legacySeed(h.admin, otherKind, job)).rejects.toMatchObject({ code: "23505" });
    const otherJob = randomUUID(); await claim(otherJob, other, "inbox.seed");
    await expect(legacySeed(h.admin, otherJob, job)).rejects.toMatchObject({ code: "23505" });
    const own = randomUUID(); await claim(own, job, "inbox.seed");
    await expect(legacySeed(h.admin, own, job)).resolves.toBeDefined();
  });

  it("serialises a claim and a previous-schema write of one id, in either order", async () => {
    const job = await live();
    // The claim holds the id: the previous-schema write waits for it, then conflicts.
    const first = randomUUID(), holder = await claimOpen(first, job, "readiness.record"), legacy = { done: false };
    const write = settle(legacySeed(h.admin, first, job)).finally(() => { legacy.done = true; });
    expect(await stillWaiting(legacy)).toBe(true);
    await holder.query("COMMIT"); holder.release();
    expect(await write).toBe("conflict");
    // The previous-schema write holds the id: the claim waits for it, then finds the id owned and conflicts.
    const second = randomUUID(), writer = await h.admin.connect(), claimed = { done: false };
    await writer.query("BEGIN"); await legacySeed(writer, second, job);
    const claiming = settle(claim(second, job, "readiness.record")).finally(() => { claimed.done = true; });
    expect(await stillWaiting(claimed)).toBe(true);
    await writer.query("COMMIT"); writer.release();
    expect(await claiming).toBe("conflict");
  });

  it("tells a supplier-match correction from a creation by its audit event, at commit (Codex P2 4197723875)", async () => {
    const correct = cases.find(c => c.key === "supplier-match-repository.ts#correct")!;
    const job = await live(); await correct.prepare(job);
    const original = randomUUID(); await correct.run(job, original, "base");
    /** What the previous application would write for a correction under `commandId`: a revision bound to a "corrected" audit event. */
    let copies = 0;
    const proposalOf = async (commandId: string) => (await h.admin.query("SELECT proposal_id FROM app.supplier_match_revision WHERE tenant_id=$1 AND command_id=$2", [h.tenant, commandId])).rows[0]!.proposal_id as string;
    /** A fresh audit event of `eventType` about `proposalId`, as a previous-schema writer would append for its own revision. */
    const freshEvent = async (proposalId: string, eventType = "supplier_match.corrected") => (await withTenant(h.runtime, h.ctx, db => appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: "member:synthetic-builder", eventType, subjectType: "supplier_match", subjectRef: proposalId, payload: { references: { proposalId }, hashes: { payloadHash: "a".repeat(64) }, classifications: { action: "operational" } } }])))[0]!.id;
    const legacyCorrection = async (commandId: string, auditEventId?: string) => {
      const client = await h.admin.connect();
      try {
        await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [h.tenant]);
        await client.query(`INSERT INTO app.supplier_match_revision(id,tenant_id,job_id,proposal_id,command_id,revision,order_revision_id,receipt_version_ids,bill_revision_id,actor_ref,subject_ref,payload_hash,audit_event_id,invalidates_unresolved_findings)
          SELECT gen_random_uuid(),tenant_id,job_id,proposal_id,$2,revision+$5,order_revision_id,receipt_version_ids,bill_revision_id,actor_ref,subject_ref,payload_hash,coalesce($4::uuid,audit_event_id),invalidates_unresolved_findings
          FROM app.supplier_match_revision WHERE tenant_id=$1 AND command_id=$3`, [h.tenant, commandId, original, auditEventId ?? null, 1000 + (++copies)]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
    };
    const proposal = await proposalOf(original);
    const createId = randomUUID(); await claim(createId, job, "supplier_match.create");
    await expect(legacyCorrection(createId, await freshEvent(proposal))).rejects.toMatchObject({ code: "23505" });
    const correctId = randomUUID(); await claim(correctId, job, "supplier_match.correct");
    await expect(legacyCorrection(correctId, await freshEvent(proposal))).resolves.toBeUndefined();
    // An earlier event of the same proposal already stands behind its own revision and cannot be borrowed (Codex P2 4199159015).
    const borrowing = randomUUID(); await claim(borrowing, job, "supplier_match.correct");
    await expect(legacyCorrection(borrowing)).rejects.toMatchObject({ code: "23505", constraint: "supplier_match_revision_audit_event_uq" });
    // A revision citing any other event (here the proposal's "proposed" event) is refused, claimed or not (Codex P2 4197809983).
    const proposed = (await h.admin.query("SELECT id FROM app.audit_event WHERE tenant_id=$1 AND event_type='supplier_match.proposed' AND subject_ref=$2 LIMIT 1", [h.tenant, job])).rows[0]!.id as string;
    const claimedCorrect = randomUUID(); await claim(claimedCorrect, job, "supplier_match.correct");
    await expect(legacyCorrection(claimedCorrect, proposed)).rejects.toMatchObject({ code: "23514" });
    await expect(legacyCorrection(randomUUID(), proposed)).rejects.toMatchObject({ code: "23514" });
    // So is a valid "corrected" event that belongs to another proposal (Codex P2 4199041823).
    const elsewhere = await live(); await correct.prepare(elsewhere);
    const foreignCommand = randomUUID(); await correct.run(elsewhere, foreignCommand, "base");
    const foreignEvent = await freshEvent(await proposalOf(foreignCommand));
    const borrowed = randomUUID(); await claim(borrowed, job, "supplier_match.correct");
    await expect(legacyCorrection(borrowed, foreignEvent)).rejects.toMatchObject({ code: "23514" });
  });

  it("finds an existing revision that does not cite its own event, both in the pre-deploy query and in 0050's upgrade check (Codex P2 4199041831)", async () => {
    const correct = cases.find(c => c.key === "supplier-match-repository.ts#correct")!;
    const job = await live(); await correct.prepare(job);
    const original = randomUUID(); await correct.run(job, original, "base");
    const docs = await readFile(new URL("../MIGRATIONS.md", import.meta.url), "utf8");
    const listed = docs.match(/```sql\n(-- 0050 pre-deploy supplier-match revision check[\s\S]*?)```/u)?.[1];
    const migration = await readFile(new URL("../migrations/0050_watchdog_live.sql", import.meta.url), "utf8");
    const upgradeCheck = migration.match(/(-- 0050 supplier-match revision check[\s\S]*?ALTER TABLE app\.audit_event FORCE ROW LEVEL SECURITY;)/u)?.[1];
    expect(listed, "MIGRATIONS.md must contain the supplier-match revision check").toBeTruthy();
    expect(upgradeCheck, "0050 must contain the supplier-match revision check").toBeTruthy();
    const client = await h.admin.connect();
    try {
      await client.query("BEGIN");
      // What a previous-schema writer could have left behind: a revision citing its proposal's "proposed" event (no trigger then).
      await client.query("SET LOCAL session_replication_role = replica");
      const planted = randomUUID();
      await client.query(`INSERT INTO app.supplier_match_revision(id,tenant_id,job_id,proposal_id,command_id,revision,order_revision_id,receipt_version_ids,bill_revision_id,actor_ref,subject_ref,payload_hash,audit_event_id,invalidates_unresolved_findings)
        SELECT $4,tenant_id,job_id,proposal_id,gen_random_uuid(),revision+5000,order_revision_id,receipt_version_ids,bill_revision_id,actor_ref,subject_ref,payload_hash,
          (SELECT id FROM app.audit_event WHERE tenant_id=$1 AND event_type='supplier_match.proposed' AND subject_ref=$3 LIMIT 1),invalidates_unresolved_findings
        FROM app.supplier_match_revision WHERE tenant_id=$1 AND command_id=$2`, [h.tenant, original, job, planted]);
      await client.query("SET LOCAL session_replication_role = origin");
      expect((await client.query(listed!)).rows.map(row => row.id)).toEqual([planted]);
      await client.query("SAVEPOINT upgrade");
      await expect(client.query(upgradeCheck!)).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT upgrade");
    } finally { await client.query("ROLLBACK"); client.release(); }
    // With only well-formed revisions the same upgrade check passes and leaves FORCE in place.
    await h.admin.query(upgradeCheck!);
    expect((await h.admin.query("SELECT bool_and(relforcerowsecurity) f FROM pg_class WHERE relname IN ('supplier_match_revision','audit_event') AND relnamespace='app'::regnamespace")).rows[0].f).toBe(true);
  });
});
