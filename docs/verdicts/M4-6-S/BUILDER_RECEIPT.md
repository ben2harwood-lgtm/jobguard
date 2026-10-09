# M4-6-S — builder receipt (Advance a persisted recovery timeline)

9 October 2026 · branch `codex/sandbox/m4-6-s` · builder: Claude Sonnet 5.5 (Codex is out until 15 October).
Base: `origin/main` `fd81315f956eb89152bc979af3b7ae1b720f7fa4` (M4-5-S 0107, CH-1 0109, ENT-2 0110, TENANT-ADAPTER-1 merged).
Code head: `dda7b295c1dd686f69eca2bc3435b7fdf8dfa6bf`. The head of the branch is this receipt's own commit, which adds only this file; every run below was made on the code head.
Order read in full: `~/.local/share/full-steam/jg-orders/M4-6-S-issued.txt` (header wins over the draft). Migration: **0112_recovery_follow_up.sql**, registered last in `packages/db/src/migrate.ts`.

**Builder receipt only — not independently verified, not accepted.**

## What was built (one paragraph)

A follow-up intent per delivered M4-5-S message, bound to the case revision the builder reviewed and one SBOX-2 practice run, on that run's own fake clock (`fake_clock_tick`). SBOX-2's `advance` now also evaluates what is due, in its own transaction, through a trigger on `app.sandbox_run_event`; a due follow-up gets exactly one PENDING Decision. The reminder is a normal M4-5-S message previewed through the unchanged M4-5-S preview path, approved by the follow-up's own command (which resolves the due Decision and creates the outbox action) and delivered by the unchanged M4-5-S executor, fake adapter and sink. Cancel, dispute, settlement or an archived run show `Stopped`; revocation shows `Approval needed again`; a reopened case leaves the old intent stopped and needs a new reviewed one.

## Changed files (28 before this receipt; lane check passes)

- Lane: `config/agent-lane-assignments.json` (one new line, `m4-6-s`, first commit).
- Core: `packages/core/src/recovery-follow-up.ts` (+ `.test.ts`), `index.ts` export, `watchdog.ts` (registry lines only: 2 web routes, 2 Nest routes, `command:recovery.follow_up.approve_reminder`, all `post_live_billing`).
- DB: `migrations/0112_recovery_follow_up.sql`, `src/recovery-follow-up-repository.ts`, `src/index.ts`, `src/migrate.ts`, `MIGRATIONS.md`, `test/recovery-follow-up.integration.test.ts`, `test/tenancy.integration.test.ts` (six catalog rows only).
- API: `recovery-follow-up.{application,contracts,controller}.ts` (+ application and controller tests), `app.module.ts`, `workspace/application.ts`, `workspace/index.ts`, `openapi.json` (generated, +43 lines, additive).
- Web: `app/api/recovery-cases/[id]/follow-ups/route.ts`, `.../[followUpId]/commands/route.ts`, `app/ui/recovery-follow-ups.{tsx,module.css}`, `app/ui/recovery-messages.tsx` (import + one mount line), `e2e/M4-6-S.spec.ts`.
- Evidence: `docs/verdicts/M4-6-S/TESTS_FIRST_core.log`, this receipt.
- Not touched: `BUILD_PLAN.md`, `package.json`/lockfile, `tools/**`, `packages/ai/**`, auth/session code, SBOX-2 and M4-5-S source files, `recovery-sources.ts` helper (not needed).

## Migration 0112 contents

Six tables, all tenant-owned (non-null `tenant_id`, tenant/job/case-qualified FKs), ENABLE + FORCE RLS, owned by `jobguard_migration`, runtime SELECT/INSERT only, `environment='synthetic_demo'`:
`recovery_follow_up` (intent), `recovery_follow_up_owner` (exactly one per intent: unique and required at commit by a deferred constraint trigger; the only owner kind is `practice_fake_clock`), append-only `recovery_follow_up_event`, `recovery_follow_up_due` (PK intent+period: one due Decision), `recovery_follow_up_reminder` (links the previewed M4-5-S messages), `recovery_follow_up_advance` (ledger for exact replay of `Advance practice time`).
Functions: `recovery_follow_up_{run_tick,case_facts,stop_reason,delivered,live,reminder_window,reminder_approvable}`, `evaluate_recovery_follow_ups`, five guards, one trigger function. One trigger on SBOX-2's `app.sandbox_run_event`.
Three M4-5-S guards are restated with `CREATE OR REPLACE`, bodies exactly as 0107 plus one exception each (see "Things you should know" 1). Expand-only; no existing row, column, grant or policy changes.

## Q1 same-transaction proof (the stop condition did NOT fire)

SBOX-2's code, tables and merged behaviour are untouched; the evaluation attaches as an `AFTER INSERT` trigger on SBOX-2's `app.sandbox_run_event` (kind `advanced`), so it runs inside SBOX-2's own `withTenant` transaction. Proof, real PostgreSQL 16, real `SandboxRepository.advance`:
- `Q1: the due Decision is written by the same transaction as SBOX-2's own advance of the run's fake clock`: the `xmin` (inserting transaction id) of SBOX-2's receipt and `advanced` event equals that of the due Decision, the due row and the `became_due` event.
- `Q1: when the due evaluation fails, SBOX-2's advance rolls back with it, and the same follow-up then becomes due normally`: an injected failure in the due insert leaves no receipt (clock unmoved), no event, no due row, no ledger row; the retry then works.
- `leaves SBOX-2 exactly as it was for a run that has no follow-up` (ticks 1,2,3,3 and no follow-up rows), plus the whole unchanged `sandbox.integration.test.ts` passing in `pnpm test:db`.
The integrator should confirm that a trigger on an SBOX-2-owned table is acceptable as "not changing SBOX-2's behaviour"; it is the only way to share SBOX-2's transaction without editing `sandbox-repository.ts` (outside the lane).

## Q2 due interval

Explicit, versioned synthetic fixture value: `recovery-follow-up-fixture.v1`, **due 1 practice tick after scheduling** (`due_after_ticks=1`, CHECKed in the table; `RECOVERY_FOLLOW_UP_DUE_AFTER_TICKS`). SBOX-2's clock is bounded 0..3, so scheduling at tick 3 is refused (`RECOVERY_FOLLOW_UP_CLOCK_EXHAUSTED`). No statutory deadline, no wall-clock read in due evaluation.

## Q3 mapping, as verified against the code (not ambiguous; I did not stop)

From `packages/core/src/recovery-case.ts` (`transitionRecoveryCase`, `allowed`) and the 0034 `event_type` CHECK:
- dispute = `dispute` (allowed from evidence_assembled, pursuing, negotiating, partially_landed, landed, closed_*; to `negotiating`).
- settlement = `close_recovered` (allowed from pursuing, negotiating, landed; only when landed = claim).
- cancel = `close_no_recovery` (from identified onward), `write_off` (→ closed_no_recovery), `prevent` (from identified, only with nothing landed).
- reopened = `resume_pursuit` (from negotiating) or `reverse_landing` (from pursuing…closed_*) AFTER one of the events above.
Only events after the case event the builder had seen when scheduling count (`case_event_sequence`). The earliest ending event gives the reason. SQL (`app.recovery_follow_up_case_facts`) and TypeScript (`followUpCaseFacts`) are tested against each other for every event type at every review point (`reads case facts identically in SQL and in followUpCaseFacts…`). Two observations, neither changes behaviour: (a) `assertClaimAmendable`'s comment calls a `dispute` on a closed case "the explicit reopen"; under the ruling it is a stop and `reopened` is set only by `resume_pursuit`/`reverse_landing`, so the old intent is stopped either way and a new reviewed one is needed either way. (b) Full receipt without a close (`landed`, outstanding 0) is not a stop under the ruling; the reminder preview is then refused by M4-5-S (`RECOVERY_MESSAGE_CASE_NOT_ELIGIBLE`).

## Q4 / Q5

`follow-up-state` carries `Waiting for the due time`, `Review reminder`, `Stopped`, `Approval needed again` and, once a reminder is approved, the M4-5-S delivery wording. `new-simulated-messages` is the number of the follow-up's reminders the practice provider has recorded. Migration number 0112 as ordered; BUILD_PLAN.md untouched (integrator records §12.2).

## Done-when → tests

| Line | Tests |
|---|---|
| DW1 | DB `DW1: passing the due time gives Review reminder with no new simulated message, and the sink is untouched` (also a fresh pool/second connection reads it); e2e `passing practice time only makes the reminder ready to review…` (both projects: V('follow-up-state','Review reminder'), V('new-simulated-messages','0'), reload, leave through Jobs and reopen, second context, sink/approval/authorization/outbox counts read from PostgreSQL unchanged). |
| DW2 | DB `DW2: advancing any amount of fake time creates no approval, authorization, outbox action, message or sink row`; `DW2: the reminder opens through the M4-5-S message path and is only a preview…`; `DW2: only the exact reminder is approved; any changed body, recipient, amount, pack or hash is refused as changed…` (`RECOVERY_MESSAGE_CHANGED`); `DW2: an older preview cannot be approved…`; `DW2: the exact approval resolves the follow-up's own due Decision and queues one action; delivery records exactly one sink row`; `keeps M4-5-S's one-effect rule everywhere else…`; DB guard tests `refuses a hand-made due row…`, `refuses a hand-made reminder link or approval…`. E2E same journey: forged approvals 409 `RECOVERY_MESSAGE_CHANGED`, plain M4-5-S route 409 `RECOVERY_MESSAGE_EXISTING_EFFECT`, then `Simulated delivery — nothing sent`. |
| DW3 | DB `DW3: repeated and racing advances leave exactly one due Decision and one owner, with no duplicate transition, journal or send` (two connections on one command, three more advances, counts incl. `journal`, `recovery_fee_journal`, case events, sink, outbox); `DW3: duplicated due signals, from several connections and a restarted process, create the one due Decision once` (trigger disabled to simulate a missed signal, ten concurrent signals over two pools, one decision, one event, one audit); `DW3: a signal for another tenant's, or a missing, run…`; `DW3: an advance command replays its first result; the same id for another request, or from another command family, is a conflict`. |
| DW4 | DB `DW4: a cancellation is recorded once, shows Stopped…`, `DW4: a stale cancel is refused`, `DW4: dispute / settlement / case cancelled (closed with no recovery) / (prevented) / (written off) shows Stopped…`, `DW4: a case fact after the reminder is due also shows Stopped…`, `DW4: an archived practice run stops its follow-up`. E2E `a cancellation, a dispute and a settlement each show Stopped…`. |
| DW5 | DB `DW5: revoking the approval behind a pending reminder shows Approval needed again, blocks execution and writes no sink row`, `DW5: a fresh reviewed reminder after a revocation needs its own approval, makes its own Decision, and sends exactly once`, `DW5: a reminder cannot be cancelled away while its approval stands`, `DW5: a reminder queued for delivery is never recorded as delivered once its practice run has been archived`. E2E first test (revoke → `Approval needed again` → re-preview → approve → deliver). |
| DW6 | DB `DW6: the old follow-up stays stopped and is never reused; nothing is created until a new reviewed follow-up exists`, `DW6: a landing reversed after a close also reopens the case, and still revives nothing`. E2E second test (reverse landing after settlement → Stopped, reopened text, new reviewed follow-up on a fresh run → Review reminder; nothing sent). |
| Boundaries | DB `every table is tenant-owned … forced row security, migration ownership and runtime SELECT/INSERT only`; `denies the runtime role any UPDATE, DELETE or TRUNCATE…`; `shows nothing and accepts nothing without a tenant context, and nothing to another tenant`; `refuses an actor who is not an active owner`; `ties every row to its own tenant, job and case by composite foreign keys…` (wrong job and wrong case, three tables); `is synthetic only…` (production/pilot environment refused by CHECK, contract carries no mode); `has exactly one persisted owner per follow-up…`; `refuses a hand-made follow-up that is not on the case's delivered message…`. API application tests: production/pilot/provider modes refused before any DB access, missing/stranger session, forged fields, six actions × (stranger → 404, no session → 401). E2E: a second session gets 404 and a no-session context 401 on every follow-up route, state unchanged. |

Also: core `recovery-follow-up.test.ts` (20), failure mapping tests, `watchdog-registry.test.ts` (classifies the new routes and command), audit test (`appends an identifier-only audit event for each step, exactly once, in a chain that still verifies`).

## Commands, exits, counts (code head `dda7b29`, node v24.17.0 — `.nvmrc` says 24.15.0)

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | 460 packages added |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-follow-up.test.ts` | 0 | 20 passed (first run, before the module existed: exit 1, 20 failed: `TESTS_FIRST_core.log`) |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-follow-up.integration.test.ts` | 0 | 45 passed |
| `pnpm typecheck` | 0 | 7 tasks |
| `pnpm lint` (`LANE_BASE_REF=origin/main`) | 0 | 7 tasks |
| `pnpm test` | **1** | tools 42 pass; config 2, storage 4, ai 72, core 124 files / 3542, api 34 / 789 (incl. `openapi:check`), web 21 / 448 all pass; db 69 files pass, **1 failed of 900**: `work-order-import.integration.test.ts` "registers 0110_work_orders.sql last…" (see "Things you should know" 2) |
| `pnpm build` | 0 | 7 tasks |
| `pnpm openapi:check` | 0 | no diff after regenerate |
| `pnpm lint:lanes` (`LANE_BASE_REF=origin/main`) | 0 | lane `m4-6-s` passed |
| `pnpm test:db` | **1** | 899 passed, 1 failed: the same ENT-2 assertion |
| `pnpm test:migrations` | 0 | 13 passed (tenancy + demo-bootstrap) |
| `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-6-S.spec.ts` | 0 | run as `CI=true playwright test -c playwright.local.config.ts …`: 4 passed (2 tests × 2 projects, ~27 s) |
| neighbours: `M4-5-S`, `SBOX-2`, `M4-1-S`, `M4-3-S` specs, both projects, same way | 0 | 40 passed |

Environment notes: embedded PostgreSQL would not start until the `@embedded-postgres/darwin-arm64` `scripts/hydrate-symlinks.js` was run (pnpm skips its postinstall); nothing else was changed. The pinned Playwright browser (`chromium_headless_shell-1193`) is missing, so the e2e used the UNCOMMITTED, git-excluded `apps/web/playwright.local.config.ts` that only sets `executablePath` to the installed `chromium_headless_shell-1234` (same file as in the `ent-2` worktree). The e2e used the production build (`next build`, `CI=true`), as CI does; a first attempt on `next dev` timed out inside the shared capture helper before any M4-6-S code ran (cold route compile), so it is not evidence. Heavy runs one at a time under `heavy-slot m4-6-s`. Disk free was 73 GB at the last check (floor 45 GB).

Tests that bite: with the migration temporarily mutated and restored byte-for-byte (`git diff` clean afterwards), the DB file failed as expected: due guard ignoring a resolved Decision → 1 failure; evaluation ignoring stop reasons → 8; no trigger on the SBOX-2 advance → 21; sink guard ignoring a stopped follow-up → 1. Only the core tests were written strictly failing-first (log committed); the DB, API and e2e tests were written beside or after the layer they test, and the Q1 injected failure and the mutation runs above are the substitute evidence.

## Things you should know (none is a stop condition; items 1–2 need the integrator)

1. **The M4-5-S "one live effect per case" rule blocks any second message after a delivered one, so a reminder needs a narrow exception.** The lane has no edit right on `recovery-message-repository.ts`, so I did not change M4-5-S code. Migration 0112 restates three M4-5-S guards with one exception each, usable only while a follow-up's reminder is due, unstopped, and every effect on the case is a delivered message from before the follow-up was scheduled (`app.recovery_follow_up_reminder_window`). Without any follow-up row each guard is exactly as 0107. M4-5-S's own `approve` keeps its app-level one-effect check, so the plain message route cannot approve a reminder (tested); the follow-up's own `approveReminder` does, using the same `UserCommandDispatcher`, `appendOutboundAction`, tables and message event row as M4-5-S, and resolving the follow-up's due Decision on the first approval (a fresh Decision after a revocation). The whole 0107 DB suite (`recovery-messages`, `recovery-message-upgrade`, `recovery-message-repository`) passes unchanged. The integrator and reviewer should look hardest here.
2. **Outside the lane, needs a lane amendment (I stopped that edit):** `packages/db/test/work-order-import.integration.test.ts:55` asserts `names.at(-1) === "0110_work_orders.sql"` and `names.indexOf("0110…") === names.length - 1`. Any later migration (0111 M0-6L, this 0112) breaks it. The fix is to delete those two assertions (the strictly-increasing and applied-once assertions stay). Until then `pnpm test` and `pnpm test:db` are red on that one test, which is the only failure in either.
3. **Audit of the due transition is appended by the observer, not by the trigger.** The audit hash chain is computed in TypeScript, so the SQL trigger cannot append it. The due row carries `audit_event_id`; the next command that reads or advances appends the `recovery.follow_up.became_due` audit event once, under that id, under an advisory lock (the M4-5-S `finishHistory` pattern). The due rows, Decision and event themselves commit atomically with SBOX-2's advance; only their audit entry can lag until the next read.
4. **Overlap with the M4-5-S panel.** A reminder is the case's latest message, so the M4-5-S panel also shows it, with its own "Approve this exact message" button (which is refused with its existing one-effect text) and "Advance practice delivery"/"Revoke approval" buttons (which work). The follow-up panel has its own, differently named buttons so existing e2e `exact` names stay unique. The M4-5-S panel does not know when the follow-up panel acts until it reloads. Fixing that needs a change to the M4-5-S panel beyond the allowed mount line.
5. **A reminder's wording is the M4-5-S fixed practice text regenerated from the case now** (same body as the first message when nothing changed); M4-5-S hard-codes the body in its CHECK and guards. Different reminder wording is the live M4-5 template work.
6. Scheduling needs an active SBOX-2 run of the same practice session; the server picks the newest. One live follow-up per case; a stopped or finished one is history, and a reopened case may be given a new reviewed one (DW6). A reminder needs a current evidence pack: after case events the pack must be rebuilt and approved before the preview (M4-5-S's own rule).
7. CI time: the new e2e adds ~30 s and the new DB file ~10 s locally; CI-TIME-1's 30-minute limit was already at 28 minutes on #126, so watch it.
8. Node here is 24.17.0, not 24.15.0.

## Invariants touched, shared files, alerts, remaining gates

- Invariants: C1 full slice (core, DB, application, Next routes, UI, tests; persisted state read after refresh, via Jobs and by a second context); C2 Next routes are thin adapters over one Nest application service, OpenAPI regenerated not hand-edited; C3 synthetic only (`environment` CHECK on every table, `.invalid` recipients via M4-5-S, contract has no mode, application refuses non-synthetic modes before any DB access, real external actions 0 everywhere); C4 tenant tables, FORCE RLS, runtime SELECT/INSERT only, append-only events, expand-compatible; C5 server-side membership, idempotency by command id (replay, conflict, cross-family refusal), two-connection races, revocation and stop rechecked at execution, unknown outcome reconciles through M4-5-S; C6 Vitest + real PostgreSQL 16 + Playwright in both projects with no `route.fulfill()` of JobGuard APIs; C7 reload, open from Jobs, one banner, no horizontal overflow, focus ring, 44 px targets, pending distinct from success.
- AGENTS §1: no Temporal and no scheduler dependency; Graphile stays on generic outbox execution (nothing in this leaf touches it); the single owner kind is `practice_fake_clock`.
- Shared registration files touched, append-only: `app.module.ts`, `workspace/application.ts`, `workspace/index.ts`, `openapi.json`, `core/src/index.ts`, `db/src/index.ts`, `db/src/migrate.ts`, `watchdog.ts` registry, lane registry, `recovery-messages.tsx` (mount only), `tenancy.integration.test.ts` (catalog rows only). The integrator main-merges M0-6L (0111) later; this migration is registered after 0110 and numbered above every merged number.
- Operational alert applicability: none (synthetic; no provider, spend or live job).
- Not run: the full e2e suite (only M4-6-S and four neighbouring specs); CI's exact-commit run; M0-6L interplay.
- Remaining gates (not this leaf): live M4-5 (D10-approved templates, drafting, tone checks), live M4-6 (Temporal ownership of the named recovery timeline), D10, G4-S. No push, merge, rebase or PR was made; nothing was deleted.
