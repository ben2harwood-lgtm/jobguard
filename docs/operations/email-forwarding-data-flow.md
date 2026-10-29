# SV-7B email forwarding — DARK synthetic connector

Review date: 29 October 2026. Source inspection and deterministic contract tests only.
This covers the contract and durable-store slices under BUILD_PLAN §10.4 SV-7. No approval is asserted.

| Register field | Current implementation / activation evidence outstanding |
| --- | --- |
| Provider / feature | Email forwarding worker-source adapter; provider unselected |
| Owner | Build router coordinates review; operational/privacy/security owners required before activation |
| Environment / kill switch | Unregistered adapter, default disabled. Explicit synthetic_demo + fixture transport opt-in only. No flag enables a live route |
| Source / categories | Exactly one fictional plain-text customer request; server receipt identity, tenant/job, verified evidence ID/version/hash/receive time. The fixture-only store retains fictional raw MIME and attachments privately; no real personal data used |
| Purpose / authority | Synthetic evidence-observation contract proof. Whole verified tenant context and persisted job authorization required; email From/To/Subject never confer authority |
| Origin / destinations | Private synthetic local object store + deterministic MIME fake in tests → source adapter → observation.v1 → existing ShadowDetectionWorker read port and sink. No HTTP/SMTP endpoint, provider, DNS, model, socket or external action |
| Storage / logs / backups | Private local content-addressed receipt bundles retain raw bytes, SHA-256, byte length, server receive time and immutable object version. Atomic exclusive publication, file and directory fsync; no logs or client-selected time/version. Derived fixture text is stored alongside raw bytes with its own hash and :text version suffix |
| Idempotency / invalidation | Tenant/job/delivery identifies one immutable original in the port contract; retries emit identical evidence identity and receive time for existing worker deduplication. Missing, pending, invalidated or mismatched originals fail closed. Store writes originals and hash-only replay-conflict flags; no reversals, money, allocations or bill mutations |
| Hidden data | No shadow read/write capability or counts. Source is consumed only through a worker read port; worker terms gates and existing sink retain detection/disclosure/lock authority. Source adapter is not a builder response |
| Regions / subprocessors | None introduced. Every future mail ingress, parsing, storage, log, backup and downstream destination needs independent EU/UK verification; no London-host inference |
| Lawful basis / controller / processor | Real-data lawful basis, roles, agreement and DPA evidence absent; D12 pending |
| Retention / deletion / training | Synthetic local store only; no model. Production originals, mail headers/attachments, exports, deletion and backup retention require approved policy and verified provider settings |
| Encryption / credentials | No credentials, secret store or network. Private local directory/file creation modes 0700/0600; filesystem owner is trusted. Production transport/storage encryption and credential lifecycle unimplemented |
| Approval evidence / gate | G1, D04 and D12 for this connector absent. Server remains disabled for all live modes; this document supplies no approval |
| Alerts / fallback | Stable redacted unavailable error, no fallback. Operational ownership/alerts, production storage, real MIME/attachment validation and live provider verification remain future gated work |

Contract tests: `apps/api/src/email-forwarding.connector.test.ts` and `apps/api/src/email-delivery.store.test.ts`. They exercise exact
shared observation output, fail-closed bindings, invalidation, replay stability, injected
authority/money/locked-bill references, error redaction and the existing worker boundary.
These fakes do not prove PostgreSQL persistence, provider delivery or live integration.
No migrations, backfill, privilege changes or deployment. Reserved migration 0453 is unused.

Before a live connector can be proposed, implement and independently verify approved
mail ingress authentication and tenant/job routing, production object-store/tenant-safe database persistence, real MIME parsing and
attachment validation, region/retention/deletion controls, worker scheduling and operational
kill switch. Preserve immutable evidence and existing shadow disclosure/final-lock rules.
No production route can be enabled by editing this adapter's synthetic configuration.


SV-7B storage slice (DARK, synthetic only): `EmailDeliveryStore` is unregistered and
default off. The only allowed configuration is explicit synthetic_demo/fixture.
A UUID message ID identifies a fixture delivery globally in this private store;
the first alias mapping is immutable, and unknown aliases remain held even if a
later registry lookup would resolve them. Same bytes plus alias reuse the receipt;
changed bytes or alias are refused and durably flagged without replacing it.
Alias resolution is a trusted server port, never MIME From/To/Subject authority.
Reads recheck persisted job permission and exact tenant/job binding.

No MIME parser is installed (mailparser/postal-mime absent); the parser seam uses
only an in-memory fake that recognizes the fictional message in tests. Parse
failures and unsupported output are held. Oversized raw messages skip parsing;
oversized, encrypted/password-protected, executable and unreadable parts are held.
All attachments are conservatively held until a reviewed validation adapter exists,
including PDFs and archives (no decrypting, executing, remote URL fetching or OCR).
Raw MIME up to 1,000,000 bytes remains immutable in the quarantined bundle; larger
originals retain only hash, byte length and receipt metadata with empty rawBase64,
remain held across restarts/replays and cannot reach the worker. No automatic release path.

Intake has no observation/shadow sink. The worker-facing readOriginal port feeds
the existing EmailForwardingConnector and ShadowDetectionWorker. The worker's
terms and existing sink retain proposal deduplication and final-lock authority.
Repeated deliveries expose one stable evidence ID, rather than minting another
observation. Intake responses and private receipt files are infrastructure-only;
never expose them in builder APIs, exports, errors or logs. No live Graphile task,
HTTP route or provider is registered. Restart/concurrency tests prove local-file
semantics only, not PostgreSQL RLS, production object-store durability or live MIME.
Filesystem privilege/RLS integration, production invalidation and scheduling remain
unbuilt and gated by G1/D04/D12, approved retention and independent RED review.
