# SH-1 builder run receipt

Implementation prepared on `codex/sandbox/sh-1` from main
`3e0764b639e5a0cdeb1ada1d17dadb90cc2ba24a`. Changes are uncommitted:
this sandbox makes the shared `.git` read-only; the dispatcher commits the diff.
No push, merge, PR, deployment, commercial decision approval, live provider or
spending was performed. This is a builder receipt, not an independent verdict or
technical acceptance.

## Delivered

- Strict versioned schemas and a shared exact-rational cumulative fee kernel,
  half-even rounding once, deltas against prior net postings, version-bound rates,
  and required compensation references for negative deltas.
- Pure receipt allocation using explicit → separate invoice → pro-rata precedence,
  line effective-time cutoffs, exact outstanding balances and each line's own
  net/gross ratio; reversals remain exact and negative.
- Migration `0053_shared_money_origin.sql`: immutable job-track bindings,
  track-qualified variation origins, one immutable origin per variation at commit,
  FORCE RLS, qualified FKs, narrow grants, server-derived timestamps/capture hashes,
  command-kind/actor validation and idempotent legacy synthetic backfill.
- Existing activation/adoption-import entrypoints bind in their existing transaction
  via bounded triggers. Existing synthetic capture inserts remain compatible;
  missing historical raising metadata is labelled unknown. Earlier v1 fee contracts,
  priced provenance, IDs, commercial snapshots and audit history are preserved.
- 11 real-PostgreSQL integration tests authored for CI; existing tenancy catalog
  expectations expanded for the two new protected tables. No earlier assertions
  removed or weakened. Architecture tests prohibit numeric monetary
  multiplication/division in the kernel and enforce imports for arriving consumers.

## Environment and commands actually executed

Dependencies were supplied by the dispatcher; no install or dependency/lockfile
change was made. Actual runtime: Node `v24.17.0`, cached pinned pnpm `10.28.1`.
Repository `.nvmrc` is `24.15.0`; clean pinned-install proof remains a CI obligation.
The global pnpm launcher initially stalled attempting its own version-management
lookup; two version probes were interrupted (130), and its newly created empty
`.pnpm-store` metadata was removed. All subsequent pnpm commands used a temporary
wrapper at `/private/tmp/jg-sh-1-bin/pnpm` pointing to the already cached 10.28.1
executable. No package was installed.

| Command | Exit | Result |
| --- | ---: | --- |
| Cached pnpm executable `-v` | 0 | 10.28.1 |
| `pnpm typecheck` (initial and final) | 0 | All seven packages; unchanged config/storage tasks reused Turbo cache |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Lane guard refuses HEAD = origin/main self-comparison in this fresh, uncommitted worktree |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same deliberate fail-closed guard; no tooling weakened |
| `node tools/money-arithmetic-lint.mjs` | 0 | Existing money boundary |
| `node tools/commercial-boundary-lint.mjs` | 0 | Existing effect boundary |
| `node tools/core-purity-lint.mjs` | 0 | Core remains free of I/O/provider dependencies |
| `pnpm exec turbo run lint` | 0 | All seven package lint tasks |
| `node --test tools/*.test.mjs` (including final run) | 0 | 42 tests, including three SH-1 architecture checks |
| `node --test tools/shared-money-origin.test.mjs` (final SQL registration recheck) | 0 | Three architecture tests |
| Working-tree lane/append-only script using existing `selectLane`/`matches`, `git diff HEAD` and `git ls-files --others` | 0 | All changed paths allowed; every earlier lane unchanged. This is not a committed lane verdict |
| `pnpm --filter @jobguard/core test` (first development run) | 1 | Two new test failures: negative-zero assertion and unsafe BigInt refinement on invalid decimal text; both corrected |
| `pnpm --filter @jobguard/core test` (after corrections) | 0 | 248 source tests at that point |
| `pnpm --filter @jobguard/core exec vitest run src` (final) | 0 | 249 source tests; all §10.3 and §9.1 arithmetic fixtures, split/combined rational properties and invalid-boundary tests |
| `pnpm exec turbo run test --filter='!@jobguard/db'` | 1 | API health test cannot bind 0.0.0.0 (EPERM); database tests were excluded explicitly |
| `pnpm exec turbo run test --filter='!@jobguard/db' --filter='!@jobguard/api' --force` | 0 | Actual execution: core 496 assertions (248 source + compiled duplicates at that point), AI 72, config 2, storage 4, web 56; 11 tasks including prerequisite builds, zero cached tasks |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | 0 | 74 tests; only the socket-dependent health test excluded locally. Mandatory CI suite unchanged |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts` | 0 | Three pure seed tests |
| `pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext packages/db/test/shared-money-origin.integration.test.ts` (first) | 2 | Test helper inferred a UUID literal type; annotated as string |
| Same integration-test compilation command (subsequent/final) | 0 | Compiles the authored PostgreSQL tests; does not execute SQL |
| `pnpm build` (initial and final) | 0 | All seven packages, production Next build; unchanged config/storage builds cached. Existing workspace-root/CSS/cache warnings observed |
| `pnpm openapi:check` | 1 | tsx CLI's IPC socket denied (EPERM) before generator execution |
| `node apps/api/dist/generate-openapi.js --check` | 1 | Compiled generator has a pre-existing Nest dependency-metadata problem (DecisionsController resolves Function) |
| Compiled-generator diagnostic with Nest `abortOnError: false` | 1 | Revealed that dependency-metadata error; no OpenAPI output changed |
| `node --import tsx src/generate-openapi.ts --check` in `apps/api` | 0 | Runs the repository's original generator without CLI IPC; committed OpenAPI is current and unchanged |
| `git diff --check` | 0 | No whitespace errors |

## Not executed and remaining gates

- Root `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and browser regressions:
  PostgreSQL and localhost sockets are unavailable in this sandbox. CI must execute
  all mandatory suites, including the new upgrade/fresh/backfill/catalog/forgery/
  rollback tests, existing Neon bootstrap and earlier activation/variation/import
  regressions. No SQL execution is claimed here. No Playwright traces produced.
- SH-1 changes no web workflow: C1/C6/C7 require domain/schema/property/DB evidence,
  not an invented UI. The user-requested `apps/web/e2e/SH-1.spec.ts` lane metadata
  is registered, but no artificial browser spec was created. Existing browser suites
  remain mandatory in both mobile-360 and desktop projects.
- No prompt, model, extraction or matching policy changed. `pnpm eval` was not run
  as a separate wrapper; the same deterministic AI tests ran in the forced unit
  suite. No paid/live-model evaluation or residency approval is claimed.
- Clean install, actual dependency audit, secrets scan, committed lane comparison
  and other GitHub CI gates remain required; their test harnesses passing is not
  evidence those external checks ran.
- SV-1, ENT-4a and M4-8-S are absent in this checkout. Their import seam is exported
  and architecture checks apply when their fee/allocator modules arrive; their
  actual integration remains their acceptance work. No adjacent task was built.
- Independent Claude verdict bound to the dispatcher's exact commit, a separate
  actor's acceptance and founder/delegated merge authority remain required. Overall
  technical acceptance is HOLD pending those checks; no verdict was invented.
- Production fee entitlement/issuance/collection, professional/commercial decisions,
  real data, live providers and release gates remain disabled/unapproved.

## Inherited criteria and overlap

C1: complete core/schema/persistence foundation; no new UI. C2: existing shared
application/Next/Nest service composition retained, with bindings in its PostgreSQL
transactions; original OpenAPI generator check passes. C3: synthetic fixtures and
no external effects. C4: bounded integer Money, bigint rationals, RLS/FKs/grants,
append-only provenance; database guarantees await actual PostgreSQL execution.
C5: immutable track/origin, command/type/actor qualification, stale/conflicting
activation rollback and duplicate activation coverage authored; existing command/
authorization/retry suites remain mandatory. C6: local domain/property/architecture
checks executed; real database/browser checks pending CI. C7: no workflow changes.
C8: no CI weakening, lane registered first, exact-commit independent verdict and
separate acceptance still pending.

Affected invariants: AGENTS §§5.1, 5.2, 5.4, 5.5, 5.6, 5.10 and 5.16. Arithmetic
never asserts qualification/authorization; provenance never asserts billability.
New alerts/provider flows: none. Migration notes include transactional rollback and
forward-fix guidance. [Detailed contract](../contracts/shared-money-origin-v1.md).

Declared shared edits: append-only lane registry and core exports, migration
registration, and expanded tenancy catalog expectations. SH-1 owns these edits
in this worktree; dispatcher integration must serialize shared-file changes.
No undeclared overlap identified.

Discovered later, left outside SH-1: the compiled Nest OpenAPI entrypoint's
DecisionsController metadata failure; the original tsx source generator passes.
Do not confuse compiled-source inspection or test compilation with independent
verification or professional approval.
