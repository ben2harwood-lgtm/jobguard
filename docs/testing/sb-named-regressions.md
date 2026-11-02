# Named small-builder adversarial regressions

Piece `sb-rows-named`, BUILD_PLAN Appendix A §10.6. Base: `origin/main`
`48843eebdd0086fa1af11b789cf9eda20d54f018` (also this worktree's starting HEAD).
The local `main` ref is stale; ownership was checked against the merged first-parent
history of `origin/main`, without fetching or changing refs.

Nineteen added tests use the exact `SB-NN: <row title>` names and pair an adversarial
input or forbidden effect with a permitted control. They reuse existing synthetic
fixtures. No production code, migration, policy or earlier test was changed.

| Rows | Merged owner evidence at the base | Named regression location |
|---|---|---|
| 01, 03 | SV-2 #119 | DB shadow catalog / persistence |
| 02, 04, 08, 09, 10 | SV-1 #111, SV-3 #162/#178; SV-4 #152, CH-8 #408, MON-1 #388, SV-5 #404/#427, SV-6 #400 | Core shadow suites; DB query-log isolation |
| 05, 06, 07 | SV-2 #119, SV-4 #152, SV-5 #404/#427 | DB Final Check manifest / disposition |
| 14, 15 | CH-7 #138/#164/#345 | DB pursuit terms; core eligibility |
| 17, 18, 19 | MON-1 #363/#376/#388/#425, CH-4 #347, CH-5 #386 | DB meter persistence; core meter counting / subscription period |
| 20, 22 | MON-2A #286/#385/#419 | Core subscription allocation / contracts |
| 21 | MON-3 #242/#418 | Core free-first-job keys |
| 26 | SV-2 #119, M4-8-S #346/#383, MON-2A #419; SV-6 #400 | DB shadow persistence |

These are named regression entry points alongside the existing owner suites, not
new claims of full end-to-end acceptance. SB-02 checks builder application bytes
and SQL statement sequences, not a wall-clock timing bound. SB-09 checks three-source
coalescing; the existing allocation/attribution suites retain the downstream fee proofs.
SB-18 combines lifecycle and capacity boundaries; existing import/admission journeys
retain the source-command integration proofs. SB-26 executes foreign-tenant and
wrong-job classification FK refusals plus a valid insert, and checks validated,
tenant-qualified installed FKs across locks, allocations, attributions and periods;
the existing owner suites retain their other actual-write FK probes.

## Pending and outside this issued scope

- **SB-16 pending:** MON-2A is merged, but M4-17-S is not in the base's merged
  history. Do not pre-test its reconciliation/journal behavior.
- **SB-13, SB-23 pending:** M4-12-S is unmerged (M4-9-S and MON-4A foundations
  alone do not prove collection/refund behavior).
- **SB-24 pending:** only MON-5 preparation #317 is merged; the portal piece is pending.
- **SB-25 pending:** MON-6 is pending.
- **SB-27 pending:** M4-7-S / SV-8 production/pilot receipt behavior is pending.
- **SB-11, SB-12:** M4-8-S foundations are now merged, but these rows are outside
  the explicitly issued row set for this piece. Existing owner tests are unchanged.

## Local validation and handoff

The installed Vitest 4.1.12 binary ran the nine affected core files in batches of
at most three files, with `--maxWorkers=2`: **80 tests passed**. Core typechecking and typechecking the
seven changed DB test files passed. DB Vitest collection passed without executing
hooks; PostgreSQL execution is deferred to CI because the sandbox cannot start it.
The temporary test-type configuration is `/tmp/sb-rows-named-test-types.json`.
The existing dependency builds were generated locally to resolve package exports
for collection. No dependencies were downloaded. Full root checks, PostgreSQL and
browser execution, and the exact-head independent Claude RED review remain CI/router
work. This branch is built ahead; the router commits, pushes and opens the PR.

The lane parser and path predicate cover all 18 changed paths exactly (the lane
file itself is implicitly allowed by repository policy). Core-purity, money-arithmetic,
commercial-boundary and PL/pgSQL CASE checks passed; `git diff --check` passed.
