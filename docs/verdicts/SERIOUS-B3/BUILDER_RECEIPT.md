# SERIOUS-B3 — builder receipt

Issued 16 October 2026 by dispatcher 13, FAST MODE rule 5. **RED; builder implementation only; not accepted or independently verified.** Scope: every S-item in Batch 3 of `NIGHT-AUDIT-TRIAGE-SERIOUS-2026-10-16.md`; other batches excluded.

Branch: `codex/sandbox/serious-b3`. Starting and ending HEAD: `5746f7b15c88db3fe279a0d4adce4dfb37491731`. The supplied `origin/main` ref is now `66205cfa419f7ebee00dabaa4babb325aeb92472` (one subsequent CI configuration commit); lane checks use that ref as requested. All work is uncommitted for the dispatcher. No repository-writing git command, push, PR, provider send, real data or spending action was performed.

Read AGENTS.md, BUILD_PLAN.md contracts §§2.4, 5.1–5.4 and the M1-4/M1-5/M1-6 mapped work/acceptance criteria, plus Batch 3 and its source evidence. The six S-items share quote persistence/delivery files and are serialized in this batch. No new commercial or access policy is proposed.

## Disposition and reproduction

| Item | Evidence aliases read | First regression and expected failure on original code | Disposition |
| --- | --- | --- | --- |
| S06 | `pkg-src-82#2`, `mig-0008-0011#5` | `docs/verdicts/SERIOUS-B3/S06.repro.test.ts`, “S06 rounds the exact discounted line once, half-even”. **Executed RED:** received `29290`, expected `29291`. | **STOPPED** at existing expected values; arithmetic left unchanged. Coordinator details below. |
| S07 | `api-quote#1`, `dbsrc-10#2`, `mig-0008-0011#3` | `packages/db/test/serious-b3-quotes.integration.test.ts`, “S07 preview freezes calculated discounted line nets and agrees with the header and PDF”. Original SQL returns unit rates `[10000,2000]` instead of `[19000,3000]`. PostgreSQL reproduction written before implementation; execution deferred by dispatch instruction. | Implemented; PostgreSQL proof pending. |
| S08 | `dbsrc-11#1`, `mig-0008-0011#2` | Same file, “S08 omitted confirmed scope blocks issue until it is included or explicitly excluded”. Original save of A from confirmed A+B returns `issuable=true`, expected false. Written before implementation; PostgreSQL execution deferred. | Implemented; PostgreSQL proof pending. |
| S09 | `dbsrc-11#2`, `api-quote#7` | Same file, “S09 rejects another item's source revision without draft, line, observation or audit effects”. Original save accepts A/RB, expected `QUOTE_SCOPE_REVISION_MISMATCH` and no writes. Written before implementation; PostgreSQL execution deferred. Direct runtime SQL refusal regression also written before migration, expecting `23503` where old separate FKs accept the pairing. | Implemented, including migration 0166; PostgreSQL proof pending. |
| S10 | `api-quote#3` | `apps/api/src/quote/serious-b3-preview.test.ts`, “S10 preview metadata names the returned artifact when A is reused after B”. **Executed RED:** expected A's ID/version/hash/recipient; received B's. After fix: **1/1 GREEN**. | Implemented; unit proof executed, actual persisted A→B→A/bytes/send/execute regression pending PostgreSQL. |
| S11 | `api-quote#4`, `dbsrc-00#2` | `packages/db/test/serious-b3-quotes.integration.test.ts`, “S11 accepts the named unsuperseded issued quote after a newer unissued preview”. Original repository refuses issued v1 with `STALE_ACCEPTANCE` after preview v2. Written before implementation; PostgreSQL execution deferred. | Implemented; PostgreSQL proof pending. |

No items DROPPED. Database reproductions above are source-confirmed and unexecuted, using the dispatcher's explicit PostgreSQL exception; they are not claimed as observed RED/GREEN runs. Local S10 is a service unit test with repository/access spies, not an integration or authorization proof. Its preliminary runs failed package-entry resolution before compiled DB dependencies existed; the recorded RED assertion above was obtained after building those dependencies and before implementing S10.

## S06 STOP — coordinator must rule on existing expectations

The new explicit reproduction remains intentionally failing **outside the normal package suites**, under this receipt directory. It is not skipped, inverted or represented as passing. No existing test was edited. It can be run explicitly using the command below.

BUILD_PLAN §5.4 requires quantity × rate × discount, rounded once, half-even. Here the exact net is `29290.875p`, which rounds to `29291p`; tax stays `5858p`, total becomes `35149p`. Maintaining the existing subtotal/net identity makes displayed discount `1541p` with subtotal `30832p`.

| Existing file and line | Before (unchanged in this diff) | Required coordinator ruling / proposed after |
| --- | --- | --- |
| `packages/core/src/quote.test.ts:4` | `{subtotalPence:30832,discountPence:1542,netPence:29290,taxPence:5858,totalPence:35148}` | `{subtotalPence:30832,discountPence:1541,netPence:29291,taxPence:5858,totalPence:35149}` |
| `packages/db/test/quote.integration.test.ts:6` | Document `discountPence:1542`, line/header `netPence:29290`, `totalPence:35148`; acceptance input/command `acceptedTotalPence`/`amountPence:35148`; stored acceptance expectation `accepted_total_pence:"35148"` | Discount `1541`, line/header net `29291`, document/acceptance/authority total `35149`, stored total `"35149"` |
| `packages/db/test/quote.integration.test.ts:22` | Document `discountPence:1542`, line/header `netPence:29290`, `totalPence:35148` | Discount `1541`, line/header net `29291`, total `35149` |

No approval for those changes is inferred. The only production change to `packages/core/src/quote.ts` is the S08 `missing_scope` blocker type. **S07 deliberately reuses today's saved-quote evaluator, so S06's penny defect remains in both saved totals and their now-consistent document lines.** A future authorized S06 fix must preserve that shared calculation path.

## Changes and invariants

- **S07:** Fetch stored pricing factors, calculate each included document line with `evaluateDraftQuote`, and refuse a line/header net mismatch. Reuse an old snapshot only when its line nets agree; otherwise create a new version and preserve the old bytes/hash. Added coverage for an old contradictory preview. No immutable document is rewritten.
- **S08:** Within save, compare confirmed tenant/job scope identities with submitted included/excluded lines. Persist a `missing_scope` blocker for each omission and mark the revision unissuable. Explicit exclusions remain saved with their reasons. Existing totals and coverage behavior remain unchanged for complete submissions.
- **S09:** Resolve immutable source revisions by tenant/job and compare item identity before draft/line/rate/audit writes; return typed `QuoteScopeRevisionError`, mapped to existing `INVALID_QUOTE` at the application boundary. Migration 0166 enforces both relationships for every SQL insertion, including direct runtime inserts. New tests cover same-job wrong item, real wrong-job/other-tenant sources, rollback/no effects and direct SQL bypass attempts.
- **S10:** Read preview metadata by its returned document ID. Issue and execute return status for the same requested identity, so reuse of A after preview B does not switch the response back to B. Default latest-view behavior remains available to existing callers.
- **S11:** Resolve the requested document's ID/hash/version/total independently of the latest-preview projection. Existing locked acceptance SQL still checks issued identity, exact amount, supersession, current job revision/state and owner authority. Added refusal regression for an explicitly superseded document after a newer preview; unissued preview remains refused.

Affected invariants: AGENTS §§5.1–5.5, immutable commercial source history, exact issued acceptance, free quoting, atomic audit and no fee/platform posting. No new external action, authorization kind, provider, obligation or tax/fee policy. Existing schema/API request shapes and accepted document hashes are preserved; `missing_scope` is an additive blocker code. No operational service/alert is added. Migration validation failures and source mismatch errors need investigation.

No existing expected value, refusal, count, pinned name, hash, fingerprint, test file, pinned list, `apps/api/src/auth/context-boundary.test.ts`, lane register, migration runner or MIGRATIONS.md was edited. The lane file contains exact paths and grants neither itself nor the lane register. There are 14 changed/new paths including that independently authorized lane file.

## Migration and compatibility

`0167_quote_scope_lineage.sql` is above 0165, the highest on origin/main inspected during this task. Directory discovery registers it automatically. It adds a unique tenant/job/item/revision key and two validated foreign keys. No business row, column, grant, policy, owner or routine changes; no backfill. Existing correct documents/lines/observations remain byte-identical.

A historical mismatched pairing fails installation transactionally; do not silently rewrite immutable history or relax validation. After successful install fix forward while retaining source ownership. Earlier application versions remain compatible for correct pairings. See `packages/db/migration-notes/0167_quote_scope_lineage.md` for rollout and failure handling. The new populated-predecessor upgrade regression checks preserved typed row bytes, grants/RLS, validated constraints, replay and corrupt-history refusal. **No migration or PostgreSQL test was run here.** Integration must renumber if another migration reaches main first.

## Commands actually run

Environment: Node `v24.17.0` (repository pin `24.15.0`), cached pnpm `10.28.1`, dependencies supplied rather than freshly installed. For final pnpm checks:

```sh
export PATH="/private/tmp/jg-migfix-2-bin:$PATH"
export COREPACK_ENABLE_NETWORK=0
export npm_config_manage_package_manager_versions=false
```

No install/download command was issued. An initial build using the absolute cached wrapper without prepending its directory let Turbo's child find the normal pnpm launcher; that launcher attempted automatic version/signature registry resolution and failed. The correctly prefixed offline build passed. This launcher failure is not a dependency-integrity finding.

| Command | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run --root ../.. docs/verdicts/SERIOUS-B3/S06.repro.test.ts` | Exit 1, expected RED: `29290 !== 29291`. Intentional unresolved coordinator hold. |
| `pnpm --filter @jobguard/api exec vitest run src/quote/serious-b3-preview.test.ts --maxWorkers=1` before/after S10 | RED exit 1 at A/B metadata assertion; then GREEN exit 0, 1/1. Preliminary dependency-resolution failures also retained in the execution history above. |
| `pnpm typecheck` | Exit 0; 7 successful tasks, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; boundary/purity/money/commercial checks and 7 package tasks passed. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 0; serious-b3, exact 14 paths including its own lane file; origin/main comparison. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0. |
| `node --test tools/*.test.mjs` | Exit 0; 100 passed. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 94 files/2,601 tests; config 1/1; storage 1/2; AI 6/85. Fixtures only; no live model evaluation. |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` | Final exit 0; 10 files/110 tests. First concurrent run: 109 passed, operator source-reachability test timed out at unchanged 5s limit. Rerun after build load passed without changing any test/limit. |
| API source subset command below | Final exit 0; 79 files/1,643 tests. Includes untouched pinned context-boundary suite and the new S10 regression. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Final exit 0; 39 files/844 tests. Source unit tests only, no browser. First run before API build: 22 passed suites/187 tests, 17 suite collection failures on missing compiled package entries; final rerun after API build passed. |
| `pnpm build` | Exit 0; 7 successful tasks, 2 cached, production Next build completed. Existing workspace-root/webpack/CSS warnings and unavailable Turbo shared-cache writes were reported. |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC listener denied with EPERM by the sandbox. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same source OpenAPI generator/snapshot check without tsx CLI IPC. |
| TypeScript API `createProgram` over both new integration files, repository strict compiler options, `noEmit:true` | Exit 0; zero diagnostics, including final added adversarial cases. This compiles tests without running PostgreSQL. |
| `git diff --check`; final lane/path preservation checks | Exit 0. Read-only git inspection only. |

API final source subset (nine listener/database suites excluded only on the command line; no test/config edited):

```sh
pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 \
  --exclude src/auth/sso/action-paths.test.ts \
  --exclude src/contractor/contractor-practice-session.http.test.ts \
  --exclude src/contractor/site-extra-pricing.http.test.ts \
  --exclude src/contractor/site-extra.http.test.ts \
  --exclude src/contractor/site-visit.http.test.ts \
  --exclude src/contractor/practice-worker-switch.http.test.ts \
  --exclude src/health.test.ts \
  --exclude src/shadow-isolation.application.test.ts \
  --exclude src/final-account-lock.isolation.test.ts
```

The first API subset omitted the worker-switch exclusion and started before AI build completion: exit 1, 77 passed suites/1,463 tests, two package-entry collection failures and 21 worker-switch listener failures/errors. The final subset above passed after build; the real HTTP suites remain mandatory in CI, not waived. Standard `pnpm test`/`pnpm test:db`/`pnpm test:migrations` and browser/e2e were not run because the dispatcher prohibits PostgreSQL/listener/browser execution here. No PostgreSQL guarantee, browser verification or full-suite pass is claimed.

Raw logs: `/private/tmp/jg-serious-b3-{s06-red,s10-red,s10-green,typecheck,lint,lane-direct,lanes,tool-tests,domain-tests,db-unit-tests,db-unit-tests-final,api-unit-tests,api-unit-tests-final,web-unit-tests,web-unit-tests-final,build,openapi,openapi-direct,test-types-final}.log`. Build setup attempts are in `baseline-build`, `baseline-build-offline`, `fix-build` logs with the same prefix. These logs are ephemeral local evidence. The intended conventional commit message is `/private/tmp/jg-msg-serious-b3.txt`.

## Outstanding gates

1. Coordinator ruling and subsequent authorized correction for S06's existing expected values; S06 remains unfixed.
2. Dispatcher commits the working tree, then CI executes all mandatory real-PostgreSQL fresh/upgrade/runtime/tenancy/regression suites, including `serious-b3-quotes.integration.test.ts` and `serious-b3-lineage-upgrade.integration.test.ts`, real HTTP tests, and required browser journeys. No browser/e2e was run by this builder.
3. Exact-commit independent RED verdict by a different model, separate technical acceptance and founder-owned merge/release. None is recorded or inferred here. No production rollout/real-data authority follows from this diff.


## r1 — dispatcher 13 repair (16 October 2026)

Worktree task label `LP0-FIX-1` only identifies this sandbox path; this remains SERIOUS-B3 / PR #231 on `codex/sandbox/serious-b3`, starting HEAD `988c4bf99d8942daaddfb5dfdb9c883325898f55`. Changes are uncommitted for the dispatcher. **Builder repair only; CI and a fresh independent exact-commit verdict remain required. S06 stays STOPPED pending the coordinator ruling.**

Read both independent repair verdicts: `d13-serious-b3-opus-988c4bf.md` and latest `serious-b3-solcheck-20261016T141651.md` under `/Users/benharwood/.local/share/full-steam/jg-runs/`, plus AGENTS, BUILD_PLAN §§2.4/5.1–5.4 and the Batch 3 triage. The independent verdicts apply to the starting commit, not these uncommitted repairs.

### Repair and preservation

- S08: add a tenant/job-scoped coverage query against **current confirmed identities**, requiring each identity to have an included line or recorded exclusion in the relevant saved revision. Preview checks before creating or reusing an artifact. Direct document creation also checks. `IssueQuoteMutation` checks the **named document's revision inside the command transaction**, after the existing party/job check and before outbound/send effects. Refusal is `QUOTE_NOT_ISSUABLE` carrying the existing `missing_scope` blocker code. No saved revision, historical document, PDF bytes or hash is rewritten; a refused send rolls back authorization, command and audit writes.
- Add three PostgreSQL regressions: explicitly seed the pre-fix A-only `issuable=true` state with A+B confirmed; refuse preview until B is included or explicitly excluded; refuse direct creation/reuse/issue of a pre-fix unissued preview without commercial effects or history changes; and reject an old preview after scope grows even when a newer draft covers B. The two recovery variants also exercise successful issue after coverage is restored. These are source-inspected/typechecked regressions, **not locally executed PostgreSQL evidence**.
- Opus fixture repair: both identified scope-revision inserts now supply `quantity_decimal='1', unit='item'`. Read every other INSERT in both SERIOUS-B3 integration files against the schema; the other scope-revision inserts already supply these mandatory fields, including the added scope-growth fixture.
- The lane file adds the exact `packages/db/src/quote-document-repository.ts` path needed by the explicitly requested issue repair. No shared register or migration list is changed.
- No existing assertion, expected value, pin, count, hash, fingerprint, package/runtime version or timeout is changed. Existing tests are retained; only the two instructed fixture inserts and additive regressions/imports change in the test files. S06 arithmetic and its existing expectations remain unchanged.

Affected invariants: tenant isolation, complete commercial scope, exact approved artifact identity, atomic authorization/audit/outbox and immutable history (AGENTS §§5.1–5.5/5.7). No schema/migration, data backfill, grants/RLS, external provider, money/tax policy, operational alert or request contract changes. Existing incomplete drafts/unissued previews intentionally become unsendable until a new complete or explicitly excluded revision is saved. Already issued facts and idempotent command results are preserved. No new migration beyond the original 0166; its merge-order renumbering condition remains the dispatcher's integration responsibility.

### r1 commands and evidence

Environment: supplied dependencies, Node `v24.17.0`, cached pnpm `10.28.1`; no install/download. Pnpm commands use `PATH="/private/tmp/jg-migfix-2-bin:$PATH" COREPACK_ENABLE_NETWORK=0 npm_config_manage_package_manager_versions=false`. No Git write command was run against this worktree, and no commit/push/merge was performed. Tool-test commands create their own temporary test repositories.

| Command | Actual r1 result |
| --- | --- |
| `pnpm typecheck` | Exit 0; 7 tasks, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; lane, purity, money/commercial boundary checks and 7 package lint tasks. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Initial exit 0 against `66205cfa419f7ebee00dabaa4babb325aeb92472`, including working-tree changes. Final rerun exit 1: origin/main advanced during the session and now already contains migration 0166; this branch's unchanged `0167_quote_scope_lineage.sql` must be above that number. STOP: no migration number, test reference, lane migration path or pin changed. |
| `pnpm build` | Exit 0; 7 tasks, 2 cached; production Next build completed. Existing workspace-root/webpack/CSS and sandbox shared-cache warnings reported. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 94 files/2,601 tests; config 1/1; storage 1/2; AI 6/85 (fixtures only). |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` | Final exit 0; 10 files/110 tests. First concurrent run had 109 passes and the existing operator-reachability test timed out at its unchanged 5s limit; rerun after build/load completed passed without edits. |
| API source subset command documented above, same nine CLI exclusions | Exit 0; 79 files/1,643 tests. Includes unchanged context-boundary tests and S10. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 39 files/844 tests; source units, no browser. |
| `node --test tools/*.test.mjs` | Exit 0; 100/100 tests. |
| `pnpm openapi:check` | Exit 1; sandbox EPERM on tsx CLI IPC listener. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same source generator/snapshot check without CLI IPC. |
| TypeScript `createProgram`, strict repository options and noEmit, both SERIOUS-B3 integration files | Exit 0; zero diagnostics. Compiles the added PostgreSQL regressions without starting PostgreSQL. |
| `node --test /private/tmp/jg-serious-b3-r1-probes.test.mjs` | Exit 0; 5/5 stub-SQL service probes, including pre-fix preview refusal and issue mutation refusal before writes. |
| Read-only TypeScript AST comparison of existing SERIOUS-B3 test bodies with starting HEAD; S06 byte comparison | Exit 0; every existing test body identical except the two instructed fixture-column corrections, three additive regressions; S06 evaluator/repro unchanged. |
| `git diff --check` | Exit 0. |

The API source subset uses the same nine command-line exclusions documented above (listener/database suites); no test/config is skipped or weakened in the repository. Standard `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, real HTTP and browser/e2e suites are not run here under the dispatcher's explicit no-PostgreSQL/no-listener sandbox instruction. They remain mandatory in GitHub CI after the dispatcher commits/pushes. There is no local database, migration, HTTP/browser, clean-install, live-provider or independent-review pass claim.

Logs are `/private/tmp/jg-serious-b3-r1-*.log`; the source-stub service probes are `/private/tmp/jg-serious-b3-r1-probes.test.mjs`, adapted from the earlier checker's probe with its coverage SQL response updated and an added issue-mutation refusal probe. These five executed probes use compiled repository code with stub SQL: **builder deterministic evidence only**, not independent review or PostgreSQL proof. No existing probe/test file was overwritten.

The intended conventional commit message is `/private/tmp/jg-msg-lp0-fix-1.txt` (overwritten as requested). Outstanding: exact-commit CI PostgreSQL fresh/upgrade/runtime/tenancy/regression and HTTP/browser evidence; refreshed independent verdict, separate acceptance and founder-owned integration; S06 coordinator ruling. None is inferred from local checks.


**r1 final integration STOP:** The final lane rerun found the known Opus merge-order condition has now materialized: `origin/main` advanced externally during this session to `0bbb5ddbd074b791ece740a1861a6b7cc2fd6577`; it contains `0166_customer_billing_integrity.sql`, so its highest migration is now 0166. The original lane and lint checks passed against base `66205cfa419f7ebee00dabaa4babb325aeb92472`; the final `LANE_BASE_REF=origin/main pnpm lint:lanes` fails migration order. No git ref was changed by this builder. Per the repair instruction forbidding existing test/pin/reference changes, migration renumbering and its test/lane/note references are left untouched for the dispatcher. The repair is not represented as merge-ready. See `/private/tmp/jg-serious-b3-r1-lanes-final.log`.
