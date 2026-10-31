# MON-3C-ELIG builder receipt

```yaml
session:
  order: MON-3C-ELIG
  date: 2026-10-25
  builder: Codex
  model: GPT-6
  branch: codex/sandbox/mon-3c-elig
  dependency_head: 1f73a07c13591e3ae5e479f1c87b337b0f1356ce
  disposition: DEPENDENCY-BOUND
  review: "one independent check (JobGuard fast lane)"
  independent_verdict: NOT_RUN
  acceptance: NOT_GIVEN
```

This builder receipt reports the final working-tree candidate; it is not a verdict
or acceptance. Admission stays disabled. Exact-commit review, CI and separate
acceptance remain required; no subagent or independent model was invoked.

Final builder disposition: source delivered for review; **HOLD / DEPENDENCY-BOUND**,
not accepted and not a declaration that all ELIG criteria passed. This worktree
remains on the dispatched B head above. Observed `origin/main` at final inspection:
`01f040d6a714ef1a7b12606e648a33624428b246`. The dispatcher creates the commit;
no git-writing command, commit, push, merge or deployment was performed here.
The model identity supplied to this session is GPT-6 (Codex); a more specific
serving-model identifier was not exposed. No independent model verdict is claimed.

Read authority: repository AGENTS.md, BUILD_PLAN MON-3 and §10.1.7 context;
the full ELIG card at lines 1810 onwards of the issued corrected six-leaf draft;
accepted P0 contract via `git show 05feb4fb:docs/contracts/free-first-job-lifecycle-v1.md`;
`/Users/benharwood/.local/share/full-steam/jg-orders/STANDING-MIGRATION-CATALOGUE-LINE.txt`;
B's actual migration/repositories/fixtures and its catch-up receipt; A's key SQL,
MON-1 persisted session/SSO authority and existing quote/party/track/work-state sources.
The first attempted standing-file path under `/Users/benharwood/jg-orders` did not
exist; the actual instruction above was found and read before shared edits.

Delivered: `FreeFirstJobEligibilityRepository.read(context,digest,jobId)` with
strict `trial-eligibility-read.v1`, its type/schema exported through the DB barrel,
reserved migration 0236 and same-stem note, owned integration/upgrade tests and
own lane file. SQL derives the owner from B's persisted synthetic session/SSO
check, renews authority before disclosure, refuses shared-practice targets and
uses the same `42501 / FREE_FIRST_JOB_ACCESS_DENIED` for undisclosed targets and
authority failures. The company reader has no practice flag or transport.

No table or identity store was added. B's four immutable FORCE-RLS tables remain
the identity/card authority. Only completed results joined to that business and
its attempt qualify; redirects, requests, cancelled, failed and unknown outcomes
do not. Existing exact accepted document/version/hash, latest acceptance, price/tax,
current party snapshot, provenance, activation/legacy/pilot/work history and lock
facts are checked. Second-job card requirements count distinct activations, never
meter places or job value. Responses expose only safe codes and opaque source IDs;
no identity tuple, phone, number, provider reference/fingerprint or other tenant ID.

**Explicit unavailable facts, not inferred policy:**

- A's key table enforces global uniqueness but its FORCE-RLS policy permits only
  tenant-local reads. B supplies no authorized global read helper. The new reader
  checks every available local company and phone/card tuple using A's exact bytes,
  always reports `KEY_CHECK_UNAVAILABLE`, and never returns an eligible entitlement.
  Foreign-key-claim worlds have identical advisory results. No key insertion is
  used as a probe, and no A policy, role or helper is broadened. Positive global
  eligibility (ELIG-01/04) remains held pending an issued checked source seam.
- Fresh pre-activation jobs may have no commercial-track row. That is
  `SUPPORTED_TRACK_UNAVAILABLE`, never an assumed small-builder synthetic fact.
  Missing identity/terms remain typed held facts. No replacement/merge continuity
  rule or unverified identity state was invented.
- `offerSkip` is only a prospective first-card offer on an otherwise exact fresh
  target with sufficient verified identity. It confers neither entitlement nor
  activation authority. Terms/key holds remain present, including on that offer.
- B's exact acceptance/merge, accepted CH-4 handoff, practice authority and all
  lifecycle/enablement/release holds remain outstanding evidence, not faked passes.

Migration is additive and transactional. One new routine:
`app.mon3_read_eligibility(uuid,text,uuid)`, SECURITY DEFINER, pinned
`search_path=pg_catalog`, owned by migration, runtime EXECUTE only (plus owner).
Inherited default EXECUTEs and PUBLIC are revoked. No table/column/backfill,
commercial write, receipt, audit event, provider call, admission or key claim is
created by the reader. The 0206 SQL and activation repository are unchanged.
Existing business RLS, global key uniqueness and hard admission refusal remain.
Fix forward additively after installation; preserve original immutable rows/keys.
No new operational alert, fee, money arithmetic, retention policy or data deletion.

Shared integration, all explicitly in `config/lanes/mon-3c-elig.json`:

- DB barrel: one new eligibility export.
- LP-0: one `recorded.routines` row for the exact signature above, empty static
  writes and calls to `app.final_lock_hash` / `app.mon3_owner`; source-inspected
  `definitionSha256: null`, never a fabricated database hash. Added the two exact
  runtime-EXECUTE/owner entries and own read-access group/authority path. No new
  `recorded.tables` row because there is no new table.
- SERIOUS-B5: exactly `mon3_read_eligibility` as an additive routine, inserted
  using the existing server-catalog ordering helper; all predecessor comparisons retained.
- Contractor entitlement upgrade: the exact new routine-name expectation after
  successors; existing predecessor/table expectations retained.
- Tenancy: exact new routine row asserting owner, SECURITY DEFINER/search path,
  runtime EXECUTE and no infrastructure/PUBLIC EXECUTE. No new table expectation.

These shared catalogue/barrel hunks serialize with sibling integration work.
No lane register, migration runner/list, historical SQL, package pin, auth bridge,
quote/fee implementation or API/OpenAPI file was edited. Working tree has 12
owned/assigned files and zero own allowlist violations.

Actual checks, one at a time from the issued worktree, unless stated otherwise:

All heavy commands used `HEAVY_SLOTS=1 /Users/benharwood/.local/bin/heavy-slot
jg-mon3c-elig-<label> <command>`. Load observations remained below 20; free disk
was above 45 GiB (about 60–63 GiB), and observed free memory was 50–57%.
The existing wrapper emitted sandbox `sysctl`/`ps` permission diagnostics but
waited for its shared slot and propagated the child results. No wrapper was
replaced. Node v24.17.0, TypeScript 5.8.3, Vitest 4.1.12. Pnpm was the already
cached pinned 10.28.1, exposed by a task-local `/private/tmp/mon3c-elig-bin/pnpm`
shim; no download, install or lockfile change. No clean-install claim.

| Actual command (slot prefix omitted) | Result |
| --- | --- |
| `pnpm typecheck` before any workspace `dist` directory existed | Exit 0; 7 tasks successful, 4 unchanged tasks cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1 at lane range: inherited unmerged B paths belong to B, not ELIG. Core purity passed. No allowance widened to hide this. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1 for the same dependency range; official range lint remains DEPENDENCY-BOUND. |
| `pnpm exec turbo run lint` | Exit 0; all 7 package compiler/lint tasks, 4 cached. This does not replace the failed root lane gate. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/free-first-job-eligibility.integration.test.ts -t source-only` | Final exit 0; 4 source-only tests. 9 PostgreSQL scenarios deselected and NOT RUN, not database passes. |
| DB Vitest, `src/free-first-job-repository.test.ts src/free-first-job-card-repository.test.ts --maxWorkers=2` | Exit 0; 7 B adapter/protocol tests. |
| DB Vitest, `src/migrate-discovery.test.ts test/lp-0-catalog.test.ts --maxWorkers=2` | Exit 0; 29 source-only migration-discovery/comparator tests; no PostgreSQL. |
| Core Vitest, `src/free-first-job-persistence.test.ts src/free-first-job-keys.test.ts src/free-first-job.test.ts --maxWorkers=2` | Exit 0; 20 tests. |
| API Vitest, `src/free-first-job.application.test.ts src/free-first-job-card.adapter.test.ts --maxWorkers=2` | Exit 0; 14 synthetic unit tests, not a live provider integration. |
| `pnpm build` | Exit 0; 7 tasks successful, 4 cached; DB/API compiled and Next production build completed. Existing CSS/file-type/workspace-root warnings and cache-write permission warnings remain. |
| `pnpm openapi:check` | Exit 1 before generator execution: tsx CLI IPC `listen EPERM`. |
| `node --import tsx src/generate-openapi.ts --check`, cwd `apps/api` | Exit 0; same generator through direct loader, no listener, no OpenAPI diff. |
| `node tools/money-arithmetic-lint.mjs`; then `node tools/commercial-boundary-lint.mjs` | Each exit 0. |
| Working-tree-only lane API check over `git status --porcelain --untracked-files=all -z` | Exit 0; 12 paths, zero violations. Explicitly not official range-lint evidence. |
| Actual inventory `parseInventory` + `pathCompleteness`, with real file-exists callback | Exit 0; one exact own routine row, zero problems. Source inventory only, not live grants. |
| Strict no-emit compilation of the two owned DB tests and three changed shared suites using the root strict settings | Exit 2, only unchanged `packages/db/test/job-work-state-fixtures.ts:45:107`: TS2322, `string | undefined` assigned to `string`. |
| The same strict compiler against **only that unchanged baseline fixture** | Exit 2 with the identical error. No source/test setting weakened or predecessor file edited. |

Final distinct passing local assertions: **74** (4 own source + 7 B + 29 migration/
comparator + 20 core + 14 API). Root `pnpm test`, DB/migration/browser/restore
and live-model suites were NOT RUN. The issued draft forbids broad local batches;
root test's nested Node invocation also lacks the required explicit concurrency.
Complete required CI remains mandatory, rather than substituted by these batches.
No prompt/model/extraction behavior changed; no live/paid evaluation authorized.

Early source-only runs used a temporary Vitest configuration that spread the
existing DB config and added exact `@jobguard/core` / `@jobguard/storage` aliases
to their source barrels, enabling no-dist tests. It changed no repository runner.
Final source-only command above uses the normal DB config after build. The first
source mutation run failed because a short phone/card fragment appeared twice;
the mutation target was changed to the unique identity expression, and subsequent
runs passed. Initial strict test compilation caught two own tuple/UUID inference
errors, which were corrected; final compilation reports only the reproduced
baseline fixture error above. No PostgreSQL or socket test was attempted.

Mutation evidence (builder deterministic checks, not an independent verdict):

- The source-only schema test changes admission/key/target authority, injects
  identity fields and unknown source fields, removes held reasons, and makes
  card/identity/skip states contradictory: each is rejected.
- Repository protocol tests mutate environment before connection, during
  connection and after SQL return; invalid digest/job input, unauthorized errors,
  unexpected output fields and wrong-target output refuse, with rollback where
  a transaction began. B's unexpected-success rollback/hard-stop tests also pass.
- The SQL source test removes each of 24 guard/privilege fragments independently
  and checks that its structural guard assertion fails. These cover G01/G11
  persisted owner checks, G02 undisclosed targets/practice, G03 import provenance,
  G04 historical reopen, G05 track/mode, G06 exact parties, G07 completed
  same-business card, G08 sufficient identity, G09 second card, G10 local/all-key
  unavailability/status, G12 terms, G13 owner/ACL/search path and G14 normalized
  errors. **This proves source presence/removal sensitivity, not behavioral SQL
  mutation execution.** Actual guard/RLS/grant behavior and upgrade damage controls
  remain CI-only. No claim that local string assertions prove database security.

Acceptance mapping / remaining evidence:

| ID | Owned test/evidence boundary |
| --- | --- |
| ELIG-01 | Private exact source fixture offers first skip but remains key/terms unavailable. Positive globally eligible result HELD; no executable trial claimed. |
| ELIG-02 | Authored PostgreSQL fixtures for imported, pilot, historical activation and reopening refusal. NOT RUN. |
| ELIG-03 | Missing exact quote, changed saved quote hash and stale current-party source refusal; source fragments and typed output locally checked. Actual SQL NOT RUN. |
| ELIG-04 | Authored local phone/card collision plus identical before/after foreign claim world, zero own key writes. NOT RUN; affirmative global-clear read remains unavailable. |
| ELIG-05 | Missing/phone-only identity and no-key-consumption scenarios. B has no identity replacement operation; continuity semantics stay held, not guessed. SQL NOT RUN. |
| ELIG-06 | Exact private target first-only offer, phone-only refusal, typed advisory-only output. Source schema tests executed; SQL NOT RUN. |
| ELIG-07 | Distinct prior activation requires card independent of meter/place; no meter input to the reader. SQL NOT RUN. |
| ELIG-08 | Requested/redirect/cancelled/failed/unknown/completed and foreign completion scenarios. SQL NOT RUN. |
| ELIG-09 | Direct SQL tenant/session/admin/expired/revoked authority refusals and safe error code; inherited B lock/replay/SSO regression suites remain mandatory. SQL NOT RUN. |
| ELIG-10 | Shared-company requests refused and foreign sessions/completions isolated. No accepted practice reader; positive practice support HELD. SQL NOT RUN. |
| ELIG-11 | Own-step upgrade populates predecessor rows, captures named columns/types/PK identity and routine definitions/ACLs, applies 0236 alone and successors twice, with microsecond/type/delete damage controls and compatible-addition controls. Actual PostgreSQL/catalogue/indirect-role proof NOT RUN. |
| ELIG-12 | B's 7 adapter tests locally pass; SQL refusal/zero-effects assertion authored. Full B admission/authority/race/upgrade/key/card regression suites remain required CI evidence. |

The exact-target test installs fictional predecessor quote/party source rows
under migration-owner trigger bypass, like A's private FK-parent fixtures.
No asserted runtime trial end/activation is seeded or claimed; the new reader,
B card routine and A key-claim checks run with their normal protection when the
CI scenarios execute. These are private foundation tests, never an end-to-end
activation journey. The upgrade test runs on migration-owned fixtures; the fresh
integration test separately uses a non-owner runtime login.

Reviewer/CI commands (NOT RUN here; batches each <=3 named files):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/free-first-job-eligibility.integration.test.ts test/free-first-job-eligibility-upgrade.integration.test.ts test/free-first-job-keys.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/free-first-job-keys-races.integration.test.ts test/free-first-job-keys-security.integration.test.ts test/free-first-job-keys-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/activation.integration.test.ts test/job-activation-terms.integration.test.ts test/practice-session.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/free-first-job-admission.integration.test.ts test/free-first-job-admission-authority.integration.test.ts test/free-first-job-admission-races.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/free-first-job-admission-upgrade.integration.test.ts test/free-first-job-card-persistence.integration.test.ts test/lp-0-authority-paths.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/serious-b5-upgrade.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts test/tenancy.integration.test.ts
```

Required full CI, actual routine protection capture, exact-commit independent
check, separate acceptance and founder merge remain outstanding. No CI URL or
verdict was invented. Admission/live/provider/charging remain disabled. Discovered
later: authorize a global key-read seam and authoritative pre-activation track
source; resolve the unchanged fixture type error in its owning lane; compose
practice, lifecycle, capacity and billing only under their separate issued orders.
These holds are recorded here rather than editing the coordinator's shared plan.

Final handoff inspection corrected an invalid draft practice fault fixture: the
schema forbids practice ownership on a normal-company row, so the owned scenario
uses the checked shared-company denial instead of violating that constraint.
The final owned stale-source scenario also explicitly damages the saved quote
hash after restoring the party pointer. Upgrade grant damage controls check that
the deny-grant assertion fails, and compatible later-row insertion remains valid.
Final `git diff --check` exited 0. Intended message exists at
`/private/tmp/jg-msg-mon-3c-elig.txt`; the dispatcher must commit and obtain review.


## Round 2 — C250 repair round 1 of 2, 25 October 2026

```yaml
session:
  order: MON-3C-ELIG
  round: 2
  repair_round: 1
  date: 2026-10-25
  builder: Codex
  model: GPT-6
  model_identifier_evidence: "Session instructions identify GPT-6; no more specific serving-model identifier is exposed."
  branch: codex/sandbox/mon-3c-elig
  candidate_under_repair: 7d5c784a
  catchup_merge_head: 0b523164
  disposition: HOLD_PENDING_CI_AND_INDEPENDENT_REVIEW
  independent_verdict: NOT_RUN
  acceptance: NOT_GIVEN
```

This section supersedes round 1's dependency-head statement for this handoff.
The dispatcher had already started merging B's final catch-up 0b523164
(B 1f73a07c plus main 5bcd5ede). Only the issued contract repair, the one
working-file conflict resolution and this receipt were changed in this round.
No git-writing command was run; the index remains unmerged until the dispatcher
stages the resolved file and commits. No subagent or independent review was run.

LP0-17 repair is confined to `lp-0-effective-privileges-v1.json`: the advisory
group now uses `helper`, the inventory's existing classification for read-only
helper/predicate routines (including read-only SECURITY DEFINER functions).
It remains advisory with no commercial authority. Its authority-path entry is
immediately after `ap-mon3pb-disabled-foundation`, preserving B as the first
path so the existing first-path-removal negative control still detects a missing
authority path. No test was modified for the repair; the LP-0 test is unchanged.

The contractor-entitlement upgrade conflict retains main's 0208 table rows
`app.job_small_trip_event` and `app.job_small_trip_observation`, B's four trial
foundation table rows, and both routine expectations: 0208
`mon1_capture_small_trip(t uuid, j uuid, source_kind text, source_id uuid)` then
0236 `mon3_read_eligibility(uuid,text,uuid)`. Existing predecessor assertions
remain. Migration 0236 and all round 1 implementation files are unchanged.
No new migration, privilege, external action, abstraction or `../../dist` import.

Checks use the already installed Node v24.17.0 and cached pinned pnpm 10.28.1
via `/private/tmp/mon3c-elig-bin/pnpm`; no install/download or clean-install claim.
Checks ran sequentially; every Vitest invocation uses `--maxWorkers=2`.
Workspace `dist` directories were moved to `/private/tmp/mon3c-elig-round2-dist`
for the pre-build typecheck and restored afterward for unit package resolution.


| Round 2 actual check | Result |
| --- | --- |
| `pnpm typecheck` with workspace dist absent | PASS, 7 tasks; 4 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1: core purity passes, then ELIG range includes inherited B paths outside ELIG's allowlist. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1: same dependency-range boundary failure; allowlist unchanged. |
| `pnpm exec turbo run lint` | PASS, 7 package tasks; 2 cached. Does not replace root range lint. |
| `node --test tools/*.test.mjs` (expanded file list) | PASS, 295 tests. |
| Config unit suite | PASS, 5 files / 86 tests. |
| Storage unit suite | PASS, 1 file / 2 tests. |
| Core unit suite | PASS, 130 files / 3,011 tests. |
| AI unit suite | PASS, 15 files / 147 fixture tests; no live model. |
| DB unit suite | Exit 1: 48 files pass / 428 tests pass; two free-port tests fail with localhost `listen EPERM`; one unchanged audit-checkpoint test times out at 5,000ms. |
| API unit suite | Exit 1: 124 files / 2,495 tests pass, 23 skipped; 9 files / 129 HTTP tests fail, with 129 server-bind `listen EPERM` errors. |
| Web unit suite | PASS, 42 files / 998 tests. |
| Isolated unchanged audit-checkpoint timeout retry | PASS, 1 test / 70 deselected; original timeout unchanged (test 4.94s). Initial timeout remains recorded. |

Unit command in each package: `pnpm exec vitest run --maxWorkers=2 --exclude
'**/*.integration.test.ts' --exclude 'e2e/**' --exclude '**/dist/**'`. Packages
ran serially in config/storage/core/AI/DB/API/web order. The isolated retry used
`pnpm --filter @jobguard/db exec vitest run --maxWorkers=2
src/audit-checkpoint-handoff.test.ts -t 'all transitive request workspace sources'`.
No implementation, test timeout, expected result or configuration changed for
these checks. Root aggregate `pnpm test` was not run: it includes PostgreSQL
suites, which the dispatcher explicitly assigns to CI in this sandbox.


| Remaining round 2 check | Result |
| --- | --- |
| `pnpm build` | PASS, 7 tasks; 3 cached. Existing Next/CSS/file-type/workspace-root and sandbox cache-IO warnings remain. |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC `listen EPERM` before generator execution. |
| From apps/api: `node --import tsx src/generate-openapi.ts --check` | PASS, same generator/check through direct loader; no OpenAPI diff. |
| `parseInventory` + `pathCompleteness` and explicit LP0-17 first-path-removal negative control via direct tsx loader | PASS, actual contract parsed, file references checked, helper kind and B/ELIG adjacency asserted; no PostgreSQL claim. |
| `node tools/money-arithmetic-lint.mjs` | PASS. |
| `node tools/commercial-boundary-lint.mjs` | PASS. |
| `git diff --check`; conflict-marker inspection | PASS; resolved working file contains no markers. Index remains unmerged pending dispatcher staging. |

An initial source-validator attempt from the repository root used `--import tsx`
and failed because tsx is installed under apps/api, not the root. The successful
retry used `--import ./apps/api/node_modules/tsx/dist/loader.mjs`; no dependency
was added. Logs: `/private/tmp/mon3c-elig-r2-*.log`.

Size: +122/−3 lines across 3 files; largest touched logic file: 52 lines; new abstractions: none.
Size counts cover this receipt and contract repair relative to the incoming
index, plus the conflict resolution relative to a1; unrelated staged catch-up
files are excluded. The large inventory is declarative content, not new logic.

Real PostgreSQL LP0-17, ELIG/upgrade/catalogue groups, mandatory database/migration
and browser suites remain NOT RUN locally under the dispatcher's restrictions.
The reviewer/CI must rerun them and official range lint after dispatcher handoff.
No exact-commit independent verdict or separate acceptance is claimed. All prior
admission, commercial and release holds remain. Intended conventional commit text
is `/private/tmp/jg-msg-mon-3c-elig.txt`; dispatcher stages and commits the merge.
