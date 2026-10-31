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
trial/card authority. `day31` requires an already committed job with unchanged
customer, site and small classification: it continues with zero added capacity.
A new job labelled `day31` is invalid, including beyond Solo's grace place.
`small_trip` requires an existing small job and preserves its customer and site;
automatic capacity treatment derives from that verified classification transition,
never the source label alone. These remain supplied synthetic facts, not actual
server authority. First-evidence/restart overlap throws a typed hold. Runtime callers receive no
bypass flag. Source vocabulary is local to this oracle, not an accepted adapter.

Hash recipe: SHA-256 of JSON with normalized schema field order, lowercase UUIDs,
and committed jobs sorted lexically by job ID. It binds every parsed field,
including plan revision and expected source revision. It is reproducibility
metadata, never evidence of source authority or a lasting admission permit.

## SQL STOPs

Parent MON1-L explicitly returns candidate commitments, empty intervals and
`H-METER-CLOCK`. MON1-S consumes these held semantics. No accepted checked
pre-mutation resolver exists for the proposed four-argument source interface.
Consequently 0244 installs a PRIVATE SECURITY INVOKER boundary that never admits.
It requires migration-owner execution, exact transaction tenant and an already
held tenant advisory lock 184, then always raises `METER_PLACE_SOURCE_HANDOFF_HELD`.
No grant to runtime/meter/PUBLIC, new business table, receipt, Decision, audit,
charge, source mutation or consumer is installed. Existing RLS/FORCE RLS remains.
No executor exports this routine; the DB module exposes only a strict held value.

Coordinator STOP: confirm complete lock order against LOCK-ORDER-1 and deliver
checked source kinds/expected revisions/current authority and immutable binding
before admission can replace refusal. The implemented remainder below preserves
LOCK-ORDER-1: job first, then command identity where applicable, then capacity
and source serialization, with audit last. The old proposed capacity-before-job
order is superseded; no business lock may be introduced after audit.
Actual admission/mutation must be one transaction and recheck authority/plan after
wait and on replay, with exact-payload conflict detection. Grace Decision and
operations card deduplication remain unimplemented, not implied by oracle labels.

No route/UI/browser workflow belongs to this leaf. MON1-I and CH-5/SV-7A own
consumer wiring and real-command coverage; trial/card legality stays MON-3C.
All parent merge, review, CI, separate acceptance and live gates remain.


## MON-1 remainder, migration 0367

The legacy `mon1_admit_place`/pure supplied-fixture interface above remains held.
Checked CH-4 work commands now use private `ch4_admit_place`, with a synchronous
refresh of `meter_work_ledger` before admission and after source mutation. The
ledger stores committed membership, not touched-day billing counts. No caller
receives a reusable permit or can supply projected numbers. Source fingerprint
replays verify the stored result; mismatches refuse the entire command.

Normal-company accepted activations are supported. Shared practice aggregation,
missing agreements and legacy live imports without accepted activation/trip terms
remain refused. MON1-J captures checked normal-company lifecycle facts on each
authenticated owner read using `mon1_today_source` (reusing unchanged inputs), then applies the existing
approved pure day counter for the screen. It takes no client counts or clock.
The legacy `mon1_fresh_counted_meter_today` still refuses stale stored sources
with `METER_UNAVAILABLE`.
Administrative bootstrap assigns its narrow owner and retires the older runtime
reader in the same transaction. No financial action is introduced.

The fresh display does not persist a second counted computation or issue billing
facts. The stored period-ledger writer remains the existing meter-role path;
closed/issued periods are untouched. This avoids a runtime ledger-write grant,
another credential, or a duplicate SQL counting engine. Normal-company owner
reads capture immutable source revisions under tenant lock 184, with current
session/authority checks after waiting. Missing terms, unsupported live imports,
shared practice, non-owner fresh captures and an in-period plan change still refuse.
Admins retain their prior checked read of an already-fresh stored projection;
stale or absent stored data still refuses for them. Reads may append a
new source revision when inputs or the London date change; command retries remain
durable replays of their first result.

MON1-J browser coverage uses authenticated work-command HTTP requests and the
real meter HTTP/UI path, with explicit synthetic activation parents, photo
sources and historical clock fixtures. It does not claim a normal-company job-command browser UI.

## Repair round 1: term-less imports and browser commands

A term-less live adoption makes the committed snapshot unavailable: refresh
returns no snapshot and does not throw. Place admission still rejects that
result, so an older stored count cannot authorize new work. Subscription
accept/change, final-account lock, finish/close and continuing site activity do
not depend on knowing the imported job's capacity. The meter screen continues
to display its existing unavailable message for unsupported imported sources;
no partial count or guessed classification is presented. Site activity checks
admission only when an activation-backed job actually restarts after stopping.
New legacy live-import admissions remain refused once a subscription exists.

The browser now sends work commands through the synthetic normal-company meter
HTTP boundary with verified session, origin, CSRF and server-derived membership.
The same checked repository handles finish, resume, close and reopen. Activation
parents and photo sources remain explicit fictional fixtures; the meter response
and work-command HTTP responses are real. The historical London-day fixture is
not exposed as an API. Source keys bind the tenant, London date, agreement and
builder lifecycle facts. Identical repeated reads reuse the checked capture;
a changed event, lock, trip, observation, link, activation or agreement creates
a new one. A new London date also refreshes midnight deadlines. The public
final-account lock routine acquires tenant lock 184 after its job/variation
locks and before its receipt, refresh and audit, including without withTenant. No fee or payment authority is added.

Grace upgrade Decision delivery and immediate Builder track-review Decision
creation remain unimplemented follow-up; this repair does not claim them.

## CI repair: scope the capacity serializer to source commands

`withTenant` only installs verified tenant context; it does not acquire lock 184.
Unrelated reads, financial preflight/execute transactions and contractor authority
gates keep their existing locks and concurrency. The generic live and source
job guards retain only their existing job SHARE and authority checks; they never
acquire 184. This keeps concurrent evidence writers' live guards compatible and
lets legacy confirmation/evaluation transactions overlap.

Checked work commands take their existing job lock, then the tenant-wide command
identity lock, then 184 before per-job event lock 144 and audit. This prevents a
cross-kind command-ID loser from holding capacity while its winner waits for it.
Actual classified site-source capture takes 184 before 144; the general source
guard does not serialize unrelated invoice/confirmation traffic. Final-account
locking takes its existing job UPDATE and variation locks before 184, receipt and
audit. Builder capture and final locking first share an exact tenant/command-ID
advisory gate (`final-review-command`, seed 0) before claiming a receipt or job
lock. Capture rechecks current owner authority after that wait, then claims its
receipt. It takes no capacity lock while waiting for the source job guard;
actual site-source capture joins 184 before 144 and its work event. Stored
capture replays return the first result without requiring a currently live job.
The checked final-lock routine acquires the same command gate for direct SQL
callers, verifies owner authority again, then retains job/variation-before-capacity
ordering. This prevents capture/lock receipt collisions without introducing a
capacity-before-job cycle. A term-less import still returns an unavailable meter
snapshot; only a new place admission refuses it, not unrelated company actions.
No business lock is introduced after an audit append.

CH-4 fixtures explicitly insert their synthetic small-builder commercial track
before entering live; status alone supplies no track or environment authority.

The commitment replay uses the core clock's `(fact_at, id)` order. Sequence is
only a final tie-break for its synthetic cutoff sentinel, not a replacement for
the canonical fact order. Simultaneous finish/evidence therefore agrees with the
independent core comparator, including reversed UUID and sequence order.
