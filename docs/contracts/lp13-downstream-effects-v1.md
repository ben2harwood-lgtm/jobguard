# LP-13 downstream effects, v1

Synthetic construction only. LP-12 is the landing dependency; this branch is built
on LP-6b's earlier base and must be restacked and checked against the intervening
LP pieces before merge. Source-inspected and locally tested assertions below are
not a PostgreSQL PASS or independent review.

| Item | Downstream impact and smallest treatment | Earlier boundary and regression evidence |
| --- | --- | --- |
| 0017 invoice-number burning | Reuse the private LP-5 claim: one stored number per same-actor, current-transaction, processing invoice command with a live approved authorization. Repeated calls return that number. No claim means refusal. LP-5's deferred completion prevents standalone reservations committing; rollback restores the sequence. Issued invoice rows are untouched. No arbitrary rate limit, renumbering or second reservation store. | LP-5 checked completion and LP-8a invoice issuance remain mandatory. `lp13-low-value-batch.integration.test.ts` attacks 20 standalone calls, 100 calls on one claim, wrong tenant, revoked approval, runtime claim writes and incomplete commit. Retest `UIWIRE-10.integration.test.ts`, `lp5-commands.integration.test.ts` and the landed LP-8a suite. |
| 0053 legacy unknown raiser | Existing trigger stores NULL membership/command with `legacy_unrecorded` and `legacy_synthetic_capture`. Preserve that explicit unknown; it is not a verified person, capture time or command. The legacy read contract remains separately labelled. No backfill invents a raiser. | LP-3/5/8 evidence and fee paths must continue requiring their own qualifying proofs. LP13 tests the actual legacy trigger. Retest `shared-money-origin.integration.test.ts` and `small-builder-origin.integration.test.ts`; core `extra-persistence.test.ts` covers the legacy read contract. |
| 0003 scope progress actor | No actor is persisted by this routine. Its accepted reasons are transition tokens, not verified attribution. Add bound tenant comparison before lookup; retain exactly the three existing transitions. It writes only stage, operational revision and update time, never scope price, job baseline, cap, invoice, authorization or charge. | LP-6 binding/permissions and LP-8 financial commands retain authority. LP13 forges actor settings, checks commercial rows and rejects wrong tenant/reason. Retest `job.integration.test.ts`, `proof.integration.test.ts` and `practice-scope.integration.test.ts`. |
| 0120 SSO audit connection | Latest body is 0456, not 0120: it loads the connection first, selecting its tenant, then validates the subject and seals lower-trust audit. Unknown connections refuse. A stale tenant setting cannot route another connection's event into it. Identity bootstrap retains its narrow exception; an SSO audit event grants no commercial authority. No replacement needed. | LP-4 sealing and LP-6 identity/tenant enforcement. LP13 uses the actual identity role with stale tenant and unknown connection; asserts exact event tenant. Retest `enterprise-identity.integration.test.ts`, `sso-required.integration.test.ts`, `lp6a-sso.integration.test.ts`. |
| 0095 replay branch | The inventory's description is stale: the 13-argument adoption body always raises `JOB_PARTIES_REQUIRED`; 0356 also withdrew runtime execution. Preserve both. The supported 18-argument adoption is checked under LP-3/5; replay belongs to the checked command lifecycle, which compares actor/type/payload/status before returning a stored result. No retired replay route is restored. | LP-3/5/6 command identity, LP-8 money. LP13 tests retired-signature refusal and another actor's current replay key with no invoice effect. Retest `lp5-parties-import.integration.test.ts` for positive/concurrent replay and `lp3-activation-acceptance.integration.test.ts`. |

Migration 0534 is forward-only: one nullable private claim column, narrowed number
allocation and the progress tenant guard. Existing claims require no backfill;
existing invoice numbers and historical origin/audit rows are unchanged.
`lp13-upgrade.integration.test.ts` applies 0534 to its predecessor, checks an
existing sequence stays at 42, preserves the three closed routine bodies, checks
the narrowed owner privileges and refuses an unbound GUC forgery. Number
reservation retains its signature. Callers must carry the LP-6 binding and LP-5
checked invoice command; LP-8a must convert any remaining legacy direct writer.
The existing command writer owns number allocation, with only SELECT/INSERT and
UPDATE(next_number) on the sequence and a bound-tenant policy. Runtime gets no new
write grants. Existing runtime sequence INSERT is an LP-8a closure, not proof that
the whole billing surface is secured here. No new alert or release enablement.

HELD-FOR-BEN: LP-0 effective-privilege/source-pin refresh needs the piece-specific
typed approval in BUILD_PLAN.md §11.8. This change adds a private claim column,
changes two routine sources and adds narrow command-writer/helper/sequence grants
and a sequence policy. Scanner definitions and pins are untouched. The router
must obtain approval, refresh their exact union against the restacked LP-12 base,
run the whole PostgreSQL/migration suite and obtain independent exact-head RED
review before merge. This branch alone cannot satisfy those gates. Forward-fix
failures in a later migration; do not restore standalone reservation authority.
