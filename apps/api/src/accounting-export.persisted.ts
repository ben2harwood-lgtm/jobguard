import type { Pool } from "pg";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { AccountingExportRepository, storedAccountingExportV1, type StoredAccountingExport, type VerifiedTenantContext } from "@jobguard/db";
import { AccountingExportError, accountingScopeV1, accountingTargetV1 } from "./accounting-export.contracts.js";
import { FakeAccountingTransport } from "./accounting-export.fake.js";

const inboxMatchesV1 = z.array(z.object({
 id: z.string().regex(/^demo-[a-z0-9-]{1,80}$/), tenantId: z.string().regex(/^demo-[a-z0-9-]{1,80}$/),
 reference: z.string().regex(/^[a-f0-9]{64}$/), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
 paid: z.boolean(), payload: accountingTargetV1,
}).strict()).max(100);

/** Trusted fixture administration only; never construct with business-runtime credentials. */
export class FakeAccountingExportInbox {
 constructor(private readonly pool: Pool, readonly adapter: FakeAccountingTransport) {}
 async observe(context: VerifiedTenantContext, raw: StoredAccountingExport): Promise<void> {
  const entry = storedAccountingExportV1.parse(raw);
  const scope = accountingScopeV1.parse(entry.artifact.scope);
  if (!entry.attemptId || entry.artifact.route !== this.adapter.route || scope.tenantId !== `demo-${context.tenantId}`)
   throw new AccountingExportError("reference_conflict");
  // A failed lookup appends nothing: lack of observation never means absence.
  const matches = inboxMatchesV1.parse(this.adapter.find(entry.reference, scope));
  const result = await this.pool.query(`INSERT INTO app.accounting_export_inbox(tenant_id,id,attempt_id,matches)
   SELECT a.tenant_id,$2,a.id,$4::jsonb FROM app.accounting_export_attempt a
   JOIN app.accounting_export_ledger l ON l.tenant_id=a.tenant_id AND l.source_id=a.source_id
   WHERE current_database()='jobguard_synthetic_demo' AND a.tenant_id=$1 AND a.id=$3
    AND a.source_id=$5 AND l.reference=$6 AND l.artifact=$7::jsonb`,
   [context.tenantId, randomUUID(), entry.attemptId, JSON.stringify(matches), entry.sourceId,
    entry.reference, JSON.stringify(entry.artifact)]);
  if (result.rowCount !== 1) throw new Error("EXPORT_OBSERVATION_REQUIRED");
 }
}

/** Explicit fake-only executor. Its claim commits before the fake transport runs. */
export async function pushStoredAccountingExport(repository: AccountingExportRepository,
 context: VerifiedTenantContext, digest: string, sourceId: string, inbox: FakeAccountingExportInbox) {
 const adapter = inbox.adapter;
 const entry = storedAccountingExportV1.parse(await repository.execute(context, digest, "read", sourceId));
 const scope = accountingScopeV1.parse(entry.artifact.scope);
 const target = accountingTargetV1.parse(entry.artifact.target);
 if (entry.artifact.route !== adapter.route) throw new AccountingExportError("reference_conflict");
 if (entry.status === "pushed") return entry;
 // Reconcile old/uncertain attempts; never claim and create in the same retry.
 if (entry.status !== "pending") {
  await inbox.observe(context, entry);
  return repository.execute(context, digest, "reconcile", sourceId, {
   version: 1, attemptId: entry.attemptId,
  });
 }
 const claimed = storedAccountingExportV1.parse(await repository.execute(context, digest, "claim", sourceId,
  { version: 1, attemptId: randomUUID() }));
 const matches = adapter.find(entry.reference, scope);
 if (matches.length) {
  await inbox.observe(context, claimed);
  return repository.execute(context, digest, "reconcile", sourceId,
   { version: 1, attemptId: claimed.attemptId });
 }
 try {
  // Database canonical hashing binds the stored artifact and its Decision.
  adapter.push(entry.reference, claimed.previewHash, target, scope);
 } catch {
  // A provider exception never proves absence; the durable unknown state survives restart.
  return claimed;
 }
 await inbox.observe(context, claimed);
 return repository.execute(context, digest, "reconcile", sourceId,
  { version: 1, attemptId: claimed.attemptId });
}
