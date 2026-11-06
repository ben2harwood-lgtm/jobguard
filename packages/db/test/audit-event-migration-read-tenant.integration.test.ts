import { describe, it } from "vitest";

// LATER-SAFETY-129 STOP: exportAuditCheckpoints() reads every tenant's audit
// history. audit-checkpoint-handoff.integration.test.ts's restrictedExport()
// runs it as jobguard_migration without app.tenant_id, under FORCE RLS.
// Move this cross-tenant reader to a dedicated non-owner verifier role first.
// Keep these as TODOs, as required by the brief; no policy changes in this piece.
describe("migration-role audit reads (LATER-SAFETY-129 landing hold)", () => {
  it.todo("with two tenants' audit rows present, jobguard_migration under tenant A sees only A's rows");
  it.todo("with two tenants' audit rows present, jobguard_migration with app.tenant_id unset sees no rows");
  it.todo("a test-only SECURITY DEFINER owned by jobguard_migration without a tenant filter, called by jobguard_runtime under tenant A, returns only A's rows");
});
