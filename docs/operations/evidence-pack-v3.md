# CH8-V source preparation and held runtime binding

Build-ahead only, synthetic data only. This change does not enable v3 pack
creation, attachment, download, a new UI, or a production capability. Existing
v1 storage, immutable bytes, verifier and UI retain their implementation.

`prepareEvidencePackV3Sources(pool, sessionId, caseId, requestId, ports)` is an
uncomposed DB source-preparation seam. The default ports always refuse. It:

1. Authenticates the actual persistent practice session before subject parsing.
2. Opens a repeatable-read, read-only tenant transaction; reauthenticates the
   session and current owner membership; derives the job from an owned case.
   The supported database is `jobguard_synthetic_demo` only. Adopted-job ownership
   follows the existing `practiceOwnedJobsSql` contract.
3. Stamps an immutable binding for that transaction object. A structural copy or
   a binding passed to a different transaction object cannot read sources.
4. Reads lock existence and ordinary sources in the same snapshot. If locked,
   stops at the held SV-5 port **before reading any source content**. This is not
   lock verification or a reveal. A later accepted adapter must consume the
   actual transaction-safe lock verification and published immutable bundle.
5. For an unlocked job, reads existing `loadEvidencePackSources` ordinary rows,
   exact stored original versions and hashes. Computes a deterministic visible
   source digest; no hidden table, detector, shadow pool or break-glass path is
   imported or queried. All UUID comparisons use canonical lower-case IDs.
6. Commits before requesting the worker check. Passes the server-derived identity,
   visible source revision and stable request ID to the request port. An opaque
   request reference is bounded; `readCompletion` must authenticate and require
   actual completed work or throw. This consumer method deliberately returns no
   candidate-dependent payload. It is not an installed producer contract.
7. After the wait, opens a new snapshot, reauthenticates and compares visible
   source revisions. A changed source conflicts; a racing lock stops at the held
   binding. A failed/unknown handoff is propagated, never retried with a new ID
   or interpreted as clear. No network call runs inside either transaction.

The returned ordinary bundle always says `producerBindings: held, complete:
false`. It is not a rendered artifact, authentic worker receipt, authorization,
settlement assertion or eight-section pack. No command receipt, audit event,
pack, approval, message or fee is written by this read-only preparation.

## Producer map and integration holds

| Section | Existing source / required binding | Current state |
| --- | --- | --- |
| lock | `FinalAccountLockRepository.read/verify`, exact immutable lock/cutoff and hashes | Public APIs exist; transaction-safe SV-5 bundle binding HELD |
| capture_snapshot | frozen lock snapshot and its capture-register hash | SV-5 mapping HELD; never substitute current variations |
| source_observations | every original observation/version/object hash and server receipt time | SV-5 published manifest/cutoff binding HELD |
| reconciliation | actual completed run and full evidence manifest | SV-5 binding HELD; no synthetic completed flag |
| reveal | controlled reveal plus published immutable source bundle | SV-5 binding HELD; `ShadowRepository.reveal` alone is insufficient |
| disposition | immutable confirmed catch/disposition identity | SV-5 binding HELD |
| attribution_revision | `RecoveryAttributionRepository.history`, `recoveryAttributionRevisionV1` | Accepted SV-6 storage exists; assessment source adapter itself remains dependency-bound. No fee/eligibility recalculation here |
| settlement | M4-8 receipt/line allocation/reversal identities with exact rational bases | Complete accepted export binding HELD |

`HOLD-EP-MUST-SURFACE`: no accepted worker-owned request/completion handoff was
found at the issued base. The default port throws before a successful source
preparation. No builder request invokes detection. Neither `FinalAccountLockView`
check status nor an arbitrary completion flag is an authentic pre-lock receipt.

`HOLD-EP-SV5-BINDING`: the order excludes the conflicting SV-5 candidate. The port
returns `Promise<never>` until accepted producer schemas and source semantics are
available. There is no speculative eight-section DTO or copying of its candidate.

`HOLD-EP-CHECKED-WRITER`: `app.write_evidence_pack_v3` and an unforgeable checked
binding are absent. `requireEvidencePackV3Writer()` always refuses. No fallback
uses the legacy runtime INSERT grants. Migration 0226 remains reserved and
unwritten: an authentic writer cannot be bound to missing producer schemas.
No role/grant/table is added and no owner changes.

CH8-A remains `binding: unbound-specimen`, even with an independently trusted
manifest digest. It cannot be made authoritative by these source reads. All eight
producer/source-section mappings remain owned by CH8-A's accepted binding step.
The CLI has not been changed; no deep package import is introduced at runtime.

## Existing HTTP surface

Generation and attachment approval accept additive strict v3 input shapes only
far enough to give an authenticated **409
`EVIDENCE_PACK_V3_DEPENDENCY_HELD`**. Authorization runs first; neither command
reaches the v1 writer or returns a successful v3 response. V3 generation requires
`format: TEXT` and the candidate `expectedVisibleSourceRevision`; approval binds
both exact hashes. Client tenant, actor, check status, clock, hidden metadata,
fees and settlement state are rejected. New v3 IDs canonicalise to lower case.

The existing Nest controller and both Next POST paths already share the same
application. Next error responses now explicitly use `Cache-Control: no-store`.
A dependency failure has no hidden-state details. The source preparation is
not called by HTTP until the producer, writer, binding and consumer holds clear.
List/inspect/download remain v1; no mixed-version runtime success is claimed.
The source seam cannot authorize a message or follow-up. H-PACK-CONSUMER and
version-dispatched storage/CLI/inspection remain integration gates.

## Verification and resumption

The receipt records executed commands. PostgreSQL and browser tests are CI-only.
The new PostgreSQL tests use a real runtime role and a case opened by the actual
recovery command. Ordinary supporting rows are inherited synthetic fixtures,
not a fresh shadow-30000 commercial journey. Injected worker ports are explicitly
contract tests; they never establish real producer completion or eligibility.
The isolation test captures actual client SQL and parameters, not nested
SECURITY DEFINER statements or HTTP timing. Twin disposable worlds, server query
logs, actual must-surface disclosure/ineligibility and the full catch-to-settlement
chain remain held, together with EP-B/EP-C aggregate acceptance.

Before enabling anything, bind accepted producers, implement the allocated
checked writer/upgrade proof, add authentic v3 storage dispatch and downstream
sink validation, then run all planned source/command/consumer/migration suites
and the full fresh journey in both browser projects. No hold is cleared by a
fixture, source inspection, green unit run or this builder's receipt. Require
independent exact-head reviews, CI and a separate acceptance actor.

## C261 catch-up onto accepted SV-5

The C261 catch-up supersedes the SV-5 candidate exclusion above. Preparation now
installs `createEvidencePackV3SourcePorts` after authentication. For a locked
owned case it closes the ordinary-source transaction before calling the public
`FinalAccountLockRepository.read/verify` and `FinalCheckRepository.read` APIs.
The reveal read receives the authenticated session digest and rechecks access.
No reveal call occurs without a lock and successful verification. Only a
completed reveal with that exact lock ID and a run ID satisfies the port; pending,
failed, forbidden and mismatched results never become a clear check.

Signature adaptation is entirely in CH8-V: the lock/reveal port takes its
server-derived scope rather than a transaction and returns the actual accepted
lock/reveal projections rather than `Promise<never>`. Producer APIs own separate
transactions. This does not establish one coherent eight-section source snapshot,
manifest inventory, disposition export, attribution or settlement mapping.
After a successful binding, preparation still refuses with internal
`HOLD-EP-SECTIONS` and the unchanged public dependency-held code. Before lock,
the existing ordinary-only and held must-surface path is unchanged. The HTTP
writer, must-surface producer, section bindings and downstream consumer gates
remain held. No database, grant, worker registration or external action changes.

## CH-8 part 2 preparation (28 October 2026)

The ch8-rest implementation prepares an additive `?version=3` read and queued v3 generation/approval. Runtime
requests never obtain shadow credentials. Existing held preparation APIs remain compatibility-only;
the new worker repository owns the assembled path. The checked writer binds exact database material,
canonical envelope, source bytes and hashes. An order made before lock remains ordinary-only even
if the lock completes before processing. The worker runs the deterministic must-surface reader/sink
before issuing a completion receipt; failures produce no artifact. A later source change refuses the
write/approval. Post-lock sections come from persisted producer records via the worker login only.

Part 2 is ready as preparation with runtime creation refused. The public SV-6 attribution producer
is still dependency-bound on this base; the required fresh shadow-30000 settled-catch/browser journey
is missing. See `docs/verdicts/CH8-REST/BUILDER_RECEIPT.md`. Specimens, storage fixtures and a matching
externally supplied digest do not replace producer acceptance or independent RED review.

## Router-scoped part 2 activation boundary (28 October 2026)

This supersedes the earlier draft readiness wording: part 2 is preparatory implementation; the
fresh shadow-30000 source-to-settlement/UI/verifier journey belongs to part 3 after the SV-6
runtime hookup. While assessment is unbound, v3 generation and approval refuse with
EVIDENCE_PACK_V3_DEPENDENCY_HELD in the authenticated application, SQL request and SQL writer
boundaries. No runtime pack is created with absent or invented attribution/settlement sections.
Queued work from an older deployment cannot bypass the writer refusal. Pure assembly specimens
and source preparation do not activate runtime creation. v1 behaviour is preserved.

## CH-8 part 3 activation candidate

After 0375, authenticated synthetic owners can queue v3 generation and exact-hash approval from the
existing lock/reveal pack panel. The existing worker discovers identifier-only requests and builds
from current private material. The synthetic database/session/track/terms checks still apply.
The older preparation-only APIs above retain their held compatibility behavior.

The fresh shadow-30000 CI journey uses controlled source/classifier fixtures and actual commercial
writers, then UI requests, worker execution, download and the offline verifier. No settled end-state
or pack is seeded. Its unsupplied checkpoint remains untrusted in both UI and CLI. SQL byte-parity,
upgrade, isolation and browser execution are CI evidence still required before independent RED review.
No new alerts, providers, environment keys, external sends or fee collection are introduced.
