# Simulation fee statement: independent representation v1

Status: pure representation implemented; issuance, persistence, delivery and full server acceptance HELD. This document does not define a working command or approval/source interface. Decision 74 permits stacked preparation on M4-9-S `04fea7be692d9ea254a6ff62238cc68c43663adb`; dependency merges are still outstanding.

`packages/core/src/simulation-fee-statement.ts` exports `simulationFeeStatementDocumentV1`, `SimulationFeeStatementDocument`, `SimulationFeeStatementError` and `formatSimulationFeeStatement(unknown)`. The schema parses representation data only. Nothing in this module authenticates, authorizes, derives entitlement, assigns identifiers/numbers, issues a statement or proves a source exists. It must not be wired directly to client input. A future server consumer must construct it from authenticated, tenant/job-qualified, immutable persisted facts through the approved command lifecycle.

| Field | Representation |
| --- | --- |
| `version` | `simulation-fee-statement-document.v1` |
| `statementId`, `number` | Supplied UUID and nonempty display text, at most 80 characters; no allocation, prefix or correction-numbering policy implemented |
| `environment`, `policyVersion` | Exactly `synthetic_demo`, `reference_fee_policy_v3` |
| `qualifyingPrincipal` | Q as exact rational pence with decimal integer strings; existing `exactPenceV1`/`parseExactPence` validation, nonnegative and within the existing money magnitude limit; no reduction or rounding |
| `cumulativeFeePrincipal` | Supplied F as nonnegative GBP Money |
| `documentPrincipal` | Supplied signed GBP principal, including negative correction examples |
| `postingHistory` | Ordered documentary journal UUID/principal pairs, at most 10,000; signed history is preserved, never summed into F |
| `original` | Nullable original document UUID/SHA-256 representation; no relational/linkage or compensation authority is established |
| `settlementHistory` | Exactly `{ state: 'integration_unavailable', dependency: 'M4-12-S' }`; no collected, paid, outstanding or refund facts inferred |
| `warning`, `vatLabel`, `sandboxLabel` | Exact literals below |

Money uses the existing `money()` validator and its magnitude limit of ±1,000,000,000,000 pence. Unsafe integers, fractions, other currencies and excess magnitudes fail. UUIDs and lowercase 64-character hexadecimal hashes are syntactically checked. Every object is strict; unknown nested or top-level fields fail, including tenant/actor/mode, price, settlement claims, v1 base/cap/credit-used fields, tax amounts and subscription offsets. Invalid input produces `SimulationFeeStatementError` with code `INVALID_SIMULATION_FEE_STATEMENT`.

Required labels:

- `Simulation statement — proposed policy, principal only; not a tax invoice or real amount due`
- `VAT not calculated`
- `Practice sandbox — synthetic data; nothing is sent or charged`

The formatter returns a parsed `document`, `canonicalJson`, UTF-8 `bytes`, `byteLength` and separate `documentHash`. Canonical JSON sorts object keys by ECMAScript code-unit ordering, preserves array order and rational strings, uses JSON escaping and numeric encoding, and has no whitespace, BOM or trailing newline. SHA-256 covers those exact UTF-8 bytes using the existing portable SHA-256 implementation; the current document hash is outside its bytes. A correction's original-document hash, when supplied, is ordinary represented content. The output is an in-memory representation, not an immutable issued record or saved download.

The formatter copies validated inputs and has no database/provider/payment ports. It preserves F even if supplied reference facts disagree with Q: calculating or validating entitlement belongs to M4-9-S. The £2,820 / £282 example preserves £32 and £250 history without adding it to £282. A separate pure example represents −£250 document principal and £32 cumulative principal with an original-document reference; it does not execute negative compensation. These are synthetic object fixtures, never evidence of a persisted approval, journal or correction.

## Held interfaces and completion

Q1: successive positive statements, supersession/supplementation and collectible balance semantics remain undecided. Q2: exact approved artifact, issuance/correction command schemas, source manifests, approval/source binding, numbered persistence, namespace allocation, replay, audit, repository, Nest/Next transports and saved downloads remain unbuilt. No guessed M4-9-S source columns or approval contract are exported here.

Migration 0219 (C259) is reserved by the dispatcher but neither created nor registered: number assignment does not release Q2. No namespace is created. Namespace scope, prefixes and correction numbering must be coordinated with MON-2A under Q3/Q7 before the held persistence work. No new database objects, grants, catalogue entries or mutation registry actions are introduced, so existing catalogue freezes remain unchanged.

Source-backed integration remains DEPENDENCY-BOUND on M4-9-S/SV-6/SV-5 and their merged authoritative proof path. M4-8-S alone owns allocation; this module imports its shared exact-value representation and does no allocation. Non-catch qualification and negative-compensation execution are held; M4-12-S owns future authoritative fee settlements. Customer receipts and v1 payments are not v3 fee settlements. Screens and browser assertions remain parked under Q8. D01/D02 remain proposed; no production, tax or collection authority follows from this document.

FS-01/03/06/07/18 have independent pure coverage only. FS-22 has a builder run receipt only; exact-commit independent verdict and separate acceptance remain owed. All dependent assertions in those IDs and full FS-02/04/05/08–17/19–21 remain held. The complete plan card stays open.
