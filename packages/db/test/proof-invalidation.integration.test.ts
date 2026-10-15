import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ProofCommandService } from "../src/proof-repository.js";
import { verifyAuditChain, type AuditEvent } from "../src/audit.js";
import { createWatchdogHarness } from "./watchdog-command-harness.js";

// Run on the Mac / CI: real PostgreSQL 16, real runtime grants and transactions.
// Wrappers pause around actual statements; they never substitute database results.
const h = createWatchdogHarness("proof-invalidation", 62100);
beforeAll(() => h.boot(), 120000);
afterAll(() => h.stop());

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function instrument(after: (sql: string, pid: number) => Promise<void>, before: (sql: string, pid: number) => void = () => {}) {
  return new Proxy(h.runtime, {
    get(pool, key) {
      if (key !== "connect") { const value = Reflect.get(pool, key, pool); return typeof value === "function" ? value.bind(pool) : value; }
      return async () => {
        const client = await pool.connect();
        const pid = Number((await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
        return new Proxy(client, {
          get(real, property) {
            if (property !== "query") { const value = Reflect.get(real, property, real); return typeof value === "function" ? value.bind(real) : value; }
            return async (sql: string, values?: unknown[]) => {
              before(sql, pid);
              const result = await real.query(sql, values);
              await after(sql, pid);
              return result;
            };
          },
        }) as PoolClient;
      };
    },
  }) as Pool;
}

async function prepared() {
  const job = await h.live(); await h.pre.evidence(job);
  const evidenceId = h.st(job).upload.id as string;
  const completion = { version: "proof.complete.v1", commandId: randomUUID(), actorMembershipId: h.member, jobId: job,
    scopeItemId: h.st(job).scope, stage: "electrical-stage", evidenceId, requiredEvidenceType: "electrical_certificate", decisionId: null };
  const invalidation = { version: "proof.invalidate.v1", commandId: randomUUID(), actorMembershipId: h.member, evidenceId, reasonCode: "verification_invalid" };
  return { job, evidenceId, completion, invalidation };
}

async function expectBlocked(waiter: number, holder: number) {
  await vi.waitFor(async () => {
    const row = (await h.admin.query<{ blockers: number[] }>("SELECT pg_blocking_pids($1) AS blockers", [waiter])).rows[0]!;
    expect(row.blockers).toContain(holder);
  }, { timeout: 3000, interval: 10 });
}

async function reviewRows(evidenceId: string) {
  return (await h.admin.query(`SELECT r.stage_completion_id,r.evidence_invalidation_id FROM app.stage_review_event r
    JOIN app.evidence_invalidation i ON(i.tenant_id,i.id)=(r.tenant_id,r.evidence_invalidation_id)
    WHERE i.tenant_id=$1 AND i.evidence_id=$2`, [h.tenant, evidenceId])).rows;
}

describe("proof invalidation PostgreSQL regressions", () => {
  it("completion cannot clear a concurrent evidence invalidation", async () => {
    const p = await prepared(), eligible = deferred(), resume = deferred(), lockAttempted = deferred();
    let holder = 0, waiter = 0;
    const completionPool = instrument(async (sql, pid) => {
      if (sql.includes("e.kind='original'") && sql.includes("FOR UPDATE OF u")) {
        holder = pid; eligible.resolve(); await resume.promise;
      }
    });
    const invalidationPool = instrument(async () => {}, (sql, pid) => {
      if (sql.includes("FOR UPDATE OF u")) { waiter = pid; lockAttempted.resolve(); }
    });
    const completing = new ProofCommandService(completionPool, h.storage).complete(h.ctx, p.completion);
    await eligible.promise;
    const invalidating = new ProofCommandService(invalidationPool, h.storage).invalidate(h.ctx, p.invalidation);
    // Against the old code invalidation commits before this suspended completion
    // and leaves no review event. Against the fix it demonstrably waits on its lock.
    try {
      const outcome = await Promise.race([lockAttempted.promise.then(() => "lock"), invalidating.then(() => "committed")]);
      if (outcome === "lock") await expectBlocked(waiter, holder);
    } finally { resume.resolve(); }
    const [result] = await Promise.all([completing, invalidating]) as [{ completionId: string }, unknown];
    const invalidation = (await h.admin.query("SELECT id FROM app.evidence_invalidation WHERE tenant_id=$1 AND evidence_id=$2", [h.tenant, p.evidenceId])).rows[0]!;
    expect(await reviewRows(p.evidenceId)).toEqual([{ stage_completion_id: result.completionId, evidence_invalidation_id: invalidation.id }]);
    expect((await h.admin.query("SELECT count(*)::int AS n FROM app.stage_completion WHERE tenant_id=$1 AND job_id=$2", [h.tenant, p.job])).rows[0].n).toBe(1);
  });

  it("completion rechecks invalidation after waiting for the upload lock", async () => {
    const p = await prepared(), storageRead = deferred(), resumeStorage = deferred(), inserted = deferred(), resumeInvalidation = deferred(), lockAttempted = deferred();
    let holder = 0, waiter = 0;
    const read = h.storage.readExactVersion.bind(h.storage);
    const storageSpy = vi.spyOn(h.storage, "readExactVersion").mockImplementationOnce(async (key, version) => {
      storageRead.resolve(); await resumeStorage.promise; return read(key, version);
    });
    const completionPool = instrument(async () => {}, (sql, pid) => {
      if (sql.includes("FOR UPDATE OF u")) { waiter = pid; lockAttempted.resolve(); }
    });
    const invalidationPool = instrument(async (sql, pid) => {
      if (sql.startsWith("INSERT INTO app.evidence_invalidation")) { holder = pid; inserted.resolve(); await resumeInvalidation.promise; }
    });
    // Attach the rejection handler before resuming either transaction.
    const completing = new ProofCommandService(completionPool, h.storage).complete(h.ctx, p.completion).then(value => ({ value }), error => ({ error }));
    await storageRead.promise;
    const invalidating = new ProofCommandService(invalidationPool, h.storage).invalidate(h.ctx, p.invalidation);
    try {
      await inserted.promise; resumeStorage.resolve();
      await lockAttempted.promise;
      await expectBlocked(waiter, holder);
    } finally { resumeStorage.resolve(); resumeInvalidation.resolve(); storageSpy.mockRestore(); }
    await invalidating;
    expect(await completing).toMatchObject({ error: { code: "PROOF_NOT_FINAL" } });
    for (const table of ["stage_completion", "watchdog_command_identity", "command_receipt"])
      expect((await h.admin.query(`SELECT 1 FROM app.${table} WHERE tenant_id=$1 AND command_id=$2`, [h.tenant, p.completion.commandId])).rowCount).toBe(0);
    expect(await reviewRows(p.evidenceId)).toEqual([]);
    expect((await h.admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND event_type='proof.completed' AND payload->'references'->>'evidenceId'=$2", [h.tenant, p.evidenceId])).rowCount).toBe(0);
  });

  it("invalidation retries preserve audit references without a second business event", async () => {
    const p = await prepared();
    await h.repos.proof.complete(h.ctx, p.completion);
    const first = await h.repos.proof.invalidate(h.ctx, p.invalidation);
    const head = (await h.admin.query("SELECT max(sequence)::text AS sequence FROM app.audit_event WHERE tenant_id=$1", [h.tenant])).rows[0];
    const replies = await Promise.all([
      h.repos.proof.invalidate(h.ctx, p.invalidation),
      h.repos.proof.invalidate(h.ctx, { ...p.invalidation, commandId: randomUUID() }),
    ]);
    expect(replies).toEqual([first, first]);
    expect((await h.admin.query("SELECT max(sequence)::text AS sequence FROM app.audit_event WHERE tenant_id=$1", [h.tenant])).rows[0]).toEqual(head);
    const invalidations = (await h.admin.query("SELECT id FROM app.evidence_invalidation WHERE tenant_id=$1 AND evidence_id=$2", [h.tenant, p.evidenceId])).rows;
    expect(invalidations).toHaveLength(1);
    const events = (await h.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='proof.rework_required' AND subject_ref=$2", [h.tenant, p.evidenceId])).rows;
    expect(events).toHaveLength(1);
    expect(events[0].payload.references.invalidationId).toBe(invalidations[0].id);
    expect(await reviewRows(p.evidenceId)).toHaveLength(1);
    expect((await h.admin.query("SELECT 1 FROM app.job_finding WHERE tenant_id=$1 AND job_id=$2 AND kind='required_proof'", [h.tenant, p.job])).rowCount).toBe(1);
    const chain = await h.admin.query<AuditEvent>(`SELECT id,tenant_id AS "tenantId",sequence::int,version,actor_ref AS "actorRef",event_type AS "eventType",
      subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,payload_hash AS "payloadHash",
      previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [h.tenant]);
    expect(() => verifyAuditChain(chain.rows)).not.toThrow();
  });
});
