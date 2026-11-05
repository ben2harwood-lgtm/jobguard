# VALUE-1-READ-RECOVERY builder receipt

Status: PARTIAL — implementation and focused spec prepared; required execution and independent acceptance pending. MUST NOT INTEGRATE on this receipt alone.

## Scope and implementation

Only worker paths changed:
- `apps/web/app/ui/job-value.tsx`
- `apps/web/e2e/VALUE-1-READ-RECOVERY.spec.ts`
- This receipt.

The coordinator-created `config/lanes/value-1-read-recovery.json` was already untracked on entry and was read, never edited. No git writes, helpers, installs, policy changes, migrations, business commands outside test setup, provider actions or releases.

The read state is loading/ready/failed, bound to a job ID. Starting a GET discards the old successful snapshot. A monotonic request identity prevents superseded successes/failures from publishing; effect cleanup invalidates unmounted/previous-job reads. Render also rejects state belonging to a previous job. Strict parsing is unchanged; parsed `jobId !== jobId` fails. Retry/refresh use only GET with no-store. Automatic errors use a scoped alert without moving focus. Explicit retry failures may focus the error heading only while focus is on the retry control or body; unrelated focused controls are preserved.

The loading view exposes the existing Refresh persisted facts action so a later read can supersede a slow read without showing stale money. No arithmetic or business completion behavior changed. No new framework or dependencies.

## Preserved boundaries / candidate classification

Builder deterministic precheck: conditional NONRED scope appears preserved. This is NOT an independent candidate verdict or acceptance. `out/preserved-bytes.json` confirms byte-identical `pounds()`, `Card`, the ENTIRE existing successful-render JSX (including every money expression, label, copy, basis and source link), original `VALUE-1.spec.ts`, route, application and contracts. Existing test/assertion/timeout files were not edited. No API/auth/session/tenant/money/control policy changes. A browser fake-200 foreign-job response was deliberately not introduced; identity rejection is source-inspected and the old-job race uses actual job A/B responses.

The new spec uses the existing capture/quote/acceptance/activation helper and UI variation commands to persist a £125 synthetic approved extra with quote/source provenance. No database end-state seeding. Its three tests collect in both viewport projects (six cases): initial held/aborted request; negative HTTP, malformed JSON and schema responses; GET-only retry; refresh hides old figures; older real success cannot clear newest pending read; stale failure cannot replace newer success; current real source identity; delayed real job A GET continued after client navigation to B; reload and Jobs reopen. C7 checks include authoritative role=note/name Practice sandbox notice, exact notice text/visibility, keyboard focus outline, 44px primary actions, no horizontal overflow, error focus, and an unrelated focused shell-control sentinel. The pinned Next 15.5.28 existing debug router is used only in the race test to keep navigation within the document; its presence was source-inspected in the existing installed package. All successful API traffic continues to the real backend; fulfill is restricted to explicitly labelled faulty negative responses.

## Source, session and admission

```yaml
session_record_version: 1
task_id: VALUE-1-READ-RECOVERY
project: JobGuard
role: gmail-codex builder
thread_id: 01a17f6f-05bc-7233-9584-3bc5811a9339
surface: codex-cli
host: Bens-MacBook-Pro-2.local
authorised_route_ref: codex-a / existing ~/.codex-ben2; output log.txt child-boundary record
repository: ben2harwood-lgtm/jobguard
integration_target: main
integration_target_revision: unknown (current remote main not fetched)
worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/value-1-read-recovery
branch: codex/sandbox/value-1-read-recovery
starting_base_revision: 25a3cb763c4f8f04354f102c3f333c4bba318c97
source_pin: 25a3cb763c4f8f04354f102c3f333c4bba318c97
candidate_revision: uncommitted; caller owns all git writes
last_validated_revision: source pin plus out/candidate-code.diff
allowed_files_ref: config/lanes/value-1-read-recovery.json (coordinator-created, read-only)
governing_contract_ref: AGENTS.md; BUILD_PLAN.md 2.4 C1-C8 / VALUE-1 row / DEMO-S; issued prompt.md
model_requested: gpt-6.1-sol
effort_requested: medium
model_runtime_confirmed: gpt-6.1-sol
effort_runtime_confirmed: medium
runtime_confirmation_ref: output log.txt startup header and full-steam child boundary
last_completed_turn: initial builder turn (this receipt)
last_receipt_ref: docs/verdicts/VALUE-1-READ-RECOVERY/BUILDER_RECEIPT.md
state: PARTIAL; ready for parent validation after positive child terminal
resumed_from_thread_id: none (new issued leaf)
successor_reason: none
preflight_ref: output log.txt; coordinator-clearance-221534.txt; initial git status and source reads
result_id: VALUE-1-READ-RECOVERY candidate-code.diff
acknowledgement_ref: unknown
ci_evidence_ref: none
reviewer: none
review_evidence_ref: none; preissue ACK is not a candidate verdict
accepting_actor: none
acceptance_evidence_ref: none
outstanding_holds: full required current-main CI, executed browser/DB checks, independent candidate classification/verdict and separate acceptance
builder_finished_at: 2026-10-27T22:24:39.190442+00:00
coordinator_acknowledged_at: unknown
integrated_at: not integrated
merged_revision: none
```

Actual child-boundary claim: `claim-85065-2eb55ebdd03643d3be020994607a1acd`, generation `runtime-eight-role-20261027`, Gmail route `codex-a`. Existing log binds account hash, roots, prompt/rule/runtime/binding hashes. This builder did not create another claim/coordinator. All same-leaf repairs must resume the exact thread above.

First useful coding timestamp: `2026-10-27T22:16:41.188168+00:00` (first component edit). Source component blob: `39cb7d0833d9ff4a31d32c821e98cd2e660c7458`. Local main ref observed `694e9e1755f2a5680898eb0fa04af48afd66c86b`; this is not evidence of current remote main.

Code identities (SHA-256):
- component: `b1532f4dd16f4fa7522372ce6d52336cbb0ce645f4f2896a854ad7f6984daddc`
- new spec: `8d3cf16468ff22dbe817e578a64fb24defd4eed6a92d173fc5ce8ae56cac74c2`
- unchanged original VALUE-1 spec: `8250f2bc3591ba64d164737fd3619ba96103ad462e0693478c80ad3cfa7dbbc4`
- exact code diff: `524ba1989cc8e98ec8ae974ecbb81569388bf300dd90a903cd0db00200612be5`

All source/authority/lane hashes are in `out/file-hashes.json`; code diff in `out/candidate-code.diff`. Current build-rule SHA-256 `1c951ba6fe2c611f65db4b6cbf6be496a6e4c82c00e95bfac1fd26ec536c5ca6` and simplicity SHA-256 `6951013f7f7c750002f3096a4e9d1c7a467fabe0a4a6b26972169f2493ffeee6` match issued identities. WORKING_AGREEMENT.md and CODEX_SESSION_POLICY.md were read. No worktree CANON/NOW or nested AGENTS/override instructions found; `.agents`/`.codex` absent.

## Checks actually run

Pinned Node `v24.15.0` and pnpm `10.28.1` version commands: exit 0.

- TypeScript 5.8.3 `transpileModule` syntax diagnostics for both changed source files: exit 0, zero syntax diagnostics. Read-only installed compiler used; NOT semantic typecheck. `out/cheap-checks.log`.
- Byte preservation comparison against source pin: exit 0, all checks true. `out/preserved-bytes.json`.
- `git diff --check`: exit 0.
- Deterministic existing lane-parser allowlist check of all three worker paths: exit 0. NOT committed-range lane acceptance. `out/cheap-checks.log`.
- Playwright 1.55.1 collection using current worktree config, `--list --workers=2 --project=mobile-360 --project=desktop 'VALUE-1(-READ-RECOVERY)?\.spec\.ts'`: exit 0; eight cases in two files (six new, two unchanged). No browser or DB executed. `out/playwright-list.log`.
- Earlier collection attempts via pnpm exec using a different existing dependency tree exited 1 (import-only API subpath; then incompatible borrowed Zod 3 resolution). Corrected the spec import to the existing relative-source convention; final collection used the installed exact Zod 4.6.6 package. These were collection/environment failures, not browser runs. No package files changed.
- `node tools/lint.mjs`: exit 1, worktree has no `node_modules`; missing TypeScript at core purity import. `out/source-lint.log`.
- `node tools/agent-lane-boundary-lint.mjs`: exit 1, self-comparison range (HEAD remains source, no committed candidate). No bypass or invented pass. `out/lane-lint.log`.
- Host preflight `/bin/ps -axo pid=` and `/usr/sbin/sysctl -n vm.loadavg`: denied by sandbox (operation not permitted). Memory observation 59% free and disk about 90 GiB available do not replace missing process/load observations. Heavy gate not entered; no heavy job started.

Read-only collection command (cwd = supplied worktree):
```sh
NODE_PATH=/Users/benharwood/Claude/Projects/my-new-project/.worktrees/mon-3c-cal/apps/web/node_modules:/Users/benharwood/Claude/Projects/my-new-project/.worktrees/mon-3c-cal/node_modules /private/tmp/jg-ci-enterprise-node-v24.15.0-darwin-arm64/bin/node /Users/benharwood/Claude/Projects/my-new-project/.worktrees/mon-3c-cal/apps/web/node_modules/@playwright/test/cli.js test --config=apps/web/playwright.config.ts --list --workers=2 --project=mobile-360 --project=desktop 'VALUE-1(-READ-RECOVERY)?\.spec\.ts'
```

## Unrun / remaining gates and exact handoff

After positive terminal completion of this child, the parent must bind these hashes, obtain normal resource/heavy-slot admission, and prepare the pinned frozen install using its existing own-plan authority. Worker file scope did not allow installing node_modules. No missing dependency or resource observation is reported as a pass.

Required commands in the supplied worktree / immutable candidate CI checkout, using pinned Node/pnpm:
```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm openapi:check
pnpm --filter @jobguard/web test:e2e --workers=2 --project=mobile-360 --project=desktop 'VALUE-1(-READ-RECOVERY)?\.spec\.ts'
```

Full unchanged required CI on CURRENT main is mandatory, including actual browser/DB regressions, scanners, applicable eval and migration suites. Browser/DB execution is CI-only. The targeted command is additional focused evidence, not a substitute for full CI. Vitest is 4.1.12; inherited Vitest 2 thread settings do not constrain it. Test owner must verify/apply explicit `--maxWorkers=1` or `--maxWorkers=2` via the existing runner; for direct package execution e.g. `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2`. Root scripts/current CI alone do not establish a global two-worker guarantee. Do not change shared config in this leaf to solve that.

Independent exact-candidate classification must confirm preserved bytes. Any RED classification requires the actual independent Claude initial/delta process. Separate accepting actor and C282 independent checker own acceptance/main merge; fixed dependency merge order (339 then 341 priority) and all release gates remain. No acceptance, commit, merge, push or release performed here.

LATER / SIMPLICITY (initial source precheck, nonblocking): `apps/web/e2e/VALUE-1-READ-RECOVERY.spec.ts:12` repeats variation entry/approval setup also maintained in the existing customer-invoice journey. When helper-file scope is separately issued, expose/reuse that existing variation setup rather than maintain several versions of field labels and command-wait assertions. This reduces fixture drift; no helper or unrelated test was changed in this bounded leaf.

Raw usage fields `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`: unknown at receipt time. No cache/allowance saving inferred. Runtime startup metadata is in existing log.txt; caller may append actual final emitted usage after child exit.

Parent checks 2026-10-27: exact fresh01a17f6f child EXIT0/group85092 gone verified. Pinned frozen install --ignore-scripts EXIT0 and unchanged lock; normal heavy-slot API prerequisite build6/6 EXIT0; web semantic typecheck EXIT0; actual installed Playwright runner list8cases2files bothprojects EXIT0. Historical missing dependency failures preserved. No browser/DB execution or acceptance claimed; draft for required full currentmainCI and exactcandidate independentclassification before separateacceptance/C282.
