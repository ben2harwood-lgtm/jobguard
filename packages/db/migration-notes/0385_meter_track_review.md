# 0385 — MON-1 grace and immediate track-review Decisions (RED)

Stacked on mon1-admit / PR #388. The admission function is copied from its latest
base definition in 0367; only unresolved Decision creation is added. The existing
committed-place calculation, tenant serializer, synthetic-only source guards,
locked-job refusal, Solo limit and unblocked Builder admission are retained.

An addition above Solo's five or Builder's twelve paid places raises
`subscription.upgrade`, once per accepted agreement. Beyond Builder's grace place
(14 committed places), it immediately raises `subscription.track_review`, once
per company. IDs bind tenant and purpose (plus agreement for grace). Closing,
reopening, command replay and later additions cannot duplicate these effects.
The latest mon2_issue/mon2_review bodies (0195) reuse an existing track Decision;
their existing review and operations-card records are still produced by billing
review. This piece adds Decisions only, not a new operations workflow.

No approval or authorization is created. No plan, track, locked bill, fee,
allocation, obligation or price is changed. Builder remains capped at £169 by the
existing computation. No new tables, routines, policies, roles or grants; LP-0's
static write inventory adds app.decision for ch4_admit_place only. SERIOUS-B5 and
entitlement signature/privilege expectations need no additions.

No historical backfill: the next place-adding command supplies authoritative
current facts. Fresh and upgrade PostgreSQL tests are included for CI. Roll
forward on failure with a new migration using these definitions; do not remove
already-created Decisions or change a historical bill. Source checks verify the
three copied routines differ only in the intended Decision additions/reuse.
