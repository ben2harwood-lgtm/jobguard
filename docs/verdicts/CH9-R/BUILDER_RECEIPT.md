# CH9-R builder receipt — 23 October 2026

Preparation only; no independent verdict or technical acceptance. Issued build-ahead order under decision 74 overrides the draft branch/lane names and permits this stacked base. No commit, push, PR, merge or enablement. Ben owns merge.

Base and current HEAD: `253cfea5084fea35b8a95ad9a688a3fec3ba87e5` (`codex/sandbox/ch9-s`). Working branch: `codex/sandbox/ch9-r`. Final commit: not created; dispatcher must bind checks/reviews to its eventual commit. Integration target: main. CH9-S is built ahead and under review, not accepted by this receipt.

Read AGENTS.md, BUILD_PLAN.md CH-9, `docs/contracts/value-v3.md`, CH9-S source/fixtures/receipt and the supplied corrected planning pack's evidence-value-demo common contract and full CH9-R card (line 6600). The issuance supplies preparation authority only.

## Symbol preflight and STOPs

Read-only `git grep` verified `ValueReceiptV3`, `valueReceiptV3`, `formatValueMoney` and `VALUE_V3_LABELS` in `packages/core/src/value-v3.ts`, with illustrative cases in `value-v3.fixtures.ts`. `renderValueReceipt` and `canonicalValueReceiptPayload` were absent as expected for NEW/proposed APIs and are implemented in this leaf. Existing server-side `canonicalJson`/SHA-256 seams exist in DB code; no hashing or Node/network dependency is added to the core renderer.

- STOP for actual SV-6/MON-1 producer binding only: no accepted complete immutable source/event/time handoff is established. CH9-S explicitly carries proposed held ports; no adapter is invented. Supplied DTOs prove no producer completeness, source truth, event identity, chronology or settlement. H-VALUE-SOURCES and CH9-S02/S07 remain held for J/B.
- STOP for posted/collected/refunded fee and authoritative meter detail only: CH9-S has no such fields. Render explicit unavailable messages; reject extra payload fields. No schema/barrel changes.
- Missing pre-existing renderer symbols are NEW implementation targets, not blockers for preparation. No named existing schema symbol was missing.

## Change and scope

Only the four CH9-R functional files, issued `config/lanes/ch9-r.json`, and this receipt are changed. No migration. No shared barrel, catalogue, routing, package/lockfile or existing test edits.

`canonicalValueReceiptPayload` validates the CH9-S DTO, sorts unordered source/fact/vector/reference collections and object keys using fixed lexical comparison, and returns deterministic HTML-safe JSON text. It does not hash, store, authorize or verify the DTO. `renderValueReceipt` returns `value-receipt-render.v1`, text/plain, canonical payload and status `incomplete`. All accepted inputs are illustrative_unbound: even structurally valid inputs can never render as complete or verified. Categories, supplied source ledger, as-of vector/window/measure, period-only subscription, basis/policy/derivation and correction links remain visible. No new fee, net, VAT or meter calculation is performed.

Unknown/incomplete amounts remain unavailable; known zero remains an explicitly supplied zero. SV-6 illustrations and unavailable M4 posting/collection/refund labels are separate. Text escapes untrusted identifiers and control characters, creates no hyperlinks, and rejects URL/path targets and extra link fields. It is not an authorization surface; actual linked-source access remains runtime work. Caller objects are parsed into fresh objects and never sorted in place.

Fixtures are expectations over existing CH9-S hypothetical inputs, not producer facts or end-state seeds. The test imports JSON as unknown and validates it with Zod. One narrowly documented `@ts-expect-error` covers the existing core compiler's lack of resolveJsonModule for this test-only JSON import; no compiler configuration or purity-scanner exclusion is changed. Vitest executes the import. Production renderer imports only the pure CH9-S module.

## Run evidence

Checks/results are recorded below after execution. No clean install was attempted: dependencies were supplied. Node `v24.17.0`; pinned cached pnpm `10.28.1`. Global `pnpm` stalls with a newer-pnpm warning: interrupted version/initial test attempts (exit 130). Subsequent commands use cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; temporary `/private/tmp/ch9-r-bin/pnpm` selects it for nested commands. No download/install.

Resource evidence: `df -k .` reported 224431044 KiB available (above 45 GiB); memory_pressure reported 57% free. Each heavy command uses `HEAVY_SLOTS=2 /Users/benharwood/.local/bin/heavy-slot` and local commands are serialized, with Vitest at maxWorkers=2. Wrapper emits sandbox denials for sysctl and ps, so host load/node-process telemetry is not verified; no claim is made that those unavailable readings prove the shared host state. Its shared slot acquisition still runs. Database/browser suites are NOT RUN locally by issuance and sandbox constraints.

Initial tests-first invocation: two new Vitest files failed (exit 1), missing proposed renderer module, before implementation. First implementation run: 2 files / 14 tests passed (exit 0). Initial core typecheck failed (exit 2) for test node:fs types and two deliberate malformed-input assertions; fixed only new tests. Next typecheck failed (exit 2) for JSON import resolution; replaced FS loading with static JSON import and the narrow documented compiler expectation. Final scoped typecheck passed (exit 0). Core lint passed (exit 0). Three-file regression batch `src/value-v3-receipt.test.ts src/value-v3-copy.test.ts src/value-v3.test.ts` passed: 3 files / 33 tests (exit 0).

## Acceptance coverage and holds

- CH9-R01: deterministic supplied canonical bodies/reference ordering, no mutation. Rendering-only unit evidence.
- CH9-R02: changed reversal content, preserved original input bytes, visible correction links. Actual stored historical preservation HELD for runtime.
- CH9-R03: missing/mixed-scope/duplicate refs and extra authoritative fields rejected; all outputs incomplete. Omitted authoritative sources cannot be discovered by this leaf. Full source proof HELD.
- CH9-R04: copy tests forbid unsupported savings/prevention/tax-invoice/paid claims; required principal/tax labels included.
- CH9-R05: amount/count trace context, source policy/derivation ledger, period-only subscription; missing checked-count policy explicitly unavailable. No per-job subscription allocation.
- CH9-R06: escaped malicious/Unicode/long references, no generated links; external and unscoped path targets rejected. Actual runtime access checks HELD.
- CH9-R07: unavailable settlement/subscription/meter output, distinct supplied zero. No authoritative MON-1 inference.
- CH9-R08: supplied SV-6 illustration vs unavailable M4 posted/collected/refunded fields visibly separate.

No database, browser, live-provider, professional policy or live-model evidence is claimed. This adds no prompt/model behavior, external action, table, accounting post, operational alert or storage. Actual receipt persistence/version retrieval belongs to final DEMO/J/B owners; no immutable artifact store or financial document numbering is created. Existing v1 source remains untouched; complete v1 runtime regressions remain CI work.

Holds: accepted CH9-S handoff, H-VALUE-SOURCES/S02/S07, accepted SV-6/MON-1/M4 adapters and event/time/authority/completeness evidence, real stored history, required exact-head CI, two independent Claude A/B verdicts and separate technical acceptance. No reviewer/acceptor identity or approval is invented. Predecessor merge and Ben's merge/release/enablement gates remain.

## Additional executed checks and exact commands

In this table `pnpm` resolves through the temporary shim to the installed pinned cached 10.28.1 binary; heavy commands use the wrapper/prefix above. These are local deterministic checks, not independent review. No test was removed, skipped or weakened.

| Command | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/core typecheck` | Final exit 0 after changes. |
| `pnpm --filter @jobguard/core lint` | Final exit 0 after changes. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/value-v3-receipt.test.ts src/value-v3-copy.test.ts` | Tests-first exit 1: missing renderer; first implemented run exit 0, 14 tests. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/value-v3-receipt.test.ts src/value-v3-copy.test.ts src/value-v3.test.ts` | Final exit 0, 3 files / 33 tests. Includes unchanged CH9-S tests. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1. Core purity passed (234 files); lane check then rejected the six inherited CH9-S paths vs origin/main. Turbo lint stage did not execute. No allowlist widening. Seven pre-existing computed imports reported unverifiable by the existing scanner; this leaf adds none. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1, same six inherited CH9-S paths. Dispatcher must rerun after predecessor integration and its commit. |
| `LANE_BASE_REF=253cfea5084fea35b8a95ad9a688a3fec3ba87e5 pnpm lint:lanes` | Exit 1, guard intentionally refuses self-comparison (base equals HEAD). Not a substitute PASS. |
| Supplementary read-only Node script using `loadLanePolicy`, `selectLane`, `lanePathAllowed` over `git ls-files --others --exclude-standard -z` | Exit 0, all six new working-tree files allowed by issued lane. Not the required committed range/CI check. |
| `node tools/money-arithmetic-lint.mjs` | Exit 0. |
| `node tools/commercial-boundary-lint.mjs` | Exit 0. |
| `pnpm build -- --concurrency=2` | Exit 1, initial argument-placement error forwarded flag to tsc (TS5023). This briefly started three compilation processes; corrected to Turbo's flag placement below. No failed check is counted as a pass. |
| `pnpm build --concurrency=2` | First correct invocation exit 0, 7 successful tasks (2 cached), 1m17.528s. Root build includes production Next compilation/static generation; no browser suite. Final invocation after helper/test changes recorded below. |
| `pnpm openapi:check` | Exit 1: sandbox denies tsx CLI Unix IPC listen (`EPERM` on its temporary pipe). No OpenAPI mismatch reached. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0. Executes the same generator/check through Node's tsx loader without CLI IPC. No generated file edits. |
| `git diff --check` | Exit 0; tracked diff empty since six new files remain untracked for dispatcher staging. |

Root build warnings: shared cache IO permission warnings; existing Next workspace-root/multiple-lockfile warning; existing CSS autoprefixer warnings; Nest/file-type export warning and load-esm computed dependency warning. Correct build still exited 0. Cached config/storage task logs refer to other shared-cache worktrees and are cache replay, not fresh execution of those tasks here. No dependency/config repair is authorized in this leaf.

Later resource observation: 51% free memory and 222528184 KiB disk available. All intended scoped Vitest runs retain maxWorkers=2. Full root tests, full root typecheck, all-package lint after lane stage, PostgreSQL/migration/catalogue/restore suites and browser suites are NOT RUN locally; required CI remains outstanding. No CI run/artifact or final commit exists for this uncommitted preparation. OpenAPI loader success does not turn the blocked CLI invocation into a CLI pass.

Final `pnpm build --concurrency=2` after all renderer/test edits: **exit 0**, 7 successful tasks / 7 total, 2 cached, 1m32.149s. Same pre-existing warnings as above. Final scoped typecheck/lint and the 33-test batch also cover these final source bytes. Six-file newline/trailing-whitespace inspection passed (Python assertions, exit 0). Intended conventional commit subject/body written to `/private/tmp/jg-msg-ch9-r.txt`; no git write command was run. All six new repository files remain unstaged/untracked for the dispatcher.
