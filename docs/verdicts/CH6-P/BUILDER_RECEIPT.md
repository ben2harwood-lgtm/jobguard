# CH6-P — builder receipt (24 October 2026)

**BUILT WITH HOLDS; NOT ACCEPTED; NOT MERGE-READY.** Construction receipt retained below; see appended r1 repair and independent
REPAIR verdict reference. Builder: Codex. No self-acceptance.
No commit or push. Intended message: `/private/tmp/jg-msg-ch6-p.txt`.

## Authority and exact source frame

Issued CH6-P wave-9 order, decision 74/build-ahead, C250; AGENTS.md rev 3 and
BUILD_PLAN.md CH-6/§10.2.9; planning draft CH6-P lines 4097–4176, CH-6 common
source/hold contract, and common order boundaries were read. Ben's
`jg-orders/next-wave/BEN-ANSWERS-20261023.md` was read: safest synthetic choice,
refuse rather than allow; no policy/release approval follows.

- Actual base/unchanged HEAD: `c50faa2affbc7dc9f4a8ede5b921ab007a846df6`.
- Branch/worktree: `codex/sandbox/ch6-p`, `.worktrees/ch6-p`.
- Target inspected: `origin/main` = `cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe`.
- Base contains accepted CH6-C `f2db7eae` and MON1-A `a9dc9c42`, as issued.
- SV-5 accepted head inspected with **read-only `git show`**, not a worktree:
  `7e139e0b325c020c07e69867ef12fcfe191d5528`.
  Acceptance evidence read:
  `/Users/benharwood/.local/share/full-steam/jg-runs/v5-sv5-acceptance-7e139e0b-20261024.md`.
  Its own listed merge/postlock-upload holds are preserved.
- Node actually installed: `v24.17.0`; installed Vitest: `4.1.11`.
  Dependencies were already present; no install, lockfile or pin change.
- No live provider, browser, listener, PostgreSQL server or real data used.
  The OpenAPI CLI's initial tsx IPC listener attempt was denied by the sandbox;
  the successful alternative uses Node's tsx import loader and no listener.

The order's reference to “MON1-I allowlist” is interpreted as its specified
**CH6-P** draft file list, not permission to edit meter/integration files. All 13
new paths match that list plus the explicitly issued lane and receipt exceptions.
The note uses `packages/db/migration-notes/`, overriding the draft's older path.

## Delivered behavior and safest choices

1. Minimal authenticated v1/v3 family selection, canonical lower-case IDs, exact
   practice ownership/adoption CTE, current persisted owner/user/session checks
   before source access, parsing or replay. Unknown/conflicting policies and
   contractor/unsupported environment refuse. No cap/count/journal discriminator.
2. CI-F05 ordinary invoice/payment sources and lock absence only. Manual payments
   remain builder attestations, never settlement proof. Invoice/payment occurrence
   survives a reversal; no financial comparison is inferred.
3. `synthetic_fixture.persisted-activity.v3` / `persisted-activity.1` uses an anchored
   ordinary horizon: job creation through latest saved activity. Server display
   time is precise UTC microseconds, read after facts, excluded from fingerprints.
4. No guessed delay, repetition, quote endpoint, allocation consistency or identity
   policy. Those rules are unavailable; pure fictional tests remain separate.
   Quote/grouping, activation and lifecycle projections are **not integrated** in
   this leaf. This is not all-nine persisted detector completion.
5. Post-lock port returns typed CI-H1 unavailable from the ordinary lock/check
   projection. It never reads private SV-5 tables or treats an empty array as a
   successful outcome. Pending/failed/completed checks do not waive that hold.
6. Reviews recompute and hash the accepted pure evaluator's strict snapshot.
   Migration 0227 independently reconstructs the exact supported source snapshot,
   checks absence/current policy/ownership and canonical request hash, serializes
   command identity, preserves first-result replay, inserts one succeeded receipt
   and appends the fixed operational audit event atomically.
7. Conservative **synthetic-only table SHARE locks** prevent concurrent source
   inserts and changing absence predicates without assuming cooperation from old
   writers. This limits concurrency and needs security/lock-order review before
   wider enablement. Session/membership SHARE locks protect revocation; expiry and
   current authority are rechecked after waits and after final audit acquisition.
   Deadlock/serialization errors are typed `INTEGRITY_RETRY_REQUIRED` and require
   retry of the same command, not creation of a fresh command identity.
8. Seven migration-owned routines, six private; only the exact writer has runtime
   EXECUTE. Fixed `search_path=pg_catalog`. The new-kind trigger is explicitly
   SECURITY INVOKER and tests actual execution role, not a caller GUC. No new role,
   table, column, old-row rewrite or broad grant. Existing v1/unrelated receipts
   retain their behavior; runtime DELETE/TRUNCATE denials remain.
9. No Decision, outbox, fee, journal, money, meter, state, eligibility or entitlement
   write. Explanations stay in receipts; audit contains only identifiers/hashes.
   No API/page was created, so no browser spec for a nonexistent route was added.

The package currently imports CH6-C's compiled public module at
`../../core/dist/commercial-integrity-v3.js`. Core was built first locally.
Coordinator barrel integration and replacing that import with `@jobguard/core`
remain necessary for clean-install typecheck ordering. This workaround is not
reported as completed shared integration.

## Verified symbols and STOPs

`git grep` verified installed `PracticeAccess` (apps/api/src/practice-access.ts),
`practiceOwnedJobsSql`, `withTenant`, `JobPartiesRepository.view/list`,
`JobWorkStateRepository.read`, `app.ch4_read_work_facts`,
`FinalAccountLockRepository.read`, `PracticeInvoiceRepository`,
`RecoveryAllocationRepository`, quote/acceptance/document/activation records,
ordinary invoice/payment/reversal/allocation relations, family discriminator fields
and CH6-C module exports. Existing lifecycle code is present; an approved source
handoff/profile is distinct from finding its implementation.

| STOP / hold | Evidence and disposition |
| --- | --- |
| STOP: CH6-C shared package exports absent | `git grep commercial-integrity-v3 packages/core/src/index.ts` returned no match. Public module exists, shared barrel untouched; exact additive rows below. Clean-install integration held. |
| STOP CI-H1: installed SV-5 public reader absent | `git grep 'FinalCheckRepository\|read_final_check_reveal' packages/db/src packages/db/migrations` returned no match at base. Accepted-head `git show` confirms `FinalCheckRepository.read(context,jobId,digest)` → `app.read_final_check_reveal(uuid,uuid,text)`. Held port, no copied implementation. |
| CI-H1/H5: exact published DTO missing | Accepted `FinalCheckView` uses `items: record[]`; no accepted exact completion/original evidence, financial basis, line attribution bridge was supplied. No guessed projection. |
| CI-H2/H3 | Existing work-state symbols are source-inspected, not proof of accepted ordinary integrity handoff or a D11 profile. No supplied meter fixtures substituted. Threshold-dependent adapters remain unavailable. |
| CI-H4 | No authorized identifier assertion source. No card/phone collection, hashing or cross-account scan. Core CI-F09 is fictional only. |
| STOP CI-H7: import-v3 source symbols absent | `git grep 'ImportedFinalAccountBaselineV1\|JobImportV3Repository\|imported_job_activation_terms_v3' packages/db packages/core` returned no match. Imported v3 refuses; known v1 import remains v1. |
| CI-H6 | 0227 is allocated/authored, but catalogue integration and actual PostgreSQL proofs are outstanding. Allocation alone does not close it. |
| CH6-B / parent merge gates | Transitive advisory isolation scanner/accepted source handoff and exact-head CI/reviews are not supplied here. Local direct-source checks do not replace CH6-B or parent SV-5/MON-1 gates. |
| Runtime no-store | No transport in this lane. CH6-A must add/test `Cache-Control: no-store`; repository tests do not claim HTTP header proof. |
| Isolation bytes | The query test normalizes only the independently advancing public `evaluatedAt`; all remaining serialized fields/query sequence must match. Literal bytes including two different server times are not claimed equal. |

## Commands actually run

No database/browser suite ran locally. No mock is called a PostgreSQL test.
Installed executables were used because the pinned pnpm launcher cannot start.

| Actual command (from repo root unless stated) | Real result |
| --- | --- |
| `pnpm --filter @jobguard/core build` | FAILED before build: launcher tried to resolve pnpm 10.28.1, registry signature/fetch verification failed. No package install completed. |
| `pnpm --filter @jobguard/db typecheck` | Same launcher failure, before compiler. |
| pnpm version probes with env/CLI “manage-package-manager-versions=false”, including installed 11.8.0 path | Same signature/fetch failure; flags did not prevent launcher version resolution. Installed 9.0.0 probe rejected those flags. No pin override retained. |
| `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json` | PASS; built CH6-C public module. |
| `node node_modules/typescript/bin/tsc -p packages/config/tsconfig.json` | PASS. |
| `node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json` | PASS. |
| `node node_modules/typescript/bin/tsc -p packages/ai/tsconfig.json` | PASS. |
| `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json` | PASS. |
| `node node_modules/@nestjs/cli/bin/nest.js build` (apps/api cwd) | PASS. |
| `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json` | PASS (including final source changes). |
| `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` | PASS; actual package typecheck and lint implementation. |
| `node ../../node_modules/typescript/bin/tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck test/commercial-integrity-v3*.ts` (db cwd) | PASS; integration sources typechecked, not executed. |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=2 src/commercial-integrity-v3.test.ts src/commercial-integrity-v3.boundaries.test.ts src/commercial-integrity.test.ts` (core cwd) | PASS: 3 files, 25 tests, including unchanged v1 tests. |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=2 test/commercial-integrity-v3-query-isolation.integration.test.ts -t 'local family and architecture checks'` (db cwd) | PASS: 4 local tests. Vitest reports 1 filtered/skipped PostgreSQL test; that test was NOT RUN, and has no `.skip`/`.todo` in source. Final repeat passed after source changes. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | FAIL: core purity passed (240 files, 8 existing computed-test-import reports); lane check rejects predecessor/base changes against current main. No weakening or shared edit. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | FAIL for the same committed-base divergence, logged to `/private/tmp/ch6-p-lanes.log`. |
| Lane check with `LANE_BASE_REF=HEAD` / `c50faa2a` | Correctly refused self-comparison; not reported as pass. |
| Deterministic Node working-tree check using exported `loadLanePolicy`, `selectLane`, `migrationOrderViolations`, `git ls-files --others` and `git ls-tree HEAD` | PASS: all 13 new paths explicitly allowed; new migration order valid. Not a committed-range lane pass. |
| `node tools/money-arithmetic-lint.mjs` | PASS. |
| `node tools/commercial-boundary-lint.mjs` | PASS (exit 0). |
| `node --test tools/agent-lane-boundary.test.mjs tools/agent-lane-boundary-train.test.mjs` | PASS: 66 tests. Tests create isolated temporary Git fixtures; shared repo Git was not written. |
| `node node_modules/tsx/dist/cli.mjs src/generate-openapi.ts --check` (api cwd) | FAIL: sandbox denied tsx IPC pipe listen. |
| `node --import tsx src/generate-openapi.ts --check` (api cwd) | Initial attempts failed missing unbuilt workspace dist modules; after building dependencies, PASS (exit 0). No OpenAPI write. |
| `CIRCLE_NODE_TOTAL=3 node node_modules/next/dist/bin/next build apps/web` | PASS, full production build, two configured Next workers. Existing workspace-root/CSS/Nest dependency warnings remain. No browser started. |
| `git diff --check`; tracked v1 source `git diff --exit-code HEAD -- ...` | PASS; no tracked edit. |

Initial package compile exposed a cross-package Zod `.extend` type incompatibility;
fixed by validating C's narrow review and local metadata separately. No original
schema weakened. Two temporary fixture-path correction commands used the wrong
cwd; corrected via absolute path. No files outside the allowlist were changed.
The complete root pnpm wrapper suite and clean pinned install are **not** claimed
passing. No dependency download was intentionally requested or pin changed; the
launcher itself attempted registry resolution before refusing execution.

## CI-only written coverage and outstanding assertions

- `commercial-integrity-v3.integration.test.ts`: current authority/session/job denial,
  minimal v1 routing, named-column protected-state comparisons, revoked session,
  ordinary locked-port unavailability.
- `commercial-integrity-v3-query-isolation.integration.test.ts`: local family/direct
  architecture checks; PostgreSQL zero/many hidden rows, real executed client SQL,
  controlled routine bodies and absence of runtime hidden grants. Server logs are
  captured; this is not yet an executed PostgreSQL isolation result.
- `commercial-integrity-v3-review.integration.test.ts`: concurrent duplicate/restart
  receipts, conflicts, forged/stale snapshot, stable later evaluation, original replay
  after changed sources, direct-SQL source/schema attacks, UTF-16/trim validation,
  canonical audit verifier, membership revocation during an observed server lock wait.
- `commercial-integrity-v3-receipt-guard.integration.test.ts`: actual role/GUC denial,
  old kinds unchanged, mutation/conversion/deletion refusal, runtime TRUNCATE denial,
  exact routine owner/search-path/ACL posture and rollback-only trigger-removal control.
- `commercial-integrity-v3-upgrade.integration.test.ts`: populated predecessor receipt,
  named-column/type/artifact preservation when only 0227 applies, then successor
  migration discovery twice and immutable receipt/audit preservation. No history rewrite.

CI-P01/P04/P05/P07–P11 remain **unverified PostgreSQL assertions**, not PASS.
CI-P02 additionally retains the public-clock/transport and full transitive-scanner
limits above. CI-P03 exact published binding and CI-P06 all-nine persisted rule
matrix remain source-held. Core fixture coverage does not close those paths.
Browser coverage belongs to CH6-A/J when their routes exist. Prompt/model `eval`
is inapplicable here: no prompt/model/AI parser or gateway change.

Required CI after dispatcher integration/commit:

```sh
pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm test
pnpm build
pnpm openapi:check
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/commercial-integrity-v3.integration.test.ts test/commercial-integrity-v3-query-isolation.integration.test.ts test/commercial-integrity-v3-review.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/commercial-integrity-v3-receipt-guard.integration.test.ts test/commercial-integrity-v3-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/commercial-integrity.integration.test.ts test/commercial-integrity-api-audit.integration.test.ts test/practice-session.integration.test.ts test/shadow-isolation-query-log.integration.test.ts test/job-parties.integration.test.ts
pnpm test:db
pnpm test:migrations
```

## Exact additive integration handoff (not edited)

1. `packages/core/src/index.ts`: export these CH6-C symbols from
   `./commercial-integrity-v3.js`: `commercialIntegrityV3InputSchema`,
   `commercialIntegrityV3ResultSchema`, `commercialIntegrityReviewV3Schema`,
   `commercialIntegrityReviewSourceSnapshotV3Schema`, `commercialIntegrityFamilyV1Schema`,
   `commercialIntegrityV3Kinds`, `evaluateCommercialIntegrityV3`,
   `canonicalCommercialIntegritySnapshot`, `CommercialIntegrityV3Error`; types
   `CommercialIntegrityV3Input`, `CommercialIntegrityV3Result`,
   `CommercialIntegrityReviewV3`, `CommercialIntegrityReviewSourceSnapshotV3`,
   `CommercialIntegrityFamilyV1`. Then replace this leaf's compiled-module imports
   with those public package exports before clean-install validation.
2. `packages/db/src/index.ts`: export `CommercialIntegrityV3Repository`; types
   `CommercialIntegrityActor`, `CommercialIntegrityV3Feedback`,
   `CommercialIntegrityV3StoredView`; export `CommercialIntegrityPersistenceError`
   from `./commercial-integrity-v3-sources.js`. The source adapters are internal,
   not HTTP-facing utilities or permission-granting APIs.
3. Migration discovery already scans the directory; **no MIGRATION_URLS append**.
   Register exact new function owner/ACL expectations in LP-0 inventory and its
   fixture/catalogue tests; the seven signatures are:

```text
app.ch6_integrity_canonical(jsonb)
app.ch6_integrity_authority(uuid,uuid,text)
app.ch6_integrity_family(uuid,uuid)
app.ch6_integrity_source_fingerprint(uuid,uuid,text,jsonb)
app.ch6_guard_integrity_review_receipt()
app.ch6_append_integrity_review_audit(uuid,uuid,uuid,uuid,text,text)
app.ch6_record_integrity_review(uuid,uuid,text,jsonb,jsonb)
```

Correction from r1 review L2(a): add the owner inventory key **only** for the
reachable writer,
`owner|routine|function:app.ch6_record_integrity_review(uuid,uuid,text,jsonb,jsonb)|jobguard_migration`
in `a-owner-routines`. The six owner-only helpers emit no owner fact; adding
those keys would make LP0-02 fail as stale.
The sole new effective runtime ACL key is:
`acl|routine|function:app.ch6_record_integrity_review(uuid,uuid,text,jsonb,jsonb)|jobguard_runtime|EXECUTE|-`.
Coordinator supplies its separately reviewed authority-path group; do not mark
approval from this builder receipt. Six private helper runtime/PUBLIC/shadow/
infrastructure EXECUTEs must stay absent. Expect writer SECURITY DEFINER only,
all helpers SECURITY INVOKER, every routine `search_path=pg_catalog`.
Add trigger posture row `app.command_receipt.ch6_integrity_review_receipt_guard`:
BEFORE INSERT/UPDATE/DELETE, ROW, enabled, invoking
`app.ch6_guard_integrity_review_receipt()`. No table, role or RLS-policy addition.
Update actual `lp-0-catalog.ts`/`.test.ts`, privilege JSON, authority path inventory,
and exact affected tenancy/SERIOUS-B5 routine/trigger inventories after real
catalogue inspection. Do not waive their checks or regenerate expectations blindly.

4. Future CH6-A registry rows, when those routes are actually integrated:
   `"/api/jobs/[id]/commercial-integrity/v3/reviews": "post_live_billing"` and
   `"nest:/jobs/:id/commercial-integrity/v3/reviews": "post_live_billing"`.
   No new `WatchdogCommandType`; no route/controller/application composition was
   edited by P. Transport must use the current authenticated actor and no-store.
5. SV-5 owner/coordinator must supply exact completed/published lock/run/cutoff,
   catch disposition, original verified completion, account/receipt basis and
   line-source contracts before replacing the held port. No hidden relation grant.

Migration strategy: expand-only; disable new composition for application rollback,
keep succeeded receipts/audit and the guard, use a reviewed forward migration for
fixes. Full details in `packages/db/migration-notes/0330_commercial_integrity_v3_receipts.md`.
No new alert subsystem; surfaced typed source/retry/conflict failures require normal
operational error handling. Privileged credential compromise and arbitrary dynamic
module use are not claimed covered by local tests. Independent exact-commit verdicts,
separate acceptance, final CI and all production/D11/G0–G5 gates remain held.

## r1 — 25 October 2026 repair

**REPAIR IMPLEMENTED; POSTGRESQL VERIFICATION HELD; NOT ACCEPTED.**
Issued against head `96f8bca982db362e979850c9e2f0b3ab15d365b7`, base
`c50faa2affbc7dc9f4a8ede5b921ab007a846df6`. Read the independent REPAIR verdict
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch6-p-claude-A-96f8bca9-20261025.md`
(the order's relative `jg-runs/` path is absent here). No new independent verdict
or acceptance is claimed for this working-tree repair. No commit, push or install.

### Repairs and regression coverage

- Blocking 1: 0227 replaces the Unicode-escape literal with ASCII hex decoded as
  UTF-8 at execution. This preserves exactly U+0009–000D, U+0020, U+00A0, U+1680,
  U+2000–200A, U+2028–2029, U+202F, U+205F, U+3000 and U+FEFF. The UTF-16 length
  check stays intact. No new migration number, routine, table or privilege.
- New SQL_ASCII own-step test explicitly sets `--encoding=SQL_ASCII`, asserts the
  server encoding, enables `check_function_bodies`, applies 0227 and checks the
  installed writer. A UTF8 regression checks all 25 original trim characters and
  U+0085/U+180E/U+200B non-trim neighbours against ECMAScript trim.
- Blocking 2: all three reported receipt INSERT fixtures now use
  `$1::uuid::text`, preserving UUID inference. Existing CI-P03/P08/P09 assertions
  remain intact. Their execution still requires the reviewer PostgreSQL run.
- L1/L2(b,d): dispatcher-assigned additive inventory implemented below. Corrected
  L2(a)'s wrong owner-key handoff in the original receipt. This does **not** close
  L1's remaining LP0 effective-fact/group/authority-path integration or L2(c,e).
- L2(c,e) trigger record and authority group remain coordinator work: the shared
  JSON assignment is expressly `recorded.routines` additive rows only. Required
  writer owner/ACL keys, authority path, card, source/test and trigger were not
  silently marked reviewed or approved.
- L3 global SHARE-lock concurrency remains a synthetic-only integration hold;
  changing lock semantics is outside this narrow repair. L4 HTTP digest stripping
  belongs to CH6-A; L5 public exports remain coordinator work; L6 baseline failures
  are not changed. No browser workflow, policy, prompt or model changed.

### Exact additive shared rows

Seven entries added to `docs/contracts/lp-0-effective-privileges-v1.json`
`recorded.routines`, in name order between the ch4 and claim entries:

```text
function:app.ch6_append_integrity_review_audit(uuid,uuid,uuid,uuid,text,text)
function:app.ch6_guard_integrity_review_receipt()
function:app.ch6_integrity_authority(uuid,uuid,text)
function:app.ch6_integrity_canonical(jsonb)
function:app.ch6_integrity_family(uuid,uuid)
function:app.ch6_integrity_source_fingerprint(uuid,uuid,text,jsonb)
function:app.ch6_record_integrity_review(uuid,uuid,text,jsonb,jsonb)
```

Matching seven `(proname, identity_arguments)` expectations added to each of
`serious-b5-upgrade.integration.test.ts`,
`contractor-entitlement-upgrade.integration.test.ts` and
`tenancy.integration.test.ts`, in PostgreSQL name order:

```text
ch6_append_integrity_review_audit | t uuid, j uuid, actor uuid, command_id uuid, request_hash text, snapshot_hash text
ch6_guard_integrity_review_receipt | <empty>
ch6_integrity_authority | t uuid, j uuid, digest text
ch6_integrity_canonical | v jsonb
ch6_integrity_family | t uuid, j uuid
ch6_integrity_source_fingerprint | t uuid, j uuid, digest text, source_snapshot jsonb
ch6_record_integrity_review | t uuid, j uuid, digest text, review jsonb, source_snapshot jsonb
```

All expect migration ownership and `search_path=pg_catalog`; only the writer is
SECURITY DEFINER/runtime-executable; helpers are owner-only. SERIOUS-B5 adds only
these exact identities to its existing snapshot and checks the exact owner-only
or owner+runtime ACLs, preserving predecessor comparisons. Tenancy and contractor
files had table inventories rather than routine-addition lists; additive routine
assertions were appended without changing the existing assertions. No table rows
are needed. Added precisely these four dispatcher-assigned paths to CH6-P's own
lane allowlist; no neighbouring lane was broadened. JSON definition hashes remain
null pending real catalogue capture, consistent with the existing held mechanism.

### r1 commands and actual results

Used installed Node executables directly, as in the original receipt, avoiding the
pnpm launcher's recorded registry resolution failure. Logs are in
`/private/tmp/ch6-r1-*.log`; no mocked run is called PostgreSQL proof.

- `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json`: PASS.
- Same compiler for config/storage/ai/db/api: PASS (build); db `--noEmit`: PASS
  (the package typecheck and lint implementation); web `--noEmit`: PASS.
- From db: `node ../../node_modules/typescript/bin/tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck test/commercial-integrity-v3*.ts test/serious-b5-upgrade.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts test/tenancy.integration.test.ts`: PASS.
- `LANE_BASE_REF=c50faa2a node tools/agent-lane-boundary-lint.mjs`: PASS.
- `LANE_BASE_REF=c50faa2a node tools/lint.mjs`: PASS (purity, lanes, money).
- `LANE_BASE_REF=origin/main node tools/lint.mjs`: FAIL: includes inherited
  CH4/MON1/CH6-C changes outside this leaf lane; no attempt to waive those paths.
- `node --test tools/*.test.mjs`: PASS, 122 tests.
- Core Vitest `run --maxWorkers=2 src`: PASS, 130 files / 3,047 tests.
- DB explicit source-file Vitest selection: PASS, 26 files / 225 tests.
- DB local family/architecture selector: PASS, four tests; one PostgreSQL test
  filtered out, not executed.
- Web Vitest `run --maxWorkers=2`: PASS, 41 files / 875 tests.
- AI/config/storage Vitest: PASS, respectively 147 / 82 / 4 tests. AI is fixture
  coverage, not a live approved-region model evaluation or release authorization.
- API `node --import tsx src/generate-openapi.ts --check`: PASS.
- API `node node_modules/@nestjs/cli/bin/nest.js build` from apps/api: PASS.
  An earlier root-cwd invocation failed to locate the package-local CLI; corrected.
- Web `node node_modules/next/dist/bin/next build`: PASS, production build.
- Initial db selector `vitest run --maxWorkers=2 src` matched four `dbsrc`-named
  integration files too: 30 files passed, four suites failed before PostgreSQL
  startup with `no free port`. This was a selector mistake; no database started.
  Re-ran explicit source files above, then the explicit non-integration selection.

Mandatory reviewer reruns: all CH6-P integration suites (including new SQL_ASCII
and UTF8 regressions), lp-0-authority-paths, serious-b5-upgrade,
contractor-entitlement-upgrade, tenancy, original audit/tenancy regressions,
`test:db` and `test:migrations`. PostgreSQL and browser journeys are NOT RUN here;
no server can bind in this sandbox. The accidental integration selection is
reported above rather than counted as an executed database check. Outstanding
catalogue authority-group/fact integration may still keep LP0 suites red.

Final r1 verification additions:

- DB Vitest with explicit `rg --files src test -g '*.test.ts' -g '!*.integration.test.ts'`
  selection: 48 files / 431 tests PASS; `test/free-port.test.ts` has two FAILs
  because its required local listeners raise `listen EPERM 127.0.0.1`. It is not
  weakened or excluded from CI. Overall local command did not pass.
- API Vitest `run --maxWorkers=2 src`: 120 files / 2,089 tests PASS; nine files /
  129 tests FAIL, 23 skipped and 129 listener errors, with sandbox `listen EPERM`
  preventing framework HTTP tests. This is not a full API-suite pass.
- Final `LANE_BASE_REF=c50faa2a node tools/lint.mjs`: PASS;
  `git diff --check`: PASS.
- Read-only Node comparison against HEAD's original Unicode literal: PASS,
  identical 25 code points. Parsed JSON comparison against HEAD: PASS, removing
  the seven new routine rows produces the exact prior document; no other shared
  JSON sections changed. These are deterministic static checks, not PostgreSQL.
- Intended conventional commit subject/body written to
  `/private/tmp/jg-msg-ch6-p.txt`. Worktree changes left uncommitted for dispatcher.

## r2 — final C250 repair (25 October 2026)

**REPAIRED IN WORKTREE; POSTGRESQL NOT RUN; NOT ACCEPTED.** Builder: Codex,
GPT-6.1-sol, medium reasoning, as issued. HEAD remains
`6c21a91fc37c3265e44f8bbb1ab6103da8fd92c1`, branch `codex/sandbox/ch6-p`,
base `c50faa2affbc7dc9f4a8ede5b921ab007a846df6`. No commit, push or PR.

Read the round-1 independent REPAIR response at
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch6-p-claude-A-6c21a91f-20261025.md`
(the relative `jg-runs/` path is not present in this worktree), AGENTS.md,
BUILD_PLAN.md CH-6 / §10.2.9, the persistence contract, both LP-0 suites and their
catalogue parser/derivation/path-completeness requirements. This r2 work has no
independent verdict yet; the prior verdict does not cover this diff.

### r2 changes and affected invariants

- The SQL_ASCII regression now starts a bare embedded PostgreSQL database, pins
  one admin connection, explicitly enables `check_function_bodies`, applies all
  predecessors, checks that validation is still enabled, then applies 0227. It
  issues no SQL_ASCII practice sessions or business fixtures. It asserts the
  writer is installed and evaluates the trim-set expression from the installed
  function definition, comparing the returned characters to all 25 exact
  ECMAScript code points. SQL_ASCII counts bytes; decoding the returned UTF8
  bytes in the driver lets this assertion compare characters correctly. The
  existing UTF8 trim/non-trim cases retain their assertions and share that list.
- The LP-0 inventory now includes the writer's exact migration-owner and runtime
  EXECUTE keys, an authority-kind group and corresponding path, LP-4 / LP-6d
  responsibilities, source and behavioral-test references, and explicit pending
  verification. New rows sit in their matching alphabetical segments. The receipt
  trigger is recorded beside the other command_receipt triggers with catalogue
  event order `BEFORE INSERT/DELETE/UPDATE|O`.
- All seven 0227 routines were inspected. The only other writer is the private
  `ch6_append_integrity_review_audit`, already recorded as writing audit_event;
  it has no runtime/public/other-role EXECUTE. Its owner-only path is documented
  through the new writer group/path. The guard is the sole new trigger and is
  now recorded. The remaining helpers only read/canonicalize. Owner-only,
  schema-owner routines do not produce LP-0 capability facts, so no fictitious
  owner/helper grants were added. Existing seven routine records are unchanged.
- No product SQL, migration, grants, business data, policy, API or browser flow
  changed. No backfill, new alert or rollback procedure is introduced by r2.
  Tenant/actor binding, immutable receipts and operational audit authority remain
  the affected invariants. No test was deleted or weakened. The explicitly
  excluded MON1 contractor-entitlement repeat-migration failure is untouched.

### r2 commands and actual results

Dependencies were already installed; no install/download or lockfile change.
Installed Node is `v24.17.0`. The pnpm launcher stalled even for
`COREPACK_ENABLE_NETWORK=0 pnpm --version` and was interrupted; installed Node
executables ran the real underlying scripts instead. Logs: `/private/tmp/ch6-r2-*.log`.

- DB typecheck and package lint: PASS, each ran
  `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`.
- Changed integration test static typecheck: PASS, from packages/db,
  `node ../../node_modules/typescript/bin/tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck test/commercial-integrity-v3-upgrade.integration.test.ts`.
- `LANE_BASE_REF=c50faa2a node tools/agent-lane-boundary-lint.mjs`: PASS.
- `LANE_BASE_REF=c50faa2a node tools/lint.mjs`: PASS.
- `LANE_BASE_REF=origin/main node tools/lint.mjs`: FAIL at lane comparison,
  including inherited CH4/MON1/CH6-C paths outside this leaf's allowlist, as in r1.
  The issued-base comparison passes; no allowlist was broadened.
- `node --test tools/*.test.mjs`: PASS, 122 tests.
- Core `node node_modules/vitest/vitest.mjs run --maxWorkers=2 src`: PASS,
  130 files / 3,047 tests. AI/config/storage same runner without a selector:
  PASS, 147 / 82 / 4 tests respectively. These are fixtures, not a live-model run.
- Web same Vitest runner: PASS, 41 files / 875 tests.
- DB same Vitest runner with explicit `rg --files src test -g '*.test.ts' -g '!*.integration.test.ts'`
  file selection: 48 files / 431 tests PASS; free-port.test.ts has two FAILs
  (`listen EPERM 127.0.0.1`). Overall command FAILS because listeners are forbidden;
  those tests remain mandatory and unchanged for CI. No PostgreSQL suite selected.
- Build: PASS for core/config/storage/ai/db via the installed TypeScript compiler;
  API via `node node_modules/@nestjs/cli/bin/nest.js build` from apps/api;
  web via `node node_modules/next/dist/bin/next build` from apps/web.
- Typecheck/package lint implementation for core/config/storage/ai/db/api/web:
  PASS (`tsc -p <package>/tsconfig.json --noEmit`).
- OpenAPI: PASS, from apps/api,
  `node --import tsx src/generate-openapi.ts --check`.
- Static inventory probe: PASS using the actual `loadReviewedInventory` parser
  and `pathCompleteness` with repository file checks; exact writer keys, all seven
  routine records and trigger row present. Removing the five new JSON rows yields
  the exact HEAD document. Regex/decode check also preserves all 25 trim points.
  First probe from repository root could not resolve package-local tsx; corrected
  by running from apps/api. This is deterministic source verification, not a live
  PostgreSQL catalogue comparison or independent review.

PostgreSQL and browser suites: **NOT RUN**, as explicitly instructed for this
sandbox. CI after dispatcher commit/push must run the repaired SQL_ASCII/UTF8
upgrade tests, all CH6-P suites, both LP-0 suites, database/migration regressions
and applicable browser suites. No claim that the next commit is fully green can
be made before those runs. The MON1 repeat-migration failure remains a separately
assigned pre-existing issue. Earlier product/source/release holds remain in force.

Final r2 verification:

- API `node node_modules/vitest/vitest.mjs run --maxWorkers=2 src`: 120 files /
  2,089 tests PASS; nine files / 129 tests FAIL, 23 skipped, 129 listener errors
  (`listen EPERM 0.0.0.0`). The sandbox prevents these framework HTTP tests,
  matching the recorded r1 limitation; this is not a full API-suite pass.
- Final issued-base lane/full lint rerun and `git diff --check`: PASS.
- Intended conventional commit subject/body is in `/private/tmp/jg-msg-ch6-p.txt`.
  Exactly three files changed in r2: upgrade regression test, LP-0 JSON inventory,
  and this receipt. Changes remain uncommitted for the dispatcher.
