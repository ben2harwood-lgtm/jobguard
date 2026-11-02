# Connector requirements v1 — ENT-13A-P-A configuration slice

Status: requirements and item-specific STOPs, not an adopted machine capability contract. ENT-13A-P-A issued 18 October 2026, AMBER, based on main `b881f90be0a6d368838ca4392338147ef819bd3a`. Ben's 17 October answers, quoted in the dispatch and read from the answer file, govern made-up-data practice builds only. This piece recovers configuration and current requirements; no connector principal, route, migration, grant, importer or delivery service is introduced.

The controlling card is BUILD_PLAN.md §9.2 ENT-13a, with §§9.1.3, 9.1.8, 9.1.10, 9.1.13, 9.4 and 12.3. Operations, when released, are limited to work-order import, billing-status import, materials-issue import and delivery of an already authorised billing export. This list describes requirements; it is not an executable permission matrix. A connector cannot approve, price, create extras, confirm prompts, change origins or read statements. Required human billing export/import access is finance only (Ben 1, final sentence); older role cells at BUILD_PLAN.md:595–596,958 do not broaden it. This configuration piece changes no existing access implementation.

## Implemented configuration only (E13-A24 partial)

`parseConnectorEnvironment` in `@jobguard/config` validates a dedicated server-selected configuration object, never a request body or a whole process environment. Callers must select these fields explicitly; other fields are refused. There is no automatic environment reader or application composition in this change.

| Required field | Only accepted form |
|---|---|
| `CONNECTOR_CONFIG_VERSION` | `connector-environment.v1` |
| `JOBGUARD_ENV` | `synthetic_demo` |
| `CONNECTOR_ENDPOINT_KIND` | `fake` |
| `CONNECTOR_ENDPOINT_REF` | `fixture:` followed by lowercase letters, digits, underscores or hyphens |
| `CONNECTOR_CREDENTIAL_REF` | Same local fixture-reference syntax |

These are labels for fictional fixtures, not network addresses, real credential material or a selected external secret-store format. Their local syntax is a reversible implementation choice unrelated to the held security profile. No values are defaulted. Missing fields, unknown versions/fields, other environments, real endpoints, and request activation/authority fields produce the same `CONNECTOR_CONFIGURATION_INVALID` error, without input values or validation details. The returned copy is frozen and the input remains unchanged. Parsing does not fetch secrets, resolve references, authenticate a machine, contact an endpoint or enable a runtime operation. Even a valid fixture configuration cannot release held runtime work. E13-A24 application/HTTP proof remains HELD.

## Required identity and persistence (HELD)

Connection authority must fix tenant, environment and client contracts, with a distinct machine actor and any human sponsor recorded separately. Capabilities must be explicit, versioned, scoped, expiring and revocable; their actual fields, SQL signatures, role design and management authority await Q2/Q3. No human session substitution or reconstructed tenant context is permitted.

Source namespace and source event ID persist across channels, connections and rotation. A command binds operation, source, target and canonical semantic payload hash. Raw-byte hashes are separate diagnostics. Repeated identical authorised commands return the immutable first result; changed bindings conflict. Successful no-ops retain identity; refusals do not consume successful identities. Domain effect, receipt and audit must commit atomically. Runtime SQL must recheck authority before lifecycle disclosure and under lock; the six exact replay/refusal tests in the dispatch remain owed.

Work orders must reuse ENT-2 identity/revision/baseline pricing with no connector origin-write path. Whether broader import scope was intended is Q7, still held. Billing must wait for accepted ENT-6B #240 interfaces, then reuse its complete invoice composition, ordinary-line denominator, exact allocation, quarantine and cross-channel reconciliation. Unknown composition must never default to allocation wholly onto extras. Materials must wait for accepted ENT-8a persistence, then reuse its facts, source identities and same-job evidence; prompt confirmation remains a separate authorised command. No transport stand-in proves these persistence requirements.

## Outstanding releases

| Hold | Required evidence before implementation |
|---|---|
| Q2 / H1 | Ben's machine authentication, actor/context and restricted execution ruling; reviewed bridge and HTTP composition |
| Q3 / H2 | Ben's provisioning, widening, rotation, revocation and disconnect authority ruling |
| Q4 / H3 | Adopted signing bytes/algorithm, timestamp/skew/replay rules, rotation overlap, size limits, SFTP host/path and API destination/redirect profile; no numeric defaults chosen |
| Q5 prerequisite | Separately reviewed pinned SFTP implementation and external fake-server toolchain; no dependency change here |
| Reconciliation authority / H4 | Post-closure or post-revocation authority for already-attempted deliveries remains STOP; Ben 1.9 now requires refusal of non-live billing/corrections, including direct SQL and races |
| Q7 / H5 | Ben's work-order scope clarification; existing origin-write prohibition continues |
| ENT-6B #240 integration | ENT-6 #220 is merged: pure contracts and process-local fake adapters, receipt reports 30 passing cases. Any billing persistence read/write, key binding, allocation/quarantine consumption, artifact delivery or reconciliation waits for #240 acceptance and reviewed interfaces on main. Do not copy parked 0181, create substitute billing tables or treat mocks as persistence proof |
| ENT-8a integration | #219 is merged: supplied-fact contracts, completion rule (a), evaluation only. Actual materials schema, routine, keys and prompt commands remain required before integration |
| G5 | Capability-specific approval for every real endpoint, verified data flow and operational evidence; no production enablement in this build |

## Adopted practice requirements, not implemented here

- Ben 1.9: refuse billing/corrections on non-live jobs, under SQL and race checks; never mutate lifecycle to admit a fact. Same-time conflicting facts remain quarantined until explicit ordering exists; arrival time cannot supply it.
- Ben 2: duplicate dismissal, disputes over posted lines and mixed-sign statement approval require finance and recorded decisions. Connectors cannot decide them.
- Delivery approval uses the shortest lifetime allowed by the owning plan. If no exact bound is established, STOP that item; no invented duration.
- Human materials import is finance/owner only. Matching alone changes neither origin nor fee eligibility; machine delegation is still STOP.
- Contractor capability requires an active agreement; suspension refuses new work; capability loss retains authorised read-only old records. This grants no connector statement access.
- ENT-7 #238 is merged, reference-only (receipt reports 32 passing cases), without posting/billing-correction persistence. ENT-5/5b capture migrations 0157/0158 exist; they confer no machine authority.

No migration, backfill or grant change in A; no migration number reserved. Later authorised migrations use NEXT FREE, dispatcher-renumbered at merge, with a matching migration note under MERGE-CHURN-1. Preserve own-step upgrade proof and comparator negative controls; no runner/shared migration-document edit, fingerprinted-table column, human membership backfill, invented payment fact or destructive rollback.

Protected context bridges and source pins at apps/api/src/auth/context-boundary.test.ts:74–96 stay unchanged. Human work-order entrypoints require real membership: no substituted machine identity, forged tenant context, cookie impersonation or /auth/ bypass. Existing outbox ON CONFLICT DO NOTHING is not changed-payload conflict proof.

No UI, named-system adapter, real data/IdP/domain/credential/endpoint, spending, sending, deployment, fee/subscription/shadow implementation, retention/deletion change or release activation. D01/D02/D03/D08/D09/D16 and G5 stay closed. Any later new money/access rule beyond Ben's answers needs BUILD-DON'T-MERGE (decision 74), which cannot answer a STOP.

See [aggregate ledger](../ledger/ENT-13A-P.md) for E13-A01–A30 and item-specific STOPs. A24 is configuration-only; documentation and deterministic checks cannot close ENT-13a or replace an exact-commit independent verdict and separate acceptance.
