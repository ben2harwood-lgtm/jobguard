# LP-3: activation and acceptance cutover (RED, dark)

0411 adds checked overloads for the four legacy routes, closes runtime EXECUTE on
all four old signatures in the same transaction, and leaves owner-connected
historical fixture calls available. New overloads refuse outside the trusted
`jobguard_synthetic_demo` database, regardless of caller-set deployment flags.
No provider, fee posting, real-data enablement or release is introduced.

A private helper checks current owner membership after aggregate lock waits,
same-actor/same-type processing receipt, the independently reconstructed UTF-8
input digest, exact approved Decision/resolution/authorization and wall-clock
expiry/revocation. Immutable use rows make authorization and command consumption
unique and bind job, actor and expected revision. Runtime has only tenant-scoped
SELECT on that new table; no new runtime table writes. The privilege inventory
lists the exact replacement overloads and read-only side table; scanner logic and
source fingerprints are unchanged.

The dispatcher binds LP-3 mutation inputs into its existing request fingerprint
via a full SHA-256 semantic-key suffix. Generated output IDs are excluded; all
requested facts, including expected revision and occurrence timestamps, remain
bound. Acceptance/disposition repositories recover the original revision from
the use row on retry. Replays recheck active membership. Earlier receipts without
use rows have no invented consumption history; incompatible historical fingerprints
fail closed rather than authorizing a new operation.

Existing business routines remain authoritative for party binding, source-state
checks, v1 cap calculation, quote supersession, immutable reacceptance history and
customer billing exclusions. Simulated settlement additionally refuses a second
event for an already settled obligation. Approval timestamps remain transaction
start, expiry remains wall clock after waits, and audit retains its existing
ordered wall-clock implementation; CH-7-TERMS is unchanged.

No backfill rewrites historical business rows. Migration discovery is automatic.
Forward-fix is the recovery strategy: leave old runtime signatures revoked and
repair the checked overload/caller together. Never restore the unchecked grants.
An older application using the withdrawn signatures must be quiesced at cutover;
no runtime compatibility fallback is introduced. Historical upgrade fixtures use
explicit owner connections and retained overloads.

Local source checks and deterministic unit tests do not prove PostgreSQL behavior.
CI must run the real database/migration suites, the LP-0 catalogue guard and
browser journeys. The LP-3 database suite includes independent SQL/TypeScript
codec comparison, wrong actor/tenant/job/command/terms/payload, changed price/cap,
expiry after waits and long transactions, replay/consumption, reversal after live,
rollback and v1/v3 compatibility. RED Claude review and the whole-LP G1 gate remain.
