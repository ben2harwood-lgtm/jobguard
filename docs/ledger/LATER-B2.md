# LATER-B2 — Compare independent demo seed runs

L088 (`dbsrc-04#6`), GREEN lane; test-only, no migration.

Inspected base and unchanged HEAD: `7ff452eeec1c523345d34715adfa3f8310062013`.
Current `origin/main` supersedes the order's `ca435eeb5791638c787c830d6ba717146f694539`
and draft `0bbb5ddb`. BUILD_PLAN.md C6:119 and M1-15:393 still apply.

The new unit suite records two fresh seed invocations without replay storage,
snapshots each complete envelope, and compares command identities, order, values
and tenant/job/scope references. A controlled second invocation changes only the
first command identity; the same comparison rejects it. The intentional first
comparison failed on that identity, then the permanent negative control asserted
that rejection. No production seed or existing fixture expectation changed.

Local execution evidence and limitations are in
`docs/verdicts/LATER-B2/BUILDER_RECEIPT.md`. Lane registration is missing at
`config/lanes/later-b2.json:1`; the coordinator must supply it. The lane checker
also refuses the uncommitted HEAD/main self-comparison. Neither shared check nor
registry was changed. CI, an independent recorded verdict on the eventual commit,
and separate acceptance remain required; no acceptance is claimed here.
