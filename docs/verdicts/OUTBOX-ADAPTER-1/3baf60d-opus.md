VERDICT: PASS — bound to head 3baf60d60b63535d5ceb31ff191528bd837510fe
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** both fixes are real, small and in the right place, and the tests prove them. The generic worker no longer grabs work it cannot do. The fifth failed retry now ends cleanly as `dead_letter` instead of crashing and leaving the action stuck. I found no blocking problem. There are three small follow-ups below for Ben's backlog. None of them is a defect in this PR.

**Requirement used:** work orders `OUTBOX-ADAPTER-1` (round 1) and `OUTBOX-ADAPTER-1-r2-dead-letter` (round 2), AGENTS.md rev 3.0 §§5.3–5.4, BUILD_PLAN §2.4 C1–C8 (especially C5), Codex bot P1 comment 4198937427 on PR #106, and Sol finding 3 on PR #106. Builder receipts were treated as claims and checked against the code and test runs.

## Findings

**P1:** none. **P2:** none.

**P3-a (follow-up, not blocking): actions that no running executor handles now wait silently.** `packages/db/src/outbox.ts:13` returns before the `outbox.queue_age` event when the executor lacks the adapter. On main, nothing registers an executor for `fake_purchase_order` (`purchase-order-repository.ts:2`) or for the pending `fake_invoice_delivery` rows from `customer-billing-repository.ts:8`. Once #106 lands, `fake_recovery_message` joins them under the generic worker (`apps/api/src/worker.ts:11`). Staying `pending` is now the honest state. Before this fix such rows were wrongly claimed and later marked `outcome_unknown`. The cost is that nobody is told they are waiting. Suggested follow-up: have the discovery task, or a separate check, emit an alert for pending actions that no running executor handles. Do not reintroduce claiming.

**P3-b (follow-up, not blocking): there is no automatic recovery of stuck `executing` rows for adapters other than `fake_capture`.** This answers integrator question (1). Putting the early return before the stale-claim branch is correct. An executor without the adapter should not change the state of someone else's work. The handling executor still runs the stale-claim branch: my probe P1 shows it marks a 6-minute-old claim `outcome_unknown` without sending anything. Recovery by adapter:
- `fake_capture`: the generic worker still recovers it automatically.
- `fake_quote_delivery`: recovered only when someone presses Advance again for that job (`quote-delivery-repository.ts:36-37`). Nothing sweeps these rows automatically.
- Adapters nothing registers: no recovery path at all. Rows the old bug left stuck in `executing` can neither be recovered nor cancelled, because `operateOutbox` (`outbox.ts:14`) cannot cancel from `executing`.

All of this is synthetic data, and the receipt correctly scopes old stuck rows out. Suggested follow-up: a reconciliation sweep, or an operator "mark unknown / cancel" command, for stuck rows of adapters that no executor handles.

**P3-c (problem already on main, outside this PR, flagged because it affects (1)): the worker's discovery query starves after 100 signals.** `worker.ts:13` selects `infrastructure.outbox_signal ORDER BY created_at LIMIT 100`. It never sets `enqueued_at` (`0006_outbox.sql:31`) and never removes processed signals, so once 100 signals exist the generic worker keeps rediscovering only the oldest 100. Newer `fake_capture` work, and the stale-claim recovery above, would never be reached. This PR neither causes nor worsens this. Recommend a separate task card.

## Checks against the questions asked

1. **Early return before the stale-claim branch:** acceptable, and the right design (see P3-b). The adapter check runs right after the existing authorized `SELECT … FOR UPDATE OF o` and before any status change, telemetry, attempt count or attempt insert. Probe P3 also shows an executor without the adapter no longer cancels an expired action it does not handle; the executor that has the adapter then cancels it without sending.
2. **Lock order and authorization:** unchanged. The authorization join and row lock are still the first statement, byte for byte. The new guard is an in-memory `Map.has` after that lock, and it adds no lock. The round-2 change is one parameter (`status==='dead_letter'?'failed':status`, attempt UPDATE only). The outbox status mapping, `next_attempt_at`/`completed_at` handling and the telemetry order are unchanged. No schema, grant, RLS or SECURITY DEFINER change (C4). No migration, so the merge-ahead renumber does not apply.
3. **Do the PostgreSQL tests really exercise both fixes?** Yes. I copied the PR's tests onto unchanged main (`a5ed99a`) and ran them against real embedded PostgreSQL 16.10:
   - The new quote-ownership case fails with `FAKE_ADAPTER_NOT_REGISTERED`.
   - The new dead-letter case fails with `violates check constraint "action_attempt_outcome_check"`.
   - All five new unit cases fail on main.
   
   On the head, all pass. The existing outbox assertions are unchanged: the diff only adds an optional `adapter` parameter defaulting to `fake_capture`, plus two new cases. Nothing was skipped, deleted or given a longer timeout.
4. **Quote-delivery and worker suites:** unaffected. `quote.integration` passes in CI and locally. `worker.ts` is unchanged, and no worker test exists. The full DB suite, API suite (108) and Playwright (166) are green in CI on this head.
5. **CI on the head (run 37595720438, headSha `3baf60d`):**
   - `checks` passed (10m02s). The lane check passed for `outbox-adapter-1`, and the CI DB run shows `outbox.integration` with 11 tests, `src/outbox.test.ts` with 5, and 39 files / 198 tests passed with none skipped.
   - `secrets` passed.
   - `dependency-review` failed on the three known repo-wide advisories (proxy-addr, source-map-js, sharp). This is not this PR's defect; PR #113 fixes it.
   
   The Codex bot reviewed round 1 (`52c19dd`) with no findings and has not re-reviewed `3baf60d`.

## My own probes (`opus-probe-outbox-adapter.integration.test.ts`, real PostgreSQL, actual runtime role; not added to the PR)

| Probe | Head | Main |
|---|---|---|
| P1: stale foreign claim untouched by an executor without the adapter (no telemetry); the executor with the adapter marks it `outcome_unknown` with zero sends | pass | **fails**: main's generic worker rewrites the row |
| P2: 4 retryable results then `outcome_unknown` on the 5th → row `outcome_unknown`, **not** dead-lettered (C5); no blind retry; after reconcile `not_found`, a 6th retryable → `dead_letter` with attempt 6 `failed`; operator retry refused; no 7th send | pass | **fails**: check-constraint violation |
| P3: expired foreign action not cancelled by an executor without the adapter; the executor with it cancels it, with no attempts | pass | **fails**: main cancels it from the wrong executor |
| P4: an executor without the adapter arrives while the other executor is mid-delivery → nothing changes; that executor finishes with exactly one attempt | pass | pass |
| P5: an executor holding both adapters runs each action once with its own adapter, concurrently | pass | pass |

## What I ran (detached worktree at `3baf60d`, plus one at `a5ed99a` for the red baseline)

- `pnpm install --frozen-lockfile --ignore-scripts` → 0. Also ran embedded-postgres's own `hydrate-symlinks.js`, which `--ignore-scripts` skips, and `pnpm --filter "@jobguard/db^..." build` → 0.
- `pnpm typecheck` → 0 (7/7).
- `LANE_BASE_REF=origin/main pnpm lint` with simulated `pull_request` event metadata → 0. The lane passed with exactly the five changed files.
- `vitest run src/outbox.test.ts` → 0 (5/5) on head. The same file on main → 1 (5/5 fail).
- Under `heavy-slot`, on head: `vitest run --reporter=verbose test/outbox.integration.test.ts test/opus-probe-outbox-adapter.integration.test.ts test/quote.integration.test.ts` → 0 (17/17). The same PR tests plus probes on main → 1 (5 failed, 11 passed, exactly the expected failures).
- Load on the Mac was 80–150. A first local attempt timed out my probe's setup hook and `restore-rehearsal` (120s) for that reason, not because of the code. I then re-ran with longer `--hookTimeout`/`--testTimeout` CLI flags for my local run only. I relied on CI for `restore-rehearsal` and the rest of the DB, API, web and Playwright suites.

**Not verified:** behaviour of the live Docker Compose worker end to end; the browser suites locally (CI only); historical database contents.

