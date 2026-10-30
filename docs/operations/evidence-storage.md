# Private evidence storage (M0-11)

The evidence bucket is private and bucket versioning is mandatory. Local Compose
creates `jobguard-evidence-private`, removes anonymous access, and enables versioning.
Production provisioning must do the equivalent independently; the application fails
finalization when S3/MinIO does not return a concrete version ID. Do not enable Object
Lock or WORM until retention/deletion policy is approved.

Clients receive a PUT URL valid for five minutes. Downloads are authorized against the
verified tenant plus the registered job and scope identity, and are signed for at most
15 minutes. Finalization reads the exact submitted version on the server and checks its
bytes, SHA-256, size, and allow-listed image MIME type before immutable registration.
Provider metadata is not treated as verification.

Original registrations and derived preview registrations are distinct: previews point
to an original and cannot mutate its key, version, bytes, or SHA-256. Device capture
metadata is untrusted and stored separately from server receive and verification times.
Cleanup only removes expired, unregistered `transient_upload` object versions;
registered evidence and retained classes are excluded.

## M4-4 dark retention and timestamp slice

D07 is still proposed. There is no production activation path in this slice and no
change to the existing evidence cleanup or upload routes. `SyntheticRetentionWorkflow`
is an explicitly enabled, in-memory fixture harness, not durable authorization or
production audit storage. Its two reference classes, `synthetic_evidence` (24 hours)
and `synthetic_checkpoint` (48 hours), are **made-up test periods**, not approved D07
policy. Commands bind an officer, tenant, exact verified synthetic object version,
action, policy, class, expiry and retention deadline. Replays collapse; changed
payloads fail; unknown storage outcomes block blind retry. Hold release never
shortens version retention, and no deletion operation is added. Real D07 must resolve
retention/deletion conflicts and define authorized hold and release evidence before
any real data activation. The fixture event list is not the tenant audit chain.

`LocalMinioWormStorage` defaults off, accepts only HTTP loopback and a `synthetic-`
bucket, and uses exact VersionId for Object Lock COMPLIANCE retention and legal hold
calls. It never requests governance bypass. The opt-in
`worm-minio.integration.test.ts` creates a disposable lock-enabled synthetic bucket,
checks deletion/shortening rejection, overwrites the key, and verifies the original
version and separate hold/release. The `WORM local MinIO` CI workflow runs this test.
Locally it skips unless `JOBGUARD_TEST_LOCAL_MINIO=1`; a skip is not a pass of object
store behavior. The fixture remains locked until expiry in its disposable container.
Local MinIO evidence does **not** prove production S3 behavior.

`FakeTsaTimestampAdapter` also defaults off and has no URL, credentials or live
provider implementation. It invokes the installed OpenSSL/LibreSSL executable with
argument arrays (no shell), requests SHA-256 plus a fresh nonce, and verifies actual
RFC-3161 DER against its query and isolated fake CA. It separately verifies the CMS
signer against a pinned certificate SHA-256, requires the configured policy OID and
SHA-256 imprint algorithm, and applies a five-minute response clock window and
certificate validity checks. A successful result carries the response token, original
query, signer/CA certificates, policy, algorithm and verified timestamp for future
storage. The fake TSA tests generate ephemeral local certificates and sign responses
without a network provider; cryptographic nonces and keys are intentionally fresh.
Unavailable service or invalid responses yield `pending`, never `anchored`.

Supported claim: synthetic integrity and existence relative to a trusted timestamp
and checkpoint. This does not establish device capture time, truthful work,
enforceability, or absolute tamper-proofness. Production remains blocked on D07,
an approved timestamp provider/trust and algorithm policy, durable command/outbox,
token and audit persistence, independently restricted checkpoint retention, and
actual configured production-store validation. No database migration is needed for
this adapter-only synthetic slice.

## M4-4 synthetic operator recovery (0488)

A crashed `executing` or `outcome_unknown` durable hold/release command is blocked
from worker retries. Provision a separate operator login inheriting
`jobguard_worm_operator`; runtime and `jobguard_worm_executor` must never receive
that role. The operator role inherits tenant-scoped runtime reads/audit access but
has no executor claim/finish privilege. Its SQL recovery routines are inaccessible
to runtime, executors and PUBLIC. Operator credentials remain outside the repository.

In the synthetic harness, pass that separately provisioned pool as the fourth
`WormCommandRepository` constructor argument and invoke `recover(verifiedContext,
{ version: "worm.recovery.v1", commandId }, storageReader)`. The input accepts no
role, tenant, object key, version or observed outcome supplied by a user. Use a
verified, explicitly scoped tenant context and the registered exact-version reader.
There is no HTTP recovery route or live activation switch.

Recovery reads the persisted key and immutable version outside a transaction. It
never invokes hold, retention, PUT, overwrite, deletion or another storage write.
A readback matching the original hold/release intent reconciles the existing attempt
to `applied`; it creates no new attempt or command. Missing, unavailable, malformed
or mismatched readback remains `outcome_unknown`, with no automatic rewrite. This
state requires operator investigation; it is not permission to remove protection or
mark a timestamp anchored. Timestamp requests are outside this recovery path.

The transaction checks the original attempt number, serializes completion with
workers/operators, and atomically records reconciliation and a `worm.reconciled`
audit event. Its actor reference hashes the database operator login, rather than
attributing recovery to the builder who authorized the original command. Successful
replay returns the existing result without storage I/O or another audit effect.
No provider error text or object key enters the audit payload. The trust boundary
includes the separately provisioned operator login and its configured storage reader;
readback confirms protection state, not the authenticity of the evidence's contents.

Migration 0488 adds only the operator role and two routines; it does not replace old
routines or rewrite evidence/receipt rows. Forward fixes preserve blocked attempts,
audit and immutable versions. D07, production residency/store validation and RED review
remain required before release. The fake-adapter tests are not live-provider proof.
