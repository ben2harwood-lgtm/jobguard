# LP-4 to LP-6 design note: commands, audit and the actor binding, version 1

**Status:** design preparation required by BUILD_PLAN section 11.8 ("Design and inventory before cutover"), written by the LP-0 builder. **It is not an implementation, not a settled mechanism and not yet independently reviewed.** Independent review of this note must be recorded **before LP-5's interface is fixed and before LP-6a is coded** (LP0-20). Passing the LP-0 catalogue guard says nothing about whether this design is right.

**Review record:** *none yet.* (To be filled by the reviewing actor, bound to the exact commit of this file. A builder cannot fill it in.)

**What this decides:** nothing. Where a choice is open it is listed under "Unresolved decisions" and stays open. No fee, tax, owner-creation/removal, safety or revocation policy is proposed or changed.

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

Audit is the **last** lock: the existing contracts already order a command as membership verification, receipt claim, business locks, then the audit head last, with no business lock after it (`extra-unlink-v1.md`, `site-visit-v1.md`, `prevention-checks-v1.md`, `watchdog-lock-order.integration.test.ts`). Moving the append inside the database must keep that: the in-database append takes the head lock as its final act and the checked `complete_command` runs before it only if completion itself needs no business lock afterwards. The binding (LP-6a) must take **no** lock that violates this order; a lookup that needs a lock is a design defect, not a tuning problem. Tests required at LP-4: concurrent commands, rollback, retry, and every owner-side writer.

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

## 9. Binding storage: two options, decision left open

| | Table-backed binding | Transaction/environment-bound keyed signature |
|---|---|---|
| Idea | A protected table row keyed by backend/transaction, written by a narrow owner routine | A keyed signature over (session reference, tenant, actor, transaction id), verified by a narrow routine, key held outside the business login |
| For | Simple to reason about; revocable by row; easy to audit | No row writes per request; harder to replay across transactions if the transaction id is covered |
| Against | A write and a lock per request; the lookup must not create a circular RLS dependency or break the audit-last lock order | Key custody and rotation; a captured signature within its transaction; needs a trusted verifier that the login cannot call with chosen inputs |
| Open questions | Who may write the row; cleanup; savepoint behaviour | Where the key lives; what the transaction identifier binds; behaviour under pooling and `SET LOCAL` reuse |

Neither a plain setting nor a caller-selected actor is authority. **Unresolved:** which option; the key or table owner; rotation and revocation; behaviour with the worker (section 11). To be decided with the reviewers before LP-6a.

## 10. Narrow chokepoints and role assumption

New sensitive chokepoints (bind, begin/complete command, audit append, money) are owned by narrow no-login roles that hold only the grants and helpers they need (LP-12 for the relevant older money routines). Review rules: fixed trusted `search_path` with `pg_catalog` first and no reliance on temporary objects; schema-qualified references; no dynamic SQL built from caller text; specific EXECUTE grants with PUBLIC and other roles revoked; no membership or SET ROLE path from the runtime or worker login to the owner (the LP-0 guard fails any such path). Schema-owner execution is not assumed to be protected by RLS. Open hypothesis recorded by LP-0: PUBLIC TEMPORARY lets the application login create temporary tables; reachable definers pin `search_path` but do not list `pg_temp` last (see inventory gaps).

## 10a. What an LP-0 inventory entry means for these cards

Every capability the login holds today is a reviewed existing exception with a closing card (see `lp-0-effective-privileges-v1.md`). A card is done only when its exceptions are gone **and** a behavioural test shows the refusal as the real role, paired with an authorised positive case and a committed-state check. The catalogue guard supplies the "grants did not grow" half; it never proves a routine is safe.

## 11. Worker separation and later read/write RLS binding

LP-10 gives the worker its own role and secret; it derives actor and tenant from the valid authorized action (rechecking authorization under existing revocation rules), not from supplied fields. The web login must not bind, claim or complete worker actions; the worker must not manufacture authorization. Audit records separate the executing worker from the authorizing user. LP-11 converts RLS policies from the caller-set tenant setting to the protected bound tenant for reads, inserts and updates (visibility and proposed-row checks), reviewing permissive alternatives, views and privileged routines. A dedicated pilot database lowers exposure but does not count as tested within-business authorization.

## 12. Earlier backstop assertions survive fixture-role changes (R4)

Fixtures use owner-connected setup or product routes, never the runtime's broad writes or `app.transition_job`. Existing backstop assertions (immutability triggers, replay-contract, proof-replay, match-inbox-replay, membership lock, watchdog deferred triggers) are **kept** and re-run under an appropriate fixture role as well as asserting the runtime refusal, so changing who sets up a fixture never deletes an assertion. No merged test is edited by LP-0.

## 13. Owner policy: nothing decided here

General owner creation, removal, transfer and recovery rights remain **NEEDS A RULING**. Section 11.8 records the LP-7 owner-rights answer (card `jobguard-twenty-product-decisions-2026-10-13`: a verified owner's approval, preventing accidental lockout); this note treats that as the plan's record and proposes no additional right. Fee, tax, safety and revocation policy are unchanged.

## 14. Unresolved decisions (kept visible)

1. Table-backed versus keyed-signature binding (section 9).
2. Exact signature of `begin_command` / `complete_command` and the input digest definition (section 5); to be fixed only after the independent review of this note.
3. Disposition of stale "processing" receipts and cancelled commands.
4. Whether the audit event format needs a version for legacy history (LP-4 says "if needed"); no retroactive authentication of legacy history.
5. Key and owner custody for the binding, and rotation.
6. The scanner and pin changes for LP-6b (coordinator-owned, Ben's typed yes).
7. Worker authorization recheck wording under existing revocation rules (LP-10).

## 15. Required before LP-5 and LP-6a

- Independent review of this note, recorded against the exact commit (not yet done).
- LP-1 to LP-3 merged (dependencies in section 11.8).
- Coordinator integration slot for migrations and the lane register.
