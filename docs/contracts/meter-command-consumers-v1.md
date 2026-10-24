# MON1-I consumer handoff v1

Issued 24 October 2026, decision 74, RED money/meter build-ahead.
Status: **STOP — runtime integration incomplete**. Source inspection and new CI
preflight tests do not constitute command success, independent review or acceptance.

## Exact inspected baseline

Branch `codex/sandbox/mon1-i`, HEAD
`a9dc9c42ba23df5b5bb35bb4537c904aae71dac6`; local `origin/main`
`4b1a779008505c86ca85db78fb38eda412394fe4`. The issued order overrides the draft's
worktree/branch and merged-before-build requirement. Dependencies still gate merge.
Accepted parent records explicitly accept held/partial foundations: MON1-A at
`a9dc9c42`, MON1-S at `cd1bfdec`, MON1-T at `153dd5b2`, MON1-L at `70e1778a`.
Acceptance of those boundaries does not supply missing operational semantics.

## STOPs verified against actual symbols

1. **S-ADMISSION:** `packages/db/src/meter-place-admission.ts` exports
   `meterPlaceAdmissionHoldV1` and `meterPlaceAdmissionHold` only. There is no
   executable TypeScript admission API. `0210_meter_place_admission.sql` defines
   `app.mon1_admit_place(uuid,uuid,text,uuid)` as migration-owner-only SECURITY
   INVOKER, without runtime/meter EXECUTE. After tenant and lock checks it always
   raises `METER_PLACE_SOURCE_HANDOFF_HELD`. Its four arguments do not carry the
   missing checked pre-mutation authority/source revision contract. Do not grant
   execution, invent source kinds, invoke the pure oracle as authority, or call
   this refusal in builder commands.
2. **S-CLOCK:** MON1-L projects unknown counted places, empty operational
   intervals and `H-METER-CLOCK`. MON1-S preserves them; candidate allowances are
   not billable/committed occupancy. Neither a zero fallback nor candidate totals
   may supply admission or subscription prices. Automatic source facts must not
   be refused as new capacity requests.
3. **S-TRIP:** `app.mon1_capture_small_trip(uuid,uuid,text,uuid)` in 0208 is private,
   acquires the audit head, and raises `SMALL_TRIP_RECONCILIATION_REQUIRED` at
   lines 111/128. An unconditional inline call would roll back builder approval.
   This order permits shared consumer edits only to call accepted admission;
   it does not authorize replacing trip policy or its owner implementation.
   Leave approval transactions unchanged until a checked non-refusing trip
   reconciliation contract exists. Catching an exception outside the transaction
   would lose the approval; suppressing all errors would hide integrity failures.
4. **S-SUBSCRIPTION:** `SubscriptionMeterSource.read(context,digest,sourceId)` calls
   `app.mon2_source(uuid,text,uuid)`, then `projectMeterFixture`. SQL reads
   `app.meter_input_event` and applies effective accepted subscription terms.
   It does not dispatch lifecycle-source versions. Lifecycle source/computation
   IDs and JSON are a separate contract, with unknown days. Do not coerce them
   into `meter-persisted-fixture.v1`, invent trial days or bridge session authority.
5. **S-EXTERNAL:** CH-5 v3 live/invoiced imports and SV-7A on-site diary commands
   remain external consumer closures. No new owner-published executable admission
   seam was found in MON1-A. No missing API is guessed here.

## Consumer mapping and required transaction placement

All symbols below were found with `git grep`/source inspection. They are current
integration targets, not claims of completed wiring.

| Path | Installed boundary | Required work after STOPs clear |
| --- | --- | --- |
| v3 switch-live | `SwitchJobLiveV3Mutation.lock/mutate`; `app.switch_job_live_v3` (0109) | Authenticate, acquire tenant lock 184, recheck current authority/plan, invoke checked pre-mutation admission before dispatcher receipt/business locks. Preserve exact-document authorization and v1 mutation. |
| resume/reopen | `JobWorkStateRepository.command/resume`; `app.ch4_record_work_state(uuid,uuid,text,jsonb)` and `app.ch4_link_post_lock_job(uuid,uuid,text,jsonb)` (0201) | Replace existing capacity-unavailable refusal only after checked admission is supplied. Link alone never activates. |
| source restart | `EvidenceService.beginUpload/finalize`; `ProofCommandService.complete`; `SupplierDocumentRepository.intake/appendReceipt`; `VariationRepository.logBuilderExtra` | Join the tenant serialization domain at each source transaction entry before live/job/proof/receipt locks. Preserve original exact replay and post-lock offers. Do not take 184 late in a trigger. |
| stage work | existing guarded `scope_progress` update / `stage_completion` insert, `ProofCommandService.complete`; `app.ch4_capture_site_source` (0144) and 0201 trigger guards | Cover actual originating writer and prevent generic update bypass; do not count proposal/pricing as work. |
| trip approval | `approvePricedVariation`; `VariationRepository.addFinalReviewExtra`; `FinalAccountCommandService.assemble` | Approved immutable sources only; assembly is a consistency check. No trip error may refuse approval. Finish business locks before trip/audit; no public trip field. |
| subscription | `SubscriptionMeterSource.read`; `app.mon2_source`, `app.mon2_issue`, `app.mon2_review` (0195) | Add explicit version dispatch only with authoritative resolved lifecycle days, accepted terms and preserved immutable source lineage. Preserve supplied-source fixtures unchanged. |
| linked work/import/diary | ordinary v3 activation; external CH-5 / SV-7A owners | No copied baseline/acceptance, automatic linked activation, import grace or off-site/message first evidence. Require owner execution evidence. |

Freeze the complete lock order before enabling any hook: authority precheck →
tenant advisory lock `hashtextextended(tenant_id::text,184)` → authority/plan
recheck → ordered business/source locks → receipts/results → audit last.
`UserCommandDispatcher` currently invokes `handler.lock` before its receipt;
source repositories have independent transactions and need their own early hooks.
A standalone HTTP precheck or a permit read in another transaction is insufficient.
Canonicalize UUIDs to lower case before every new comparison; no new identity
comparison or runtime hook is introduced by this held handoff.

## Evidence and closure

Three new CI-only tests cover private refusal/grants/replay, refusal after both
orders of tenant-lock wait, and existing supplied-source term replacement/fresh
read/foreign-tenant refusal. They intentionally do not insert asserted command
end states or claim positive M1I acceptance. The subscription setup uses existing
labelled synthetic supplied-source fixtures, not lifecycle command evidence.
The existing nine-price regression remains
`test/subscription-persistence.integration.test.ts` with its exact nine oracles.

M1I-01–10 remain held: positive real-command success/refusal/replay, weekly restart
cap, early-lock/link activation, source/plan/revocation races, rollback side effects,
all prices through lifecycle sources, response non-disclosure, v1 regressions,
lifecycle subscription persistence and catalogue/upgrade proof need executable
upstream contracts and CI evidence. Preflight tests prove only named held behavior.

No migration 0223 is emitted: no routine/schema/grant changes are safe or needed
for this handoff. No own-step upgrade test is invented without an own migration.
Existing 0210 upgrade coverage remains mandatory. No new route/page exists, so
no Playwright spec is added. Later MON1-J owns the full browser journey.

No shared barrel, catalogue, registration, provider or commercial authority changes.
For this diff the exact additive shared rows are **none**. Once runtime work is
possible, the integration owner must supply exact routine/catalogue rows from the
actual diff; no speculative privilege grant is approved here.
