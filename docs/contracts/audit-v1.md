# Audit event contract v1

`appendAuditBatch` is called in the same transaction as its business change, after that change and
after every business lock. Its per-tenant head-row lock is the transaction's final lock acquisition.
This M0-5 rule prevents competing audit-only commands from deadlocking; M0-8 owns enforcement at the
full command boundary.

Events chain version, tenant, sequence, stable actor reference, type, subject type/reference, server
timestamp, canonical payload hash, and previous hash. Payloads contain allowlisted identifiers,
SHA-256 hashes, and retention/access classifications only—never names, email addresses, transcripts,
media, or other free text. References and hashes remain potentially personal data and use the same
restricted tenant access and retention classification as their subject.

Audit rows and independently exported checkpoints are append-only. Runtime can neither alter nor
truncate events, nor access checkpoints. Verification against a separately retained checkpoint can
detect tail removal. Hash chaining is tamper-evidence relative to a trusted checkpoint; a database
owner could replace the complete chain and its in-database checkpoints, so this is not “tamper-proof”.

Migration `0001_audit.sql` is forward-only. If deployment fails, fix forward; do not roll back by
deleting audit history. External checkpoint anchoring remains deferred to M4 as specified by the plan.

LP-4 dark database append (migration 0456)
----------------------------------------

**LP-4 part 1: in-database audit append (RED).** This slice builds database
sealing and grant withdrawal in every migrated database. **REFUSED / not built:** reserved
high-trust event-type enforcement and authority-consumer closure, including
`practiceOwnedJobsSql`. Generic appends still accept those names as lower-trust
statements; REFUSED describes the delivery guarantee, not an implemented SQL
rejection. A trust label alone does not satisfy full LP-4. This slice supplies no
production or real-data enablement and cannot close LP-4.

`appendAuditBatch` now sends only strict v1 *input* objects to `app.append_audit(jsonb)`.
PostgreSQL locks the tenant head, allocates sequences, reads the millisecond wall clock,
computes hashes, inserts each event and advances the head atomically. A duplicate event
ID refuses the whole batch; command replay remains the command boundary's responsibility.
Neither caller metadata nor caller-supplied seal/time fields are accepted. The audit head
remains the final contending lock; completion must not introduce a new business lock.

The stored format is `audit.v2`. Its hash input is v1's unit-separator envelope with the
normalized event UUID inserted immediately after the version. Its payload uses bytewise
ASCII key order (all accepted keys/values are ASCII), independent of locale. All envelope
fields, the ID and the payload are therefore sealed together. Existing v1 bytes and
checkpoints stay unchanged and keep the historical v1 verifier, including its legacy
sorting and lack of event-ID binding. Historical integrity supplies no retrospective
claim of authenticated provenance.

Every v2 payload has a database-written `references.auditTrust`. The public append and
identity bridge seal `lower_trust`: event type, actor and subject are caller statements,
including names such as payment/approval/completion. They do not authorize, establish or
certify those facts. These names remain compatible with earlier audit consistency links;
ordinary consistency links are not an authorization boundary. However,
`practiceOwnedJobsSql` still consumes adoption audit references as ownership authority,
so the full authority guarantee remains REFUSED until a later checked-operation/consumer
conversion with positive and forgery-refusal journeys. This part must remain dark.
Only the private primitive, executable by
the migration owner and its checked SQL operations, can seal `checked_operation`.
Final-account, shadow and work-state writers keep their existing checked facts and use
that private primitive. The invoker follow-up routine and identity bridge remain lower
trust. Export verification reports each entry's trust separately from chain integrity;
consumers must not display a lower-trust event as a verified business fact. Actor/session
binding remains LP-6e; database-password tenant binding remains LP-11.

Caller keys colliding with the seal's trust/envelope fields are refused, as are free-text
payloads and email-shaped values. References remain potentially personal identifiers;
this is an allowlist, not a claim that arbitrary identifiers are anonymous.

The new NOLOGIN, NOBYPASSRLS audit writer has only audit table/head privileges and canonical
encoding execution. Runtime has no membership or SET ROLE route to it, no direct audit
INSERT, no private primitive execution and no execution on the retired head routines.
The SSO head bridge is also withdrawn from identity credentials in the same migration.
Audit sealing does not depend on the database name. Tenant context, input validation
and writer privileges apply in every migrated database. Separate synthetic-only
commercial routines retain their own gates; no deployment or real-data enablement
is supplied by this piece.

This is a forward-only, atomic writer/verifier/grant cutover. Apply compatible callers
before directing traffic to the new database routine. On failure, roll back the migration
transaction or fix forward; never restore runtime INSERT or rewrite audit history.
PostgreSQL upgrade/concurrency/permission tests and the existing owner-operation suites
remain CI gates, and an independent Claude RED review remains required.

LP-4 seals `final_check.sources_excluded` with manifest/lock references and
`hashes.exclusions = app.final_lock_hash(excluded)`. The exact ordered exclusion
receipt remains in the frozen manifest rows; its inventory hash is unchanged.
The private sealer and generic append both refuse arrays, objects and null
references. `append_final_check_audit` strips null references, including the
unassigned allocation/revision IDs on stored-receipt and receipt-facts reviews.
The existing stored-event reader remains compatible with the prior candidate's
structured exclusion receipt; no writer can emit that shape through the sealer.

LP-6e candidate (migration 0980, RED; depends on LP-6d)
----------------------------------------------------

New seals use `audit.v3`, the v2 canonical envelope with its version changed.
The private sealer obtains the actor and tenant from the protected request binding,
compares the tenant with its RLS context, and replaces the submitted actor reference
with `membership:<bound UUID>`. A missing/expired binding fails closed for every
login inheriting the runtime role, including calls nested in checked operations.
The database adds `references.auditActorKind=bound_member` to the hashed payload.
Owner-connected workers, seeds and restore without a binding instead receive the
explicit `system:database:<session_user>` actor and `auditActorKind=system`; supplied
human names never become authenticated attribution. These system stamps identify
an execution principal, not the individual administrator controlling it.

Except for the exact legacy lower-trust names listed below, the generic append
cannot emit authority-bearing approval, payment, acceptance, issuance, lock or
command-completion names. Its error is
`AUDIT_CHECKED_OPERATION_REQUIRED`; private checked domain operations must establish
those facts. A bound identity alone never grants EXECUTE on the private sealer.
Payload keys `actor`, `tenant`, `type` and `auditActorKind` join the existing reserved
fields and are refused in every section. No caller text is merged into those fields.
Verifier/export attribution distinguishes v3 bound members, v3 system work and old
unverified actor claims. v1/v2 history, hashes and checkpoint semantics stay intact.

Landing remains held for authorized source-pin/inventory
refresh and whole-PostgreSQL regression checks. Existing generic authority writers
must be converted to their checked domain operation, never merely relabelled as
checked. Existing LP-4 version-specific tests must be run at their historical schema
boundary while retaining their original assertions. No production authority-consumer
closure or release is claimed by this built-ahead candidate. Forward fix only; do not
rewrite old history or restore direct runtime audit writes on failure.

4 November chained catch-up: LP-6d `cdd4e3282` is present with LP-6c `0591`
and LP-6b's latest session authority. The absence-only predecessor hold is closed;
predecessor landing and exact-head CI are separate evidence. The latest preceding
sealer definition remains `0520`; 0980 replaces only that audit primitive, reusing
the inherited actor/tenant accessors and checked domain routines. It does not
recreate sibling routines. After waiting for the audit head, it revalidates a
bound request's lifetime without taking another business lock.

The audit-writer inventory includes later customer-portal issue/acceptance (`0533`,
`0545`), connector intake (`0554`) and accounting export (`0558`): each still reaches
the single private sealer and receives v3 attribution. Non-member execution
principals are labelled system work; that label does not authenticate a customer
identity. LP-6d's customer-message writer remains held under the router's ruling:
`identity.customer_portal_message` needs separate customer sign-in proof after
LP-6b lands; no sponsor impersonation or invented member binding is supplied here.
The 0980 proof records the two owner-only lookup grants and their exact ACL changes.
It intentionally leaves the protected sealer definition hash and static-call pin
unchanged for the authorized owner; catalogue CI must fail until that authorized
update is supplied. No scanner, fingerprint, pin or historical assertion is relaxed.

LATER / SIMPLICITY (initial review): the authority-event classification in
`0980_lp6e_audit_attribution.sql` and `packages/db/src/audit.ts` must agree.
A future shared fixture table for event-name acceptance/refusal would make SQL and
verifier drift easier to detect without changing their separate execution boundaries.


LP-6e repair round 1 (6 November): compatibility is limited to these exact names:
`command.succeeded`, `contractor.visit.completed`,
`customer_credit_note.synthetic_approved`, `customer_invoice.synthetic_issued`,
`customer_payment.recorded`, `customer_payment.synthetic_recorded`,
`proof.completed`, `recovery.terms.approved`, `variation.approved`.
They retain `lower_trust`, including in verification and exports; a bound actor
establishes attribution only, never the truth or authorization of their content.
Case variants, suffixes and all other authority names remain refused.
Nested `payload` and `payloadHash` section keys are permitted data; they cannot
replace the sealed payload or its hash. Actor/tenant/type and trust metadata
remain reserved. No grants or private execution paths are widened by this repair.

Named follow-up **LP-6e-LEGACY-WRITERS**: convert each listed repository writer to
its private checked domain operation and remove that exact name from both legacy
lists, with positive product and forgery-refusal tests. This compatibility repair
does not claim that follow-up or authority-consumer closure is complete.

Repair round 1 handoff — READY (6 November 2026)
----------------------------------------------

Applied only the first security pre-check's compatibility fix to 0980 and its
verifier. The two nested data keys now have acceptance plus sealed-hash tampering
coverage; all other reserved-field, actor-substitution, authority-name, direct
private-execution, rollback, tenant-substitution and expiry refusals remain.
New SQL integration coverage rejects near-miss legacy names and runs product proof
completion, invoice issue and payment recording under a bound runtime. The
synthetic detector completion alone is fixture setup, not a live provider claim.
Proof deltas are sorted; no policy rows or additional grants are introduced.
The lane contains exactly the non-lane files changed from LP-6d `cdd4e3282`.

Local checks actually run using installed tools (no dependency install):
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=2 src/lp6e-audit.test.ts src/lp4-audit.test.ts src/audit-fix-dbsrc-08.test.ts` — 53 passed, 3 files.
- From `packages/db`: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — PASS; this is also the package lint command. A nullable test-reference error found on the first run was fixed before the passing rerun.
- TypeScript compiler API with the package options and `noEmit`, rooted at `test/lp6e-audit.integration.test.ts` — PASS for the integration test and imported fixtures; syntax transpilation also passed. Neither executes PostgreSQL.
- `LANE_BASE_REF=cdd4e3282 node tools/lint.mjs` — PASS. The initial default-main comparison failed on inherited LP-6b/c/d paths; no lane expansion was used. Existing computed-import notices are reported, not refused, by core-purity lint.
- `git diff --check`, exact lane-path comparison and sorted proof-row check — PASS.

CI must execute the new `test/lp6e-audit.integration.test.ts`, full database and
migration suites (fresh/upgrade, RLS/privileges, actor binding, rollback/concurrency
and owner writers), affected product regressions (supplier matching/documents,
discrepancies, evidence, final accounts, invoice/payment and both demos), and all
required type/lint/test/build/browser gates on the eventual pushed head. This Mac
cannot start PostgreSQL or bind localhost, so none of those database/browser
results is claimed. Protected sealer definition/static-call pin refresh remains
with its authorized owner; catalogue CI stays held until supplied. NOPR serial
landing remains after LP-6b/c/d, with an independent RED check at the exact head.
No commit, push, PR, merge, release or deployment was performed here.


Repair round 3 handoff — READY (6 November 2026)
----------------------------------------------

LP-6e, RED, NOPR; round 3 expressly authorized in the issued brief (6 November
11:14). Rounds 1 and 2 remain intact. Added exactly `outbox.succeeded`,
`recovery.message.approved`, `recovery.message.succeeded`, and
`recovery.follow_up.reminder_approved` to migration 0980, the verifier and the
unit-test list. These remain lower-trust compatibility events; no private writer,
grant, checked-trust assertion, protected pin or product policy was changed.

Two new PostgreSQL integration cases use a bound runtime and the product recovery
repository, not a direct audit append. They assert approval replay produces one
approval audit, then fake outbox success commits its action/attempt/sink and both
outbox and recovery-history success audits exactly once despite replay. Each
resulting tenant chain is verified with bound attribution and lower-trust labels.
The fake adapter sends nothing externally. These cases are source/type checked
locally; PostgreSQL execution is pending CI.

Completed a source inventory of production `appendAuditBatch` calls, command
`auditEvents` producers, audit helper callers (including `domainAudit`,
`auditInput`, `messageAuditInput`, `auditOutcome`), and template-built names in
packages/db/src and their API callers. Expanded outbox statuses, recovery message
history outcomes, follow-up kinds, and action/kind unions from their producers.
Also traced SQL-produced enterprise prompt batches, SSO's lower-trust SQL bridge
and the follow-up SQL audit catch-up. Checked-operation SQL seals are separate
from generic lower-trust appends. The following 14 additional reachable event
names still match the refusal rule and are NOT added by this repair:

| Still refused name | Producer / path to the lower-trust append |
| --- | --- |
| `quote.acceptance.attested` | acceptance-repository.ts:34, `domainAudit` -> dispatcher `auditEvents` |
| `quote.acceptance_cancelled` | acceptance-repository.ts:41, `quote.${input.kind}` -> dispatcher |
| `synthetic_obligation.simulated_settlement` | activation-repository.ts:35 -> dispatcher |
| `contractor.extra.step_approved` | extra-approval-chain-repository.ts:123 -> `audit` |
| `contractor.extra.client_link_issued` | extra-approval-chain-repository.ts:170 -> `audit` |
| `contractor.prompt.command` | 0780_lp6d_remaining_routines.sql:1383 produces `output.audits`, appended by enterprise-live-prompt-repository.ts:52 |
| `recovery.eligibility.approve` | recovery-case-repository.ts:97, `recovery.eligibility.${input.action}` |
| `recovery.payment_payer.marked` | recovery-payment-payer-repository.ts:29 |
| `recovery.payment_payer.mark_withdrawn` | recovery-payment-payer-repository.ts:29 |
| `worm.authorized` | worm-command-repository.ts:72 -> `worm.${phase}` (dark WORM path) |
| `sso.oidc.request.issued` | oidc-repository.ts:23 -> enterprise identity audit bridge |
| `sso.request.issued` | apps/api/src/auth/sso/sso.application.ts:105 -> identity.sso_audit_append |
| `sso.signin.completed` | apps/api/src/auth/sso/sso.application.ts:131 -> identity.sso_audit_append |
| `sso.oidc.signin.completed` | apps/api/src/auth/sso/oidc.application.ts:73 -> identity.sso_audit_append |

This is a source-derived refusal inventory, not execution evidence for those
paths. Existing checked seals do not exempt a subsequent generic append bearing
the same business fact. The four-name repair is READY for router handoff; the
remaining refusals require separate scoped work and prevent a blanket claim of
all-writer compatibility. No unlisted compatibility exceptions were introduced.

Local checks actually run (installed tools, no dependency download):
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=2 src/lp6e-audit.test.ts src/lp4-audit.test.ts src/audit-fix-dbsrc-08.test.ts` — 60 passed in 3 files.
- From packages/db: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — PASS; also the package's lint implementation.
- TypeScript compiler API using packages/db/tsconfig.json options, noEmit and repository rootDir, rooted at test/lp6e-audit.integration.test.ts — PASS, zero diagnostics (including imported fixtures). No PostgreSQL execution.
- `LANE_BASE_REF=cdd4e3282 node tools/lint.mjs` — PASS, including lane, core purity, money boundaries and PL/pgSQL lint; existing computed-import notices remain non-failing.
- `git diff --check` and exact lane comparison against LP-6d cdd4e3282 — PASS, 8 non-lane paths; exact exception delta is the four authorized names.
- Initial pnpm filtered check invocations made no check progress and were interrupted; only the completed direct installed-tool runs above count as evidence.

CI must run test/lp6e-audit.integration.test.ts (including both new product cases),
the complete PostgreSQL and migration suites (fresh install and upgrade), RLS and
privilege/catalogue checks, binding/forgery/expiry/rollback/concurrency coverage,
outbox and recovery message/follow-up regressions, and affected product journeys.
All mandatory CI type/lint/test/build/browser gates remain required on the pushed
head. This sandbox cannot start PostgreSQL or bind localhost; no DB/browser PASS
is claimed. Authorized protected sealer pin refresh and an independent RED check
at the exact head remain required, with predecessor/LP landing order preserved.
No commit, push, PR, merge, deployment or release was performed by this session.

Repair round 4 handoff — READY (6 November 2026)
----------------------------------------------

LP-6e, RED, NOPR; Ben's extra round in the issued brief. Rounds 1–3 above
remain historical evidence. The 14 refusals in the round-3 table are now resolved
by exact-name additions to 0980, audit.ts and the unit-test list (30 names total).
All remain lower_trust. No authority regex, reserved key, grant, protected pin,
private execution path or checked-trust assertion was relaxed.

Repeated the source sweep of audit writers, their callers and payload builders:
- Literal eventType properties, shorthand eventType/type helpers, command
  auditEvents producers, domainAudit/audit helpers and supplied audit batches.
- Template-built names expanded from callers or versioned action/kind unions:
  quote dispositions; contractor organisation commands, parties and work orders;
  job parties; discrepancy outcomes; practice-feed and prevention commands;
  recovery case and eligibility commands, allocation/reversal, message history,
  follow-up kinds; outbox results/reconciliation/cancellation; tenant key
  rotate/revoke; WORM authorized; SSO administration and SCIM outcomes.
- Traced enterprise prompt output.audits through enterprise-live-prompt-repository
  (including contractor.prompt.command), SAML/OIDC request and callback audits
  through identity.sso_audit_append, and 0520's follow-up clock catch-up through
  app.append_audit. Checked SQL seals remain separate from lower-trust appends.
- Inspected references/hashes/classifications keys, helper-supplied maps and SQL
  JSON payload builders against the sealer's reserved keys. payload/payloadHash
  remain nested data keys, not sealed envelope collisions. The auditTrust found
  in the stored historical-exclusions schema/test fixture is not a caller writer.

No additional existing writer names or payload keys requiring compatibility
changes were found beyond those 14. This is source inspection, not execution
proof of every writer. Existing lower-trust business facts still need the named
LP-6e-LEGACY-WRITERS checked-operation conversion before authority-consumer closure.

Added PostgreSQL integration cases using existing product paths:
- QuoteAcceptanceRepository cancellation followed by practice acceptance and
  identical-command replay, with accepted document state, exactly one of each
  lower-trust audit, bound-member attribution and a verified tenant chain.
  Existing prepareActivationFixtureV3 supplies the initial accepted quote.
- Enterprise SAML sign-in through the existing SCIM/SSO fixture and actual SSO
  application, checking the persisted authenticated session and membership scope,
  exactly one request/sign-in audit and a verified tenant chain. The identity
  bootstrap login is explicitly system-attributed, never authenticated as the
  caller's claimed membership. This is a synthetic IdP, not a live provider.

Local checks actually run (installed tools; no downloads, DB or browser):
- From packages/db: ./node_modules/.bin/vitest run --maxWorkers=2
  src/lp6e-audit.test.ts src/lp4-audit.test.ts src/audit-fix-dbsrc-08.test.ts
  — PASS, 74 tests across 3 files.
- From packages/db: ./node_modules/.bin/tsc -p tsconfig.json --noEmit
  — PASS; this implements both package typecheck and package lint.
- TypeScript compiler API with package options, rootDir at repository root and
  noEmit, rooted at test/lp6e-audit.integration.test.ts — PASS, zero diagnostics,
  including imported integration fixtures and API sources. No DB execution.
- LANE_BASE_REF=cdd4e3282 node tools/lint.mjs — PASS, including lane, core purity,
  money boundaries and PL/pgSQL checks. Existing computed-import notices remain.
- git diff --check and exact lane comparison against LP-6d cdd4e3282 — PASS;
  8 non-lane changed paths, with no config/lanes paths in the lane allow list.

CI must prove the new quote/SSO cases and the earlier LP-6e cases on PostgreSQL,
full DB/migration fresh-install and upgrade suites, RLS/grants/catalogue checks,
actor substitution, reserved payload/near-miss name refusals, rollback, expiry,
concurrency and owner writers. Run affected quote/reacceptance, SSO/OIDC/SCIM,
outbox/recovery, enterprise prompt/approval and invoice/payment regressions,
plus all mandatory type/lint/test/build/browser checks and both demos at the
pushed head. This Mac cannot start PostgreSQL or bind localhost; no DB/browser
PASS is claimed. Authorized protected sealer pin refresh, predecessor landing
order and independent RED review at the exact head remain required. READY means
ready for router commit/push and CI, not merge or release acceptance.
No commit, push, PR, merge, deployment or release was performed here.

### LP-6e repair on the passed LP-6c base (10 November 2026)

This handoff supersedes the build/dependency statements above. Base is
`c2ec9e98adab349f60394b72415f390701ae458e`; migration `0980` is a placeholder for
router renumbering. LP-6d is absent and must be restacked before landing. Its
remaining routine actor enforcement is assumed, not rebuilt by this piece.
The protected sealer starts from 0520; the deferred command-completion trigger
starts from its newest body, 0521. Its only logical change accepts audit.v3 as
well as audit.v2, preserving actor, command identity, checked trust and result
checks. Legacy v1/v2 rows and checkpoints are unchanged.

The background outbox executor has no request binding. A narrow owner routine,
`app.lp6e_append_outbox_audit`, validates a tenant-scoped outbox row and its stored
status before invoking the private sealer in system mode. It always seals
lower-trust statements with the database-login system actor, even when called
from a human session; it cannot create authorizations or change delivery state.
Generic unbound runtime appends still refuse, including NOINHERIT membership;
expired human bindings cannot fall back to system. Supported pre-cutover schemas
keep the existing outbox append path until this bridge is installed. This small
bridge is needed to fix the checker-observed worker regression without making
unbound generic runtime appends acceptable. No new tables are introduced.

Regression fixtures reuse current bound-context helpers and exercise queued
outbox delivery, replay, premature success, foreign-tenant and absent-row refusal,
and system attribution. Existing specs are unchanged. The full PostgreSQL,
migration/privilege/catalogue and browser suites must run in CI: none ran here.
The sealer and command-completion protected source pins, plus the new bridge's
catalogue entries, need the authorized router's exact-head refresh before landing;
this build does not change protected scanner definitions or source pins. One
independent RED review remains required. This is NOPR build-ahead work only.

Local validation for the LP-6c repair (10 November 2026):
- Installed TypeScript: `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`
  and, from apps/web, `../../node_modules/.bin/tsc -p tsconfig.json --noEmit`
  both PASS. A compiler-API check of test/lp6e-audit.integration.test.ts with
  the DB compiler options and repository rootDir also PASS (zero diagnostics).
- From packages/db, installed Vitest 4.1.12:
  `./node_modules/.bin/vitest run --maxWorkers=2 src/lp6e-audit.test.ts src/lp4-audit.test.ts src/audit-fix-dbsrc-08.test.ts`
  PASS (74 tests); `./node_modules/.bin/vitest run --maxWorkers=1 test/migration-proof-loader.test.ts`
  PASS (77 tests). These are unit/source/proof-loader checks, not database proof.
- `node tools/agent-lane-boundary-lint.mjs` PASS against its available main ref.
  Explicit coverage against c2ec9e98...HEAD plus tracked/untracked working changes
  PASS: all 10 paths allowed, no unused allow paths. With HEAD still at c2ec9e98,
  the lint's explicit LANE_BASE_REF=c2ec9e98 invocation refuses self-comparison;
  the manual comparison uses the existing lane policy and lanePathAllowed helper.
- `git diff --check` PASS. Source comparison confirms the replacement command
  completion routine equals the newest 0521 body except v2/v3 acceptance.
- Added a NOINHERIT runtime-login refusal case to cover the earlier checker note;
  it is typechecked but NOT EXECUTED. PostgreSQL and browser suites were NOT RUN.

READY for router commit and CI only. LP-6d restack and authorized protected-pin
refresh remain landing requirements, along with exact-head independent RED review.

### LP-6e router handoff revalidation (11 November 2026)

The supplied worktree was already at `cb7167ea469072b14b68f7c3a79f3461b1ffc4e6`,
containing the repair above on the passed LP-6c base `c2ec9e98`. No git writes or
fetch were performed. Read all five earlier precheck/recheck records; no matching
LP-6e handoff was found in coordinator/handoffs-1109. The earlier legacy-name,
payload-key, v3 completion and queued-worker findings are addressed in the
existing repair. Added a focused source regression to preserve the newest
predecessor completion body with only v2/v3 acceptance changed. This is source
validation; product-path PostgreSQL tests remain required in CI.

Checks run again using installed dependencies:
- DB and web `tsc --noEmit`: PASS; integration-source compiler-API typecheck:
  PASS, zero diagnostics.
- Vitest 4.1.12 `--maxWorkers=2` with src/lp6e-audit.test.ts,
  src/lp4-audit.test.ts and src/audit-fix-dbsrc-08.test.ts: 75 PASS.
- Vitest `--maxWorkers=1 test/migration-proof-loader.test.ts`: 77 PASS.
- Lane lint: PASS against available main and explicitly with
  `LANE_BASE_REF=c2ec9e98adab349f60394b72415f390701ae458e`; this piece's lane is
  judged against LP-6c, not against main's inclusion of predecessor work.
- `git diff --check`: PASS. Existing main specs and protected pins unchanged.

PostgreSQL and browser suites were NOT RUN. READY is for router commit and CI
only. LP-6d restack, placeholder migration 0980 renumbering, authorized source-pin
and catalogue refresh, exact-head CI and independent RED review remain required.


### LP-6e repair 2 handoff — READY for router commit (11 November 2026)

Scoped to the two LP-6d-independent precheck items on `b4aad2f9`:
- Updated eleven current-schema v2 expectations across ten test sources to v3.
  They assert the exact bound member or database execution principal,
  `auditActorKind` and existing `auditTrust`, while retaining domain payload,
  hash, replay, refusal and cardinality assertions. SCIM selects its exact
  machine-operation event names and checks their ordered sequence; caller-supplied
  machine actor strings are replaced by the database principal.
- Reused the existing LP-4 test fixture for full current-schema envelope checks:
  every selected column, tenant, sequence, previous hash, actor/kind agreement,
  payload and canonical hash/chain verification. Historical v1/v2 fixture and
  schema-boundary assertions are unchanged.
- The shared protocol fixture answers only the exact outbox capability probe,
  present or absent; unrecognized SQL still reaches the doubles' refusal paths.
  The cancellation mock preserves the real input schema. Added probe near-miss
  refusals, installed-bridge routing and rollback on either schema path. These
  protocol doubles do not prove PostgreSQL authorization, hashes or locking.
- Extended this piece's lane with the exact additional test/fixture paths.
  No production code, migration SQL, protected pin or permission was changed.

Local checks using installed dependencies:
- From packages/db, all 97 `src/*.test.ts` files passed in 33 sequential Vitest
  4.1.12 runs, each with at most three named files and `--maxWorkers=2` (875 tests
  at that point; log `/tmp/lp6e-repair2-db-unit.log`). After adding two installed-
  bridge cases, reran `src/later-outbox.test.ts src/lp6e-audit.test.ts
  src/serious-b10.test.ts` with `--maxWorkers=2`: 81 passed.
- From packages/db, `./node_modules/.bin/tsc -p tsconfig.json --noEmit`: PASS.
- Additional compiler-API check of changed integration sources with DB options,
  repository rootDir and API legacy-decorator options: no new diagnostics versus
  HEAD. Both have the same pre-existing TS2353 in purchase-order-audit's forged
  actor input; that unrelated negative test is unchanged.
- `LANE_BASE_REF=c2ec9e98adab349f60394b72415f390701ae458e node
  tools/agent-lane-boundary-lint.mjs`: PASS; `git diff --check`: PASS.

PostgreSQL and browser suites were NOT RUN: this sandbox cannot start PostgreSQL
or bind localhost. LP-6d-dependent failures remain for the router's restack and CI.
READY means ready for the router to commit this NOPR/RED repair, not independently
reviewed or ready to merge. No git writes, push, PR or release was performed.
