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

## r1

23 October 2026; repair on `codex/sandbox/ch9-r` from clean HEAD
`76c030b6b6b7bd319c972615e0eb7fbf9cfef4ec`, containing repaired CH9-S
`aec2fb43de8b92daae1e58940a0c916b47386197`. Read AGENTS.md, BUILD_PLAN.md
CH-9 and applicable money contracts, `docs/contracts/value-v3.md`, the complete
Claude A REPAIR verdict for `34a3bef6` at
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch9-r-claude-A-34a3bef6-20261023.md`,
and CH9-S's r1 receipt before edits. The order's relative `jg-runs/` path does not
exist in this worktree; the complete externally stored verdict was used.
This is builder run evidence, not an independent verdict or technical acceptance.

Only the five existing CH9-R allowlisted paths changed: renderer, both renderer
Vitest files, JSON fixture expectations and this receipt. No parent/schema,
lane-register, dependency, shared export, route, migration or browser change.
No Git write, commit, push, PR, deployment or provider action. Dependencies were
preinstalled; no install/download or clean-install claim. Node v24.17.0 and cached
pinned pnpm 10.28.1 via `/private/tmp/ch9-r-bin/pnpm` were used. Heavy validation
commands ran sequentially; Vitest maxWorkers=2 and Turbo concurrency <=2.

Changes and compatibility:

- Tracked builder captures retain their supplied recorded amount and fee row,
  omit recovery qualifying/remainder rows, and explicitly state that the full
  recorded amount remains the builder's with a £0 fee when both are known.
  Unknown input does not acquire a fabricated zero or settlement claim. The
  £3,600 capture is never described as £0 yours. Found/recovery figures keep
  their own principal, fee and remainder labels.
- Existing bare-amount/copy assertions remain intact. Each fixture additionally
  binds exact category + label + amount + currency prefixes to exactly one
  rendered line; movement expectations also bind their source, and fact rows
  bind fact identity and kind. Includes £2,820/£282/£2,538; £320/£32/£288 and
  −£2,500/−£250 movements; tracked £3,600/£0 and found £800/£80/£720;
  £500/£50/£450; known zero with unavailable settlement; and every core fact.
  Expected prefixes end at a semicolon boundary, preventing partial amount
  matches. No previous assertion was removed or weakened.
- Adaptation follows CH9-S r1's chosen incomplete fallback: known pence must
  already be exact integers; no rational transport or rounding policy exists
  here. Fractional 2000000/43p and 24691/2p stay incomplete, with dependent
  fee/remainder unavailable, rendered as `Not yet complete` with the upstream
  policy reason. Unsupported fractional/undeclared rational known inputs are
  rejected rather than rounded. Regression coverage also verifies the inherited
  positive-fee <= known qualifying-principal guard with unavailable remainder.
  No rate, allocation, VAT, fee eligibility or posting calculation was added.

Actually executed fail-before/mutation evidence:

- Tests-first run against the old renderer: **1 failed / 7 passed**, exit 1;
  tracked capture regression failed. Log `/private/tmp/ch9-r-r1-before.log`.
- `/private/tmp/ch9-r-r1-mutations.py` temporarily mutated only the allowlisted
  renderer, ran both CH9-R Vitest files with maxWorkers=2 for each mutation,
  and restored the original in `finally`. **4/4 caught with assertion failures**:
  swap fee/remainder labels; swap fee/remainder amounts; restore tracked
  recovery rows; remove the `Not yet complete` prefix. Per-case logs:
  `/private/tmp/ch9-r-r1-mutation-*.log`. The first two are the previously
  surviving reviewer mutations. This is deterministic builder evidence.
- Final fixture assertions were extended for found settlement and original
  movements, and fractional tests now probe each actual fractional input.
  Final unmutated three-file batch: **76/76 passed** (3 files), exit 0.
  Log `/private/tmp/ch9-r-r1-final-tests.log`.

Validation details follow below. No DB/browser/restore suites were started:
GitHub CI must run the applicable suites after dispatcher push because the
issued sandbox cannot start PostgreSQL or bind localhost. AI eval is inapplicable
(no AI gateway/model/prompt/extraction change). No migrations/backfill, new alerts,
external actions, operational environment or provider changes. Renderer text is
changed for tracked and incomplete amounts; the canonical supplied DTO format
is unchanged. H-VALUE-SOURCES, CH9-S02/S07, upstream rational/policy binding,
actual runtime completeness/authority/stored history, exact repaired-commit CI,
fresh independent A/B review and separate technical acceptance remain HELD.
Prior REPAIR evidence is not a review of these uncommitted bytes. No self-acceptance
or production/real-data/fee enablement is claimed. Dispatcher owns the eventual
commit; Ben retains merge/release authority.

| r1 command (cached pinned pnpm PATH as above) | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/core typecheck` | PASS; no diagnostics. |
| `pnpm --filter @jobguard/core lint` | PASS; no diagnostics. |
| `pnpm --filter @jobguard/core exec vitest run src/value-v3-receipt.test.ts src/value-v3-copy.test.ts src/value-v3.test.ts --maxWorkers=2` | PASS, exit 0, final 76/76 tests in 3 files. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | FAIL, exit 1; purity passed, lane check rejected six inherited CH9-S paths before package lints. No allowlist widening. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, exit 1; same six inherited parent paths. Required main-range CI remains outstanding. |
| `LANE_BASE_REF=aec2fb43 pnpm lint:lanes` | PASS, exit 0; actual repaired parent comparison, head 76c030b6 plus dirty worktree. Supplemental stacked-parent check, not a main-range substitute. |
| `pnpm exec turbo run lint --concurrency=2` | PASS, exit 0; 7/7 package lints, 2 cached; sandbox cache IO warnings. |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0. |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0. |

Logs are `/private/tmp/ch9-r-r1-*.log`. Build/OpenAPI results follow.

| Remaining r1 command | Actual result |
| --- | --- |
| `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=1` | PASS, exit 0; 7/7 tasks, 2 cached, complete Next build including 41 static pages; 4m14.92s. |
| `pnpm openapi:check` | FAIL, exit 1; sandbox EPERM on tsx CLI IPC listen, before comparison. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; same generator and committed-document comparison through loader, no file generation. |

Build warnings include sandbox cache IO permissions and existing Next workspace
root/multiple-lockfile, CSS and dependency warnings. Cached config/storage logs
reference other worktrees and are replayed cache evidence, not fresh compilation
there. Full root typecheck/test, DB/migrations/catalogue/RLS/restore and browser
journeys were NOT RUN in r1; core typecheck, all package lints and bounded leaf
unit tests are the actual local evidence. Build success is not browser evidence.
Final `git diff --check` and repaired-parent lane check passed. Only the five
allowed files above are modified. HEAD remains 76c030b6; no commit/push/PR.
Intended conventional commit subject/body: `/private/tmp/jg-msg-ch9-r.txt`.

## r2

23 October 2026; final default repair round on `codex/sandbox/ch9-r`, starting
HEAD `94fb83de0f0371fa6823e4f630a9947d2e7413dc`, over accepted CH9-S
`aec2fb43de8b92daae1e58940a0c916b47386197`. Read AGENTS.md, BUILD_PLAN.md
CH-9, `docs/contracts/value-v3.md`, and Reviewer B's complete delta verdict at
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch9-r-claude-B-94fb83de-20261023.md`.
The issued relative `jg-runs/` path is absent; the external verdict was read in
full. This records builder execution, not independent review or acceptance.

The tracked summary now states only the JobGuard fee, using the existing
basis-labelled amount formatter, followed by the recorded amount's own explicit
net/gross basis label. It makes no ownership claim about gross, net or negative
captures. Recorded amounts, zero fees, source references and the omission of
recovery-only tracked rows remain covered. No calculation or tax policy changed.
The existing copy assertion now requires the corrected exact summary. Additional
net- and gross-basis tests each assert the whole rendered summary line.

The copy audit now checks each line for unqualified `you kept`, `remains yours`,
`yours`, `you keep`, `kept by you` and `stays with you`; `before VAT and tax` must
occur on that same line. Tests reject the exact defective r1 line, exercise every
synonym and reject a qualification appearing only on another line. Existing
copy prohibitions and fixture/amount assertions are preserved; no test was
removed, skipped or weakened.

Fail-before evidence: tests-first against the r1 renderer failed with 4 failed /
24 passed across both CH9-R files (exit 1), including the net/gross regressions
and the rendered-copy audit. Log `/private/tmp/ch9-r-r2-before.log`. Narrowing the
new audit back to the old literal `you kept` caused 6 failures / 9 passes (exit 1),
including the exact r1 rejection test; restored in `finally`. Log
`/private/tmp/ch9-r-r2-audit-mutation.log`. Thus both renderer and audit repairs
have actually executed failure evidence, rather than only source inspection.
The shadow fixture's recorded basis is net principal; its corrected exact-line
expectation was adjusted accordingly after an initial 84-pass/1-fail run. The
final unmutated CH9-R + CH9-S run passed **85/85 tests in 3 files** (exit 0), log
`/private/tmp/ch9-r-r2-tests.log`.

Only renderer, its two existing test files and this receipt are changed, all
CH9-R allowlisted. No schema, fixture data, migration, API, browser, dependency,
provider, operational alert or external-action changes. No clean install or
download attempted; preinstalled Node v24.17.0 and cached pinned pnpm 10.28.1
through `/private/tmp/ch9-r-bin/pnpm`. Validation is serialized, Vitest uses
`--maxWorkers=2` and Turbo concurrency is bounded. DB/migration/restore/browser
suites are not run under the issued sandbox restrictions; dispatcher-triggered
GitHub CI remains required. AI eval is inapplicable to this copy-only change.
H-VALUE-SOURCES, source/clock/rational policy bindings, actual runtime authority
and stored history remain HELD. Exact eventual-commit CI, fresh independent
review and separate acceptance remain required; no self-acceptance, release,
real-data or fee enablement is claimed. Dispatcher owns commit/push; none run here.

Final mutation recheck after correcting the shadow expectation: temporarily
restored the exact HEAD/r1 renderer via read-only `git show`, ran both CH9-R
files, observed **4 failed / 24 passed** (exit 1), and restored repaired bytes
in `finally`. Both exact net/gross tests, the corrected existing assertion and
the rendered audit fail without the renderer fix. Log
`/private/tmp/ch9-r-r2-renderer-mutation.log`. Final restored three-file batch
again passed **85/85**, exit 0. Build/typecheck/lint covered these same repaired
source bytes before the temporary mutation; it left no source change.

| r2 command (pinned cached pnpm via PATH above) | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/core typecheck` | PASS, exit 0. |
| `pnpm --filter @jobguard/core lint` | PASS, exit 0. |
| `pnpm --filter @jobguard/core exec vitest run src/value-v3-receipt.test.ts src/value-v3-copy.test.ts src/value-v3.test.ts --maxWorkers=2` | PASS, exit 0; all CH9-R and CH9-S files, 85 tests. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | FAIL, exit 1; lane guard rejects six inherited CH9-S paths before package lints. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, exit 1; inherited `config/lanes/ch9-s.json`, CH9-S contract/receipt, schema, fixtures and tests outside CH9-R lane. No allowlist widening. |
| `LANE_BASE_REF=aec2fb43 pnpm lint:lanes` | PASS, exit 0; accepted stacked-parent comparison, not a substitute for main-range CI. |
| `pnpm exec turbo run lint --concurrency=2` | PASS, exit 0; 7/7 package lints, 2 cached. |
| `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=1` | PASS, exit 0; 7/7 tasks, 2 cached; 1m20.872s. |
| `pnpm openapi:check` | FAIL, exit 1; sandbox EPERM prevents tsx CLI IPC listen before comparison. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; same generator comparison through loader, no generated changes. |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0. |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0. |
| `git diff --check` | PASS, exit 0. |

Logs: `/private/tmp/ch9-r-r2-*.log`. Build warnings include existing Next
workspace-root/multiple-lockfile, CSS/dependency and sandbox cache IO warnings;
cached logs are replayed evidence, not fresh compilation in their named other
worktrees. Full root test/typecheck and DB/browser suites were not executed;
only the explicitly listed local checks are claimed. Main-range lane and
standard OpenAPI CLI failures remain recorded, with parent/loader checks kept
separate. No policy, security or commercial approval is inferred from these runs.
Only four permitted files are dirty. Intended conventional commit subject/body
is in `/private/tmp/jg-msg-ch9-r.txt`; HEAD remains `94fb83de`, with no Git write,
commit, push or PR performed. Dispatcher must bind the eventual commit to CI and
review evidence.
