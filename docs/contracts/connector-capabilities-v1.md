# Connector requirements v1 — ENT-13A partial build

Status: requirements and holds, not an adopted machine capability contract. Dispatch issued 13 October 2026; inspected 15 October 2026. Base is ENT-6 `5105a55eb2a712af7c4b6001ae73bfde934b5679`; main is `6671538c8d69936c162368c760dd6ce0f7f10493`. The dispatcher permits build ahead, while holding all authority-bearing implementation and ENT-8a integration. No connector principal, route, migration, grant, importer or delivery service is introduced.

The controlling card is BUILD_PLAN.md §9.2 ENT-13a, with §§9.1.3, 9.1.8, 9.1.10, 9.1.13, 9.4 and 12.3. Operations, when released, are limited to work-order import, billing-status import, materials-issue import and delivery of an already authorised billing export. This list describes requirements; it is not an executable permission matrix. A connector cannot approve, price, create extras, confirm prompts, change origins or read statements. Existing human import permissions remain unchanged.

## Implemented configuration only (E13-A24 partial)

`parseConnectorEnvironment` in `@jobguard/config` validates a dedicated server-selected configuration object, never a request body or a whole process environment. Callers must select these fields explicitly; other fields are refused. There is no automatic environment reader or application composition in this change.

| Required field | Only accepted form |
|---|---|
| `CONNECTOR_CONFIG_VERSION` | `connector-environment.v1` |
| `JOBGUARD_ENV` | `synthetic_demo` |
| `CONNECTOR_ENDPOINT_KIND` | `fake` |
| `CONNECTOR_ENDPOINT_REF` | `fixture:` followed by lowercase letters, digits, underscores or hyphens |
| `CONNECTOR_CREDENTIAL_REF` | Same local fixture-reference syntax |

These are labels for fictional fixtures, not network addresses, real credential material or a selected external secret-store format. Their local syntax is a reversible implementation choice unrelated to the held security profile. No values are defaulted. Missing fields, unknown versions/fields, other environments, real endpoints, and request activation/authority fields produce the same `CONNECTOR_CONFIGURATION_INVALID` error, without input values or validation details. Parsing does not fetch secrets, resolve references, authenticate a machine, contact an endpoint or enable a runtime operation. Even a valid fixture configuration cannot release held runtime work. E13-A24 application/HTTP proof remains HELD.

## Required identity and persistence (HELD)

Connection authority must fix tenant, environment and client contracts, with a distinct machine actor and any human sponsor recorded separately. Capabilities must be explicit, versioned, scoped, expiring and revocable; their actual fields, SQL signatures, role design and management authority await Q2/Q3. No human session substitution or reconstructed tenant context is permitted.

Source namespace and source event ID persist across channels, connections and rotation. A command binds operation, source, target and canonical semantic payload hash. Raw-byte hashes are separate diagnostics. Repeated identical authorised commands return the immutable first result; changed bindings conflict. Successful no-ops retain identity; refusals do not consume successful identities. Domain effect, receipt and audit must commit atomically. Runtime SQL must recheck authority before lifecycle disclosure and under lock; the six exact replay/refusal tests in the dispatch remain owed.

Work orders must reuse ENT-2 identity/revision/baseline pricing with no connector origin-write path. Whether broader import scope was intended is Q7, still held. Billing must reuse ENT-6's complete invoice composition, ordinary-line denominator, exact allocation, quarantine and cross-channel reconciliation. Unknown composition must never default to allocation wholly onto extras. Materials must reuse ENT-8a facts, source identities and same-job evidence; prompt confirmation remains a separate authorised command. No transport stand-in proves these persistence requirements.

## Outstanding releases

| Hold | Required evidence before implementation |
|---|---|
| Q2 / H1 | Ben's machine authentication, actor/context and restricted execution ruling; reviewed bridge and HTTP composition |
| Q3 / H2 | Ben's provisioning, widening, rotation, revocation and disconnect authority ruling |
| Q4 / H3 | Adopted signing bytes/algorithm, timestamp/skew/replay rules, rotation overlap, size limits, SFTP host/path and API destination/redirect profile; no numeric defaults chosen |
| Q5 prerequisite | Separately reviewed pinned SFTP implementation and external fake-server toolchain; no dependency change here |
| Q6 / H4 | Exact adopted ENT-6 lifecycle for late facts and uncertain delivery reconciliation; main/base do not supply a connector ruling |
| Q7 / H5 | Ben's work-order scope clarification; existing origin-write prohibition continues |
| ENT-6 integration | Actual immutable approval/export/outbox writer, domain receipts, quarantine/allocation keys and checked machine entrypoints; parent currently supplies only pure contracts and process-local fake adapters |
| ENT-8a integration | Parent merge/reissue with actual materials schema, routine, keys and prompt behavior; absent from this base |
| G5 | Capability-specific approval for every real endpoint, verified data flow and operational evidence; no production enablement in this build |

Migration reservation `0170` supersedes the draft placeholder and historical `0084`. It is unused: no partial migration or grants are released. No UI or named-system adapter is included. Acceptance E13-A01–A23 and A25–A28 remains held; A24 has configuration coverage only; A29 documents this issued portion; A30 requires unchanged regressions and an independent exact-commit verdict. Neither documentation nor deterministic checks supply independent acceptance.
