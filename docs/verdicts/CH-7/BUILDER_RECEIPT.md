# CH-7 builder receipt — 11 October 2026

Builder: **Codex GPT-6.1 Sol**. Check lane: **RED**.

Issued base and current HEAD: `ff072c70d577c47847de56c8b30e708bee4267dd`. `origin/main` initially matched; it advanced externally during checks to `530681c030a2333ec8f27f4d1a2cf4803a833465` (FIXLATER-1). No git write was performed by this builder. Direct current-origin diffs include reverse differences for that unrelated merged work; working-tree status and the issued-base diff contain only CH-7 changes. The diff is uncommitted on `codex/sandbox/ch-7`; `.git` is read-only. The dispatcher must supply the final exact commit. No git write, push, merge, PR, deployment, approval or acceptance was performed.

**Partial build, BLOCKING completion.** The merged M4-7-S catalogue has customer receipts and a supplier refund, but no supplier-invoice payment. Full payment of a later supplier invoice cannot be established from those facts. F14/F16 therefore have pure synthetic reference tests and a fail-closed persistence refusal, not a completed positive database/browser path. A coordinator clarification was requested; no answer has been received. This is a discovered dependency blocker, not a newly approved hold. Database/browser suites remain unexecuted and API unit failures are reported below.

Builder receipt only — not independently verified, not accepted.

## Issued scope and acceptance mapping

| Item | Status and evidence |
| --- | --- |
| B1 duplicate_supplier_payment | BUILT: additive core enum/source split, expanded SQL category, stored v3 candidate and workbench control. Core `B1 accepts the additive supplier case category and source split`; DB `DW1 F17 uses M4-7-S facts and persists exact Q/reason`; browser `F17 persists candidate Q, exact available reason and source across contexts`. DB/browser NOT RUN. |
| B2 supplier_credit_consumption / £250 minimum | BUILT IN PART, BLOCKING: tenant/job/case/review-qualified credit-note, later invoice and settled-event table; delegated pure F14/F15/F16 predicates; persisted F15 zero exclusion. Core `DW1 F14/F15/F16-partial/F16-full exact candidate Q and available reason`; DB `B2 refuses customer receipts as supplier-invoice settlement without writing credit/review rows`. Positive F14/F16 storage/browser path is not built because the required supplier payment fact is absent. No alternate settlement source is invented. |
| B3 claim lines / debtor | BUILT: immutable principal/statutory_interest/fixed_compensation rows and generated business/individual fixture identity. Core `B3 F18/F19 compensation never contributes and debtor is server fixture data`; DB F18/F19 exact header/component assertions; browser F18/F19 Q and individual interest zero. Compensation never enters Q. |
| B4 fee terms approval and pursuit guard | HELD, Q6: D01 v3 remains proposed. No terms table, command, route, Decision approval or pursuit guard. M4-5-S/0112 pursuit routines are unchanged. |
| B5 insurer proceeds and exact insurer reason | HELD, Q7: job paying-party type exists but is not attached to the receipt/movement fact; file:line evidence below. No insurer receipt fact, exclusion route or insurer reason is built. |
| DW1 F14–F22 reasons/outcomes/Q | BUILT IN PART: core coverage for all rows, persisted/browser test definitions for F15 and F17–F22. F14/F16 positive persistence/browser remains BLOCKING. F19 interest reason and F21 reason HELD under Q4. F22 uses existing verbatim copy. No F display or fee derivation (Q3). |
| DW2 pursuit without approved terms | HELD, Q6; scope would be withheld-payment only (Q5). No terms-guard integration test is invented. |
| DW3 later approval never qualifies an earlier receipt | HELD, Q6. The separately built F20 opening-time exclusion uses original M4-7-S server time; it does not implement a terms-time rule. |
| DW4 v1 reviews keep version/outcome | BUILT: separate v3 storage and additive response field; old v1 code/history preserved. DB `DW4 migration preserves previous reviews byte-for-byte and version` seeds the previous schema before 0119, migrates twice, and compares stored JSON text bytes. NOT RUN. Existing v1 core/API assertions are unchanged. |

### F14–F22 exact reference results

Q is qualifying net principal including eligible statutory interest, in GBP pence. No new illustrative fee (F) or posting delta is displayed or derived; existing posted-fact projections remain in the workbench.

| Fixture | Outcome | Q pence | Exact available reason | Coverage / limits |
| --- | --- | ---: | --- | --- |
| F14 | eligible_for_review | 30000 | null | Core only; full supplier-invoice payment source absent. |
| F15 | excluded | 0 | Credit note below the £250 minimum | Core, DB and browser definitions. No settled invoice is claimed. |
| F16 partial | excluded | 0 | Credit note used against an invoice not yet paid in full | Core only; persisted partial/full transition owed. |
| F16 full | eligible_for_review | 30000 | null | Core only; positive persistence/browser BLOCKING. |
| F17 | eligible_for_review | 45000 | null | Original supplier-refund-540: 54000p gross; generated net claim 45000p. |
| F18 | eligible_for_review | 262000 | Fixed statutory compensation is not part of the fee base | 250000p principal + 12000p interest; 7000p compensation contributes zero. |
| F19 | eligible_for_review | 250000 | Fixed statutory compensation is not part of the fee base | Same compensation reason; individual interest contributes zero with its specific reason null/HELD. |
| F20 | excluded | 0 | Paid before you opened this case | Original receipt-384 settled timestamp is before opening. |
| F21 | excluded | 0 | null — HELD | Unpaid-bill reduction; no substituted pending-money explanation. |
| F22 | excluded, terminal | 0 | Prevented spending is not recovered cash | Existing verbatim reason; no money posting. |

F17–F22 have core, database and browser definitions. Database/browser outcomes are **not verified**. Browser definitions assert two-decimal pounds, exact reason, outcome, keyboard activation, focus, touch target, banner, overflow, reload, and a cookie-only second context. As in merged M4-2-S, captured jobs are deliberately absent from the Jobs home list: the test visits Jobs then navigates to the saved job URL. It does **not** prove clicking a captured-job card from Jobs.

## Q4, Q7 and source-gap evidence

Read-only original-base search (new CH-7 copy excluded):

```sh
git grep -n -i -E '(interest.*individual|individual.*interest|unpaid supplier bill|Prevented spending is not recovered cash)' origin/main -- packages/core/src packages/db/src apps/api/src apps/web/app
```

F19 matches are predicate/schema/test identifiers in `packages/core/src/shadow-domain/eligibility.ts:13`, `eligibility.test.ts:47`, and `success-fee.test.ts:72`; none supplies verbatim reason copy. No applicable F21 reason copy was found. F19 interest reason and F21 wording are HELD. F22 exact copy exists at `packages/core/src/recovery-eligibility.ts:13` and its unchanged test at `recovery-eligibility.test.ts:5`.

Q7 evidence: `packages/db/migrations/0095_job_parties.sql:28` permits customer type `insurer`; lines 76–86 attach paying-party revisions to a **job**. `packages/db/migrations/0106_practice_feed.sql:56–81` defines the immutable movement without a paying-party type/revision. Its receipt match at lines 83–103 links a payment and settled event, not a payer. `packages/db/migrations/0029_uiwire12_customer_receipts.sql:19` records a receipt without a paying-party parameter. A job payer must not be inferred as the payer of every receipt. B5 and “Insurer proceeds never qualify” remain HELD.

B2 blocker evidence: `packages/core/src/practice-feed.ts:20` is exactly `customer_receipt | supplier_refund`; catalogue lines 27–35 contain six incoming customer receipts and one supplier refund. `0106_practice_feed.sql:59–60,73–76` constrains the same movement catalogue. There is no outgoing supplier-invoice payment. The new table's insertion guard and F14/F16 command path refuse `ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE`. F15 can exclude a generated below-minimum example without asserting full payment.

## Implementation and invariants

The existing `RecoveryCaseApplication.eligibility` service dispatches strict v1/v3 commands after authenticating and before reading deferred JSON. Existing Nest/Next transports and workspace composition already reach this service, so no extra route, service registration or job mutation registry entry is introduced. OpenAPI is regenerated; only the existing endpoint summary changes.

The v3 command accepts only immutable generated fixture selection and expected revisions, never client tenant, category, debtor, settlement, Q or terms status. Contexts use the merged stamped helpers. The repository rechecks issued session, immutable job owner and current owner membership inside the transaction, including replay. Command identity and the shared case lock precede business writes and the final audit lock. Same command/different payload conflicts; same command/same payload returns the original review in `eligibilityV3CommandResult`, separately from current workbench views; expected revisions serialize races.

SV-1 owns category/component eligibility predicates; SH-1 owns exact-pence addition. No kernels are copied, no success fee is calculated, and no commercial authorization is created. Existing synthetic prerequisite assumptions supplied to the pure SV-1 predicate are fixture assumptions, including its terms prerequisite, not a terms approval record or a pursuit guard. Production/pilot mode refuses v3 processing and every candidate records `productionEnabled: false`.

Migration `0119_recovery_eligibility_v3.sql` is appended after 0112 in increasing order. Position tests assert names/order, never “last migration”. It expands the category check, adds a tenant/job-qualified feed identity key, and creates `recovery_eligibility_v3_review`, `recovery_claim_line`, `supplier_credit_consumption`. Every new table has non-null tenant, tenant/job/case/review-qualified FKs, ENABLE/FORCE RLS, migration ownership, runtime SELECT/INSERT only, and append-only triggers. Invoker guards validate source, fixture, exact Q and rendered components. A deferred constraint requires the exact command/result audit hash and complete claim lines. No earlier guard is restated, including the three 0112 message guards.

Existing v1 rows/version/outcome are not backfilled or changed. Forward fix with a new migration is the default; any application rollback must retain readers compatible with the new case category after such cases exist. Do not drop populated history or narrow a category after new-category rows exist. No new provider, secret, external action, charge, allocator, ledger posting, alert or production capability is introduced. RLS guarantees remain bounded by correctly authenticated context and uncompromised runtime credentials; synthetic deployment isolation remains necessary.

## Tests first and checks actually observed

Dependencies were supplied installed. No package download or `pnpm install --frozen-lockfile` was attempted, as the dispatcher explicitly prohibited downloads. Node `v24.17.0`; cached pinned pnpm `10.28.1` was invoked with `PATH=/private/tmp/jg-fixlater-1-bin:$PATH`. The initial default pnpm launcher tried manager resolution; the existing cached binary was used instead.

Core v3 tests were written before the implementation: the targeted three-file run exited 1 because the v3 module did not exist (the two existing files/171 tests passed). The initial API routing tests, after dependency build, exited 1 with 5 failed/8 passed; v3 routing/refusal implementation fixed those failures. Database and browser tests were written before their initial persistence/UI implementation and are **NOT RUN**, not failed-first evidence. Additional self-review regression tests were written and failed before their fixes: API immutable replay result (1 failed/13 passed, then exit 0/14 passed); F21 pending settlement substituted held copy (1 failed/18 passed), and non-strict stored result accepted an extra field (1 failed/19 passed).

| Command | Observed exit/result |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-eligibility-v3.test.ts src/recovery-eligibility.test.ts src/recovery-case.test.ts` | Final exit 0: 3 files, 193 tests (22 CH-7 tests). |
| `pnpm --filter @jobguard/core test` | Exit 0: 126 files, 3578 tests before the four final self-review tests; targeted v3 run covers the additions. |
| API unit run, 36 explicit socket-free files (full command below) | Final completed run with `--maxWorkers=4`: exit 1, 33 passed/3 failed files, 953 passed/5 failed tests (958 total); all five are unchanged 5000ms timeouts. CH-7's 14 tests passed. Earlier completed normal-worker run: exit 1, 35 passed/1 failed files, 956 passed/1 failed tests; unchanged 5000ms source-scan timeout. Serial `--maxWorkers=1` rerun: interrupted exit 130 after nine observed timeout failures and prolonged lack of new output; no completed count is claimed. No timeout/retry/skip/config modification. |
| `pnpm --filter @jobguard/web test` | Final exit 0: 21 files, 448 tests on the final UI/contract. |
| `node --test tools/*.test.mjs` | Exit 0: 42 tests. |
| `pnpm typecheck`; final `pnpm typecheck --concurrency=1` | Earlier exact command exit 0 (7 packages); final serialized run exit 0, all 7 packages successful, 10m47.562s. The intervening interrupted run is described below. The response-only replay addition followed; final build and affected API/web no-emit lint checks validate those final types. |
| `pnpm build` | Final exact command exit 0, all 7 packages successful, 6m49.246s, after the replay fix. Existing Next workspace/CSS warnings and global-cache `Operation not permitted` warnings did not fail the build. |
| `LANE_BASE_REF=origin/main pnpm lint` | Initial exit 1: self-comparison refusal. Final exact command exit 0 after the external origin/main advance: all boundary tools and 7 package lint tasks pass, 9m37.84s. This full run precedes the final response-only replay fix; affected API/web checks follow below. |
| `pnpm lint:lanes` | Initial exit 1: self-comparison refusal. Final exit 0 after origin/main advanced externally to 530681c; all 23 paths passed the unchanged checker. No checker/base-ref workaround. |
| Supplemental working-tree lane audit | Exit 0 before receipt: 22 changed/untracked paths all matched the existing lane matcher. A current-origin supplemental audit exited 1 on eight reversed FIXLATER-1 baseline paths (none was edited). Issued-base/HEAD working-tree audit: exit 0, 23 paths allowed, including this receipt. This is not the mandatory committed-range lane check. |
| `node tools/core-purity-lint.mjs`; `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Each observed exit 0 on final source; core purity (127 files), exact money and commercial boundaries passed. |
| `pnpm openapi:check` | Exit 1: tsx CLI attempts an IPC listener, `listen EPERM ... /T/tsx-501/69187.pipe`; sandbox cannot bind sockets. |
| `pnpm --filter @jobguard/api openapi:generate` | Exit 1: same tsx IPC restriction. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` | Exit 0: regenerated actual document without the CLI's IPC listener. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Final exit 0: actual generator says document matches. This does not relabel the required command as passed. |
| `git diff --check` | Exit 0 after the final code changes. |

The final concurrent typecheck rerun was interrupted after 11m7.699s without new progress: the tool observed exit 0 during Turborepo shutdown, but its receipt shows only 4 successful/5 started tasks, not all seven; this is explicitly **not a pass**. A serial-package rerun uses `pnpm typecheck --concurrency=1`.

Affected final-source `pnpm --filter @jobguard/api lint` and `pnpm --filter @jobguard/web lint` each exited 0 after the replay fix; both run the same unchanged no-emit TypeScript checks as root lint/typecheck. No check script is altered.

Earlier typecheck/build failures were real and fixed: optional Playwright context properties violated exact optional typing; a static API import of the DB test helper pulled source outside the API compiler root (TS6059), producing nine stray JS/declaration/map artifacts. The test now dynamically loads the existing stamped helper. All nine artifacts were removed; existing authorization assertions were retained. One overlapping build recreated them before it finished; cleanup was repeated after that build ended. Initial core expected F18/F19 header reasons were corrected to assert the exact compensation reason, strengthening the assertions. An early API run before building dependencies could not import the unbuilt v3 repository; that is an environment/build-order failure, not meaningful failing-first evidence.

Exact serial API unit command (same 36 files as the completed normal-worker run; that run omitted `--maxWorkers=1`):

```sh
/private/tmp/jg-fixlater-1-bin/pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/auth/auth.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts src/capture/capture-state.test.ts src/commercial-integrity.application.test.ts src/contractor/contractor-parties.application.test.ts src/contractor/contractor-parties.controller.test.ts src/contractor/contractor-parties.privacy.test.ts src/contractor/contractor.application.test.ts src/contractor/contractor.projection.test.ts src/contractor/work-order.application.test.ts src/customer-receipt-input.test.ts src/effects/policy-gates.test.ts src/evidence-pack.application.test.ts src/evidence-pack.controller.test.ts src/evidence-pack.errors.test.ts src/final-account.application.test.ts src/job-parties.application.test.ts src/practice-feed.application.test.ts src/practice-feed.controller.test.ts src/practice-session.test.ts src/practice-transports.test.ts src/prevention-check.application.test.ts src/proof/proof.application.test.ts src/recovery-case.application.test.ts src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts src/recovery-eligibility-v3.application.test.ts src/recovery-follow-up.application.test.ts src/recovery-follow-up.controller.test.ts src/recovery-message.application.test.ts src/recovery-message.controller.test.ts src/recovery-message.errors.test.ts src/watchdog-registry.test.ts src/workspace/fee-illustration.application.test.ts src/workspace/workspace.service.test.ts
```

The final four-worker API run used the same explicit 36-file list above with `--maxWorkers=4`. Timeout failures: context-boundary's real-source scan and exact reviewed-source identity check; identity's practice-guard ordering check; recovery-message controller's Next read/list adapter and read/list watchdog-refusal checks. Every failure reports `Test timed out in 5000ms`. No final API pass is claimed. A focused follow-up with `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/auth/context-boundary.test.ts src/auth/identity.test.ts src/recovery-message.controller.test.ts` exited 1: 176 passed/1 failed (177 tests, 2 passed/1 failed files). The unchanged real-source context scan still timed out at 5000ms; the other four prior timeout checks passed in this focused run. The broad suite remains blocking.

### NOT RUN

- Every PostgreSQL integration test, including new `packages/db/test/recovery-eligibility-v3.integration.test.ts` (17 cases), changed catalog expectations in `tenancy.integration.test.ts`, unchanged recovery-cases/messages/follow-up/feed suites and UIWIRE-12/demo bootstrap: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- `pnpm test:db`: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- `pnpm test:migrations` (fresh install, upgrade, privileges/RLS): **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- Requested DB Vitest command: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. `test/recovery-terms-guard.integration.test.ts` is intentionally absent because B4/DW2/DW3 are HELD.
- Every Playwright test, including CH-7 (8 definitions, both `mobile-360` and `desktop`) and unchanged M4-1-S/M4-2-S/M4-5-S: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- Requested `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop CH-7.spec.ts M4-1-S.spec.ts M4-2-S.spec.ts M4-5-S.spec.ts`: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- Aggregate `pnpm test`: NOT RUN; it starts mandatory PostgreSQL and socket-based tests. Core/web/tools and the API unit file set were run directly; this is not an aggregate pass.
- API `src/health.test.ts`: NOT RUN (sandbox cannot bind sockets); it is an HTTP/supertest integration test, not part of the 36 socket-free unit files. No exclusion/config is committed.
- No live-provider evaluation, professional/commercial approval, screenshot or independent model verdict is claimed. AI/model/prompts are unchanged; native subsystem is untouched.

Syntax-only `TypeScript.transpileModule` inspection of the new DB and Playwright files exited 0 with zero syntax diagnostics. This did not execute/typecheck those suites or verify SQL.

## Self-review

Re-read the entire tracked diff with read-only `git diff origin/main` and the fixed issued-base comparison after the remote ref advanced and read every new implementation/test/SQL file. Checked each built acceptance row against a test, exact pence/reason strings, delegated arithmetic, tenant-qualified keys, FORCE RLS, grants/owner, append-only history, membership/session guards, replay/races, original settled timestamps, atomic audit completeness, v1 preservation, increasing migration names, lane boundaries and held exclusions. No existing assertion was weakened/deleted and no timeout/retry was introduced.

Fixed: added an immutable v3 command-result field so an old command replay reports its original review even when the workbench contains a newer candidate (observed failing-first API test, then 14 passed). F21's held wording was being replaced by a pending-money reason; added an observed-failing regression and kept its reason null. Made all stored-result/line/money schemas strict after an observed-failing test. Added SQL validation of the complete rendered component array and unknown header keys; protected exact zero compensation/individual-interest components. Added direct runtime money/component tampering and pending/unverified credit-proof tests; these test the implemented guards/delegated proof predicate and are not claimed as failing-first runs. Added known SQL-guard-to-typed-refusal translation while retaining unknown outcomes for transport/commit ambiguity. Kept supplier-invoice payment unavailable rather than mislabelling incoming customer cash. Added persisted F15 zero coverage without claiming settled invoice proof. Removed the new DB setup timeout override so defaults remain in force. Corrected static test-helper imports and cleaned compiler artifacts. Revoked PUBLIC/runtime direct execution of new trigger functions and added catalog coverage. Clarified that older closed-enum clients need a compatible reader after new-category cases are created; forward fix is preferred.

This is builder self-review only, not an independent verdict or acceptance. PostgreSQL behavior remains source-inspected/test-written, not test-executed.

## Changed files and shared ownership

- `apps/api/openapi.json`
- `apps/api/src/recovery-case.application.ts`
- `apps/api/src/recovery-case.contracts.ts`
- `apps/api/src/recovery-case.controller.ts`
- `apps/api/src/recovery-eligibility-v3.application.test.ts`
- `apps/web/app/ui/recovery-cases.tsx`
- `apps/web/app/ui/recovery-eligibility-command.ts`
- `apps/web/e2e/CH-7.spec.ts`
- `config/agent-lane-assignments.json`
- `docs/contracts/recovery-eligibility-v3.md`
- `docs/verdicts/CH-7/BUILDER_RECEIPT.md`
- `packages/core/src/index.ts`
- `packages/core/src/recovery-case.ts`
- `packages/core/src/recovery-eligibility-v3.test.ts`
- `packages/core/src/recovery-eligibility-v3.ts`
- `packages/db/MIGRATIONS.md`
- `packages/db/migrations/0119_recovery_eligibility_v3.sql`
- `packages/db/src/index.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/recovery-case-repository.ts`
- `packages/db/src/recovery-eligibility-v3-repository.ts`
- `packages/db/test/recovery-eligibility-v3.integration.test.ts`
- `packages/db/test/tenancy.integration.test.ts`

Shared-file overlaps are additive and serialized with the integrator: M4-1-S-R recovery case/category/application/view; M4-2-S-R existing eligibility transport (v1 branch unchanged); M4-7-S only a qualified feed identity key in 0119, with settled-movement implementation untouched; shared core/DB exports, migration registry, catalog rows and OpenAPI. M4-5-S and the 0112 M4-6-S message/pursuit guards are untouched. Externally merged FIXLATER-1 also touches `recovery-cases.tsx` (delivery lookup lifecycle, separate lines); its commit is outside this issued-base working tree and must be preserved by integration. No reversed current-origin baseline difference is a builder edit. Existing dependency-owned tests remain unchanged except the issued lane's catalog rows.

Generated artifacts were removed after all builds/generator checks: package/API `dist`, web `.next`, `.turbo`, tsbuildinfo and test/build result directories. Installed dependencies are retained; no `.pnpm-store`, build output or `test-results` is left in this working tree.

## Outstanding gates / owed work

- BLOCKING: a coordinator source/dependency ruling and real synthetic supplier-invoice settled-payment fact for positive persisted F14/F16, plus their database/browser transition tests. No new hold has been approved by the builder.
- BLOCKING: mandatory API timeout failures need a clean completed run. Mandatory PostgreSQL/browser verification and a committed-range CI lane check remain outstanding; local lint:lanes now passes after the external remote-ref advance.
- Q6 HELD: B4/DW2/DW3; when released, exact terms approval and both synthetic/live M4-5 guard wiring remain owed. No terms-time fee entitlement is implemented.
- Q7 HELD: B5 insurer fact/rule/reason; Q4 HELD: individual-interest and unpaid-bill copy. F22 copy was found and built.
- D01 v3 and D03 v3 remain proposed; §5.5's signed consumed-credit production amendment and G4-S remain release gates. Production fee issuance/collection stays disabled.
- Existing pursuit templates remain limited to merchant_overcharge / withheld_customer_payment (`packages/core/src/recovery-message.ts:25`); no duplicate-payment pursuit support is claimed or added outside the issued lane. CH-7 builds its capture/eligibility view; any new template/support requires a separate owner/lane ruling.
- Fresh independent Claude Opus review and a separate Sol check after CI, each bound to the dispatcher's exact commit, followed by separate technical acceptance. The builder neither reviews independently nor accepts its own work.

## Integrator record, 11 October 2026 — held parts (coordinator rulings)

- B4, DW2, DW3 (fee-terms approval and the pursuit guard): HELD — D01 v3 is a founder pricing decision still at proposed (round-5 ruling Q6).
- B5 and the reason 'Insurer proceeds never qualify': HELD — the insurer paying-party type is attached to the job, not to the receipt fact (round-5 ruling Q7).
- Reason wording for F19's individual-debtor interest and for F21: HELD — no existing wording found in the repository; none invented (round-5 ruling Q4).
- F14 and F16 saved and on-screen positive path: HELD by the coordinator's ruling of 11 October — the practice feed has no 'supplier invoice paid' fact and none is invented inside CH-7; the pure-maths proof stands; a separate order adds that fact and then this persistence. Where the receipt above says BLOCKING for F14/F16, read HELD.

CH-7 is not fully accepted while these parts are held.

## CI repair 1 — 11 October 2026 (Claude Sonnet, run on the Mac)

First real run of the database and browser tests (the Codex sandbox could not start PostgreSQL or a browser). Base: d234315. Environment: macOS arm64, embedded PostgreSQL 16 (dylib symlinks hydrated with the package's `scripts/hydrate-symlinks.js`), every heavy run inside `heavy-slot ch-7`, one at a time. Browser runs: CI mode (`CI=1`, one worker, production `next start`) through an out-of-repo config (`/private/tmp/claude-501/ch7-catchup/playwright.local.config.ts`, not committed) that only points the unchanged `apps/web/playwright.config.ts` at the installed headless shell `chromium_headless_shell-1234`, because the pinned `-1193` shell is not installed on this Mac. The dev server (`pnpm dev`) is too slow on first compile for the 10 s expectations, so it was not used.

### Faults found and repaired

| # | Where | What PostgreSQL / the test said | Kind | Before → after |
|---|---|---|---|---|
| 1 | `packages/db/migrations/0119_recovery_eligibility_v3.sql` line 112 (`guard_recovery_eligibility_v3`) | `syntax error at end of input` when applying the migration (all of `test:migrations`, the tenancy suite, demo bootstrap and the CH-7 suite failed to start). PL/pgSQL cuts an `IF` condition at the first `THEN`, which was the `THEN` of a `CASE`. | CH-7 migration defect | `expected_q>c.claim_pence+CASE WHEN … END THEN` → `expected_q>c.claim_pence+(CASE WHEN … END) THEN`. Same meaning. |
| 2 | same file, line 116 (inside the `IF` at 113-118) | same class | CH-7 migration defect | `IS DISTINCT FROM CASE WHEN expected_q>0 THEN 'eligible_for_review' ELSE 'excluded' END` → `IS DISTINCT FROM (CASE … END)`. |
| 3 | same file, line 133 (`require_recovery_eligibility_v3_effect`) | same class | CH-7 migration defect | `<>CASE WHEN … END` → `<>(CASE WHEN … END)`. |
| 4 | `packages/db/test/recovery-eligibility-v3.integration.test.ts:30` | `null value in column "currency" of relation "recovery_case" violates not-null constraint` in `beforeAll` | test set-up | Seed insert now supplies `currency,state,revision,synthetic` (`'GBP','identified',0,true`), as the merged `recovery-cases.workbench` suite seeds a previous-schema case. |
| 5 | same test file, "catalogs and runtime enforce FORCE RLS…" (FK backstop block) | Expected `23503`, received `23505`: the inserted claim line repeated `(tenant, F18 review, 'principal')`, so `UNIQUE(tenant_id,review_id,kind)` fired before the foreign key could. | test set-up | The probe row now uses a one-line F20 review (`fixture("withheld_customer_payment",true)` + `review(…,"F20")`) and kind `statutory_interest`, so only the job mismatch can fail. The expectation `{code:"23503"}` is unchanged. |
| 6 | `apps/web/app/ui/recovery-cases.tsx` | `Review v3 …` button: computed outline was `none` after the spec's scripted focus following a mouse click (Chrome does not apply `:focus-visible` then; the global rule is `:focus-visible` only). | CH-7 screen defect | Added a scoped rule inside the v3 section (`<style>` with `[data-v3-candidate] button:focus{outline:3px solid #bf7500;outline-offset:3px}`, the colour already used by the recovery-message panel). A CSS file would have been cleaner but is outside CH-7's lane; this can move to a stylesheet when the integrator amends the lane. |
| 7 | `apps/web/e2e/CH-7.spec.ts` ("v3 refuses injected authority…") | `Cannot read properties of undefined (reading 'id')`: the test read the case list immediately after the click, before the open command finished. | test set-up | Added `await expect(page.getByRole("article",{name:"Selected recovery case"})).toBeVisible();` after the click, the same wait the other CH-7 test already uses. |
| 8 | `apps/web/app/ui/recovery-cases.tsx` | Merged `M4-1-S.spec.ts` (unchanged) failed `toBeFocused` on "Open £320 withheld payment": CH-7 had put "Open duplicate supplier payment" between that button and "Open materials-320 overcharge", so one Tab landed on the new button. | CH-7 screen defect (broke a merged test) | Moved "Open duplicate supplier payment" to the end of the action row, after "Record prevention". Existing tab order is unchanged. |

A scan of every `IF`/`ELSIF` condition in 0119 found no other `CASE … THEN` inside a condition; operator precedence of the `AND`/`OR`/`IS DISTINCT FROM`/`->>` expressions was read through and each mixed `AND`/`OR` is either parenthesised or has the intended precedence.

### Commands and results (final head content)

- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-eligibility-v3.integration.test.ts`: exit 0, 1 file, 17 of 17 passed (before: 0 of 17 ran).
- `pnpm test:migrations`: exit 0, 2 files, 13 of 13 passed (before: 2 failed, 9 skipped).
- Neighbour database suites (UIWIRE-12, practice-feed, recovery-cases, recovery-cases.workbench, recovery-follow-up-upgrade, recovery-follow-up, recovery-message-upgrade, recovery-messages, recovery, recovery-case-outcome, recovery-message-repository): exit 0, 11 files, 290 of 290 passed.
- Core: `vitest run src/recovery-eligibility-v3.test.ts src/recovery-eligibility.test.ts src/recovery-case.test.ts`: exit 0, 3 files, 193 of 193.
- API: `vitest run src/recovery-eligibility-v3.application.test.ts src/watchdog-registry.test.ts src/auth/context-boundary.test.ts`: exit 0, 3 files, 280 of 280.
- Playwright, CI mode, both projects: `CH-7.spec.ts` + `M4-1-S.spec.ts`: exit 0, 32 of 32 passed; `M4-2-S.spec.ts` + `M4-5-S.spec.ts`: exit 0, 20 of 20 passed. (CH-7 alone, before fault 8: 16 of 16; M4-1-S failed 2 of its tests until fault 8 was repaired.)
- Builds before the browser runs: `pnpm turbo run build --filter=@jobguard/api^...`, `--filter=@jobguard/api`, `pnpm --filter @jobguard/web build`: exit 0.

### Stopped on

Nothing. No expected money figure, reason string or outcome was changed to make a test pass.

No assertion, expected value or timeout was changed. Three set-up edits touch test files (faults 4, 5, 7): fault 7 adds one wait for an element and removes or loosens nothing; fault 5 changes which rows the probe inserts, not what it expects.

Still not run: `pnpm test:db` as a whole and the other Playwright specs outside the four named above. The held parts above are still held; the saved/on-screen F14 and F16 path is still unbuilt.

## Round 1 — 11 October 2026 (Claude Sonnet, run on the Mac)

Base: 8c74591. Source: the independent Sol check `ch-7-solcheck-20261011T173443.md` (findings 1, 2, 3 and 5; 4, 6 and 7 were out of this round). Same environment and browser set-up as "CI repair 1" (CI mode, production server, out-of-repo local Playwright config pointing at headless shell 1234). Lane paths added: none (every changed file was already on CH-7's own lane line).

| Fix | Status | Before → after | Tests (RED before the fix?) |
|---|---|---|---|
| 1. v1 review/approval for `duplicate_supplier_payment` | DONE | (a) `recovery-case-repository.ts` `eligibilityCommand`: a `review` or `approve` for a case of that category now throws the existing typed `ELIGIBILITY_FIXTURE_MISMATCH` (HTTP 400) before any write, inside the same transaction; before, a duplicate-payment case was reviewed and approved under `reference-d03.v1`. (b) New trigger `recovery_eligibility_v1_duplicate_payment_refusal` and function `app.refuse_v1_eligibility_for_duplicate_payment()` in 0119 (invoker rights, owned by `jobguard_migration`, execute revoked from runtime): a raw runtime insert of a v1 row for that category is refused with the same code. No merged routine is replaced and no v1 column, policy or grant is changed. (c) `recovery-cases.tsx`: the whole v1 "Why this may qualify" section (review buttons, approve, stale test) is not rendered for that category. | DB `a duplicate-payment case is refused any new v1 review or approval, by the app and by raw runtime SQL; other categories are unchanged` (reviewed and approved rows, app review and approval, zero rows and zero audit events left, and a control v1 review on a withheld-payment case still works): RED (resolved instead of rejecting), now green. API unit `the v1 repository's plain ELIGIBILITY_FIXTURE_MISMATCH … typed pre-effect refusal`: not RED (the code already existed; it only pins the mapping). Browser `a duplicate-payment case offers no v1 review controls and refuses a v1 command` (v1 buttons absent, v3 button present, HTTP 400 with the code, nothing saved): written together with the fix, NOT seen RED. The existing DW4 upgrade test is unchanged and green, as are the v1 suites of the other categories. |
| 2. Timing precision | DONE | `recovery-eligibility-v3-repository.ts`: the source-event query now returns `settled_before_opening`, computed in PostgreSQL as `e.state='settled' AND e.created_at <= (the case's created_at)` on the original `timestamptz` values; the repository no longer compares JavaScript `Date` values. The 0119 guard makes the same comparison. | DB, microseconds in the same millisecond, set with `session_replication_role=replica` by the migration connection: settlement `…00.000100Z` before opening `…00.000900Z` gives 0p "Paid before you opened this case" (green before and after, as the millisecond clock agrees there); settlement `…00.000900Z` after opening `…00.000100Z` gives 262000p, outcome eligible_for_review, reason "Fixed statutory compensation is not part of the fee base" (RED before: `ELIGIBILITY_FIXTURE_MISMATCH`; now green). |
| 3. Malformed stored result | DONE | 0119 guard (`guard_recovery_eligibility_v3`): the result must now contain all ten keys (`?&`), each with the right JSON type (`jsonb_typeof`; `reason` may be a string or an explicit JSON null; an absent key is a distinct, refused case). Claim lines inside `result.lines` were checked: they are compared with `IS DISTINCT FROM` on whole jsonb values built from the stored claim-line rows, so an absent `reason` in a line already differs from a present null; no gap there. | DB, runtime role, full otherwise-valid transaction (valid claim line and matching audit hash), `result` without `reason`: F17 and F21 shapes: RED (committed), now cannot commit and leaves 0 rows and no case-list failure. Third case, `reason` removed from the claim line: green before and after (it documents the check above). |
| 4. Jobs navigation in the browser spec | NOT DONE (nothing changed) | A job legitimately listed in Jobs cannot carry this journey without application code outside CH-7's lane. The Jobs home projection lists only jobs with `practice_session_digest IS NULL` (`packages/db/src/demo-runtime.ts:37`, `practice-session.ts:42`; DB test `workspace-read.integration.test.ts` "reads a captured job directly without broadening the filtered home list"), while the v3 review, the practice feed and the case workbench require a job owned by the practice session (`practice_session_digest = session digest`, `recovery-eligibility-v3-repository.ts` and `PracticeAccess`). The merged specs M4-2-S and M4-7-S record the same founder decision and use the same go-to-Jobs-then-saved-URL path. Missing: either listing captured practice jobs on the Jobs home (a change to those two files and that DB test, Ben's decision) or allowing the v3 flow on a non-practice job (a product and security change). | none |

### Commands and results

- `vitest run --maxWorkers=1 test/recovery-eligibility-v3.integration.test.ts` (before the fixes, new tests added): exit 1, 4 failed (the four RED cases above), 18 passed. After the fixes: exit 0, 23 of 23.
- `pnpm test:migrations`: exit 0, 2 files, 13 of 13.
- Eleven neighbour recovery database suites: exit 0, 11 files, 290 of 290.
- API: `vitest run src/recovery-*.test.ts src/watchdog-registry.test.ts src/auth/context-boundary.test.ts`: exit 0, 11 files, 496 of 496.
- Core: `src/recovery-eligibility-v3.test.ts src/recovery-eligibility.test.ts src/recovery-case.test.ts`: exit 0, 3 files, 193 of 193.
- Builds (`@jobguard/api`, `@jobguard/web`): exit 0.
- Playwright, CI mode, both projects: `CH-7.spec.ts` + `M4-1-S.spec.ts` + `M4-2-S.spec.ts`: exit 0, 40 of 40 (the new CH-7 case runs in both projects).

Not touched: `evidence-pack-sources.ts` (Sol finding 4), the UIWIRE-9 flake (6), sandbox timeouts (7). No expected money figure, reason string, outcome or timeout was changed; existing tests of merged leaves received no edit. Held parts remain held.
