# 0792 — LATER-SAFETY-16 (RED)

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

0792 remains reserved above the current main migration sequence (through 0640).
Main already includes the 0622 effective-state repair; no copy or replacement of
that routine is needed. No backfill.
Recovery is a reviewed forward migration; preserve immutable event/link history.

LATER / SIMPLICITY: contractor-billing-repository.ts read: put this approval
query behind the existing effective-state function through one narrow read
routine, so duplicate reversal semantics stay maintained in one place (implemented).

Landing catch-up, 6 November 2026: READY against origin/main
`9d4677cbd66051cf6e7f2abdea8823593050e72b`. The launcher's merge was
already committed with no unresolved paths. Diff inspection confirms the only
production change is the intended reconciliation read plus its new routine;
main's existing routine bodies and tests are retained. The lane lists all five
changed paths outside `config/lanes/` and does not list itself.

Local deterministic checks passed:
- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=1 test/migration-proof-loader.test.ts` (77 tests).
- `node tools/plpgsql-case-in-if-lint.mjs` (306 migrations).
- `node tools/migration-renumber.mjs` (no renumber required).
- Exact lane-versus-diff comparison and `git diff --check origin/main`.

The pnpm wrapper did not start either check promptly and was stopped; the
installed package binaries above completed successfully without downloading.
PostgreSQL, browser suites, full CI and independent exact-head RED review remain
for the router's PR flow; none is claimed as executed here.
