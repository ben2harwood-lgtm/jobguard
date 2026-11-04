# ENT-13b.n adapter evidence template

Unfilled template. No system is selected, no actual adapter is implemented, and no approval or
provider result is supplied. ENT-13b stays open for people: identify the pilot contractor's systems;
implement each actual adapter as ENT-13b.n; obtain sandbox or partner conformance, data-flow approval
and G5 evidence. All real endpoints remain disabled; G0–G5 stay closed.

| Identification and data flow | Evidence (leave blank until supplied) |
|---|---|
| ENT-13b.n / contractor-required system / adapter version / exact commit | |
| Accountable owner / environment / purpose / lawful basis / controller and processor roles | |
| Data categories and subjects / direction / minimisation | |
| Exact endpoint and version / processing, storage, logs and backup destinations | |
| Subprocessors / DPA / residency evidence / D04 and D12 evidence | |
| Credential store / binding / rotation / revocation / encryption | |
| Retention / training settings / export / deletion / fallback denial | |
| Each supported capability and evidence; every missing capability = unavailable | |

| Conformance and release | Evidence (leave blank until supplied) |
|---|---|
| Sandbox or partner test execution / exact adapter head / actual results | |
| Tenant binding / canonical replay / changed payload conflict | |
| Unknown outcome / original identity / restart / reconciliation / no blind resend | |
| Non-live refusal / SQL and concurrency proofs / current authority | |
| Origin, approval and fee writer isolation / runtime privileges / independent review | |
| Durable attempts, receipts and audit / sole scheduler / safe diagnostics | |
| Kill switch / incident owner / unknown-outcome and conflict alerts | |
| Data-flow approval evidence / person-supplied decision | |
| G5 capability-specific evidence / person-supplied decision | |

Use `runConnectorConformance` in `apps/api/src/connectors/conformance-kit.ts` with an isolated
fixture factory, actual source entry, observable provider effects and restart/foreign/non-live
adapter handles. The kit checks eight named boundaries; the deliberately bad fixture fails all
eight. `capabilityReport` renders omitted capabilities as `unavailable`. `synthetic_only` never
means partner support, approval or production readiness.

The SFTP run is process-local with fictional bytes and fixture-owned lifecycle. It does not prove
SQL/RLS, durable restart, race safety, machine authority or a partner integration. The static check
walks local runtime imports, permits only pure contract/configuration dependencies, and refuses
privileged or dynamic loading. Runtime writer traps and adapter-surface checks supplement it;
these deterministic checks are not a JavaScript security sandbox or an independent review.
Follow [reconciliation requirements](connector-reconciliation.md) and the
[data-flow register](connector-data-flow.md); outstanding contract holds still apply.
