## Repair r12 — explicit fixture UUID casts (14 October 2026, dispatcher 5)

PR #189; task SV5PRE; branch `codex/sandbox/sv5pre`. First command `git rev-parse HEAD` returned the required head `4f4017ca1bf43d779c2c11dc560be37fcab92c9b`; initial working tree was clean. Working-tree repair only: no Git-writing command, commit, push, dependency install, database start, self-acceptance or independent verdict. Dispatcher owns the resulting commit and CI/verdict/acceptance loop. This section supersedes prior round status; historical receipts remain below.

Read AGENTS.md, BUILD_PLAN.md SV-4/SV-5 and §10.2.2–10.2.6, and `docs/contracts/sv5pre-completion-v1.md`. Read the supplied filtered CI log, including both failure bodies and duplicate GitHub annotations: `/Users/benharwood/.local/share/full-steam/jg-runs/sv5pre-ci-failed-38509757313.log`, **1,537 lines / 249,556 bytes**, SHA-256 `a88066f62ae88ac754adffa061fea94ba8e9df9f4684061253486978482768a6`. Run **38509757313 is RED**. DB: **2 failed / 141 passed files; 2 failed / 1,994 passed tests**. API: 77 files / 1,723 tests passed in that supplied run; this is evidence for 4f4017ca, not an r12 PostgreSQL rerun.

### Every failure in the supplied CI run

| File and failed test | Error and location | Repair |
| --- | --- | --- |
| `packages/db/test/sv5pre-completion-isolation.integration.test.ts` — `r8 zero and 25 hidden signals leave every non-shadow table byte-identical after authoritative completion` | PostgreSQL **42P08**, inconsistent types deduced for parameter `$3`, **text versus uuid**, statement position **219**; fixture INSERT at :26 via `asFixtureTenant` | Cast the upload ID occurrence to `$3::uuid`, retaining `$3::text` for the object key. |
| `packages/db/test/sv5pre-completion.integration.test.ts` — `SV5PRE authoritative completion > r11 concurrent evidence writers keep compatible live locks and exclude final locking until both commit` | Same **42P08** / `$3` / **text versus uuid**, position **157**; fixture INSERT at :203 | Same explicit upload ID cast. |

The duplicate error annotations repeat these same two failures. Root Turbo reports 12/13 successful tasks, failed `@jobguard/db#test`, and pnpm/process exit 1; those are consequences, not additional failed tests. A source extraction confirmed positions 219 and 157 point exactly to the uncast `$3` in those INSERTs.

The isolation fixture's immediately following evidence-object INSERT also reused `$4` as UUID `upload_id` and text `object_key`; it now uses `$4::uuid` for the former and retains `$4::text` for the latter. This companion cast prevents the same parse ambiguity after the first repaired statement executes. Only **three explicit casts across two piece-owned fixture tests** change. No repository SQL, production behavior, migration, grant, expected value, refusal, assertion, amount, hash, name or commercial policy changes. No merged test is edited.

Read-only preservation comparison reconstructs both original test files byte-for-byte by removing only the three casts. **411 other tracked test/spec files are byte-identical to HEAD.** The entire `apps/api/src/shadow-isolation.application.test.ts` is unchanged, including origin/main's original line 393 byte-for-byte; `apps/api/src/auth/context-boundary.test.ts` is byte-identical to HEAD and origin/main. Log: `/private/tmp/sv5pre-r12-preservation.log`.

### Commands actually executed

Preinstalled dependencies; Node **v24.17.0**, pinned pnpm **10.28.1** via existing `/private/tmp/sv5pre-r8-bin/pnpm` on PATH. No clean-install claim. The initial system `pnpm --version` hung after a package-manager warning and was interrupted (exit 130); the existing pinned launcher then returned 10.28.1. No package installation command was issued.

| Command | Exit / result | Log |
| --- | --- | --- |
| `pnpm typecheck` | 0; 7 successful tasks, 2 cached | `/private/tmp/sv5pre-r12-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | 0; 7 successful tasks, 2 cached | `/private/tmp/sv5pre-r12-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; SV5PRE scope passed | `/private/tmp/sv5pre-r12-lanes.log` |
| `pnpm build` | 0; 7 successful tasks, 2 cached | `/private/tmp/sv5pre-r12-build.log` |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 0; 2,456 tests / 82 files | `/private/tmp/sv5pre-r12-unit-core.log` |
| `pnpm --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage exec vitest run src --maxWorkers=1` | 0; 83 tests / 7 files | `/private/tmp/sv5pre-r12-unit-support.log` |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude '**/*.http.test.ts' --exclude src/final-account-lock.isolation.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/sv5pre-worker-execution.integration.test.ts --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts` | 0; 1,565 tests / 66 files | `/private/tmp/sv5pre-r12-unit-api.log` |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | 0; 814 tests / 34 files | `/private/tmp/sv5pre-r12-unit-web.log` |
| `pnpm --filter @jobguard/db exec vitest run test/recovery-case-join.test.ts test/site-extra-evidence-compatibility.test.ts test/recovery-message-repository.test.ts test/recovery-case-outcome.test.ts test/audit-api-capture.test.ts test/verify-audit-export-cli.test.ts test/contractor-session-context.test.ts test/verify-evidence-pack-cli.test.ts src --maxWorkers=1` | 0; 169 tests / 13 files | `/private/tmp/sv5pre-r12-unit-db.log` |
| `node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs` | 0; 19 tests | `/private/tmp/sv5pre-r12-unit-tools.log` |
| `pnpm openapi:check` | 1; sandbox denies tsx CLI IPC `listen EPERM` | `/private/tmp/sv5pre-r12-openapi.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; same OpenAPI comparison without CLI IPC | `/private/tmp/sv5pre-r12-openapi-node.log` |
| TypeScript program with db strict options/noEmit, both changed integration tests and imports | 0; zero diagnostics | `/private/tmp/sv5pre-r12-db-test-typecheck.log` |
| Read-only cast-only/protected-source comparison; `git diff --check`; final lane lint | 0; preservation, whitespace and final SV5PRE scope checks passed | `/private/tmp/sv5pre-r12-preservation.log`, `/private/tmp/sv5pre-r12-lanes-final.log` |

The OpenAPI wrapper's EPERM is the sandbox restriction, retained as a failed invocation; the actual comparison passes through the IPC-free entry point. Existing Turbo cache IO warnings and CSS/autoprefixer warnings remain. No test timeout, skip, expectation or CI requirement was changed.

NOT RUN: full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, PostgreSQL integration/worker/migration suites and browser suites because the dispatcher states this sandbox cannot bind localhost or start PostgreSQL. Root lane/train fixture unit tests write Git repositories and remain unexecuted under the no-Git-writes instruction; actual read-only lane lint ran. No model/prompt/parser or provider behavior changes, so no live-model/provider evaluation or native suite applies. GitHub CI after dispatcher commit/push must execute the mandatory full checks, both repaired PostgreSQL cases, previous isolation/upgrade/worker suites and applicable browser journeys. The cast repair is source-inspected and its fixtures typechecked; PostgreSQL success is not claimed locally.

Affected guarantees: preserve tenant-qualified evidence identities, concurrent-writer exclusion of final locking and authoritative-completion isolation (AGENTS §§5.1, 5.8, 5.13–5.14). No migration/backfill, backwards-compatibility change, new operational alert or external action. All independent exact-commit verdict, separate acceptance, SV-5 orchestration/reveal/disposition/catch, D12/D13 and real-data/production/release gates remain held. No task acceptance is claimed.

Intended conventional commit subject/body overwritten at `/private/tmp/jg-msg-sv5pre.txt`. Dispatcher commits after this turn; HEAD remains unchanged.

---

## Repair r11 — PostgreSQL replay and fixture prerequisites (14 October 2026, dispatcher 5)

PR #189; task SV5PRE; unchanged HEAD `889f3c50ed4a3dea079eeed2b06ffe00c1645081`, branch `codex/sandbox/sv5pre`. Working-tree repair only. No Git-writing command, dependency installation/download, commit, push, self-acceptance or independent verdict. Dispatcher owns commit/push and the exact-commit CI/verdict/acceptance loop. This section supersedes earlier round status; historical receipts remain below.

Read the supplied CI log in full, including failure bodies and duplicate annotations, using full-file and chunked/structured extraction: `/Users/benharwood/.local/share/full-steam/jg-runs/sv5pre-ci-failed-38504871752.log`, **3,085 lines / 436,731 bytes**, SHA-256 `81d982665429a2771ed0d875fac3cca3ea7ec8ef3d689211a09b5f964389a99d`. Run **38504871752 is RED**: DB **11 failed / 132 passed files; 53 failed / 1,937 passed / 2 skipped tests**, plus UIWIRE-11's setup failure. Root Turbo: 12/13 successful, `@jobguard/db#test` and pnpm exit 1. API 76 files / 1,721 tests pass, including all 22 shadow-isolation tests and three actual Graphile execution tests. Those are evidence for 889f3c5, not an r11 database rerun.

Re-read AGENTS, the receipt's current/historical orders, BUILD_PLAN SV-4/SV-5 and both final-account/completion contracts. SV5PRE explicitly closes the old final-issue path for new effects. The accepted completion guard remains on both invoice routines, including supplementary issue; no production legacy exception is introduced. No change to tenant checks, session authentication, invoice approval/revalidation, private proof names, schemas, manifest hashes or signal isolation.

### First actual failure in every file, and repair

| File | First error / location | Cause and repair |
| --- | --- | --- |
| UIWIRE-10 | First issue: 3D000, `publishFixtureCompletion` via `prepareInvoicePrerequisites` | `admin.options` omits database when its original caller relies on pg's default. Changing user to the temporary shadow login makes pg default database to that login name. No teardown caused these 22 missing-database failures. The piece-owned helper reads `current_database()` and specifies it on its new pool. |
| UIWIRE-11 | beforeAll: same 3D000 helper path | Same helper repair. Both unchanged test bodies were skipped after setup failed. |
| UIWIRE-12 | `projects partial, full and reversed receipts exactly without destroying history`: same 3D000 | Same helper repair; all 20 failures happened before receipt assertions. |
| command-replay-contract | `evidence.ts#beginUpload: parallel duplicates…`: deadlock at identity claim; finalize duplicate also deadlocks | Merged `requireLiveJob` holds SHARE on the job. 0147 upgraded to UPDATE at evidence insertion/update: one caller can hold the command lock and await another caller's SHARE, while that caller awaits the command lock. The piece trigger now takes compatible SHARE, held to commit. SHARE still excludes lock/freeze/publication's UPDATE. Merged repository and replay tests untouched. |
| practice-facts | `old-only job keeps all ordinary £120, £70 and £384 receipts…`: FORBIDDEN at `lock_final_account` line 10 | Direct legacy `transition_job` setup omits `job_activation`, so SH-1 never inserts a commercial track. Piece helper establishes the missing synthetic small-builder track with fixture provenance and ON CONFLICT DO NOTHING. It does not rewrite existing tracks, jobs, prices or snapshots. |
| practice-feed | `qualifies a builder-attested £384 receipt…`: same FORBIDDEN | Same setup repair, before the unchanged call. |
| recovery-case-terms-upgrade | T8: FORBIDDEN at `final_check_require_invoice_actor` line 11 | This fixture already owns a persisted practice session, but its unchanged invoice call receives an unscoped pool. Three setup-only additions import the existing scoped adapter and reassign the local seed parameter to that adapter with the already-issued digest. All original source lines/calls/assertions are retained. No no-digest production exception. |
| recovery-line-allocation | DW2/DW8/DW9 saved F4: FORBIDDEN at `lock_final_account` line 10 | Same missing track setup; helper carries the fixture's already-persisted digest into its lock setup. Existing invoice construction/call and all money/fraction expectations remain unchanged. |
| sv5pre-completion-isolation | first migrate in template DB: empty password, 28P01 | Installed pg deliberately makes `Pool.options.password` non-enumerable. Object spread lost it. Own clone setup explicitly supplies the existing fixture credential; no grant change. |
| sv5pre-legacy-invoice | PRE-Q4-02: permission denied for `final_account_lock` at shadow INSERT…SELECT | Shadow has INSERT on check facts but no SELECT on lock. Own setup reads the exact lock/cutoff with admin, then inserts those values as shadow. All refusal expectations retain their values. Its second failure requires the existing synthetic environment, now installed/restored in own suite setup. |
| watchdog | `rejects forged cross-job source links…`: 55000 instead of expected 42501 | The new alphabetically earlier trigger intercepted a real upload-ID mutation ahead of the merged immutable guard. 0147 now uses the merged 42501 for UPDATE identity mutations; the post-lock backdating INSERT refusal stays 55000. Merged test remains byte-identical. |

The 25 FORBIDDEN failures are **24 missing-track lock refusals plus one missing-session invoice refusal**. They are not tenant mismatch errors from `require_authoritative_final_check`, nor caused by private-table renaming. The two additional own legacy-test errors, watchdog error-code regression and UIWIRE-10 downstream TypeError are separately recorded. Diagnostic annotations duplicate the same failures, not extra tests.

### Every failure in the supplied run

**`packages/db/test/UIWIRE-11.integration.test.ts`** — 3D000 — nonexistent temporary-login-named database.

- suite setup (both test bodies skipped)

Skipped bodies: `approves one immutable signed credit and preserves its invoice`; `serializes available amount and rejects stale, wrong-job requests`.

**`packages/db/test/UIWIRE-10.integration.test.ts`** — first: 3D000; second: undefined invoice `parties_snapshot` after failed first test.

- UIWIRE-10 invoice issuance > issues once through the definer routine and keeps runtime mutation denied
- CH-3a corrections preserve issued invoice bytes, hashes and party revisions

**`packages/db/test/UIWIRE-12.integration.test.ts`** — 3D000 in new completion fixture setup for every listed test.

- UIWIRE-12 customer receipts > projects partial, full and reversed receipts exactly without destroying history
- UIWIRE-12 customer receipts > shows overpayment as customer credit, never negative debt or recovery eligibility
- UIWIRE-12 customer receipts > eight simultaneous retries return one payment, command and audit event
- UIWIRE-12 customer receipts > concurrent changed-payload reuse conflicts and cannot record two payments
- UIWIRE-12 customer receipts > concurrent reversal retries return one reversal and one audit event
- UIWIRE-12 customer receipts > rechecks membership before replay, rather than trusting an old successful command
- UIWIRE-12 customer receipts > does not let a different authorised owner claim another actor's idempotency key
- UIWIRE-12 customer receipts > rejects malformed direct SQL inputs {"amountPence":null}
- UIWIRE-12 customer receipts > rejects malformed direct SQL inputs {"amountPence":0}
- UIWIRE-12 customer receipts > rejects malformed direct SQL inputs {"amountPence":1000000000001}
- UIWIRE-12 customer receipts > rejects malformed direct SQL inputs {"method":null}
- UIWIRE-12 customer receipts > rejects malformed direct SQL inputs {"method":"bank_confirmed"}
- UIWIRE-12 customer receipts > rejects malformed direct SQL inputs {"reference":null}
- UIWIRE-12 customer receipts > rejects malformed direct SQL inputs {"reference":" "}
- UIWIRE-12 customer receipts > rejects malformed direct SQL inputs {"reference":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
- UIWIRE-12 customer receipts > rejects malformed direct SQL inputs {"paidOn":"infinity"}
- UIWIRE-12 customer receipts > rejects malformed direct SQL inputs {"paidOn":"-infinity"}
- UIWIRE-12 customer receipts > bounds cumulative active amounts instead of converting an overflowing numeric total
- UIWIRE-12 customer receipts > reads balances and history from the same snapshot during concurrent writes
- UIWIRE-12 customer receipts > keeps old invoice-unbound SQL unavailable and never expands runtime table grants

**`packages/db/test/command-replay-contract.integration.test.ts`** — deadlock detected (both tests).

- CH-2 replay contract for each watchdog_live_only command > evidence.ts#beginUpload: parallel duplicates of one command replay one result
- CH-2 replay contract for each watchdog_live_only command > evidence.ts#finalize: parallel duplicates of one command replay one result

**`packages/db/test/practice-facts.integration.test.ts`** — 42501 FORBIDDEN at `lock_final_account` line 10 (all ten).

- PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sandbox) > old-only job keeps all ordinary £120, £70 and £384 receipts in the merged view
- PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sandbox) > old-only job keeps every new example amount at once with main's receipt count and total
- PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sandbox) > ordinary £120 receipt stays merged beside the separate matched F18 £120 interest receipt
- PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sandbox) > new facts and their matched receipts leave every merged total and count unchanged
- PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sandbox) > receipt 1200000 matches only its exact settled unheld receipt fact and appears only in the new view
- PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sandbox) > receipt 1464000 matches only its exact settled unheld receipt fact and appears only in the new view
- PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sandbox) > receipt 12000 matches only its exact settled unheld receipt fact and appears only in the new view
- PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sandbox) > receipt 7000 matches only its exact settled unheld receipt fact and appears only in the new view
- raw SQL refuses wrong amount, hash, missing command, supplier match, and a non-synthetic environment; each transaction leaves zero new rows
- same-tenant wrong-job account, command and payment links fail composite foreign keys (23503)

**`packages/db/test/practice-feed.integration.test.ts`** — 42501 FORBIDDEN at `lock_final_account` line 10 (all six).

- M4-7-S real PostgreSQL practice feed > qualifies a builder-attested £384 receipt only once matched to a settled movement, never allocating anything
- M4-7-S real PostgreSQL practice feed > a duplicate that arrives after a match holds the receipt (history kept) until it is reconciled, then it qualifies again
- M4-7-S real PostgreSQL practice feed > refuses to match receipts of the wrong amount, a reversed receipt, a held duplicate, another job's receipt and a supplier refund
- M4-7-S real PostgreSQL practice feed > disconnect is durable, revokes consent, preserves every fact and refuses new ingestion, matches and a second disconnect
- M4-7-S real PostgreSQL practice feed > actual runtime SQL cannot forge facts > refuses a raw receipt match for a pending movement, a wrong amount, a reversed or foreign receipt and a duplicate
- M4-7-S real PostgreSQL practice feed > session ownership of a job is persisted before any connection > only the creation-time owner can register the feed: another session is refused before connection

**`packages/db/test/recovery-case-terms-upgrade.integration.test.ts`** — 42501 FORBIDDEN at `final_check_require_invoice_actor` line 11.

- [T8] private audit failure rolls back approval and dispatcher records, then the same command succeeds

**`packages/db/test/recovery-line-allocation.integration.test.ts`** — 42501 FORBIDDEN at `lock_final_account` line 10 (all eight).

- DW2/DW8/DW9: saved F4 stays 2000000/43; F4b becomes 80000/1 and API strings preserve the exact denominator
- DW8: split receipts and one combined receipt save equal exact summed net for each line
- DW7: persisted receipt time excludes a later line and refuses explicit attribution to it
- DW2/DW6: saved F6 uses explicit verified source even when pro-rata would give the catches value
- DW7: reliable explicit remittance naming a later line is refused before any saved allocation
- DW8: an unallocated partial refund reverses exact pro-rata amounts across the lines that receipt settled
- DW8: an item-specific refund reverses the named catch first with selected explicit source identity
- DW8: an item-specific credit reverses the named catch first with selected explicit source identity

**`packages/db/test/sv5pre-completion-isolation.integration.test.ts`** — 28P01 — empty password returned by client.

- r8 zero and 25 hidden signals leave every non-shadow table byte-identical after authoritative completion

**`packages/db/test/sv5pre-legacy-invoice.integration.test.ts`** — first: 42501 permission denied for `final_account_lock`; second: SYNTHETIC_MODE_REQUIRED.

- SV5PRE legacy final invoice gate > [PRE-Q4-02] both invoice paths enforce pending failed and uncertified completion
- SV5PRE legacy final invoice gate > [PRE-Q4-05] legacy replay rechecks persisted session expiry and session job access

**`packages/db/test/watchdog.integration.test.ts`** — expected unchanged 42501, received 55000 FINAL_CHECK_SOURCE_IDENTITY_CHANGED.

- CH-2 actual PostgreSQL enforcement > rejects forged cross-job source links, recovery exceptions, and direct finalisation

### Setup authority, preservation and regression coverage

The only merged test changed in r11 is `recovery-case-terms-upgrade.integration.test.ts`: exactly **three added setup lines**, removable to reconstruct HEAD byte-for-byte. Its established session is a required premise for current issuance; without carrying that digest the intentional no-digest refusal fires before the test reaches the audit rollback it exercises. This is the active order's allowed setup-only addition before an unchanged call, not a weakened authorization check. The reusable piece-owned helper additionally supplies missing track/digest/connection setup for unchanged earlier tests; no old migration is edited. UIWIRE-10/11/12, practice facts/feed, recovery-line-allocation and command replay bodies receive no r11 edits.

The whole `shadow-isolation.application.test.ts` is byte-identical to 889f3c5; origin/main's original line 393 (the public-table query, now line 400) is byte-for-byte intact with the previously accepted seven setup lines. `auth/context-boundary.test.ts` is untouched. No existing expected value, refusal, count, pinned name, fingerprint or hash changes. Read-only comparisons confirm every existing expectation line in changed own suites is retained, except equivalent PRE-Q4-02 fixture INSERT parameters replacing its unauthorized SELECT. Removing the one new race case reconstructs the entire existing completion suite. All 0147 GRANT/REVOKE lines are byte-identical to HEAD. Final preservation scan: **343 other tracked test files** byte-identical to HEAD; `/private/tmp/sv5pre-r11-preservation.log`.

One added piece-owned real-PostgreSQL race test places two runtime writers behind the actual merged live SHARE guard, inserts concurrently (the previous UPDATE upgrade cannot pass), and probes exclusive job locking with NOWAIT. Exclusive locking is refused while both writers hold and after only one commits; after both commit, locking and manifest freeze succeed and inventory contains both pending uploads. This preserves the exclusion needed for the frozen cutoff while proving compatible concurrent writers. The existing merged evidence duplicate tests and 23 completion cases retain all prior assertions. New race is TypeScript-checked, **not PostgreSQL-executed** locally.

A socket-free probe against the installed `pg` package confirms both connection bugs with actual `Pool`/`Client` options: omitted database resolves to the replaced login name; pool password is non-enumerable and disappears from spread; explicitly supplying database/password retains both. No connection was opened. This is client configuration evidence, not a PostgreSQL integration pass.

### Commands actually executed

Preinstalled dependencies; Node **v24.17.0**, pnpm **10.28.1** via existing `/private/tmp/sv5pre-r8-bin/pnpm` on PATH. No clean-install claim.

| Command | Result | Log |
| --- | --- | --- |
| `pnpm build` | 0; 7 tasks successful, 2 cached | `/private/tmp/sv5pre-r11-build.log` |
| `pnpm typecheck` | 0; 7 tasks successful, 2 cached | `/private/tmp/sv5pre-r11-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | 0; 7 tasks successful, 2 cached | `/private/tmp/sv5pre-r11-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (initial and final) | 0; SV5PRE scope passed | `/private/tmp/sv5pre-r11-lanes.log`, `/private/tmp/sv5pre-r11-lanes-final.log` |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 0; 2,456 tests / 82 files | `/private/tmp/sv5pre-r11-unit-core.log` |
| `pnpm --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage exec vitest run src --maxWorkers=1` | 0; 83 tests / 7 files | `/private/tmp/sv5pre-r11-unit-support.log` |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude '**/*.http.test.ts' --exclude src/final-account-lock.isolation.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/sv5pre-worker-execution.integration.test.ts --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts` | 0; 1,565 tests / 66 files | `/private/tmp/sv5pre-r11-unit-api.log` |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | 0; 814 tests / 34 files | `/private/tmp/sv5pre-r11-unit-web.log` |
| `pnpm --filter @jobguard/db exec vitest run test/recovery-case-join.test.ts test/site-extra-evidence-compatibility.test.ts test/recovery-message-repository.test.ts test/recovery-case-outcome.test.ts test/audit-api-capture.test.ts test/verify-audit-export-cli.test.ts test/contractor-session-context.test.ts test/verify-evidence-pack-cli.test.ts src --maxWorkers=1` | Initial 1; isolated same-command rerun 0, 169 tests / 13 files | `/private/tmp/sv5pre-r11-unit-db.log`, `/private/tmp/sv5pre-r11-unit-db-serial.log` |
| `node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs` | 0; 19 tests | `/private/tmp/sv5pre-r11-unit-tools.log` |
| `pnpm openapi:check` | 1; sandbox refuses tsx CLI IPC listen EPERM | `/private/tmp/sv5pre-r11-openapi.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; same actual OpenAPI comparison without CLI IPC | `/private/tmp/sv5pre-r11-openapi-node.log` |
| TypeScript program with db strict options/noEmit, all five changed test/helper paths plus imports | 0; zero diagnostics | `/private/tmp/sv5pre-r11-db-test-typecheck.log` |
| Installed pg option probe; read-only source/grant/expectation comparisons; `git diff --check` | 0 | Session output; preservation facts above |

The initial DB unit run had one existing scanner timeout: `src/audit-checkpoint-handoff.test.ts` — `[C-OPS-1] all transitive request workspace sources and package entry targets cannot reach the operator`, 5,972 ms versus its unchanged 5-second limit; 168 tests passed / one failed. Isolated rerun of the **same whole command** passes all 169 (13 files). No test, timeout or scanner source was changed. All other local tests passed on their first invocation. Existing sandbox Turbo cache IO warnings and build CSS/autoprefixer warnings remain; no warning waived a check.

NOT RUN: full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, PostgreSQL integration/worker races and browser suites. Dispatcher states this sandbox cannot bind localhost or start PostgreSQL. Root lane/train fixture tests write Git repositories and are excluded locally under the explicit no-Git-writes order; actual read-only lane lint ran. No repository script, test, skip or CI requirement is weakened. No prompt/model/schema extraction change or live provider/model/native check applies.

### Migration, review and dispatch hold

Only unmerged 0147 changes, in place as authorized. Its evidence writer lock mode and UPDATE identity refusal are repaired; all six private/public proof tables, owner roles, grants, trigger names, version values and existing invoice routines retain their contracts. No backfill or stored-history change. Future deployed repairs remain additive forward fixes, with issuance kept fail-closed. Shared overlap is limited to the piece-owned 0147 evidence trigger and explicit fixture setup; do not parallelize another edit to those files.

Affected invariants: AGENTS §§5.1, 5.3–5.4, 5.8, 5.13–5.14. No fee entitlement, commercial-policy approval, provider action, new operational alert or UI release. Source inspection and local socket-free execution do not prove actual PostgreSQL races/privileges or independent verification. All mandatory CI, migration, actual worker, isolation/upgrade and browser checks remain owed at the dispatcher's resulting commit, followed by a different-model exact-commit verdict and separate acceptance. SV-5 orchestration/reveal/disposition/catches and D12/D13/real-data/production gates remain held. No task acceptance is claimed.

Intended conventional commit subject/body overwritten at `/private/tmp/jg-msg-sv5pre.txt`. Dispatcher commits the work after this turn; HEAD has not changed.

Changed non-receipt SHA-256 values:

- `docs/contracts/sv5pre-completion-v1.md`: `86a7dd77d6858b3981a4fd32055deb1d12b6bc0abefa615c2ea27474242c21b2`
- `packages/db/migrations/0199_final_check_prerequisites.sql`: `7288421289036e015b99cca45c51ed0844348d7f847b47ff62abbfcebabc9c0e`
- `packages/db/test/recovery-case-terms-upgrade.integration.test.ts`: `c0085502f1e6ee1409dcfeb1b035ff4d8e2d6b6cabbe5cfc7d6479d544fe53d7`
- `packages/db/test/sv5pre-completion-isolation.integration.test.ts`: `d895d724492e93a1e59919024840e1d765567917d048965babd0f2c463201fb8`
- `packages/db/test/sv5pre-completion.integration.test.ts`: `893f6f3b1e594ab486355abd144fabf5f5ec3a2e65fbbb6bd09c3d0cf1f04ff1`
- `packages/db/test/sv5pre-fixtures.ts`: `5f0ac8bb917bd4df3f421fdc4f7bcc1c61c0a047a4b8a954e946f01ed49a837a`
- `packages/db/test/sv5pre-legacy-invoice.integration.test.ts`: `6a9faff4a0c4258117ef00aa2accf9dba14288ef81769701cc4e1b56caed2c60`

---

## Repair r9 — migration parser repair (14 October 2026, dispatcher 5)

PR #189; dispatch head `c335f3c`; local HEAD is `b70cd18cc58d62eb71091ad7433d449f882eac5c` on `codex/sandbox/sv5pre`. Git state was not changed. Read-only comparison confirms migration 0147 is byte-identical at those two commits before this repair. Local checks below cover the existing worktree, not the merged dispatch head. No independent verdict or acceptance is claimed.

At `packages/db/migrations/0199_final_check_prerequisites.sql:139`, `guard_final_check_attempt` used `IF NEW.version IS DISTINCT FROM CASE ... THEN ... END THEN`. The PL/pgSQL condition reader terminates at the first unparenthesized THEN, passing an incomplete CASE expression to the SQL parser. PostgreSQL's reported position 15611 lands on this condition. Parenthesized the SQL CASE expression: `IS DISTINCT FROM (CASE ... END) THEN`. Exactly two parentheses are the only code change. Version selection, refusal codes, evidence/completion gates, grants, policies, money, fingerprints and expected values retain their semantics.

Re-read all 14 function bodies and both DO blocks for dollar-quote delimiters, BEGIN/END, IF/END IF, LOOP/END LOOP, CASE/END and parentheses. All 32 dollar-quote delimiters pair; a local structural scan confirms balanced blocks/parentheses. The other six CASE expressions occur in the two invoice SQL queries and are balanced; none is another ungrouped IF condition. This is source/structure evidence, not PostgreSQL syntax execution. Log: `/private/tmp/sv5pre-r9-sql-review.log`.

Every existing test file is untouched. The complete `apps/api/src/shadow-isolation.application.test.ts` (including accepted setup and line 393) and `apps/api/src/auth/context-boundary.test.ts` match both local HEAD and dispatched `c335f3c` byte-for-byte. No existing expected value, refusal, count, pinned name, fingerprint or hash was edited. Existing full-chain migration tests already exercise the parser regression; no new expectation or mirror test was added.

### Every failure in supplied CI log

Read `/Users/benharwood/.local/share/full-steam/jg-runs/sv5pre-ci-failed-38488167020.log` in full via structured filtering; run **38488167020** is RED. The three explicit API failure blocks all report SQLSTATE **42601**, “syntax error at end of input”, position **15611**, through `packages/db/src/migrate.ts:99`. Duplicate GitHub error annotations repeat those same failures.

| Suite/test marked failed | Evidence |
| --- | --- |
| `apps/api/src/final-account-lock.isolation.test.ts` — DW8 real database application isolation | Fixture at :37, `createLockFixture` :25, `createApplicationIsolationFixture` :90; migration syntax error |
| `apps/api/src/shadow-isolation.application.test.ts` — suite setup | :108:108; migration syntax error; 22 skipped |
| `apps/api/src/sv5pre-worker-execution.integration.test.ts` — suite setup | :56:3; migration syntax error; 2 skipped |
| `packages/db/test/job-parties.integration.test.ts` — applies the full migration chain to a SQL_ASCII database without UTF8 encoding | 1 failed of 86; full-chain migration failure |
| `packages/db/test/recovery-follow-up-upgrade.integration.test.ts` — preserves preview/approve/revoke/deliver/reconcile and their refusals on upgraded messages without resending | 1 failed of 3; PostgreSQL stdout explicitly prints the 0147 statement and syntax error at character 15611 |

The log also marks all of the following database suites with `❯` and all tests skipped. These are recorded separately as interrupted/setup failures, not as executed assertion failures; Turbo aborted before a final DB summary:

| Database suite | Tests skipped |
| --- | --- |
| `packages/db/test/recovery-messages.integration.test.ts` | 98 |
| `packages/db/test/recovery-follow-up.integration.test.ts` | 61 |
| `packages/db/test/work-order-import.integration.test.ts` | 49 |
| `packages/db/test/recovery-cases.workbench.integration.test.ts` | 41 |
| `packages/db/test/practice-feed.integration.test.ts` | 27 |
| `packages/db/test/recovery-eligibility-v3.integration.test.ts` | 31 |
| `packages/db/test/site-extra-pricing.integration.test.ts` | 35 |
| `packages/db/test/site-visit.integration.test.ts` | 56 |
| `packages/db/test/recovery-insurer-money.integration.test.ts` | 40 |
| `packages/db/test/contractor.integration.test.ts` | 19 |
| `packages/db/test/tenancy.integration.test.ts` | 9 |
| `packages/db/test/recovery-allocation.integration.test.ts` | 16 |
| `packages/db/test/practice-facts.integration.test.ts` | 30 |
| `packages/db/test/enterprise-identity.integration.test.ts` | 19 |
| `packages/db/test/audit-export.integration.test.ts` | 11 |
| `packages/db/test/recovery.integration.test.ts` | 15 |
| `packages/db/test/contractor-parties.integration.test.ts` | 19 |
| `packages/db/test/recovery-case-terms.integration.test.ts` | 46 |
| `packages/db/test/extra-origin.integration.test.ts` | 32 |
| `packages/db/test/extra-unlink.integration.test.ts` | 18 |
| `packages/db/test/final-account-lock.integration.test.ts` | 14 |
| `packages/db/test/site-extra-evidence.integration.test.ts` | 22 |

API summary: **3 failed files, 73 passed files; 1,695 passed tests, 25 skipped**. Root Turbo: **11 successful tasks of 13**, failed `@jobguard/api#test`; API test exit 1, root ELIFECYCLE exit 1 and GitHub step exit 1. `@jobguard/db` output is partial after the API failure. Expected adversarial diagnostics `RECOVERY_MESSAGE_CHANGED`, `RECOVERY_MESSAGE_EXISTING_EFFECT`, and Nest's deliberately injected “private SQL diagnostic” are present; they are not additional failed assertions. CI emitted no subsequent DB/migration/browser pass.

### Local executed checks

Node **24.17.0** / cached pinned pnpm **10.28.1**; no dependency install/download command issued. The default global pnpm launcher stalled before running commands (only its ignored-overrides warning appeared); those invocations were interrupted. Subsequent commands use `PATH=/private/tmp/sv5pre-r9-bin:$PATH` with a shim invoking the already-cached `~/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.

| Command actually run | Result / evidence |
| --- | --- |
| `pnpm typecheck` | PASS, 7 tasks successful, 2 cached; `/private/tmp/sv5pre-r9-typecheck-final.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, 7 tasks successful, 2 cached; `/private/tmp/sv5pre-r9-lint-final.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (initial + final) | PASS; `/private/tmp/sv5pre-r9-lanes.log`, `/private/tmp/sv5pre-r9-lanes-final.log` |
| `pnpm build` | PASS, 7 tasks successful, 2 cached; `/private/tmp/sv5pre-r9-build.log` |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage exec vitest run src` | Initial run: config 1 passed; storage 2 passed; core 2,248 passed, 1 timed out at 5 seconds; pnpm aborted before AI completion. `/private/tmp/sv5pre-r9-units.log` |
| `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts --maxWorkers=1` | PASS, 34 tests including the timeout retry; `/private/tmp/sv5pre-r9-receipt-unit-retry.log` |
| `pnpm --filter @jobguard/ai --filter @jobguard/storage exec vitest run src --maxWorkers=1` | PASS, AI 80 and storage 2 tests; `/private/tmp/sv5pre-r9-units-remaining.log`. Across the initial/retry source runs all 2,332 unique source tests passed at least once; no full single-run pass claimed. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude '**/*.http.test.ts' --exclude src/final-account-lock.isolation.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/sv5pre-worker-execution.integration.test.ts --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts` | PASS after build, 1,483 tests / 62 files; `/private/tmp/sv5pre-r9-unit-api-socket-free.log` |
| `pnpm --filter @jobguard/api exec vitest run src/sv5pre-worker-registration.test.ts src/shadow-detection.worker.test.ts src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/customer-invoice-sv5pre.filter.test.ts --maxWorkers=1` | PASS, 36 tests / 5 files; `/private/tmp/sv5pre-r9-unit-api-targeted.log` |
| `pnpm --filter @jobguard/web exec vitest run` | PASS, 666 tests / 28 files; `/private/tmp/sv5pre-r9-unit-web.log` |
| `node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs` | PASS, 19 tests; `/private/tmp/sv5pre-r9-unit-tools.log` |
| `pnpm openapi:check` | BLOCKED: tsx IPC socket `listen EPERM`; `/private/tmp/sv5pre-r9-openapi.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` (initial + after build) | PASS, same OpenAPI generation/comparison without CLI IPC; `/private/tmp/sv5pre-r9-openapi-node.log`, `/private/tmp/sv5pre-r9-openapi-node-final.log` |
| Read-only `git diff --check`, exact SQL delta, full protected-file byte comparisons against local and dispatched heads | PASS; only the migration and receipt are changed |

Initial typecheck/lint each exited 2 on stale `.next/types` references to four routes absent from this local older checkout: contractor order-lines, site-visits/start, site-visits/complete and site/jobs (TS2307). Logs: `/private/tmp/sv5pre-r9-typecheck.log`, `/private/tmp/sv5pre-r9-lint.log`. Rebuilt generated output before final retries; no source/expectation change.

Initial broad API command was `pnpm --filter @jobguard/api exec vitest run src --exclude src/final-account-lock.isolation.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/sv5pre-worker-execution.integration.test.ts --exclude src/health.test.ts --exclude src/sv5pre-invoice.http.test.ts`: **77 failed, 1,495 passed**, 6 failed / 60 passed files; `/private/tmp/sv5pre-r9-unit-api.log`. 73 failures were blocked socket tests (39 contractor-practice-session HTTP, 16 site-extra-pricing HTTP, 16 site-extra HTTP, 2 SSO action-path tests). Four other failures were recovery-eligibility-v3's “replays the immutable v3 command result when the workbench has a newer candidate” (`INVALID_COMMAND`), watchdog-registry's “fails when any job mutation route is unclassified”, “classifies standalone job mutations and dispatcher command literals too” (route arrays), and “registers every migration once, with CH-2 after the merged SH-1 schema” (migration names). All four cleared after regenerating build outputs in the final socket-free run. No failing expected value was changed.

Build retains existing CSS autoprefixer/cache warnings, Next's multiple-lockfile workspace-root warning and sandbox Turbo cache IO warnings. Neither cache replay nor static inspection is independent model/database evidence.

Whole `pnpm test` was not invoked because its root lane fixture tests issue forbidden git-writing commands, and its DB/HTTP suites require disallowed sockets/PostgreSQL. Ran the seven safe root tool files instead (19 passed). No PostgreSQL, database/migration suites or browser server was started; dispatcher must run `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and applicable browser journeys at the resulting commit. A fresh install, live provider/model evaluation and production readiness are not claimed.

### Scope, migration and handoff

Only unmerged migration 0147 and this receipt change. Transactional migration is edited in place as explicitly directed; no historical data rewrite/backfill, new alert or compatibility change. Migration runs inside BEGIN/COMMIT; rollback a failed transaction before rerunning the corrected unmerged migration. Existing final-check, D12/D13, synthetic-only, real-data/release and SV-5 implementation holds remain. This builder cannot record its own independent verdict or technical acceptance; dispatcher commit requires the existing separate review/acceptance loop.

Commit message overwritten at `/private/tmp/jg-msg-sv5pre.txt`; no git add/commit/checkout/push or other git-writing command executed.

---

## Current status — round r7 coordinator ruling (13 October 2026, dispatcher 4)

Base / unchanged local HEAD: `c593a4c738b63b5f69ab0aca9466458232b97875` (after r6). This is an uncommitted builder handoff; dispatcher owns commit/push and exact-commit CI, independent verdict and separate acceptance. All earlier status sections below are historical. No technical acceptance or release is claimed.

Authority, verbatim: "(1) practice-facts:49 and practice-feed:50 (repository CONSTRUCTION line to use the scoped pool): YES. It follows a rule that got stricter (an absent session digest is now refused), the issue call and every assertion stay byte-for-byte, and the receipt lists the two lines as RE-POINTED. Condition: SV5PRE must also contain a test proving the other side: the same issue on a session-owned job through an UNSCOPED repository (no digest) is refused FORBIDDEN and writes nothing. Without that the re-point would hide the rule instead of proving it."

Read AGENTS.md, BUILD_PLAN SV-4/SV-5 and the versioned SV5PRE completion contract. Scope is exactly the two construction lines, one new piece-owned PostgreSQL test, the sv5pre lane metadata and this receipt. `apps/api/src/shadow-isolation.application.test.ts` is entirely byte-identical to HEAD; line 393 remains held for Ben. No production source, migration, grant, policy, timeout or existing assertion changed.

### Exact before/after

| File:line | Classification | Before | After |
| --- | --- | --- | --- |
| `packages/db/test/practice-facts.integration.test.ts:49` | **RE-POINTED** | `const invoices = new PracticeInvoiceRepository(runtime), quoteId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID();` | `const invoices = new PracticeInvoiceRepository(practiceMaterialPool(runtime, (await admin.query("SELECT practice_session_digest FROM app.job WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, jobId])).rows[0].practice_session_digest)), quoteId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID();` |
| `packages/db/test/practice-feed.integration.test.ts:50` | **RE-POINTED** | `const invoices = new PracticeInvoiceRepository(runtime), quoteId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID();` | `const invoices = new PracticeInvoiceRepository(practiceMaterialPool(runtime, (await admin.query("SELECT practice_session_digest FROM app.job WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, jobId])).rows[0].practice_session_digest)), quoteId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID();` |

The existing `setupPool` is declared later in each fixture. Each construction-line-only change therefore wraps `runtime` with `practiceMaterialPool` using the server-persisted digest fetched inline. The later setup, unchanged issue call, return, receipt calls and all assertions are preserved. Replacing only the changed construction line reconstructs the entire original file byte-for-byte; issue-and-assertion tail hashes match. Evidence: `/private/tmp/sv5pre-r7-preservation.json`. Whole-file preservation check also proves 371 other existing test files unchanged from r7 HEAD.

### New refusal proof and lane entries

New file: `packages/db/test/sv5pre-session-invoice.integration.test.ts`. It creates a real persisted practice session via the runtime login, authenticates it, selects its live owned job, and prepares a final account, lock and checked empty-manifest completion through the scoped pool. It explicitly verifies the unscoped repository's transaction has no `app.practice_material_digest`. The same seven-argument issue command then must reject with message `FORBIDDEN` and PostgreSQL code `42501`.

Before and after reads compare tenant-wide counts for 26 source/effect relations, including invoices, sequence, evidence/line bindings, Decision/resolution, authorization, outbox, command receipt and audit. Canonical PostgreSQL JSON text additionally compares all rows, detecting updates that preserve row counts. A positive control sends the identical command through the scoped pool and requires one invoice and one new receipt, proving the prepared account is issuable. This is real-PostgreSQL test construction; execution is owed to CI, not replaced by local TypeScript checks.

The sv5pre allow list retains the existing exact practice-facts/feed test entries and adds the new test path. Its note records coordinator approval for all three paths and the r7 preservation conditions. Every other lane is unchanged.

### Local verification

Commands executed:

| Executed command | Exit | Result / log |
| --- | --- | --- |
| `pnpm typecheck --force --concurrency=2` | 0 | Seven tasks, zero cached; `/private/tmp/sv5pre-r7-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint --force --concurrency=2` | 0 | Root boundary checks and seven package tasks, zero cached; `/private/tmp/sv5pre-r7-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | sv5pre scope including new test; base `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4`; `/private/tmp/sv5pre-r7-lanes.log` |
| `node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs` | 0 | 19 passed, zero failed/skipped; `/private/tmp/sv5pre-r7-tools.log` |
| `node` heredoc using TypeScript `createProgram` on all three r7 DB test paths plus imported dependencies, strict DB compiler options, no emit | 0 | Zero semantic diagnostics; `/private/tmp/sv5pre-r7-db-semantic.log`. DB package typecheck excludes integration tests, so this is additional compile evidence, not SQL execution. |
| `pnpm openapi:check` | 1 | `tsx` CLI IPC `listen EPERM` before generator; `/private/tmp/sv5pre-r7-openapi.log` |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | 0 | Same actual source checker without CLI IPC; `/private/tmp/sv5pre-r7-openapi-direct.log`. Published document unchanged. |
| 63 named `pnpm --filter @jobguard/<package> exec vitest run --maxWorkers=<1 or 2> <up to three explicit files>` batches | First 62 exit 0; batch 63 exit 1 | 180 files: 4,497 passed, one failed, zero skipped. Existing `packages/db/src/audit-checkpoint-handoff.test.ts:279` dependency scanner exceeds its unchanged 5,000 ms timeout (6,752 ms). Exact file lists, commands, exits and logs: `/private/tmp/sv5pre-r7-unit-batches-manifest.json`, `/private/tmp/sv5pre-r7-unit-batches-results.json`; totals: `/private/tmp/sv5pre-r7-unit-totals.json`. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/audit-checkpoint-handoff.test.ts` (isolated rerun) | 1 | Same unchanged scanner times out again; 55 passed / one failed, suite test bodies 6.44 s. `/private/tmp/sv5pre-r7-scanner-rerun.log`. No timeout, assertion or implementation modification. |

All named unit files other than that unchanged scanner pass. The scanner is an unresolved local failure, not a green mandatory-suite result. `pnpm build --force --concurrency=2` exits 0: seven successful tasks, zero cached, 2m50.27s. Log: `/private/tmp/sv5pre-r7-build.log`. Existing Turbo cache-permission, Next workspace-root and CSS/autoprefixer warnings remain; compilation and production build succeeded. Uses installed Node v24.17.0 and pinned pnpm 10.28.1 via `/private/tmp/sv5pre-independent/bin/pnpm`; no dependency installation. Each Turbo/unit command uses at most two configured workers/concurrency. Lint, unit batches and build run in separate stages; supplemental semantic checking overlapped typecheck. Dependencies were preinstalled; this is not a clean-install proof.

### Limits and handoff

NOT RUN here: new PostgreSQL proof, both changed integration suites, full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, actual HTTP/worker execution and `pnpm test:e2e`. Dispatcher states localhost binding and PostgreSQL startup are unavailable; database and browser checks remain mandatory in GitHub CI after push. Root Git-fixture tests that write Git are excluded from local commands under the explicit no-Git-writes instruction. No suite is weakened or made optional. CI must also resolve/provide the mandatory unchanged scanner result; two local timeout failures are retained in this receipt. The focused CI command is `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/sv5pre-session-invoice.integration.test.ts test/practice-facts.integration.test.ts test/practice-feed.integration.test.ts`, in addition to all mandatory full suites.

Affected invariants: AGENTS §§5.1, 5.3, 5.4 and 5.7 (session/tenant authorization and no persisted issue/audit effects on refusal). No data migration, backwards-compatibility change to production, provider action, new alert or AI/model change. All prior release gates and independent-review/acceptance requirements remain. r7 resolves only the authorized practice construction STOPs; shadow-isolation and other earlier holds are not resolved by this round. Intended conventional subject/body is overwritten at `/private/tmp/jg-msg-sv5pre.txt`. No Git write, push or self-acceptance.

### Final scope and payload binding

Final read-only scope reconstruction and `git diff --check` pass. Exactly five working-tree paths are changed (four tracked plus the new test). Both prior suites have only their one approved constructor line changed. Shadow-isolation, scanner source, migration 0147 and published OpenAPI are byte-identical to r7 HEAD. Every other lane is unchanged. The 371-file existing-test preservation check is recorded above. No Git write occurred.

| r7 non-receipt path | SHA-256 |
| --- | --- |
| `config/agent-lane-assignments.json` | `0e2c394115ce400177674e85e86b99bd67bd5daaaa66427556849da23213a753` |
| `packages/db/test/practice-facts.integration.test.ts` | `c69bcede40b999793ff0c3fd9dae8b1a7c754052be1afc79b5ddada8d5cf7a53` |
| `packages/db/test/practice-feed.integration.test.ts` | `52782dbafcb8ecf3854e0f51831b8022885e2f67d57276c149f0981878618d14` |
| `packages/db/test/sv5pre-session-invoice.integration.test.ts` | `2bdae894327bd51c1ca43a57671850c80ab9f1f25a2a97ee718f2f3de8185115` |

Final candidate including receipt hash: `/private/tmp/sv5pre-r7-candidate.json`; preservation reconstruction: `/private/tmp/sv5pre-r7-preservation.json`. Receipt self-hash is kept only in the external candidate manifest. Local HEAD remains `c593a4c738b63b5f69ab0aca9466458232b97875`; no r7 commit exists yet. Dispatcher binds this evidence to its new commit and supplies the CI results, independent verdict and separate acceptance. This handoff remains held for those requirements and the recorded scanner failure.

---

## Current status — round r5 repairs (13 October 2026, dispatcher 4)

Repair base / unchanged local HEAD: `6ea816c6df01c758993cd2a597070088117e4de0` (dispatcher committed r4). All r5 changes are **uncommitted working-tree changes**. Built by Codex; no Git write command, package installation/download, independent review, technical acceptance, push or release. Dispatcher owns the commit and subsequent exact-commit CI/review. Intended conventional commit message is overwritten at `/private/tmp/jg-msg-sv5pre.txt`. All r1–r4 current-status statements below are historical.

Read the full independent Sol report at `/Users/benharwood/.local/share/full-steam/jg-runs/sv5pre-solcheck-20261013T222237.md`, AGENTS.md, BUILD_PLAN §2.4 C1–C8 and the applicable final-account/Final Check contracts (§10.2, SV-4/SV-5), plus `docs/contracts/sv5pre-completion-v1.md`. Sol's verdict is REPAIR for **678b9da**, not a verdict on this r5 candidate. The active order explicitly authorizes the piece-owned Next adapter amendment and stronger piece-owned SQL tests; it forbids merged-test expectation changes. No sub-agent review or acceptance is inferred from local checks.

### Finding repairs and remaining holds

| Finding | r5 change / evidence | Status |
| --- | --- | --- |
| P2 4, Next error contract | `apps/web/app/api/jobs/[id]/customer-invoices/route.ts`: typed `FinalAccountLockError` maps to **409**, `final-check-invoice-error.v1`, explicit **no-store**, matching Nest. GET/POST unexpected errors return fixed `INTERNAL_SERVER_ERROR`, HTTP 500, no-store; they cannot expose SQL text or impersonate typed refusals. Existing practice-access refusal mapping remains. New Next adapter tests cover all three lock/check refusal codes, both unexpected-error paths, untyped lookalikes and authentication-before-access. New Nest filter tests cover the same three typed codes and Nest's sanitized fallback. | Source amended; **12 socket-free adapter tests pass**. Existing actual HTTP suite remains owed in CI; these tests do not prove DB authorization. |
| P2 5, PRE-Q5-12 | `packages/db/test/sv5pre-completion.integration.test.ts:43`: nonempty source with a persisted failed attempt; blocked publication then successful processing/publication; identical replay retains one certificate, one check, one completion audit effect and unchanged audit head/history; changed run under the same publication identity conflicts. A later failed attempt survives replay, prevents fresh publication and invoice issue, and leaves all commercial effects unchanged. | Real-PostgreSQL assertions added; semantic TypeScript check passes. **PostgreSQL execution NOT RUN** here. |
| P2 5, PRE-Q5-14 | Same own test file at :202 and :221: completion audit failure also leaves audit head/history and commercial effects unchanged, then the same check succeeds once. New invoice audit-failure test injects a tenant/event-specific PostgreSQL audit trigger, asserts rollback of invoice sequence, invoice/line/evidence bindings, Decision/resolution, authorization, outbox, command receipt, audit head/history and existing commercial rows. Removing the fault lets the **same command** succeed with `DEMO-CUST-000001`, exactly one set of issue effects; replay is unchanged, and fee/payment/landing/journal records remain unchanged. Fault trigger is cleaned up. | Actual SQL queries and trigger faults in the embedded PostgreSQL harness, with no DB mocks. **Execution NOT RUN** here; snapshot assertions are PostgreSQL reads, not pure-domain proof. |
| P2 6, scanner | Unmodified `packages/db/src/audit-checkpoint-handoff.test.ts`, including its :279 scanner, passes **56/56**; all test bodies together take **2.10 seconds**, within the unchanged five-second test limit. No timeout, assertion, skip or scanner implementation was changed. | Local execution supplied; no attribution for the reviewer's earlier timeout is claimed. Full DB/migration/worker/HTTP/browser/CI proof still **HOLD**. |
| P3 7, original commit separation | No history changed; no superseding ruling supplied by this order. `bfae9df`'s original implementation/merged-test split remains outstanding. r2 and r4 amendment commits do not settle that original finding. | **Dispatcher-owned HOLD** pending issued separation or explicit superseding ruling. |

The r4 STOPs remain unchanged: practice facts/feed retained unscoped issue at :71/:72 needs coordinator authority for session scoping; shadow-isolation comparison at :393–397 / equality :406 and unfinished upload at :300 remain held. Before/after in r5 is identical for each protected line and entire file; no expectation change was attempted. Existing r4 setup rows were not altered. The r4 section below retains the full reasons and original authority. A successful full-suite result cannot be claimed while these source-inspected holds remain.

### Preservation, scope and contracts

`/private/tmp/sv5pre-r5-preservation.json` proves **379 tracked test files byte-identical to r4 HEAD**, excluding only the explicitly authorized piece-owned completion integration test; zero merged-test differences. Both new adapter-test files are r5-owned. Every other lane reconstructs identically; only sv5pre's allow list/note adds the authorized route and test paths. No migration, grants, existing timeout, skip, queue schema, context constructor, fingerprinted table, provider route, UI or fee formula changed. Migration 0147 remains byte-identical to r4. The versioned contract document now records both transport mappings and their execution limits. Invariants touched: AGENTS §§5.3–5.4, 5.7, 5.14 and BUILD_PLAN C2/C5/C6/C8 (typed refusal, disclosure control, idempotency and atomic rollback).

Backwards compatibility: Next typed lock/check refusals intentionally change from unversioned 400 to versioned 409; unexpected errors change to sanitized 500. All invoice persistence and authorization routines are unchanged. No data migration, new alert or operational deployment is introduced. Existing production/commercial gates, full SV-5 orchestration/reveal/catches and the uninstalled final-check handler remain deferred.

### Executed r5 checks

Installed Node **v24.17.0**, pinned pnpm **10.28.1**, Vitest **4.1.11**. pnpm commands use `PATH=/private/tmp/jg-pnpm-sv5pre:$HOME/Library/pnpm/bin:$PATH`, pointing at the installed binary. No installation or download. All batches run sequentially with **at most three named files and two workers**; scanner alone uses one worker. No build/test overlap. Memory probe: 70% free; data volume: 49 GB available. Turbo emits existing sandbox cache warnings; forced checks still execute all seven tasks with **zero cache hits**. Build retains existing Next/CSS warnings.

| Command actually run | Exit | Evidence |
| --- | ---: | --- |
| `pnpm build --concurrency=2 --force` | 0 twice | Seven packages, zero cached. First build precedes a test-only logger-spy correction; final build covers the final TypeScript bytes. `/private/tmp/sv5pre-r5-build.log`, `/private/tmp/sv5pre-r5-build-final.log` |
| `pnpm typecheck --force --concurrency=2` | 0 | Seven packages, zero cached. `/private/tmp/sv5pre-r5-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint --force --concurrency=2` | 0 | Root purity/lane/money/commercial guards and seven packages. `/private/tmp/sv5pre-r5-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Registered branch, local mode, r4 HEAD, current origin/main `e4cb8437d044746300c377647f6061d06cd960cc`; committed range plus working/untracked candidate paths pass. `/private/tmp/sv5pre-r5-lanes.log` |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/jobs/[id]/customer-invoices/route.test.ts'` | 0 | Eight new Next cases. `/private/tmp/sv5pre-r5-next.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/customer-invoice-sv5pre.filter.test.ts src/sv5pre-worker-registration.test.ts src/final-account-lock.application.test.ts` | 0 | 24 passed; filter's final logger-spy correction is covered again in the broad API batches below. `/private/tmp/sv5pre-r5-api-own.log` |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/audit-checkpoint-handoff.test.ts` | 0 | 56 passed, 2.10 seconds total test bodies, suite wall duration 2.98 seconds; existing timeout unchanged. `/private/tmp/sv5pre-r5-scanner.log` |
| Named unit batches, each `pnpm --filter @jobguard/<package> exec vitest run --maxWorkers=2 <up to three explicit files>` | 0, all 62 batches | Commands, exact file manifests, per-batch results and logs: `/private/tmp/sv5pre-r5-unit-batches-manifest.json`, `/private/tmp/sv5pre-r5-unit-batches-results.json`, `/private/tmp/sv5pre-r5-more-unit-batches-manifest.json`, `/private/tmp/sv5pre-r5-more-unit-batches-results.json`; summaries `/private/tmp/sv5pre-r5-unit-summary.log`, `/private/tmp/sv5pre-r5-more-unit-summary.log` |
| Semantic TypeScript `createProgram` on strengthened DB test plus imported dependencies, using existing strict DB compiler options, no emit | 0 | **Zero diagnostics**. `/private/tmp/sv5pre-r5-db-semantic.log`; this is not SQL execution. |
| `pnpm openapi:check` | 1 | tsx IPC `listen EPERM` before generator, `/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/51707.pipe`. `/private/tmp/sv5pre-r5-openapi.log` |
| `node --import tsx src/generate-openapi.ts --check` from apps/api | 0 | Executes the **same source checker** without the CLI IPC listener; generated document unchanged. `/private/tmp/sv5pre-r5-openapi-direct.log` |
| Read-only test/lane reconstruction and `git diff --check` | 0 | 379 preserved test files, every other lane unchanged, clean whitespace. `/private/tmp/sv5pre-r5-preservation.json` |

Unique broad unit coverage (scanner included; earlier targeted reruns are not double-counted): **180 files, 4,476 passed, zero failed/skipped**. Core: 78 files / 2,249; DB units: 10 / 146; API units: 62 / 1,483; web units: 23 / 515; AI synthetic units: 5 / 80; config: 1 / 1; storage: 1 / 2. `/private/tmp/sv5pre-r5-unit-totals.json` records the totals. No prompt/model/matching change or live-model evaluation.

### Execution owed to dispatcher / exact commit binding

**NOT RUN**: strengthened `packages/db/test/sv5pre-completion.integration.test.ts`, all other PostgreSQL integration and migration proofs, actual Graphile execution, actual socket HTTP, application DB isolation journeys, free-port socket tests, root/package-wide `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, and `pnpm test:e2e`. The dispatcher explicitly states this sandbox cannot bind localhost or start PostgreSQL; CI runs these after its push. No sandbox escalation, weakened assertion or substituted DB proof was attempted. Socket/DB-dependent API files excluded from the named local batches remain mandatory: SSO action-paths, health, contractor practice-session/site-extra/site-extra-pricing HTTP, final-account-lock isolation, shadow-isolation, SV5PRE HTTP and SV5PRE worker execution. Browser regressions remain owed in **both mobile-360 and desktop**, including SV-4, affected invoice/recovery journeys and earlier mandatory journeys. No successful GitHub CI result for the r5 candidate is available here.

The dispatcher must resolve the preserved r4 STOPs, provide successful mandatory CI evidence for the **new exact candidate commit**, obtain an independent recorded verdict and separate acceptance, and provide the original commit-separation ruling. This builder receipt supplies local/source evidence only; **P2 6 and P3 7 remain HOLD**. `/private/tmp/sv5pre-r5-candidate.json` records final working-tree file hashes and unchanged migration hash so the dispatcher can bind these logs to its commit; it is not an invented commit SHA.

Other executed commands were read-only repository/source/report inspection (`pwd`, `rg`, `cat`, `sed`, `head`, `tail`, `nl`, `ls`, `wc`, `git status`, `git rev-parse`, `git branch --show-current`, `git log`, `git ls-files`, `git show`, `git diff`), memory/disk probes, Python/Node read-only comparison and semantic checks, and the authorized working-tree/temporary log/receipt/message writes. Exploratory `rg` with no matches returned 1. No Git-writing command was run.

---

## Current status — coordinator-approved amendments r4 (13 October 2026, dispatcher 4)

Local HEAD / repair base: `678b9da0d3b872ceaa331f0e87eff86bc7cf0662`; r4 amendments are **uncommitted**. Built by Codex. No Git write command, package install, independent review, technical acceptance, push or release. Dispatcher commits this working tree separately as **coordinator-approved amendments r4** using `/private/tmp/jg-msg-sv5pre.txt`. This section is the current head/status; all r1–r3 head/status and STOP statements below are historical run records.

Independent source-inspection evidence read: `/Users/benharwood/.local/share/full-steam/jg-runs/sv5pre-opus-678b9da.md`: **HOLD**, bound to the exact base above, no suites executed by the reviewer. It is not a verdict on this uncommitted r4 diff. The independent verdict and separate acceptance for the dispatcher's new commit remain owed.

Coordinator authority supplied verbatim in the active user instruction:

> YES, queue it. All three are premise set-up under the standing rule: (1) practice-facts:63 and practice-feed:64: the builder may add a scoped pool / scoped repository for the SET-UP ONLY (terms, lock, completion), leaving the existing unscoped repository at :48/:49 and the existing issue call and every later assertion byte-for-byte. (2) apps/web/e2e/SV-4.spec.ts:112: replace the raw `completed` insert with the checked completion helper (a run, then completion); what the spec asserts afterwards is unchanged. (3) shadow-isolation.application.test.ts:365: add authoritative completion before the issue; the pending upload at :300 and the row comparison at :393 stay byte-for-byte. If the :393 comparison can only pass by changing what it expects, STOP on that line and send it to me.

The user additionally confirms the existing completion-repository relocation into `shadow-detection-repository.ts` and UIWIRE-10/11/12 baseline scope/line setup. Those sources remain byte-identical to HEAD in r4. The pinned worker list and both structural isolation assertions remain unchanged; their executed result is recorded below.

### Each r4 change — file:line, SET-UP-ONLY, before/after

Line numbers below refer to the resulting working tree; issued line numbers are shown where they differ.

| File:line | Class | Before | After |
| --- | --- | --- | --- |
| `packages/db/test/practice-facts.integration.test.ts:1,12` | SET-UP-ONLY | No prerequisite-helper or scoped-pool import | Add `prepareInvoicePrerequisites` and existing `practiceMaterialPool` imports. |
| `packages/db/test/practice-facts.integration.test.ts:64–70` (issued issue :63, now :71) | SET-UP-ONLY | Accepted aggregate account lacks a baseline line, terms, lock and checked completion | Add confirmed scope identity and baseline line using the existing 110000 net/quote; read the job's persisted digest into a **setup-only** pool; establish terms, dispositions, exact-revision lock and checked empty completion via existing helper. Original unscoped repository at issued :48 (now :49), original issue and entire tail remain byte-for-byte. Issue remains STOP below. |
| `packages/db/test/practice-feed.integration.test.ts:1,12` | SET-UP-ONLY | No prerequisite-helper or scoped-pool import | Same two additive imports. |
| `packages/db/test/practice-feed.integration.test.ts:65–71` (issued issue :64, now :72) | SET-UP-ONLY | Same aggregate-only fixture | Same prerequisite insertion; original unscoped repository at issued :49 (now :50), original issue and every later assertion remain byte-for-byte. Issue remains STOP below. |
| `apps/web/e2e/helpers/customer-invoice-journey.ts:89` | SET-UP-ONLY | Checked completion helper is private to its fixture module | Add only `export` to its declaration so SV-4 uses the same manifest/source/attempt/result/run-binding/publication path; helper body unchanged. |
| `apps/web/e2e/SV-4.spec.ts:1,113` (issued :112) | SET-UP-ONLY | Raw successful `completed` insert on the other job without a run | Import helper and replace only that insert with `publishInvoiceFixtureCompletion(shadow,admin,fixture.tenantId,other.jobId,{lockId:foreign.id,cutoff:foreign.cutoff})`. Genuine checked simulated run and completion; both earlier 23503 refusals and every assertion afterwards are unchanged. |
| `config/agent-lane-assignments.json:2` | SET-UP-ONLY (lane metadata) | All four coordinator-named test paths already explicitly present in sv5pre allow list | Keep exact allow entries without duplicates; append their explicit r4 coordinator approval and preservation conditions to sv5pre note. No other lane change. |
| `docs/verdicts/SV5PRE/BUILDER_RECEIPT.md:1` | SET-UP-ONLY (receipt metadata) | Top status refers to r3 at 2e98177 | Prepend current 678b9da head/uncommitted status, exact authority, amendment rows, preservation evidence, checks and STOP handoff; retain prior receipts as history. |

### STOPs sent to coordinator — preserved lines, source inspection only

**STOP `apps/api/src/shadow-isolation.application.test.ts:393`** (comparison loop :393–397; final equality :406). Entire file is untouched. Authoritative completion cannot preserve the existing comparison under current schema. It inventories the original pending upload at :300 and requires it verified with matching version/hash before success (`0147:143–148,204`). More decisively, the zero-signal run has a zero-result descriptor; the many-signal run must classify and prove all 25 signals (`0147:208–212`). The comparison enumerates every app/infrastructure table except `shadow_%`, so it includes all five private `final_check_*` proof tables plus `final_check_completion`. Those runs necessarily differ in reveal-proof row count/descriptors, source-attempt signal IDs, run-binding result hash, certificate result hash and `audit_event` payload/hash. These are semantically different bytes even with deterministic clocks and UUIDs. Adding completion alone would fail on the pending upload; finalizing it would still require changing the protected comparison's expectations to pass. The coordinator expressly says STOP in that case: no completion insertion, upload mutation, comparison exclusion, fake proof, or migration repair has been attempted. The existing issue at :365 remains identical and held. This is a source-inspected blocker, not a claimed executed DB failure.

**STOP `packages/db/test/practice-facts.integration.test.ts:71` and `practice-feed.integration.test.ts:72`** (issued :63/:64). The allowed scoped prerequisite setup is complete in source. Their retained `new PracticeInvoiceRepository(runtime)` issue uses a separate unscoped `withTenant` transaction (`practice-invoice-repository.ts:22–24`). Setup's `app.practice_material_digest` is transaction-local and ends at commit (`practice-session.ts:75`). The invoice routine checks digest **before replay** and again after the job lock (`0147:293,296`); a non-null job digest and absent supplied digest raise `FORBIDDEN` (`0147:276–278`). Setup-only scoping cannot change that. No repository rebinding, pool mutation, session-wide digest leak, job-digest deletion, pre-issued replay bypass, SQL authorization relaxation or expectation change is authorized or attempted. These calls still need a specific coordinator ruling; no green DB result is claimed.

### r4 preservation and verification

`/private/tmp/sv5pre-r4-preservation.json` records successful read-only reconstruction: deleting only r4 imports/setup reconstructs each complete practice test file at HEAD; reverting only the SV-4 import/replacement reconstructs that complete file; removing only `export` reconstructs the browser helper. Practice issue-and-assertion tails and SV-4 assertion tail hashes are recorded there. Ten protected files are byte-identical to HEAD, including the entire shadow-isolation file, entire worker structural test (pinned list and both isolation assertions), context-boundary, registry, practice-session, migration 0147, worker-only repository and all three UIWIRE fixtures. No permanent pinning test or existing expectation was changed.

Executed r4 checks used installed Node `v24.17.0`, pinned pnpm `10.28.1` and Vitest `4.1.11`. Each pnpm command began with `export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/sv5pre-independent/bin:$PATH"`, using the already-installed corepack binary. No installs or downloads. Typecheck, lint and build each ran once with `--force`, seven packages executed and **0 cached**. Commands ran sequentially; no build/test overlap; every Vitest batch has at most three explicit files and `--maxWorkers=2`. Memory probes showed 66–70% free and available disk stayed 49 GB (>45 GB). Shared-cache permission warnings did not prevent forced execution. The current read-only `origin/main` used by both lane checks is `e4cb8437d044746300c377647f6061d06cd960cc`.

| Executed r4 command | Exit | Result / log |
| --- | ---: | --- |
| `pnpm typecheck --force --concurrency=2` | 0 | Seven packages pass, zero cached; includes web/browser helper typecheck. `/private/tmp/sv5pre-r4-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint --force --concurrency=2` | 0 | Root purity/lane/money/commercial checks and seven package checks pass, zero cached. `/private/tmp/sv5pre-r4-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | sv5pre scope passes. `/private/tmp/sv5pre-r4-lanes.log` |
| `pnpm build --concurrency=2 --force` | 0 | Seven packages pass, zero cached; production Next build. Existing CSS/cache warnings. `/private/tmp/sv5pre-r4-build.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/watchdog-registry.test.ts src/shadow-detection.worker.test.ts src/practice-session.test.ts` | 0 | 3 files, 277 tests pass; unchanged pinned worker list and both structural isolation assertions green. `/private/tmp/sv5pre-r4-api-structural.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/sv5pre-worker-registration.test.ts src/final-account-lock.application.test.ts` | 0 | 2 files, 20 tests pass. `/private/tmp/sv5pre-r4-api-own.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts src/final-account-lock.controller.test.ts` | 0 | 2 files, 150 tests pass. `/private/tmp/sv5pre-r4-api-boundary.log` |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/final-check-completion.test.ts` | 0 | 1 file, 11 tests pass. `/private/tmp/sv5pre-r4-core.log` |
| `pnpm openapi:check` | 1 | Wrapper blocked before generator by tsx IPC `listen EPERM`; no permissions escalation. `/private/tmp/sv5pre-r4-openapi.log` |
| `node apps/api/dist/generate-openapi.js --check` | 1 | Compiled diagnostic reports stale OpenAPI; compiled metadata produces a different document from the source checker. No generated file changed. `/private/tmp/sv5pre-r4-openapi-compiled.log` |
| `node --import tsx src/generate-openapi.ts --check` **from apps/api** | 0 | Exact source generator and `--check` logic used by the required script passes, avoiding the CLI's IPC listener. `/private/tmp/sv5pre-r4-openapi-direct.log` |
| TypeScript `transpileModule` on all four changed TypeScript fixtures | 0 | Syntax check; DB tests excluded from their package's production tsconfig. Not DB execution. |
| Read-only HEAD reconstruction / protected-file hashes | 0 | Four reconstructed sources plus ten protected whole files; `/private/tmp/sv5pre-r4-preservation.json` |
| `git diff --check` | 0 | Clean. |

Total executed unit coverage: **458 passed, eight files, zero failed/skipped**. This is targeted unit coverage, not the package-wide API suite, DB guarantees or browser acceptance. The standard OpenAPI command remains blocked by sandbox IPC; its exact source checker was actually executed successfully. The compiled diagnostic is separately labelled and does not override the source-check result. Whole suites remain dispatcher-owned under the packet's memory limit.

Other actual commands: read-only `pwd`, `rg`, `cat`, `sed`, `head`, `tail`, `nl`, `ls`, `git status --short`, `git rev-parse`, `git log`, `git show`, `git diff`/`--stat`/`--numstat`/`--check`; `memory_pressure`, `df`, `node --version`; temporary Python/TypeScript preservation and syntax checks; working-tree receipt/fixture/lane edits and temporary message/log writes. Initial reads of guessed absent files/globs returned nonzero; the first temporary Python reconstruction had an indentation error and was corrected before successful verification. The first direct tsx attempt from repo root could not resolve the API-only dependency; rerunning from apps/api succeeded. No package, environment, Git or permission boundary was changed to perform these checks.

**NOT RUN:** both amended practice DB suites; shadow-isolation application's socket/PostgreSQL suite; SV-4 browser suite and existing customer-invoice helper consumers; all own SV5PRE PostgreSQL/access/upgrade/worker/HTTP suites and the affected DB/migration/browser suite manifest recorded in Opus's base verdict. These remain required on the dispatcher's Mac / GitHub CI. AI/prompt/model/extraction/matching unchanged; `pnpm eval` and approved-region live evaluation are inapplicable to these setup-only edits. No fresh install was attempted (dependencies provided); no clean-install claim.

Self-review: all allowed practice setup is inserted before unchanged calls and expectations, scope/line value comes from the existing accepted quote/account, browser completion uses the existing checked restricted-worker helper, no public feature, access-path implementation, schema, GRANT or financial routine changed. Existing worker relocation and UIWIRE setup are unchanged and their newly supplied coordinator approval is recorded. The exact :393 STOP condition is present in source, so shadow-isolation stays wholly untouched; setup cannot carry transaction-local authentication into the preserved unscoped practice issue, so both calls stay STOP. Deterministic/source checks do not count as an independent model verdict. Reviewer/acceptance/release gates remain held.

PostgreSQL/database/migration, HTTP socket and browser suites are **NOT RUN** per dispatcher sandbox instructions; they remain for the dispatcher's Mac / GitHub CI after push. No synthetic helper is described as installed SV-5 orchestration or live provider integration. No schema, production path, grant, monetary behavior, policy, provider destination, operational alert or release gate changes in r4; SV5-32 and substantive reveal/disposition remain held.

### r4 final scope and handoff

Five changed non-receipt files plus this receipt; no untracked files. Read-only final status/diffstat: `/private/tmp/sv5pre-r4-status.txt`, `/private/tmp/sv5pre-r4-diffstat.txt`. Changed-source SHA-256 manifest: `/private/tmp/sv5pre-r4-changed-hashes.json`.

| Changed non-receipt file | SHA-256 |
| --- | --- |
| `apps/web/e2e/SV-4.spec.ts` | `f76b1a16801f579c87dfd87dc6f5f796926bc124b5a9597da992ddbdb6ea7cea` |
| `apps/web/e2e/helpers/customer-invoice-journey.ts` | `72f1fd7ff9176aaa4af7d3841fdf9ee0c1c0f5240d745d247f4ed093a600a6c9` |
| `config/agent-lane-assignments.json` | `628d76a27821189a995b394e0f1b3aa545b0e258bd6eb01298c7cd94c6049513` |
| `packages/db/test/practice-facts.integration.test.ts` | `0196dd8865f89fdc28ff98fb549cb17d740ae31cceb2c93df5fed60221b2dd10` |
| `packages/db/test/practice-feed.integration.test.ts` | `e42816df703978a226576bbaf6f44358b94abfd30de26b1e6cafadce47798fe6` |

Final local HEAD stays `678b9da0d3b872ceaa331f0e87eff86bc7cf0662`; r4 stays uncommitted for the dispatcher. Intended conventional subject/body overwritten at `/private/tmp/jg-msg-sv5pre.txt`. This is a held handoff: exact coordinator STOPs above, real DB/browser proofs, independent new-commit verdict and separate acceptance remain outstanding.

---

Built by Codex; repair r3 dispatched 13 Oct 2026. Codex was available; the dispatch addendum's requested Claude author line is factually inapplicable.

## Repair r3 — S1–S4 only (13 October 2026, dispatcher 4)

Repair base and unchanged local HEAD: `2e981771936ad2bf86a7a58e6ba7527038b4de28` (r1 plus coordinator-approved amendments). Built by Codex; no independent review or acceptance is claimed. The r3 user order authorizes ONLY the four Sol findings below. This section supersedes r2's OPEN implementation findings, but does not close or amend any r2 STOP. No merged test, pinned list, migration, GRANT, release gate, UI, or provider integration changes in r3. No Git write commands were run. Dispatcher owns the final commit and CI.

Authority read: `/Users/benharwood/.local/share/full-steam/jg-orders/SV5PRE-r2-rulings.txt`, `/Users/benharwood/.local/share/full-steam/jg-runs/sv5pre-solcheck-20261013T211754.md`, and the prerequisite packet under `/Users/benharwood/.local/share/full-steam/jg-runs/sv-5-prereq-patch/`. The cited report's verdict is REPAIR for bfae9df, not a verdict for r3. Rulings (a)–(c) and the standing rule are recorded in the r2 section below; r3 makes no further amendment to those merged tests.

| Finding | Before | r3 change and proof |
| --- | --- | --- |
| S1 | Guarded invoice repository inherited from `PracticeInvoiceRepository`; unchanged registry scanner refused it | Explicit composition delegates all eight projection/credit/receipt methods. Guarded issue SQL, money projection, typed refusals and replay/audit behavior are preserved. `watchdog-registry.test.ts` unchanged. |
| S2 | Completion methods wrote hidden run state from a module outside the pinned worker seam | All seven methods and their versioned schemas moved into the already-permitted `shadow-detection-repository.ts`. Original completion file contains only error constants/class and types. Barrel export resolves to that worker module; OWN integration import follows it. Structural capability discovery now classifies the completion class as worker-only and rejects its request-side use. No pinned catalogue edit. |
| S3 | Manifest and sources were uncommitted while an independent admin connection read them | Inventory transaction now commits before that read. Restricted attempts, run binding and checked publication remain in their own transaction. OWN PostgreSQL regression `S3 non-empty fixture commits inventory before recording both stages and completion` asserts one source, exactly two successful attempts with that source/manifest/evidence identity, and the checked completion certificate. Added before implementation; NOT RUN here under the dispatcher environment restriction. |
| S4 | Constructor called the scoped pool before asynchronous application access | Constructor retains only pool/session. Each method initializes the persisted-session scoped pool when invoked; the existing application access check still runs first. `practice-session.test.ts` unchanged. |

The SV5PRE lane gains exactly `packages/db/src/shadow-detection-repository.ts` to implement S2 inside the existing permitted seam; no other lane is widened. It receives one import and appended completion implementation only. Python reconstruction verifies the original detector implementation byte-for-byte, and all completion methods are a byte-identical relocation. The three cited API test files, context boundary test, migration 0147, existing application access paths, uninstalled task executor, and all four r2 STOP files are byte-identical to repair HEAD. No new SQL privileges, operational alerts, or data migration. Direct implementation imports of the completion class must now use the worker seam; the inert barrel retains its named export.

Final r3 verification: Node `v24.17.0`, installed pinned pnpm `10.28.1`, Vitest `4.1.11`. The global pnpm shim stalled before starting Vitest and was cancelled (exit 130); subsequent commands used the already-installed pinned corepack binary through `/private/tmp/sv5pre-independent/bin/pnpm`. No install command or package download was requested. Each pnpm command used `export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/sv5pre-independent/bin:$PATH"`. Runs are sequential, with at most three explicit test files and `--maxWorkers=2`; no build/test overlap. Memory probes before heavy checks passed (56–72% free); available disk stayed 50–51 GB (>45 GB). Turbo emitted shared-cache IO permission warnings while forced checks actually executed; no cache-hit result is used as evidence.

| Executed r3 command | Exit | Result/log |
| --- | ---: | --- |
| Required API batch before implementation: `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/watchdog-registry.test.ts src/shadow-detection.worker.test.ts src/practice-session.test.ts` | 1 | 3 files, 266 passed / 11 failed; reproduces S1, S2 and all nine S4 failures. `/private/tmp/sv5pre-r3-first-api.log` |
| Same batch after source repair but before rebuild | 1 | 2 structural files pass; 268 passed / 9 failed against the old compiled DB constructor. `/private/tmp/sv5pre-r3-api.log` (superseded by the final rebuilt run below) |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0 | 7 successful packages, 0 cached. `/private/tmp/sv5pre-r3-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint --force --concurrency=2` | 0 | Root purity/lane/money/commercial checks; 7 successful package checks, 0 cached. `/private/tmp/sv5pre-r3-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | sv5pre boundary passes including the one worker-module lane addition. `/private/tmp/sv5pre-r3-lanes.log` |
| `node --input-type=module` TypeScript `transpileModule` check | 0 | Changed OWN PostgreSQL test syntax only; not semantic test typecheck or PostgreSQL execution. |
| Python read-only HEAD reconstruction and hash inspection | 0 | 12 protected files unchanged; original detector and relocated methods byte-identical. `/private/tmp/sv5pre-r3-preservation.json` |
| `git diff --check` | 0 | Clean |
| `pnpm build --concurrency=2 --force` | 0 | 7 successful packages, 0 cached, including production Next build. Existing CSS/cache warnings only. `/private/tmp/sv5pre-r3-build.log` |
| Required API batch after forced rebuild (same three explicit files) | 0 | 3 files, 277 passed, 0 failed/skipped. `/private/tmp/sv5pre-r3-api-rebuilt.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/sv5pre-worker-registration.test.ts src/final-account-lock.application.test.ts` | 0 | 2 files, 20 passed, 0 failed/skipped. `/private/tmp/sv5pre-r3-api-own.log` |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/final-check-completion.test.ts` | 0 | 1 file, 11 passed, 0 failed/skipped. `/private/tmp/sv5pre-r3-core.log` |
| `pnpm openapi:check` (delegates to API `tsx src/generate-openapi.ts --check`) | 1 | BLOCKED before generator execution: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/31187.pipe`. Stopped this check; no workaround or escalation. `/private/tmp/sv5pre-r3-openapi.log` |

Local lane lint resolved `origin/main` to `e4cb8437d044746300c377647f6061d06cd960cc`; no Git command updated that ref. Final executed unit coverage is 297 targeted API tests plus 11 OWN core tests (308 total, six files). PostgreSQL/migrations, durable worker integration, socket HTTP and browser journeys remain NOT RUN (sandbox cannot start PostgreSQL or bind localhost); GitHub CI after dispatcher push supplies that evidence. Real orchestration remains explicitly uninstalled; no synthetic fixture is described as a live integration.


Files NOT RUN: `packages/db/test/sv5pre-completion.integration.test.ts` (includes new S3 regression), `sv5pre-completion-access.integration.test.ts`, `sv5pre-legacy-invoice.integration.test.ts`, `sv5pre-upgrade.integration.test.ts`, `final-account-lock-invoice.integration.test.ts`; `apps/api/src/sv5pre-worker-execution.integration.test.ts`; `apps/api/src/sv5pre-invoice.http.test.ts`; affected browser journeys. PostgreSQL, localhost and browser infrastructure are unavailable under the dispatcher's sandbox instruction. Root/package-wide suites were not launched: dispatcher limits execution to named batches of at most three files and two workers, and its CI supplies the complete DB/migration/browser suites. AI/model/schema content and matching policies are unchanged; no live-model evaluation is claimed.

Other actual commands: read-only `pwd`, `git status --short`, `git rev-parse HEAD`, `git symbolic-ref --short HEAD`, `git diff --stat`, targeted `git diff -- <paths>`, `git diff --check`, Python `git show HEAD:<path>` reconstruction; `rg --files`, `rg -n`, `cat`, `sed -n`, `head`, `tail`, `nl -ba`, `ls -l` on the named packet/source/test/config/log files; `memory_pressure | tail -1`, `df -g /System/Volumes/Data`, `node --version`, pinned `pnpm --version` (10.28.1). Successful reads/probes returned 0; initial packet subpaths did not exist (cat exit 1) and absent Vitest/config/helper globs reported no matches. Diagnostic command `ps -ax -o pid,ppid,etime,command | rg 'pnpm|vitest' | head -20` reported `zsh:1: operation not permitted: ps`; stopped that diagnostic and did not retry process inspection. Python source/lane/test/contract/receipt/message edits returned 0. No install, Git write, external action, new approval or independent model verdict.

No new merged-test STOP is required for S1–S4. Prior r2 STOP lines (practice facts/feed, SV-4 and shadow-isolation) remain untouched and held; r3 is not their authorization or acceptance. The local HEAD remains `2e981771936ad2bf86a7a58e6ba7527038b4de28`; all r3 work is uncommitted. The conventional commit subject/body is overwritten at `/private/tmp/jg-msg-sv5pre.txt`; dispatcher must bind later reviewer/CI evidence to its new commit.

### r3 final byte/hash evidence

Final read-only `git diff --stat` snapshot: `/private/tmp/sv5pre-r3-diffstat.txt` (captured before this final receipt pointer/author update). Only the nine files listed in that snapshot changed. Final preservation and `git diff --check` returned 0.

Protected-file hashes and reconstruction: `/private/tmp/sv5pre-r3-preservation.json` (12 protected files unchanged; original detector, all completion methods and versioned schemas preserved byte-for-byte). No new GRANT and no migration edits.

| r3 changed non-receipt file | SHA-256 |
| --- | --- |
| `config/agent-lane-assignments.json` | `72d13fdc4ab084d01c5f3a3c2abb3528eb9fa8dc2f44e6f5f53ea529b2f89ee7` |
| `docs/contracts/sv5pre-completion-v1.md` | `17f5c4bdc329a5c251e1982cf0f5c667b5075fb2444a4c6fdbdb379f91aeda71` |
| `packages/db/src/final-check-completion-repository.ts` | `3efbc5ad95268d64d8e658ef7bb7cd1b729a8d2834d695c09bee412e248a5850` |
| `packages/db/src/guarded-practice-invoice-repository.ts` | `e5ebe5dfa4226a45410df8570fd627b2878791d488e351c8d0af6089d9308cfa` |
| `packages/db/src/index.ts` | `cc986146fdd56afb6b722f75f17005a397878b45ca416c20c62f6fb7435b1b3a` |
| `packages/db/src/shadow-detection-repository.ts` | `de907110911876ffcae6d7935de9251e612dffa34919c70f4aa4cc61fc093ab7` |
| `packages/db/test/sv5pre-completion.integration.test.ts` | `0a7949feac1b4283770894b24f830fb4123d28fa954889c0a7a0afaa6b51b57b` |
| `packages/db/test/sv5pre-fixtures.ts` | `02b724aa1ece903937c0ba895456049c7b560d1c0f1305135400c21cf348bf8a` |



# SV5PRE builder receipt — partial construction, RED review owed

Repair r1 HEAD: `bfae9dfd38a6671d44e3db7f6f41ee32da461398`; original issued base: `2350b1a718b76aabdedd1782f02e92f516914246`. Current local origin/main: `6659fb58791ec22588948f005b2bd4f6b299fa48` (unchanged during r1). Branch `codex/sandbox/sv5pre`. No commit, add, push, merge or release was performed. Migration 0147 is the issued number. This receipt is builder evidence, not an independent verdict or acceptance. Both RED reviewers must confirm every preserved-assertion row and exact dispatcher commit.

Core, migration/persistence, guarded invoice adapter and worker registration constructed. Fresh legacy issue is fail-closed. Some existing fixture premises require coordinator amendments beyond issued A-D; the exact STOP list below remains technical-acceptance blocking. UI, substantive detector/reconciliation, catches/dispositions, fees and real-data release remain held. SV5-32 is incomplete.

Validation results, grant inventory, hashes, exact amendments and command log are appended after controlled end checks. PostgreSQL, browser and HTTP socket suites are NOT RUN (sandbox cannot start PostgreSQL or bind sockets). Existing aggregate suites belong to dispatcher sequential batching and were not run here. Dependencies were already installed; no install/download command was used.

## Repair r2 — coordinator-approved amendments, dispatcher 4, 13 October 2026

Active repair base/final local HEAD: `ffd359de5875aed58feb9b3b890b1ccad93da3ae` (r1 already committed by dispatcher). Origin/main remains `6659fb58791ec22588948f005b2bd4f6b299fa48`; original issued base remains `2350b1a718b76aabdedd1782f02e92f516914246`. This section supersedes the historical STOP/validation lists below for r2 only. Dispatcher must commit ALL r2 changes as ONE separate commit labelled **coordinator-approved amendments**. Intended message: `/private/tmp/jg-msg-sv5pre.txt`. No git write command, installation, download or independent agent review was performed. All r2 changes are to existing merged files and this receipt; r1's migration and SV5PRE-owned implementation/fixtures are unchanged. No new migration or production GRANT; the original six GRANT statements and Standard F inventory below remain in force.

Authority supplied verbatim by the dispatcher in the active r2 instruction:

> (a) apps/api/src/shadow-detection.worker.test.ts:77: the expected task list gains "final_check" as a new LAST entry; nothing else on that line or in that file changes. Approved as an additive expectation following the approved worker.ts insertion. The isolation assertions at :86/:116 and the pinned list at :89 are NOT touched.
>
> (b) Premise-adding set-up under my groups A and D: UIWIRE-10:5, UIWIRE-11:4, UIWIRE-12:26 (freshInvoice), practice-facts:63, practice-feed:64, shadow-isolation.application.test.ts:358-365, apps/web/e2e/SV-4.spec.ts:112, and the helpers M4-3-S.spec.ts:57, helpers/customer-invoice-journey.ts:68, recovery-allocation-journey.ts:67, recovery-sources.ts:55. The builder adds ONLY what establishes accepted terms, the lock and checked authoritative completion (or the run that a completed fact now needs) BEFORE the existing call; the existing call and every assertion after it stay byte-for-byte; nothing UI-facing is asserted differently. Any line that cannot be done that way = STOP on that line only.
>
> (c) apps/api/src/final-account-lock.application.ts:17 (repository built without the session digest, so the lock-bound invoice route refuses practice-session jobs): add that ONE file to the SV5PRE lane (lane-entry edit in config/agent-lane-assignments.json via you) for a digest pass-through only, with a test that a practice-session job can issue through the lock-bound route and that a wrong/absent digest is still refused. Both reviewers look at it specifically (it is access-path code).
>
> STANDING RULE: inside an issued order the builder MAY (i) add a new row/entry to an existing merged catalogue or list for a NEW thing the order creates, and (ii) add premise-establishing set-up before an unchanged call where a new, approved rule requires it; both always listed before/after in the receipt and confirmed by the reviewers. The builder may NEVER change, remove or loosen an existing expected value, refusal, count, pinned name or fingerprint, and never touches context-boundary.test.ts or its pinned lists: those still stop and come to the coordinator.

### Every r2 amendment: before / after

Paths and current lines are bound to the r2 working tree. Original order numbers can differ after additive imports; the invoice in shadow-isolation is actually at 365, inside the authorized 358–365 region. Existing assertion blocks are reconstructed byte-for-byte by a TEMPORARY read-only comparison script, not a permanent pinning test.

| File:line | Class | Before | After |
| --- | --- | --- | --- |
| `apps/api/src/shadow-detection.worker.test.ts:77` | STRENGTHENED | Exactly `discover_outbox`, `execute_outbox`, `detect_shadow_evidence` | Append `final_check` LAST. Removing that one entry reconstructs the WHOLE original file. Assertions at 86/116 and pinned list at 89 are unchanged. |
| `packages/db/test/UIWIRE-10.integration.test.ts:1,6` (issued :5) | SET-UP-ONLY | Aggregate-only accepted account, no baseline line/lock/check before `repository.issue(context,input)` | Import existing checked fixture; add its missing confirmed baseline scope identity/line with the EXISTING 110000-pence net and quote identity (needed to establish a valid lock); establish dispositions, accepted terms, lock and authoritative empty completion BEFORE the exact same call. Invoice number, 132000 total/balance, artifact, replay, one invoice/outbox, mutation and recipient refusals are unchanged. |
| `packages/db/test/UIWIRE-11.integration.test.ts:1,5` (issued :4) | SET-UP-ONLY | Aggregate-only starting invoice | Same baseline-lock prerequisites before the exact `invoiceId=(await repo.issue(...)).id` call. Every credit, signed amount/hash/balance, concurrency, wrong-job and no-fee assertion is unchanged. |
| `packages/db/test/UIWIRE-12.integration.test.ts:1,27` (issued freshInvoice :26) | SET-UP-ONLY | Same aggregate-only fixture used at schema 0029 and head | Explicit installed-table condition; historical schema-0029 calls remain historical. At head ONLY, add the missing baseline scope/line, same original quote and 110000 net, then terms/dispositions/lock/checked empty completion. Existing issue call and all later receipt/reversal assertions remain exact. |
| `apps/web/e2e/helpers/customer-invoice-journey.ts:1,71,81` (issued :68) | SET-UP-ONLY | Verified proof and assembled account, then legacy issue | Imports, one `prepareInvoiceFinalCheck` call before unchanged issue, and setup-only helper declarations. Accept terms, dispose existing baseline items, lock exact assembled revision through authenticated API, inventory real sources through restricted shadow INSERT, commit inventory BEFORE separate admin source read, then record both simulated processing stages/classifications/result and publish through checked triggers. No UI assertion changes; simulated setup is not installed SV-5 orchestration. |
| `apps/web/e2e/M4-3-S.spec.ts:1,58` (issued :57) | SET-UP-ONLY | Assembled sources then invoice issue | Import and call the same prerequisite helper immediately before unchanged issue; every evidence-pack/UI assertion remains exact. |
| `apps/web/e2e/helpers/recovery-allocation-journey.ts:1,68` (issued :67) | SET-UP-ONLY | Verified evidence and assembled account then issue | Same prerequisite import/call; all invoice money, recovery/allocation and UI assertions remain exact. |
| `apps/web/e2e/helpers/recovery-sources.ts:1,56` (issued :55) | SET-UP-ONLY | Verified sources/account then issue | Same prerequisite import/call; every later source and UI assertion remains exact. |
| `apps/api/src/final-account-lock.application.ts:3,17,41` | STRENGTHENED | Unscoped repository used for lock-bound issue | Retain pool in inert constructor; import existing `practiceMaterialPool`; only after `access.job` and schema parsing construct an invoice repository with the AUTHENTICATED `auth.digest`. No digest from request payload, no authority reconstruction or SQL guard relaxation. Both RED reviewers must specifically inspect this access-path row. |
| `apps/api/src/final-account-lock.application.test.ts:44` | STRENGTHENED | No proof of digest reaching SQL after authority | Append `PRE-Q4-05 r2 lock-bound issue carries only the authenticated session digest after access`; executes existing repository against a simulated checked routine, proves access/config/issue order and exact digest. All earlier tests/assertions unchanged. |
| `packages/db/test/final-account-lock-invoice.integration.test.ts:114` | STRENGTHENED | No real-PostgreSQL application/session regression | Append `PRE-Q4-05 r2 practice-session job issues through the lock-bound application; wrong and absent digests remain refused`. Actual restricted runtime login, real persisted session, terms/lock/checked completion; wrong/absent digest refused before AND after issuance/replay, no invoice added on refusal, exact 4032000 total and one certificate-bound invoice. NOT RUN here. All existing F7/refusal/race assertions unchanged. |
| `config/agent-lane-assignments.json:2` | STRENGTHENED | SV5PRE allow list lacked the digest application and two merged unit files | Coordinator-owned additions: `apps/api/src/final-account-lock.application.ts`, `apps/api/src/final-account-lock.application.test.ts`, `apps/api/src/shadow-detection.worker.test.ts`, `apps/web/e2e/SV-4.spec.ts` (the latter remains stopped/untouched). All touched DB/browser tests were already listed. Only sv5pre note/allow changes; every other lane reconstructs identically. |
| `docs/verdicts/SV5PRE/BUILDER_RECEIPT.md:1` and this section | STRENGTHENED | Historical r1 evidence/STOP list | Truthful r2 authorship, authority, amendment table, tests/commands, unchanged-source proof, exact remaining STOPs, reviewer finding disposition, hashes and final local HEAD. Historical evidence retained, explicitly superseded where r2 adds setup. |

Named assertion preservation (for both reviewers to confirm row by row):

| Old assertion | New assertion | Why equal or stronger |
| --- | --- | --- |
| Worker task names/order | Same three entries in same order, plus named `final_check` last | Approved new registration only; whole original file reconstructs after removal of the one new entry. |
| UIWIRE-10 invoice money, number, replay/effect counts and refusals | SAME exact assertions | Only setup before the existing issue; no business expected value replaced. |
| UIWIRE-11 credit money/hash/balance, race count, wrong-job refusal, zero fees | SAME exact assertions | Checked lock/check premises establish eligibility; no credit assertions change. |
| UIWIRE-12 historical receipt/reversal replay, cross-invoice refusal and money exclusion | SAME exact assertions | Historical 0029 fixture is untouched; head gains valid lock premises only. |
| Four browser helpers' UI/money/source assertions | SAME exact assertions | All four original files reconstruct after removing prerequisite additions. |
| Existing F7 4032000/96000, qualified 23503 refusals, access refusals and race outcomes | SAME exact assertions | Only a NEW practice-session regression is appended to the merged suite. |
| Existing final-account application tests including unowned/unauthenticated/production refusal | SAME exact assertions | New digest test appended; constructor remains inert. |

### STOP lines: cannot be repaired by only adding allowed premises before an unchanged call

All four affected files below remain byte-identical to r1 HEAD. No bypass, session impersonation, trigger exemption, altered expected code, relaxed source validation or changed original call was introduced.

1. **STOP `packages/db/test/practice-facts.integration.test.ts:63`** and **STOP `packages/db/test/practice-feed.integration.test.ts:64`**. Exact BEFORE (both):
   `const issued = await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), recipient: "practice@example.invalid", issuedOn: "2026-09-19" });`
   Required AFTER also needs the existing repository construction (`practice-facts:48`, `practice-feed:49`) changed from `new PracticeInvoiceRepository(runtime)` to `new PracticeInvoiceRepository(practiceMaterialPool(runtime, authenticatedDigest))`, AND missing baseline/terms/lock/checked completion. The job is owned by a persisted session; setup alone cannot make an unscoped invoice call supply its authenticated digest. That repository-construction substitution is beyond ruling (b), so STOP on these lines, not the SQL guard.
2. **STOP `apps/web/e2e/SV-4.spec.ts:112`**. Exact BEFORE:
   `await shadow.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) VALUES($1,$2,$3,$4,$5,'completed')",[fixture.tenantId,other.jobId,randomUUID(),foreign.id,foreign.cutoff]);`
   Required AFTER: the same checked completion fact MUST include `run_id` and its actual checked manifest/source/result binding. Creating a run beforehand cannot supply the omitted column in this unchanged SQL. Requires coordinator authorization to replace this positive setup call with checked publication (or add the `run_id` column/parameter); its existing wrong-job/cutoff `23503` assertions at 111 and every later own-job blocked assertion would remain exact. No edit made.
3. **STOP `apps/api/src/shadow-isolation.application.test.ts:365`** (authorized region :358–365). Exact BEFORE:
   `await success("issue customer invoice",()=>app.customerInvoice.issue(a.jobId,{version:"practice-customer-invoice.issue.v1",commandId:randomUUID(),finalAccountRevisionId:a.revisionId,expectedSourceHash:"a".repeat(64),recipient:"fixture@example.invalid",issuedOn:"2026-10-13"}));`
   Proposed AFTER was worker-side checked publication before this UNCHANGED call. But seeded `signalUpload` at 300 is still pending, with no finalized upload object-version binding; row 301 inserts an original object independently. Adding attempts or a run does not satisfy checked verified-input predicates. Further, final public-row comparison at 393 includes all new `final_check_*` tables; a run classifying 0 versus 25 hidden signals produces different proof rows. Completion setup alone cannot preserve that original byte comparison. Requires a coordinator ruling for the unfinished fixture at 300–301 and a named equal-or-stronger public-versus-hidden proof comparison at 393, retaining every builder trace assertion. No row or comparison changed, no raw completion fabricated.

Additional Sol holds outside this merged-amendment-only round (all corresponding SV5PRE-owned files unchanged):

- `packages/db/src/guarded-practice-invoice-repository.ts:14`: BEFORE inheritance from `PracticeInvoiceRepository`; required AFTER composition with equivalent issue projections, preserving `watchdog-registry.test.ts:183`. This implementation repair needs its own authorization/round. Its :16 constructor also calls `practiceMaterialPool` before asynchronous application access; required AFTER defer scope initialization until after authenticated access, preserving practice-session production/pilot refusals. Neither is closed by the narrow lock-bound digest amendment.
- `packages/db/src/final-check-completion-repository.ts:50` versus untouched `apps/api/src/shadow-detection.worker.test.ts:89,118`: BEFORE worker repository reads/writes shadow state outside pinned worker catalogue; required AFTER an expressly approved worker capability boundary preserving request-side isolation. Ruling (a) only adds the task expectation; pinned catalogue is NOT touched. Actual worker-suite isolation failure recorded below.
- `packages/db/test/sv5pre-fixtures.ts:71–72`: BEFORE manifest inserted in uncommitted shadow transaction, sources read on separate admin connection; required AFTER commit inventory before admin source read, then resume restricted processing/publication. This OWN fixture remains unchanged per r2 scope. Browser setup uses its own authorized setup-only helper with that correct transaction sequencing, but does not close Sol's finding about the SV5PRE-owned fixture.

### Prior independent findings: r1 / r2 disposition (source changes are not acceptance)

Read both complete reports: `/Users/benharwood/.local/share/full-steam/jg-runs/sv5pre-opus-bfae9df.md` and latest `/Users/benharwood/.local/share/full-steam/jg-runs/sv5pre-solcheck-20261013T211754.md`. Both remain independent **REPAIR** verdicts for bfae9df; no r1/r2 independent verdict or technical acceptance is claimed.

| Finding | r1 | r2 |
| --- | --- | --- |
| Opus blocking 1, evidence-time mutation | SQL/own regression repair committed ffd359d; DB execution/review owed | Migration and cited merged evidence tests unchanged; r1 guarantees preserved |
| Opus blocking 2, historical test timeout | New beforeAll historical setup committed ffd359d; old assertion/timeout unchanged | Existing hooks and interim assertion untouched |
| Opus blocking 3 / Sol P1 task expectation | Held | Exact last-entry amendment applied; registration expectation now passes, pinned isolation failure remains |
| Opus blocking 3 / Sol P1 fixture premises | Held | UIWIRE-10/11/12 and four P2 helpers repaired by setup only; practice facts/feed, SV-4:112 and shadow-isolation:365 STOP as detailed above |
| Opus blocking 4 / Sol P1 lock-bound session route | Held | Authenticated digest pass-through; unit regression passes, PostgreSQL success/refusal/replay proof added, NOT RUN |
| Opus blocking 5, original commit shape | Dispatcher-owned | r2 explicitly prepared as ONE separate coordinator-approved amendments commit. Existing bfae9df history was not rewritten; any historical split remains dispatcher-owned |
| Sol P1 guarded inheritance / pinned shadow catalogue | Not in r1 scope | OPEN; no implementation/pinned-list edit authorized in this round |
| Sol P1 non-empty OWN fixture visibility | Not in r1 scope | OPEN in sv5pre-fixtures; correct committed-inventory setup added only in merged browser helper |
| Sol P2 constructor refusal timing | Not in r1 scope | OPEN in guarded-practice repository; lock-bound amendment is inert until after access |
| Sol P2 missing authority/execution evidence | Held | Dispatcher r2 authority reproduced above; DB/browser/full-suite evidence and both exact-commit verdicts still owed |

Original reviewer LATER notes (including explicit deposit proof and own migration replay/depth/login observations) remain recorded in their reports; r2 neither deletes them nor treats them as passed.

### r2 execution receipt

Node `v24.17.0`, installed pinned pnpm `10.28.1`, Vitest `4.1.11`. No install/download. Every pnpm command below used `export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-pnpm-sv5pre:$PATH"`. Each run was sequential; at most three named test files and two workers; no build/test overlap. All memory probes passed (71–74% free), all disk probes passed (51–52 GB available, >45 GB).

Tests first: new digest unit test was appended BEFORE the application change; first run observed `Error: FORBIDDEN`, with 14 existing tests passing and 1 new test failing. Its real-PostgreSQL companion and premise test first runs are **NOT RUN (cannot start PostgreSQL here)**, not claimed observed failures.

| Actual r2 command | Exit | Counts/result |
| --- | ---: | --- |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/final-account-lock.application.test.ts` before code | 1 | 14 passed, 1 new test failed with FORBIDDEN |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/final-account-lock.application.test.ts src/sv5pre-worker-registration.test.ts src/shadow-detection.worker.test.ts` | 1 | 26 passed, 1 failed / 3 files. Task-list expectation passes; untouched structural isolation fails at :118 on final-check-completion-repository.ts |
| `pnpm exec turbo run typecheck --force --concurrency=2` initial | 2 | 5/6 tasks completed, 0 cached; new unit mock inferred too narrow a row type |
| Same forced typecheck after correcting ONLY new mock declaration | 0 | 7/7 tasks, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | sv5pre lane passed |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0 | Core purity 153 TS files; lane and money boundaries passed |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force --concurrency=2` | 0 | 7/7 tasks, 0 cached; final browser setup sequencing checked |
| `pnpm build --concurrency=2 --force` | 0 | 7/7 tasks, 0 cached; 30 Next pages generated; final helper types checked |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/final-account-lock.application.test.ts src/sv5pre-worker-registration.test.ts src/auth/context-boundary.test.ts` | 0 | 165 passed / 3 files; final digest adapter, prerequisite registration, unchanged context boundaries |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/final-check-completion.test.ts` | 0 | 11 passed / 1 file |
| `pnpm --filter @jobguard/api openapi:check` | 1 | STOP: tsx fails BEFORE generator with `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/58139.pipe`; no alternate route/escalation attempted |
| `node --input-type=module` TypeScript transpileModule check on the four changed DB test files | 0 | 4 syntax checks, NOT DB execution or semantic test-file typecheck |
| `python3 /private/tmp/jg-sv5pre-r2-preservation.py` | 1, 1, then 0, 0, 0 | First two attempts corrected verifier-only newline accounting and JSON lanes nesting; no compared assertion changed. Final reconstruction proves all 10 changed merged test/helper files and 13 untouched boundary/OWN files; every other lane unchanged |
| `git diff --check` | 0 | No whitespace errors |

Final forced typecheck and end hashes/stat are recorded below. Turbo emits sandbox cache IO warnings; all forced successful tasks executed with ZERO cache hits. Build retains existing workspace-root/CSS warnings. Syntax verification is separate from DB execution; mock adapter/registration tests are separate from actual application/Graphile/PostgreSQL execution.

Other actual r2 commands: read-only `pwd`, `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`, `git log -3 --oneline`, `git diff --stat`, `git diff --numstat`, `git diff --name-only`, targeted `git diff -- <paths>`, and Python read-only `git show HEAD:<path>` reconstruction; `ls -t` on reviewer reports, `ls -l /private/tmp/jg-pnpm-sv5pre/pnpm`, `cat`/`sed -n`/`rg -n`/`rg -l`/`nl -ba`/`head -c` on the named task, source, contract, test and config files; `memory_pressure | tail -1`, `df -g /System/Volumes/Data`, `node --version`. Successful reads/probes returned 0. Exploratory reads for absent `apps/api/src/practice-material-pool.ts`/`packages/db/src/practice-material-repository.ts`/`apps/api/vitest.config.ts` returned cat 1 / rg 2 (existing practice scope seam is packages/db/src/practice-session.ts); no permission alternative was used. Python source/test/lane/receipt/message edits returned 0. No Git command wrote.

r2 **NOT RUN (cannot start PostgreSQL here)**: `packages/db/test/UIWIRE-10.integration.test.ts`, `UIWIRE-11.integration.test.ts`, `UIWIRE-12.integration.test.ts`, `final-account-lock-invoice.integration.test.ts` (including new actual-session route proof); `apps/api/src/shadow-isolation.application.test.ts` (also requires sockets/Next). The original/r1 NOT RUN manifest below remains mandatory, including own completion/access/legacy/upgrade files, evidence consumers, real worker/HTTP and all merged DB boundaries. No DB/browser process was attempted; dispatch explicitly states they cannot start in this sandbox.

r2 **NOT RUN (cannot start a browser here)**: `apps/web/e2e/SV-4.spec.ts`, `M4-3-S.spec.ts`; helper consumers enumerated by actual `rg -l`: `CH-7.spec.ts`, `CH-2.spec.ts`, `CH-1.spec.ts`, `PRACTICE-FACTS-1.spec.ts`, `M4-7-S.spec.ts`, `M4-6-S.spec.ts`, `M4-8-S.spec.ts`, `UIWIRE-12.spec.ts`, `M4-5-S.spec.ts`. Dispatcher must cover both projects and reload assertions. No UI assertion or screen was edited.

Aggregate `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e`, applicable eval and OpenAPI generation/comparison remain NOT RUN/dispatcher-owned. No provider/prompt/model changed. No new migration/backfill/GRANT, operational deployment or live approval in r2; previous forward-fix-only strategy and all release holds remain. SV5-32 and aggregate SV-5 acceptance remain incomplete.

Self-review is SOURCE INSPECTION only: checked digest is obtained after current authority, within transaction-local pool scope; SQL and proof gates are unchanged; browser fixture inventory commits before admin read; originals reconstructed; no weakened existing expected value, refusal, count, pinned name or fingerprint. TEST-EXECUTED: 176 final targeted tests plus forced build/lint/typecheck; whole worker suite remains failing as above. INDEPENDENTLY VERIFIED: only prior bfae9df REPAIR reports. Both Opus and Sol still need to confirm EVERY amendment/preservation row, especially final-account-lock.application.ts, against the dispatcher’s exact r2 commit; a separate actor owns acceptance.

### r2 final command results and payload binding

Final `pnpm exec turbo run typecheck --force --concurrency=2` after final helper sequencing: **exit 0, 7/7 tasks, ZERO cache hits**. This additional run was required by the intervening helper transaction-sequencing change. End read-only `git status --short`, `git diff --check`, preservation verifier, message readback and disk probe all exited 0; disk remained 51 GB available. Python receipt/hash/footer edit exited 0. Final local HEAD remains **`ffd359de5875aed58feb9b3b890b1ccad93da3ae`**. No new commit SHA exists until the dispatcher commits this working tree; reviewers must bind their new verdicts to that actual commit.

Complete r2 commit file manifest (all paths below, exactly one separate dispatcher commit):

- `apps/api/src/final-account-lock.application.test.ts`
- `apps/api/src/final-account-lock.application.ts`
- `apps/api/src/shadow-detection.worker.test.ts`
- `apps/web/e2e/M4-3-S.spec.ts`
- `apps/web/e2e/helpers/customer-invoice-journey.ts`
- `apps/web/e2e/helpers/recovery-allocation-journey.ts`
- `apps/web/e2e/helpers/recovery-sources.ts`
- `config/agent-lane-assignments.json`
- `docs/verdicts/SV5PRE/BUILDER_RECEIPT.md`
- `packages/db/test/UIWIRE-10.integration.test.ts`
- `packages/db/test/UIWIRE-11.integration.test.ts`
- `packages/db/test/UIWIRE-12.integration.test.ts`
- `packages/db/test/final-account-lock-invoice.integration.test.ts`

Final source-inspection follow-up: read both local completion/lock contracts (exit 0) and session routine authority; exploratory `rg` on an absent `0094_practice_sessions.sql` returned 2, then `rg --files` found `0094_practice_session_ownership.sql` and its routine read returned 0. Its issue routine requires the demo membership BEFORE session issuance. Corrected only the NEW DB regression's setup ordering accordingly; DB test remains NOT RUN. Repeated single-file nonexecuting TypeScript syntax check, complete temporary reconstruction, and `git diff --check` each exited 0. Existing tests/assertions and application source did not change. End lane lint rerun exited 0; final full diff/stat/status reads exited 0. The payload hashes/stat below bind that final DB test setup.

SHA-256 payloads below exclude this receipt to avoid a self-referential hash; unchanged implementation/boundary witnesses are included. Only receipt metadata was edited after these source hashes and completed checks.

```text
05ab83880bb1875661f3b1a773dc831e50391e7a796a75d92180fb69848f7115  apps/api/src/final-account-lock.application.test.ts
44f3be6b95bf350081bacdc2e2ff8eceac9405be668bddbcdc90ebeca95f7cc2  apps/api/src/final-account-lock.application.ts
e8f272f70c230c03493a69f6f76c4765f9d73fcb6d2c790df8946e5cd8eb1ac3  apps/api/src/shadow-detection.worker.test.ts
60d6668ecc55f4dd30a62f482b013be250e3b7e1b2bf370fae07cdbbeb6403ae  apps/web/e2e/M4-3-S.spec.ts
cabc5e9bfba55bb5875ceba6146b4c06c15019d00f92d1edd289922b24640ee0  apps/web/e2e/helpers/customer-invoice-journey.ts
cca316c90d03374bba8afe8fe8c36da70a0171f9e496e1667636143e780ddaab  apps/web/e2e/helpers/recovery-allocation-journey.ts
fc9caddcd8675220bd1467de18aebd4882ce510487af5caadd05a3e3cf4cefff  apps/web/e2e/helpers/recovery-sources.ts
675b7ac20330dac1d4f417aef7a3c1ee2e5a5919c4e0afe713a4e113438130dc  config/agent-lane-assignments.json
aea65e500dadedd989847be01086927b4b55b77976a129eca238ba9365125736  packages/db/test/UIWIRE-10.integration.test.ts
9cd4c7a9ce7028f5e4ab65c31dc0606892712146e784e5216f27d487d97cdb56  packages/db/test/UIWIRE-11.integration.test.ts
26d8684466cc660588c2fc72df2b58bd2d3e6b7564a0ab2c362f72b0103a61e2  packages/db/test/UIWIRE-12.integration.test.ts
3f3269a0685b4709b4c0a404945f6a8818f520aba91a3e602501015d078cd4d9  packages/db/test/final-account-lock-invoice.integration.test.ts
a75ec3e6d819954628d5b32298ca436ba3bb9a8dae4845daa8ba27bd7cabff96  packages/db/migrations/0199_final_check_prerequisites.sql (unchanged from r1 HEAD)
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35  apps/api/src/auth/context-boundary.test.ts (unchanged from r1 HEAD)
1935b39a8c3dbe15dba3fa4240758d5c133470c8f8c50ac4f31c5ac4ba46e493  apps/api/src/worker.ts (unchanged from r1 HEAD)
91f158fd82838366a432e32698c0089a8f65bcc41f6d92ff9be5f84c2b9bd89f  packages/db/test/sv5pre-fixtures.ts (unchanged from r1 HEAD)
```

Actual `git diff --stat -- . ':(exclude)docs/verdicts/SV5PRE/BUILDER_RECEIPT.md'` (exit 0); excludes only this self-documenting receipt. The accompanying full `git diff --name-only`/status and lane verifier include it; no other path changes.

```text
 .../api/src/final-account-lock.application.test.ts | 29 +++++++++++++
 apps/api/src/final-account-lock.application.ts     |  6 +--
 apps/api/src/shadow-detection.worker.test.ts       |  2 +-
 apps/web/e2e/M4-3-S.spec.ts                        |  2 +
 apps/web/e2e/helpers/customer-invoice-journey.ts   | 48 ++++++++++++++++++++++
 .../web/e2e/helpers/recovery-allocation-journey.ts |  2 +
 apps/web/e2e/helpers/recovery-sources.ts           |  2 +
 config/agent-lane-assignments.json                 |  2 +-
 packages/db/test/UIWIRE-10.integration.test.ts     |  3 +-
 packages/db/test/UIWIRE-11.integration.test.ts     |  3 +-
 packages/db/test/UIWIRE-12.integration.test.ts     |  8 ++++
 .../final-account-lock-invoice.integration.test.ts | 28 +++++++++++++
 12 files changed, 128 insertions(+), 7 deletions(-)
```

## Repair r1 — dispatcher 4, 13 October 2026

Scope: only Opus findings 1 and 2 in `/Users/benharwood/.local/share/full-steam/jg-runs/sv5pre-opus-bfae9df.md`. That independent verdict is REPAIR, source-inspected only, bound to bfae9df. No independent verdict exists for this uncommitted repair; no acceptance is claimed. Dispatcher owns both the commit split and review of the resulting exact commits. The initial build log and hashes below are historical evidence for bfae9df; r1 evidence here supersedes them where bytes changed.

Finding 1: `serialize_final_check_evidence` retains job serialization and upload identity validation but assigns no field in either merged evidence table. Supplied upload and original-object receipts are preserved. A later upload claiming a receipt at/before an existing lock is refused instead of silently backdated. The new manifest-side `evidence_received_at` binds the object's exact composite identity separately from `source_received_at`, which still freezes the upload receipt. Attempt validation and authoritative publication independently require the object's receipt at/before cutoff and its frozen identity when available. An unfinished pre-lock upload remains inventoried; the existing evidence service's late finalization copies its original upload receipt. Both stages, verified input, matching versions, classifications, immutable result and certificate remain required. Invoice issue re-verifies the same predicate, including refusal of any original object claiming a pre-cutoff receipt outside the frozen upload inventory. No gate, authorization check, existing grant, policy, column or assertion is relaxed.

Finding 2: a NEW `beforeAll(...,60000)` builds `createHistoricalInvoice()` and a new `afterAll` closes it. The old beforeAll and the interim assertion remain byte-identical; no existing test timeout changes. Read-only Python comparison against HEAD verified the exact assertion, old hook and exactly one added hook timeout.

Tests were written before the SQL repair. Their first database run is **NOT RUN (cannot start PostgreSQL here)**, not a claimed observed failure. Added regression titles: `PRE-Q5-03 r1 preserves supplied upload and object times and their composite identity`; `PRE-Q5-03 r1 refuses a post-lock upload backdated into the frozen inventory`; `PRE-Q5-04 r1 a post-cutoff object cannot pass as pre-lock evidence`; `PRE-Q5-03 r1 a pre-cutoff object outside the frozen upload inventory blocks completion`. The last regression and its SQL predicate were added during final source inspection after forced build/lint/typecheck; no runtime TypeScript changed afterward. Database tests are outside packages/db/tsconfig.json's src-only check, so their syntax was separately transpiled without running PostgreSQL; none is claimed executed. The lane's late-finalization fixture now supplies the original stored upload receipt, as `EvidenceService` already does, instead of relying on a trigger overwrite. The own-0147 upgrade proof seeds both evidence tables with distinct microsecond receipt values, compares their named pre-existing columns and full types by original primary-key identity through N and later migrations, and exercises post-upgrade insertion preserving supplied composite identities. All original comparator controls are retained. The three merged evidence suites cited by Opus are untouched.

All pnpm commands below prefixed `export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-pnpm-sv5pre:$PATH"`. The existing wrapper invokes installed pinned pnpm 10.28.1; no install/download was attempted. Memory/disk probes before checks returned 0 with 74% free memory and 52 GB available. Each check ran sequentially, with at most two Vitest workers; no build/test overlap.

| r1 command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/final-check-completion.test.ts` | 0 | 11 tests, 1 file passed |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/sv5pre-worker-registration.test.ts` | 0 | 5 tests, 1 file passed; mocked composition only |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0 | 7/7 tasks, 0 cached |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0 | Core purity 153 files; lane/money boundary passed |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | sv5pre boundary passed |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force --concurrency=2` | 0 | 7/7 tasks, 0 cached |
| `pnpm build --concurrency=2 --force` | 0 | 7/7 tasks, 0 cached; 30 Next static pages generated |
| `pnpm --filter @jobguard/api openapi:check` | 1 | BLOCKED before generator execution: tsx socket `listen EPERM` |
| Nonexecuting `node --input-type=module` / TypeScript `transpileModule` syntax check on the three changed database test files | 0 | 3 syntax checks passed; not database execution or semantic typechecking |

Read-only r1 commands: `pwd`, `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`, `git diff --check`, `git diff --stat`, `git diff --name-only`, targeted `git diff -- <paths>`; `cat`, `sed`, `rg -n`, `ls -l`, `node --version`, `memory_pressure | tail -1`, `df -g /System/Volumes/Data` on the named sources/configuration/verdict. All returned 0. Python source/test/receipt edits and read-only byte/hash comparisons returned 0. The read-only Python verifier used `git show HEAD:<path>` and `git show origin/main:<path>` for every coordinator STOP file and the three evidence suites. All 16 are identical to r1 HEAD; 15 are also identical to origin/main. UIWIRE-12 differs from origin/main only by its already-reviewed bfae9df amendment and is untouched in r1. No git write command was used.

Source-inspected only: SQL receive-time repair, Q5 relational gate and upgrade controls. Test-executed: 16 prerequisite unit tests, forced compile/lint checks. Independently verified: prior Opus REPAIR verdict only; the r1 diff remains unreviewed.

Repair r1 database NOT RUN files: `packages/db/test/sv5pre-completion.integration.test.ts`, `sv5pre-upgrade.integration.test.ts`, `final-account-lock-invoice.integration.test.ts` (cannot start PostgreSQL here). Also explicitly NOT RUN for this evidence-trigger repair: `packages/db/test/shadow-persistence.integration.test.ts`, `shadow-detection.integration.test.ts`, `shadow-isolation-query-log.integration.test.ts`, `practice-session.integration.test.ts`, `recovery.integration.test.ts`, `recovery-follow-up.integration.test.ts`, and the suites using `extra-fixtures.ts`/`evidence-pack-fixture.ts` (cannot start PostgreSQL here; dispatcher must cover them in exhaustive batching). The original NOT RUN manifest below remains in force, including own legacy/access/worker/socket suites, other merged boundary suites, the four P2 helpers and `apps/web/e2e/SV-4.spec.ts` (cannot start PostgreSQL/browser here). `pnpm test`, `test:db`, `test:migrations`, `test:e2e` and applicable eval remain dispatcher-owned, NOT RUN. No provider/model/prompt change.

Standard F unchanged: r1 adds no GRANT. Every migration GRANT is listed individually in the existing Standard F section below; runtime still gains SELECT on opaque completion only, with no runtime DML or new callable helper. Forward-fix only; do not remove invoice gates or rewrite history.


Named fixture consumers also NOT RUN (cannot start PostgreSQL here; read-only `rg -l` enumeration returned 0):

- packages/db/test/contractor-session-context.integration.test.ts
- packages/db/test/evidence-pack-sources.integration.test.ts
- packages/db/test/evidence-pack-upgrade.integration.test.ts
- packages/db/test/evidence-packs.integration.test.ts
- packages/db/test/extra-links.integration.test.ts
- packages/db/test/extra-origin-upgrade.integration.test.ts
- packages/db/test/extra-origin.integration.test.ts
- packages/db/test/extra-unlink.integration.test.ts
- packages/db/test/recovery-follow-up-upgrade.integration.test.ts
- packages/db/test/recovery-message-upgrade.integration.test.ts
- packages/db/test/recovery-messages.integration.test.ts
- packages/db/test/site-extra-authority.integration.test.ts
- packages/db/test/site-extra-order-check.integration.test.ts
- packages/db/test/site-extra-pricing-upgrade.integration.test.ts
- packages/db/test/site-extra-pricing.integration.test.ts
- packages/db/test/site-extra.integration.test.ts

OpenAPI STOP command: `export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-pnpm-sv5pre:$PATH"; pnpm --filter @jobguard/api openapi:check` (exit 1). Exact refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/34562.pipe`. No alternate route or escalation was attempted. OpenAPI generation/comparison is NOT RUN because tsx failed before loading the generator. Forced checks emitted Turbo cache IO warnings, and build retained existing Next workspace-root/CSS warnings; each forced check still executed all seven tasks with zero cache hits and exited 0. Final disk probe: 52 GB available, above 45 GB.

## Original build validation and commands

Node is v24.17.0. A local copy of pinned pnpm 10.28.1 was used without install/download. The default pnpm launcher (v11) stalled twice before unit tests and once in Turbo children: these attempts were interrupted (130). `/private/tmp/jg-pnpm-sv5pre/pnpm` points at the already-installed `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Each subsequent pnpm command prefixed `export PATH="$HOME/Library/pnpm/bin:$PATH"` and the temporary wrapper path. Repository package/config scripts are unchanged.

| Command actually executed | Exit | Counts/result |
| --- | --- | --- |
| Default `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/sv5pre-worker-registration.test.ts`, twice (second with npm_config_manage_package_manager_versions=false) | 130 each | Stalled; no tests ran |
| Incorrect relative `apps/api/node_modules/.bin/vitest run --maxWorkers=2 src/sv5pre-worker-registration.test.ts` from API cwd | 127 | Missing relative path, corrected |
| Installed `node_modules/.bin/vitest run --maxWorkers=2 src/sv5pre-worker-registration.test.ts` from API cwd, before implementation | 1 | 1 failed suite, 0 tests; missing worker-task-extensions module |
| Installed `node_modules/.bin/vitest run --maxWorkers=2 src/final-check-completion.test.ts` from core cwd, before implementation | 1 | 1 failed suite, 0 tests; missing completion module |
| Same core command after implementation | 0 | 11 passed / 1 file |
| Same worker command before build outputs | 1 | 3 passed, 2 failed / 1 file; @jobguard/db dist absent |
| First `pnpm exec turbo run typecheck --force --concurrency=2` with shell function but default child launcher | 130 | Stalled children; interrupted |
| `pnpm exec turbo run typecheck --force --concurrency=2` with pinned wrapper PATH | 2 | 2 successful / 3 scheduled; core TS narrowing errors at :96–104 |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0 | Core purity: 153 files; lane and money arithmetic boundary passed |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force --concurrency=2` | 0 | 7/7 packages; 0 cached; tsc --noEmit compiled corrected source |
| `pnpm build --concurrency=2 --force` | 0 | 7/7 packages; 0 cached; API/database/full Next production build |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/final-check-completion.test.ts` after correction/build | 0 | 11 passed / 1 file |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/sv5pre-worker-registration.test.ts` after build | 0 | 5 passed / 1 file |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Exact registered lane passed including untracked files |
| `pnpm --filter @jobguard/api openapi:check` | 1 | tsx IPC listen EPERM; stopped before generation |
| `git diff --check` after changes | 0 | No whitespace errors |
| `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`, `git merge-base HEAD origin/main`, `git diff --name-status HEAD origin/main`, `git diff --stat HEAD`, `git diff --numstat` | 0 | Initial base matched; main later advanced; change/overlap manifest recorded |
| Protected hash / worker reconstruction / changed-file manifest Python script | 0 | 31 protected files identical; worker +3 only; 34 changed non-receipt files |
| First receipt generation Python script | 1 | NameError for missing local base variable; no receipt write occurred; corrected below |

Tests were written before their proving implementation. Database first runs are NOT RUN (cannot start PostgreSQL), not a claimed red/green cycle. The HTTP adapter test preceded its filter/adapter. Missing-module failures are labelled as such. Core narrowing was corrected by a never-returning function declaration, preserving all conditions without casts. Its original forced typecheck failure is not relabelled a pass: the corrected source subsequently compiled under forced lint/build. Following the issued once-at-end limit, final forced typecheck remains owed to dispatcher.

All executed lint/build checks used --force and zero cache hits. Before heavy commands `memory_pressure | tail -1` and `df -g /System/Volumes/Data` returned 0 and showed 70–73% free memory / 65–66 GB free disk. No tests ran concurrently, every Vitest selected one own file with --maxWorkers=2, no build and test overlapped. No database/browser run bypassed heavy-slot; none was attempted. No whole-package/repository suite ran.

Turbo reported `WARNING IO error: Operation not permitted (os error 1)` for shared-cache writes; no alternate cache-write route was used. The successful build also reported existing Next workspace-root/CSS warnings; no UI edits were made.

Permission stops: `ps -axo pid,ppid,etime,command | rg 'pnpm|vitest' | head -15` produced `zsh:1: operation not permitted: ps`; inspection stopped. `pnpm --filter @jobguard/api openapi:check` produced `Error: listen EPERM: operation not permitted .../T/tsx-501/24504.pipe`; validation stopped and was not rerouted.

Read-only source inspection used pwd, cat, sed, rg/rg --files, head/tail, wc, nl, command -v, ls, node --version and git show/diff/ls-files against the sources named in this receipt. Successful invocations returned 0. Failed guessed paths were reported as nonexistent, then corrected: final-account-lock-fixtures.ts, final-account-lock-test-fixtures.ts, final-account-lock.fixtures.ts, final-account-lock.filter.ts, final-account-lock-sv4.filter.ts, final-account-lock.http.test.ts, final-account-lock.errors.ts, practice-context.ts, practice-session-context.ts, UIWIRE-8.integration.test.ts and an initially guessed 0128 filename. Agent upgrade inspection also found no customer-receipt-repository.ts (1), corrected to PracticeInvoiceRepository. These are inspection failures, not test evidence. Edits used heredocs/Python writes only in the issued lane or /private/tmp (0 except the receipt script above). No git write, cleanup, install, external send or provider call occurred.

## Main wins; rebase required

HEAD/origin/main initially equalled the issued base. During checks origin/main advanced to `6659fb58791ec22588948f005b2bd4f6b299fa48` (ENT-3b). Main wins. It adds actual migration 0139 at current `packages/db/src/migrate.ts:80`, moves 0140 to :81 and adds closeout catalogs/registrations. The final-check catalog insertion points are now tenancy :252/:492. The invoice routines, worker, context scanner and §10 SV-5 card are unchanged. The ledger gains an ENT-3b paragraph. No rebase/git write or out-of-lane migration copy was attempted. Dispatcher must rebase shared registrations and include actual 0139 before running the own-0147 proof.

## NOT RUN manifest

Each file below is NOT RUN (cannot start PostgreSQL here; merged suites are also dispatcher-owned):

- packages/db/test/sv5pre-legacy-invoice.integration.test.ts
- packages/db/test/sv5pre-completion.integration.test.ts
- packages/db/test/sv5pre-completion-access.integration.test.ts
- packages/db/test/sv5pre-upgrade.integration.test.ts
- packages/db/test/final-account-lock-invoice.integration.test.ts
- packages/db/test/final-account-lock.integration.test.ts
- packages/db/test/final-account-lock-upgrade.integration.test.ts
- packages/db/test/shadow-catalog.integration.test.ts
- packages/db/test/fingerprinted-row-shape.integration.test.ts
- packages/db/test/tenancy.integration.test.ts
- packages/db/test/UIWIRE-10.integration.test.ts
- packages/db/test/UIWIRE-11.integration.test.ts
- packages/db/test/UIWIRE-12.integration.test.ts
- packages/db/test/practice-facts.integration.test.ts
- packages/db/test/practice-feed.integration.test.ts
- packages/db/test/recovery-allocation.integration.test.ts
- packages/db/test/recovery-allocation-races.integration.test.ts
- packages/db/test/recovery-line-allocation.integration.test.ts
- packages/db/test/recovery-allocation-upgrade.integration.test.ts
- packages/db/test/recovery-case-terms.integration.test.ts
- packages/db/test/recovery-case-terms-upgrade.integration.test.ts
- packages/db/test/job-parties.integration.test.ts
- packages/db/test/demo-bootstrap.integration.test.ts

Other NOT RUN files/checks:

- apps/api/src/sv5pre-worker-execution.integration.test.ts: cannot start PostgreSQL/actual worker/socket process. Two tests distinguish injected domain-port acknowledgment from actual uninstalled-handler failure; neither proves SV5-32.
- apps/api/src/sv5pre-invoice.http.test.ts: cannot bind HTTP sockets. Four adapter/refusal cases remain unexecuted.
- apps/api/src/shadow-isolation.application.test.ts: PostgreSQL/HTTP/Next/browser unavailable; source prerequisite STOP below.
- apps/api/src/auth/context-boundary.test.ts: unchanged merged suite, dispatcher-owned under run-only-own-piece rule.
- apps/api/src/shadow-detection.worker.test.ts: unchanged merged suite, protected task-list STOP below.
- All affected browser journeys, including four P2 callers: cannot start browser/PostgreSQL; shared fixture seam held below.
- pnpm test, test:db, test:migrations, test:e2e and applicable eval: dispatcher-owned exhaustive sequential batching; no aggregate result claimed. No AI prompt/model/parser changed.

## Separate coordinator-approved A-D commit

Intended subject: `test(final-check): coordinator-approved A-D`. Exactly these ten EXISTING files belong in that separate dispatcher commit, apart from implementation:

1. apps/api/src/worker.ts — C, two imports + one invocation only.
2. packages/db/test/tenancy.integration.test.ts — C, six alphabetical rows in each of two catalogs, additive only.
3. packages/db/test/final-account-lock-invoice.integration.test.ts — B/D, valid completion premise + Q1 tightening.
4. packages/db/test/UIWIRE-12.integration.test.ts — D, genuine historical two-invoice premise + additive named proof; other fresh-invoice setup held.
5. packages/db/test/recovery-allocation.integration.test.ts — A.
6. packages/db/test/recovery-allocation-races.integration.test.ts — A.
7. packages/db/test/recovery-allocation-upgrade.integration.test.ts — A, historical branch explicit.
8. packages/db/test/recovery-line-allocation.integration.test.ts — A.
9. packages/db/test/recovery-case-terms.integration.test.ts — A, main/control prerequisites; privileged historical negative setup unchanged.
10. packages/db/test/recovery-case-terms-upgrade.integration.test.ts — A, historical branch explicit.

All six A files preserve original issue calls and every later assertion. Before-0136/v1 and before-0134 fixture construction explicitly retains old issuance under those earlier schemas; the schema check is test-only and never a production exemption. Four stopped A files were restored entirely; UIWIRE-12's freshInvoice issue call is unchanged.

## D preservation table — both RED reviewers must confirm row by row

| Old assertion / mechanism | Named replacement or unchanged assertion | Why equal or stronger |
| --- | --- | --- |
| final-account-lock-invoice :9–12 inserts completed with null run | appendCheck delegates valid completion to publishEmptyCompletion through checked publication | Same check ID return; now genuine manifest/run/canonical result/certificate |
| :30–32/:97 expect 23503 for wrong lock/job/cutoff | Existing exact-lock/microsecond and foreign-tenant named tests unchanged, all 23503 expectations retained | Invalid overrides still raw insert; qualified refusal precedes proof validation, no certificate/effect |
| :37–55 F7 £40,320 main / £960 supplementary, parties/replay/source/check IDs | `F7 main £40,320 and supplementary £960...` assertions byte-identical | Genuine completion premise; all money/source/no-rebilling guarantees retained |
| :57–64 completion then failure; shadow read/rewrite/runtime insert refused | `latest append-only check fact overrides an older completion...` unchanged | Real completion precedes later failure; every 42501 and issue refusal retained |
| :72–85 completion/issue and pending/failed races | Existing named race/count/outcome assertions unchanged; new PRE-Q5-13 adds certificate join | Never permits a previously refused outcome; any issued invoice additionally requires its committed certificate |
| Q1 fresh legacy bypass success | `Q1 new legacy final issue requires lock and changes no commercial effects` | Explicit B tightening: FINAL_ACCOUNT_LOCK_REQUIRED and ten unchanged commercial-effect counts |
| Q1 exact interim row with null lock/check | `Q1 historical interim side binding requires no lock` keeps exact expected row using actual before-0147 issuance | No fresh final relabelled; true history remains lock-free |
| UIWIRE-12 :115–121 head two-invoice same-job premise | Original setup moved byte-identically to schema0029 before upgrade; new PRE-Q4-04 distinct same-job history test | Same PAYMENT_NOT_FOUND/null reversal/wrong job/tenant assertions retained byte-for-byte |
| shadow-isolation :358–365 and all trace/error/count equality | NONE IMPLEMENTED: STOP; whole file untouched | Earlier source/time setup requires coordinator authority; no expectation weakened |

Interim pure-core guard assertion is unchanged. No deposit API was invented; deposit workflow verification remains dispatcher/browser scope. Genuine v1 history is explicit in schema0029 UIWIRE-12 and own-0147 upgrade fixtures. These DB assertions are constructed, not called passing without execution.

## Standard F; every new migration GRANT

No new runtime INSERT/UPDATE/DELETE grant, role assumption or privileged application credential was added. Hidden proof has no runtime access; opaque completion is SELECT only. Private checked triggers enforce actual session role/context/job/terms/identity. No contractor-track write route is introduced. Existing runtime business grants and shadow callable lists are unchanged.

Expanded migration GRANTs, one line each:

```sql
GRANT SELECT,INSERT ON app.final_check_manifest TO jobguard_shadow;
GRANT SELECT ON app.final_check_manifest_source TO jobguard_shadow;
GRANT SELECT,INSERT ON app.final_check_source_attempt TO jobguard_shadow;
GRANT SELECT,INSERT ON app.final_check_run_binding TO jobguard_shadow;
GRANT SELECT,INSERT ON app.final_check_reveal_proof TO jobguard_shadow;
GRANT SELECT ON app.final_check_completion TO jobguard_runtime;
```

No new callable EXECUTE grant. Private routines are migration-owned with PUBLIC/runtime/shadow/emergency/infrastructure EXECUTE revoked. Generated source/certificate INSERT requires checked nested publication; independent owner-login INSERT is refused. Existing check shadow INSERT-only posture is preserved.

## Exact STOP / BLOCKING lines

Line numbers are issued-base unless marked current. Before snippets are the exact affected call/fragment on otherwise compressed lines; after snippets are PROPOSALS, not implemented helpers. No broader edit or bypass was attempted.

| File:line | Before | After needed / why held |
| --- | --- | --- |
| packages/db/test/UIWIRE-10.integration.test.ts:5 | `const first=await repository.issue(context,input)` | Establish actual accepted baseline scope/revision/line, then `await prepareInvoicePrerequisites(admin,runtime,T,J,M,R)` before the same call. Fixture has no baseline line; A only authorizes terms/lock/completion. File fully restored. |
| packages/db/test/UIWIRE-11.integration.test.ts:4 | `invoiceId=(await repo.issue(context,{jobId:J,finalAccountRevisionId:R,actorMembershipId:M,commandId:randomUUID(),recipient:"practice@example.invalid",issuedOn:"2026-09-18"})).id` | Same missing baseline; reviewed source IDs/line needed before permitted prerequisite helper and unchanged issue. File fully restored. |
| packages/db/test/practice-facts.integration.test.ts:63 | `const issued = await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), recipient: "practice@example.invalid", issuedOn: "2026-09-19" });` | Same missing baseline; coordinator baseline fixture then terms/lock/completion before identical issue. File fully restored. |
| packages/db/test/practice-feed.integration.test.ts:64 | Same exact call as practice-facts above | Same missing baseline and held broader source setup; file fully restored. |
| packages/db/test/UIWIRE-12.integration.test.ts:25 (current :26) | `const invoice=await repo.issue(context,{jobId,finalAccountRevisionId:revisionId,actorMembershipId:M,commandId:randomUUID(),recipient:"practice@example.invalid",issuedOn:"2026-09-19"});` | Same missing baseline in freshInvoice. Broader source setup held; issue unchanged; separately approved historical relocation retained. |
| apps/api/src/shadow-detection.worker.test.ts:77 | `expect(Object.keys(options.taskList)).toEqual(["discover_outbox","execute_outbox","detect_shadow_evidence"]);` | Needed `expect(Object.keys(options.taskList)).toEqual(["discover_outbox","execute_outbox","detect_shadow_evidence","final_check"]);`. Protected merged expectation outside A-D; untouched. |
| apps/api/src/shadow-isolation.application.test.ts:120–121/:134 and :300–301/:315 | Upload INSERT lacks verified state/version; original-object and later signal-evidence INSERTs use `fixed` receive time | r1 preserves the fixed composite timestamp. Verified state/version still requires coordinator-owned prerequisite setup; none of these lines changes. The required post-lock publication at :358–365 remains STOP below. |
| apps/api/src/final-account-lock.application.ts:17 | `this.repo=new FinalAccountLockRepository(pool)` | Needed `this.repo=new FinalAccountLockRepository(practiceMaterialPool(pool,verifiedSessionDigest))` through the existing request/session seam, with reviewed imports/derivation. New explicit SQL session/job recheck fails closed because this older composition supplies no digest. File outside lane; unchanged. Never relax SQL guard. |
| packages/db/src/migrate.ts:80 on current main | Worktree jumps from 0138 to 0140 | Current main adds `new URL("../migrations/0139_site_visit_closeout.sql", import.meta.url),` before 0140. Dispatcher rebase must carry actual 0139 and shared catalog/export rows; no out-of-lane copy attempted. |

The existing lock routine at `0132_final_account_lock.sql:282` refuses an empty baseline with SCOPE_DISPOSITION_MISSING. An accepted amount alone supplies no commercial source identities. No fixture source row was invented.

P2 has four further unchanged STOP calls below. Before is each exact invoice call. After needed is a separately reviewed `await prepareAuthoritativeInvoiceFixture(page,jobId,final.account)` immediately before that same call (public terms/dispositions/lock plus checked synthetic worker publication), UI assertions unchanged. The shared e2e setup exposes no approved checked final-check fixture worker port; changing that shared harness is coordinator-owned/outside lane. Production's uninstalled handler or a queue acknowledgment cannot fabricate completion. The proposed helper is not implemented and no browser success is claimed.

- **apps/web/e2e/M4-3-S.spec.ts:57**. Before: `const invoices = await post(page, `/api/jobs/${jobId}/customer-invoices`, { version: "practice-customer-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: final.account.id, expectedSourceHash: final.account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-09-25" });`. After needed: checked fixture helper above, then that byte-identical call. No edit made.

- **apps/web/e2e/helpers/customer-invoice-journey.ts:68**. Before: `const issued=await jsonResult(page.request.post(`/api/jobs/${jobId}/customer-invoices`,{data:{version:"practice-customer-invoice.issue.v1",commandId:crypto.randomUUID(),finalAccountRevisionId:final.account.id,expectedSourceHash:final.account.sourceHash,recipient:"practice-customer@example.invalid",issuedOn:"2026-09-19"}}),"Issue synthetic invoice");`. After needed: checked fixture helper above, then that byte-identical call. No edit made.

- **apps/web/e2e/helpers/recovery-allocation-journey.ts:67**. Before: `const issued = await post(page, `/api/jobs/${jobId}/customer-invoices`, { version: "practice-customer-invoice.issue.v1", commandId: id(), finalAccountRevisionId: final.account.id, expectedSourceHash: final.account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-10-12" });`. After needed: checked fixture helper above, then that byte-identical call. No edit made.

- **apps/web/e2e/helpers/recovery-sources.ts:55**. Before: `const invoices = await post(page, `/api/jobs/${jobId}/customer-invoices`, { version: "practice-customer-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: final.account.id, expectedSourceHash: final.account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-09-25" });`. After needed: checked fixture helper above, then that byte-identical call. No edit made.


### Repair r1 complete coordinator STOP list

All AFTER values below are proposals needing coordinator action, not changes made in r1. Every BEFORE excerpt was read from this worktree and checked against HEAD. All 13 files are unchanged during r1. Shared setup must use checked synthetic publication, retain all issue calls and later assertions, and never manufacture completion or relax SQL authority.

- **STOP `packages/db/test/UIWIRE-10.integration.test.ts:5`**

BEFORE (unchanged):

```ts
const first=await repository.issue(context,input)
```

AFTER PROPOSED: Establish the missing accepted baseline scope/revision/line under coordinator authority; insert `await prepareInvoicePrerequisites(admin,runtime,T,J,M,R)` immediately before the byte-identical issue call.

- **STOP `packages/db/test/UIWIRE-11.integration.test.ts:4`**

BEFORE (unchanged):

```ts
invoiceId=(await repo.issue(context,{jobId:J,finalAccountRevisionId:R,actorMembershipId:M,commandId:randomUUID(),recipient:"practice@example.invalid",issuedOn:"2026-09-18"})).id
```

AFTER PROPOSED: Establish the missing accepted baseline source identities and line, then checked terms/lock/completion before the byte-identical call. All credit/hash/money assertions stay.

- **STOP `packages/db/test/UIWIRE-12.integration.test.ts:26`**

BEFORE (unchanged):

```ts
const invoice=await repo.issue(context,{jobId,finalAccountRevisionId:revisionId,actorMembershipId:M,commandId:randomUUID(),recipient:"practice@example.invalid",issuedOn:"2026-09-19"});
```

AFTER PROPOSED: Original order :25 is current :26. Supply the missing baseline and checked prerequisites for head-time freshInvoice only; preserve historical construction, unchanged call and receipt/reversal assertions.

- **STOP `packages/db/test/practice-facts.integration.test.ts:63`**

BEFORE (unchanged):

```ts
  const issued = await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), recipient: "practice@example.invalid", issuedOn: "2026-09-19" });
```

AFTER PROPOSED: Supply the missing baseline source identities and checked terms/lock/completion before this identical call; preserve every movement/replay/refusal/money assertion.

- **STOP `packages/db/test/practice-feed.integration.test.ts:64`**

BEFORE (unchanged):

```ts
  const issued = await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), recipient: "practice@example.invalid", issuedOn: "2026-09-19" });
```

AFTER PROPOSED: Supply the missing baseline source identities and checked terms/lock/completion before this identical call; preserve every feed assertion.

- **STOP `apps/api/src/shadow-detection.worker.test.ts:77`**

BEFORE (unchanged):

```ts
   expect(Object.keys(options.taskList)).toEqual(["discover_outbox","execute_outbox","detect_shadow_evidence"]);
```

AFTER PROPOSED: `expect(Object.keys(options.taskList)).toEqual(["discover_outbox","execute_outbox","detect_shadow_evidence","final_check"]);` Coordinator-owned task-list expectation; all later task checks unchanged.

- **STOP `apps/api/src/shadow-isolation.application.test.ts:358–365`**

BEFORE (unchanged):

```ts
   await success("final-account lock",()=>app.finalAccountLock.lock(a.jobId,{version:"final-account.lock.v1",commandId:randomUUID(),finalAccountRevisionId:a.revisionId,expectedRevision:1,declarationVersion:"final_account_declaration.v1"}));
   await success("final-account lock projection",()=>app.finalAccountLock.get(a.jobId));
   // Real authorized delivery exercises notification content and retry telemetry, with no external provider.
   let attempts=0;const adapter:import("@jobguard/db").OutboundAdapter={name:"fake_capture",supportsProviderDeduplication:false,deliver:async action=>{trace.notifications.push(action);return ++attempts===1?{kind:"retryable",code:"SYNTHETIC_RETRY"}:{kind:"succeeded",providerReference:"synthetic:Q"}},reconcile:async()=>"unknown"};
   const executor=new ActionExecutor(runtime,new Map([[adapter.name,adapter]]),{emit:(name:Parameters<import("@jobguard/db").SafeTelemetry["emit"]>[0],fields:Readonly<Record<string,string|number>>)=>trace.telemetry.push({name,fields})});
   await executor.execute(testTenantContext(DEMO_TENANT_ID),queued);await executor.execute(testTenantContext(DEMO_TENANT_ID),queued);
   expect(trace.notifications).toHaveLength(2);expect(trace.telemetry).toContainEqual(expect.objectContaining({name:"outbox.retry"}));
   await success("issue customer invoice",()=>app.customerInvoice.issue(a.jobId,{version:"practice-customer-invoice.issue.v1",commandId:randomUUID(),finalAccountRevisionId:a.revisionId,expectedSourceHash:"a".repeat(64),recipient:"fixture@example.invalid",issuedOn:"2026-10-13"}));
```

AFTER PROPOSED: Keep this entire block byte-identical and add checked worker fixture processing/publication for each copy after the lock, before issue. Earlier upload verification/version prerequisites are coordinator-owned. Preserve every trace, notification, export, error, cache and byte-equality assertion.

- **STOP `apps/web/e2e/SV-4.spec.ts:112`**

BEFORE (unchanged):

```ts
  await shadow.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) VALUES($1,$2,$3,$4,$5,'completed')",[fixture.tenantId,other.jobId,randomUUID(),foreign.id,foreign.cutoff]);
```

AFTER PROPOSED: Replace only this successful unsupported completed-fact setup with genuine manifest/run/source/result processing and checked publication for other.jobId, bound to foreign.id/foreign.cutoff. Retain both prior 23503 refusals and every later FINAL_CHECK_NOT_COMPLETE/issue assertion. A raw completed string cannot authorize issue.

- **STOP `apps/web/e2e/M4-3-S.spec.ts:57`**

BEFORE (unchanged):

```ts
  const invoices = await post(page, `/api/jobs/${jobId}/customer-invoices`, { version: "practice-customer-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: final.account.id, expectedSourceHash: final.account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-09-25" });
```

AFTER PROPOSED: Insert a coordinator-approved `await prepareAuthoritativeInvoiceFixture(page,jobId,final.account)` (terms/dispositions/lock plus checked synthetic worker publication) immediately before this identical call. UI-facing assertions unchanged; shared worker fixture port remains coordinator-owned.

- **STOP `apps/web/e2e/helpers/customer-invoice-journey.ts:68`**

BEFORE (unchanged):

```ts
 const issued=await jsonResult(page.request.post(`/api/jobs/${jobId}/customer-invoices`,{data:{version:"practice-customer-invoice.issue.v1",commandId:crypto.randomUUID(),finalAccountRevisionId:final.account.id,expectedSourceHash:final.account.sourceHash,recipient:"practice-customer@example.invalid",issuedOn:"2026-09-19"}}),"Issue synthetic invoice");
```

AFTER PROPOSED: Same checked fixture helper immediately before the identical call; all UI-facing assertions unchanged.

- **STOP `apps/web/e2e/helpers/recovery-allocation-journey.ts:67`**

BEFORE (unchanged):

```ts
  const issued = await post(page, `/api/jobs/${jobId}/customer-invoices`, { version: "practice-customer-invoice.issue.v1", commandId: id(), finalAccountRevisionId: final.account.id, expectedSourceHash: final.account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-10-12" });
```

AFTER PROPOSED: Same checked fixture helper immediately before the identical call; all UI-facing assertions unchanged.

- **STOP `apps/web/e2e/helpers/recovery-sources.ts:55`**

BEFORE (unchanged):

```ts
  const invoices = await post(page, `/api/jobs/${jobId}/customer-invoices`, { version: "practice-customer-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: final.account.id, expectedSourceHash: final.account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-09-25" });
```

AFTER PROPOSED: Same checked fixture helper immediately before the identical call; all UI-facing assertions unchanged.

- **STOP `apps/api/src/final-account-lock.application.ts:17`**

BEFORE (unchanged):

```ts
this.repo=new FinalAccountLockRepository(pool)
```

AFTER PROPOSED: `this.repo=new FinalAccountLockRepository(sessionId?practiceMaterialPool(pool,createHash("sha256").update(sessionId).digest("hex")):pool)` with coordinator-approved imports and session derivation consistent with the existing guarded invoice adapter. Carry the persisted-session digest through the existing scoped pool. Keep authority checks; do not relax the SQL guard.

## Self-review and evidence limits

Source-inspected: no old migration edited, no fingerprinted column added, no protected constructor/source hash/caller list widened. Both issuer routines use the shared authoritative certificate gate. Publication is relational and audit-atomic; empty output/inventory is explicit. Original upload receipt serializes against freezing; supplied object receipt is separately bound on the new manifest side and checked against cutoff; finalization supplies its original receipt; invalidation is rechecked, equal attempt timestamps are refused. Current owner/expiry/session/job access is rechecked before and after job wait and before replay. Application errors are normalized. No new fee/settlement/eligibility write path exists. Core consistency schemas remain in their own file (core index outside lane); SQL owns invoice authority. Lock order includes job/advisory locks before invoice sequence/audit head; no business network call in a transaction.

Test-executed: 16 own unit tests; forced lint/build; lane/core-purity/money-boundary checks. PostgreSQL guarantees, history/upgrade controls, real durable scheduling/restart, socket HTTP, OpenAPI generation, browser acceptance and whole suites are NOT RUN. A successful mocked worker composition/injected callback does not prove installed SV-5 orchestration. The actual handler remains explicitly uninstalled. No live model/provider data or professional approval is claimed.

Independent response: Opus REPAIR at bfae9df (source inspection only). The r1 working-tree repair has no independent verdict. Builder self-review is not a verdict. Both RED reviewers must bind their verdict to exact dispatcher commits and confirm the preservation table. No acceptance file is invented. The STOP lines, dispatcher exhaustive batching manifest and CI results remain required; r1 forced typecheck passed. Founder D12/D13, safety/legal/money decisions, catches/dispositions/UI and real-data release are held. LATER: reveal/UI belongs to the separate SV-5 finisher.

## Original build byte/hash evidence (before r1)

Read-only verification proved 31 protected files identical to issued HEAD, including eight reviewed practice bridges, protected context/replay/fingerprint/catalog tests, four stopped A files, four P2 callers and stopped composition/tests. Removing exactly two imports and one invocation reconstructs the old worker bytes. No permanent test pins shared/merged file hashes. Hash manifest covers 34 changed non-receipt files; untracked files are separately included by git status/lane lint.

| Unchanged file | SHA-256 |
| --- | --- |
| `apps/api/src/auth/context-boundary.test.ts` | `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35` |
| `apps/api/src/auth/principal-bridge.ts` | `a0dafefa440ee16dbcca0d52f354ea6377f478c5bdaede47a956b9e27cf4ec54` |
| `packages/db/src/tenant-context.ts` | `9237013c368deeec3d14098b030264dbd6cc3e57534e4cbc237cad06aa2b4b0f` |
| `packages/db/tools/synthetic-restore.mjs` | `b95e18b6e8794b2ca75e28990dfef38e8d77d98bb922ce185c55a128c85e11bd` |
| `packages/db/src/demo-seed.ts` | `6c4672e75c0af70accee37c05fbd95e2922ac00c9dc74bfa156721788b224da0` |
| `packages/db/test/fingerprinted-row-shape.integration.test.ts` | `be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8` |
| `packages/db/test/shadow-catalog.integration.test.ts` | `0ee8767ffdf773e515b679cb964dfa6f8b3ee511164cf2521978c221f1b3d455` |
| `packages/db/test/final-account-lock.integration.test.ts` | `8c734696ebdf2fa3fa9946250a2f71efadc634eeb7773caa8960d70d368f9b7f` |
| `packages/db/test/final-account-lock-upgrade.integration.test.ts` | `313d27a2b7df1dab714a711f5af990b43f990912c44a64526949b3dbcdd124ac` |
| `packages/db/test/watchdog-command-harness.ts` | `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` |
| `packages/db/test/command-replay-contract.integration.test.ts` | `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` |
| `packages/core/src/watchdog.ts` | `efe6f104c0a9e7ae408ce661b23fcbd181a11eb6dce65624ba61b14a73ff9de9` |
| `apps/api/src/shadow-detection.worker.test.ts` | `6416236d2558a9ce4c66d4b68091b0f30720385e732439accb760e2f464741fe` |
| `apps/api/src/shadow-isolation.application.test.ts` | `8d4f2abc7b502489ac49e56e60224623d90ff901aa41892ed40ff2bf69967006` |
| `apps/api/src/final-account-lock.application.ts` | `64bba31f463b1c36eb9ff8f1b210269ed171d0c71689d956c54e4cc538be1b16` |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` |
| `packages/db/src/contractor-repository.ts` | `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c` |
| `packages/db/src/contractor-party-repository.ts` | `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0` |
| `packages/db/src/work-order-repository.ts` | `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3` |
| `packages/db/src/sor-repository.ts` | `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5` |
| `packages/db/src/job-scheduling-repository.ts` | `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d` |
| `packages/db/src/work-order-fixtures.ts` | `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386` |
| `packages/db/src/contractor-session-context.ts` | `a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c` |
| `packages/db/test/UIWIRE-10.integration.test.ts` | `0cf23b68576d708576087786cc6ee0145ec536e065f2c674af003d9df039eb98` |
| `packages/db/test/UIWIRE-11.integration.test.ts` | `f76261d442f4a6ada85582c10ef52d700b9772b91248f3414c86de989204500d` |
| `packages/db/test/practice-facts.integration.test.ts` | `1f94ed6cefddb79f4b2664a481d7564247c52170ee81521834f43df3571f30c6` |
| `packages/db/test/practice-feed.integration.test.ts` | `0f571478e2fd81c76ae1ce7d669fd5cd7466e75ce0405e6e4d180332ca407670` |
| `apps/web/e2e/M4-3-S.spec.ts` | `8ee13e0e60b119ba35b1b8a3a4f505d12ab945ef7268dd81edd337cb2a46a268` |
| `apps/web/e2e/helpers/customer-invoice-journey.ts` | `cff1eef3d3c9310e5afc5d2cab637652b0cf3cf260d014a39e965eddb51af51c` |
| `apps/web/e2e/helpers/recovery-allocation-journey.ts` | `5e8c168459de8997d5e1b98f139d5956c083ae0593375b3dc644e1016f289016` |
| `apps/web/e2e/helpers/recovery-sources.ts` | `de0acde161ee568eb5c1ba9d8fe3ef5dbfe155f7baf9ef9c256570f154001edf` |

Changed non-receipt files (receipt self-hash omitted):

| File | SHA-256 | Lines |
| --- | --- | --- |
| `apps/api/src/customer-invoice-sv5pre.filter.ts` | `bb25558a23d10025d70067808ffdb51320ae305028841a040ec93936819a0d42` | 12 |
| `apps/api/src/customer-invoice.application.ts` | `8e2fac83cf9718794070988d580559d024176cd5396f0f176fd2d95814ab55e6` | 4 |
| `apps/api/src/customer-invoice.controller.ts` | `8e470afe04163e9692664beec06b6746bcba2ed67877a42b65626658e3d01ec9` | 6 |
| `apps/api/src/final-check-task-executor.ts` | `88ce0f67a405a83a630d99459e95d4f5e93721dea338b82ea1fe67537f1523f4` | 11 |
| `apps/api/src/sv5pre-invoice.http.test.ts` | `8c57a370758292bbc3c4cdaecb69cc9793906fb6a120f2c7774a05f7d8e141ef` | 31 |
| `apps/api/src/sv5pre-worker-execution.integration.test.ts` | `a1a4075f7fa9797ec4bf7ebedf3c3ae0453c99fb804cd1b91d1501f4eecb53a8` | 107 |
| `apps/api/src/sv5pre-worker-registration.test.ts` | `c927ff2649e6edfa518a0154084ca8ecf96d682fec5750cbfddec2b509a8b634` | 92 |
| `apps/api/src/worker-task-extensions.ts` | `f05c7c66b3860562e24ea4f5199a45aeb36b181ff0762af6afadc3f02db36d09` | 29 |
| `apps/api/src/worker.ts` | `1935b39a8c3dbe15dba3fa4240758d5c133470c8f8c50ac4f31c5ac4ba46e493` | 39 |
| `config/agent-lane-assignments.json` | `41d358d2571d6f19ef2abee837f93d54913fdb74f02617b3b51a338b3ab601f4` | 156 |
| `docs/contracts/final-account-lock-v1.md` | `75eec620083e306dc66d60ab28988c9aecd0d1dc3918bbb962c3c4bd571700e8` | 52 |
| `docs/contracts/sv5pre-completion-v1.md` | `ca20fe24310549315faf4816acee69a5bd6ba43e1bd2cf2786dfa9826f6b1bca` | 36 |
| `packages/core/src/final-check-completion.test.ts` | `f55016a09bf98a226996dfbdd9e4f0b5e955cf70c1a0e2361d16586dea034e7e` | 115 |
| `packages/core/src/final-check-completion.ts` | `dd2963ddd02cdc64d9884b99766dc8abd5148c9f78f4cbf1233f9abeca2d3214` | 111 |
| `packages/db/MIGRATIONS.md` | `13ac374fce74b7443e9aff17d327a7344a50cdba7b872364e8b7a500b215fcce` | 975 |
| `packages/db/migrations/0199_final_check_prerequisites.sql` | `af9b08de5d4a038300f686c1b8982d7fcef71f7715098d5af22871faf2030274` | 434 |
| `packages/db/src/final-check-completion-repository.ts` | `57612a1ad7618e600768f8949e669e96ad73eee440d5f79bcfea4acc48dfe876` | 73 |
| `packages/db/src/guarded-practice-invoice-repository.ts` | `c14bd7717b822bc9e444fa67d3e23b9cabbf51449a34618bd8effc6d23c2ab12` | 36 |
| `packages/db/src/index.ts` | `63059a84364f7a240b7af6a34fb0827edcadbcdacf5e501ab4f03cd5d06d8fed` | 94 |
| `packages/db/src/migrate.ts` | `a15b8fa011e6a3e6bcab2270351a353dc3239d190def04db94bf77d1cdd6f536` | 99 |
| `packages/db/test/UIWIRE-12.integration.test.ts` | `793ba0c4d3f54b5196c5b17f7fe5897309185185861e8837499ce5c72058ce04` | 176 |
| `packages/db/test/final-account-lock-invoice.integration.test.ts` | `9495d7b71581053093be62f14ffb7a65e1d153fb4f1618bbdabffd994b69fb3f` | 114 |
| `packages/db/test/recovery-allocation-races.integration.test.ts` | `90646a33f28edc7873558f34ff954e34f60a1116b5005a1a7a1092fe38aa4041` | 380 |
| `packages/db/test/recovery-allocation-upgrade.integration.test.ts` | `d312711b99a0cbd1b4d8486741e0124b6652400ec2fac79ee87cb8e22e0627bd` | 234 |
| `packages/db/test/recovery-allocation.integration.test.ts` | `1fc0aae7a23bbed8b5fc1d6aa105b91f89e54a22af1f215580508444b750be09` | 496 |
| `packages/db/test/recovery-case-terms-upgrade.integration.test.ts` | `33667b806804a0bb39025773c785a66a770610de025c485088000493623da18d` | 101 |
| `packages/db/test/recovery-case-terms.integration.test.ts` | `67f80623685a1329be40a9d0f9428243b854f323a98c31e264bb44c6c35f6e17` | 227 |
| `packages/db/test/recovery-line-allocation.integration.test.ts` | `f069e3ab4ac74d531a129671b6fbf6fa2757a4bf89ee9baa89b8533514023984` | 317 |
| `packages/db/test/sv5pre-completion-access.integration.test.ts` | `74a0226bd0fd5ec6534816b49bdb96d4060e1bb0d2bf60dc727651fccae9dc1b` | 28 |
| `packages/db/test/sv5pre-completion.integration.test.ts` | `29af5379f83ad1ba28c5384e980d4f33cb0264ae77709546b2fb8d24601e05f6` | 123 |
| `packages/db/test/sv5pre-fixtures.ts` | `91f158fd82838366a432e32698c0089a8f65bcc41f6d92ff9be5f84c2b9bd89f` | 129 |
| `packages/db/test/sv5pre-legacy-invoice.integration.test.ts` | `a4d282d9bfcce7e35020fce96785730427b303f2c1182736dcb69ae931471d71` | 73 |
| `packages/db/test/sv5pre-upgrade.integration.test.ts` | `94ef94ca0fcf523ae04de61b50f1ea846cb9e63c9f7559a3266ec881e206c3de` | 150 |
| `packages/db/test/tenancy.integration.test.ts` | `ff2113c9d5122b5444a82d2d8855812c780066a3542e6588d283f7ea36dece27` | 649 |

Tracked `git diff --stat HEAD` (new files separately hashed above):

```text
 apps/api/src/customer-invoice.application.ts        |  4 ++--
 apps/api/src/customer-invoice.controller.ts         |  3 +++
 apps/api/src/worker.ts                              |  3 +++
 config/agent-lane-assignments.json                  |  1 +
 docs/contracts/final-account-lock-v1.md             |  4 ++++
 packages/db/MIGRATIONS.md                           |  4 ++++
 packages/db/src/index.ts                            |  3 +++
 packages/db/src/migrate.ts                          |  1 +
 packages/db/test/UIWIRE-12.integration.test.ts      | 21 +++++++++++++++++----
 .../final-account-lock-invoice.integration.test.ts  | 20 ++++++++++++++++----
 .../recovery-allocation-races.integration.test.ts   |  2 ++
 .../recovery-allocation-upgrade.integration.test.ts |  3 +++
 .../db/test/recovery-allocation.integration.test.ts |  2 ++
 .../recovery-case-terms-upgrade.integration.test.ts |  3 ++-
 .../db/test/recovery-case-terms.integration.test.ts |  4 +++-
 .../recovery-line-allocation.integration.test.ts    |  2 ++
 packages/db/test/tenancy.integration.test.ts        | 12 ++++++++++++
 17 files changed, 80 insertions(+), 12 deletions(-)
```

Supporting reconstruction reports: `/private/tmp/sv5pre-a-fixture-invariance.json`, `/private/tmp/sv5pre-four-fixture-stops.json`, `/private/tmp/sv5pre-uiwire12-invariance-final.json`. Four stopped A files equal HEAD. UIWIRE-12's unchanged 4,240-byte assertion tail SHA-256 is `b6c0b98cb27a84431c39d2b5ae833a62c302ebc1011c9a7468b2678ac7dafb6d`. Worker original SHA-256 `372532c1aa575ad775df66c50a32fecd5881d703fd00d80136608bea4bccbd8f`, current `1935b39a8c3dbe15dba3fa4240758d5c133470c8f8c50ac4f31c5ac4ba46e493`. Migration 0147 SHA-256 `af9b08de5d4a038300f686c1b8982d7fcef71f7715098d5af22871faf2030274`.

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

Own proof uses named-column canonical JSON text, full format_type names/types, captured primary-key identities, per-table seeded-row guards and rolled-back microsecond/retype failures plus nullable-column/function/later-insert passes. It remains NOT RUN, including after main rebase.

Original pre-dispatch builder HEAD was `2350b1a718b76aabdedd1782f02e92f516914246`; dispatcher committed the original work at `bfae9dfd38a6671d44e3db7f6f41ee32da461398`. Current r1 edits are uncommitted at that head. Intended implementation message `/private/tmp/jg-msg-sv5pre.txt`; separate amendment message `/private/tmp/jg-msg-sv5pre-coordinator-approved-A-D.txt`. Dispatcher owns rebase/commit/push; exact reviewed implementation SHA does not yet exist.

Original-build documentation/message write commands returned 0. Original-build `git diff --check` and read-only HEAD/status/hash checks returned 0; the r1 changes and their verification are recorded separately above.

## Repair r1 final byte/hash evidence and handoff

Read-only final scope/grant comparison (Python plus git diff/show) returned 0: exactly the six r1 files below changed, every GRANT line is byte-identical to bfae9df, and the serialization function assigns no receive-time field. All coordinator STOP files and the three cited merged evidence suites remain identical to bfae9df. No old migration, protected test, UI, shared worker or session composition was edited during repair. Receipt self-hash is omitted.

| r1 changed file | SHA-256 |
| --- | --- |
| `docs/contracts/sv5pre-completion-v1.md` | `baa48bf5fcfd4864f536a4308f481d82b52ad9338e6711c8ff959a282248b527` |
| `packages/db/migrations/0199_final_check_prerequisites.sql` | `a75ec3e6d819954628d5b32298ca436ba3bb9a8dae4845daa8ba27bd7cabff96` |
| `packages/db/test/final-account-lock-invoice.integration.test.ts` | `ac0b6e2783daa5ec696ab2111cdaf3950bd8f2ba531f681e062d659972b10180` |
| `packages/db/test/sv5pre-completion.integration.test.ts` | `7272642ae5509456d232023055b4462417fcb51933a03f16186226a2f2fd26c1` |
| `packages/db/test/sv5pre-upgrade.integration.test.ts` | `0083ff31098a407ce440191a044bd53aeddc5d5c2e4ac9a89907ec6d3c0e8cb9` |

Final read-only `git diff --stat HEAD` (working tree only):

```text
 docs/contracts/sv5pre-completion-v1.md             |   2 +-
 docs/verdicts/SV5PRE/BUILDER_RECEIPT.md            | 238 ++++++++++++++++++++-
 .../migrations/0199_final_check_prerequisites.sql  |  30 +--
 .../final-account-lock-invoice.integration.test.ts |   6 +-
 .../db/test/sv5pre-completion.integration.test.ts  |  43 +++-
 .../db/test/sv5pre-upgrade.integration.test.ts     |  18 +-
 6 files changed, 308 insertions(+), 29 deletions(-)
```

Final local HEAD `bfae9dfd38a6671d44e3db7f6f41ee32da461398`; r1 remains uncommitted. Intended message overwritten at `/private/tmp/jg-msg-sv5pre.txt`. Dispatcher owns split/commit/push; the prior A-D list above remains its responsibility. No git write, new permission request or acceptance occurred. Final Python receipt/message writes and read-only diff/status/head checks returned 0.


## Repair r8 — structural completion-proof isolation (13 October 2026, dispatcher 4)

Coordinator-issued implementation, following the read-only Sol analysis. Builder base `b6fc0251608749581d2acc1edc57eabc10138f46`; this round is an uncommitted working-tree diff. No git write, dependency installation, external send, independent verdict, technical acceptance or release occurred.

Migration 0147 is this piece's own unmerged migration and is edited in place. `final_check_source_attempt`, `final_check_reveal_proof`, `final_check_run_binding` and `final_check_completion` are now `shadow_final_check_*`. All qualified FKs, table-targeted guards/triggers, FORCE RLS policies, grants, row types, worker repository SQL and fixture SQL follow those names. The certificate has no runtime SELECT policy/grant. The generated certificate remains trigger-only; manifest/source permissions and the original INSERT-only check boundary remain. The tenancy rows added by this piece are renamed and moved to the correct name order; no other catalogue row changes.

Public manifests, sources and `final_account_lock_check` retain signal-independent identities. The completion audit payload is exactly the generic check/run/lock references, without result hashes or descriptors. The verified digest stays in the private certificate. No new reveal path/public signal fact is created. Both invoice issuers still perform complete proof revalidation through private `require_authoritative_final_check`, now a SECURITY DEFINER routine returning only `complete`, `check_id`, `run_id`, `lock_id`. Its explicit context check and private EXECUTE ACL prevent a new request-side capability. All pending/failed/invalidated/missing-source/missing-result refusals remain. The helper's OUT column references are qualified to avoid PL/pgSQL name ambiguity.

Test Q has setup additions only: fix its disposable fixture clock before the original upload INSERT, finalise that upload after the original object INSERT, then publish checked completion immediately before the unchanged invoice issue. The helper inventories every source and records both stages, classifications or explicit zero proof, binding and publication. Its optional deterministic mode derives identities from tenant/job/lock/source with a separate per-signal namespace; it consumes neither the JavaScript public UUID counter nor variable SQL UUID calls. Original :300 is byte-identical (now :302); original :393, the complete non-shadow table enumeration, is byte-identical (now :400). Every pre-existing expectation line is retained, except the explicitly authorised table-name substitutions. No comparison, field exclusion, error expectation or invoice issue assertion is weakened.

Own new `sv5pre-completion-isolation.integration.test.ts` seeds one verified nonempty source and a real locked account, clones its database, replays zero versus 25 hidden evidence-linked signals through checked worker publication, requires different private result digests and identical bytes for EVERY non-shadow table across ALL non-system schemas (including complete audit events/head). No field normalisation/exclusion is used. It also asserts runtime refusal on each private proof relation and the private predicate, generic audit content, and the predicate's exact boolean/id-only result. This test is written and typechecked, NOT PostgreSQL-executed here. Existing access and rule-9 upgrade proofs retain their assertions, follow renamed tables, and gain private-grant/absent-old-relation checks. Rule 9 still installs all before N, snapshots real history, applies N alone and compares old named columns/types/ACLs, then migrates the remainder twice with its existing rolled-back negative/positive controls.

Executed with existing installed dependencies, Node `v24.17.0`, cached pinned pnpm `10.28.1` via `/private/tmp/sv5pre-r8-bin/pnpm` (the global pnpm wrapper waited for version management and was interrupted; no package download/install was requested):

| Command/check | Result |
| --- | --- |
| `pnpm typecheck` | PASS, 7 tasks successful, 2 cached; log `/private/tmp/sv5pre-r8-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, 7 tasks successful, 2 cached; log `/private/tmp/sv5pre-r8-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS; log `/private/tmp/sv5pre-r8-lanes.log` |
| `pnpm build` | PASS, 7 tasks successful, 2 cached; log `/private/tmp/sv5pre-r8-build.log`; existing CSS autoprefixer warnings and sandbox Turbo cache IO warnings |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage exec vitest run src` | PASS, 2,332 source tests across 85 files; log `/private/tmp/sv5pre-r8-unit-source.log` |
| `pnpm --filter @jobguard/api exec vitest run src/sv5pre-worker-registration.test.ts src/shadow-detection.worker.test.ts src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/customer-invoice-sv5pre.filter.test.ts` | PASS, 36 tests across 5 files; log `/private/tmp/sv5pre-r8-unit-api-socket-free.log` |
| `pnpm --filter @jobguard/web exec vitest run 'app/api/jobs/[id]/customer-invoices/route.test.ts'` | PASS, 30 tests; log `/private/tmp/sv5pre-r8-unit-web.log` |
| `pnpm openapi:check` | BLOCKED by tsx IPC `listen EPERM`; log `/private/tmp/sv5pre-r8-openapi.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, same OpenAPI check without CLI IPC; log `/private/tmp/sv5pre-r8-openapi-node.log` |
| Additional TypeScript program using db config, no emit, including new isolation test + own upgrade/access tests and their fixture imports | PASS, 0 diagnostics; log `/private/tmp/sv5pre-r8-db-test-typecheck.log` |
| Read-only protected-line/expectation check | PASS: :300/:393 bytes retained; existing expectation lines preserved after authorised table renames |
| Read-only SQL function comparison | PASS: `guard_final_check_attempt`, `guard_final_check_result`, `guard_final_check_binding`, `verify_final_check_run` are identical after table-name substitution; every proof check retained |
| Read-only migration scope and `git diff --check` | PASS: only unmerged 0147 changed; no old migration changed |

Initial broad package `test` invocation failed two emitted `dist/*.test.js` copies which look for source `.ts` files under `dist` (4,496 tests passed); the complete source-only suite then passed. Initial API selection included an existing real-database isolation suite (no free port) and HTTP/supertest suite (`listen EPERM`, 4 failures/4 socket errors); 38 tests passed, 1 skipped. The socket-free selection passed separately. Neither failure was addressed by changing expectations. Whole `pnpm test`, DB/migration suites, completed Test Q, browser suites and native suites are not claimed as passed; no PostgreSQL server was started. Root tool tests were not run because their fixture git mutations conflict with this round's no-git-write instruction. No fresh install or live-model/provider evaluation is claimed.

Mac/CI must execute `pnpm test:db`, `pnpm test:migrations`, new completion isolation, existing completion/access/session/history suites, completed application Test Q and applicable browser checks. Runtime grants/RLS/catalogues, actual PostgreSQL enforcement, race/invalidation/retry guarantees and byte equality remain unverified until those executions. Independent verdict must bind the dispatcher commit; founder acceptance/merge and all existing D12/D13/SV-5/real-data gates remain held. No new operational alert/provider route or business policy is introduced. If deployed, use additive forward fixes while retaining fail-closed invoice authority; never reinterpret historical data or remove the gate.

Intended dispatcher commit message overwritten at `/private/tmp/jg-msg-sv5pre.txt`.


## Repair r10 — Graphile ownership and privileged invalidation compatibility (14 October 2026, dispatcher 5)

PR #189, pushed head `d060a17e266e675fad07b627efa4457b7f2ec17d`. Initial read-only `git branch --show-current` returned `codex/sandbox/sv5pre`; `git rev-parse HEAD` returned `71f8240f25ebeb69c2ec4769a16c26f8f43e5d35` (`chore: sync local SV5PRE with pushed head`). Read-only `git diff --stat d060a17 HEAD` was empty: this local sync commit has the pushed head's exact tree. Initial status was clean. Work remains an uncommitted working-tree diff atop that identical tree. No Git-writing command, dependency install/download, database start, provider action, verdict, acceptance, push or release was performed.

Read AGENTS.md, BUILD_PLAN.md §§2.4, 5.8, SV-4/SV-5 task/Done-when and the piece's completion contract. Read the entire 900-line filtered log `/Users/benharwood/.local/share/full-steam/jg-runs/sv5pre-ci-failed-38498222280.log` for CI run 38498222280. Every failed test shown in that log:

1. `apps/api/src/sv5pre-worker-execution.integration.test.ts`: `PRE-Q6-03 PRE-Q6-06 a durable registered task reaches its handler after worker restart` — timeout waiting for injected final-check domain port, preceded by SQLSTATE 42501 on Graphile `_private_tasks`.
2. Same file: `PRE-Q6-04 the executable entrypoint fails closed when the final-check handler is uninstalled` — worker entrypoint exited before dispatch; SQLSTATE 42501 on Graphile `_private_known_crontabs`.
3. `packages/db/test/recovery-messages.integration.test.ts`: `records nothing when a proof was invalidated, although the case revision did not move`.
4. Same file: `refuses a raw sink row once the case, the pack, the proof set or the approver is no longer what was approved`.
5. Same file: `an invalidation committed after validation but before insertion prevents the sink effect`.
6. Same file: `preserves source bytes, identities and hashes when a proof is invalidated and a later pack omits it`.

The four recovery failures are listed without error stacks in the filtered log; their cause is source-inspected, not locally PostgreSQL-executed. All four unchanged merged tests insert proof invalidations through the administrative fixture pool/connection without setting a tenant context. 0147's added `a_final_check_invalidation` trigger rejected that existing privileged fixture path before the tests could exercise their assertions. The private proof-table rename is not involved. The log also records worker subprocess exit 1, API test failure (2 failed / 1,718 passed), DB test-group failure (4 failed / 98 tests), and the resulting Turbo/pnpm exit 1; these are consequences of the six tests, not additional test failures. Nest diagnostics for `private SQL diagnostic`, `NOT_FOUND` and `INVOICE_NOT_FOUND` occur in passing refusal tests. Shadow-isolation's 22 tests, including Test Q, passed in the supplied CI log; that is evidence for d060a17, not an r10 rerun.

Changes:

- Piece-owned worker integration setup now installs Graphile as `sv5pre_worker_graphile`, the same separate non-superuser/non-BYPASSRLS queue login used by both runners. Graphile's installed 0.16.6 SQL enables RLS on private queue tables without caller policies, so the previous ordinary grants from a postgres-owned install could not authorize those writes. Temporary CREATE on this disposable database is revoked in `finally`; broad table/sequence/function grant setup is removed. New catalog assertions require queue-table ownership, no FORCE RLS bypass alteration, no superuser/BYPASSRLS/CREATEDB/CREATEROLE, no retained database CREATE and no runtime-role membership/business INSERT. Existing PRE-Q6 test bodies and assertions are unchanged. Inspected `outbox.integration.test.ts`'s separate runtime/infrastructure logins; those worker tests use fake adapters and do not install Graphile. No production role/grant changes.
- Only unmerged migration 0147 changes. Its invalidation serialization trigger applies the same session-role exception already used by its evidence-registration trigger for migration-capable or superuser maintenance/fixture sessions. Ordinary sessions still need their matching tenant setting before lookup/locking. The protected lookup temporarily sets the row tenant and restores the prior transaction-local value before returning. The source job row lock and existing merged recovery-message source-write trigger remain intact. All migration GRANT/REVOKE bytes are unchanged; no old migration, function name, table name, fingerprint, pinned hash, schema column, business amount or refusal changes.
- Two new piece-owned completion cases cover absent/other prior tenant settings, runtime refusal without/with a wrong context, no leaked invalidation from refusals, privileged invalidation and context restoration, unchanged original evidence/certificate snapshots, and refusal of publication plus both invoice paths (final and supplementary included). These PostgreSQL cases are written and typechecked, not executed here. All previous completion-test bytes are retained.
- Completion contract documents the restored maintenance path and disposable Graphile installation. No new operational alert, migration backfill, external action, product policy, provider route or UI flow.

Local environment: already installed dependencies, Node `v24.17.0`, pinned pnpm `10.28.1` via existing `/private/tmp/sv5pre-r8-bin/pnpm` added to PATH. No clean-install claim. Commands actually executed:

| Command | Exit / result | Log |
| --- | --- | --- |
| `pnpm typecheck` | 0; 7 tasks successful, 2 cached | `/private/tmp/sv5pre-r10-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | 0; 7 tasks successful, 2 cached | `/private/tmp/sv5pre-r10-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; SV5PRE lane passed | `/private/tmp/sv5pre-r10-lanes.log` |
| `pnpm build` | 0; 7 tasks successful, 2 cached | `/private/tmp/sv5pre-r10-build.log` |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 0; 2,456 tests / 82 files | `/private/tmp/sv5pre-r10-unit-core-serial.log` |
| `pnpm --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage exec vitest run src` | 0; 83 tests / 7 files | `/private/tmp/sv5pre-r10-unit-support.log` |
| `pnpm --filter @jobguard/api exec vitest run src/sv5pre-worker-registration.test.ts src/shadow-detection.worker.test.ts src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/customer-invoice-sv5pre.filter.test.ts src/auth/context-boundary.test.ts src/recovery-message.application.test.ts src/recovery-message.errors.test.ts` | 0; 236 tests / 8 files | `/private/tmp/sv5pre-r10-unit-api.log` |
| `pnpm --filter @jobguard/web exec vitest run` (after build) | 0; 814 tests / 34 files | `/private/tmp/sv5pre-r10-unit-web-built.log` |
| `pnpm --filter @jobguard/db exec vitest run test/recovery-case-join.test.ts test/site-extra-evidence-compatibility.test.ts test/recovery-message-repository.test.ts test/recovery-case-outcome.test.ts test/audit-api-capture.test.ts test/verify-audit-export-cli.test.ts test/contractor-session-context.test.ts test/verify-evidence-pack-cli.test.ts --maxWorkers=1` | 0; 82 tests / 8 files, socket-free unit/adapter checks | `/private/tmp/sv5pre-r10-unit-db.log` |
| `node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs` | 0; 19 tests | `/private/tmp/sv5pre-r10-unit-tools.log` |
| `pnpm openapi:check` | 1; sandbox denies tsx CLI IPC listen (`EPERM`) | `/private/tmp/sv5pre-r10-openapi.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` (after build) | 0; same OpenAPI comparison without CLI IPC | `/private/tmp/sv5pre-r10-openapi-node-built.log` |
| TypeScript program using db tsconfig, noEmit, adding the changed completion integration test and its imported fixtures | 0; zero diagnostics | `/private/tmp/sv5pre-r10-db-test-typecheck.log` |
| Read-only protected-source/additions/grant comparison; `git diff --check` | 0 | Checks recorded below |

Initial executions are retained, not hidden: the parallel source-package invocation (`pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage exec vitest run src`, log `/private/tmp/sv5pre-r10-unit-source.log`) exited 1 with two core `receipt-allocation.test.ts` 5-second timeouts: `2000 lines of distinct 12-digit amounts aggregate exactly, within the contract size, and round once` and `the working size is bounded: more distinct denominators than the documented limit fail closed`. The serial core rerun passed every test with existing timeouts unchanged. Initial web run exited 1 with 5 import-failed suites and 50 failed tests / 633 passed (log `/private/tmp/sv5pre-r10-unit-web.log`); initial IPC-free OpenAPI run exited 1 missing the `SiteVisitError` export (log `/private/tmp/sv5pre-r10-openapi-node.log`). Generated workspace exports were stale relative to current sources. Rebuilding, then repeating the exact web suite and IPC-free OpenAPI command passed without source/test changes. Build/lint/typecheck report existing sandbox Turbo cache IO warnings; build also retains CSS autoprefixer warnings.

Preservation evidence from read-only Python/git comparisons (exit 0): `context-boundary.test.ts` and the entire `recovery-messages.integration.test.ts` are byte-identical to origin/main. `shadow-isolation.application.test.ts` is byte-identical to d060a17 and retains origin/main's original line 393 byte-for-byte (now line 400); all accepted setup lines remain. Removing only the added r10 completion block reconstructs the d060a17 completion suite byte-for-byte. Migration GRANT/REVOKE lines match d060a17 exactly, and the only changed migration is 0147.

NOT RUN: full `pnpm test`, PostgreSQL integration/worker/migration suites, free-port unit test and browser suites because this dispatcher sandbox cannot bind localhost/start PostgreSQL. Root Git-fixture lane/train unit suites were not run because they write Git repositories, which this round forbids; the actual read-only lane lint did run. No test is skipped or weakened in repository/CI configuration. No live-model/provider evaluation or native suite is applicable to this repair. Mandatory GitHub checks remain required after the dispatcher commits/pushes: full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, actual PRE-Q6 execution, all 98 merged recovery-message tests, added completion cases, Test Q and previous isolation/upgrade suites, plus applicable browser checks. Actual PostgreSQL permissions, race enforcement and new test assertions remain unverified locally. The SQL cause/fix is source-inspected; it is not independently verified.

Affected invariants: AGENTS §§5.1, 5.3–5.4, 5.8, 5.13–5.14; existing runtime isolation, exact approved effect revalidation, immutable evidence/history and fail-closed final invoices remain required. Shared overlap: only this piece's unmerged 0147 serialization trigger; no merged recovery routine/test edits. Forward-fix strategy remains additive after acceptance/deployment; do not remove the invoice guard or rewrite historical proof. Independent verdict must bind the dispatcher's exact resulting commit, followed by separate acceptance. All existing SV-5/D12/D13/real-data/production/release gates remain held; no task acceptance is claimed.

Intended conventional commit message overwritten at `/private/tmp/jg-msg-sv5pre.txt`. Dispatcher owns commit/push; no repair commit exists yet.

Changed implementation/test SHA-256 values:

- `apps/api/src/sv5pre-worker-execution.integration.test.ts`: `691c9125b3c0faa9adc5c5bec383318acd72eccaf11d6b9f5635356ce598023e`
- `packages/db/migrations/0199_final_check_prerequisites.sql`: `6daafc2d278efe85c24f674be45639adb0a0fdbb7a596ae9e7d873ddb557edd9`
- `packages/db/test/sv5pre-completion.integration.test.ts`: `10d9af575036a4a1bad3db7942f27d9c8ee81fd3a49a375628302c4734694e01`
- `docs/contracts/sv5pre-completion-v1.md`: `2579580b5de8dfdfc8d257424c1c1d2dfe44b95557a39dc25d95f636a40607aa`
