# SV5PRE builder receipt r14 (CI repair, 14 Oct 2026)

Builder: Sonnet. Not reviewed or accepted by this builder. Coordinator ruling 14 Oct 23:20.

## (a) LP-0 inventory (commit d47126ff), additive only
File docs/contracts/lp-0-effective-privileges-v1.json. No existing entry changed or removed (diff is 58 insertions, 0 deletions).
- entries: 5 owner keys (final_check_manifest, final_check_manifest_source, shadow_final_check_reveal_proof, shadow_final_check_run_binding, shadow_final_check_source_attempt -> jobguard_migration) and 9 jobguard_shadow table grants on those same tables.
- recorded.routines: the 12 new 0147 routines (read from the migrated catalogue by the test's own reader).
- recorded.rls 5, recorded.policies 11, recorded.triggers 14 (final_check / shadow_final_check objects only).
Lane list: added this JSON path and this receipt path (Edit tool).

## (b) POST_LOCK_WORK_REQUIRES_LINKED_JOB set-up (one commit per file)
Cause: prepareInvoicePrerequisites now creates the final-account lock, then the fixture inserted site evidence on the locked job, which migration 0144 refuses. A job link cannot help (the guard only checks for a lock on the same job), so the set-up is ordered instead: the 3 lines below move to AFTER the evidence loop. No call or assertion text changed.

Lines moved (before: directly before `const evidenceIds`; after: directly before `const cases = new RecoveryCaseRepository`):
    await prepareInvoicePrerequisites(admin, runtime, DEMO_TENANT_ID, jobId, actor.membershipId, revisionId);
    const invoice = await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: actor.membershipId,
      commandId: randomUUID(), recipient: "allocation@example.invalid", issuedOn: "2026-10-12" });
- packages/db/test/recovery-allocation.integration.test.ts (commit 225a31bf): original :101-103 -> after the evidence loop. 17/17 pass.
- packages/db/test/recovery-allocation-races.integration.test.ts (f6f89074): :99-101 moved likewise.
- packages/db/test/recovery-line-allocation.integration.test.ts (a0aa686b): :111-113 moved likewise.

## Still failing locally (not changed, reported)
Helpers insert NEW evidence on the already-locked job mid-test (races legacyLanding ~:298; line-allocation remittance ~:254): 6 tests. Needs a coordinator ruling.
