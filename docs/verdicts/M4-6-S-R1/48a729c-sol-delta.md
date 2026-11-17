VERDICT: PASS
HEAD: 48a729c5051390f680e85f8d51a392384d79677c

No P1/P2/P3 findings in the round-1 repair scope. No required fixes.

**Source-inspected**

- Fix A matches the repair order in both [0115 SQL:27](/private/tmp/jg-check-m4-6-s-r1-20261011T134325/packages/db/migrations/0115_recovery_follow_up_repair.sql:27) and [repository:457](/private/tmp/jg-check-m4-6-s-r1-20261011T134325/packages/db/src/recovery-follow-up-repository.ts:457): unapproved previews are ignored; later approved actions block unless cancelled. Queued, executing, unknown-outcome and succeeded-without-delivery actions remain blocking. A newer delivered message becomes the source.
- Fix B takes the shared serialization key [before reading `clockAudited`:180](/private/tmp/jg-check-m4-6-s-r1-20261011T134325/packages/db/src/recovery-follow-up-repository.ts:180), after domain writes. The evaluator completes intent locks and mutations before that key and the audit head. No new lock-order inversion found with SBOX-2 advance or due signals.
- All four required PostgreSQL tests exist at integration-test lines **944, 955, 981 and 988**. Their assertions would fail at `fae8695`: Fix A loses the delivered source; Fix B appends a second clock fact. The race test observes PostgreSQL’s actual lock wait, uses no sleeps, and constructs legacy state through the migration-owner fixture path.
- Comparing both routines against 0112 confirms only the documented source-selection change and audit additions. The evaluator and populated-upgrade test are unchanged from `c88c554`.
- The merge into `c88c554` touched none of this piece’s implementation or tests. Shared-file changes were a separate lane entry and unrelated migration notes.
- The nine-file `origin/main...HEAD` diff stays within the registered lane, including the integrator’s ledger amendment. Only allocated migration **0115** is added. No founder-reserved capability, earlier migration, test skip or timeout changed. Existing main assertions are preserved; only this leaf’s instructed `active` expectations changed.

DW1–DW6 remain satisfied within this re-check: due review sends nothing; exact approval is required; repeated advances/signals preserve one effect; cancellation/dispute/settlement stop; revocation requires approval again; reopening requires a fresh reviewed intent. C1–C8’s inherited guarantees remain covered by the unchanged implementation and passing CI regressions.

**Executed locally**

Node **24.17.0**, cached pinned pnpm **10.28.1**:

| Command/check | Exit | Result |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 tasks; 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Detached-HEAD lane refusal |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Detached-HEAD lane refusal |
| `pnpm exec turbo run lint` | 0 | 7 package tasks; 4 cached |
| Core follow-up Vitest | 0 | 20 tests |
| API follow-up Vitest | 0 | 38 tests |
| DB recovery-message repository Vitest | 0 | 9 tests |
| `pnpm build` | 0 | 7 tasks; 4 cached; 24 pages |
| Direct Node OpenAPI snapshot check | 0 | Matched |
| Typecheck both DB integration files | 0 | Passed |
| Diff, routine, lane, money and commercial-boundary checks | 0 | Passed |

Independent tests written under [/tmp/jg-r1-independent](/tmp/jg-r1-independent):

- **5 selector tests passed**, including 729 histories evaluated against both extracted queries. These use SQLite solely as supplemental predicate checks. Against `fae8695`, four tests fail as expected.
- **2 repository orchestration tests passed**, covering legacy finalization with and without concurrent catch-up. Against the old repository, the concurrent case reproduces **two clock facts instead of one**. These doubles are supplemental, not PostgreSQL proof.

**CI evidence relied on**

[CI run 38134140142](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/38134140142) tested merge commit `8084a6d`, incorporating this exact head into `530681c`. Its logs confirm:

- **896 database-package tests passed**, including all **56 follow-up tests**, the four named round-1 cases, and **3 populated-upgrade tests**.
- Tenancy and demo-bootstrap migration suites passed.
- **300 browser tests passed** across the existing projects.
- Typecheck, lint/lane, build, dependency audit and secrets checks passed.

I did not run PostgreSQL or browsers locally, or execute the four named PostgreSQL tests against the old head. Their old-head failures were source-inspected; supplemental tests reproduced both underlying defects. No live providers, real data, professional approvals or release gates were verified. Tracked files remain unchanged; no commit or push was made.