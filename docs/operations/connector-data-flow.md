# Connector data-flow register — disabled, synthetic preparation

Uses [provider-data-flow-v1](../contracts/provider-data-flow-v1.md). Review date: 18 October 2026, configuration execution plus source inspection only. No connector external route or fake server is implemented or contacted by this piece. ENT-6 process-local adapters are in-memory fakes, not executed SFTP/API integrations. All real route approvals remain absent.

| Register field | Issued portion / outstanding evidence |
|---|---|
| Provider / feature | ENT-13A-P file, webhook and API connectors; vendor and transport toolchain unselected |
| Accountable owner | JobGuard dispatcher coordinates build; operational/security/data owner must be assigned before activation |
| Environment | Configuration accepts explicit `synthetic_demo` with fixture labels only; runtime remains held |
| Categories / subjects | This parser handles fixture references only. Future work-order, invoice/payment, materials and export content may identify operatives, contractors, client staff and residents; minimise fields under the owning contracts |
| Purpose / lawful basis | Future authorised imports/exports; actual lawful basis, agreement and DPA evidence required before real data |
| Controller / processor | Plan requires JobGuard processor treatment for contractor client/resident data under D12; actual route roles and approval unverified |
| Origin / processing locations | No external processing in this change. Future origin and every processing destination unapproved |
| Storage / logs / backups | No new storage or logs. Real destinations, backup regions and access unapproved |
| Endpoint / deployment | Fixture-reference labels only; no endpoint resolver or address. Every real destination disabled pending G5 |
| Subprocessors | None introduced; future chain including transport host and credential store unknown/unapproved |
| Retention / training / deletion | No source content retained by this parser. Future raw bytes, metadata, logs and backups require approved settings and deletion/export process; no assumed provider promise |
| Encryption | No network or new persistence. Transport/storage requirements and evidence held under Q4 and route review |
| Credential class | Non-secret fixture reference required; no credential bytes, retrieval, binding, rotation or revocation implemented. External store and lifecycle authority held Q2–Q4 |
| Direction | Future work-order/billing/materials inbound; authorised billing artifact outbound; neither wired here |
| Fallback | Deny; no real endpoint or global fallback path |
| D04 / D12 evidence | Not supplied for any connector route; this register grants no approval |
| Verification evidence | New configuration tests and builder receipt identify execution status. No live, socket or provider verification claimed |
| Gate | G5 per real capability plus required dependency merges, unresolved Q2–Q4/Q7 and delivery-reconciliation rulings, operational readiness and exact-commit independent verdict |
| Kill switch | No routes registered to enable. Future capability/credential revocation and stopping claims must be implemented and tested before activation; preserve uncertain delivery history |

Required future alert ownership includes refused configurations, invalid signatures, authority refusal/revocation, durable quarantine, conflict, transfer failure and ageing unknown outcomes. No alerts, thresholds or monitoring integration are implemented here; numeric thresholds await adoption. Logs/errors/audit/diagnostics must exclude raw credentials, authorization headers, source bodies and resident contacts. The config error retains no rejected input.

Before releasing a route, replace every unknown with verified evidence, record the exact endpoint/version and approved settings, test its kill switch and reconcile uncertain attempts without resending. Do not use a London-facing host as evidence for all downstream destinations. See [reconciliation requirements](connector-reconciliation.md) and [holds](../contracts/connector-capabilities-v1.md).

Merged ENT-6/ENT-7/ENT-8a foundations are not persisted connector functionality. Billing integration waits for accepted ENT-6B #240 interfaces on main; materials integration separately waits for accepted ENT-8a persistence. Ben 1.9 requires non-live billing refusal and explicit ordering of same-time conflicts. Human billing export/import is finance only; materials import is finance/owner only. Neither grants machine authority. No migration in A.

## 29 October 2026 — ENT-13a slice 1 dark inbound register addition

| Field | Synthetic implementation / remaining release evidence |
|---|---|
| Feature / direction | Signed inbound webhook and API-push envelopes; unregistered process-local entry point only |
| Data | Fictional work-order document labels and external billing-status facts; no prices, amounts, allocations, contacts or real documents |
| Processing / network | HMAC and schema validation in the API process; no sockets, network destinations, redirects, providers or live routes |
| Storage | Migration 0415: immutable `connector.input_event` facts/receipts, control-plane `connector.binding`, existing per-tenant audit chain; no body or key logs |
| Secrets | Injected secret-store interface supplies current active signing keys, binding and DB token per request; only token SHA-256 stored in binding. No production store, environment secrets or credentials provisioned |
| Rotation / revocation | Active ring removal refuses old signatures; DB token rotation, expiry and binding revocation refuse even duplicate intake; no authority to self-provision |
| Isolation / minimisation | Dedicated NOLOGIN role can only call intake, no app schema or tables. Binding determines tenant; payload never chooses tenant, bill or job. Receipt exposes its own source event only |
| Outcome / retries | Durable source identity across channels and bindings; identical retries reconcile lost acknowledgements. Reordered and reversal facts remain staged; zero domain effects |
| Region / subprocessors / retention | No new external processor. Event/database/log/backup locations and retention for real usage remain unapproved; no retention/deletion change |
| Gate / owner | DARK, made-up data only. G5 and route-specific security/operational owner approvals remain outstanding; no production enablement path |
| Evidence | `apps/api/src/connectors/inbound.test.ts` deterministic contract tests; `packages/db/test/connector-intake.integration.test.ts` real-PostgreSQL CI tests, not local execution or provider evidence |

No external alert service is introduced. Callers receive only `CONNECTOR_INPUT_REFUSED`;
future composition must count refusals without raw bodies, headers, signatures or driver
errors, and assign alert ownership before G5. Inbound source staging neither authorises
commercial work nor implements outbound delivery/reconciliation for remaining slices.
