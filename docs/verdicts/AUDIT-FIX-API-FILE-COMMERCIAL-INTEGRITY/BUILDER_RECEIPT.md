# AUDIT-FIX-API-FILE-COMMERCIAL-INTEGRITY — builder receipt

Issued by dispatcher 4, 13 October 2026. RED: tenant-scoped commercial money projections and authenticated operational feedback. Branch `codex/sandbox/audit-fix-api-file-commercial-integrity`; unchanged base/HEAD `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4` (`origin/main`). Working-tree delivery only; no git writes, commit, push, merge, migration, application grant, real data, business-provider call or spending. This is builder evidence, not independent review or technical acceptance. **HOLD for dispatcher/CI checks and independent exact-commit verdict.**

## Blocking findings: reproduced before implementation

Command: `apps/api/node_modules/.bin/vitest run apps/api/src/commercial-integrity.audit.test.ts` (repository root), exit **1**, 2 tests failed, before changing implementation.

1. `retains integrity reviews across application processes`: after a fresh module/application boundary, expected the exact submitted review; received `[]`. The smallest local reproducer resets the application module while preserving its mocked repository seam. It is an application unit test, **not** proof of PostgreSQL durability or an actual independent OS process. The separate new PostgreSQL regression launches two Node processes sharing the runtime database, replays and races the command, expects one persisted review and one audit event, and compares protected row contents.
2. `projects saved integrity money and omits nonexistent caps`: expected saved basis `200000`; received the literal `80000`. Assertions also require cap `3000`, actual cited figures/sources, and `null` for the v3 cap. The new PostgreSQL regression creates owned jobs, prices/sends/accepts through normal quote commands, activates through the normal v1/v3 path, and tests those saved figures and stranger/missing-session refusals.

Dropped blocking findings: none.

## Change and contracts

- Replace the static feedback array with the existing tenant-scoped `app.command_receipt` result. Insert the complete operational review once and append its audit hash/references in the same transaction. Uniqueness arbitrates racing replays; the application does not update/delete feedback. The integration fixture grants its temporary synthetic login only the existing `jobguard_runtime` role (NOSUPERUSER/NOBYPASSRLS); no application grant is introduced or expanded. This uses existing receipt permissions; it does not introduce a new database immutability guarantee for the receipt table. Explanations stay outside audit payloads. All business work precedes the audit-head lock.
- Recheck active owner membership and immutable practice ownership in the review transaction, in addition to the unchanged `PracticeAccess` boundary. GET and POST still refuse production/pilot under proposed D11. No Decision, authorization, outbox or financial write is performed.
- Read accepted value and historic cap from persisted job fields, quoted value from immutable issued/accepted documents, final value from the current immutable final-account revision, with explicitly synthetic saved-fact fallbacks. Read saved acceptance/activation/activity/landing facts and cite their source identities. Validate displayed pence through `money`. Absent values/caps remain `null`; no cap is calculated or invented for v3.
- Keep the existing response/input versions, synthetic profile and scenario evaluation clock. Stable existing finding keys remain tied to their kind, independent of other findings appearing/disappearing. No new route, screen, pricing policy, provider, alert or release capability. Existing Next and Nest adapters share the repaired application.
- New repository export is appended to `packages/db/src/index.ts`; the lane entry is one compact line with eight exact file paths. Registry/index overlaps serialize with the dispatcher/integrator. No existing catalogue row, test expectation, refusal, count, pinned name or fingerprint was changed. `apps/api/src/auth/context-boundary.test.ts` and its lists are untouched.
- No migration/backfill. Pre-fix process-local feedback was never persisted and cannot be recovered. Older application binaries still ignore these receipts and retain their previous bugs; deployment must update all workers. No receipt/result immutability strengthening or policy approval is claimed. Roll back code only if needed, retaining receipts/audit history, then fix forward.

## Permitted premise setup: before/after

Only `apps/api/src/commercial-integrity.application.test.ts` receives additions to an existing test. Before:

```ts
vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue({} as never);
const app=new CommercialIntegrityApplication({} as never,undefined,"synthetic_demo"),before=await app.view("job");
```

After: the same ownership stub and the exact unchanged application call surround these added premises (plus imports of `money` and the new repository):

```ts
const feedback: Array<{jobId:string;commandId:string;findingKey:string;explanation:string;outcome:"dismissed_false_positive";version:"commercial-integrity-review.v1";recordedAt:string}> = [];
vi.spyOn(CommercialIntegrityApplicationRepository.prototype,"read").mockImplementation(async (_context,jobId)=>({facts:[],capBasisPence:money(80000).pence,acceptedCapPence:money(1200).pence,feedback:feedback.filter(row=>row.jobId===jobId)}));
vi.spyOn(CommercialIntegrityApplicationRepository.prototype,"review").mockImplementation(async (_context,_member,jobId,raw)=>{const input=raw as Omit<(typeof feedback)[number],"jobId"|"recordedAt">;const result={jobId,...input,recordedAt:"2026-04-09T10:00:00.000Z"};feedback.push(result);return result;});
```

A read-only comparison confirmed the entire existing test file is byte-identical after removing the six added import/setup lines. Every original call and assertion remains byte-for-byte unchanged, including `1200`, the one-review count and the other-job empty result. This preserves the original projection-unit premise; the new audit regressions use different persisted amounts.

Catalogue addition for a new thing: before, `packages/db/src/index.ts` ended with the recovery-payment-payer export; after, append only `export * from "./commercial-integrity-application-repository.js";`. The lane registry adds only this new lane; all existing entries are unchanged.

## Local verification

Node `v24.17.0`; dependencies already installed. The global pnpm launcher stalled and ultimately refused its automatic version switch: registry signature verification fetches failed. No package was installed; its attempted registry access was launcher behavior, not an intentionally issued download/install command. Switched to the already cached pinned CLI without changing signature/security settings. Remaining pnpm commands use an external `/private/tmp/jg-api-integrity-bin/pnpm` wrapper invoking the **already cached pinned 10.28.1** at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/dist/pnpm.cjs`; PATH prepends that directory. No install/update/download command was issued. Shared Turbo cache hits identify their original worktree in replayed logs; they are cached deterministic checks, not fresh executions or independent verification.

- Initial reproduction: exit 1 for the two expected regression failures above.
- Focused API run: `node_modules/.bin/vitest run src/commercial-integrity.audit.test.ts src/commercial-integrity.application.test.ts src/practice-session.test.ts src/practice-transports.test.ts src/auth/context-boundary.test.ts --maxWorkers=1` in `apps/api`: exit **0**, **5 files / 370 tests passed**. Includes the untouched protected boundary scanner. New audit file has three tests including read/review production/pilot refusals.
- `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs`: exit **0**, **19 tests passed**.
- `packages/config` tests: **2 passed** (during the multi-package run).
- `node_modules/.bin/vitest run src --maxWorkers=1` in `packages/ai`: exit **0**, **5 files / 80 tests passed**; fixture/provider-fake evaluation only, no live model.
- Same command in `packages/storage`: exit **0**, **1 file / 2 tests passed**; no live MinIO integration.
- `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` in `apps/api`: exit **0**. The normal `pnpm openapi:check` was attempted and exited **1** because the tsx CLI binds an IPC socket (`listen EPERM`); the loader executes the same generator/check without that launcher socket.
- `LANE_BASE_REF=origin/main pnpm lint`: exit **1**. Core purity passed; lane step refuses `Missing branch or self-comparison range` because no commit is allowed and HEAD equals origin/main. `LANE_BASE_REF=origin/main pnpm lint:lanes`: same exit **1**. These checks are **not** waived or described as passes. Supplemental read-only working-tree path inspection with the existing `selectLane`/`matches` functions passed for all eight exact paths and verified the old registry entries are identical; it is not the mandatory lane check. Protected-file before/after SHA-256 is unchanged: `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`. `git diff --check` passed.
- Money arithmetic and commercial-boundary lint scripts: exit **0**. Final `pnpm turbo run lint`: exit **0**, all 7 package lint/typecheck scripts successful (4 cached). This does not supersede the failed root/lane checks above.
- Broad core/config/AI `pnpm ... test` run: exit **1**, core **4884 passed / 6 failed** because it also discovers compiled `dist` tests (two missing `.ts` source-file paths) and four allocator timeouts. Source-only core rerun: **2444 passed / 1 failed**, default 5s timeout in unchanged `src/receipt-allocation.test.ts:212` (“the working size is bounded…”). No assertion or timeout was changed. A later isolated rerun of that exact test under the default timeout passed (exit **0**, 1 passed / 33 name-filtered skips, 3.34s test time); the final full source rerun again exited **1** with **2444 passed / 1 timeout** (5.615s test time); this is not reported as a green suite.
- Initial typecheck/build attempts found an invalid audit classification in newly written code and an unbranded pence value in newly added mock setup. Corrected both; final runs recorded below. An early focused test rerun also ran before the new db export was built, causing missing-constructor failures; superseded by the passing focused run above.
- PostgreSQL regression collection: `node_modules/.bin/vitest list test/commercial-integrity-api-audit.integration.test.ts --filesOnly` in `packages/db`, exit **0**. Collection is not execution.
- Supplementary compile: `node_modules/.bin/tsc -p /private/tmp/jg-api-integrity-test-tsconfig.json` (extends repository strict config and includes the new PostgreSQL test), exit **0**. This does not establish SQL correctness or PostgreSQL guarantees.

- Final `pnpm typecheck`: exit **0**, all 7 packages successful (4 cached). Final `pnpm build`: exit **0**, all 7 packages successful (4 cached), including Nest and production Next. Existing Next workspace-root/CSS warnings and Turbo cache I/O warnings occurred; no product/config change to suppress them.
- Broad API command `node_modules/.bin/vitest run src --maxWorkers=1 --exclude src/shadow-isolation.application.test.ts`: exit **1**, **1572 passed / 108 failed / 1 skipped**, 64 files passed / 7 failed. The failed HTTP suites require socket binds (`listen EPERM`, then Supertest null-address errors); `final-account-lock.isolation.test.ts` could not obtain a listening port. Shadow isolation was excluded before execution because it starts PostgreSQL/listeners. These mandatory checks remain for CI.
- First web unit run: exit **1**, 147 tests passed but 16 suites could not import API dist modules while the API build was incomplete. Rerun after the successful build: exit **0**, **33 files / 784 tests passed**.
- Local DB units: `node_modules/.bin/vitest run src test/recovery-case-join.test.ts test/site-extra-evidence-compatibility.test.ts test/recovery-message-repository.test.ts test/recovery-case-outcome.test.ts test/audit-api-capture.test.ts test/verify-audit-export-cli.test.ts test/contractor-session-context.test.ts test/verify-evidence-pack-cli.test.ts --maxWorkers=1` in `packages/db`: exit **1**, **166 passed / 1 failed**, 11 files passed / 1 failed. Unchanged `src/audit-checkpoint-handoff.test.ts:279` source-reachability scan timed out at the default 5s (13.684s scan). No PostgreSQL was started and no test timeout/expectation was changed.
- Root `pnpm test` was not invoked: its two lane-fixture tool suites execute `git init/add/commit/switch/merge` even in scratch directories, contrary to this order's no-git-writes rule, and the remaining root pipeline starts DB/listener suites. The permitted tool tests and workspace units were run explicitly above.

## Dispatcher checks on Mac / GitHub CI

The sandbox cannot bind localhost or run PostgreSQL/browser suites. No PostgreSQL or browser was started. Do not accept this work on the mocked unit regressions alone. After committing and pushing the unchanged allowed diff, run normal pinned-install CI checks and the following:

```sh
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm typecheck
pnpm build
pnpm openapi:check
pnpm test
pnpm test:db
pnpm test:migrations
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/commercial-integrity-api-audit.integration.test.ts test/commercial-integrity.integration.test.ts test/activation.integration.test.ts test/job-activation-terms.integration.test.ts test/practice-session.integration.test.ts
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M1-16-S.spec.ts CH-1.spec.ts SBOX-SESSION-1.spec.ts
pnpm test:e2e
```

The existing M1-16-S browser fixture opens an unaccepted/unactivated draft sample but expects fabricated findings/cap; inspect that unchanged regression under real execution. It must not be “fixed” by changing expectations or reintroducing invented projections. Any necessary premise setup must be concrete and separately reviewed under the standing rule. All mandatory suites, exact-commit cross-model verdict, separate acceptance and release gates remain held. No D11/G4 approval inferred.

## Later finding (receipt only)

- Report finding 3 (LATER): a command ID can be reused with a different payload on another job.

## Handoff

Intended conventional commit subject/body is in `/private/tmp/jg-msg-audit-fix-api-file-commercial-integrity.txt`. Dispatcher owns commit/push; independent checker owns exact-commit verdict; separate actor owns acceptance. No builder self-acceptance.
