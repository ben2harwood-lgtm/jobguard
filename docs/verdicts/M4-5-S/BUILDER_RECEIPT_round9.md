# M4-5-S — builder receipt, round 9 (integration with M4-1-S-R)

8 October 2026. PR #106, branch `codex/sandbox/m4-5-s-r2`, worktree `m4-5-s-fresh`.
Starting HEAD: `6706505` (the integrator's merge of main `df1f9c1`, M4-1-S-R #103, into the branch), clean tree. The builder did not review or accept anything; no push, merge or PR change. Synthetic data only; no live provider, spending, real send, production mode or decision approval. No assertion was weakened, skipped or removed, and no test timeout was added or lengthened. No merged migration (0000–0097) was edited. Migration stays `0099_recovery_messages.sql` (unmerged; edited for item 2). `config/agent-lane-assignments.json` is not touched, and `apps/web/app/lib/recovery-case-requests.ts` is not touched.

Round 8's abandoned-reconcile takeover (`8f39436`) and rounds 1–7 are all kept.

## Item 1 — M4-5-S's screen re-applied on top of main's `recovery-cases.tsx`

**File:** `apps/web/app/ui/recovery-cases.tsx` (main's M4-1-S-R version is the base; every M4-1-S-R behaviour is kept: `commandOutcome` and the unknown-answer retry, `readList`, the `parse*Sources` validation, `selectedCaseAfterResponse`, the fee note, `parsePoundsToPence`, the allowed-transition logic, the ticket/world ordering).

- `import styles from "./recovery-messages.module.css"` and `<RecoveryMessages key={current.id} caseId={current.id} caseRevision={current.revision} evidenceTick={packTick}/>` placed after `<EvidencePacks … onChange={()=>setPackTick(tick=>tick+1)}/>`.
- The explicit fictional delivery picker: label "Fictional delivery source", a select whose first option is "No delivery selected — pack may be incomplete", then the ready deliveries (`document_type==="delivery"` and `status==="ready"`) from `/api/jobs/{jobId}/supplier-documents` `state.documents`; unnumbered deliveries get the short label `Document <first 8 of id>`. The picker is read on mount, on a job change, and on "Try again", under the same job ticket as the register read, so a late answer can never offer another job's delivery. A lookup that cannot be had or read simply offers none (it does not raise a banner or hide the register).
- Rule for opening "materials-320 overcharge", inside `recovery-cases.tsx` only: `merchantSourceRefsWithDelivery(sources, documentsAnswer, chosenId)` calls main's `merchantSourceRefs(sources)` and appends the chosen delivery id **only when that returned recorded ids** (every ref a uuid, not the fixed practice labels). The chosen delivery must still be a ready delivery in the fresh answer, otherwise opening is refused with "Review the changed delivery source before opening this case".
- Row validation in the same spirit as M4-1-S-R: every row of `state.documents` must have `id` (uuid), `document_type` (string), `status` (string), `document_number` (string or null); any bad row, a non-list `documents`, or a missing `state` makes the answer unusable, which is the existing `supplierLookupFailure`. One deliberate allowance: a `documents` key that is absent counts as "no deliveries listed", because main's own behaviour tests (`recovery-cases.behaviour.test.ts`, outside the lane, so not editable) answer the supplier lookup without it; a delivery that was chosen against such an answer counts as vanished and is refused.

**Tests that changed because of this item (all in the lane):**
- `apps/web/app/ui/recovery-messages.test.tsx`: its two picker tests replace `useState` with a positional mock, and the component's `useState` order changed in the merge. The arrays are now built by one `workbenchState(deliveries, deliveryId)` helper in the new order (packTick, deliveries, deliveryId, then M4-1-S-R's cases/status/selected/error/busy/amount/claimAmount/reverseAmount/errorSeq, then unsure/needsReload). Their assertions are unchanged.
- New in the same file: 20 tests for the delivery rule above (nothing chosen = exactly main's refs; chosen ready delivery appended after rate and invoice version; never beside practice labels; refusal when the chosen delivery is unlisted, not a delivery, not ready, or the answer carries no list; 12 kinds of unusable answer are `undefined`, with or without a choice).

## Item 2 — one current-state contract in 0099

**Cause.** `app.recovery_message_case_snapshot` computed revision and outstanding itself from claim revisions and events. 0097 added approved landings (`approve_synthetic_landing`) that change the money outstanding without adding an event, so a case with an approved landing would get a message stating a larger outstanding amount than the workbench shows, and the sink guard compared against that same figure.

**Change (`packages/db/migrations/0099_recovery_messages.sql`, same signature and grants):** the snapshot is now a thin invoker reading of `app.recovery_case_current`: `case_revision = revision`, `outstanding_pence = claim_pence - landed - written_off` (landed = GREATEST(manual, approved), never the sum), `WHERE … claim_revision IS NOT NULL`.

- **Legacy cases stay out.** A case with no claim revision (a 0018 creation snapshot) has no snapshot row and is still never previewed, approved or delivered. I found no reason that is wrong. A related consequence, intended: the view itself returns no row for a partly written history (claim revision but no opening event, or the reverse), so such a case is also not message-eligible (it fails closed, as the workbench does).
- **Other derivations checked.** In 0099 the snapshot is the only place revision or outstanding is computed; `guard_recovery_message`, `guard_recovery_message_approval` and `guard_recovery_message_sink` all read it. In `packages/db/src/recovery-message-{current,repository,adapter}.ts` every revision and amount comes from `inspectRecoveryMessageCase` (which selects the snapshot); nothing else derives either. `recovery_message_sources_current` compares saved pack sources to claim-revision and event records and does not compute either figure, so it is unchanged.
- **Serialization.** 0097's routine takes `pg_advisory_xact_lock(hashtext(tenant), hashtext(case))` and so does every 0099 guard and the delivery boundary (`lockRecoveryCase`); one test proves a delivery and the routine serialize in both orders (below).
- `packages/db/test/recovery-message-upgrade.integration.test.ts`: the shared fixture writes claim revisions but no opening event for its cases, which the view treats as partial history; the test now records the case's opening event (as every real case has) before it generates the pack. Without it the third upgrade test fails with `RECOVERY_MESSAGE_NOT_FOUND` (verified), so this is a fixture realism change, not a loosening.

**Tests first.** Seven new tests in `describe('a message states the one current case figures, approved landings included (round 9)')`, `packages/db/test/recovery-messages.integration.test.ts`, real PostgreSQL 16, the real non-owner runtime role, real `approve_synthetic_landing`, each in its own isolated tenant:

1. (a) approved landing: readiness, preview, stored row and message body all equal `recovery_case_current` (revision 2, claim 32000, landed 12000, outstanding 20000, body says £200.00).
2. (b) manual and approved money are not summed: £120 by hand plus the same £120 approved states £200 outstanding (a sum would say £80); then approved £200 over £120 by hand states £120 outstanding (the larger figure), the earlier preview is flagged changed, and a new preview states £120.
3. The snapshot equals the view (revision and outstanding) for five case shapes: opened, hand landing then write-off, approved only, mixed, amended claim.
4. A case with no workbench history has a view row but no snapshot row, and the message read says `RECOVERY_MESSAGE_NOT_FOUND` (control, passes both before and after).
5. (c) a message previewed and approved before an approved landing cannot be delivered after it: the landing leaves the case revision at 2 and only moves the outstanding amount; the saved message is flagged changed, advance gives `RECOVERY_MESSAGE_BLOCKED`, no sink row, the action is cancelled and the history shows blocked.
6. (c) the same through the shared executor called directly (`FAKE_BLOCKED_CHANGED`, action retryable, no sink row) and through a raw sink insert (`23514`, no sink row).
7. Serialization, both orders: (i) the landing routine holds the case lock uncommitted; a delivery started meanwhile is held on that same advisory key (`pg_locks` shows an ungranted lock for the key), writes no sink row, then after commit sees the landing and is refused; (ii) a delivery transaction holds the key after its sink insert; the landing routine is held on the key, writes no allocation until the delivery commits, then lands.

Eight existing tests in the same file were red on `6706505` for a reason unrelated to this item: M4-1-S-R made `RecoveryCaseRepository.command` require a server-selected reviewer principal (`RECOVERY_REVIEWER_FORBIDDEN`), and these tests call it without one. They now pass the fixture owner's `{membershipId, identityUserId}` through a `reviewerOf()` helper (the `amend` helper and two direct `amend_claim` calls); payloads and assertions are unchanged.

**Red on HEAD** (the migration restored to the committed `6706505` version, with the new tests, then my version put back):

```
pnpm exec vitest run --maxWorkers=1 test/recovery-messages.integration.test.ts test/recovery-message-upgrade.integration.test.ts   (exit 1)
 × previews the amount and revision recovery_case_current shows after an approved landing         expected outstandingPence 20000, received 32000
 × counts money recorded by hand and the same money approved as one amount, never their sum       expected outstandingPence 12000, received 20000
 × gives the snapshot the same revision and outstanding as recovery_case_current …                expected outstanding 25000, received 32000
 × refuses to deliver a message previewed and approved before an approved landing, and sinks nothing   changedSinceReview expected true, received false
 × refuses the shared executor and a raw sink row after an approved landing, whatever the caller  sink rows expected 0, received 1 (it delivered £320.00)
 × serializes a delivery and the approved-landing routine on the one case lock, in both orders    sink rows expected 0, received 1
 Tests  6 failed | 91 passed (97)
```
Before that, on `6706505` as merged, the file had 8 further failures (`RECOVERY_REVIEWER_FORBIDDEN`, above) and, before `pnpm --filter @jobguard/core build`, `stateAfterClaimAmendment is not a function` from a stale ignored `dist` (the merge changed core; `packages/core/dist`, `apps/api/dist`, `packages/db/dist` are rebuildable outputs and were rebuilt).

**Green after:** the same two files, `Tests 97 passed (97)`; with the wider set below, 14 files, 238 tests.

## Item 3 — stale text

`packages/db/MIGRATIONS.md` 0099 section: "0097 (M4-1-S-R) has merged and 0099 is registered after 0097"; upgrade proof "through 0097" (existing records and the `recovery_case_current` projection byte-identical); a paragraph describing the snapshot reading `recovery_case_current`, landed = larger of the two, the legacy-case rule, and the shared advisory key. The upgrade test's comments and its describe title say "through 0097"; the upgrade still seeds at the previous schema (every registered migration before 0099, now including 0097), applies 0099 as `jobguard_migration`, and its history digest now also covers `app.recovery_case_current` so the projection is shown unchanged as well.

## Item 4 — e2e spec and helper

`apps/web/e2e/M4-5-S.spec.ts` and `apps/web/e2e/helpers/recovery-sources.ts` need **no change**. Compared against main's workbench: every button name the spec presses ("Open £320 withheld payment", "Open materials-320 overcharge", "Build evidence pack", "Approve this pack for attachment") and every test id it reads (`case-claimed-net`, `pack-*`, `pursuit-*`) is unchanged; the spec never touches the amount fields, landing or reversal controls that M4-1-S-R changed; the Open buttons are enabled once the first register read settles and the spec's `click` helper already waits for enabled; the picker is found by its label, is 44 px tall and wide via the module CSS, and `selectOption` waits for the delivery option to be listed; the opened case's `sourceRefs` is `[rate, invoice version, delivery]` as the spec expects. No other recovery spec uses a generic select or combobox that the picker could collide with. Browser execution is left to CI after the integrator pushes; `playwright test --list` finds all 12 tests.

## Item 5 — whole tree

`apps/api/openapi.json` is unchanged (no API surface changed; `pnpm openapi:check` passes).

## Commands and exits

Node 24.17.0, pnpm 10.28.1, embedded PostgreSQL 16. `df -h /` before heavy runs: 72 GB free, 63 GB after. Machine load average was about 98 during the full database run.

| Command | Exit | Result |
|---|---:|---|
| new/updated db tests against the committed `6706505` migration | 1 | 6 failed, 91 passed (red) |
| `recovery-messages`, `recovery-message-upgrade`, `recovery-message-repository`, `recovery-cases`, `recovery-cases.workbench`, `recovery-case-outcome`, `recovery`, `UIWIRE-12`, `tenancy`, `demo-bootstrap`, `evidence-pack-sources`, `evidence-pack-upgrade`, `evidence-packs`, `verify-evidence-pack-cli` (real PostgreSQL) | 0 | 14 files, 238 passed |
| `pnpm --filter @jobguard/db test` (every db suite) | 1 | 58 files passed, 655 tests passed, 11 skipped; `workspace-read.integration.test.ts` (unrelated to this work) failed in `beforeAll` with its fixed 60 s hook timeout while the machine was at load ~98 |
| `vitest run test/workspace-read.integration.test.ts` re-run alone | 0 | 11 passed |
| `pnpm typecheck` | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` (core-purity, lane boundary, money, commercial, tsc) | 0 | 7/7 tasks; the lane check compares against the merge base, not a self-comparison |
| `pnpm build` | 0 | 7/7 tasks |
| `pnpm openapi:check` | 0 | no drift |
| `pnpm --filter @jobguard/core test` | 0 | 110 files, 3232 passed |
| `pnpm --filter @jobguard/api test` | 0 | 25 files, 663 passed |
| `pnpm --filter @jobguard/web test` | 0 | 20 files, 379 passed (359 before the 20 new rule tests) |
| `node --test tools/*.test.mjs` | 0 | pass |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/M4-5-S.spec.ts` | 0 | 12 tests found |

## Files changed

`apps/web/app/ui/recovery-cases.tsx`, `apps/web/app/ui/recovery-messages.test.tsx`, `packages/db/migrations/0099_recovery_messages.sql`, `packages/db/MIGRATIONS.md`, `packages/db/test/recovery-messages.integration.test.ts`, `packages/db/test/recovery-message-upgrade.integration.test.ts`, and this receipt. All are in the `m4-5-s` lane allow list.

## Not done, and one thing to know

- Browser execution of `M4-5-S.spec.ts` (CI after push). No independent verdict or acceptance is claimed.
- An approved landing does not change the case revision, and `RecoveryMessages` reloads when `caseRevision` or the pack changes, so a message panel left open while a landing is approved elsewhere keeps showing the older amount until the next action. The server is safe (preview and approve say "changed", delivery is refused and nothing is sunk), so this is only a freshness point. The fix would be to hand the panel the case's received amount as well; the order fixed the exact props, so it was left alone.
