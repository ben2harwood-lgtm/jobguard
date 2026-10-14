import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { PrivateVersionedStorage } from "@jobguard/storage";
import { describe, expect, it, vi } from "vitest";
import { ProofCommandService } from "../src/proof-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

// Application orchestration evidence only. PostgreSQL snapshots, privileges and
// actual lock contention are covered separately in proof-invalidation.integration.test.ts.
vi.mock("../src/watchdog.js", () => ({
  requireLiveJob: vi.fn(), readCommandIdentity: vi.fn(), claimCommandIdentity: vi.fn(),
  requestHashFor: () => "a".repeat(64),
}));
vi.mock("../src/audit.js", () => ({
  appendAuditBatch: async (db: { $client: { query: Function } }, events: unknown[]) => db.$client.query("TEST AUDIT", events),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const tenant = randomUUID(), evidence = randomUUID(), job = randomUUID(), scope = randomUUID(), actor = randomUUID();
  const bytes = Buffer.from("synthetic proof"), sha256 = createHash("sha256").update(bytes).digest("hex");
  const context = testTenantContext(tenant), eligibleRead = deferred(), resumeCompletion = deferred(), invalidating = deferred();
  const audits: any[] = [], invalidations: string[] = [], reviews: string[] = [], completions: string[] = [];
  let pauseCompletion = false, uploadOwner: number | undefined, unlock = deferred(), nextClient = 0;
  const pool = { connect: async () => {
    const clientId = ++nextClient;
    let completing = false;
    const lockUpload = async () => {
      while (uploadOwner !== undefined && uploadOwner !== clientId) await unlock.promise;
      if (uploadOwner === undefined) { uploadOwner = clientId; unlock = deferred(); }
    };
    return { release() {}, query: async (sql: string, values: any[] = []) => {
      const result = (rows: any[] = [], rowCount = rows.length) => ({ rows, rowCount });
      if (sql === "COMMIT" || sql === "ROLLBACK") {
        if (uploadOwner === clientId) { uploadOwner = undefined; unlock.resolve(); }
        return result();
      }
      if (sql === "BEGIN" || sql.includes("set_config") || sql.includes("pg_advisory") || sql.startsWith("UPDATE app.command_receipt")) return result();
      if (sql.includes("FROM app.membership")) return result([{}]);
      // This fixture is a live job without a final-account lock; merged lifecycle
      // guards run normally, before the proof race being exercised.
      if (sql.startsWith("SELECT j.id job_id,b.customer_id,b.site_id FROM app.job j") && sql.includes("JOIN app.final_account_lock")) return result();
      if (sql.includes("FROM app.command_receipt")) return result();
      if (sql.startsWith("INSERT INTO app.command_receipt")) { completing = true; return result([{ command_id: values[0] }]); }
      if (sql.includes("FROM app.evidence_object") && sql.includes("e.kind='original'")) {
        // A READ COMMITTED statement takes its snapshot BEFORE a row-lock wait.
        // A separate lock statement must finish before the eligibility statement starts.
        const eligible = invalidations.length === 0;
        if (sql.includes("FOR UPDATE OF u")) await lockUpload();
        if (pauseCompletion && sql.includes("FOR UPDATE OF u")) {
          eligibleRead.resolve(); await resumeCompletion.promise;
        }
        return result(eligible ? [{ id: evidence, sha256, object_key: "synthetic", object_version_id: "v1" }] : []);
      }
      if (sql.includes("FOR UPDATE OF u")) { if (!completing) invalidating.resolve(); await lockUpload(); return result([{ id: evidence }]); }
      if (sql.startsWith("INSERT INTO app.evidence_invalidation")) {
        invalidating.resolve();
        if (invalidations.length) return result();
        invalidations.push(values[0]); return result([{ id: values[0] }]);
      }
      if (sql.startsWith("INSERT INTO app.stage_review_event")) { if (completions.length) reviews.push(values[1]); return result(); }
      if (sql.includes("FROM app.evidence_object") && sql.includes("JOIN app.job")) return result([{ job_id: job, scope_item_id: scope, evidence_type: "photo", revision: 0 }]);
      if (sql.startsWith("INSERT INTO app.decision") || sql.startsWith("INSERT INTO app.job_finding") || sql.startsWith("INSERT INTO app.evidence_link")) return result();
      if (sql.includes("FROM app.evidence_link")) return result([{ id: randomUUID() }]);
      if (sql.startsWith("INSERT INTO app.stage_completion")) { completions.push(values[0]); return result(); }
      if (sql.includes("FROM app.scope_progress")) return result([{ revision: 0, stage: "in_progress" }]);
      if (sql.includes("transition_scope_progress")) return result();
      if (sql === "TEST AUDIT") { audits.push(...values); return result(); }
      throw new Error(`Unexpected SQL in proof application double: ${sql}`);
    } };
  } } as unknown as Pool;
  const storage = { readExactVersion: async () => ({ key: "synthetic", versionId: "v1", bytes, byteLength: bytes.length, contentType: "image/png" }) } as unknown as PrivateVersionedStorage;
  const service = new ProofCommandService(pool, storage);
  const completion = { version: "proof.complete.v1", commandId: randomUUID(), actorMembershipId: actor, jobId: job, scopeItemId: scope, stage: "electrical-stage", evidenceId: evidence, requiredEvidenceType: "photo", decisionId: null };
  const invalidation = { version: "proof.invalidate.v1", commandId: randomUUID(), actorMembershipId: actor, evidenceId: evidence, reasonCode: "verification_invalid" };
  return { service, context, completion, invalidation, audits, invalidations, reviews, completions, eligibleRead, resumeCompletion, invalidating, pause: () => { pauseCompletion = true; } };
}

describe("proof invalidation application regressions", () => {
  it("completion cannot clear a concurrent evidence invalidation", async () => {
    const h = harness(); h.pause();
    const completing = h.service.complete(h.context, h.completion);
    await h.eligibleRead.promise;
    const invalidating = h.service.invalidate(h.context, h.invalidation);
    try { await h.invalidating.promise; } finally { h.resumeCompletion.resolve(); }
    await Promise.all([completing, invalidating]);
    expect(h.completions).toHaveLength(1);
    expect(h.invalidations).toHaveLength(1);
    expect(h.reviews).toEqual(h.invalidations);
  });

  it("invalidation retries preserve audit references without a second business event", async () => {
    const h = harness();
    const first = await h.service.invalidate(h.context, h.invalidation);
    expect(await h.service.invalidate(h.context, h.invalidation)).toEqual(first);
    expect(await h.service.invalidate(h.context, { ...h.invalidation, commandId: randomUUID() })).toEqual(first);
    expect(h.invalidations).toHaveLength(1);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0].payload.references.invalidationId).toBe(h.invalidations[0]);
  });
});
