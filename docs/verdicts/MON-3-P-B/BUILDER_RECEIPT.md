# MON-3-P-B builder receipt

20 October 2026. Builder: Codex. This is a run receipt, **not an independent verdict or technical acceptance**. Observed HEAD and origin/main both `dc5721230fd8aedbf2d9d0457789074b66b48765`; branch `codex/sandbox/mon-3-p-b`. No git-writing command, commit, push, merge, deployment, real data, provider activation, spend, package installation or global configuration change. No Claude or subagent run. Dispatcher owns the eventual commit and exact-commit independent review. MON-3 remains incomplete.

Delivered source: reserved `0206_free_first_job_admission.sql`, four immutable migration-owned forced-RLS business side tables, five checked/private routines, setup-request repository, server-only fixture result proposal, prerequisite-only core contract, and disabled activation mutation/repository. Current persisted session/owner checks and tenant lock precede receipt replay. Completed results are bound by composite FK to stored setup/business verification and derive opaque simulated references/fingerprints server-side. Requested/redirected/failed/cancelled/unknown never complete a card. A's stable all-key derivation, private snapshot trigger and claims are reused, unchanged. No browser completion, new route, hosted URL, raw card data, billing or legacy-policy conversion.

Admission is unconditionally disabled in SQL before all commercial writes, and TypeScript refuses unexpected success too. Its unreachable transaction body uses existing v3 exact approved action/owner/live revision/accepted quote/parties checks, stored sufficient identity, distinct activation count, completed same-business card, A all-key snapshot insertion and own admission link. The bounded dispatcher hook checks persisted session/actor under the tenant lock before receipt replay. No positive activation journey is claimed; C must complete authoritative London deadline/end/conversion and success-result/audit composition before enabling anything.

Read: AGENTS.md in full; relevant BUILD_PLAN §§10.1.6–10.1.8 and MON-3 card; current free-first-job, key and subscription contracts; A receipt through `git show origin/main:docs/verdicts/MON-3-P-A/BUILDER_RECEIPT.md`; approved speed-v5 dispatch in the main checkout; existing activation/command/session/migration and test contracts. **Unavailable required inputs:** `MON-3-P-A-issued.txt` and `BEN-ANSWERS-20261017.md` were not found by completed searches of this project/Claude tree, private temporary directory and selected agent/desktop/download folders. Asked for their paths while independent work continued; no response at writing. Reading/reconciling them is an item-specific hold, not a claimed completion.

Environment: installed Node `v24.17.0`. Initial shell pnpm wrapper was `11.8.0` management machinery and stalled trying to verify the required pinned pnpm, then exited 1 with unreachable-registry/signature verification errors. No selected package was downloaded or installed. The first intended failing-first test did **not** execute; no domain red-test evidence is claimed. Attempt to terminate its own waiting shell returned EPERM; it later exited normally with the verification failure. Used already cached pnpm `10.28.1` via task-local `/private/tmp/mon3pb-bin/pnpm` wrapper (executes `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`). No setting or lockfile changed. Disk checked above the 45GB threshold (about 47.4GB available). No clean install claimed.

All heavy commands used `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot <task-label> <command>`; no more than two such commands concurrently. It emits sandbox sysctl/sysmon/pgrep diagnostics but completed commands retain their actual child exits. One initial standalone strict test-source compiler invocation ran without the slot wrapper; later/final invocations use the wrapper. No timeout, worker or test weakening. Vitest selections have at most three named files and `--maxWorkers=2`.

Actual checks (paths relative to repository unless noted):

- Initial intended red: `pnpm --filter @jobguard/core exec vitest run src/free-first-job-persistence.test.ts --maxWorkers=2` via heavy-slot — exit 1 in wrapper/version verification; test never ran. Source was written during the stalled invocation, so this is **not failing-first implementation evidence**.
- Installed-binary core: `packages/core/node_modules/.bin/vitest run --root packages/core src/free-first-job-persistence.test.ts src/free-first-job-keys.test.ts src/free-first-job.test.ts --maxWorkers=2` — exit 0, 3 files / 20 tests. Includes existing A key assertions.
- Installed-binary DB unit: `packages/db/node_modules/.bin/vitest run --root packages/db src/free-first-job-repository.test.ts src/free-first-job-card-repository.test.ts --maxWorkers=2` — initial exit 0, 4 tests; after rollback protocol cases exit 0, 6 tests; final after pre-replay actor case exit 0, 2 files / 7 tests. Pool protocol fixtures prove TypeScript fail-closed/rollback behavior only, not PostgreSQL semantics.
- Initial API unit selection — exit 1, both suites failed import because core dist was not yet built; no test result claimed. One retry exited 2 in heavy-slot before Vitest output; no result claimed. After dependency build, `apps/api/node_modules/.bin/vitest run --root apps/api src/free-first-job.application.test.ts src/free-first-job-card.adapter.test.ts --maxWorkers=2` — exit 0, 2 files / 14 tests. Final post-edit retry recorded below.
- Direct `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json` (build), DB `--noEmit` and API `--noEmit` — exit 0 each. Post-lock DB `--noEmit` also exit 0.
- Strict PostgreSQL-source compilation: `node node_modules/typescript/bin/tsc -p /private/tmp/mon3pb-tests-tsconfig.json` — exit 0 before and after new tests; final rerun recorded below. Includes all six new DB helper/suite files and their dependencies; starts no database.
- With task-local cached-pnpm PATH: `pnpm typecheck` — exit 0, all 7 tasks successful (2 cache hits). This preceded final bounded lock-hook/test additions; final affected checks recorded below.
- `LANE_BASE_REF=origin/main pnpm lint` — exit 1 at self-comparison range check; core purity passed (230 TS files). `LANE_BASE_REF=origin/main pnpm lint:lanes` — exit 1 for same reason. HEAD equals base; builder may not commit or substitute a fake base. Official post-commit range check remains a hold.
- `pnpm exec turbo run lint --filter=@jobguard/core --filter=@jobguard/db --filter=@jobguard/api` — exit 0, all 6 dependent tasks successful (2 cache hits). Final affected check after bounded lock-hook changes recorded below.
- `pnpm exec turbo run build --filter=@jobguard/api...` — exit 0, all 6 tasks successful (2 cache hits); second post-audit-hook run also exit 0. Final lock-hook build recorded below. Cached log paths refer to historical caches, not reads/writes of reserved worktrees. Turbo emitted cache IO permission warnings; tasks succeeded. No browser/Next build is required for this no-UI change.
- `pnpm openapi:check` — exit 1, tsx CLI IPC `listen EPERM`. Direct-loader fallback from `apps/api`, `node --import tsx src/generate-openapi.ts --check` — exit 0. No generated OpenAPI diff.
- `node tools/money-arithmetic-lint.mjs` — exit 0. `node tools/commercial-boundary-lint.mjs` — exit 0.
- Working-tree-only check using `lanePathAllowed` — exit 0, no violations (22 files at that point; final count below). This is not official range-lint evidence.
- LP-0 proposal-only `parseInventory` plus own `pathCompleteness` check using installed tsx from `apps/api` — exit 0, valid schema and zero own path problems. An initial root-loader attempt exited 1 because root has no tsx package; no catalogue or database was started. This does not prove live privileges or protection-record equality.
- `git diff --check` — exit 0 before final docs; final check below.

Database test sources authored: disabled admission and actual dispatcher denial, current/revoked/foreign/owner-role authority, setup completion binding/noncompletion/immutability/grants, concurrent exact requests/results, outer/audit-failure rollback, and populated own-migration upgrade. Upgrade installs everything before 0206, snapshots populated existing named columns/PK identities/full types, applies 0206 alone, compares; creates own verification/attempt/result facts, then applies later migrations twice and compares originals/own facts. Rolled-back controls detect a one-microsecond change and timestamp retyping; later nullable column, function replacement and new predecessor-table row pass. No empty compared table and no assertion that later migrations cannot add columns or replace functions. Positive admission tests are deliberately impossible until C; no false success is claimed.

**NOT RUN locally:** PostgreSQL, migrations, browser/Playwright/e2e, root aggregate `pnpm test`, full regression suites, live model/provider tests. This follows issuance. No provider, native, web UI, prompt/model or production financial change, so native/live-model/browser execution is not used as substitute evidence. GitHub CI must run actual DB/upgrade/tenancy/SERIOUS-B5/LP-0/A key and mandatory regressions after shared integration. These are holds, not waived acceptance.

Shared integration proposal only: `/private/tmp/SHARED-MON-3-P-B.patch` plus companion `.md`. Additive core/DB exports; exactly own tenancy rows and SERIOUS-B5 objects; own LP-0 group/path and six ACL/owner entries for current-owner helper, request, disabled admission. **LP-0 HOLD:** actual migrated `readProtectionRecord(readCatalogue(...))` for the five own routines/policies/triggers is unavailable. No protection hash, invented catalog row or another piece's source/hash freeze is supplied. Root must extract/review actual own records and apply serially. Shared files, routing, schema.ts, app.module and OpenAPI stay untouched in the working tree.

Recovery: transactional migration rollback on install failure; once installed preserve immutable identity/key/card facts and fix forward additively. No backfill, key reset, retention policy or data deletion. No new operational alert. Source is backwards-compatible with existing facade/policy behavior; no automatic conversion of legacy or pilot facts. C owns CLOCK/END/BILL/FINAL, successful admission and conversion composition. Independent exact-commit verdicts and separate acceptance remain required.

Final verification:

- Final API two-file retry after test environment cleanup: exit 0, 14 tests.
- Final strict PostgreSQL-source compiler after dispatcher/audit-failure/expiry/direct-write additions: exit 0. Still source compilation only; no PostgreSQL executed.
- Final DB build and lint after adding the bounded pre-replay hook initially passed. Tightening its typed-error parsing then exposed the repository's two installed Zod patch versions: DB build and lint both exited 2 with TS2589/TS2345 when the core schema was passed through a DB-Zod generic. Fixed by keeping `safeParse` with the schema's owning core package and translating its failure into the task's typed error, without casts, dependency updates or weaker validation. Final `pnpm --filter @jobguard/db build` and `pnpm --filter @jobguard/db lint` both exit 0.
- Final affected DB unit retry after that fix: exit 0, 2 files / 7 tests. All final named unit selections total 41 tests (20 core, 7 DB protocol, 14 API).
- One concurrent final build attempt exited 2 in heavy-slot before package output; sequential retry passed. This is wrapper-start failure, not a successful build or compiler result.
- An intermediate working-tree path check treated Git's collapsed untracked receipt directory as a path violation. Corrected the read-only enumeration to `git status --porcelain --untracked-files=all -z`; final check is 24 exact files, zero violations. No lane allowance widened. This remains separate from official range lint.
- Final `git diff --check`: exit 0. Intended conventional commit message is `/private/tmp/jg-msg-mon-3-p-b.txt`; builder has not committed or pushed.

Final disposition: bounded disabled source delivered with READ-ORDER, SHARED/LP-0, CI and RANGE holds in the ledger. Actual successful first/second admission is unreachable and unverified pending C. This receipt does not accept B or close MON-3.

## Coordinator serial integration — 20 October

Actual coordinator: Codex JobGuard coordinator. Applied the builder proposed additive shared export, own-table tenancy, own-object SERIOUS-B5 and own ACL/path LP-0 additions serially after builder completion. Lane lists those exact five integration paths. No predecessor assertion, protection digest or grant was weakened. Actual migrated protection-record extraction remains held for GitHub CI; no local PostgreSQL or browser execution. Deterministic postintegration checks follow; this is not independent review or acceptance.

Postintegration checks: `LANE_BASE_REF=origin/main node tools/lint.mjs` PASS; slot-wrapped DB `tsc --noEmit` PASS; slot-wrapped LP0 comparator unit suite 26/26 PASS (two workers); actual integrated inventory parser and own path completeness PASS. Two coordinator parser probes initially failed due to a wrong relative path and omitted fileExists callback; corrected invocation passed. PostgreSQL remains NOT RUN; these are source/static evidence only.

The required external instruction files were subsequently read in full by Sol medium builder-support. The following source-authority reconciliation clears the missing-file-read hold only; it is not an independent review. C must add authoritative new/non-imported/never-reopened target eligibility and positive/negative command tests; the unreachable body is not complete admission awaiting removal of one RAISE. All C, actual catalogue extraction, CI, independent verdict and acceptance holds remain.

# MON-3-P-B source-authority reconciliation

20 October 2026. Author: Codex/Sol medium, acting as builder-authority reconciliation support. This is source reconciliation only, not an independent model verdict, technical acceptance, database execution evidence or permission to activate admission.

## Inputs actually read

Both required external sources were read from their actual absolute paths, in full (using overlapping reads where output was bounded):

- `/Users/benharwood/.local/share/full-steam/jg-orders/MON-3-P-A-issued.txt`
- `/Users/benharwood/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261017.md`

Compared them with the current files in `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/mon-3-p-b`: the persistence contract, migration0206, core prerequisites, repositories, disabled mutation, and builder receipt. No feature file or receipt was edited. No tests, PostgreSQL, browser, Claude, Git writes, provider calls or acceptance action were performed. The CLI/root may still be finalizing other files concurrently; this note addresses the source observed during this read.

## Reconciliation result

No conflict with Ben's decided money/access rules was found in the currently reachable B behavior. The required-source availability hold can be replaced by this actual source read and the specific remaining holds below. This does NOT close MON-3 or certify complete B/C acceptance.

The issued document is an A-only execution order; its wider draft supplies the parent requirements and explicit B/C split. It is not a blanket authorization for B to enable the full trial. Its lines145-147 specifically require B admission to remain disabled until C supplies end/conversion guarantees. Ben answers lines6-7 retain made-up data and all live gates; lines12-21 specify London timing, owner authority, calendar/maximum rules; lines40-41 require verified identity and a new, non-imported, never-reopened job; lines66-68 give the dependency order and both-key requirement.

## Requirement mapping

1. Verified business and conservative identity: issued order lines64-70 and Ben answers40-41. Migration0206 lines3-13 stores migration-owned fictional verification independently of a card, with source/version/time and normalized business keys. Lines153-157 of the disabled body require stored verification and either company identity or phone plus completed card. Core prerequisites lines11-16 only return prerequisites/awaiting_c, never permission. No browser verification endpoint or real verification claim is introduced.

2. Durable simulated setup and completion: issued order lines70-74. Migration0206 lines14-36 binds attempt/result to verification and actor, restricts completion to opaque reference/fingerprint, and gives non-completed states neither value. Lines88-111 check owner/session before receipt replay and atomically write attempt/receipt/audit. Lines113-134 bind the fixture result to the stored attempt, derive values server-side and conflict on changed replay. Lines176-186 leave fixture completion without runtime EXECUTE and deny direct runtime business-table access. Contract lines9-15 describes these limits accurately. Unknown remains a nonqualifying terminal fixture fact; it cannot silently become card-on-file or a retry of a real action.

3. Owner and current authorization: issued order line86 and Ben answers21/40-41. Migration0206 lines65-75 resolves persisted company/session authority, locks, re-resolves and requires owner. The upstream `mon1_company_actor` explicitly refuses the shared-practice tenant and checks SSO-aware active membership (0184 lines63-81); B does not grant admins approval authority or cross-company browsing. The bounded mutation hook rechecks actor before dispatcher receipt replay. Actual database behavior still requires CI.

4. First/second activation and atomic key claims: issued order lines66-86. Migration0206 lines143-145 unconditionally refuses BEFORE admission writes, including under migration ownership. The unreachable body lines155-174 inspects completed same-business results, counts distinct prior activations, enforces the second-card prerequisite, calls unchanged exact-authorized v3 activation and inserts A's snapshot in the same transaction. A's original trigger derives all available keys; no copied single-key selection, helper runtime grant or key release is introduced. Existing practice activation does not select this mutation. TypeScript repository and mutation also reject unexpected SQL success. Therefore no positive activation, exemption, successful admission audit or successful atomic key-claim journey has been demonstrated or enabled.

5. C guarantees: issued order lines76-88 and145-147; Ben answers12-13/18-21/30/40-41. B persists no authoritative deadline, elapsed-day billing timestamp, end, conversion or statement. The contract lines19-29 expressly retains C's London clock/end/conversion and Final Check duties. This is consistent with the split; the existing elapsed-24-hour preview must remain non-authoritative.

## Explicit remaining holds and source caveat

- C must implement and prove the London 90-day policy with original database precision, DST/gap/overlap/leap/exact-boundary semantics; earliest own lock/own close/deadline/successful distinct second activation; no restoration after reopen; source identities and delayed/replayed facts; and subscription proration/corrections through MON-2A-P with original anchors/monthly maximum, annual off and no fee offset.
- C must implement actual lock/reveal/illustration parity, preserve fee qualification and exports, never card-gate lock/close, and use completed Final Check results only while the job is open.
- The unreachable admission body is NOT a complete eligibility implementation merely waiting for one RAISE to be removed. In particular,0206 lines149-174 do not explicitly inspect target job provenance or close/reopen history; they delegate accepted-quote checks to v3 and include a broad legacy-activation hold. Ben's explicit new/non-imported/never-reopened rule still needs an authoritative eligibility check plus positive/negative command-level tests before activation. Do not describe LIVE-01 as fully proved from denial-only tests. This is a held completion requirement, not an active bypass while the unconditional stop remains.
- C must finish exact successful result/receipt/audit composition and older-facade/direct-SQL protection before enabling any path. Current denial on all admission attempts must not be described as successful first/second activation implementation evidence.
- Shared catalogue/privilege integration, actual migrated protection records, PostgreSQL installation/upgrades/races/authorization and mandatory regression execution remain unproved here. No guessed LP-0 hash or synthetic acceptance is supplied by this note.
- Identity replacement/merge without a retained verified key, support reset, new access powers, new money/calendar terms, real services/data/spending and all release gates remain stopped. Both-key storage does not settle identity replacement.

## Receipt incorporation

Root may append an accurate statement that the two required source documents were subsequently read and reconciled by Codex builder-support, with this note attached. Preserve the original unavailable-at-builder-time chronology, remaining C/catalogue/test holds, missing failing-first execution, and independent exact-commit review/acceptance requirements. Do not label this note an independent review or PASS.

Done: source-authority read and bounded reconciliation. Not done: implementation change, runtime/database verification, C completion, verdict or acceptance. Decisions Ben needs now: None for this disabled source reconciliation. Next action: root incorporates this note after CLI completion, retaining all holds and the explicit eligibility completion requirement above.


## Catch-up 1 — C261, 25 October 2026

```yaml
session:
  order: MON-3-P-B-CATCHUP
  date: 2026-10-25
  builder: Codex
  model: gpt-6.1-sol
  reasoning_effort: medium
  session_id: 01a17382-4d18-7dc2-a731-b5206d7148ab
  branch: codex/sandbox/mon-3-p-b-catchup
  builder_head: 91ff397e9a34dbbdd2af7600f42721aac608ae64
  merged_main: 28416d1ea7e154f2353d56e28f30db34e06e36ab
  delivery: working_tree_only
  independent_verdict: pending_exact_dispatcher_commit
```

The model and effort above are the actual `turn_context` values in this session's local rollout record, not an inferred model family. Read the repository AGENTS.md, MON-3 build card and persistence contract, lane rules, migration/catalogue/upgrade sources, and the actual STANDING-MIGRATION-CATALOGUE-LINE.txt. This is a builder catch-up receipt, not independent review or acceptance. The two source PASSes named in the order apply to 91ff397e, not this uncommitted merge result.

Resolved the three working-file conflicts additively: both core exports (free-first-job persistence and UTC datetime), both DB exports (the two trial repositories and retained contractor reader), and both LP-0 ACL entry blocks (six B entries plus four CH-4-C entries). Read-only comparison against index stages 2 and 3 confirms all original group/ACL entries remain unchanged in each side's relative order and both barrels retain all exports. Main's automatically merged updated routine records remain intact. Migration 0206 is byte-identical to B's HEAD and retains its reserved number. No product behavior, grants, provider route, schema/migration, authorization gate, or test assertion was weakened. Admission remains disabled pending C.

Standing-line additions, exactly:

- LP-0 `recorded.routines`, between mon2 and mon8 in name order: `app.mon3_admit(uuid,text,uuid,jsonb)`, `app.mon3_audit(uuid,uuid,uuid,text,text,text)`, `app.mon3_owner(uuid,text)`, `app.mon3_record_card_fixture(uuid,text,uuid,jsonb)`, `app.mon3_request_card(uuid,text,uuid,jsonb)`. These five records are source-inspected declarations only, using the existing null `definitionSha256` convention. Actual migrated catalogue extraction remains a CI/reviewer hold; no digest or PostgreSQL execution is invented.
- Contractor entitlement upgrade's later-successor expected snapshot: only `app.trial_admission`, `app.trial_business_verification`, `app.trial_card_attempt`, `app.trial_card_result`, in name order, with empty initial rows. This is the only test edit. Its snapshot is a table-row snapshot; it has no later-routine catalogue expectation to extend.
- SERIOUS-B5 already has the exact four-table/five-routine `trialAdmissionAdditions` integration; tenancy already has all four table RLS/guard and owner rows in name order. Inspected and preserved, with no further edits.
- B's own `config/lanes/mon-3-p-b.json` now recognizes this exact catch-up branch and allows `packages/db/test/contractor-entitlement-upgrade.integration.test.ts`. All other shared files touched were already explicitly allowed. The legacy register is untouched; no allowance for main's unrelated files was added.

Environment: supplied dependencies, Node v24.17.0 and cached pinned pnpm 10.28.1; no install or dependency change. No core/DB `dist/index.d.ts` existed at the pre-build typecheck. Nothing was removed. An initial typecheck used cached pnpm at the top level but reached the ambient child pnpm wrapper and stalled; interrupted after 24 seconds (two cached tasks only, not a successful check). All subsequent pnpm commands used `/private/tmp/mon3pb-catchup-bin/pnpm`, a task-local wrapper for the installed cached 10.28.1 binary. Checks were sequential; Vitest used `--maxWorkers=2`. Observed one-minute load was below 20 before heavy checks; the unit runner checks load before each package and waits if over 20.

Actual final checks:

| Check | Result |
| --- | --- |
| `pnpm typecheck`, before any build | PASS, 7 tasks; core/DB dist absent |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1 at lane boundary after core purity PASS; in-progress merge counts main's staged files against B's lane |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1 for the same main-file range issue; requires post-commit dispatcher/CI rerun |
| `pnpm exec turbo run lint` | PASS, 7 package tasks |
| `node --test tools/*.test.mjs` | PASS, 295 tests |
| Config unit suite | PASS, 5 files / 86 tests |
| Storage unit suite | PASS, 1 file / 2 tests |
| Core unit suite | PASS, 127 files / 2,972 tests |
| AI unit suite, after build | PASS, 15 files / 147 tests; fixtures, no live model |
| DB source/test unit suite, excluding integrations and dist | Exit 1: 49 files / 429 tests pass; only `test/free-port.test.ts` fails its two tests with localhost `listen EPERM` |
| API source unit suite, excluding integrations and dist | Exit 1: 124 files / 2,495 tests pass, 23 skipped; 9 files / 129 tests fail with 129 server-bind `listen EPERM` errors |
| Web unit suite | PASS, 42 files / 998 tests |
| `pnpm build` | PASS, all 7 tasks, including Next production build |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC socket `listen EPERM` |
| From apps/api: `node --import tsx src/generate-openapi.ts --check` | PASS, same generator/check via direct loader; no OpenAPI diff |
| LP-0 `parseInventory` and `pathCompleteness` via direct tsx loader | PASS, no path problems; source validation only |
| `node tools/money-arithmetic-lint.mjs` | PASS |
| `node tools/commercial-boundary-lint.mjs` | PASS |

Unit invocation: each package ran `pnpm exec vitest run --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude 'e2e/**'`; the final DB/API source runs additionally excluded `**/dist/**`. All package runs were serial. The required pre-build AI/DB/API/web unit attempts failed on missing runtime dist imports (and the known bind restriction); those results are not passes. The first broad post-build DB/API attempts additionally discovered emitted dist test copies, causing duplicate execution and invalid source-path assertions. Corrected final source-only retries above replace those broad counts; no source, test expectations or configuration changed to obtain them. Root aggregate `pnpm test` was not used because it includes actual PostgreSQL suites; unit checks are reported separately.

Detailed logs are in `/private/tmp/mon3pb-catchup-*.log`; final unit logs use `source-unit-packages-db`, `source-unit-apps-api`, `postbuild-unit-packages-ai`, `postbuild-unit-apps-web`, and the original `unit-` prefix for tools/config/storage/core. Turbo cache IO warnings did not prevent the final seven-task checks from succeeding. No clean-install, live integration, model review or acceptance claim is made.

PostgreSQL/DB integration, migration/upgrade/tenancy/LP-0 authority paths and browser suites were NOT RUN, per dispatcher environment instructions. GitHub CI/reviewer must execute them, capture actual protection records and rerun range checks after the dispatcher stages/commits. No git-writing command, commit, push, provider action, browser run, subagent or independent verdict was performed. Git's index still marks the three files unmerged until the dispatcher stages the resolved working files. All original C/commercial/release gates remain holds.

Final source/lane/conflict verification and intended commit message follow below.

Final verification: PASS for B's six exact touched paths using the actual lane policy and `lanePathAllowed` (zero violations; separate from the failed official range check). AST inspection of typechecked src import/export/dynamic-import declarations found zero forbidden core/DB dist imports; test fixture strings were not treated as executable imports. `git diff --check` passed and the raw hidden-file-aware opening-marker grep found only pre-existing quoted command patterns in historical verdicts, not unresolved conflicts. The anchored opening/separator/closing marker-line scan found no unresolved markers outside Git/dependencies/build output. Intended commit subject/body: `/private/tmp/jg-msg-mon-3-p-b-catchup.txt`. Dispatcher owns staging, commit and CI; this catch-up remains unaccepted pending exact-commit review.

## Catch-up 2 — C261 final catch-up, 25 October 2026

```yaml
session:
  order: MON-3-P-B-CATCHUP
  catch_up: 2_of_2_last
  date: 2026-10-25
  builder: Codex
  model: gpt-6.1-sol
  reasoning_effort: medium
  session_id: 01a173c3-1af3-7791-bcec-984d2b202f16
  branch: codex/sandbox/mon-3-p-b-catchup
  builder_head: 1f73a07c13591e3ae5e479f1c87b337b0f1356ce
  merged_main: 5bcd5ede90b84afbb7d1924d91c015dc07d7bd32
  delivery: working_tree_only
  independent_verdict: pending_exact_dispatcher_commit
```

Model/effort were read from this session's actual local rollout `turn_context`. This is a builder run receipt, not an independent verdict or acceptance. The order reports acceptance of catch-up 1 at 1f73a07c; that does not accept this merge result. Read repository AGENTS.md, applicable BUILD_PLAN build-loop/inherited criteria/MON-3 card, persistence contract, B lane and the affected catalogue/upgrade sources. The standing catalogue instruction was supplied in this order; the named standalone file was not found in this checkout or the main checkout's `jg-orders` path. No missing-file content is inferred.

Resolved the sole remaining working-file conflict in `packages/db/test/contractor-entitlement-upgrade.integration.test.ts`: retained main's `app.job_small_trip_event` and `app.job_small_trip_observation`, followed by B's `app.trial_admission`, `app.trial_business_verification`, `app.trial_card_attempt` and `app.trial_card_result`, in table-name order. Main's exact 0208 `mon1_capture_small_trip` routine assertion remains intact. This is the only test file edited; no existing assertion was removed or weakened. B's per-file lane already allows this file and this receipt, so no lane edit or legacy-register edit was necessary.

Source verification: both core/DB barrels retain all export lines from HEAD and MERGE_HEAD. Migration `0206_free_first_job_admission.sql` is byte-identical to HEAD and keeps its reserved number; main's 0208 remains intact. LP-0 recorded routines, SERIOUS-B5's four-table/five-routine additions and tenancy's four-table guard/owner additions are already present. Those three automatically merged files are byte-identical to their stage-0 index versions and were not edited here. An AST walk of all 743 TS/TSX files under package/app src found zero actual import/export/require/import-type/dynamic-import references to relative core/DB dist paths; quoted adversarial fixture text is not an import.

Environment: existing dependencies, Node v24.17.0, cached pinned pnpm 10.28.1 through `/private/tmp/mon3pb-catchup-bin/pnpm`; no install or download. Core/DB dist declarations already existed from catch-up 1. Nothing was removed; `pnpm typecheck` ran before any build in this session. This proves the pre-build check with existing outputs, not a fresh no-dist environment. Checks ran one at a time; one-minute load stayed below 20 at observed checkpoints and the unit runner waits while above 20. All Vitest invocations used `--maxWorkers=2`.

| Check | Actual result |
| --- | --- |
| `pnpm typecheck`, before any build | PASS, 7 tasks (2 cached) |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1: core purity passed (240 TS files), lane boundary attributes incoming main files to B during the unresolved-index merge |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1: same incoming-main range issue; no unrelated lane permissions added |
| `pnpm exec turbo run lint` | PASS, 7 package tasks (2 cached) |
| `node --test tools/*.test.mjs` | PASS, 295 tests |
| Config units | PASS, 5 files / 86 tests |
| Storage units | PASS, 1 file / 2 tests |
| Core units | PASS, 130 files / 3,011 tests |
| AI units | PASS, 15 files / 147 tests; fixture-only, no live model |
| DB units | Exit 1: 49 files / 429 tests passed; `test/free-port.test.ts` has 2 localhost-bind `listen EPERM` failures |
| API units | Exit 1: 124 files / 2,495 tests passed, 23 skipped; 9 files / 129 tests failed, with 129 server-bind `listen EPERM` errors (also two exhausted-port diagnostics) |
| Web units | PASS, 42 files / 998 tests |
| `pnpm build` | PASS, all 7 tasks (2 cached), including Next production build |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC socket `listen EPERM` |
| From apps/api: `node --import tsx src/generate-openapi.ts --check` | PASS, same check through direct loader; no generated change |

Exact unit invocation per package: `pnpm --dir <package> exec vitest run --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/dist/**' --exclude 'e2e/**'`. Tools ran separately before packages. The temporary Python orchestration script initially had a syntax error and executed no checks; corrected before starting the serial run. The final runner and results are `/private/tmp/mon3pb-catchup2-units.py` and `mon3pb-catchup2-unit-results.json`. Logs: `/private/tmp/mon3pb-catchup2-*.log`. Turbo emitted cache IO permission warnings but completed its seven-task typecheck/package-lint/build runs successfully. Existing installed outputs were used by unit runtime imports; no clean install or no-dist test execution is claimed.

Final exact comparison confirms the resolved test equals main's stage-3 source plus only the four B table expectation lines. B's two catch-up-2 paths are already allowed in its per-file lane. `git diff --check` passes. The hidden-file-aware anchored conflict-marker scan finds zero opening/separator/closing marker lines outside Git/dependency/build directories; raw `rg '<<<<<<<'` finds only pre-existing quoted historical command text. No conflict markers remain in working source. The unmerged index entry remains for the dispatcher to stage.

No new migration, product behavior, permission, operational alert, backwards-compatibility change or release authority is introduced. Admission stays disabled pending C. DB integrations, real PostgreSQL catalogue/grant/RLS checks, migration upgrades and browser suites were NOT RUN under the dispatcher's sandbox instruction; the root aggregate `pnpm test` includes PostgreSQL and was replaced here by the explicitly reported unit selections, not claimed as passed. CI/reviewer must run those suites, extract actual protection records and rerun official lane checks after the dispatcher commits. All original C, commercial and real-data release holds persist. No new independent verdict or technical acceptance is claimed.

Intended conventional commit subject/body is written to `/private/tmp/jg-msg-mon-3-p-b-catchup.txt`. No direct Git-writing command, package download, push, provider call, deployment, browser run or subagent was performed. Dispatcher owns staging, commit and CI; independent review/acceptance must bind to that resulting exact commit.
