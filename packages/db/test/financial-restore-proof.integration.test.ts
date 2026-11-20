import { randomUUID } from "node:crypto";
import type EmbeddedPostgres from "embedded-postgres";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import * as database from "../src/index.js";
import { SimulationFeeCollectionRepository } from "../src/simulation-fee-collection-repository.js";
import { SimulationFeeStatementRepository } from "../src/simulation-fee-statement-repository.js";
import { SimulationMoneyRunRepository } from "../src/simulation-money-run-repository.js";
import { runSyntheticRestoreRehearsal } from "../tools/synthetic-restore.mjs";
import { finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { recoveryFeeFixture } from "./success-fee-recovery-fixture.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { snapshotRows } from "./upgrade-proof-utils.js";

type RestorePhase = {
  admin: Pool;
  postgres: EmbeddedPostgres;
  directory: string;
  pool(user?: string, database?: string): Pool;
};
const databaseName = "jobguard_synthetic_demo";
const version = "simulation-money-command.v1";
const settleVersion = "simulation-fee-demo-settle-command.v1";
const command = () => ({ version, action: "run", commandId: randomUUID() });

// Reuse the full-row upgrade snapshot, including invoice bytes and proof versions.
// Source/report hashes separately bind the exact financial snapshot encoding.
async function history(admin: Pool) {
  const tables = (await admin.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='app' ORDER BY tablename",
  )).rows;
  return snapshotRows(admin, tables.map(({ tablename }) => `app.${tablename}`));
}

it("cold-restores the command-built fee chain through reversal/refund, reconciles, refuses replay and detects restored tamper", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  let x: Awaited<ReturnType<typeof recoveryFeeFixture>>;
  let before: Awaited<ReturnType<typeof history>>;
  let source: Awaited<ReturnType<SimulationMoneyRunRepository["command"]>>;
  let sourceView: Awaited<ReturnType<SimulationFeeCollectionRepository["view"]>>;
  let replayCollection: unknown, replayRefund: unknown, paidId: string, refundId: string;
  let verified = false;
  const savedRun = command();
  const fixture = (phase: RestorePhase): FinalCheckFixture => ({
    postgres: phase.postgres, directory: phase.directory, logs: [],
    admin: phase.pool("postgres", databaseName),
    runtime: phase.pool("rehearsal_runtime", databaseName),
    shadow: phase.pool("restore_money_shadow", databaseName),
  });
  try {
    const receipt = await runSyntheticRestoreRehearsal({ environment: "synthetic_demo" }, database, {
      async beforeBackup(phase: RestorePhase) {
        await phase.admin.query(`CREATE DATABASE ${databaseName}`);
        const createLogin = (await phase.admin.query("SELECT format('CREATE ROLE restore_money_shadow LOGIN PASSWORD %L', $1::text) sql", [phase.admin.options.password])).rows[0].sql;
        await phase.admin.query(createLogin);
        await phase.admin.query("GRANT jobguard_shadow TO restore_money_shadow");
        const f = fixture(phase);
        await database.migrate(f.admin);
        await installLegacySyntheticPartyFixtures(f.admin);
        x = await recoveryFeeFixture(f);
        const statements = new SimulationFeeStatementRepository(f.runtime);
        const collection = new SimulationFeeCollectionRepository(f.runtime);
        const issue = () => statements.command(x.context, x.jobId, x.auth.digest, {
          version: "simulation-fee-statement-command.v1", action: "issue", commandId: randomUUID(),
        });
        await x.allocate(0); await x.approve(await x.review());
        await x.allocate(1); await x.approve(await x.review(1));
        const original = await issue();
        replayCollection = { version: "simulation-fee-collection-command.v1", action: "collect", commandId: randomUUID(),
          statementId: original.statementId, statementHash: original.documentHash, amountPence: 28200 };
        paidId = (await collection.command(x.context, x.jobId, x.auth.digest, replayCollection)).attemptId;
        expect(await collection.view(x.context, x.jobId, x.auth.digest)).toMatchObject({ collectionReserved: 28200, settledPrincipal: 0 });
        await collection.demoSettle(x.context, x.jobId, x.auth.digest, { version: settleVersion, commandId: randomUUID(), attemptId: paidId });
        await x.reverse(1);
        await x.approve(await x.review(2));
        const correction = await issue();
        replayRefund = { version: "simulation-fee-collection-command.v1", action: "refund", commandId: randomUUID(),
          statementId: correction.statementId, statementHash: correction.documentHash, amountPence: 25000 };
        refundId = (await collection.command(x.context, x.jobId, x.auth.digest, replayRefund)).attemptId;
        expect(await collection.view(x.context, x.jobId, x.auth.digest)).toMatchObject({ refundReserved: 25000, refundedPrincipal: 0 });
        await collection.demoSettle(x.context, x.jobId, x.auth.digest, { version: settleVersion, commandId: randomUUID(), attemptId: refundId });
        sourceView = await collection.view(x.context, x.jobId, x.auth.digest);
        expect(sourceView).toMatchObject({ settledPrincipal: 28200, refundedPrincipal: 25000, retainedPrincipal: 3200, collectionReserved: 0, refundDue: 0 });
        source = await new SimulationMoneyRunRepository(f.runtime).command(x.context, x.jobId, x.auth.digest, savedRun);
        expect(source.report.unresolvedDifferenceCount).toBe(0);
        expect(source.snapshot.recovery_case_allocation).toHaveLength(2);
        expect(source.snapshot.recovery_case_allocation_reversal).toHaveLength(1);
        for (const key of ["customer_invoice", "success_fee_journal", "success_fee_journal_line", "success_fee_derivation", "platform_fee_attempt", "platform_fee_attempt_event"] as const) {
          expect(source.snapshot[key].length, key).toBeGreaterThan(0);
        }
        before = await history(f.admin);
        expect(before["app.evidence_object"]).toEqual(expect.arrayContaining([expect.objectContaining({ id: x.evidence })]));
        expect((await f.admin.query("SELECT outbound_control.claims_enabled() enabled")).rows[0].enabled).toBe(true);
      },
      async afterRestore(phase: RestorePhase) {
        // Only admin/operator connections reach the restored financial database
        // until it is paused. No migration or source writer runs on restoration.
        const admin = phase.pool("postgres", databaseName);
        const revision = (await admin.query("SELECT revision FROM outbound_control.state")).rows[0].revision;
        await admin.query("SELECT outbound_control.command($1,'pause',$2,NULL)", [randomUUID(), revision]);
        expect((await admin.query("SELECT outbound_control.claims_enabled() enabled")).rows[0].enabled).toBe(false);
        const f = fixture(phase);
        expect(await history(f.admin)).toEqual(before);
        const collection = new SimulationFeeCollectionRepository(f.runtime);
        const runs = new SimulationMoneyRunRepository(f.runtime);
        expect(await collection.view(x.context, x.jobId, x.auth.digest)).toEqual(sourceView);
        expect(await runs.command(x.context, x.jobId, x.auth.digest, savedRun)).toEqual(source);
        expect((await collection.command(x.context, x.jobId, x.auth.digest, replayCollection)).attemptId).toBe(paidId);
        expect((await collection.command(x.context, x.jobId, x.auth.digest, replayRefund)).attemptId).toBe(refundId);
        await expect(collection.command(x.context, x.jobId, x.auth.digest, {
          ...(replayCollection as Record<string, unknown>), amountPence: 28201,
        })).rejects.toThrow("SUCCESS_FEE_IDEMPOTENCY_CONFLICT");
        for (const prior of [replayCollection, replayRefund]) {
          // Fresh IDs cannot reserve another collection or exceed the refund
          // budget after the exact authorized amounts have already settled.
          await expect(collection.command(x.context, x.jobId, x.auth.digest, {
            ...(prior as Record<string, unknown>), commandId: randomUUID(),
          })).rejects.toThrow("SUCCESS_FEE_STALE");
        }
        for (const attemptId of [paidId, refundId]) {
          await expect(collection.demoSettle(x.context, x.jobId, x.auth.digest, { version: settleVersion, commandId: randomUUID(), attemptId })).rejects.toThrow("SUCCESS_FEE_STALE");
        }
        await expect(runs.command(testTenantContext(randomUUID()), x.jobId, x.auth.digest, savedRun)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
        expect(await history(f.admin)).toEqual(before);
        const rebuilt = await runs.command(x.context, x.jobId, x.auth.digest, command());
        expect(rebuilt.snapshot).toEqual(source.snapshot);
        expect(rebuilt.sourceHash).toBe(source.sourceHash);
        expect(rebuilt.report).toEqual(source.report);
        // Privileged corruption is deliberately limited to this disposable copy.
        // Runtime cannot do this; bypass the immutable trigger to test detection.
        const journalId = String(source.snapshot.success_fee_journal[0]!.id);
        await finalCheckTenant(f.admin, x.context.tenantId, async db => {
          await db.query("SET LOCAL session_replication_role=replica");
          const changed = await db.query("UPDATE app.success_fee_journal_line SET amount_pence=amount_pence+1 WHERE tenant_id=$1 AND journal_id=$2 AND side='debit'", [x.context.tenantId, journalId]);
          expect(changed.rowCount).toBe(1);
        });
        const tampered = await runs.command(x.context, x.jobId, x.auth.digest, command());
        expect(tampered.sourceHash).not.toBe(source.sourceHash);
        expect(tampered.report.differences).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNBALANCED_JOURNAL", sourceRefs: [journalId] })]));
        await expect(runs.command(x.context, x.jobId, x.auth.digest, { version, action: "restore", commandId: randomUUID(), runId: source.runId, sourceHash: source.sourceHash })).rejects.toThrow("SUCCESS_FEE_SOURCE_CHANGED");
        expect((await admin.query("SELECT outbound_control.claims_enabled() enabled")).rows[0].enabled).toBe(false);
        verified = true;
      },
    });
    // The same cold-copy rehearsal also attacks the actual outbox executor:
    // zero attempts while paused; after reconciliation/resume only the pending
    // fake sends once, succeeded is not resent, unknown remains held.
    expect(verified).toBe(true);
    expect(receipt.result).toBe("PASS");
    expect(receipt.outboundControl).toMatchObject({ restoredPausedBeforeRuntime: true, attemptsWhilePaused: 0, finalPaused: true });
    expect(receipt.fakeDeliveryCallsAfterRestore).toBe(1);
    expect(receipt.liveProviderCalls).toBe(0);
  } finally { vi.unstubAllEnvs(); }
}, 240_000);

it.todo("NOT COVERED: production fee collection/refund dispatcher replay across restore; no live rail or dispatcher is installed");
it.todo("NOT COVERED: deployed backup/object-store restore and independent money-surface security review");
