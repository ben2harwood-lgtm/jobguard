# Job work timing v1 — shared synthetic facts

`job-work-timing.v1` fixes Europe/London as the shared calendar and uses
immutable canonical UTC server timestamps with six fractional digits. The
CH-4 and MON-1 calendar helpers consume this implementation; MON-3 must use it
for trial timing facts. MON-3 alone owns trial qualification. No helper produces
an obligation, authorizes capacity, or changes an issued period.

The immutable switch-live timestamp is the trial origin. Neither first evidence,
processing time nor reopening supplies a replacement origin. Trial termination
also retains lock, close and second-live-job facts. The deadline date candidate is
90 London calendar days after the switch-live date. Finish and quiet candidates
use seven and thirty days respectively, under the same version. Candidate dates
are not deadline instants and must not be used as billing or eligibility facts.

Day 31 counts the switch-live London date as day one and starts at 00:00 London
on the date thirty days later, as already specified by the plan. The existing
MON-1 helper delegates to this implementation and keeps its public v1 envelope
and typed errors. Date conversion never round-trips a source timestamp into a
new fact. Comparisons use the complete canonical timestamp, including all six
microsecond digits; equal timestamps compare equal. Existing fact ordering
continues to use `(fact_at, id)` as a deterministic display order, not an adopted
interval priority rule.

## STOP T-01: deadline instants and interval endpoints

Before: `packages/core/src/job-work-state.ts` labels intervals as held, and the
prior MON-1 helper only supplies the expressly defined day-31 midnight candidate.
After: `workDeadlineCandidate` preserves the original timestamp and supplies
calendar dates for seven/thirty/ninety, while `resolveWorkDeadline` always raises
`WORK_TIMING_CONVENTION_REQUIRED`. Complete derived intervals remain held.

The supplied answer summary does not determine whether the seven/thirty/ninety
stop instant preserves London wall-clock time or uses midnight, how a missing
spring clock time or duplicated autumn clock time resolves, whether a stop at
midnight touches that day, or precedence when start/activity/stop have exactly
equal times. Those choices change counted days or trial entitlement. No
convention is guessed. Gap/fold fixtures prove date candidates and refusal of
instant resolution, not operational interval correctness. The existing day-31
implementation is retained; it does not settle these other deadlines.

Cancellation preserves supplied stopped intervals byte-for-byte and cannot
restore a past stop. This is history preservation, not retrospective interval
reconstruction. Future site restart requires the transaction-bound place-admission
implementation. A lock never restarts site work; reopening never removes it.

The legacy `projectWorkFacts` result retains its existing `policyStatus` literal
for read compatibility. It is a pure fact projection, not a statement that the
new SQL command boundary lacks authorization. Timing holds apply only to the
unresolved interval behavior described above.
