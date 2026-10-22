# CH-7-REST-C — builder receipt

20 October 2026. Codex builder; requested gpt-6.1-sol, medium. No independent review, self-acceptance, commit, push, merge or release. Starting HEAD `98a7a80515c4d12db6f97154d7192d33ea4b5157`; observed origin/main `dc5721230fd8aedbf2d9d0457789074b66b48765`. Exact prerequisites and scope recorded in the ledger. Existing install, Node v24.17.0, cached corepack pnpm 10.28.1. No packages installed/downloaded. Disk preflight 47,438,724 KiB available (above 45 GB).

Read AGENTS.md in full, BUILD_PLAN CH-7/terms contracts, main checkout's approved speed-v5 milestone/deferrals, BEN-ANSWERS-20261017, draft-ch-7-rest-20261018T132715, B issuance embedded in d123, d123 continuation and v5-r1 order, B ledger/receipt, latest terms helper/writer/callers, and affected current/historical setup. Current issuance controls over stale dispatch mechanics.

Failing-first: the new integration and upgrade files and amended null-policy expectation were written before creating 0207. PostgreSQL suites NOT RUN by explicit instruction/environment; no executed red-to-green database claim. Existing helper's source demonstrably allowed null/v1 withheld cases through its policy OR branch. The replacement removes only that branch. Ordinary command and raw-trigger proofs require CI. All source remains synthetic and production-disabled.

Implementation, named proofs, exact expectation amendment, setup choices, own-migration preservation and residual gates are recorded in docs/ledger/CH-7-REST-C.md and migration note 0207. No new table/core API/transport or grant/security inventory changes. Contract records new-action-only enforcement and historical replay preservation. SQL owner/security/grants preserved by CREATE OR REPLACE; no writer/caller replacement. Financial/provider effects unchanged.

## Actual local commands

Every heavy check uses `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot <label> <command>`; Vitest at most two workers and three named files. Logs `/private/tmp/jg-ch-7-rest-c-*.log`. Sandbox sysctl/sysmon/process-list warnings come from the required heavy-slot wrapper; commands still ran. No timeout/worker/approval bypass.

## Remaining acceptance

PostgreSQL, migration and browser/Playwright suites NOT RUN locally (CI-only); affected prior suites, fresh install and upgrade must pass there. No clean install was attempted (no downloads authorized). No AI/schema extraction/model change: eval inapplicable. The guarded SQL function change is not a changed AI output schema. No actual independent verdict exists for this uncommitted patch. Await exact-head RED verdicts, separate acceptance, B integration and green CI. Production gates and founder merge/release remain closed.

| Actual command (heavy-slot prefix as above) | Result |
| --- | --- |
| `corepack pnpm --filter @jobguard/db typecheck` | PASS exit 0; typecheck.log. |
| `node node_modules/typescript/bin/tsc -p /private/tmp/jg-ch-7-rest-c-tsconfig.json --noEmit` | PASS exit 0; fixture-typecheck.log; final reruns after added upgrade/reminder coverage: fixture-typecheck-final.log and fixture-typecheck-final-2.log. Scratch config includes db/src and all five changed integration files; package config excludes test/. |
| `LANE_BASE_REF=origin/main corepack pnpm lint` | FAIL exit 1 at lane check, lint.log: eleven inherited B paths outside C. Core purity passed (229 files). Integration HOLD until B merges; no lane widened. |
| `LANE_BASE_REF=origin/main corepack pnpm lint:lanes` | FAIL exit 1, lanes.log, same inherited B paths. |
| `PATH=/private/tmp/jg-ch-7-rest-c-bin:$PATH LANE_BASE_REF=98a7a80515c4d12db6f97154d7192d33ea4b5157 corepack pnpm lint` | FAIL exit 1, own-lint.log: tool refuses base=HEAD self-comparison. This is not a passing alternate lane check. |
| `corepack pnpm --filter @jobguard/db lint` | PASS exit 0; package-lint.log. |
| `node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs` | PASS exit 0; constituent-lint.log. |
| `corepack pnpm --filter @jobguard/db build` | PASS exit 0; build.log. |
| `corepack pnpm exec turbo run build --filter=@jobguard/db...` | FAIL exit 1, dependency-build.log: Turbo invoked the system pnpm 11.8.0 in a child despite the pinned outer pnpm. Storage cache restored; no dependency installed. Used direct pinned package builds below, without bypassing version checks. |
| `corepack pnpm --filter @jobguard/core build` | PASS exit 0; core-build.log. |
| `corepack pnpm --filter @jobguard/db exec vitest run test/recovery-message-repository.test.ts test/recovery-case-join.test.ts test/recovery-eligibility-v3-interest.test.ts --maxWorkers=2` | First FAIL exit 1 at import before tests (core dist absent), units.log. After direct core build: PASS exit 0, 3 files / 27 tests, units-retry.log. Mocked repository/unit checks, not a database integration. |
| `corepack pnpm --filter @jobguard/core exec vitest run src/recovery-case-terms.test.ts src/recovery-eligibility-v3.test.ts src/recovery-terms-timing.test.ts --maxWorkers=2` | PASS exit 0, 3 files / 66 tests; core-units.log. Includes inherited money/reason controls, not live provider or database proof. |
| `PATH=/private/tmp/jg-ch-7-rest-c-bin:$PATH corepack pnpm openapi:check` | FAIL exit 1; openapi.log: tsx CLI cannot bind its IPC pipe (EPERM). |
| `node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/src/generate-openapi.ts --check` from repo root | FAIL exit 1; openapi-direct.log: root tsconfig lacks API decorator settings. |
| `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` from apps/api | First FAIL exit 1 (config dist absent), openapi-api-cwd.log. After dependency builds: PASS exit 0, openapi-final.log. Loader executes same generator/check without CLI IPC. No OpenAPI file changed. |
| `corepack pnpm --filter @jobguard/config --filter @jobguard/ai build` | PASS exit 0; openapi-deps.log. Local workspace builds only, needed to execute unchanged OpenAPI generator. |
| `node /private/tmp/jg-ch-7-rest-c-source-check.mjs` | PASS exit 0; scope-final.log. Deterministic C working-tree scope and exact helper predicate comparison only; does not substitute for the held origin/main lane check. |
| `git diff --check` | PASS exit 0. |

No PostgreSQL/migration/browser suite or broad root test was executed. New failing-first database files were initially authored before 0207, then expanded with migration controls and the historical v1 reminder; no database red-to-green result claimed. The SQL replacement is source-inspected; local unit suites are test-executed; the task is not independently verified or technically accepted.

Successor setup inspection found no out-of-lane amendment necessary: terms-upgrade's positive successor uses a genuinely v3 job and real terms command; follow-up-upgrade executes new pursuits before applying 0134/0207, then only compares history after all successors. Those historical seeds and all their assertions are unchanged. No shared patch proposal or silent HOLD on an unimplemented setup change.

Final named database proofs remain CI-required: NullPolicyWithheldPursuitRefused, V1PolicyWithheldPursuitRefused, RawPreviewApprovalSinkRefused, ReminderUsesSameGuard, V3ApprovedTermsStillWork, NonWithheldUnchanged, HistoricalPursuitPreserved. Retained existing tests cover revoked/expired owner, foreign tenant/job/case, approval replay/conflict, exact authorization and rollback. New contention proof holds the actual case advisory key from a second connection and observes PostgreSQL blocking before release/refusal. Upgrade comparison covers nonempty predecessor tables, full PostgreSQL timestamp precision and types, original PK identities, allowed later additions and two successor runner calls. Raw refusal additionally compares row counts to detect stray inserts.

Intended commit message: `/private/tmp/jg-msg-ch-7-rest-c.txt`. Dispatcher owns all git writes. Final task status: bounded source implementation complete; acceptance HOLD for B integration, required main-range lane checks, PostgreSQL/browser CI, two independent exact-head checks and separate acceptance. No source/hash freeze of another piece, global configuration, reserved worktree or out-of-lane source change.


## v5-r2 repair receipt — source and local checks only

Issued repair at `33a51a69ce260f4e8c12768b2bab1c0e8c10f3a9`, branch `codex/sandbox/ch-7-rest-c`; exact C-only parent remains unmerged #298 `98a7a80515c4d12db6f97154d7192d33ea4b5157`. Read AGENTS.md, applicable BUILD_PLAN CH-7/M4-5-S/§10.3.3, terms contract, main checkout's approved milestone/deferrals, Ben's 17 October answers, current ledger/receipt and the actual independent Claude A REPAIR at `/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch-7-rest-c-opus-A-33a51a69.md`. That recorded verdict remains historical; the earlier receipt's statement that no verdict exists applies to its original uncommitted work and does not describe the present repair. B's partial reasoning was not read. No Claude runs, self-acceptance or git writes.

Failing-first evidence is source-only: initial `inIsolatedWorld` creates a checked v3 activation; six round-9 calls then insert a second activation before their assertions. A identified the uniqueness conflict; this builder did not execute PostgreSQL to reproduce it. Root's express r2 authority permits only the six-test v1 supplier substitution and two exact template changes. Implemented in the local test helper, with no shared fixture or production change. Default worlds still call `seedPursuitFixture`; the new option is selected six times, all in round 9. Twelve participating constructors explicitly use merchant cases; source references come from existing supplier fixtures. Added exact caseType/recipient/sourceRefs assertion. Fixture/context/actor restoration is unchanged.

Preservation proof: `/private/tmp/jg-ch-7-rest-c-r2-preservation.py` compares against the exact repair head and inversely normalizes only the issued substitutions. It reconstructs all 1,797 original lines, so helper code outside the selector and every test outside the six opt-ins (including the seventh default-v3 no-history test) remain unchanged. It retains all 41 original round-9 assertions, adds one supplier identity assertion, and compares the full numeric-token sequence unchanged. The exact original receipts/approvals, GREATEST money logic, case revisions, counts, changedSinceReview, cancellation/retryable/blocked states, zero/nonzero sinks, runtime landing calls and both lock-order interleavings remain. Two customer-body expectations are expressly replaced by supplierBody at identical £200.00 and £120.00; this is the authorized category wording change. 252 protected migration/runtime/terms/refusal/follow-up files are byte-identical to the repair head. 0207 SHA-256: `c4bb7e8fa0f5682cc7825c357fde757cf565982e40f3fe5b5629a8ceff0a579c`. No new withheld approval/refusal test changed.

Coverage split: legacy v1 approved landings and their shared money/lock invariants now run through supported supplier correction. Current withheld customer pursuits retain actual v3 terms setup elsewhere. There is no claim of a current-v3 customer approved-landing integration path, no restored v1 withheld route, no policy conversion and no production engine invented.

Existing install only, Node v24.17.0 / corepack pnpm 10.28.1. No install/download or cache deletion. Disk available before first heavy command: 47,182,688 KiB; rechecked at 47,190,812 KiB and 47,201,072 KiB before subsequent heavy commands (above the 45 GB floor). Heavy commands use `HEAVY_SLOTS=2 /Users/benharwood/.local/bin/heavy-slot <label>`; no more than two issued concurrently, then serialized after wrapper failure. Wrapper sysctl/sysmon/process-list warnings are recorded, with no bypass. Logs are `/private/tmp/jg-ch-7-rest-c-r2-*.log`.

| Actual command (heavy-slot where applicable) | Result |
| --- | --- |
| `corepack pnpm --filter @jobguard/db typecheck` | PASS exit 0; typecheck.log. |
| `node node_modules/typescript/bin/tsc -p /private/tmp/jg-ch-7-rest-c-tsconfig.json --noEmit` | PASS exit 0; integration-source.log. Existing scratch config includes db/src and all five C integration files, inherits strict repo settings; compiles tests omitted by package config. No DB execution. |
| `PATH=/private/tmp/jg-ch-7-rest-c-bin:$PATH LANE_BASE_REF=98a7a80515c4d12db6f97154d7192d33ea4b5157 corepack pnpm lint` | PASS exit 0; lint.log, 7 package tasks successful (2 cached). Existing temporary pnpm shim selects installed corepack pnpm for Turbo children, no global config change. Exact-parent local lane check includes working diff. |
| `LANE_BASE_REF=98a7a80515c4d12db6f97154d7192d33ea4b5157 corepack pnpm lint:lanes` | PASS exit 0; lanes.log. C-only scope, not main integration. |
| `LANE_BASE_REF=origin/main corepack pnpm lint:lanes` | FAIL exit 1; main-lanes.log: eleven inherited B paths, unchanged prerequisite HOLD. |
| `corepack pnpm --filter @jobguard/db exec vitest run test/recovery-message-repository.test.ts test/recovery-case-join.test.ts test/recovery-eligibility-v3-interest.test.ts --maxWorkers=2` | Initial wrapper exit 2 before Vitest (mocked-units.log; only resource-probe warnings). Same command retried serially through heavy-slot: PASS exit 0, 3 named files / 27 tests (mocked-units-retry.log). Mocked units only. |
| `python3 /private/tmp/jg-ch-7-rest-c-r2-preservation.py` | PASS exit 0; preservation.log. Deterministic before/after source proof described above. |
| `corepack pnpm --filter @jobguard/db build` | PASS exit 0; build.log. |
| `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` from apps/api | PASS exit 0; openapi.log. Uses the established loader method to execute the unchanged generator without the tsx CLI's unsupported IPC listener. No generated file changed. |
| `git diff --check` | PASS exit 0, including final receipt/ledger edits. |

PostgreSQL, migrations, browser, listeners and race execution NOT RUN locally, per issuance. CI on the exact repaired dispatcher head must execute the complete recovery-messages integration suite, all six supplier landing scenarios and both race orders, pursuit-terms integration/own-upgrade proofs, retained recovery-case-terms/follow-up and affected prior upgrade suites, F14/F16 supplier-credit and B terms-timing regressions. Exact-head fresh A and B independent checks, separate acceptance, prerequisite integration and green CI remain required. Root/main lane stays held; no review/acceptance/release claim. Production SQL and 0207 are unchanged, with no migrations/data changes, new alerts, external action or compatibility change in this repair.


Final working-tree scope check: exactly the three issued writable files differ from repair HEAD (message integration test, own ledger and own receipt). No git object/ref/index write or push. Intended dispatcher commit message written to `/private/tmp/jg-msg-ch-7-rest-c.txt`. Bounded r2 implementation and permitted local checks complete; actual PostgreSQL/race CI and fresh independent exact-head A/B verdicts are still owed, with separate acceptance and #298/main integration held.


## v5-r3 S2 — same-session issued repair, preflight

22 October 2026. Current Ben approval issues the prepared order `/Users/benharwood/.local/share/full-steam/jg-orders/CH-7-REST-C-v5-r3-S2-PREPARED-20261021T172446Z.txt`; its old NOT DISPATCHED/account-selection prose is superseded by the controlling same-session Ben2 approval, with all source and acceptance restrictions retained. Read current session policy in full at `/Users/benharwood/Claude/Projects/Next Gen Learning Platform/docs/workflow/CODEX_SESSION_POLICY.md`, AGENTS.md in full, applicable BUILD_PLAN CH-7/M4-5-S cards, terms/eligibility contracts, actual A REPAIR and prepared order. Did not read B or use it to dismiss A. No new session, fork, --last, route/account switch or recursive heavy-slot acquisition. This leaf touches CH7 only; Vite/pins are outside its scope.

Pre-edit source checks: cwd/branch/full HEAD match preflight at `9bfc66781b64c21efbbcb4088ac32ec085fc73e3`; staged/unstaged/untracked status empty. All six assigned source-before SHA-256 values match the authoritative preflight. Originals plus source-before.json preserved at `/private/tmp/jg-ch7-r3-source-before-20261022/`. Own lane and receipt paths verified; only four issued test paths may be appended to the lane, and only own receipt appended (ledger unchanged). No production source, migrations, shared fixture, dependencies or lockfile authorized.

```json
{
  "session_record_version": 1,
  "task_id": "CH-7-REST-C",
  "project": "JobGuard",
  "role": "product repair (serial)",
  "thread_id": "01a15afd-b3e2-7a83-8b07-3144fdddd800",
  "surface": "codex-cli",
  "host": "local",
  "authorised_route_ref": "/Users/benharwood/.codex-ben2",
  "repository": "/Users/benharwood/Claude/Projects/my-new-project",
  "integration_target": "main",
  "integration_target_revision": "dc5721230fd8aedbf2d9d0457789074b66b48765",
  "worktree": "/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch-7-rest-c",
  "branch": "codex/sandbox/ch-7-rest-c",
  "starting_base_revision": "9bfc66781b64c21efbbcb4088ac32ec085fc73e3",
  "source_pin": "9bfc66781b64c21efbbcb4088ac32ec085fc73e3",
  "candidate_revision": "9bfc66781b64c21efbbcb4088ac32ec085fc73e3",
  "allowed_files_ref": "/Users/benharwood/.local/share/full-steam/jg-runs/approved-saved-resumes-20261021T173036Z/CH7-ISSUED.txt",
  "governing_contract_ref": "/Users/benharwood/Claude/Projects/Next Gen Learning Platform/docs/workflow/CODEX_SESSION_POLICY.md",
  "model_requested": "gpt-6.1-sol",
  "effort_requested": "medium",
  "last_validated_revision": "9bfc66781b64c21efbbcb4088ac32ec085fc73e3",
  "model_runtime_confirmed": "gpt-6.1-sol",
  "effort_runtime_confirmed": "medium",
  "runtime_confirmation_ref": "/Users/benharwood/.codex-ben2/sessions/2026/10/20/rollout-2026-10-20T21-25-38-01a15afd-b3e2-7a83-8b07-3144fdddd800.jsonl:173",
  "last_completed_turn": {
    "timestamp": "2026-10-20T20:29:05.746Z",
    "turn_id": "01a15afd-b5cf-7601-a610-8705eea35baa"
  },
  "last_receipt_ref": "docs/verdicts/CH-7-REST-C/BUILDER_RECEIPT.md",
  "state": "r3 issued; preflight verified; source repair in progress; heavy checks gated",
  "resumed_from_thread_id": "01a15afd-b3e2-7a83-8b07-3144fdddd800",
  "successor_reason": "none; same saved session",
  "preflight_ref": "/Users/benharwood/.local/share/full-steam/jg-runs/approved-saved-resumes-20261021T173036Z/CH-7-REST-C-session-preflight.json",
  "result_id": "unknown",
  "acknowledgement_ref": "unknown",
  "ci_evidence_ref": "unknown",
  "reviewer": "actual Claude A",
  "review_evidence_ref": "/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch-7-rest-c-opus-A-9bfc6678.md",
  "accepting_actor": "unknown",
  "acceptance_evidence_ref": "unknown",
  "outstanding_holds": [
    "unmerged #298",
    "migration queue/cap",
    "full exact-head CI",
    "fresh independent A/B",
    "separate acceptance"
  ],
  "builder_finished_at": "unknown",
  "coordinator_acknowledged_at": "unknown",
  "integrated_at": "unknown",
  "merged_revision": "unknown"
}
```


### r3 source implementation and preservation (not database execution)

1. `later-outbox`: only ruling112's local seed call selects the current-pursuit recipe. It keeps the original withheld customer case and adds actual terms through `RecoveryCaseTermsRepository.approve` with the fixture owner's real identity. Every retry/back-off/history/authorization/sink assertion remains verbatim.
2. `later-recovery-message-attempt`: both initial and isolated local worlds use the checked first v3 activation. `newCase` approves real terms only for withheld cases. Merchant/prevention case type, source/book semantics and all claim/event setup are unchanged. Both race bodies, non-owner runtime calls and timeouts are untouched.
3. `migfix-8`: bootstrap, practice session issuance, job/session digest and all sandbox clock/run/scheduling setup remain unchanged. The locally created random job's FIRST switch (after its actual accepted document/acceptance) now calls the same checked v3 routine as the existing pursuit fixture. This job is distinct from bootstrap's preexisting jobs, so bootstrap needs no change. The routine's activation trigger supplies the track; the test verifies that exact track instead of inserting a duplicate. Real case terms are approved through the runtime repository with the actual demo membership identity. All MIGFIX-8 assertions, sourceMessageId/sequence binding, refusal and zero-effects tests remain verbatim.
4. `recovery-message-upgrade`: population through0106, application of0107 alone, its own history/catalogue/pack assertions and the existing idempotence tail remain byte-identical. Only the explicitly authorized two-line post-all-successors v1 positive preview was replaced: exact `RECOVERY_TERMS_NOT_APPROVED`, unchanged ten-table effect counts, zero case preview/approval/sink rows and unchanged read state. Readiness/attachment assertions remain verbatim. Added a separate current-schema merchant preview over the fixture's actual supplier rate/invoice/delivery sources, exact 32000p GBP and supplier recipient/body. This is not a new0207 own-upgrade proof and does not claim a v3 customer landing path.

The two local shared-fixture wrappers match the exact transition SQL and exact primary 1880000p switch arguments/revision/policy/cap, verify the selected accepted document, and assert one interception for the returned primary job. Source has a separate 100000p unrelated-job switch, which is forwarded unchanged. Only the exact primary commercial-track INSERT is replaced by reading/asserting the binding that v3 already created; all other SQL/arguments and client release pass through. Counts fail closed if the fixture recipe changes. No activation ON CONFLICT, blind policy update, conversion, fabricated terms, changed source, global flag, imported test file or shared-helper edit. Exact activation authorizations use the already established local candidate recipe; as with that existing recipe its fixture-only activation receipt remains processing, not a claimed product command completion. Terms themselves use the real dispatcher-backed runtime repository.

`/private/tmp/jg-ch7-r3-preservation.py` inversely removes only the explicit additive helpers/terms/imports, restores the authorized first-switch/track setup changes, and reverses only the exact successor preview substitution/additive control. All four complete normalized files equal preserved originals byte-for-byte. Ordered original assertion lines retained: later-outbox29, later-attempt27, MIGFIX-8 22, upgrade12 (only the one authorized old positive assertion is omitted/replaced). Original timing/money/race blocks are therefore retained; no skipped/disabled tests or timeout changes. Proof log: `/private/tmp/jg-ch7-r3-preservation.log`; reviewable exact source patch: `/private/tmp/jg-ch7-r3-source.patch`. Own lane appends exactly four issued paths, preserving all old metadata/allow entries. Own receipt is append-only. Only those six assigned files differ; index and untracked status remain empty. Ledger, all R2 source, shared fixture,0207, runtime SQL/source, packages and lock remain unchanged.

### r3 actual checks and resource HOLD

Already inside the root lifetime `HEAVY_SLOTS=1` slot: no recursive acquisition. No installs/downloads, git writes, push, merge, reviewer run or provider/network/database action. System runtime is Node v24.17.0; existing manifest pins remain pnpm10.28.1, TypeScript5.8.3 and Vitest4.1.11. No dependency, Vite, Rollup or other pin changed by this CH7 leaf.

| Command/check actually run | Result |
| --- | --- |
| Python exact-head/status/branch/preflight SHA-256 comparison and preserved source-before copies | PASS exit0; all six hashes match authoritative preflight before first edit. |
| `python3 /private/tmp/jg-ch7-r3-preservation.py` | PASS exit0; complete reverse-normalization and exact six-file/lane/receipt checks. |
| `LANE_BASE_REF=98a7a80515c4d12db6f97154d7192d33ea4b5157 node tools/agent-lane-boundary-lint.mjs` | PASS exit0; `/private/tmp/jg-ch7-r3-lanes.log`. Direct lightweight lane checker, no root lint fanout or compiler. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | FAIL exit1; `/private/tmp/jg-ch7-r3-main-lanes.log`: eleven inherited B paths, unchanged prerequisite hold. |
| `git diff --check` | PASS exit0. |
| Resource probes (`df -k`, `memory_pressure`, Python `os.getloadavg`) | Disk/memory/load measured; snapshot below. `sysctl vm.loadavg` denied; `pgrep` cannot read process list; attempted `ps` execution raises sandbox PermissionError. No automatic approval review rejection occurred; no escalation or sandbox bypass attempted. |

Fresh measured snapshot `/private/tmp/jg-ch7-r3-resource-preflight.json`:

```json
{
  "timestamp": "2026-10-21T23:55:19.603109+00:00",
  "freebytes": 235221000192,
  "floorbytes": 48318382080,
  "node_count": null,
  "loadavg": [
    2.88525390625,
    2.96875,
    2.896484375
  ],
  "node_count_error": "pgrep cannot get process list; ps execution raises PermissionError in sandbox (prior probes)",
  "memory_free_percent": 55,
  "memory_probe_exit": 0,
  "gate_open": false,
  "reason": "node count cannot be rechecked under retained sandbox; unknown is not pass"
}
```

Node count is unknown, not <=45 proven. Therefore no heavy command was started. Required db typecheck/lint/build and strict four-file integration-source compile are NOT RUN in r3, held on that missing resource measurement. Scratch strict compile config is ready at `/private/tmp/jg-ch7-r3-tsconfig.json` (inherits actual db/repo strict settings, includes db/src and exactly the four changed integration files); intended command `node node_modules/typescript/bin/tsc -p /private/tmp/jg-ch7-r3-tsconfig.json --noEmit`. No compile/syntax/import success is claimed from the source proof. Coordinator was asked for a fresh host resource snapshot without changing this sandbox; no reply has supplied the missing node count at this receipt snapshot. This resource HOLD is distinct from a source/authority mismatch; none was found in the four authorized recipes by source inspection. No item was silently widened or replaced with a policy workaround.

PostgreSQL/migration/race/browser/Playwright suites NOT RUN locally by instruction, and no broad root tests or Vitest executed in r3. Exact new committed head requires complete unchanged GitHub CI, all four repaired suites (including both attempt races and MIGFIX8.1–8.5), all retained C proofs/upgrade/landing suites, fresh independent actual A/B checks and separate acceptance. #298, queue/cap and main integration remain held. A9bfc REPAIR and earlier evidence remain historical; no builder acceptance. Ben owns merges.

### r3 same-session runtime/raw usage snapshot

One entry for task `CH-7-REST-C`, saved thread `01a15afd-b3e2-7a83-8b07-3144fdddd800`, turn `01a160e0-fc95-7ef3-995f-c9825d52c6af`. Runtime `gpt-6.1-sol`, effort `medium`, confirmed by the saved JSONL turn_context at line173 (source path below); requested and confirmed values agree. On-request/workspace-write/network-disabled settings are unchanged. Same original Ben2 route; no fresh session or successor. Baseline reference is the authoritative session-preflight JSON above, not a counter inferred from chat.

```json
{
  "source": "/Users/benharwood/.codex-ben2/sessions/2026/10/20/rollout-2026-10-20T21-25-38-01a15afd-b3e2-7a83-8b07-3144fdddd800.jsonl",
  "runtime": {
    "line": 173,
    "timestamp": "2026-10-21T23:52:00.968Z",
    "turn_id": "01a160e0-fc95-7ef3-995f-c9825d52c6af",
    "model": "gpt-6.1-sol",
    "effort": "medium"
  },
  "raw_usage": {
    "line": 315,
    "timestamp": "2026-10-21T23:56:14.127Z",
    "info": {
      "total_token_usage": {
        "input_tokens": 4188791,
        "cached_input_tokens": 3945472,
        "cache_write_input_tokens": 0,
        "output_tokens": 21529,
        "reasoning_output_tokens": 4910,
        "total_tokens": 4210320
      },
      "last_token_usage": {
        "input_tokens": 177037,
        "cached_input_tokens": 174592,
        "cache_write_input_tokens": 0,
        "output_tokens": 810,
        "reasoning_output_tokens": 516,
        "total_tokens": 177847
      },
      "model_context_window": 475000
    }
  },
  "baseline_reference": "/Users/benharwood/.local/share/full-steam/jg-runs/approved-saved-resumes-20261021T173036Z/CH-7-REST-C-session-preflight.json"
}
```

Raw `info.total_token_usage` is cumulative session usage, not this turn's cost; it is not added to the baseline or any other snapshot. `info.last_token_usage` is the last emitted model-response sample, not a complete-turn aggregate. Field names are retained exactly; no missing count is treated as zero. For this compatible last sample only, cache-read share = 174592/177037 = 98.618933%; fresh input = 2445. Cache-write/output/reasoning counts remain separate in the raw object (reasoning is nested within output, not added again). This is an intermediate emitted snapshot; final usage after this response is not yet observable and must be attached by the coordinator when emitted. No allowance/window change, quota saving, cache benefit or speedup is claimed. Resume-to-first-useful-work timing is unknown (no independent start/work timing event recorded). Source work and review preparation proceeded while heavy checks waited on resource visibility.


Builder handoff at `2026-10-21T23:57:42.200594+00:00`: bounded four-file source repair complete; static import/type compilation, package lint and build remain resource-HOLD (Node count unavailable). `builder_finished_at` is this source-only handoff time; final candidate revision awaits root commit, `coordinator_acknowledged_at`, `integrated_at`, `merged_revision`, final emitted usage and final turn-completion event remain unknown. Latest source validation is deterministic preservation/lane/diff evidence over uncommitted work based on9bfc, not technical acceptance. No CI queue-age or acceptance-latency measurement is available. This continuation is repair round r3; no accepted leaf is claimed. Intended commit message: `/private/tmp/jg-msg-ch-7-rest-c.txt`.


## r3 S2 validation-only continuation — preflight

Read current session policy and JobGuard AGENTS.md/terms/eligibility contracts in full, applicable CH-7 card and actual db/repo compiler settings. Only authorized repository write in this continuation is appending this receipt. Current HEAD `9bfc66781b64c21efbbcb4088ac32ec085fc73e3`, origin/main `dc5721230fd8aedbf2d9d0457789074b66b48765`, branch/cwd/status and all candidate hashes match authoritative preflight `/Users/benharwood/.local/share/full-steam/jg-runs/ch7-r3-validation-20261022T000140Z/CH-7-REST-C-session-preflight.json`. Existing dirty candidate is preserved; no source/lane/test/SQL/shared-helper/package/lock edit is permitted. Original receipt copied before append; all tracked bytes snapshotted to `/private/tmp/jg-ch7-r3-validation-20261022T000140Z/`. Exact four-file scratch config inspected: inherits db/repo strict settings and real imports, includes db/src and exactly the four changed integration tests, with no stubs, suppressions or skips. No test execution or nested heavy-slot. User now authorizes normal escalated read-only host metrics and guarded exact validation commands; prior missing-resource hold is superseded only when fresh measurements actually pass.

Same saved thread `01a15afd-b3e2-7a83-8b07-3144fdddd800`, original Ben2 route; runtime confirmation in runtime-preflight.json: `gpt-6.1-sol`, `medium`, on-request/workspace-write/network-disabled. No resume/account/fork change initiated by builder. Historical A finding/source proof and all prior receipt bytes remain.


### Validation continuation — actual results

All four required checks executed serially through the approved normal `require_escalated` route, with a fresh host resource gate immediately before each command. The script `/private/tmp/jg-ch7-r3-validation-20261022T000140Z/guarded-check.py` measured actual host `pgrep -x node`, `memory_pressure`, free bytes and one-minute load, then ran exactly one selected command only if all four floors passed; no kill/limit change, nested slot, unknown-as-zero or rejected-action bypass. Retained on-request/workspace-write/network-disabled session configuration. `COREPACK_ENABLE_NETWORK=0` enforced offline use of installed pinned pnpm; `corepack pnpm --version` returned10.28.1. No dependency/core build was necessary, and none was run. All approvals succeeded; no automatic approval rejection occurred.

| Command actually executed | Result/evidence |
| --- | --- |
| `corepack pnpm --filter @jobguard/db typecheck` | PASS exit0; 3.500s; `/private/tmp/jg-ch7-r3-validation-20261022T000140Z/db-typecheck.log`, `.result.json`. |
| `corepack pnpm --filter @jobguard/db lint` | PASS exit0; 3.274s; `/private/tmp/jg-ch7-r3-validation-20261022T000140Z/db-lint.log`, `.result.json`. |
| `corepack pnpm --filter @jobguard/db build` | PASS exit0; 3.546s; `/private/tmp/jg-ch7-r3-validation-20261022T000140Z/db-build.log`, `.result.json`. |
| `node node_modules/typescript/bin/tsc -p /private/tmp/jg-ch7-r3-tsconfig.json --noEmit` | PASS exit0; 3.192s; `/private/tmp/jg-ch7-r3-validation-20261022T000140Z/four-test-source.log`, `.result.json`. |

| Check | Fresh host timestamp UTC | Free bytes (floor48,318,382,080) | Nodes (max45) | Memory free % (min30) | 1-minute load (max24) |
| --- | --- | --- | --- | --- | --- |
| db-typecheck | 2026-10-22T00:02:45.696523+00:00 | 235210346496 | 38 | 57 | 2.92236328125 |
| db-lint | 2026-10-22T00:02:55.205795+00:00 | 235208781824 | 38 | 56 | 2.62646484375 |
| db-build | 2026-10-22T00:03:04.102048+00:00 | 235208634368 | 38 | 56 | 2.44970703125 |
| four-test-source | 2026-10-22T00:03:15.393015+00:00 | 235207360512 | 38 | 56 | 2.22021484375 |

Each resource snapshot is saved as `<check>.resources.json` alongside logs and result JSON in `/private/tmp/jg-ch7-r3-validation-20261022T000140Z/`. Strict source compile used the inspected existing `/private/tmp/jg-ch7-r3-tsconfig.json` with exactly the four changed test entry files, db/src and their real imports; strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes inherited unchanged. No stubs, suppression, skip, package download or runtime test execution. These are compiler/package check results, not PostgreSQL or race proof. The earlier r3 static-check resource HOLD is now cleared for these four checks only.

After validation, all2,486 tracked files were compared with this continuation's initial byte baseline: only this append-only receipt differs. The lane, four candidate test files, original receipt prefix, package.json, pnpm-lock.yaml, SQL/0207, all production source/shared helpers and prior R2 evidence are unchanged. Initial candidate status remains exactly the authoritative preflight status, with no staged/untracked additions. Evidence: `tracked-before.json`, `receipt-before.md` and `byte-preservation.json` in the run folder. Build outputs are generated ignored artifacts; no tracked implementation changed. `git diff --check` is included in final handoff verification.

No root lint fanout or new main-range lane workaround. The existing exact-parent lane source proof remains distinct; inherited #298 main-range failure is still HOLD. No Vitest, PostgreSQL, migrations, races, browser or Playwright executed locally. Full unchanged CI on the new committed head, fresh actual independent Claude A/B and separate acceptance remain mandatory, together with prerequisite/queue gates. No technical acceptance, git writes, push, PR, merge or release by builder.

### Validation continuation — session and usage record

```json
{
  "session_record_version": 1,
  "task_id": "CH-7-REST-C",
  "project": "JobGuard",
  "role": "same-leaf r3 S2 validation only",
  "thread_id": "01a15afd-b3e2-7a83-8b07-3144fdddd800",
  "surface": "codex-cli",
  "host": "local",
  "authorised_route_ref": "/Users/benharwood/.codex-ben2",
  "repository": "/Users/benharwood/Claude/Projects/my-new-project",
  "integration_target": "main",
  "integration_target_revision": "dc5721230fd8aedbf2d9d0457789074b66b48765",
  "worktree": "/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch-7-rest-c",
  "branch": "codex/sandbox/ch-7-rest-c",
  "starting_base_revision": "9bfc66781b64c21efbbcb4088ac32ec085fc73e3",
  "source_pin": "9bfc66781b64c21efbbcb4088ac32ec085fc73e3",
  "candidate_revision": "uncommitted r3 candidate; preflight source hashes preserved",
  "last_validated_revision": "9bfc base plus unchanged preflight candidate, bound by tracked-before.json and byte-preservation.json",
  "allowed_files_ref": "controlling validation-only user order; append docs/verdicts/CH-7-REST-C/BUILDER_RECEIPT.md only",
  "governing_contract_ref": "/Users/benharwood/Claude/Projects/Next Gen Learning Platform/docs/workflow/CODEX_SESSION_POLICY.md",
  "model_requested": "gpt-6.1-sol",
  "effort_requested": "medium",
  "model_runtime_confirmed": "gpt-6.1-sol",
  "effort_runtime_confirmed": "medium",
  "runtime_confirmation_ref": "/Users/benharwood/.codex-ben2/sessions/2026/10/20/rollout-2026-10-20T21-25-38-01a15afd-b3e2-7a83-8b07-3144fdddd800.jsonl:347",
  "last_completed_turn": "01a160e0-fc95-7ef3-995f-c9825d52c6af; baseline token event 2026-10-21T23:57:45.731Z; current turn completion not yet emitted",
  "last_receipt_ref": "docs/verdicts/CH-7-REST-C/BUILDER_RECEIPT.md",
  "state": "local static validation complete; CI/review/acceptance HOLD",
  "resumed_from_thread_id": "01a15afd-b3e2-7a83-8b07-3144fdddd800",
  "successor_reason": "none",
  "preflight_ref": "/Users/benharwood/.local/share/full-steam/jg-runs/ch7-r3-validation-20261022T000140Z/CH-7-REST-C-session-preflight.json",
  "result_id": "/private/tmp/jg-ch7-r3-validation-20261022T000140Z",
  "acknowledgement_ref": "unknown",
  "ci_evidence_ref": "unknown",
  "reviewer": "fresh independent Claude A/B required for next committed head",
  "review_evidence_ref": "historical A REPAIR /Users/benharwood/.local/share/full-steam/jg-runs/v5-ch-7-rest-c-opus-A-9bfc6678.md preserved",
  "accepting_actor": "unknown",
  "acceptance_evidence_ref": "unknown",
  "outstanding_holds": [
    "unmerged #298 / main-range lane boundary",
    "migration queue/cap",
    "full exact-head CI, including PostgreSQL/migration/race/browser execution",
    "fresh independent A/B",
    "separate acceptance"
  ],
  "builder_finished_at": "2026-10-22T00:04:16.874762+00:00",
  "coordinator_acknowledged_at": "unknown",
  "integrated_at": "unknown",
  "merged_revision": "unknown"
}
```

One usage entry for task/thread/current turn `01a160ea-0052-7651-9a79-44750e79bdcd`; authoritative raw baseline remains the preflight JSON (line342, 2026-10-21T23:57:45.731Z). Current emitted snapshot, with original source field names, line and timestamp:

```json
{
  "source": "/Users/benharwood/.codex-ben2/sessions/2026/10/20/rollout-2026-10-20T21-25-38-01a15afd-b3e2-7a83-8b07-3144fdddd800.jsonl",
  "context": {
    "line": 347,
    "timestamp": "2026-10-22T00:01:51.790Z",
    "turn_id": "01a160ea-0052-7651-9a79-44750e79bdcd",
    "model": "gpt-6.1-sol",
    "effort": "medium",
    "approval_policy": "on-request",
    "sandbox_policy": {
      "type": "workspace-write",
      "network_access": false,
      "exclude_tmpdir_env_var": false,
      "exclude_slash_tmp": false
    }
  },
  "raw_usage_snapshot": {
    "line": 418,
    "timestamp": "2026-10-22T00:03:18.959Z",
    "info": {
      "total_token_usage": {
        "input_tokens": 7524529,
        "cached_input_tokens": 7249536,
        "cache_write_input_tokens": 0,
        "output_tokens": 29201,
        "reasoning_output_tokens": 6729,
        "total_tokens": 7553730
      },
      "last_token_usage": {
        "input_tokens": 205670,
        "cached_input_tokens": 205184,
        "cache_write_input_tokens": 0,
        "output_tokens": 57,
        "reasoning_output_tokens": 15,
        "total_tokens": 205727
      },
      "model_context_window": 475000
    }
  }
}
```

`info.total_token_usage` is cumulative session usage, never a cost summed with the baseline. `info.last_token_usage` is the last model-response sample, not the whole turn. For that sample only: cache-read share = 205184/205670 = 99.763699%; fresh input = 486. Cache-write/output/reasoning fields stay separate; reasoning is already nested within output and is not added again. This intermediate emitted snapshot is not final turn usage; coordinator can attach the final event after completion. Missing final-event/allowance-change/timing values are unknown, not zero. No cache/quota saving, new account, route, fork, --last or automated policy-enforcement claim. Resume-to-first-useful-work time, CI/review queue age and acknowledgement/integration latency are not independently measured. r3 remains the same repair round; this is follow-up validation, not a newly accepted leaf.
