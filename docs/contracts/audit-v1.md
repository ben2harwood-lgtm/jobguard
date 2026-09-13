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
