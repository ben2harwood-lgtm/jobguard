# Audit event contract v1

`appendAuditBatch` is called in the same transaction as its business change, after that change and
after every business lock. Its per-tenant head-row lock is the transaction's final lock acquisition.
This M0-5 rule prevents competing audit-only commands from deadlocking; M0-8 owns enforcement at the
full command boundary.

Events chain version, tenant, sequence, stable actor reference, type, subject type/reference, server
timestamp, canonical payload hash, and previous hash. Payloads contain allowlisted identifiers,
SHA-256 hashes, and retention/access classifications only—never names, email addresses, transcripts,
media, or other free text. References and hashes remain potentially personal data and use the same
restricted tenant access and retention classification as their subject.

Audit rows and independently exported checkpoints are append-only. Runtime can neither alter nor
truncate events, nor access checkpoints. Verification against a separately retained checkpoint can
detect tail removal. Hash chaining is tamper-evidence relative to a trusted checkpoint; a database
owner could replace the complete chain and its in-database checkpoints, so this is not “tamper-proof”.

Migration `0001_audit.sql` is forward-only. If deployment fails, fix forward; do not roll back by
deleting audit history. External checkpoint anchoring remains deferred to M4 as specified by the plan.

LP-4 dark database append (migration 0456)
----------------------------------------

**LP-4 part 1: in-database audit append (RED).** This slice builds database
sealing and grant withdrawal in every migrated database. **REFUSED / not built:** reserved
high-trust event-type enforcement and authority-consumer closure, including
`practiceOwnedJobsSql`. Generic appends still accept those names as lower-trust
statements; REFUSED describes the delivery guarantee, not an implemented SQL
rejection. A trust label alone does not satisfy full LP-4. This slice supplies no
production or real-data enablement and cannot close LP-4.

`appendAuditBatch` now sends only strict v1 *input* objects to `app.append_audit(jsonb)`.
PostgreSQL locks the tenant head, allocates sequences, reads the millisecond wall clock,
computes hashes, inserts each event and advances the head atomically. A duplicate event
ID refuses the whole batch; command replay remains the command boundary's responsibility.
Neither caller metadata nor caller-supplied seal/time fields are accepted. The audit head
remains the final contending lock; completion must not introduce a new business lock.

The stored format is `audit.v2`. Its hash input is v1's unit-separator envelope with the
normalized event UUID inserted immediately after the version. Its payload uses bytewise
ASCII key order (all accepted keys/values are ASCII), independent of locale. All envelope
fields, the ID and the payload are therefore sealed together. Existing v1 bytes and
checkpoints stay unchanged and keep the historical v1 verifier, including its legacy
sorting and lack of event-ID binding. Historical integrity supplies no retrospective
claim of authenticated provenance.

Every v2 payload has a database-written `references.auditTrust`. The public append and
identity bridge seal `lower_trust`: event type, actor and subject are caller statements,
including names such as payment/approval/completion. They do not authorize, establish or
certify those facts. These names remain compatible with earlier audit consistency links;
ordinary consistency links are not an authorization boundary. However,
`practiceOwnedJobsSql` still consumes adoption audit references as ownership authority,
so the full authority guarantee remains REFUSED until a later checked-operation/consumer
conversion with positive and forgery-refusal journeys. This part must remain dark.
Only the private primitive, executable by
the migration owner and its checked SQL operations, can seal `checked_operation`.
Final-account, shadow and work-state writers keep their existing checked facts and use
that private primitive. The invoker follow-up routine and identity bridge remain lower
trust. Export verification reports each entry's trust separately from chain integrity;
consumers must not display a lower-trust event as a verified business fact. Actor/session
binding remains LP-6e; database-password tenant binding remains LP-11.

Caller keys colliding with the seal's trust/envelope fields are refused, as are free-text
payloads and email-shaped values. References remain potentially personal identifiers;
this is an allowlist, not a claim that arbitrary identifiers are anonymous.

The new NOLOGIN, NOBYPASSRLS audit writer has only audit table/head privileges and canonical
encoding execution. Runtime has no membership or SET ROLE route to it, no direct audit
INSERT, no private primitive execution and no execution on the retired head routines.
The SSO head bridge is also withdrawn from identity credentials in the same migration.
Audit sealing does not depend on the database name. Tenant context, input validation
and writer privileges apply in every migrated database. Separate synthetic-only
commercial routines retain their own gates; no deployment or real-data enablement
is supplied by this piece.

This is a forward-only, atomic writer/verifier/grant cutover. Apply compatible callers
before directing traffic to the new database routine. On failure, roll back the migration
transaction or fix forward; never restore runtime INSERT or rewrite audit history.
PostgreSQL upgrade/concurrency/permission tests and the existing owner-operation suites
remain CI gates, and an independent Claude RED review remains required.

LP-4 seals `final_check.sources_excluded` with manifest/lock references and
`hashes.exclusions = app.final_lock_hash(excluded)`. The exact ordered exclusion
receipt remains in the frozen manifest rows; its inventory hash is unchanged.
The private sealer and generic append both refuse arrays, objects and null
references. `append_final_check_audit` strips null references, including the
unassigned allocation/revision IDs on stored-receipt and receipt-facts reviews.
The existing stored-event reader remains compatible with the prior candidate's
structured exclusion receipt; no writer can emit that shape through the sealer.
