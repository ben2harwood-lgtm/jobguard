// CI-only PostgreSQL fixture. Ordinary source setup is inherited synthetic data;
// the tested case is freshly opened by the actual RecoveryCaseRepository command.
// This is not a shadow-30000 journey or an accepted worker receipt.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { createLockFixture, closeLockFixture } from "./recovery-attribution-fixture.js";
import { authenticatePracticeSession, practiceMaterialPool } from "../src/practice-session.js";
import { RecoveryCaseRepository } from "../src/recovery-case-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { verifyEvidencePackV3Case, loadEvidencePackV3Sources } from "../src/evidence-pack-v3-sources.js";

export async function createEvidencePackV3Fixture() {
  const f = await createLockFixture();
  try {
    const source = await seedEvidencePackFixture(f.admin, { practice: true });
    const auth = await authenticatePracticeSession(f.runtime, source.sessionToken);
    const scoped = practiceMaterialPool(f.runtime, auth.digest);
    const opened = await new RecoveryCaseRepository(scoped).command(auth.context, source.jobId, {
      version: "recovery-case-command.v1", action: "open", commandId: randomUUID(),
      caseType: "withheld_customer_payment", claimedNetPence: 32000,
      counterparty: "Fictional pack customer", book: "builder_customer", sourceType: "customer_invoice",
      sourceRefs: [source.invoiceId], expectedRevision: 0,
    }, { membershipId: auth.membershipId, identityUserId: auth.identityUserId });
    return { ...f, source, auth, caseId: opened.id };
  } catch (error) { await closeLockFixture(f); throw error; }
}
export const closeEvidencePackV3Fixture = closeLockFixture;
export type V3Fixture = Awaited<ReturnType<typeof createEvidencePackV3Fixture>>;
export function readOrdinary(f: V3Fixture, caseId = f.caseId) {
  return withTenant(f.runtime, f.auth.context, async tx => {
    await tx.$client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const binding = await verifyEvidencePackV3Case(tx, f.source.tenantId, caseId, f.auth.digest);
    return loadEvidencePackV3Sources(tx, binding);
  });
}
/** Actual client SQL/parameters, not normalized; nested SECURITY DEFINER SQL is not captured. */
export function recordingPool(pool: Pool, queries: Array<{ sql: string; values: unknown[] | undefined }>): Pool {
  return new Proxy(pool, { get(target, key) {
    if (key === "connect") return async () => {
      const client = await target.connect();
      return new Proxy(client, { get(connection, property) {
        if (property === "query") return (sql: string, values?: unknown[]) => {
          queries.push({ sql, values }); return connection.query(sql, values);
        };
        const value = Reflect.get(connection, property);
        return typeof value === "function" ? value.bind(connection) : value;
      } });
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
