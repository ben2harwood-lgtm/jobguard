# ENT-13A-P aggregate ledger

18 October 2026; base `b881f90be0a6d368838ca4392338147ef819bd3a`. Only A is issued, AMBER. ENT-13a server/database acceptance remains HELD; no roadmap completion credit. Practice builds use made-up data only.

## Dependencies and ordered pieces

| Piece | Status / prerequisite |
|---|---|
| A configuration/requirements | Implemented; execution evidence in ENT-13A-P-A receipt; independent exact-commit verdict and separate acceptance outstanding |
| B machine authority | STOP Q2–Q4; RED; decision 74 if beyond Ben's answers |
| C work-order ingestion/replay | HELD after B and Q7 resolution; reuse merged ENT-2 |
| D materials ingestion | HELD after B/C and accepted ENT-8a persistence |
| E billing ingestion | HELD after B–D and accepted ENT-6B #240 interfaces on main |
| F fake delivery/transports | HELD after E, security/toolchain decisions and delivery-reconciliation authority |

ENT-6 #220, ENT-7 #238 and ENT-8a #219 are merged foundations, not absent dependencies: respectively pure billing contracts/adapters (receipt reports 30 cases), reference fee foundations (32 cases), and supplied-fact completion rule (a)/evaluation. They do not supply billing or materials persistence. Capture migrations 0157/0158 are present without machine authority. No parked ENT-6B implementation was copied or verified.

## Preserved acceptance assertions

The 13 October finisher's E13-A01–A30 assertions and proposed evidence are retained below. Status is per assertion, not aggregate credit. Ben's newer rules govern: A08 cannot order same-time conflicts by arrival; A16's historical evidence suggestion to restore lifecycle is superseded—never mutate lifecycle to admit a billing fact. Future tests must exercise refusal without that workaround. A27 uses NEXT FREE migration plus note and own-step upgrade proof, not obsolete registration instructions. No new PostgreSQL test is applicable to A.

| ID | Preserved assertion | Proposed full-piece evidence (not executed by A) | Current status |
|---|---|---|---|
| E13-A01 | All four operations have strict versioned boundaries. Unknown versions, extra authority fields and unsupported operations fail before effects. | `connector-contracts.test.ts`; `connector.http.test.ts` | HELD — future released sub-order; no implementation/test execution in A |
| E13-A02 | Connection authority determines tenant/environment/contract scope. Supplying another tenant, human actor or forged mode never changes it. | `connector-principal.integration.test.ts`; real HTTP tests | HELD — future released sub-order; no implementation/test execution in A |
| E13-A03 | Machine authority is rechecked by SQL. Missing, expired, revoked or narrowed capability refuses both new work and replay. | `connector-principal.integration.test.ts`; direct runtime SQL and revocation race | HELD — future released sub-order; no implementation/test execution in A |
| E13-A04 | Connectors cannot approve, price an extra, raise an extra, confirm a prompt, write/change an origin or read statements. No human-role impersonation or role escalation works. | `connector-principal.integration.test.ts`; actual SQL calls/grants and HTTP refusal matrix | HELD — future released sub-order; no implementation/test execution in A |
| E13-A05 | Allowed work-order imports retain ENT-2’s identity/revision/no-fee semantics and server-derived baseline prices. A failing row commits no partial order. | `connector-ingestion.integration.test.ts`, calling the actual shared import path | HELD — future released sub-order; no implementation/test execution in A |
| E13-A06 | Billing CSV, webhook and API events use ENT-6’s source identity and reconciliation. Same event/same payload has one effect; changed payload conflicts. | `connector-ingestion.integration.test.ts`; concurrent cross-channel tests | HELD — future released sub-order; no implementation/test execution in A |
| E13-A07 | One payment delivered through different channels or connections is allocated once when reconciliation identity proves sameness; ambiguity is durably held. Complete non-extra invoice lines remain in allocation. | `connector-ingestion.integration.test.ts`, inspecting actual ENT-6 facts/quarantine/allocations | HELD — future released sub-order; no implementation/test execution in A |
| E13-A08 | Reordered billing facts are held/applied by ENT-6 and converge to the same projection. The connector does not infer settlement or invent missing invoice composition. | Permutation/property cases in `connector-ingestion.integration.test.ts` | HELD — future released sub-order; no implementation/test execution in A |
| E13-A09 | Materials use ENT-8a’s schema, source identity and routine. Repetition creates no duplicate material effect/prompt; wrong-job citations fail. No shadow table or automatic confirmation is used. | `connector-ingestion.integration.test.ts`, inspecting actual materials/prompt records | HELD — future released sub-order; no implementation/test execution in A |
| E13-A10 | Malformed, duplicate, reordered, replayed and oversized inputs have deterministic bounded outcomes. Broken envelopes create no domain effect; validly received domain ambiguity follows the owning quarantine policy. | All transport contract tests and `connector.http.test.ts` | HELD — future released sub-order; no implementation/test execution in A |
| E13-A11 | HMAC is checked against the adopted exact byte binding. Invalid signature, altered bytes, wrong/unknown/revoked key, expired timestamp and unacceptable clock skew fail. Accepted boundary cases are explicit. | `connector-webhook.test.ts`; raw HTTP requests in `connector.http.test.ts` | HELD — future released sub-order; no implementation/test execution in A |
| E13-A12 | `replaying a command id returns the first result, never the job's current state` | Exact named test in `connector-replay.integration.test.ts`; advance real domain state between first call and replay | HELD — future released sub-order; no implementation/test execution in A |
| E13-A13 | `the same command id with a changed payload conflicts` | Exact named test; first receipt/result/domain rows preserved | HELD — future released sub-order; no implementation/test execution in A |
| E13-A14 | `the same command id on another job conflicts` | Exact named test; principal valid for both jobs, removing permission ambiguity | HELD — future released sub-order; no implementation/test execution in A |
| E13-A15 | `a successful no-op keeps its identity` | Exact named test; persisted unchanged result survives restart and repeated calls | HELD — future released sub-order; no implementation/test execution in A |
| E13-A16 | `a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written` | Exact named test for live-required ingestion; no receipt/domain/audit write, then same command succeeds once after controlled live restoration | HELD — future released sub-order; no implementation/test execution in A |
| E13-A17 | `an unauthorised caller gets the identical CONNECTOR_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job` | Exact named PostgreSQL test plus HTTP status/body/code assertion; no lifecycle disclosure | HELD — future released sub-order; no implementation/test execution in A |
| E13-A18 | Authority/lifecycle changes between initial check and final write are rechecked under lock. Competing identical events produce one result; changed bindings conflict. | `connector-replay.integration.test.ts` with controlled transaction barriers | HELD — future released sub-order; no implementation/test execution in A |
| E13-A19 | Export delivery uses the exact authorised ENT-6 artifact, endpoint, hash and effect identity. Revision, recipient or artifact substitution fails. | `connector-delivery.integration.test.ts`; SFTP/API contract tests | HELD — future released sub-order; no implementation/test execution in A |
| E13-A20 | Attempt claim commits before the adapter call. Domain/audit/receipt failures roll back together; network calls never occur inside a business transaction. | `connector-delivery.integration.test.ts`; executor instrumentation | HELD — future released sub-order; no implementation/test execution in A |
| E13-A21 | Acceptance followed by a lost reply records `outcome_unknown`. Restart/retry does not resend it. Reconciliation records success, safe absence or continuing uncertainty against the original identity. | `connector-delivery.integration.test.ts`; fake-server interruption cases | HELD — future released sub-order; no implementation/test execution in A |
| E13-A22 | Rotation preserves source/event identity. Revoked credentials fail immediately under the adopted policy; queued execution rechecks current authority. | `connector-principal.integration.test.ts`; webhook/SFTP/API tests | HELD — future released sub-order; no implementation/test execution in A |
| E13-A23 | Secret values, raw authorization headers, resident contacts and source bodies are absent from logs, typed errors, audit payloads, receipts and exported diagnostics. | Canary assertions in application, HTTP and transport tests | HELD — future released sub-order; no implementation/test execution in A |
| E13-A24 | Missing secrets/configuration and real endpoint configuration fail closed in the synthetic build. Request flags cannot unlock a real route. | `connector-environment.test.ts`; `connector.application.test.ts`; HTTP tests | PARTIAL — 32 configuration cases EXECUTED/PASS; application/HTTP and secret lifecycle HELD |
| E13-A25 | New tables have correct owner, RLS, FORCE RLS, qualified FKs and exact grants. Runtime cannot directly write protected tables or call private helpers. Connector access cannot enumerate other tenants/contracts. | `connector-catalog.integration.test.ts`; actual runtime and machine-role denial tests | HELD — future released sub-order; no implementation/test execution in A |
| E13-A26 | Pool reuse cannot retain another tenant. Same-tenant wrong-job/contract/artifact links are rejected. Results persist through a fresh service and connection. | `connector-principal.integration.test.ts`; `connector-ingestion.integration.test.ts` | HELD — future released sub-order; no implementation/test execution in A |
| E13-A27 | Fresh install and rule-9 upgrade pass. Existing rows/history survive; comparator negative controls fail as intended; later migrations run successfully twice. | `connector-upgrade.integration.test.ts`; unchanged fingerprint/tenancy/bootstrap suites | HELD — future released sub-order; no implementation/test execution in A |
| E13-A28 | Nest and thin Next adapters invoke the same service and preserve schema, identity and errors; raw signatures survive transport composition. | `connector.http.test.ts`; `connector-routes.test.ts`; generated OpenAPI check | HELD — future released sub-order; no implementation/test execution in A |
| E13-A29 | Data-flow and operational records identify fakes, credential lifecycle, unknown-outcome handling, alerts, kill switch and unresolved gates without asserting approval. | Exact-commit independent source review and builder receipt | PARTIAL — documents updated; exact-commit independent review HELD |
| E13-A30 | Earlier tests/pins/fingerprints remain unchanged and mandatory regressions pass. No UI, fee, subscription, shadow or named-system implementation enters the diff. | Diff inspection, unchanged regression suites, lane check and independent verdict | PARTIAL — preservation/check results in A receipt; CI and independent verdict HELD |

## Item-specific STOP register (before / after)

These are documentation dispositions only. Each location identifies the updated requirement; no stopped implementation was attempted. Other A work continued.

- `docs/contracts/connector-capabilities-v1.md:33` — before: Machine authentication, genuine tenant-context issuance, SQL privileges and sponsor/delegation unanswered. After: STOP; no principal, context bridge or grants.
- `docs/contracts/connector-capabilities-v1.md:34` — before: Provision/widen/rotate/revoke/disconnect authority unanswered. After: STOP; no management path.
- `docs/contracts/connector-capabilities-v1.md:35` — before: Signing/freshness/replay/overlap/host/path/destination/security limits unanswered. After: STOP; no production policy in fixtures.
- `docs/contracts/connector-capabilities-v1.md:38` — before: Broader work-order import conflicts with origin-write prohibition. After: STOP; no client-instructed extra creation.
- `docs/contracts/connector-capabilities-v1.md:37` — before: Old Q6 combined late billing and uncertain delivery. After: Non-live billing refusal adopted from Ben 1.9; post-closure/revocation delivery reconciliation remains STOP.
- `docs/contracts/connector-capabilities-v1.md:39` — before: Old ENT-6 foundation mistaken for persisted billing prerequisite. After: STOP billing persistence/key/allocation/quarantine/artifact integration until accepted #240 interfaces.
- `docs/contracts/connector-capabilities-v1.md:40` — before: Old document said ENT-8a wholly absent. After: Foundation merged; STOP materials integration until accepted persistence.
- `docs/contracts/connector-capabilities-v1.md:47` — before: Shortest lifetime selected, exact bound not established here. After: STOP duration choice; no guessed expiry.
- `docs/contracts/connector-capabilities-v1.md:54` — before: Protected-source edits or altered merged test expectations not issued. After: STOP such edits; pins, guards, existing tests and dependency pins unchanged.
- `docs/contracts/connector-capabilities-v1.md:56` — before: Money/access beyond answers, child-safety, real data, spending, deletion/retention and outward actions unissued. After: STOP each such item; no such implementation.

The dispatch's exact JSON example included its own lane path. The dispatch's explicit “lane file may not list itself” and tools/agent-lane-boundary-lint.mjs:31–35,63 require excluding it. Before: self-grant in draft allow list. After: only that entry omitted; the branch retains implicit ownership of its lane file. No legacy register edit.

Migration/backfill/grants: none. Later migrations need an issued lane, next free number and matching note; preserve MIG-ORDER-5 own-step proof, reviewed tenant-qualified side tables, append-only history and forward fixes. No production gate or authority is inferred from this ledger.

## Verification STOPs discovered in A

- `tools/agent-lane-boundary-lint.mjs:303` — before: `LANE_BASE_REF=origin/main pnpm lint:lanes` and root lint expected to execute. After: both refuse self-comparison because uncommitted HEAD equals origin/main; leave checker unchanged and require dispatcher/CI rerun after commit. Supplemental working-tree path check passed, not a range-check pass.
- `packages/core/src/jobs-on-the-go.test.ts:156`, `recovery-allocation.test.ts:190`, `site-extra-pricing.test.ts:140`, `subscription-architecture.test.ts:10` — before: existing tests unchanged. After: root test command also discovered their compiled dist copies, which fail reading adjacent .ts files; STOP changes to existing tests/tooling outside lane.
- `packages/core/src/receipt-allocation.test.ts:125,212,222` — before: unchanged 5-second test limit. After: source and compiled copies timed out in root run; no timeout or assertion weakened. Diagnostic bounded-worker rerun recorded in receipt.

All A implementation and documentation continued despite these item-specific holds.
