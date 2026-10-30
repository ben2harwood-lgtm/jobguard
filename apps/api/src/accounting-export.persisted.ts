import { randomUUID } from "node:crypto";
import { AccountingExportRepository, storedAccountingExportV1, type VerifiedTenantContext } from "@jobguard/db";
import { AccountingExportError, accountingScopeV1, accountingTargetV1 } from "./accounting-export.contracts.js";
import { FakeAccountingTransport } from "./accounting-export.fake.js";

/** Explicit fake-only executor. Its claim commits before the fake transport runs. */
export async function pushStoredAccountingExport(repository: AccountingExportRepository,
 context: VerifiedTenantContext, digest: string, sourceId: string, adapter: FakeAccountingTransport) {
 const entry = storedAccountingExportV1.parse(await repository.execute(context, digest, "read", sourceId));
 const scope = accountingScopeV1.parse(entry.artifact.scope);
 const target = accountingTargetV1.parse(entry.artifact.target);
 if (entry.artifact.route !== adapter.route) throw new AccountingExportError("reference_conflict");
 if (entry.status === "pushed") return entry;
 // Reconcile old/uncertain attempts; never claim and create in the same retry.
 if (entry.status !== "pending") {
  return repository.execute(context, digest, "reconcile", sourceId, {
   version: 1, attemptId: entry.attemptId, matches: adapter.find(entry.reference, scope),
  });
 }
 const claimed = storedAccountingExportV1.parse(await repository.execute(context, digest, "claim", sourceId,
  { version: 1, attemptId: randomUUID() }));
 const matches = adapter.find(entry.reference, scope);
 if (matches.length) return repository.execute(context, digest, "reconcile", sourceId,
  { version: 1, attemptId: claimed.attemptId, matches });
 try {
  // Database canonical hashing binds the stored artifact and its Decision.
  adapter.push(entry.reference, claimed.previewHash, target, scope);
 } catch {
  // A provider exception never proves absence; the durable unknown state survives restart.
  return claimed;
 }
 return repository.execute(context, digest, "reconcile", sourceId,
  { version: 1, attemptId: claimed.attemptId, matches: adapter.find(entry.reference, scope) });
}
