import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { createFinalAccountLockSnapshot, FINAL_ACCOUNT_DECLARATION } from "@jobguard/core";
import { FinalAccountLockApplication } from "../../../apps/api/src/final-account-lock.application.js";
import { DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID, practiceOwnedJobsSql } from "../src/index.js";

afterEach(() => vi.unstubAllEnvs());

/** Scripted SQL adapter: exercises the real application, repository and rollback boundary.
 * Real source-set SQL and locking are covered separately by the PostgreSQL regression. */
function fixture() {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const jobId = randomUUID(), revisionId = randomUUID(), commandId = randomUUID(), scopeItemId = randomUUID();
  const snapshot = createFinalAccountLockSnapshot({
    version: "shadow-lock.v1", tenantId: DEMO_TENANT_ID, jobId, finalAccountRevisionId: revisionId,
    baselineQuoteVersionId: randomUUID(), captureRegister: [],
    lines: [{ id: randomUUID(), scopeItemId, revisionId: randomUUID(), netPence: 3360000, sourceRef: "synthetic:baseline" }],
    scopeDispositions: [{ scopeItemId, disposition: "done", sourceRef: "synthetic:disposition" }],
    baselineScopeItemIds: [scopeItemId], declaration: FINAL_ACCOUNT_DECLARATION,
    declarationVersion: "final_account_declaration.v1", onboardingTermsVersion: "synthetic_final_check_terms.v1",
    lockingMembershipId: DEMO_MEMBERSHIP_ID, serverTimestamp: "2026-10-13T12:00:00.000001Z", commandId, auditEventId: randomUUID(),
  });
  const state = { stale: false, committedLock: false, stagedLock: false, replay: false };
  const statements: string[] = [];
  const query = vi.fn(async (sql: string) => {
    statements.push(sql);
    if (sql.includes("authenticate_practice_session")) return { rows: [{ tenant_id: DEMO_TENANT_ID, membership_id: DEMO_MEMBERSHIP_ID, identity_user_id: DEMO_IDENTITY_USER_ID }] };
    if (sql.startsWith(practiceOwnedJobsSql())) return { rows: [{ id: jobId }] };
    if (sql.includes("app.lock_final_account(")) {
      state.replay = state.committedLock;
      state.stagedLock = true;
      return { rows: [{ id: commandId, tenant_id: DEMO_TENANT_ID, job_id: jobId,
        final_account_revision_id: revisionId, baseline_quote_version_id: snapshot.snapshot.baselineQuoteVersionId,
        capture_register_hash: snapshot.captureRegisterHash, line_set_hash: snapshot.lineSetHash,
        scope_disposition_hash: snapshot.scopeDispositionHash, snapshot_digest: snapshot.digest,
        snapshot: snapshot.snapshot, locked_source_hash: "a".repeat(64), locked_at_text: snapshot.snapshot.serverTimestamp,
        command_id: commandId, audit_event_id: snapshot.snapshot.auditEventId }] };
    }
    if (sql.includes("created_in_transaction")) return { rows: [{ created_in_transaction: !state.replay }] };
    if (sql.includes("approved_sources")) return { rows: [{ stale: state.stale }] };
    if (sql === "COMMIT" && state.stagedLock) { state.committedLock = true; state.stagedLock = false; }
    if (sql === "ROLLBACK") state.stagedLock = false;
    return { rows: [] };
  });
  const pool = { query, connect: async () => ({ query, release: () => undefined }) } as unknown as Pool;
  return { app: new FinalAccountLockApplication(pool, randomUUID()), jobId, state, statements,
    command: { version: "final-account.lock.v1", commandId, finalAccountRevisionId: revisionId,
      expectedRevision: 1, declarationVersion: "final_account_declaration.v1" } };
}

it("lock rejects an account assembled before a captured variation was approved", async () => {
  const f = fixture();
  // Revision 1 predates an approved 40,000p capture: the head still says revision 1.
  f.state.stale = true;
  await expect(f.app.lock(f.jobId, f.command)).rejects.toMatchObject({ code: "STALE_REVISION" });
  expect(f.state.committedLock).toBe(false);
  expect(f.state.stagedLock).toBe(false);
  expect(f.statements.at(-1)).toBe("ROLLBACK");
});

it("an unchanged approved source set commits and a historical replay skips current-source validation", async () => {
  const f = fixture(), first = await f.app.lock(f.jobId, f.command);
  expect(f.state.committedLock).toBe(true);
  const before = f.statements.filter(sql => sql.includes("approved_sources")).length;
  expect(before).toBe(1);
  f.state.stale = true; // A later approval must not invalidate the original immutable result.
  expect(await f.app.lock(f.jobId, f.command)).toEqual(first);
  expect(f.statements.filter(sql => sql.includes("approved_sources"))).toHaveLength(before);
});
