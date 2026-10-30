# 0306 — CH-8 part 2 (RED preparation)

Expand-only, synthetic-only request, check, export and approval storage. New business tables have tenant
keys, composite foreign keys, FORCE RLS and immutable mutation triggers. Runtime/shadow logins have no
direct table privileges. Runtime invokes only authenticated read/request routines; shadow invokes only
prepare/check-completion/finish routines. The ordinary reader never queries shadow relations. The
post-lock material reader and checked writer are private/worker-only. No existing grants change.

The infrastructure queue holds identifiers only and is readable by the existing infrastructure role.
It carries completion state so discovery does not endlessly requeue completed requests. Business
payloads and session digests live in private tenant rows. No external delivery, providers or fees run.

Upgrade: apply after 0295, preserving all earlier v1/v3 specimen artifacts. Database tests instantiate
fresh schemas and inspect privileges; execution belongs in GitHub CI. No backfill is needed.
Forward fix: disable v3 callers/worker registration, retain all rows, then apply a corrective migration.
Do not delete history or repurpose old pack identities. Runtime creation remains refused: settled-catch journey and
browser acceptance are still missing, as recorded in the builder receipt.

## Router-scoped part 2 activation boundary (28 October 2026)

This supersedes the earlier draft readiness wording: part 2 is preparatory implementation; the
fresh shadow-30000 source-to-settlement/UI/verifier journey belongs to part 3 after the SV-6
runtime hookup. While assessment is unbound, v3 generation and approval refuse with
EVIDENCE_PACK_V3_DEPENDENCY_HELD in the authenticated application, SQL request and SQL writer
boundaries. No runtime pack is created with absent or invented attribution/settlement sections.
Queued work from an older deployment cannot bypass the writer refusal. Pure assembly specimens
and source preparation do not activate runtime creation. v1 behaviour is preserved.
