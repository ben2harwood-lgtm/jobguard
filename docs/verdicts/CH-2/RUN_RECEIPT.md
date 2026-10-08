CH-2 builder run receipt — 3 October 2026

Implementation handoff; this is not an independent verdict or technical acceptance.
Base: `3e0764b639e5a0cdeb1ada1d17dadb90cc2ba24a` (`origin/main` and current HEAD).
Branch: `codex/sandbox/ch-2`. Commit pending: the dispatcher owns the commit;
this sandbox makes `.git` read-only. No commit, push, merge or PR was attempted.

Node `v24.17.0`; pnpm `10.28.1` from the existing Corepack cache. Dependencies
were already installed; no install, package download or lockfile change. Commands
below used `/private/tmp/ch2-bin` first on PATH, a wrapper that invokes that cached
pnpm. The system pnpm launcher initially failed registry-signature verification
before running checks; its exit code was not separately captured. No dependency
or scanner policy was changed to work around it.

| Verification command | Exit | Evidence / limit |
| --- | --- | --- |
| `pnpm typecheck` | 0 | All seven workspaces; repeated after changes. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passes; range checker refuses HEAD == origin/main before dispatcher commit. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same self-comparison restriction; must rerun after commit. |
| `pnpm turbo run lint` | 0 | All seven package lint scripts. |
| `node tools/core-purity-lint.mjs` | 0 | Core stays pure. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Existing exact-money boundary preserved. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Existing commercial adapter boundary preserved. |
| Working-tree lane scope check using exported `selectLane` / `matches`, `git diff --name-only`, and untracked paths | 0 | Every changed file allowed; all earlier lane entries identical. This is not the commit-range lint. |
| `node --test tools/*.test.mjs` | 0 | 39 tooling checks; CI security checks remain fail-closed. |
| `pnpm --filter @jobguard/core test` | 0 | Initial source run: 35 files, 197 assertions. |
| `pnpm turbo run test --filter=@jobguard/core --filter=@jobguard/ai --filter=@jobguard/config --filter=@jobguard/storage --filter=@jobguard/web` | 0 | All selected unit suites, including synthetic AI fixtures. Core's existing script also discovers compiled test copies after build; these are not independent checks. |
| `pnpm --filter @jobguard/db exec vitest run src` | 0 | Three existing pure seed tests; no PostgreSQL claims. |
| `pnpm --filter @jobguard/api exec vitest run src` | 1 | 94 assertions passed at that run; health HTTP test cannot bind a listener (EPERM). |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | 0 | Final run: 10 files, 96 assertions. Exclusion is local only; CI and the existing health test are unchanged. |
| `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts` | 0 | Targeted guard/registry suite after building dependencies. Initial attempt before dependency builds failed package resolution (exit 1). |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --target ES2022 --module NodeNext --skipLibCheck test/watchdog.integration.test.ts test/watchdog-fixtures.ts` | 0 | New PostgreSQL test sources typecheck; not database execution. |
| `pnpm turbo run build --filter=@jobguard/db...` | 0 | Built repository dependencies. |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | 0 | All seven workspaces and production Next output; repeated after changes. |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | tsx CLI attempts an IPC listener, denied by sandbox. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` | 0 | Same repository generator, without CLI IPC. Generated additions preserve prior 201 responses. |
| `pnpm openapi:check` | 1 | Same tsx IPC restriction. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Exact generator comparison; no hand edits. |
| `git diff --check` | 0 | No whitespace errors. |

Not run locally: full `pnpm test` (includes PostgreSQL and listener-dependent
health checks), `pnpm test:db`, `pnpm test:migrations`, full browser regressions,
and `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop CH-2.spec.ts`.
The dispatcher explicitly reserves those suites for GitHub CI because this
sandbox cannot start PostgreSQL or bind localhost. No Playwright screenshots or
traces were produced here; the spec writes project-specific CI screenshots.
No clean install or live-model/provider evaluation was run: dependencies were
provided, and no AI prompt, model, extraction or matching policy changed. The
existing synthetic AI fixture suite did run in the selected unit suites.

Migration: only `0050_watchdog_live.sql`, registered after 0041 (43 total).
No backfill or historical money/status edits. Adds the tenant-bound, migration-
owned live-job SHARE-lock routine, INSERT guards, guarded proof-upload lifecycle
updates and job-qualified order/proof foreign keys. Upload UPDATE privileges are
narrowed to the existing lifecycle columns. Existing controlled recovery-bank
PDF generation remains available after invoicing; runtime cannot forge that
exception. Constraint validation fails closed on any legacy cross-job mislink.
Rollback/forward-fix guidance is in `packages/db/MIGRATIONS.md`.

Invariants touched: live-only watchdog inputs, verified tenant/job identity,
current owner checks before guarded commercial replay, lifecycle serialization,
job-first business locking and audit ordering, rollback with no refused receipt,
idempotency (including readiness/review/bill-supersession replays and durable
inbox seed receipts), proof finalization and original identity, source lineage,
readable history, synthetic-only UI/actions, and additive OpenAPI/command
classification. No new fee formula, provider, external action or release policy.
Proof invalidation and tenant advisory preferences retain their existing
non-watchdog paths; read controls in the relevance inbox remain usable.

Coverage authored for CI: all six non-live statuses across all 17 guarded
entrypoints; direct runtime INSERTs for all 26 guarded tables; update/identity
attacks, role/catalog/RLS/constraint inspection, missing/wrong tenant context,
wrong-job links, both exit-race orders, imported live/invoiced jobs, replay
conflicts, unchanged post-live recovery generation, and persistent browser
inputs/source identity across refresh, Jobs navigation and a second context.
Previous watchdog fixtures now enter live through actual import/switch-live
commands. The negative upgrade fixtures represent rows from the preceding
schema and are created before 0050, without disabling guards or triggers.

Remaining gates: PostgreSQL/migrations, CH-2 in both Playwright projects and all
previous regressions in CI; committed-range lane lint; independent Claude
verdict bound to the dispatcher's exact commit; separate technical acceptance;
founder-owned merge/release. Production and policy approvals remain unchanged.
No Claude review, professional approval, independent verification or acceptance
is claimed by this receipt.

Overlap: no undeclared overlap. Shared append-only edits are the lane registry,
core/db exports, Nest registration and generated OpenAPI. Migration registration
and existing fixture helpers also require serialized integration with other
lanes touching those files. No other lane entry was changed.
