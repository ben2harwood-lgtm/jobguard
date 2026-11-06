# 0653 — LATER-SAFETY-16 (RED)

The approved-not-exported alert read the raw latest extra event, so an approved
extra disappeared after a duplicate link was reversed even though export billed
it. The read now uses `contractor_approved_not_exported(uuid,uuid)`, which preserves its
existing latest-request, approved-outcome and not-exported filters and calls
`xa_latest_kind`, the same effective-state projection used by `cb_candidates`.
The private helper remains private. The new read entry point checks
`cb_authority(session,job,false)` and explicitly scopes rows to the current
tenant and authorized job; it performs no writes and uses a fixed search path.
No existing routine, signature, grant, table, column or stored fact changes.

The PostgreSQL regression is authored before the implementation: approve £3.38,
mark duplicate, unlink, read repeatedly, export, then verify removal. It also
checks active duplicates, withdrawn/rejected exclusions and direct read authority.
This sandbox cannot run PostgreSQL or browser suites. CI must prove fresh and
populated upgrade/catalog/grants/RLS checks, contractor billing integration suites
and ENT-11b unchanged. Independent RED review is required at the exact final head.

0653 follows the current main migration sequence (through 0652).
Main already includes the 0622 effective-state repair; no copy or replacement of
that routine is needed. No backfill.
Recovery is a reviewed forward migration; preserve immutable event/link history.

LATER / SIMPLICITY: contractor-billing-repository.ts read: put this approval
query behind the existing effective-state function through one narrow read
routine, so duplicate reversal semantics stay maintained in one place (implemented).

Landing catch-up, 6 November 2026: migration renumbered by stem from 0792 to
0653 against origin/main `b0ae55c4686861e61af7b6b2b759ecdcb425205e`.
The merge is complete with no unresolved paths. This branch adds only
`0653_relinked_extra_reconciliation.sql`; main has no equivalent routine or
migration. It creates one new routine and re-creates none, so no existing
routine body or upgrade-snapshot pin needs replacement. SQL bytes are unchanged.
The earlier independent pre-check and delta PASS remain historical evidence;
final-head RED review and green CI are still required before merge.

Local checks for this landing catch-up:
- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`: PASS.
- From `packages/db`, `./node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts`: 77/77 PASS.
- `node tools/plpgsql-case-in-if-lint.mjs`: 318 migrations PASS.
- `node tools/commercial-integrity-current-source-guard.mjs`: 94 protected roots,
  zero diagnostics; existing nine unresolved baselines unchanged.
- `git diff --check origin/main`: PASS.
- Lane lint run: the raw local CLI reports the three removed 0792 paths because
  it unions HEAD and unstaged paths. `inspectLane` passes with only those absent
  rename-source paths allowed in memory. Separately, the final existing diff
  against origin/main exactly matches the committed lane's five allowed paths
  plus its own lane file; migration-order validation passes for 0653 above 0652.
  The committed lane contains only the final paths and does not list itself.

READY for the router to commit, push and open the PR. CI must still prove the
whole-database suites, including migfix-6/7, plan-entitlement and other upgrade
snapshots, fresh migrations, LP-0/catalog/grants/RLS checks, contractor billing
integration (including the relink regression) and ENT-11b. PostgreSQL and browser
execution are unavailable here. No provider source, web route, existing routine
body, table, privilege baseline or commercial-integrity baseline was changed.
