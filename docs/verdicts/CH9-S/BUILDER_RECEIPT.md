# CH9-S builder receipt — 23 October 2026

**Limited handoff: schema and illustrative unit-contract build only.** This is not an independent verdict, technical acceptance, source-proof PASS, CH-9 completion or DEMO-S journey evidence. CH9-S02/S07 and H-VALUE-SOURCES remain **HELD**.

## Authority and source inspection

Issued CH9-S build-ahead order, decision 74: build only; Ben owns merge. Read the repository AGENTS.md, BUILD_PLAN.md CH-9 and fee/source requirements, and the evidence-value-demo planning pack §§1–2.5 and full CH9-S card (lines 6559 onward of the supplied corrected draft).

- Worktree: `.worktrees/ch9-s`; branch: `codex/sandbox/ch9-s`.
- HEAD and cached `origin/main`: `dc5721230fd8aedbf2d9d0457789074b66b48765`.
- Working tree was clean before work. No commit, index write, push, PR, merge, provider, real data, deployment or spending action performed.
- User's issued branch and `config/lanes/ch9-s.json` replace the draft's proposed branch/lane names. One exact lane, six exact owned paths including its own registration; JSON functional allow excludes the lane-register path.
- Node: v24.17.0. Cached pinned pnpm: 10.28.1; TypeScript pin 5.8.3, Zod 3.25.67, Vitest 4.1.11. Dependencies were preinstalled; no install or clean-install claim.
- `git grep`/file inspection confirmed `ValueApplication.read`, v1 `jobValueResponseV1`, `value.application.test.ts`, v1 Nest/Next routes and job page, `deriveShadowSuccessFee` in `shadow-domain/success-fee.ts`, `calculateCumulativeFee` in `cumulative-fee.ts`, and `allocateReceiptToLines` in `receipt-allocation.ts`. MON references `docs/contracts/meter-persistence-v1.md` and `subscription-v1.md` exist and were inspected. Existence/source inspection is not upstream acceptance.
- **STOP (source-binding item only):** an accepted SV-6 public source handoff with accepted completeness, canonical event/correction identities, clock/window semantics and producer acceptance evidence was not established at this base. No export path or adapter was invented. Existing pure functions do not clear this STOP. All permitted independent preparation continued.

## Delivered choices

Only the four CH9-S functional files, issued lane file and this receipt were added. Shared barrels, routes, package exports, domain engines, guards, migrations and existing tests remain untouched.

- Candidate strict `value-receipt.v3` DTOs are explicitly `synthetic_demo` and `illustrative_unbound`. They cannot assert verified/runtime-complete status. Fixed category tuple: checked, tracked, found, supplier, withheld. Counts contain no money; money groups distinguish recorded, settled, qualifying, incoming fee and remainder.
- Explicit known/unknown/incomplete union: no money on unavailable states, no silent zero. GBP safe integer pence reuse the existing application magnitude limit. Principal and gross bases remain explicit. Supplied remainder consistency uses bigint; no eligibility, fee-rate, allocation or VAT calculation was added. Unavailable principal/fee propagates to dependent values.
- All policy/derivation/source/clock fields are proposed assertions, not accepted producer mappings. Proposed source/event uniqueness, scope matching, original/correction links and category-exclusive references check DTO consistency only. Source references include tenant/job/session. Equal supplied timestamps are permitted; the descriptor distinguishes cumulative balances from window movements without implementing a clock/window policy, ordering rule, pagination or time filter.
- An illustrative prelock shape rejects found-source identifiers; strict objects reject hidden-state fields and prevention amounts. This proves shape restrictions only, not runtime authorization or noninterference. Disclosure-before-lock and after-lock qualification labels cannot support positive qualifying principal/fees; accurately labelled nonqualifying recorded/settled amounts remain available.
- Business subscription is period-only, with separate policy/derivation versions and asserted period references disjoint from job sources. Job objects reject subscription. No fee offset/credit/refund/netting field or arithmetic exists.
- Hypothetical SV-6 output fixtures cover recovery £2,820/£282/£2,538, explicit −£2,500/−£250 reversal leaving £320/£32/£288, shadow tracked £3,600/fee £0 and found £800/£80/£720, independent £500/£50 and unpaid £0/£0, plus core invoice/variation/recorded-payment/reversal/correction facts. No v1 £79/£203/cap/base obligation is created. The core correction's −£100 net is an illustrative choice only, not accepted command/policy evidence.
- Proposed ports `ProposedValueSourcesPortV3` and `ProposedValueDerivationPortV3` return unknown and declare the binding held. Interfaces only: no fake or real implementation. `formatValueMoney` uses exact integer formatting; fixed copy labels state proposed principal-only illustration, yours before VAT and tax, and no VAT calculation.
- Tests import the module by relative path. Fixtures are illustrative unit inputs only, never positive end-state seeds or producer-qualified source chains.
- A delegated builder-side documentation/source inspection found the unavailable-fee/known-remainder gap; its new test failed before the guard fix, then passed. This same-builder work is not either required independent model verdict.

No migrations/backfill/rollback, environment variables, provider destinations, external actions, operational alerts or backwards-compatibility changes. Removal of the six additive files reverts this unintegrated leaf. No runtime surface is enabled.

## Commands actually run and results

Validation used one test invocation at a time, Vitest `--maxWorkers=2`, Turbo `--concurrency=2`. Disk checks reported 218 then 215 GiB available; memory-pressure checks reported 62% then 63% free. `ps` process enumeration was denied by the sandbox, so host-wide process occupancy was not verified. No DB/browser/restore process was started.

The shell's default pnpm launcher is a newer global launcher which tried to verify/switch to the pinned version through an unreachable registry. The initial `pnpm --version` / `pnpm --filter @jobguard/core ...` attempts hung or failed before executing their intended checks (signature fetch failed; interrupted attempts returned 130). No package was installed. Subsequent commands used the already-cached 10.28.1 CLI directly, then a temporary symlink `/private/tmp/jg-ch9-s-bin/pnpm` to that exact CLI with `PATH="/private/tmp/jg-ch9-s-bin:$PATH"`. No repository package-manager configuration was changed.

| Actual command/stage | Actual result |
| --- | --- |
| `node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit` (initial direct fallback) | FAIL, exit 2: fixture tuple typing, deliberate invalid-policy mutation typing, implicit callback types. Fixed locally. |
| `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs --filter @jobguard/core typecheck` | PASS, exit 0, after initial typing fixes; repeated after schema additions. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/value-v3.test.ts` via cached CLI/PATH | Initial runnable run: 14/15 passed; unknown-state test targeted an already-unavailable group. Next run: 16/18 passed, also exposing unsafe bigint conversion during dirty Zod validation. Corrected test setup and guarded arithmetic; 18/18 passed. Added unavailable-fee regression: 18/19 passed (expected RED), then final **19/19 PASS**, exit 0. No existing test changed. |
| `pnpm --filter @jobguard/core typecheck` (final, cached PATH) | PASS, exit 0. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` (cached PATH) | FAIL, exit 1: core purity passed (231 TypeScript files; seven existing computed-import notices), then lane guard refuses `HEAD == origin/main` as a self-comparison before checking uncommitted paths. No full root-lint PASS claimed. |
| `pnpm lint:lanes` (cached PATH) | FAIL, exit 1, same self-comparison refusal. Needs dispatcher commit and CI; no false comparison base or Git writes used to bypass it. |
| Inline `node --input-type=module` inspection using actual `loadLanePolicy`, `lanePathAllowed`, and `git ls-files --others --exclude-standard -z` | PASS, exit 0: six uncommitted paths permitted and lane configuration loads. This is a static allowlist inspection, **not** the full lane range check. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | PASS, exit 0 each, run separately after root lint stopped at lane guard. |
| `pnpm exec turbo run lint --concurrency=2` (cached PATH) | PASS, exit 0: 7/7 package lint tasks, 2 cache hits. Final core typecheck rerun after the last schema guard change. This does not clear root lane lint. |
| `pnpm build --concurrency=2` (cached PATH) | **INTERRUPTED / NOT COMPLETE**, despite Turbo reporting exit 0 on Ctrl-C. Core completed; stopped before Next because Next's default internal static-worker count is not bounded to two by Turbo concurrency. No clean production-build PASS. |
| `pnpm exec turbo run build --filter='!@jobguard/web' --concurrency=2` (cached PATH) | PASS, exit 0: all 6 non-web package builds, 2 cache hits. Turbo emitted sandbox IO/cache warnings. |
| `pnpm --filter @jobguard/core build` (final, cached PATH) | PASS, exit 0. |
| `pnpm openapi:check` (cached PATH) | FAIL, exit 1: sandbox EPERM binding the `tsx` CLI IPC pipe. |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | First attempt failed with missing DB dist (before prerequisite build completed); after non-web builds, **PASS**, exit 0. Loader form avoids CLI IPC; same generator and committed OpenAPI comparison, no file generation. |
| `git status --short`, `git branch --show-current`, `git rev-parse HEAD origin/main`, scoped searches/reads, `df -g .`, `memory_pressure` | Read-only inspection only; exact base and allowed new files confirmed. |

The final intended subject/body is written to `/private/tmp/jg-msg-ch9-s.txt`; no Git commit was made.

## Acceptance accounting

| ID | Builder evidence and remaining limit |
| --- | --- |
| CH9-S01 | Unit PASS: five strict groups; checked rejects money; job subscription rejected. Schema-only. |
| CH9-S02 | **HELD**: runtime authoritative source reproduction/completeness and actual producer records/derivations require CH9-J04/09 and CH9-B02/06/07. DTO reference adversaries do not discharge it. |
| CH9-S03 | Unit PASS: unavailable vs known-zero, six nonqualifying labels, preserved supplied payment, propagated unavailable dependent values. No real qualification/settlement proof. |
| CH9-S04 | Initial 19-test run checked supplied recovery/reversal fixtures and links only; it did not test rejection of a wrong remainder. r1 below adds and mutation-checks that guard. No runtime derivation proof. |
| CH9-S05 | Initial run asserted fixture figures/group order only; category separation and tracked fee-free rejection were untested. r1 below adds and mutation-checks both. |
| CH9-S06 | Initial run asserted supplied £500/£50 and unpaid £0/£0 fixtures only; it did not establish zero-principal/positive-fee rejection. r1 below fixes and tests this. Settlement remains unknown in the zero example. |
| CH9-S07 | **HELD**: actual event/window contract, exact boundaries, canonical duplication/join/pagination/out-of-order behavior and cross-period corrections require CH9-J04/09 and CH9-B02/03. Equal illustrative timestamps and reference checks do not discharge it. |
| CH9-S08 | Unit PASS: distinct invoice net/gross, approved/unapproved deltas, recorded payments, linked reversal/correction. Existing v1 implementation untouched; full v1 runtime regressions NOT RUN. |
| CH9-S09 | Initial run tested strict shape/offset/prelock rejection, but not period-reference separation or cost-reference guards. r1 below adds and mutation-checks these. Actual hidden-state noninterference/authority remains runtime work. |

## NOT RUN and holds that remain

- **H-VALUE-SOURCES**: accepted producer completeness, qualification/settlement lineage, exact event/correction identity, source ownership/version exports, policy/clock/window decisions and producer acceptance evidence. Installed interfaces are insufficient. Public exports remain coordinator-owned.
- **S02/S07** stay open until J/B actual command → stored source → API/browser traces and authoritative reconciliation discharge them. No full CH9-S/source-proof PASS.
- Full root tests, root typecheck, PostgreSQL/catalogue/RLS/migrations/concurrency/upgrade suites, lane regression Node suites, browser journeys in both `mobile-360` and `desktop`, restore and clean production web build: **NOT RUN locally / required CI as applicable**. No DB or web workflow was changed by this leaf. AI eval/live-model evaluation is inapplicable: no AI prompt/model/extraction/output schema or gateway change.
- Root lint/lint:lanes need a real committed comparison range. Root OpenAPI wrapper remains sandbox-blocked; loader comparison passed. Required exact-head CI is still **NOT RUN**; no CI URL/artifact exists for this uncommitted build.
- Missing commercial policy and clock decisions remain held. Production/pilot enablement, real processing/providers/funds, MON/SV/M4 runtime adapters and DEMO end-state/source acceptance remain outside this order.
- At the initial build, independent exact-head Claude A/B verdicts and a distinct technical acceptance actor were **NOT RECORDED**. The subsequent 253cfea5 A/B REPAIR verdicts are recorded externally and read in r1 below; they do not review this uncommitted repair. No self-acceptance, invented identity, human builder observation or professional approval. Dispatcher must bind the final committed diff to real review/acceptance evidence; Ben alone merges.


## r1 (Claude A/B repair)

23 October 2026; repair starts at `253cfea5084fea35b8a95ad9a688a3fec3ba87e5`
on `codex/sandbox/ch9-s`. Working tree was clean. Read both complete independent
verdicts before edits:
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch9-s-claude-A-253cfea5-20261023.md`
and the corresponding `claude-B` file. Both are REPAIR for that prior head.
This receipt is builder evidence, not independent review or technical acceptance.

Changes are restricted to the existing lane's schema, test, contract and receipt.
No fixtures, lane registration, shared exports, dependencies, runtime adapters,
database or browser code changed. No Git write, commit, push or PR was performed.
The scope is only the three issued blockers; LATER findings remain deferred.

- Positive known fees now require known qualifying principal >= fee for both
  measures and every remainder state. Three separate rejecting cases cover
  £0/£5 with unknown remainder, £1/£50 with unknown remainder, and window
  £0/£5/−£5, all with hypothetically qualifying sources.
- Chosen fractional remedy is the reviewers' permitted incomplete fallback,
  not rational transport. Known principal/remainder/movements must be exact
  upstream integer pence; no rounding is performed here. The new incomplete
  reason `fractional_pence_requires_upstream_policy` keeps F4's Q=2000000/43p
  and Q=24691/2p unavailable, propagating to fee/remainder and formatting as
  unavailable. Incoming 4651p/1235p fee values cannot turn these into complete
  illustrations. Non-integral movements stay null and dependent amounts
  incomplete. Rational preservation and upstream rounding-policy binding are
  explicitly HELD under H-VALUE-SOURCES. No fee-rate or tax rule is invented.
- One rejecting test per superRefine guard, with targeted issue-message
  assertions, now covers all 21 guard statements (including the new positive
  fee bound). Additional cases isolate duplicate event vs source IDs, each
  scope field, correction-link faults, three principal-only fields and both
  clauses of each subscription guard. S04–S06 original tests now also mutate
  valid inputs and assert rejection; their existing assertions remain intact.

Fail-before evidence (actually executed, not inferred):

- Before either schema fix, the expanded leaf suite failed **5 tests** and
  passed 52 (`/private/tmp/ch9-r1-before.log`): all three positive-fee cases and
  both fractional cases failed. After fixes, all 57 pass.
- `/private/tmp/ch9-r1-mutations.py` removed each guard statement individually,
  ran only `src/value-v3.test.ts --maxWorkers=2`, then restored the source in
  `finally`. All **21 guard removals** caused assertion failures. Removing the
  dedicated fractional-incomplete reason also failed: **22/22 mutations
  caught**, no survivors or infrastructure-only failures. Per-mutation logs
  and summary are in `/private/tmp/ch9-r1-mutation-*.log` and
  `/private/tmp/ch9-r1-mutations.log`. This checks the previously untested guards
  fail without their protection; it is deterministic builder-side evidence.
- Final original S04–S06 behavioural assertions were added after the mutation
  run; they only add assertions. The final unmutated 57-test suite passed again.

Preinstalled dependencies used throughout; no installation/download or clean
install claim. Cached pinned pnpm 10.28.1 is selected via
`PATH=/private/tmp/jg-ch9-s-bin:$PATH`. Vitest uses `--maxWorkers=2`;
Turbo lint uses `--concurrency=2`, build uses `--concurrency=1` with
`CIRCLE_NODE_TOTAL=2` (installed Next derives one static worker from that value).
No test assertion was weakened or removed.

r1 validation commands actually run (logs `/private/tmp/ch9-r1-*.log`):

| Command | Result |
| --- | --- |
| `pnpm typecheck --concurrency=2` | PASS, exit 0; all 7 package checks, 2 cached. |
| `pnpm --filter @jobguard/core typecheck` | PASS, exit 0. |
| `pnpm --filter @jobguard/core exec vitest run src/value-v3.test.ts --maxWorkers=2` | PASS, 57/57, exit 0 after all test/source edits. Only this leaf's Vitest file run. |
| `pnpm --filter @jobguard/core lint` | PASS, exit 0. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | PASS, exit 0; boundary and money/purity/commercial checks plus 7 package lints (2 cached). Turbo sandbox cache IO warnings. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, exit 0; real local branch, base dc572123, head 253cfea5, all six original lane paths checked including dirty working-tree changes. |
| `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=1` | PASS, exit 0; all 7 packages, including complete Next production build (2 cached). Existing workspace-lockfile/CSS and sandbox cache warnings. This supersedes the initial build's incomplete web-build evidence only; it is not a browser journey. |
| `pnpm openapi:check` | FAIL, exit 1, sandbox EPERM on tsx CLI IPC listen. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | PASS, exit 0, same generator/comparison avoiding CLI IPC. |

No migrations, operational alerts, external actions or provider/environment
changes. Compatibility: candidate validation is stricter for unsupported positive
fees, and the incomplete-reason enum is additive; there are no runtime consumers
in this leaf. No fee eligibility, rate or posting calculation was introduced.

Database, migrations, browser, restore, full root tests and clean pinned install
were NOT RUN in r1. Database/browser execution belongs to GitHub CI after the
dispatcher pushes, per the issued sandbox limitation. The leaf's package checks
and bounded root checks do not establish those guarantees. AI evaluation is
inapplicable (no AI gateway, prompt, model or extraction change).
H-VALUE-SOURCES, S02/S07, rational transport/upstream display-policy binding,
exact repaired-commit CI, fresh independent review and separate technical
acceptance remain HELD. The prior A/B REPAIR responses are not a verdict on this
uncommitted repair. No merge/release, production-fee or real-data authority.
Intended conventional commit subject/body: `/private/tmp/jg-msg-ch9-s.txt`.

Final `git diff --check`: PASS. Final local lane check: PASS. Only the four
permitted files listed above are modified; HEAD remains 253cfea5.

## make PR green

25 October 2026, issued make-PR-green order for PR #331. Inspected the clean
working tree at `264c862be769bf6cccdc53e3614e5b35bd7e02f9`, containing the
dispatcher's merge of cached `origin/main`
`5bcd5ede90b84afbb7d1924d91c015dc07d7bd32`. Read AGENTS.md, BUILD_PLAN.md
CH-9 and SH-1, the candidate contract, lane and existing receipt. Preinstalled
Node 24.17.0, cached pnpm 10.28.1, TypeScript 5.8.3, Zod 4.6.6 and Vitest
4.1.12; no install or download.

No production or test change was justified by source inspection: this lane
has no ZodTypeDef/three-parameter ZodType, `_type`, `_def` or z.record call.
It already uses z.infer and strict objects. Its remainder subtraction and
formatting division/remainder use bigint. It neither calculates fees nor
allocates receipts, so adding SH-1 fee/allocation calls would introduce new
behaviour. The shared enterprise scanner examines five enterprise-domain
files, none belonging to CH9-S; it does not scan value-v3.ts. No scanner,
timeout, configuration, schema strictness, test assertion or lane was changed.

Initial targeted run of enterprise boundaries and value-v3 tests passed
62/62. With all five packages/*/dist directories moved intact to
`/private/tmp/ch9-s-dist-1tmotz2e`, the first whole-core run passed 3063/3064
tests (129/130 files); the sole failure was the enterprise scanner exceeding
its existing 5000ms timeout (6215ms), with no money/import assertion failure.
An isolated repeat during concurrent compiler work likewise timed out
(5613ms). Both runs used --maxWorkers=2 and unchanged test timeouts. Logs:
`/private/tmp/ch9-s-green-core-tests.log` and
`/private/tmp/ch9-s-green-boundaries-no-dist.log`. These are deterministic
builder checks, not independent model review or GitHub CI evidence.

After compiler/lint tasks completed, the whole-core suite was rerun alone,
with packages/*/dist still absent, without changing any test, timeout or
source: **130/130 files, 3064/3064 tests PASS**, exit 0, 34.97s.
`/private/tmp/ch9-s-green-core-tests-serial.log` contains the result. Thus the
reported scanner rule passes on this exact production/test source; the
observed failures were timeouts during concurrent compiler work. This does
not assert the cause of the remote CI failure without its logs or guarantee
remote timing.

| Command | Result |
| --- | --- |
| `pnpm typecheck --concurrency=2` with packages/*/dist absent | PASS, exit 0; 7/7 tasks, 2 cache hits. Core, DB, AI, API and web executed. |
| `pnpm --filter @jobguard/core typecheck` with packages/*/dist absent | PASS, exit 0; direct uncached package command. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | PASS, exit 0; purity, lane, money and commercial scanners plus 7/7 package lint tasks (2 cache hits). Core lint executed. Log `/private/tmp/ch9-s-green-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, exit 0, base 5bcd5ede / head 264c862b; all six branch paths allowed. |
| `pnpm --filter @jobguard/core exec vitest run src/enterprise-domain/boundaries.test.ts src/value-v3.test.ts --maxWorkers=2` | PASS, 62/62, exit 0 (initial dist-present run). |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | First run: 3063 pass, one scanner timeout; standalone rerun: **3064/3064 PASS**, exit 0, no dist present. |

No clean-install claim. Turbo emitted sandbox cache-write IO warnings; checks
ran to completion. No DB, migrations or browser suites started: the dispatch
assigns PostgreSQL/localhost checks to GitHub CI. No AI prompt/model or schema
change, so no new AI evaluation requirement. Existing source-binding, S02/S07,
release, independent exact-commit review and separate acceptance holds remain.
Only this lane's existing receipt is modified; no substantial new complexity,
behaviour/interface change, migration, provider call or operational alert. No
Git write, commit or push.

Final build/OpenAPI evidence:

- `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=1`: PASS, exit 0, all
  7/7 packages including complete Next production build and 41 static pages.
  Existing workspace-root, CSS and dynamic dependency warnings; sandbox
  cache-write warnings. Log `/private/tmp/ch9-s-green-build.log`. Rebuilt
  ignored dist outputs are present; original outputs remain intact in the
  temporary backup cited above.
- `pnpm openapi:check`: blocked, exit 1, tsx CLI IPC listen EPERM in this
  sandbox (`/private/tmp/ch9-s-green-openapi.log`).
- `node --import tsx src/generate-openapi.ts --check` from apps/api: PASS,
  exit 0; same committed OpenAPI comparison without CLI IPC, log
  `/private/tmp/ch9-s-green-openapi-loader.log`.
- Final `git diff --check` and `LANE_BASE_REF=origin/main pnpm lint:lanes`:
  PASS. Only this existing receipt changed. Intended conventional commit
  subject/body written to `/private/tmp/jg-msg-ch9-s.txt`.

Local runnable checks are green on unchanged production/test source. Remote
CI green is not claimed: dispatcher must rerun it on the pushed exact head.
No change to shared scanner timing is authorized by this lane, and no
unrelated mitigation was introduced.
