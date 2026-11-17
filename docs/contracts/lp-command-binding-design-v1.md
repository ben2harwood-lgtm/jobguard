# LP-4 to LP-6 design note: commands, audit and the actor binding, version 1

**Status: PROPOSED — needs review.** Design preparation required by BUILD_PLAN section 11.8 ("Design and inventory before cutover"), written by the LP-0 builder. **It is not an implementation, not a settled mechanism and not yet independently reviewed.** Independent review of this note must be recorded **before LP-5's interface is fixed and before LP-6a is coded** (LP0-20). Passing the LP-0 catalogue guard says nothing about whether this design is right.

**Review record:** *none yet.* (To be filled by the reviewing actor, bound to the exact commit of this file. A builder cannot fill it in.)

**Authority:** this note proposes contracts and recommends table-backed storage for review; it approves no interface, mechanism or policy. Where a choice remains open it is listed under "Unresolved decisions". No fee, tax, owner-creation/removal, safety or revocation policy is proposed or changed.

## 1. The problem in plain words

Today the application's database login can write the rows that say *who someone is*, *who approved what* and *what was done*. A stolen or misused database password could therefore forge an owner, an approval, a receipt or an audit record without going through the checks the product code performs. LP-4 to LP-6 move those writes inside the database, behind routines that check for themselves, and make the database know who is acting instead of trusting a name the caller supplies. LP-0 only lists what exists; this note prepares how the later pieces should be shaped.

## 2. Four checks that must stay separate

| Check | Question it answers | Established by | Stored as | Must not be mistaken for |
|---|---|---|---|---|
| **Validated identity** | Who is acting? | The existing reviewed authentication boundary (session or practice credential), then the protected binding (LP-6a) | The bound actor and tenant for this transaction | A request field, a caller-set setting or a `p_actor` argument alone |
| **Resource permission** | May this actor do this operation on this tenant, job or resource now? | A routine reading current membership, role and assignment (decided member/contractor permissions) | Nothing durable; a refusal or a pass | Identity (a valid person may have no permission), or owner status |
| **Exact approval** | Did the right person approve exactly these terms? | The approved decision and its authorization, bound to the operation's decided significant terms, single-use or explicitly scoped | `decision_resolution` and `action_authorization` rows | A processing receipt, or "the caller is an owner" |
| **Committed result** | What really happened and is it final? | The business mutation, its terminal receipt, required audit and outbox rows committing together | Receipt completion, business rows, audit and outbox | A request, an approval or a "processing" claim |

Today these are partly blended: the dispatcher claims the receipt, writes the resolution and authorization, performs the mutation, writes the audit and completes the receipt with separate direct writes (`packages/db/src/commands.ts`; inventory path `ap-command-receipts`). A receipt plus an owner is not a distinct approval; completion must not certify success without the committed mutation.

## 3. Present direct writers and their conversion groups

**29 October 2026 gap update:** inspected `origin/main` at
`fe80add539fc9f97028b90420918d16759f636ee`. The earlier note already covered the
four checks, broad conversion groups and unresolved choices. The additions below
supply candidate contracts, a storage recommendation, failure cases and the
[downstream-effect source inventory](lp-downstream-effects-v1.md). That appendix
includes every explicitly declared table/view/routine found in the migration
sources plus LP-0 recorded objects, overloads and trigger edges. It deliberately
includes historical candidates; current reachability and dynamic paths require
PostgreSQL proof at the implementing card. Neither this source inventory nor its
family assignments replace the reviewed LP-0 capability freeze.

Current direct receipt writers found in `packages/db/src` include `commands.ts`,
`commercial-integrity-application-repository.ts`, `demo-bootstrap.ts`, and the
`variation`, `extra`, `extra-approval-chain`, `recovery-follow-up`,
`prevention-check`, `site-visit`, `inbox-relevance`, `job-parties`, `proof` and
`recovery-message` repositories. Source search is a lower bound: checked SQL
writers (for example `app.cb_begin`, `app.cb_complete`, `app.lp_command`,
`app.mon2_command` and `app.sv7a_intake_job_source`) also own receipts. LP-5b must
convert or demonstrate compatibility of these and later writers, not rely on the
proposal's original count of nine.

Source-inspected on the landing base (text search for the table name in `packages/db/src`; a hypothesis to be re-traced when each card is built, not a complete or authoritative list).

| Direct write today | Writers found | Converted by |
|---|---|---|
| `command_receipt` INSERT and status/result/completed_at UPDATE | `commands.ts` (dispatcher), and repositories `contractor-party`, `contractor`, `inbox-relevance`, `extra`, `job-parties`, `practice-invoice`, `prevention-check`, `proof`, `purchase-order`, `recovery-follow-up`, `recovery-case-terms`, `recovery-message`, `site-visit`, `site-extra`, `variation`, `work-order`, `watchdog`; the demo seed/bootstrap | LP-5a (dispatcher), LP-5b (all others, plus later merged writers), LP-5c (revoke) |
| `decision_resolution` and `action_authorization` INSERT, `revoked_at` UPDATE | `commands.ts`, `decision-repository`, `outbox`, `proof-repository`, `recovery-follow-up`, `recovery-message` | LP-5a / LP-5b, closed at LP-5c |
| `audit_event` INSERT and head routines | more than thirty repositories (every `appendAudit` / `appendAuditBatch` caller found by text search) and owner-side writers (`append_final_lock_audit`, `append_shadow_audit`, `identity.sso_audit_append`, the follow-up and shadow-detection routines) | LP-4 (append inside the database), LP-6e (actor stamping) |
| Ordinary job INSERT and `transition_job` | job and import repositories, fixtures | LP-2 |
| Money, evidence, outbox tables | billing, final-account, evidence, outbox repositories | LP-8a / LP-8b |

Landing groups follow section 11.8: LP-4 lands writers, verifier and grant withdrawal together; LP-5 converts every caller before it revokes; no partial group is described as secured.

## 4. Lock order

Proposed sequencing: binding lookup; operation-specific existing authority and
resource locks; claim/check receipt in that operation's established order;
exact approval and domain mutation; prepare terminal result and approved outbox;
then append/seal audit as the **last contending lock**. The receipt is already
locked before audit. Completion may update that already-held receipt afterwards
only if it takes no new business lock; otherwise terminal staging precedes audit
and a deferred consistency check rejects a commit missing its audit. Preserve
existing lock orders rather than imposing one universal order: `commands.ts`
allows `handler.lock` before receipt claim, while other repositories claim first.
LP-5a must demonstrate compatibility with membership foreign-key locks,
contractor/watchdog deferred triggers and shared aggregate advisory keys. No
receipt lock, new outbox uniqueness wait or deferred trigger business lock may
first appear after the audit head. Binding reads must not lock membership/session
rows in an order that conflicts with later work; any binding-table insert uses a
private transaction key, not a shared business lock.

The existing contracts (`extra-unlink-v1.md`, `site-visit-v1.md`,
`prevention-checks-v1.md`) and `watchdog-lock-order.integration.test.ts` supply
the backstops. Moving append into SQL preserves them. Review every owner-side
writer, deferred trigger and completion adapter; do not infer lock compatibility
from source order alone.

## 5. Checked command lifecycle (LP-5a)

Sketch only: `begin_command(p_actor, p_tenant, command_type, idempotency_key, input_digest)` and `complete_command(receipt, result_ref)`.

- **Begin** claims the receipt, or returns a permitted replay, or refuses. Unknown command types are refused. The per-command role rule is the decided one, not a new one.
- **Replay** is permitted only to a caller who still has current access, returns the first result (never current state), and discloses nothing belonging to another actor. The same key with a different payload, or on another job, conflicts. A successful no-op keeps its identity.
- **Complete** certifies success only with the committed business mutation present in the same transaction (a deferred check, not a promise). Failure before completion leaves a refusable, retryable state; stale "processing" claims have an explicit disposition.
- **Authorization** is created and consumed by checked routines: single-use, or explicitly scoped to a defined multi-step operation, bound to principal, tenant, resource and the decided significant terms.
- Tests: cancellations, errors, concurrent duplicates, stale processing, failure before completion, and that mutation, terminal receipt, trusted audit and required outbox commit consistently.

## 6. Existing contractor and member permissions are preserved

Operations are not made owner-only. Contractor write routes stay registered `pre_live_allowed` with their own live-job guard, and the merged B-prime behaviour keeps its six named properties (replay returns the first result, changed payload conflicts, same id on another job conflicts, a successful no-op keeps its identity, a not-live job is refused with `JOB_NOT_LIVE` and nothing written, and an unauthorised caller gets the identical `EXTRA_FORBIDDEN` for unknown, foreign, not-live and live jobs), proven in `site-extra.integration.test.ts`. ENT-3a's distinctions stay: site logging by operatives, supervisors and surveyors; office recording by finance, admins and owners; client instructions by commercial managers, admins and owners. Authority-first refusal is preserved.

## 7. Binding: threat model and credential treatment (LP-6a)

Four attacker positions must stay distinct; the claim in LP-9 is bounded to the first.

1. **Possession of the business database password.** Goal: manufacture owners, approvals or trusted history, bypass checked money operations or the tenant boundary. This is what LP-1 to LP-11 target.
2. **A captured, still-valid session** (browser or token). Remains a risk: the binding cannot tell a stolen live session from its owner. Expiry and revocation shorten it.
3. **Takeover of the API or identity process.** That process can request a binding for any session it can read; it must not hold owner credentials, and workers (LP-10) must not inherit the web login's powers.
4. **Administrator power** over the database or deployment. Out of scope; recorded, not mitigated.

Credential treatment: a usable session digest is a credential; keep it out of logs, receipts and error text. The credential's real/practice kind is looked up in trusted session records so a practice credential can never bind a real-data owner. Pool reuse, rollback, savepoints, backend reuse, concurrent rebinding and replay or substitution of a signed context are tested before dark release.

## 8. Dark rollout and compatible cutover

Expand-compatible rollout stays decided (C4). Order: (1) bind_request, protected transaction store and `current_actor` / `current_tenant` merged **dark** (nothing enforces); (2) callers pass the binding in addition to existing arguments; (3) routines compare `p_actor` / `p_tenant` with the binding, parameters retained for caller compatibility (LP-6c, LP-6d); (4) enforcement flips; (5) old signatures are withdrawn in the same migration as their replacement or are named for closure (R3). Scanner and source-pin changes for `withTenant` and the bridges (LP-6b) are coordinator-owned and need Ben's typed yes; this note proposes none.

## 9. Binding storage: proposed table-backed choice, pending review

| | Table-backed binding | Transaction/environment-bound keyed signature |
|---|---|---|
| Idea | A protected table row keyed by backend/transaction, written by a narrow owner routine | A keyed signature over (session reference, tenant, actor, transaction id), verified by a narrow routine, key held outside the business login |
| For | Simple to reason about; revocable by row; easy to audit | No row writes per request; harder to replay across transactions if the transaction id is covered |
| Against | A write and a lock per request; the lookup must not create a circular RLS dependency or break the audit-last lock order | Key custody and rotation; a captured signature within its transaction; needs a trusted verifier that the login cannot call with chosen inputs |
| Open questions | Who may write the row; cleanup; savepoint behaviour | Where the key lives; what the transaction identifier binds; behaviour under pooling and `SET LOCAL` reuse |

Neither a plain setting nor a caller-selected actor is authority. **Recommendation
for review: table-backed binding**, to avoid adding signing-key custody and
rotation before the database can verify the existing trusted session records.
This is a candidate choice, not LP-6a approval. Exact owner/grants, cleanup,
revocation linearization and worker composition must be reviewed before coding.

Candidate row identity combines the current database/environment identity, backend
identity and full transaction identity; a PID alone, a wrapped transaction ID or
caller-set nonce is insufficient. `bind_request` derives that key internally,
looks up the credential in trusted real/practice records, checks expiry,
revocation, live membership and tenant, and writes an immutable binding under a
narrow NOLOGIN owner. Caller actor/tenant fields may only be consistency checks.
Same credential/transaction rebinding is idempotent; another actor/tenant/kind in
the transaction is refused. Runtime/worker cannot read or write the table, assume
its owner, or invoke a helper that chooses arbitrary rows. `current_actor` and
`current_tenant` return only the current transaction's validated binding, with no
arbitrary-tenant lookup API or circular dependence on tenant RLS.

Candidate lifecycle: commit makes the old row unusable because the next transaction
has a different full identity; rollback removes it; rollback to a savepoint before
binding removes it and subsequent access fails closed until a fresh valid bind.
A savepoint after binding cannot substitute identity. Cleanup uses a restricted
administrative path, never grants runtime deletion, and cannot make a stale row
valid again. Connection/backend reuse and restored databases must not resurrect
bindings: restore starts with binding/session authority disabled until LP-9's
restore/credential checks pass. Bind before the first tenant query in every request
transaction, including reads. No session digest, raw token or reusable binding
credential belongs in audit, receipts or errors.

The alternative keyed signature must cover version, key identifier, trusted
database/environment identity, backend/full transaction identity, credential
reference/kind, actor, tenant and expiry, with domain separation and unambiguous
encoding. A narrow issuer first validates the actual credential; it must not sign
chosen actor/tenant input. Verification cannot accept an old transaction,
other database, altered field, unknown/retired key or unauthenticated setting.
Key rotation and storage are additional reviewed deployment requirements. Both
options need current-session and permission checks at the appropriate operation
boundary; neither makes an existing approval or receipt sufficient authority.

## 10. Narrow chokepoints and role assumption

New sensitive chokepoints (bind, begin/complete command, audit append, money) are owned by narrow no-login roles that hold only the grants and helpers they need (LP-12 for the relevant older money routines). Review rules: fixed trusted `search_path` with `pg_catalog` first and `pg_temp` explicitly last, and no reliance on temporary objects; schema-qualified references; no dynamic SQL built from caller text; specific EXECUTE grants with PUBLIC and other roles revoked; no membership or SET ROLE path from the runtime or worker login to the owner (the LP-0 guard fails any such path). Schema-owner execution is not assumed to be protected by RLS. Open hypothesis recorded by LP-0: PUBLIC TEMPORARY lets the application login create temporary tables; reachable definers pin `search_path` but do not list `pg_temp` last (see inventory gaps).

## 10a. What an LP-0 inventory entry means for these cards

Every capability the login holds today is a reviewed existing exception with a closing card (see `lp-0-effective-privileges-v1.md`). A card is done only when its exceptions are gone **and** a behavioural test shows the refusal as the real role, paired with an authorised positive case and a committed-state check. The catalogue guard supplies the "grants did not grow" half; it never proves a routine is safe.

## 11. Worker separation and later read/write RLS binding

LP-10 gives the worker its own role and secret; it derives actor and tenant from the valid authorized action (rechecking authorization under existing revocation rules), not from supplied fields. The web login must not bind, claim or complete worker actions; the worker must not manufacture authorization. Audit records separate the executing worker from the authorizing user. LP-11 converts RLS policies from the caller-set tenant setting to the protected bound tenant for reads, inserts and updates (visibility and proposed-row checks), reviewing permissive alternatives, views and privileged routines. A dedicated pilot database lowers exposure but does not count as tested within-business authorization.

## 12. Earlier backstop assertions survive fixture-role changes (R4)

Fixtures use owner-connected setup or product routes, never the runtime's broad writes or `app.transition_job`. Existing backstop assertions (immutability triggers, replay-contract, proof-replay, match-inbox-replay, membership lock, watchdog deferred triggers) are **kept** and re-run under an appropriate fixture role as well as asserting the runtime refusal, so changing who sets up a fixture never deletes an assertion. No merged test is edited by LP-0.

## 13. Owner policy: nothing decided here

General owner creation, removal, transfer and recovery rights remain **NEEDS A RULING**. Section 11.8 records the LP-7 owner-rights answer (card `jobguard-twenty-product-decisions-2026-10-13`: a verified owner's approval, preventing accidental lockout); this note treats that as the plan's record and proposes no additional right. Fee, tax, safety and revocation policy are unchanged.

## 14. Unresolved decisions (kept visible)

1. Review the proposed table-backed binding against the keyed-signature alternative (section 9); no choice is approved.
2. Exact signature of `begin_command` / `complete_command` and the input digest definition (section 5); to be fixed only after the independent review of this note.
3. Validate the proposed rollback/refusal disposition of stale "processing" receipts and cancelled commands (section 17).
4. Whether the audit event format needs a version for legacy history (LP-4 says "if needed"); no retroactive authentication of legacy history.
5. Key and owner custody for the binding, and rotation.
6. The scanner and pin changes for LP-6b (coordinator-owned, Ben's typed yes).
7. Worker authorization recheck wording under existing revocation rules (LP-10).

## 15. Required before LP-5 and LP-6a

- Independent review of this note, recorded against the exact commit (not yet done).
- LP-1 to LP-3 merged (dependencies in section 11.8).
- Coordinator integration slot for migrations and the lane register.


## 16. Proposed audit-append contract (LP-4, final attribution LP-6e)

This is a behavioural contract for review, not a frozen SQL signature. Candidate
`app.append_audit` accepts a bounded, versioned batch of **event proposals** and
returns stored events. The database allocates sequence, obtains wall-clock time,
reads the preceding hash, hashes canonical bytes, writes the events and advances
the head atomically. Inputs never include sequence, previous/event/payload hash,
server timestamp or an authoritative tenant. Existing event IDs may be supplied
for durable deduplication but never grant authority.

Two entry classes share the sealing primitive:

| Entry class | Permitted caller content | Source of authoritative facts |
|---|---|---|
| Checked operation | Operation/receipt and immutable result references; bounded coded metadata | Owner-only operation-specific wrapper reads the established business facts and exact approval; builds event type, subject, actor and facts itself |
| Generic lower-trust statement | Strict identifiers/hashes and a labelled operational statement type | Authenticated submitter only; stored/displayed as a statement, never approval, payment, acceptance, completion or verified evidence |

A runtime-callable generic append must reject all reserved high-trust event types
and cannot reach an owner helper that upgrades a caller-selected label. There is
no generic “trusted=true” flag. Runtime EXECUTE on an internal helper is not made
safe merely by calling it from a checked wrapper. Event families are enumerated
at implementation from the inventory, including `command.succeeded`,
`job.imported_baseline_attested`, invoice/final-lock, recovery and identity events:
current practice ownership queries actually consume adoption audit references
(`practice-session.ts`), so those references are authority-bearing facts.

The sealed envelope separates database-owned tenant, actor, execution principal,
trust class, event type, subject and fact references from caller metadata. Reject
unknown fields and reserved-field collisions at every nesting level; no JSON merge
may let caller text overwrite those fields. LP-4 binds content to checked facts;
until LP-6e, actor claims retain their explicit transitional trust limit. LP-6e
stamps the protected actor and separates authorizing user from worker executor.
A valid session alone cannot attest a false approval/payment/completion.

Propose `audit.v2` for newly sealed envelopes if additional fields or canonical
bytes differ. Keep `audit.v1` verification byte-for-byte, including its historical
millisecond timestamps and hash construction; do not rehash stored history.
Specify canonical key ordering, UTF-8/string escaping, absent versus null fields,
integer representation and timestamp precision before implementation. SQL,
TypeScript verifier, checkpoint exporter and displayed trust labels must share
fixtures for those bytes. A mixed chain links the actual preceding event hash;
legacy records remain legacy assertions, never retrospectively authenticated.
The exact format/version is subject to review, not changed by this document.

Before locking the head, validate all event inputs and acquire every business
lock. Duplicate event identity with identical canonical proposal/fact binding
returns the original event without advancing the head; changed content conflicts.
The event identity and tenant/sequence are uniquely constrained. Concurrent
appends serialize on the head; rollback undoes both domain facts and head/events.
Retries after an uncertain commit first reconcile the command's committed receipt,
rather than resealing success. Owner-side writers must convert too: final-lock,
shadow/final-check, SSO, subscription/meter/demo and follow-up audit helpers in the
inventory cannot retain alternative forging doors. Restricted checkpoint exports
remain administrative; a structurally valid chain proves neither human intent
nor the truth of site evidence.

## 17. Proposed begin/complete contract (LP-5a–LP-5c)

Candidate inputs to `begin_command` are version, command ID, command type,
semantic key, resource identity, expected revisions and strictly validated
significant input. Transitional `p_actor`/`p_tenant` come from the server principal;
LP-6 compares them to the binding rather than accepting them as authority. The
checked per-command adapter derives the input digest, or recomputes and compares
it; a caller-selected hash cannot authorize substituted content. Digest rules
preserve existing semantic replay behaviour (including which generated IDs are
excluded in `commands.ts`) and cover actor, tenant, resource, command family,
terms/amount/currency, recipient, document hash, policy and relevant revisions.
Unknown types/versions, extra fields, invalid amounts and missing significant
input fail before a new receipt or approval can persist.

`begin_command` returns one of: **new processing claim**, **permitted stored
terminal replay**, or a typed refusal/conflict. IDs or semantic keys are scoped by
the existing uniqueness contract, not treated as permission. Check current
credential, active membership, resource permission and practice ownership **before
returning any replay**. A different actor, tenant, job, command family or input
cannot see a result or repeat effects. Preserve successful no-op receipts and
existing authority-first uniform refusals. Do not replace operative/supervisor/
surveyor/finance/member permission rules with a universal owner requirement.

A claim is neither approval nor successful completion. Dedicated checked routines
create the exact approved resolution/authorization after the explicit action,
then validate and consume it for that operation. Dismissal/rejection never creates
an authorization. Bind single-use consumption to the same actor/type/processing
receipt and significant terms, or to the already-decided named multi-step scope;
replay is not a second consumption. Revoked, expired, superseded, already consumed
or mismatched approval refuses. Preserve CH-7-TERMS: approval time is transaction
start where that merged contract applies, audit uses wall clock; do not replace
all clocks with one rule. Test waits/long transactions against that contract.

Candidate `complete_command` accepts a claimed command and operation-specific
result reference, **not arbitrary success JSON**. A checked adapter establishes
that reference from the mutation, verifies receipt/actor/type/resource/revision,
and derives a bounded stored result. A deferred database consistency check must
reject any commit without the corresponding mutation (or a defined no-op),
terminal receipt, trusted audit and required immutable authorized outbox work.
It must also reject a mutation committed while its claim is left processing.
Completion cannot accept caller-authored evidence of success, another command's
mutation, a stale locked-bill pointer or an unrelated invoice/allocation. No new
business lock may be acquired after audit; use the already-held receipt and
pre-established facts as described in section 4.

Proposed failure disposition: synchronous claims, effects and completion live in
one transaction. Cancellation, validation error or failure before completion rolls
all of them back; retry may claim afresh. A concurrent duplicate waits for the
claiming transaction then rechecks current access and either returns its first
committed result or claims after rollback. A pre-existing committed processing
receipt is **not** permission to resume or mark success: refuse/conflict until its
existing owning workflow reconciles it. No timeout takeover, new lease scheme,
new cancellation state or status reset is introduced by this design. Any legitimate
cross-transaction workflow needs its own documented existing reconciliation and
revocation rules before conversion. Unknown external outcomes reconcile; they do
not trigger blind network retries. Business network calls stay outside the
transaction.

LP-5a converts dispatcher creation, dismiss/reject and completion. LP-5b traces
all TypeScript and owner-side SQL writers, including later contractor wrappers,
seed and restore tooling; preserves replay, membership-lock and watchdog/deferred
backstops. LP-5c revokes direct receipt INSERT/UPDATE, resolution and authorization
INSERT, and inventories all remaining authority-changing column grants. An old
callable overload/helper is withdrawn with its replacement, or assigned explicitly
to its closing card before real data. No partial conversion is described as secured.

## 18. Downstream paths requiring explicit review

The appendix is the object index; this table explains how to follow its paths.
Each row is a source-inspected hypothesis until the implementing card tests it.

| Reachable input / path | Downstream effect and checks to preserve | LP owner |
|---|---|---|
| Account, person, identity email mappings, membership, invitation, SSO/SCIM, revocation and role grants | Who can act, on which company/resource; exact invitation acceptance and next-request revocation; concurrent last-owner protection; no new owner-creation policy | LP-1, LP-6a/b/d, LP-7, LP-11/12; LP-13 SSO connection check |
| Direct ordinary/imported job insertion, activation terms, start-quote and old transition overloads | Initial lifecycle/pricing/adoption and immutable practice ownership; caller-set adoption or synthetic flag is insufficient | LP-2/3, LP-6c/d, LP-8a |
| Decisions, resolutions, exact grants and all receipt writers | Approval reuse, changed-content replay and fabricated completion; distinguish authorized no-op from unexecuted mutation | LP-5a/b/c, LP-6d |
| Proposal review, scope progress, quote/variation versions, parties, order lines, supplier matches and captures | Lower-trust input becomes a commercial snapshot, permission, extra origin or bill line; preserve decided member/contractor roles and server-written origin | LP-6c/d, LP-8b; LP-13 progress/unknown raiser |
| Evidence upload/object/version, source originals, links, proof, invalidation, packs and adoption audit references | Attribution and finalized evidence can control ownership, approval, bill and recovery eligibility; tenant/job/scope/hash/object-version checks cannot be replaced by ID existence | LP-6d, LP-8b, LP-11 |
| Final-account draft/revision/line/proof and advance routine, immutable lock and capture manifest | Trusted pointer substitution, locked-bill reference and early hidden disclosure; fee eligibility still follows the existing lock/attribution rules | LP-6c/d, LP-8a/b, LP-10/11 |
| Payment/credit/landing/allocation/reversal, fee basis, journals and invoice-number tables | Exact approved amounts, available unreversed settled value, cumulative limits and compensating history; checked allocation tables remain SELECT-only | LP-6c, LP-8a/b; LP-13 numbering |
| Outbox/attempt/inbox, provider event, shadow pack and worker switch routes | Approved immutable content, claims/lease/retry/completion, executor versus approver, execution-time revocation and unknown outcome | LP-8b, LP-10/11 |
| Seed/bootstrap, synthetic practice issue/start, restore and migration tooling | Can recreate privileged facts, sessions, revoked grants, approvals and queued work; keep owner secrets absent from service startup; restore checks precede resumption | LP-1/2, LP-5b, LP-8a, LP-9/12 |

No working-data label authorizes a new runtime grant. LP-0 assignments and R1 stay
in force. Newly found effects go to the existing applicable LP card; policy gaps
hold only their affected operation. This note grants no fee, tax, safety,
revocation, owner-creation or owner-removal rights.

## 19. Adversarial acceptance matrix and evidence limits

These are implementation test obligations, not claims that this docs slice
implemented or executed the database contracts. Synthetic tenants A/B and actors
Alice/Bob below are made up.

| Attack | Required observable result | Relevant existing regression suite / implementing card |
|---|---|---|
| Duplicate command/event; concurrent identical claim; same key with changed input or other family/job | First stored result only after current-access check; one effect/audit; changed binding conflicts, no result leak | `command-replay-contract.integration.test.ts`, `proof-replay.integration.test.ts`, `match-inbox-replay.integration.test.ts`; LP-4/5 |
| Bob replays Alice's command; tenant B selects tenant A; revoked or demoted actor reuses receipt | Uniform authority refusal; no stored-result disclosure or new write; positive permitted member case still passes | `site-extra.integration.test.ts`, `tenant-context.test.ts`, `tenancy.integration.test.ts`; LP-5/6/11 |
| Null/empty/malformed/forged context, unknown command, reserved audit fields or wrong event type | Typed fail-closed refusal; no receipt/domain/head/outbox change | `lp-0-catalog.test.ts` supplies inventory-invalid-input checks only; new real-role attacks required at LP-4/5/6 |
| Valid actor appends false payment/approval/completion; calls internal/old overload directly | No high-trust event or success; exact fact/authorization binding checked even for a valid owner | `audit.integration.test.ts`, `lp-0-authority-paths.integration.test.ts`; LP-4/5c/6e |
| Cancel/fail before completion, audit error, missing outbox, stale processing, concurrent mutations | Whole command rollback or defined owning-workflow reconciliation; no fabricated terminal success; audit remains last lock | `commands.integration.test.ts`, `watchdog-lock-order.integration.test.ts`; LP-4/5 |
| Pool/backend reuse; commit/rollback/savepoint rebinding; altered signed context or another database | No stale authority; different actor/tenant/kind refused; fresh authenticated transaction succeeds | LP-6a/b new PostgreSQL pooling suite; existing context tests are only application boundary evidence |
| Practice credential used against real owner, captured valid credential, stolen DB password | Practice-to-real refused; DB password alone cannot mint a binding; captured live session retains its scoped authority and remains an explicit risk | `contractor-practice-session.integration.test.ts`; LP-6a/9 |
| Reuse approval after reversal; over-allocation; substitute final-lock reference | No duplicate positive fee, no allocation beyond qualifying unreversed value, no foreign/non-locked reference; unchanged financial policy | `final-check-v1.md`, `success-fee-posting-v3.md` contracts and their implementing suites; LP-6c/8a/b |
| Seed/restore reintroduces access or queues; worker claims as web login | Destination/role refusal; restore catalogue and current revocation checks; one permitted worker effect | LP-1/8/9/10; deployment-specific proof still outstanding |

The documents are **source-inspected design input**. Local checks for this slice
validate index coverage, references, lane scope and existing pure comparator/
context regressions; they do not establish SQL refusal, locks, signatures,
financial correctness or independent review. PostgreSQL/browser suites cannot run
in this sandbox. All implementation, migration, cutover, RED implementation
reviews and whole-track real-data gates remain outstanding. Review of this note
must be recorded against its exact head before LP-5's interface is fixed or LP-6a
is coded. No migration or dependency is required for this slice.
