# LATER-SAFETY-69 reconcile repair 1 (RED)

Replaces only app.guard_watchdog_upload_update; preserves its owner, ACL,
trigger, identity checks and live-job finalization checks. No data migration,
new grants, provider actions or fixture changes.

Verified uploads refuse every product-session UPDATE, including no-op and
metadata writes. The maintenance exception uses the existing
pg_has_role(session_user, 'jobguard_migration', 'USAGE') convention: inherited
migration logins and the administrator used by unchanged fixtures retain their
maintenance authority. current_user is deliberately insufficient; product
sessions remain refused inside migration-owned SECURITY DEFINER routines.
Product logins must never receive migration-role membership.

SV5PRE's checked invalidation path inserts evidence_invalidation rather than
rewriting evidence_upload. It remains available under its existing checks;
no new bypass or spoofable setting is needed. Locked-source invalidation
refusals and post-invoice invalidation behavior remain unchanged.

Real-PG regression: verified-upload-immutable.integration.test.ts covers runtime,
worker/infrastructure and shadow sessions through a test-only definer, whole-row
preservation after refusals, inherited maintenance writes and immutable identity.
Existing sv5pre-completion.integration.test.ts and
enterprise-live-prompt-repository.integration.test.ts remain unchanged and must
pass in CI. Database/browser execution is unavailable in the builder sandbox;
CI database/migration suites and independent RED review remain required.

Forward fix only: retain all uploaded evidence and invalidation history; repair
the guard additively if needed. Do not disable immutability or restore product
write authority to verified uploads.

Builder validation (9 November 2026): PASS installed TypeScript db check
(node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit),
regression-file TypeScript syntax, and Vitest discovery via the installed db
runner (list --filesOnly --maxWorkers=1; no tests executed). Lane CLI refused
its self-comparison because the task branch has no commit beyond its base;
loadLanePolicy/selectLane/lanePathAllowed/migrationOrderViolations passed on
all five uncommitted paths against HEAD using the existing linter exports.
Router must rerun the full lane CLI after committing. No git writes performed.
