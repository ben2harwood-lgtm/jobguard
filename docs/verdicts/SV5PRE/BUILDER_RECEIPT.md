Built by Codex; dispatched 13 Oct 2026. Codex was available; the dispatch addendum's requested Claude author line is factually inapplicable.

# SV5PRE builder receipt — partial construction, RED review owed

Repair r1 HEAD: `bfae9dfd38a6671d44e3db7f6f41ee32da461398`; original issued base: `2350b1a718b76aabdedd1782f02e92f516914246`. Current local origin/main: `6659fb58791ec22588948f005b2bd4f6b299fa48` (unchanged during r1). Branch `codex/sandbox/sv5pre`. No commit, add, push, merge or release was performed. Migration 0147 is the issued number. This receipt is builder evidence, not an independent verdict or acceptance. Both RED reviewers must confirm every preserved-assertion row and exact dispatcher commit.

Core, migration/persistence, guarded invoice adapter and worker registration constructed. Fresh legacy issue is fail-closed. Some existing fixture premises require coordinator amendments beyond issued A-D; the exact STOP list below remains technical-acceptance blocking. UI, substantive detector/reconciliation, catches/dispositions, fees and real-data release remain held. SV5-32 is incomplete.

Validation results, grant inventory, hashes, exact amendments and command log are appended after controlled end checks. PostgreSQL, browser and HTTP socket suites are NOT RUN (sandbox cannot start PostgreSQL or bind sockets). Existing aggregate suites belong to dispatcher sequential batching and were not run here. Dependencies were already installed; no install/download command was used.

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
| `packages/db/migrations/0147_final_check_prerequisites.sql` | `af9b08de5d4a038300f686c1b8982d7fcef71f7715098d5af22871faf2030274` | 434 |
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
| `packages/db/migrations/0147_final_check_prerequisites.sql` | `a75ec3e6d819954628d5b32298ca436ba3bb9a8dae4845daa8ba27bd7cabff96` |
| `packages/db/test/final-account-lock-invoice.integration.test.ts` | `ac0b6e2783daa5ec696ab2111cdaf3950bd8f2ba531f681e062d659972b10180` |
| `packages/db/test/sv5pre-completion.integration.test.ts` | `7272642ae5509456d232023055b4462417fcb51933a03f16186226a2f2fd26c1` |
| `packages/db/test/sv5pre-upgrade.integration.test.ts` | `0083ff31098a407ce440191a044bd53aeddc5d5c2e4ac9a89907ec6d3c0e8cb9` |

Final read-only `git diff --stat HEAD` (working tree only):

```text
 docs/contracts/sv5pre-completion-v1.md             |   2 +-
 docs/verdicts/SV5PRE/BUILDER_RECEIPT.md            | 238 ++++++++++++++++++++-
 .../migrations/0147_final_check_prerequisites.sql  |  30 +--
 .../final-account-lock-invoice.integration.test.ts |   6 +-
 .../db/test/sv5pre-completion.integration.test.ts  |  43 +++-
 .../db/test/sv5pre-upgrade.integration.test.ts     |  18 +-
 6 files changed, 308 insertions(+), 29 deletions(-)
```

Final local HEAD `bfae9dfd38a6671d44e3db7f6f41ee32da461398`; r1 remains uncommitted. Intended message overwritten at `/private/tmp/jg-msg-sv5pre.txt`. Dispatcher owns split/commit/push; the prior A-D list above remains its responsibility. No git write, new permission request or acceptance occurred. Final Python receipt/message writes and read-only diff/status/head checks returned 0.
