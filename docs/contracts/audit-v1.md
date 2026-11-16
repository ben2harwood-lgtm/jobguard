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

LP-6e current-main integration candidate (0755, RED)
--------------------------------------------------

New seals use `audit.v3`. Its canonical envelope is v2's with the new version;
its hash binds the event ID, tenant, sequence, actor, type, subject, wall-clock
server time, canonical payload hash and previous hash. Historical v1/v2 bytes,
including the special stored `final_check.sources_excluded` receipt, and historical
checkpoints remain unchanged. Historical actors remain unverified claims.

The private sealer reads actor and tenant from the protected binding and replaces
caller actor text with `membership:<bound UUID>` and hashed
`references.auditActorKind=bound_member`. It compares the bound tenant with the
transaction context and rechecks binding expiry after the final audit-head lock.
Unbound runtime logins, including NOINHERIT members, cannot use generic append.
Owner-side work without a binding receives `system:database:<session_user>` and
`auditActorKind=system`; this identifies an execution principal, not a human.
Reserved envelope/trust/actor keys are refused in every payload section. Nested
`payload` and `payloadHash` keys remain ordinary data, covered by the sealed hash.

The verifier and export distinguish chain integrity, event trust and actor
attribution. A bound member identifies who made a statement; it does not prove
that statement true. The private checked-operation primitive remains unavailable
to runtime. Completion retains the full 0521 result, actor, subject, command,
checked-trust and required outbox checks, accepting v3 alongside historical v2.
Neither replacement is defined by 0749; its remaining routines, binding prefixes
and LP-10 recovery sink are unchanged.

Exact legacy names remain lower-trust in both SQL and verification:
`command.succeeded`, `contractor.extra.client_link_issued`,
`contractor.extra.step_approved`, `contractor.prompt.command`,
`contractor.visit.completed`, `customer_credit_note.synthetic_approved`,
`customer_invoice.synthetic_issued`, `customer_payment.recorded`,
`customer_payment.synthetic_recorded`, `customer_payment.synthetic_reversed`,
`evidence_pack.attachment_approved`, `outbox.authorization_revoked`,
`outbox.succeeded`, `proof.completed`, `quote.acceptance.attested`,
`quote.acceptance_cancelled`, `recovery.eligibility.approve`,
`recovery.follow_up.reminder_approved`, `recovery.message.approved`,
`recovery.message.succeeded`, `recovery.payment_payer.mark_withdrawn`,
`recovery.payment_payer.marked`, `recovery.terms.approved`,
`sso.oidc.request.issued`, `sso.oidc.signin.completed`, `sso.request.issued`,
`sso.signin.completed`, `synthetic_obligation.simulated_settlement`,
`variation.approved`, `worm.authorized`.
Case variants and suffixes do not inherit these exceptions. Other authority names
are refused through generic append. LP-6e-LEGACY-WRITERS must convert these writers
to checked domain operations with positive and forgery-refusal journeys before the
aggregate no-false-approval/payment/completion assertion can be claimed.

The narrow migration-owned outbox bridge checks tenant, subject and event type
against a stored terminal/retry state and seals only lower-trust system statements.
Its tenant comes from that queued row, within the existing queue-tenant-trust hold
until LP-10. It refuses both a live binding and any protected binding row in the
same environment/transaction, including expired, revoked and delegated bindings.
The zero-argument binding-owner probe deliberately ignores expiry and returns only
a boolean. Its keys exactly match bind_request; it discloses no identity or credential.

Under the coordinator's 16 Nov ruling, only jobguard_migration (plus the
jobguard_binding_owner owner) has EXECUTE on the probe. PUBLIC and runtime are
explicitly revoked. The migration role is NOLOGIN NOINHERIT; runtime cannot assume
it. Only the migration-owned outbox bridge calls this boolean helper. bind_request
and binding-owner posture checks are unchanged. Catalog ACL, direct runtime denial,
bound refusal cases and unbound worker/replay coverage are authored for PostgreSQL
CI; they have not been run locally.

The migration is forward-only and atomic, inside one BEGIN/COMMIT. No old migration
is edited. Apply only 0755, never the unmerged 0785/0980 candidates. The migration
proof updates the two recorded definitions and sealer static calls; the completion
body changes only its version predicate. PostgreSQL fresh/upgrade and full database
suites, browser CI and an exact-head independent RED check remain gates.
LP-6e-LEGACY-WRITERS and authority-consumer closure remain named follow-ups.
No production capability or public assurance is claimed.

LATER / SIMPLICITY (initial review, retained): event-name classification in 0755
and `packages/db/src/audit.ts` is duplicated across execution boundaries. A shared
acceptance/refusal fixture would reduce policy drift while keeping the independent
SQL and verifier checks.
