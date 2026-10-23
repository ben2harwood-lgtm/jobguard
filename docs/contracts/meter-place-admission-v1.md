# MON1-A private capacity foundation

Issued build-ahead 23 October 2026, decision 74. Synthetic only. NOT accepted.

`evaluateMeterPlaceAddition(raw)` is a pure supplied-input oracle, private to its
module pending coordinator exports. Strict `meter-place-addition.v1` accepts a
synthetic plan/revision/date, source identity/revision, committed job identities
and one prospective identity. A small-trip case replaces the same job's existing
small classification rather than adding a second job. These are test facts, never
authenticated facts.
It reuses canonical customer/site grouping and simultaneous small allowances.
`beforeFacts`/`afterFacts` expose raw jobs, grouped places, small places, free-small
allowances and chargeable committed places separately. Jobs need not count today.
A mixed place is non-small. Different customers never share a place.

Solo admits through five chargeable places, gives sixth unbilled grace and
requires actual Builder approval before seventh. Builder admits seven included,
five extras, thirteenth grace, and all further places with track review. Maximum
principal stays 4,900p/16,900p. This function neither calculates a bill nor changes
a plan. Zero-place additions create no new capacity consequence and confer no
trial/card authority. `day31`/`small_trip` are synthetic automatic oracle cases;
first-evidence/restart overlap throws a typed hold. Runtime callers receive no
bypass flag. Source vocabulary is local to this oracle, not an accepted adapter.

Hash recipe: SHA-256 of JSON with normalized schema field order, lowercase UUIDs,
and committed jobs sorted lexically by job ID. It binds every parsed field,
including plan revision and expected source revision. It is reproducibility
metadata, never evidence of source authority or a lasting admission permit.

## SQL STOPs

Parent MON1-L explicitly returns candidate commitments, empty intervals and
`H-METER-CLOCK`. MON1-S consumes these held semantics. No accepted checked
pre-mutation resolver exists for the proposed four-argument source interface.
Consequently 0210 installs a PRIVATE SECURITY INVOKER boundary that never admits.
It requires migration-owner execution, exact transaction tenant and an already
held tenant advisory lock 184, then always raises `METER_PLACE_SOURCE_HANDOFF_HELD`.
No grant to runtime/meter/PUBLIC, new business table, receipt, Decision, audit,
charge, source mutation or consumer is installed. Existing RLS/FORCE RLS remains.
No executor exports this routine; the DB module exposes only a strict held value.

Coordinator STOP: confirm complete lock order against LOCK-ORDER-1 and deliver
checked source kinds/expected revisions/current authority and immutable binding
before admission can replace refusal. Lock 184 must precede receipts, job/source
locks and audit; no business lock after audit. Never acquire 184 late in a trigger.
Actual admission/mutation must be one transaction and recheck authority/plan after
wait and on replay, with exact-payload conflict detection. Grace Decision and
operations card deduplication remain unimplemented, not implied by oracle labels.

No route/UI/browser workflow belongs to this leaf. MON1-I and CH-5/SV-7A own
consumer wiring and real-command coverage; trial/card legality stays MON-3C.
All parent merge, review, CI, separate acceptance and live gates remain.
