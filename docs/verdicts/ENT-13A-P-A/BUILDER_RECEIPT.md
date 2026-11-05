# ENT-13A-P-A builder receipt — AMBER

Built by Codex, 18 October 2026. Only sub-order A is implemented. Branch `codex/sandbox/ent-13a-p-a`; initial HEAD and inspected origin/main both `b881f90be0a6d368838ca4392338147ef819bd3a`. The initial working tree was clean. This is an uncommitted diff, not an exact-commit verdict or acceptance. The dispatcher must commit it before the independent actor binds a verdict; separate acceptance and Ben's merge/push/release remain outstanding. No verdict/acceptance file was authored.

## Changes and scope

Recovered `connector-environment.ts` byte-for-byte from `origin/codex/sandbox/ent-13a` (`26536d3d` as identified by dispatch), not its parent tree. Strict versioned Zod input requires explicit synthetic_demo/fake and fictional endpoint/credential references; no defaults or unknown fields. Output is frozen, errors use one redacted typed diagnostic. No reference resolution, credential retrieval, runtime registration or commercial authority. The fixture label syntax is a reversible fictional choice, not production credential policy.

Copied the original 31 expanded tests before the implementation and ran them against the absent module. Added one test for frozen-copy/input preservation. All original cases remain intact. Appended only the narrow export and commented `.env.example` entries to existing files. These two shared files must serialize with other builders at integration; no other builder edited them during this run as far as this working-tree inspection shows.

Updated the three connector documents for Ben's 17 October answers and current merged foundations; added aggregate and slice ledgers. The aggregate ledger preserves every E13-A01–A30 assertion and records item-specific STOPs with file:line and before/after. Ben's original answer file and the 13 October finisher acceptance table were readable and source-inspected. The original reusable branch's unexecuted test claims are not carried forward as passes.

Lane file follows the dispatch with one required correction: omit its own path from allow. The dispatch explicitly says it may not list itself; the checker rejects such a grant and grants branch ownership implicitly. No legacy registry edits. Supplemental path validation covers all 11 changed paths. Only `.env.example` and `packages/config/src/index.ts` modify existing tracked files, both append-only. Protected sources/pins, dependency pins, database files, merged tests and upstream receipts remain unchanged.

Affected invariants: strict boundaries and safe diagnostics (§2.7/2.8); tenant/authority boundaries preserved (§5.1/5.3); synthetic-only mode (§5.10/5.11); independent review (§5.13); immutable origin/commercial authority (§5.16). No new operational alert, external action or backwards-incompatible runtime behavior. No migration, backfill, grant change or reserved migration number; rollback is removal of this unused additive configuration/export.

## Execution environment and commands

Existing installed dependencies used; no install/download or clean-install claim. Node `v24.17.0`, while `.nvmrc` pins `24.15.0`; no pin changed. The default pnpm launcher stalled after a v11 warning during `pnpm --version` and was interrupted (130). Cached pinned pnpm **10.28.1** was then used through a temporary symlink `/private/tmp/jg-ent-13a-p-a-bin/pnpm` to `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. All pnpm checks below prepend that temporary directory to PATH. Root checks use `LANE_BASE_REF=origin/main`. Turbo reused unaffected cached tasks and emitted sandbox cache I/O warnings; cached logs referring to other worktrees are not fresh executions here.

| Command / stage | Actual result |
|---|---|
| `pnpm --filter @jobguard/config exec vitest run --maxWorkers=2 src/connector-environment.test.ts` before parser | RED, exit 1: cannot find `./connector-environment.js`; one failed suite, zero executed assertions. This is the requested missing-module failure, not 31 failed assertions. |
| Same command after parser and added test | GREEN, exit 0: **32/32 passed**, 1 file. |
| `pnpm test` | FAIL, exit 1. Tool tests 100/100 pass; config package 33/33 pass (32 connector + existing identity case); AI 113/113 pass; core 5,595 pass / 7 fail, 216 passing files / 6 failing files. Turbo 7/10 tasks successful, 4 cached. Full regression not green. |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL, exit 1 at lane self-comparison guard; core purity passed first. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, exit 1: “Missing branch or self-comparison range; refusing a misleading pass.” HEAD equals origin/main because committing is prohibited. Dispatcher/CI must rerun after commit; checker not changed. |
| Supplemental working-tree lane validation | PASS using existing `loadLanePolicy`, `selectLane`, `lanePathAllowed` against tracked diff plus untracked paths: all 11 in issued lane. Not a substitute for commit-range validation. |
| `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | PASS, exit 0 each. Core purity checks 212 TypeScript files. |
| `git diff --check` and additive/protected-source inspection | PASS. Only two tracked files differ, both append-only; parser matches reusable source exactly. |

| `pnpm typecheck` | PASS, exit 0; 7/7 tasks, 3 cached. |
| `pnpm exec turbo run lint` (supplement after root lane refusal) | PASS, exit 0; 7/7 tasks, 3 cached. Does not clear root lint's lane guard. |
| `pnpm openapi:check` | BLOCKED/FAIL, exit 1: tsx CLI cannot listen on its IPC pipe (`EPERM`), before schema comparison. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; same generator/check with no CLI IPC socket, no generated-file edits. |

`pnpm build`: **PASS**, exit 0; 7/7 tasks, 3 cached, 8m50.841s. Next.js compiled and generated all 41 pages. Warnings included inferred workspace root, dynamic dependency expressions, autoprefixer support and sandbox cache I/O; no source changes made to suppress them. This is a build, not browser/e2e execution.

## Root-test failure details and item-specific STOPs

Five compiled-test assertions read nonexistent adjacent TypeScript files under `packages/core/dist`: jobs-on-the-go, recovery-allocation, site-extra-pricing and two subscription-architecture assertions. Their corresponding source locations are `src/jobs-on-the-go.test.ts:156`, `src/recovery-allocation.test.ts:190`, `src/site-extra-pricing.test.ts:140`, and `src/subscription-architecture.test.ts:10`. The other two failures are the existing `src/receipt-allocation.test.ts:212` 5-second case and its compiled copy timing out. Before: existing tests unchanged. After: STOP changing their expectations, source or repository test configuration outside this lane; failures remain reported. No claim that this is an independently reproduced baseline failure.

A diagnostic rerun `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/receipt-allocation.test.ts` also failed: 31 passed / 3 timed out, exit 1 (`src/receipt-allocation.test.ts:125`, `:212`, `:222`). No limit or assertion was weakened. This does not clear the root regression failure.

Local logs: `/private/tmp/jg-ent-13a-p-a-checks/` (lint, typecheck, test, build, openapi:check, package-lint and receipt-allocation). They are local diagnostic artifacts; CI must produce durable check evidence on the committed diff.

## Preservation and outstanding gates

No new PostgreSQL behavior, so new failing-first PostgreSQL tests and own-step migration proof are **inapplicable to A**. No new AI evaluation or browser journey is applicable. PostgreSQL preservation is **NOT RUN to completion / unverified locally**: root `pnpm test` reached DB setup and reported skipped assertions before cancellation after the core failure; this proves no PostgreSQL guarantee. Standalone `pnpm test:db` and `pnpm test:migrations` were NOT RUN in this sandbox. No browser, Playwright or e2e command ran, as instructed.

Dispatcher-pushed CI must retain `pnpm test:db`, `pnpm test:migrations` and existing e2e gates, including unchanged DB preservation suites: `tenancy.integration.test.ts`, `demo-bootstrap.integration.test.ts`, `fingerprinted-row-shape.integration.test.ts`, `contractor-session-context.integration.test.ts`, `work-order-import.integration.test.ts`, `work-order-concurrency.integration.test.ts`, `site-extra.integration.test.ts`, and `command-replay-contract.integration.test.ts`. No test/gate was removed or made optional.

A24 remains **configuration-only**, not complete application/HTTP proof. A29 documents requirements without granting approval. A30 remains held for full regressions and independent exact-commit verdict. Q2–Q4/Q7, exact delivery lifetime if absent, post-closure/revocation delivery reconciliation, accepted ENT-6B #240 interfaces and accepted ENT-8a persistence remain item-specific STOPs. Ben 1.9 non-live refusal/same-time conflict quarantine and finance-only billing rules are requirements, not implemented by this config slice. No aggregate ENT-13a or roadmap completion credit.

D01/D02/D03/D08/D09/D16 and G5 stay closed; no real data, credentials/endpoints, spending, external sending, deployment, deletion/retention changes or UI. No Git write, add, commit, push, checkout or fetch. Intended conventional commit message: `/private/tmp/jg-msg-ent-13a-p-a.txt`.

## Final handoff

Sub-order A implementation/configuration execution is ready for independent review, with full technical acceptance held by the recorded root-test failures, post-commit lane checks, CI preservation and independent actor records. Final HEAD remains `b881f90be0a6d368838ca4392338147ef819bd3a`; all 11 task paths remain uncommitted. The final diff/allow-list check passes; no independent verdict or acceptance is claimed.

## ENT-13a-machine follow-on — 4 November 2026 (RED, NOPR)

This follow-on adopts only the supplied fictional Q2/H1, Q3/H2, Q4/H3 and Q7/H5
rulings, recorded in the capability contract. Historical configuration-only evidence
above is unchanged. Added an unregistered raw-body machine route/application,
member-guard refusal, normal membership bridge for owner management, and additive
0940 persistence/proof. 0941–0944 unused. No Git writes, PR, real credential, network
call, database/browser run or G5 activation. Existing intake is reused with zero
domain effects; there is no ENT-2 promotion/origin write, job mutation or new job
command type to register. Management command IDs/receipts are connection control
plane records, not generic commercial command receipts.

Authority: distinct generated machine actor, separate sponsor, tenant/environment/
client binding, append-only capability versions, owner provision/widen/rotate/
revoke/disconnect with idempotent receipt plus audit. HMAC method/path/timestamp/
nonce/body hash and authority selectors; ±300 seconds, nonce ≥600 seconds, old key
cutoff ≤24 hours, 1 MiB transport limit plus unchanged domain envelope validation.
Only fixture key labels persist. Dedicated NOLOGIN machine role cannot call legacy
intake or member SQL. SQL rechecks authenticated binding token, authority/key set,
capability, timestamp and nonce under connection locks. Trusted adapter credentials
remain outside the end-user HMAC boundary. No claim of safety against their compromise.
No fingerprinted row-shape, protected source pin or scanner change. No data migration
or backfill; additive forward-fix strategy is in the migration note.

Local checks used installed Node v24.17.0 and cached pinned pnpm 10.28.1 via temporary
PATH shim `/tmp/ent13-machine-bin`. Default global pnpm stalled (both commands
interrupted, exit 130, no test result). Initial Vitest attempts could not resolve
unbuilt workspace package exports: zero assertions executed. Built existing core,
storage, DB, AI and config dependencies (all successful); no package downloaded.
Turbo reported cache I/O sandbox warnings, with 4/4 builds executed successfully.

- API typecheck: PASS.
- API Vitest `machine.test.ts inbound.test.ts identity.test.ts --maxWorkers=2`:
  PASS, 62 tests across 3 files, after dependency builds.
- DB Vitest `migration-proof-loader.test.ts connector-intake-proof.test.ts
  --maxWorkers=2`: PASS, 80 tests across 2 files (no database involved).
- API Vitest `auth/context-boundary.test.ts --maxWorkers=2`: PASS, 145 tests;
  protected bridges and fingerprints unchanged.

New database test coverage is authored, not executed here: immediate predecessor
upgrade and unchanged existing routine bodies/row snapshots, repeat migration,
owner and cross-tenant management, immutable capability revision and idempotent
commands/audit, concurrent nonce refusal, wrong tenant/environment/contract/capability,
skew, credential refusal, rotation overlap/expiry, revoke/disconnect, atomic failed
staging and source deduplication, direct SQL privilege/RLS refusal. Existing intake
catalogue test now asserts all five added private FORCE-RLS tables explicitly.
Transport tests cover bad signature, timestamp, tenant/environment/contract,
capability, bytes/size/method/path and sanitised persisted refusals. Global and tenant
member guards are exercised for every method/path in the current OpenAPI document,
including a practice cookie. No browser/listener is started.

### Named holds for landing

CI must prove real PostgreSQL tests, fresh/upgrade migration and catalogue/privilege
checks, existing mandatory suites and green current-main CI. Independent RED review
must bind to the exact router-committed head. Local SQL source inspection and fake
store responses are not PostgreSQL or independent review proof. SFTP, domain
promotion/reconciliation, real credential store/endpoints, operational approvals and
G5 remain held. No scanner or protected pin edit was needed. This is readiness for
router commit/push and checking, not acceptance or aggregate ENT-13a completion.

Final local verification:
- API typecheck rerun after final boundary tests: PASS.
- Final `machine.test.ts watchdog-registry.test.ts --maxWorkers=2`: PASS,
  146 tests across 2 files (includes inclusive ±300-second and newline refusal tests).
- New PostgreSQL integration file and its imported fixtures typechecked with a
  temporary tsconfig extending the repository configuration: PASS; not DB execution.
- PL/pgSQL CASE-in-IF lint: PASS, 255 migrations. Commercial-boundary lint,
  money-arithmetic lint and `git diff --check`: PASS.
- Standard lane lint was run and correctly REFUSED self-comparison: HEAD equals
  origin/main and all task changes are uncommitted. No scanner/pin was edited.
  Exact working-tree coverage validated with the existing exported lane loader and
  lanePathAllowed: PASS, all 14 task paths plus implicit own lane; no extra entries.
  Named landing hold: router must rerun the standard lane check after committing.

READY for router commit/push and CI/RED checking; not independently reviewed,
merged, released or aggregate ENT-13a complete.

## Batch-35 landing preparation (4 November 2026)

RED. Built ahead, NOPR: ENT-13a-machine plus ENT-8a-job-finish. Comparison base is
cached origin/main 56b74eaec205e86c9eaf7eee75d85ade2599a364 (the batch's mainline
parent); local main is stale. No fetch or Git writes were run.

Migrations are 0620_contractor_job_finish then 0621_connector_machine, with matching
proofs and stem references. Main migrations were not edited. The finish fact stays
in its own immutable table, now listed in laterEmptyTables. EndCheck is classified
in jobMutationRegistry and registered in SQL and currentCommandRegistryRows; the
proof includes its exact registry transition. The MON-8 upgrade guard compares the
exact five replaced routine signatures against their migration bodies, preserving
all prior exceptions. Private tables have no spurious LP-0 owner or RLS entries
where that inventory tracks only non-owner grants. Actual FORCE RLS and private
policies remain required. The connector policy digest uses the catalogue's
true/newline/true form. No runtime INSERT grants, fingerprinted row changes or
SET app.* clauses were added.

Current verification, with installed tools and no dependency downloads:
- Sequential package tsc -p tsconfig.json --noEmit: PASS for core, config, storage,
  ai, db, API and web (the existing workspace typecheck commands).
- API Vitest watchdog-registry, context-boundary, identity: PASS, 278 tests.
- API Vitest connectors/machine.test.ts: PASS, 20 tests.
- Web Vitest finish route and job-finish component: PASS, 20 tests. No browser run.
- DB Vitest migration-proof-loader.test.ts: PASS, 76 tests.
- Every Vitest invocation named at most three files and used --maxWorkers=2.
- Changed DB integration files and imports: tsc PASS using the temporary
  /tmp/batch-35-integration-types.json; this is not PostgreSQL execution.
- PL/pgSQL CASE-in-IF lint: PASS, 256 migrations. Commercial-boundary lint,
  money-arithmetic lint and git diff --check: PASS.
- Standard agent-lane-boundary-lint.mjs: REFUSED old paths still recorded in HEAD,
  including removed piece lane files and old migration stems. The sandbox cannot
  commit these removals/renames. Existing exported lane helpers verify the actual
  final-tree diff: PASS, exactly 31 paths, no lane files in allow, valid migration
  order. Router MUST rerun the standard checker after committing this preparation;
  this is not a claimed standard lane PASS.

Initial pnpm invocations stalled before Vitest started and were interrupted. Direct
installed Vitest initially lacked workspace dist exports; existing package builds
supplied them, and all named suites then passed. No test was weakened.

CI must prove fresh and predecessor PostgreSQL upgrades, LP-0 catalogue and grants,
command registry and snapshot compatibility, immutable finish/replay/permission/audit
boundaries, connector isolation/nonce/rotation/revocation/concurrency guarantees,
mandatory database suites and the ENT-8a finish browser journey. One independent RED
review must bind to the router-committed head before landing. No real data, live
services, PR, release or Git mutation was used.

READY for router commit and NOPR push; CI and independent RED checking remain for
this group's turn. Not merged, independently reviewed or released.


## Batch-35 pre-check repair (5 November 2026)

RED. One authorised repair round for batch-35 (ENT-8a job finish and dark
ENT-13a machine connections), NOPR. Read coordinator/prechecks/batch-35.md.
Applied batch-35-proven-fixes.patch using git apply for its five unchanged target
files; adapted the two registry-list hunks to retain main's additions. Removed
now-unused invite/command/promptSession imports. Bootstrap pre-creates and checks
jobguard_machine; the integration setup records predecessors before legacy
fixtures and explicitly assumes the NOINHERIT machine role; endCheck returns a
rejected promise for invalid input; the revoked-owner replay test revokes its
existing owner instead of attempting a forbidden second owner. No assertion or
authorization boundary was removed.

Resolved all three original text conflicts by keeping both sides: observationEvidence
and finishStatus, the complete empty-table union, and registry declarations before
their consumers. The launcher's pending merge targets 62081c68933d0b953e7dd75a8cbd7b3a2fb4f304.
While working, cached origin/main advanced to 199124c0885ca27558fbaf62a9a74dee7ad2818f
(batch-28, migrations 0609/0610). Preserved those additional main changes in the
working tree using read-only git show/diff and temporary three-way text merges;
resolved their four list conflicts by retaining rateSuggestionRegistryRow and
adding only this piece's contractorJobFinishRegistryRow. The 0620 proof now chains
from 0609's exact after-state, adding EndCheck once. The 0606 dark-order row is
retained throughout. The proof-loader test validates that chain.

Migration inspection: all 275 migrations on that pinned main were byte-identical;
0620 and 0621 are the only new migrations, with no repeated number. All five
replaced lp_* routines still derive from the latest predecessor, 0196, which is
identical on branch and main. No main migration was edited. Final-tree comparison
against pinned main found exactly 35 non-lane changed files; batch-35.json lists
exactly those paths and does not list itself. Existing loadLanePolicy and
lanePathAllowed helpers accepted every path. The standard committed-head lane
check must run after the router stages the resolved merge and commits, including
the preserved newer-main files (some are currently untracked relative to the old
merge index). No git index, ref or commit writes were performed here.

Local verification with installed executables (no downloads, PostgreSQL or server):
- packages/db: ./node_modules/.bin/vitest run --maxWorkers=2
  test/migration-proof-loader.test.ts test/lp5-command-catalog.test.ts
  test/late-source-import-migration.test.ts — PASS, 86 tests.
- apps/api: ./node_modules/.bin/vitest run --maxWorkers=2
  src/connectors/machine.test.ts — PASS, 20 tests.
- apps/web: ./node_modules/.bin/vitest run --maxWorkers=2
  'app/api/contractor/jobs/[id]/finish/route.test.ts'
  'app/contractor/jobs/[id]/possible-extras/job-finish.test.tsx' — PASS, 20 tests.
- packages/db, apps/api and apps/web: ./node_modules/.bin/tsc
  -p tsconfig.json --noEmit — PASS.
- node tools/plpgsql-case-in-if-lint.mjs — PASS, 277 migrations;
  node tools/commercial-boundary-lint.mjs and node tools/money-arithmetic-lint.mjs
  — PASS. git diff --check — PASS.

Two initial pnpm commands stalled before checks started and were interrupted;
installed executables supplied the results above. A premature test invocation
encountered temporary merge markers in two files (76 proof-loader tests passed);
after resolving the markers the complete three-file run passed 86/86. An exhaustive
lane-comparison helper was interrupted after its migration checks completed and
replaced with a focused comparison of candidate paths. These are local execution
notes, not additional product repair rounds.

CI must prove pnpm typecheck/lint/test/build and applicable eval gates at the final
committed head; real PostgreSQL fresh/predecessor upgrades, demo-bootstrap,
connector-machine and connector-intake, contractor-job-finish and end-check,
restore/plan/server entitlement upgrades, LP-0 grants/catalogue and migration proofs.
Required adversarial coverage includes duplicate/replay, revoked permissions,
cross-tenant/job access, immutable finish/audit facts, machine capabilities,
rotation/revoke/disconnect, nonce replay and rollback. Run the mandatory database
and migration suites. CI must also execute apps/web/e2e/ENT-8a-job-finish.spec.ts
on phone and desktop with at most two workers; no browser journey was run here.
One independent RED review must bind to the final committed head before landing.
No real data, live provider, deployment, launch, PR or push occurred here.

Changed test files and their imported fixtures also passed the installed root tsc
with /tmp/batch-35-repair-types.json (extends DB configuration, noEmit, repository
rootDir, six explicitly selected test files). This proves types, not DB execution.

READY for router staging/commit and NOPR push. Database/browser CI, the standard
committed-head lane check and independent RED review remain required. Not merged,
independently reviewed, released or launched.

## Batch-35 merge refresh — 5 November 2026, incoming main d16ef1978

Resolved all seven conflicted working files while preserving both branches:
main's SCIM role, emergency/SCIM/CIS empty-table expectations and DB exports,
plus this group's machine role, contractor finish fact and EndCheck registry row.
No new product behaviour. Incoming main's 278 migration blobs remain identical;
0620 and 0621 are the only added migrations and neither exists on incoming main.
Compared all five 0620 replacement routines against the latest definitions across
incoming main's migration tree (0196): only this group's existing finish/status/
EndCheck changes remain. No mainline routine logic was removed. Exact lane
comparison and the existing lane helpers pass for all 35 non-lane changed paths;
the lane does not list itself. No assertions were removed or weakened in this
refresh. This is a merge recheck, not a new independent review.

Local checks (installed Node 24.17.0 / pnpm 10.28.1, no downloads):
- DB Vitest, maxWorkers=2, late-source-import-migration.test.ts,
  migration-proof-loader.test.ts, demo-bootstrap.integration.test.ts, filtered to
  `bootstrap SQL trace|0613|migration proof|exact|discovery`: 87 passed, 3 skipped.
  Only the SQL trace section of demo-bootstrap ran; no PostgreSQL was started.
- DB Vitest, maxWorkers=2, lp5-command-catalog.test.ts and
  connector-intake-proof.test.ts: 11 passed.
- API Vitest, maxWorkers=2, connectors/machine.test.ts,
  connectors/inbound.test.ts and auth/context-boundary.test.ts: 204 passed.
- Web Vitest, maxWorkers=2, contractor job finish route.test.ts and
  possible-extras/job-finish.test.tsx: 20 passed.
- PL/pgSQL CASE-in-IF lint (280 migrations), commercial-boundary lint,
  money-arithmetic lint, git diff --check: PASS.

The index remains unmerged because this sandbox prohibits Git writes. The router
must stage these resolved files and complete the merge. Database/browser suites,
full required CI and independent RED review remain required on the committed head.

Type verification: `pnpm exec turbo run typecheck --filter=@jobguard/db
--filter=@jobguard/api --filter=@jobguard/web --concurrency=2` passed all 7 tasks
(including dependencies). Turbo emitted sandbox cache I/O warnings only.
`node node_modules/typescript/bin/tsc -p /tmp/batch-35-repair-types.json --noEmit`
also passed for the six changed DB test files and imported fixtures.

READY for router staging and merge commit; no Git writes performed.

## Batch-35 repair round 2 (last) — 5 November 2026

RED; ENT-8a / ENT-13a, NOPR. Read the later-safety-15 precheck landing note.
Root cause: 0620's recorded command_type_registry after-state appended EndCheck,
whereas serious-b5-upgrade snapshots aggregate rows ORDER BY to_jsonb(t)::text.
PostgreSQL JSONB puts the shortest key, version, first for these registry rows;
end-check.v1 belongs between decision-resolution-command.v1 and
rate-suggestion-accept.v1. The loader copies the recorded array exactly. This
was an incorrectly ordered proof, not different registry contents on upgrade.
Moved only the EndCheck row within 0620's after-state. Its before-state, all row
values, migration SQL and the full serious-b5 snapshot comparison are unchanged.

Added a regression in late-source-import-migration.test.ts: it verifies the exact
0609-to-0620 chain, full expected row union at the sorted position, loader output
and preserved baseline. Temporarily restoring the HEAD proof makes that test fail
with the appended EndCheck diff; the corrected proof was restored in a finally
block. No generic sort layer or comparison exemption was introduced.

Local checks (installed executables, no downloads; Vitest maxWorkers=2):
- packages/db: ./node_modules/.bin/vitest run --maxWorkers=2
  test/migration-proof-loader.test.ts test/lp5-command-catalog.test.ts
  test/late-source-import-migration.test.ts — PASS, 88 tests.
- Original HEAD proof mutation: focused `0620 keeps` regression — FAIL as
  expected (1 failed, 3 skipped); corrected proof restored.
- packages/db: ./node_modules/.bin/tsc -p tsconfig.json --noEmit — PASS.
- Root installed tsc -p /tmp/batch-35-r2-types.json --noEmit — PASS;
  explicitly includes the changed regression test and its imports.
- git diff --check — PASS. Exact lane comparison against the merge base with
  cached origin/main, including working changes, using loadLanePolicy and
  lanePathAllowed — PASS, 35 non-lane paths; no lane file is listed in allow.
  The existing lane already contains all changed paths and needed no edit.

Environment order prohibits PostgreSQL startup and localhost binding. Therefore
serious-b5-upgrade was NOT executed locally; CI must run, from packages/db:
  ./node_modules/.bin/vitest run --maxWorkers=2 test/serious-b5-upgrade.integration.test.ts
The remaining required database/browser suites, full CI against current main,
standard committed-head lane check and independent RED review remain required.
No Git writes, push, PR, merge, provider, deployment or launch occurred.

READY for router commit and NOPR push, subject to those CI/review gates.


## Batch-35 PR landing preparation — 5 November 2026

RED; ENT-8a job finish and dark ENT-13a machine connections. Preserved the
prechecked fixes. Incoming main is 68b104767b18fad6fc5b9676f95bcd7d68bcc19d,
whose migration top is 0618. Reserved 0619 belongs to #579. This branch adds only
0620_contractor_job_finish.sql and 0621_connector_machine.sql, in that order.
Neither repeats an incoming-main migration stem. Both SQL files remain byte-identical
to this branch's prechecked versions; only filenames, proofs, notes and references
were renumbered. No incoming-main migration or proof was changed.

Compared each re-created routine against incoming main's latest definition:
app.lp_command, app.lp_read, app.lp_finish, app.lp_require_audit and
app.lp_receipt_immutable are last defined in 0196. The differences are solely this
piece's prechecked EndCheck/status extensions; no main logic is removed. 0621's
three routines are new. No function has a SET app.* clause. No worker task or CI
image was introduced. The finish web route imports the exported API workspace
entrypoint, not API source; inspected the changed route/page imports rather than
running the Cloudflare build in this restricted environment.

Resolved the single text conflict in plan-entitlement-lifecycle-upgrade as the
exact assertion union: retain the five EndCheck body assertions and main's latest
0615 success-fee and 0616 payment-fee exact-body assertions. No behavior or test
assertion was weakened. Git index still reports this file unmerged because .git
is read-only; the router must stage the resolution and complete the merge.

Added the explicit contract hold for the dark machine command's separate receipt
path, which is outside LP-5 dispatch. This does not claim lifecycle integration.
Regenerated docs/operations/provider-register.md for the existing changed connector
data-flow source. Lane allow lists exactly the 36 changed non-lane paths, excludes
itself, and includes the generated register.

Local executed checks, installed tools only, each Vitest run maxWorkers=2:
- DB migration-proof-loader, lp5-command-catalog and late-source-import-migration:
  PASS, 88 tests in three files.
- API connectors/machine: PASS, 20 tests in one file.
- Web finish route and JobFinish component: PASS, 20 tests in two files.
- Installed TypeScript --noEmit for packages/db, apps/api and apps/web: PASS.
- Supplemental TypeScript config covering the merged plan-entitlement upgrade
  test and imports: PASS.
- checkProviderRegister(): PASS; git diff --check: PASS.
- Working-tree lane lint using loadLanePolicy, lanePathAllowed and
  migrationOrderViolations against MERGE_HEAD: PASS, 37 paths, exact allow list.
  The standard CLI was run but reports incoming-main staged paths and the old
  renamed paths while the merge is unfinished; do not treat that as a PASS.
  Router must rerun the standard committed-head lane check after completing it.

The initial pnpm exec invocations stalled before Vitest startup and were cancelled;
the installed workspace Vitest executables then ran successfully. A guessed
provider-register.test.mjs does not exist; the actual exported register check passed.
No PostgreSQL startup or localhost binding was attempted. CI must prove the real
PostgreSQL connector-machine/intake, contractor-job-finish/end-check, bootstrap,
plan-entitlement, restore-reconciliation and serious-b5 upgrades, grant/catalog
checks, full required suites and ENT-8a browser journey on the final head. Prior
precheck database evidence is historical, not execution at this handoff. Exact-head
independent RED review and green CI remain merge gates.

READY for router staging, merge completion, commit, push and PR opening. No Git
write, provider call, deployment, launch or real customer data was used.
