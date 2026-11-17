# LATER-B14 — current Decision state and check identity

Issued RED / decision 74: BUILD, CHECK, PARK. Uncommitted implementation; no acceptance, merge, enablement or deployment.

Base inspected: local `origin/main` and HEAD `7ff452eeec1c523345d34715adfa3f8310062013`, newer than the issued `ca435eeb5791638c787c830d6ba717146f694539` and draft `0bbb5ddb`. Current main wins. Plan C5:117, M1-8:386 and Appendix A:3849 retain the cited contracts.

- L063: persisted verified, version-specific proof and invalidation govern the current requirement. Synthetic rule recipe retained.
- L064: current subject revision and eligible scope govern projection; immutable findings/resolutions remain readable.
- L065: payload-bound check receipt, exact first-response replay and identifier-only audit commit together through the checked synthetic routine.
- L071: content/classification-sensitive finding identity prevents old advisory suppression or dismissal attaching to a new mandatory finding.

Migration: `0193_later_decision_identity.sql`; notes under `packages/db/migration-notes/`. No runner/inventory edits, tables, columns or new runtime table-write grants. Sole new grant: EXECUTE on the checked routine. Separate watchdog identity registry and SERIOUS-B8 relevance repository remain untouched.

Executed: 3 core and 4 API unit tests passed; forced typecheck, package lint and build each ran 7 tasks, zero cache hits, exit 0. `git diff --check` passed. Database/upgrade and browser suites NOT RUN by the dispatch restriction. OpenAPI attempt failed at tsx IPC `listen EPERM`; no alternate attempt. Root tools lint and lane checks fail at the unchanged self-comparison guard; lane registration is absent.

Coordinator dependency: `config/lanes/later-b14.json:1` is absent. Register the issued lane and compare a dispatcher-created commit against its parent/base; do not weaken `tools/agent-lane-boundary-lint.mjs:303`. RED independent verdicts, separate acceptance and Ben's button remain outstanding. The builder has not reviewed or accepted its own work.

Discovered later: no UI changes; no general rule-configuration expansion. A rollout must pause evaluation if reverting to the earlier application, which ignores command IDs. Current proof queries consume finalized database facts; storage-byte re-verification remains the existing proof boundary's responsibility.
