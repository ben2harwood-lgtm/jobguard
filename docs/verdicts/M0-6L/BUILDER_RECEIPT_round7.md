# M0-6L builder receipt — round 7, 7 October 2026

Builder: Codex. Branch `codex/sandbox/m0-6l`, PR #104. Base/current Git HEAD: `5c4ec36bd4685d7b06d261668e678adace02cc6b`. This is an uncommitted working-tree repair, not an independent verdict or technical acceptance.

**Result: the six Sol substitutions are rejected; acceptance remains HOLD.** The strict allow-list also exposes ten existing uses in three files outside this lane. The repository-wide assertion remains enforced and fails on those uses. No lane widening, source exclusion, assertion waiver or timeout change was made.

Read AGENTS.md, BUILD_PLAN.md §2.4 C1–C8, §5 authenticated command/security contracts, §11.1 M0-6L, the authentication contract, round 6 receipt and supplied Sol findings. Earlier work, invitation/re-invitation repairs, migration 0098 and migration-count/upgrade assertions are preserved. No branch Git writes, commit, push, merge or PR action occurred. Tool unit tests create disposable Git fixtures, not changes to this branch.

## Finding → fix → test

| Finding | Fix | Test evidence |
|---|---|---|
| Destructured, explicitly context-typed parameter | Context parameters must be plain bindings; rest/destructuring and parameter-property storage are refused. | `Sol: destructured typed parameter`; rejection passes at all four planted source locations. |
| Local object destructuring | Every context use is checked against the four permitted operations. A binding-pattern initializer is refused at its source. | `Sol: local object destructuring`; rejection passes. |
| Local array destructuring | A context cannot enter an array, including an array immediately destructured afterwards. | `Sol: local array destructuring`; rejection passes. |
| `{ context }.context` | Shorthand and explicit object-property storage are refused before any access can lose provenance. | `Sol: object container access`; rejection passes. |
| Context-typed class member | Typed fields and constructor parameter properties are refused; typed member expressions are tracked too. | `Sol: typed class member`; rejection passes. |
| Static alias of `Object.assign` | All Object/Reflect helpers are excluded from permissible whole-argument calls. Static namespace, method, destructuring, chained, bound, container and factory aliases propagate helper provenance. | `Sol: static Object.assign alias` and additional alias controls; rejections pass. |
| Existing bridge freezes a minted context | Return the constructor result whole. The unchanged constructor freezes its literal before minting. | Existing frozen-context/mutation assertion still passes. |
| Existing guard assigns a context to a request member | Bind the original to `const`; expose a getter which returns it whole. The descriptor contains a forwarding function, not a copied context. | New guard test proves stable object identity, freezing, no setter, non-configurability and refusal of replacement. Existing unauthenticated-guard test passes. |

The six new probes were added before the scanner repair and run against the original scanner: exit 1, **all six rejection assertions failed**. That diagnostic run selected only those probes. After refining the array case to copy into a fresh object rather than mutate the frozen original, the exact final six probes were replayed against a temporary scanner read from 5c4ec36: all six failed again. The temporary baseline file was removed. The final API run executes every context-boundary test. The six snippets also compile under strict TypeScript with the same readonly, unique-symbol branded context shape, without explicit any/never laundering. This compilation is synthetic type evidence, not a runtime or PostgreSQL proof.

The scanner now permits only whole call arguments (excluding reflection/copy helpers and known container methods), whole returns, whole `const` aliases that obey the same rule, and `.tenantId` value reads. All other context uses fall through to refusal. Alias and local forwarding-return provenance reaches a fixed point, including inferred local/inline call parameters. Known array/Map/Set methods cannot store the context through an otherwise whole-argument call. JSON/structuredClone refusals preserve the earlier serialization/copy regressions. Per-file and per-revision expression caches preserve the existing timeout.

Added 60 boundary tests: the six Sol probes, 52 additional negative cases and two control groups. Earlier negative assertions, including the nine round 6 forms, remain. The previous positive delayed-`let` alias fixture was strengthened to a `const` forwarding fixture because the integrator expressly forbids reassignable bindings; delayed `let`, direct `let` and `var` now have rejection assertions. Plain pass-through, return, const chains, wrapped returns, `.tenantId` reads and captured whole returns still pass.

This remains a conservative source scanner, not a TypeScript type checker or runtime provenance registry. Names are tracked conservatively within a file. Arbitrary signature/type laundering, unknown imported callable return types and dynamically selected helpers still require review; no claim of exhaustive semantic inference or runtime tenant authenticity is made.

## Outside-lane findings — unchanged and still fail closed

The final repository assertion reports exactly ten uses across these unchanged files:

- `apps/api/src/evidence-pack.application.ts:28`: returns the minted `ctx` inside `{ ctx, actorRef }`. Lines 32, 41, 48, 55 and 64 consume that context through destructuring. Six diagnostics. This file is not in M0-6L's lane.
- `apps/api/src/capture/capture.controller.ts:11`: accepts a context-bearing request record, accesses its context member and tests the context as a boolean. Three diagnostics. Capture wiring was already an outside-lane follow-up in round 6 and is also being changed by SBOX-SESSION-1.
- `packages/db/src/tenant-context.ts:61`: `!context` is outside the literal four-operation allow-list, even though it is a defensive runtime validation. One diagnostic. The shared definition/validator is outside this lane and was not edited.

These require separately authorized integration work or an explicit integrator resolution of the strict rule. The original `expect(boundaryViolations(files)).toEqual([])` remains intact; there is no grandfather list for these uses. Passing the attack fixtures does not make the failing full repository assertion a pass.

## Commands actually run

Node 24.17.0; installed pinned pnpm 10.28.1 via `PATH=/private/tmp/jg-m0-6l-round4-bin:$PATH`. Dependencies were already installed; no downloads/install were attempted. Shared Turbo cache logs may contain paths from their originating worktrees. Turbo cache-write permission warnings and the existing Next workspace-root warning occurred.

| Command/check | Exit / result |
|---|---|
| `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts --maxWorkers=1 -t 'Sol:'` before scanner edit | 1; six new probes failed, 63 earlier tests unselected in this baseline diagnostic. |
| `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts --maxWorkers=1` during repair | 1; six probes and all other selected regressions pass; repository assertion fails on the outside-lane findings. Latest standalone run: 122 passed / one failed. |
| `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts src/auth/auth.test.ts --maxWorkers=1` during repair | 1; new guard forwarding test passes; only repository assertion fails. |
| `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.round7-baseline.test.ts --maxWorkers=1 -t 'Sol:'` (temporary exact-final baseline replay) | 1; all six final probes failed on the 5c4ec36 scanner; 63 prior tests unselected for this diagnostic only. Temporary file removed. |
| `pnpm typecheck` (final) | 0; all seven packages, five cached. |
| `LANE_BASE_REF=origin/main pnpm lint` (final) | 0; all seven packages and actual local lane/purity/money/commercial checks pass. No self-comparison refusal. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; real local-mode comparison, no metadata override or self-comparison refusal. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts --maxWorkers=1` (final scanner) | 1; 16 files, **236 passed / one failed, 237 total**. Boundary: **122 passed / one failed, 123 total**. Only failure is the enforced outside-lane repository assertion. |
| `pnpm --filter @jobguard/web test` | 0; eight files, 63 tests. |
| `pnpm --filter @jobguard/config test` | 0; two files, two tests. |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts test/verify-evidence-pack-cli.test.ts` | 0; two files, seven tests. No database integration claim. |
| `node --test tools/*.test.mjs` | 0; 42 tests, including lane and fail-closed audit controls. |
| `pnpm build` (initial and final rerun) | 0 each; seven packages, five cached. Final rerun completed in 4m55.825s. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; source OpenAPI matches. |
| `pnpm --filter @jobguard/api exec tsc /private/tmp/jg-m0-6l-round7-sol-regressions.ts --strict --noEmit --target ES2022 --skipLibCheck` | 0; all six synthetic reproductions compile. |
| `python3 /private/tmp/jg-m0-6l-round7-integrity.py` | 0; four implementation paths only, dependency files unchanged, 0098 unchanged/last, 45 unique ascending existing migration registrations. |
| `git diff --check` | 0. |

Intermediate scanner runs also exited 1 for the same repository assertion: initially 12 diagnostics, reduced to ten after the two in-lane production fixes. No timeout failure occurred in this round, and no timeout value was introduced or increased. Earlier successful typecheck/lint/build runs were followed by final checks after scanner changes; no green API suite is claimed.

## Migration, scope, invariants and handoff

No migration changes or database execution. `0098_persisted_identity.sql` remains byte-identical to HEAD, SHA-256 `9779d3f643b248b025b0951c204c6cf51d6a936e531e883e783d9e17b85a59e0`, last after 0053 among 45 registrations. Existing migration upgrade/count tests and the documented forward-fix/rollback strategy remain unchanged. No backfill or reset.

Four implementation files changed: the scanner, guard, principal bridge and auth tests, all under `apps/api/src/auth/**`. This receipt is the fifth changed path. The implementation manifest excludes this receipt to avoid self-reference: `/private/tmp/jg-m0-6l-round7-manifest.json`, SHA-256 `ead49fef9e4ad63b0d2997d579c97344a9e3075bd48dba6234d33f2f23286317`. It binds the four sorted content hashes to the exact base commit. The dispatcher must bind subsequent CI, independent verdict and separate acceptance to its actual commit.

Affected invariants: authenticated tenant provenance (AGENTS §5.1), synthetic identity boundary (§5.10–5.11), independent evidence (§5.13/C8). The guard request property now forwards the same frozen context through a non-enumerable, non-configurable getter; it cannot be overwritten, and the guard is expected to run once per HTTP request. Database/auth contracts, provider routes, money, commercial authority and decision approvals are unchanged. No new operational alerts.

Sol's dependency P1 is already repaired on main per the supplied integrator direction; incorporating that upstream repair remains the founder/integrator's step. No package.json or lockfile was changed, and this receipt does not claim a dependency audit on the integrated head. Exact-head PostgreSQL fresh/upgrade/catalog checks, both browser projects, dependency review, secrets scan and CI remain required after dispatch. The newly exposed outside-lane scanner findings must also be resolved before acceptance.

Not run: local PostgreSQL, `pnpm test:db`, `pnpm test:migrations`, browser suites, listener-dependent `src/health.test.ts`, clean install, full root `pnpm test`, registry dependency audit, secrets scan, or GitHub CI. The dispatcher states this sandbox cannot start PostgreSQL or bind localhost; those integration/browser/listener checks belong in CI. No root full-suite pass is claimed. No AI model/prompt/schema changes; live evaluation is inapplicable. All exercised provider behavior used fixtures; no real data, live providers, spending, real sends, production runtime mode, deployment, release or decision approval occurred.

Fresh independent review and separate technical acceptance remain pending. G0/G1, D04 live identity-email approval and real-data operations/residency/retention gates remain unresolved. Intended conventional commit subject/body is in `/private/tmp/jg-msg-m0-6l.txt`. No push, merge or PR action was performed.
