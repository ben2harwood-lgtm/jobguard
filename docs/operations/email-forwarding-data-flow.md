# SV-7B email forwarding — DARK synthetic connector

Review date: 29 October 2026. Source inspection and deterministic contract tests only.
This is the first connector slice under BUILD_PLAN §10.4 SV-7. No approval is asserted.

| Register field | Current implementation / activation evidence outstanding |
| --- | --- |
| Provider / feature | Email forwarding worker-source adapter; provider unselected |
| Owner | Build router coordinates review; operational/privacy/security owners required before activation |
| Environment / kill switch | Unregistered adapter, default disabled. Explicit synthetic_demo + fixture transport opt-in only. No flag enables a live route |
| Source / categories | Exactly one fictional plain-text customer request; server receipt identity, tenant/job, verified evidence ID/version/hash/receive time. No sender addresses, headers, attachments or real personal data accepted |
| Purpose / authority | Synthetic evidence-observation contract proof. Whole verified tenant context and persisted job authorization required; email From/To/Subject never confer authority |
| Origin / destinations | In-process deterministic fake ports in tests → observation.v1 → existing ShadowDetectionWorker read port and sink. No HTTP/SMTP endpoint, provider, DNS, model, socket or external action |
| Storage / logs / backups | No new persistence or logging. Adapter verifies original text SHA-256 and consumes server-owned immutable receipt metadata; no client-selected receive time/version |
| Idempotency / invalidation | Tenant/job/delivery identifies one immutable original in the port contract; retries emit identical evidence identity and receive time for existing worker deduplication. Missing, pending, invalidated or mismatched originals fail closed. No connector writes, reversals, money, allocations or bill mutations |
| Hidden data | No shadow read/write capability or counts. Source is consumed only through a worker read port; worker terms gates and existing sink retain detection/disclosure/lock authority. Source adapter is not a builder response |
| Regions / subprocessors | None introduced. Every future mail ingress, parsing, storage, log, backup and downstream destination needs independent EU/UK verification; no London-host inference |
| Lawful basis / controller / processor | Real-data lawful basis, roles, agreement and DPA evidence absent; D12 pending |
| Retention / deletion / training | No new store/model. Production originals, mail headers/attachments, exports, deletion and backup retention require approved policy and verified provider settings |
| Encryption / credentials | No credentials, secret store, network or new storage. Production transport/storage encryption and credential lifecycle unimplemented |
| Approval evidence / gate | G1, D04 and D12 for this connector absent. Server remains disabled for all live modes; this document supplies no approval |
| Alerts / fallback | Stable redacted unavailable error, no fallback. Operational ownership/alerts, durable ingest quarantine/replay handling, MIME/attachment validation and live provider verification remain future gated work |

Contract tests: `apps/api/src/email-forwarding.connector.test.ts`. They exercise exact
shared observation output, fail-closed bindings, invalidation, replay stability, injected
authority/money/locked-bill references, error redaction and the existing worker boundary.
These fakes do not prove PostgreSQL persistence, provider delivery or live integration.
No migrations, backfill, privilege changes or deployment. Migration 0421 is unused.

Before a live connector can be proposed, implement and independently verify approved
mail ingress authentication and tenant/job routing, immutable durable originals and
unique delivery identities (including conflicting replay rejection), quarantine and
attachment validation, region/retention/deletion controls, worker scheduling and operational
kill switch. Preserve immutable evidence and existing shadow disclosure/final-lock rules.
No production route can be enabled by editing this adapter's synthetic configuration.
