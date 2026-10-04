# M4-7-S Synthetic settled movement facts — builder receipt

**Builder:** Claude Sonnet 5.5 (fresh build; not a reviewer, checker or acceptor). **Branch:** `codex/sandbox/m4-7-s-r2`, rebuilt from `origin/main` `b717020` (M4-2-S-R merged, #102). **Implementation head:** `392abf9d350aff31dd6916a43621f2595aeac4c8`; the PR head is this receipt's docs-only commit on top of it. **Migration:** `0046_practice_feed.sql` (BUILD_PLAN §12.2). The earlier attempt on `codex/sandbox/m4-7-s` (used 0043, covered only £384, UIWIRE-12 count and select-label defects per its HOLD `659dddf`) was reused as a design reference only; this is a new build, with its HOLD findings R1–R3 addressed (below). No verdict is claimed here.

## What was built (card M4-7-S)
- **Provider-neutral fake account and consent:** `practice_feed_account` (`provider='none'`, consent scope `read_generated_movements`), connected and disconnected only by commands; no provider SDK, token, bank branding or network call anywhere.
- **Fixed catalogue, exact pence, durable identity:** receipts £384 and £3,000 (`recovery-18800`), £41,280 (`shadow-30000`), £24,000 and £17,280 (Test M), £960 (Test N) and a £540 supplier refund. The same amounts are table CHECKs, not only TypeScript. A movement's identity is `<account id>:<catalogue key>`; events are unique per (account, event id) and carry a validated integrity hash (an integrity hash, not a signature).
- **Deterministic ingestion:** the browser names a catalogue movement and a generated step (`pending`, `settled`, `replay`, `page_overlap`, `alternate_representation`, `unknown_duplicate`); the server generates the events. A replay or overlapping page adds no row; a late pending event cannot downgrade a settled movement; an unidentified duplicate is its own held movement that blocks its settled sibling until `reconcile_duplicate`.
- **`Practice receipts` screen** on the saved job workspace: connect, generated movement/event selects (unsaved draft, labelled), movement cards, builder-attested receipts with `Match £x receipt to its settled movement`, `Reconcile generated duplicate`, `Disconnect practice feed`, a sources/hash details panel.
- **Builder-attested receipt qualifies only once matched to a settled movement:** `practice_feed_receipt_match`, one receipt per movement and one movement per receipt; the DB requires a builder-attested, unreversed payment of exactly the movement amount on the same job, a settled identified movement and no unreconciled duplicate. A reversed receipt stops qualifying. `customer_payment.qualifying_recovery_proof` stays false.
- **Never allocates:** `allocated-eligible-net` is the literal £0.00 in core, API schema and UI; no landing, allocation, fee or journal row is written (tenant-wide row counts asserted unchanged).

## Contracts and registration files touched (overlaps, per §2.2)
New: `practice-feed-command.v1` (connect | advance | reconcile_duplicate | match_receipt | disconnect, `.strict()`), `practice-feed-query.v1`, `practice-feed-view.v1`, `practice-feed-error.v1`, `practice-feed-consent.v1`. Route `GET|POST /api/jobs/{id}/practice-feed` (thin Next adapter and the Nest controller call the same `PracticeFeedApplication`; both answer a successful command with 200). OpenAPI change is additive: 57 → 58 paths, no schema or path altered. Shared registration files edited once each: `apps/api/openapi.json`, `apps/api/package.json` (one export), `apps/api/src/app.module.ts`, `apps/api/src/workspace/application.ts`, `apps/api/src/workspace/index.ts`, `packages/core/src/index.ts`, `packages/db/src/index.ts`, `packages/db/src/migrate.ts`, `apps/web/app/ui/workspace-shell.tsx`, `packages/db/MIGRATIONS.md`, and the migration-count/catalog assertions in `UIWIRE-12`, `demo-bootstrap` and `tenancy` integration tests. Open PRs that touch the same files (e.g. #103 M4-1-S-R, migration 0043) will need a rebase and a regenerated OpenAPI; migration order 0043 → 0046 is by registry so the gap is harmless.

## Migration 0046 (C4)
Four tenant tables, non-null `tenant_id`, tenant/job-qualified FKs (the match's payment FK is `(tenant_id, job_id, payment_id)`), `jobguard_migration` owner, ENABLE + FORCE RLS, policy for both roles, runtime SELECT/INSERT only, **no SECURITY DEFINER and no routine grant** (two SECURITY INVOKER trigger functions, EXECUTE revoked from runtime). Guard: live owner membership, the connecting session, the synthetic environment setting, latest-command binding, exact kind/step/movement mapping, hash check; deferred triggers require the connect command, the transactional audit event and the match row. Expand-compatible (new tables only); no backfill; forward-fix only. Proven from a real 0042 database carrying a prior job.

## Commands actually run (worktree `.worktrees/m4-7-s-fresh`, Node 24.17, pnpm 10.28.1, real embedded PostgreSQL 16.10)
| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck` | 0 | 7/7 |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | purity, lane, money, commercial-boundary + 7/7 |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `m4-7-s`, 31 files, all in the exact-path allow-list |
| `pnpm build` | 0 | 7/7 incl. production Next build |
| `pnpm openapi:check` | 0 | matches source |
| `pnpm test` (under `heavy-slot`) | 0 | tools 39/39; core 498 (70 files); api 150 (17 files, plus openapi check); web 68 (9 files); config 2; storage 4; ai 72; db 200 (39 files) |
| `pnpm test:db` (heavy-slot) | 0 | 39 files, 200 tests, including the 17 new `practice-feed.integration.test.ts` tests |
| `pnpm test:migrations` (heavy-slot) | 0 | 2 files, 11 tests (fresh bootstrap now 44 migrations) |
| `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-7-S.spec.ts` equivalent (heavy-slot, production build, real DB) | 0 | **8 passed** (4 tests × 2 projects), 28.7 s |
Mutation checks (temporary, reverted): dropping the match guard's settled check, reversed check, session check, or the duplicate-held rule (repository and trigger) each made at least one new DB test fail; breaking the monotone settlement rule failed a core test.

## Environment notes (all outside tracked files)
- Embedded Postgres would not start on this Mac until the `@embedded-postgres/darwin-arm64` package's own `scripts/hydrate-symlinks.js` was run inside `node_modules`. No shared-memory segments needed clearing.
- The pinned Playwright shell (`chromium_headless_shell-1193`) is not installed; browser runs used an **untracked config in the session scratchpad, outside the repo**, pointing at the installed `chromium_headless_shell-1234`, with its own copy of `global-setup.ts`, **web port 3046 and Postgres port 55446** (the repo hard-codes 3000/55432), `webServer.cwd` = this worktree, under `heavy-slot`. Nothing was downloaded; no other worktree's shim, port or process was touched (the only processes I stopped were my own queued wrapper and a probe server of mine on port 3999).
- Earlier browser attempts of mine used the repo's fixed ports 3000/55432 with a shim of mine that first failed to start (wrong working directory) and then hit a real defect (below). They are **not cited**; the 8-pass result above is a fresh run on the own-port shim against this tree (the spec and route exist only here).

## Done-when mapping
| Card line | Evidence |
|---|---|
| Pending £384 shows `Pending — cannot qualify` | e2e test 1 (card state, exact text visible once, reload persists); core + DB tests |
| Settled shows `Simulated settled movement`, `allocated-eligible-net` still £0.00 | e2e test 1; DB test asserts no allocation/landing/fee/journal rows change |
| Replays, overlaps, alternate representations give one movement | e2e test 1 (`underlying-movement-count` 1, 3 events, 1 card after replay, overlap, statement line and late pending); core seeded-random property test (200 rounds); DB test |
| Unknown duplicate shows `Possible duplicate movement — review needed` | e2e test 2 (shown, both movements held, reconcile merges, event history kept); DB test (typed refusals, pagination, reconcile once only) |
| Builder-attested receipt qualifies only once matched to a settled movement | e2e test 1 (attested-only → pending refused 409 `PRACTICE_FEED_MOVEMENT_NOT_SETTLED` even by API → settled but unmatched → match → `Qualifies — verified by a simulated settled movement`); DB tests for wrong amount, reversed, foreign-job, held duplicate, second receipt on one movement, reversal after match |
| `Disconnect practice feed` keeps history | e2e test 1 (state, revoked consent, movement and 3 events kept, further advance/disconnect 409, reload and second context agree); DB test |
| Forged data refused; pilot/production use refused | e2e test 3 (11 forged bodies, bad movement/step, supplier refund as a receipt match, malformed JSON, `x-tenant-id`, ambiguous query: all refused and nothing persisted); API tests (`SYNTHETIC_ONLY` under every non-synthetic mode even when the body forges a mode flag); DB tests (repository refuses production/pilot/provider-sandbox/unconfigured; raw runtime SQL refused for wrong amounts, wrong kind/step/movement, bad hash, other tenant/job/account/session, production/pilot environment values, and when the environment setting is not synthetic) |
| C1/C7 persistence | Reload, "open from Jobs" (Jobs home, then a fresh navigation to the saved job) and a **second browser context** carrying only the session cookie all read the same saved facts and source identity (Ben's decision: this is how C7's "open from Jobs" is met). A context without the cookie gets 401; a different practice session gets 403. |
| C5 | Same command id replays; different payload under the same id is 409 `IDEMPOTENCY_PAYLOAD_CONFLICT`; two clients from one revision give one 200 and one typed 409 (e2e and DB); membership revoked/expired is refused for read and write |
| C7 UI | Sandbox banner once; `scrollWidth <= clientWidth`; every panel button/select/summary ≥ 44×44 CSS px; keyboard-only path to `Advance practice executor` with visible focus; labelled selects (the earlier attempt's label-inside-label defect avoided); error focus; transport-abort fault test pauses all changes until the saved state is read (`route.abort`, no success faked) |

## Defects found during this build
- The practice sandbox's no-charge scenario activates jobs as `pilot_no_charge`. A first-draft guard that refused any non-`synthetic_demo` activation made the feed unusable on every live job with an invoice (found by the browser spec). The refusal authority is therefore the **deployment environment** (application, repository, and the database trigger's environment setting), as for the other synthetic leaves. A raw-SQL caller that sets that setting itself is the inherent limit of an application-set setting; physical separation of pilot/production databases (§3) is the real boundary. This is stated for the checker to judge; it is covered by an explicit DB test.

## Not run / not verified
- No live provider, no real bank data, no production or pilot environment, no spend. Settlement here is generated and synthetic only.
- Pilot/production refusal is verified at application, repository and database levels; the browser suite cannot flip the server environment, so it cannot show a refusal under a non-synthetic server mode.
- Unit/UI-component rendering is not jsdom-tested (the web package has no DOM test environment); rendering is covered by the Playwright spec.
- No independent verdict, no technical acceptance, no push to `main`.

## Remaining gates
Independent checker (Sol) and Opus review, then separate acceptance, then merge in migration order (§12.2). SV-8 production settlement stays gated on G4-S and refuses builder-attested receipts, pending and synthetic facts; nothing here changes that.
