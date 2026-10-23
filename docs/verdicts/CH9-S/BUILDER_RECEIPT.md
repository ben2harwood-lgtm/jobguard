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
| CH9-S04 | Unit PASS: supplied recovery and reversal figures/links; no v1 credit/cap/base. |
| CH9-S05 | Unit PASS: tracked/found figures and separate supplier/withheld groups. |
| CH9-S06 | Unit PASS: independent supplied £500/£50 and unpaid £0/£0. Zero example deliberately has unknown settlement. |
| CH9-S07 | **HELD**: actual event/window contract, exact boundaries, canonical duplication/join/pagination/out-of-order behavior and cross-period corrections require CH9-J04/09 and CH9-B02/03. Equal illustrative timestamps and reference checks do not discharge it. |
| CH9-S08 | Unit PASS: distinct invoice net/gross, approved/unapproved deltas, recorded payments, linked reversal/correction. Existing v1 implementation untouched; full v1 runtime regressions NOT RUN. |
| CH9-S09 | Unit PASS: no subscription offset fields, job allocation, prevention amount or hidden fields; prelock found IDs rejected. Actual hidden-state noninterference/authority remains runtime work. |

## NOT RUN and holds that remain

- **H-VALUE-SOURCES**: accepted producer completeness, qualification/settlement lineage, exact event/correction identity, source ownership/version exports, policy/clock/window decisions and producer acceptance evidence. Installed interfaces are insufficient. Public exports remain coordinator-owned.
- **S02/S07** stay open until J/B actual command → stored source → API/browser traces and authoritative reconciliation discharge them. No full CH9-S/source-proof PASS.
- Full root tests, root typecheck, PostgreSQL/catalogue/RLS/migrations/concurrency/upgrade suites, lane regression Node suites, browser journeys in both `mobile-360` and `desktop`, restore and clean production web build: **NOT RUN locally / required CI as applicable**. No DB or web workflow was changed by this leaf. AI eval/live-model evaluation is inapplicable: no AI prompt/model/extraction/output schema or gateway change.
- Root lint/lint:lanes need a real committed comparison range. Root OpenAPI wrapper remains sandbox-blocked; loader comparison passed. Required exact-head CI is still **NOT RUN**; no CI URL/artifact exists for this uncommitted build.
- Missing commercial policy and clock decisions remain held. Production/pilot enablement, real processing/providers/funds, MON/SV/M4 runtime adapters and DEMO end-state/source acceptance remain outside this order.
- Two actual independent exact-head Claude A/B verdicts and a distinct technical acceptance actor are **NOT RECORDED**. No self-acceptance, invented identity, human builder observation or professional approval. Dispatcher must bind the final committed diff to real review/acceptance evidence; Ben alone merges.
