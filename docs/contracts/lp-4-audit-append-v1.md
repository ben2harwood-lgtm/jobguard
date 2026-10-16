# LP-4 audit append preparation v1 — 16 October 2026

Status: partial, synthetic, parked. This document specifies the standalone candidate codec only. No database append, privilege withdrawal, owner-writer conversion, side table, historical rewrite, rollout or authority protection has been installed. LP-3 stopped before its cutover. Fresh Opus/Sol reviews and separate acceptance are outstanding.

The current main is 31682762c903d716657c573e1b5deae63588aad7; build-ahead base is LP-3 HEAD d517116bb73000a92e49d6742ceef830f7aafa56. Main §11.8, the issued header/addendum and protected-source restrictions govern. The draft's migration/line offsets are not current. See the exact coordinator findings in `docs/verdicts/LP-4/PROPOSED-COORDINATOR-CHANGES.md`.

## Delivered boundary

Additive exports in `packages/db/src/audit.ts` prepare a lower-trust format. The existing package export-star exposes these pure functions, but no writer, reader, handler or export uses them. Existing v1 code is byte-for-byte preserved as a prefix of that file. The production v1 constraint still rejects the proposed version. This is not mixed-history support.

`auditStatementInputV2Schema` accepts exactly version `audit-statement-input.v2`, id, subjectType, subjectRef and payload. It accepts an object, not raw JSON text. Sequence, tenant, actor, time, hashes, trust and event family are forbidden input fields. Database SQL validation and duplicate-key rejection at the raw JSON boundary are unbuilt; decoding JSON to jsonb before checking duplicate keys cannot prove their absence.

The candidate stored statement schema accepts exactly version `audit.statement.v2`, id, tenantId, sequence, actorRef, eventType, subjectType, subjectRef, occurredAt, payload, payloadHash, previousHash, trust and eventHash. The eventType is always `audit.statement.recorded`; trust is always `caller_statement`. It has no checked-operation selector. Even a valid hash never authenticates an actor, establishes approval/payment/completion, or proves a connected chain. A caller statement must be presented as such by future readers; the current export format has not been expanded to accept it.

IDs and tenant IDs use lowercase UUID text. Sequence is canonical positive decimal text bounded by PostgreSQL bigint (1 through 9223372036854775807), without a floating-point conversion. The timestamp is a real calendar date (years 0001–9999) in UTC with exactly six fractional digits, e.g. 2026-10-16T12:01:02.123456Z. The original string is retained. Date is used only for a calendar validity check; it never supplies canonical timestamp bytes. Database wall-clock allocation and waits remain unimplemented.

Payload permits only the legacy identifier-reference, digest and classification maps, using existing ASCII identifier rules. No free text, arrays, scalar payloads, nested objects, null map values or explicit undefined values are accepted. Map keys cannot reproduce envelope-field names after ASCII punctuation removal and case folding. Prototype-related map keys are refused before Zod record processing can omit them. Arbitrary raw JSON parser behavior is outside this object codec.

## Candidate canonical bytes

Canonical JSON recursively sorts keys by ASCII code unit (identical to UTF-8 byte order for the permitted alphabet), with no whitespace. Keys and values are JSON quoted; integer-looking object keys are sorted lexically, never by JavaScript enumeration order. Sorting does not use localeCompare. The only primitive types are schema-constrained strings and the previousHash null. Unicode identifiers, numbers, arrays and undefined are refused at the schemas.

Payload hash is lowercase hex SHA-256 of the UTF-8 canonical payload. Event hash is lowercase hex SHA-256 of canonical envelope JSON omitting payload and eventHash. Payload is bound through payloadHash. All other fields, including id, trust and the exact timestamp, are bound. This candidate differs deliberately from historical v1, which is never rehashed or relabelled. No accepted SQL byte parity is claimed until PostgreSQL vectors execute.

The fixture payload `{ "references": { "source": "fixture:1" }, "classifications": { "action": "operational" } }` hashes to `a139b9135e9ab4ffdeab3500acae7ca4e2e548762c7708e4386589a073bef5b9`. Its full envelope vector in the new unit file hashes to `4bc1570d6da4009de1a42d2b251247d3d213f686684085d574440816be67819e`. Python json.dumps with sorted keys/compact separators plus hashlib produced these independent expected values. The TypeScript tests have not run because of the disk gate.

`verifyAuditStatementV2` checks one statement's strict schema, payload hash and event hash and returns the validated object; invalid input/hash raises AuditVerificationError. It does not verify sequence connectivity, checkpoint trust, permission, evidence authenticity, human intent or historical completeness. There is no trusted-event encoder or append grant in this preparation.

## Stopped database contract

The adopted Q6 lean requires the reviewer to specify the smallest checked-operation integration; none is recorded in the early design note. Current dispatcher receipts, resolutions and authorizations remain writable. Selecting them cannot turn a generic append into checked provenance. Moving that lifecycle out of its assigned LP-5 lane would require an enumerated coordinator amendment. No generic trusted helper was added.

No side table is designed or installed in this partial build, and no DDL or ownership proposal is represented as reviewed. The complete versioned stored/export representation and checked-operation source binding still need review. No runtime access reduction can land independently of every caller, every owner writer, verifier/export conversion and C4 matrix. The old/new caller incompatibility and protected fault-injection/inventory prerequisites are recorded rather than worked around. No legacy entry is retroactively authenticated.

Reservation: header number 0197. The later binding instruction requires an eventual `{mig}_lp_4_audit_append.sql` placeholder and per-piece migration note, without editing migrate.ts or MIGRATIONS.md. No SQL artifact or empty migration is created while the inseparable group is stopped. No new GRANT exists.

## Caller inventory — source evidence only

The following 39 files contain the central append seam or callers on this base. Literal/template event types are recorded below. Dynamic/forwarded inputs are not a complete event-family expansion; these rows are not behavioral or authority proof. Current authority comes from existing application checks and, where present, domain SQL checks; the central logger itself checks neither. Each eventual conversion must establish its own checked provenance and preserve its existing permission/refusal/replay behavior.

| Source under packages/db/src | Observed event names or templates | Conversion disposition |
| --- | --- | --- |
| `audit-checkpoint-handoff.ts` | `audit.checkpoint.handed_off` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `audit-export-repository.ts` | `audit.export.created`; `audit.export.refused` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `audit.ts` | `central legacy sealing; candidate standalone statement codec` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `commands.ts` | `command.succeeded`; `finding.resolved` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `commercial-integrity-application-repository.ts` | `commercial_integrity.reviewed` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `contractor-party-repository.ts` | `contractor.parties.${action}` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `contractor-practice-session-repository.ts` | `contractor.practice_session.revoked` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `contractor-repository.ts` | `commercial_track.assigned`; `contractor.${command.kind}` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `customer-billing-repository.ts` | `command.succeeded`; `customer_invoice.synthetic_issued`; `customer_payment.recorded` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `discrepancy-repository.ts` | `discrepancy.${input.outcome}`; `discrepancy.evaluated`; `supplier_bill.superseded` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `evidence-pack-repository.ts` | `evidence_pack.attachment_approved`; `evidence_pack.generated` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `extra-approval-chain-repository.ts` | dynamic / forwarded event inputs; exact expansion still required | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `extra-repository.ts` | dynamic / forwarded event inputs; exact expansion still required | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `final-account-repository.ts` | `final_account.draft_assembled` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `inbox-relevance-repository.ts` | dynamic / forwarded event inputs; exact expansion still required | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `job-parties-repository.ts` | `job.parties.${input.action}` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `ledger.ts` | `financial.journal_posted` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `northside-run.ts` | `northside.settings.recorded` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `practice-feed-repository.ts` | `practice_feed.${input.action}`; `practice_feed.claimed` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `practice-invoice-repository.ts` | `customer_credit_note.synthetic_approved`; `customer_invoice.synthetic_issued`; `customer_payment.synthetic_recorded`; `customer_payment.synthetic_reversed` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `practice-worker-switch-repository.ts` | `practice.worker_switch.ended`; `practice.worker_switch.refused`; `practice.worker_switch.started` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `prevention-check-repository.ts` | `prevention.${input.action}` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `proof-repository.ts` | `proof.completed`; `proof.rework_required` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `quote-repository.ts` | `quote.draft.saved` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `readiness-repository.ts` | `readiness.evaluated`; `readiness.plan_confirmed`; `readiness.review_due` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `recovery-allocation-repository.ts` | `recovery.allocation.${input.action}` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `recovery-case-repository.ts` | `recovery.${input.action}`; `recovery.eligibility.${input.action}` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `recovery-eligibility-v3-repository.ts` | `recovery.eligibility.v3_reviewed` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `recovery-follow-up-repository.ts` | `recovery.follow_up.${kind}`; `recovery.follow_up.became_due`; `recovery.message.${kind}` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `recovery-message-repository.ts` | `recovery.message.${kind}` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `recovery-payment-payer-repository.ts` | dynamic / forwarded event inputs; exact expansion still required | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `sandbox-repository.ts` | `sandbox.run.advanced`; `sandbox.run.archived`; `sandbox.run.created` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `site-extra-repository.ts` | `contractor.extra.refused`; `contractor.extra.resident_confirmation_recorded` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `site-visit-repository.ts` | `contractor.visit.completed`; `contractor.visit.refused`; `contractor.visit.started` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `sor-repository.ts` | `contractor.sor_version.imported` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `supplier-document-repository.ts` | `goods_receipt.appended`; `supplier_document.intake`; `supplier_facts.confirmed` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `supplier-match-repository.ts` | `supplier_match.confirmed`; `supplier_match.corrected`; `supplier_match.proposed` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `variation-repository.ts` | `variation.approved`; `variation.builder_logged`; `variation.final_review_added`; `variation.withdrawal_recorded` | Existing server caller; checked provenance and behavioral conversion unbuilt. |
| `work-order-repository.ts` | `contractor.parties.bound`; `contractor.work_order.${action}`; `contractor.work_order_import.recorded` | Existing server caller; checked provenance and behavioral conversion unbuilt. |

`extra-approval-chain`, `extra`, `inbox-relevance` and `recovery-payment-payer` forward dynamic events; those exact branches still require manual expansion and behavioral cases. Source scanning alone cannot satisfy LP4-22. No caller-inventory test pins source text or hashes.

## SQL and identity writers — current definitions

| Writer | Current source | Required conversion; presently unbuilt |
| --- | --- | --- |
| app.append_final_lock_audit | 0132_final_account_lock.sql:132–145 | Preserve lock/disposition/terms/invoice event identities; delegate sealing after all checked business facts. |
| app.append_shadow_audit | 0128_shadow_persistence.sql:202–216 | Preserve private execution, disclosure and emergency-access semantics; delegate sealing. |
| app.surface_shadow_signal_early | 0133_shadow_detection.sql:105–114 | Preserve disclosure before firing audit, atomicity and no later business locks. |
| identity.sso_audit_head / sso_audit_append | 0120_enterprise_identity.sql:233–246 | Withdraw caller-chosen sequence/time/hash; preserve connection/admin boundaries and refusal logging. |
| EnterpriseIdentityRepository.audit | enterprise-identity-repository.ts:56–61 | Stop constructing the SSO envelope on the client. Source unchanged pending complete integration. |
| app.evaluate_recovery_follow_ups | 0154_follow_up_clock_fence.sql:73–146 | Supersedes 0115; preserve invoker behavior, run fencing and unique time_advanced then became_due. No broad definer elevation. |
| app.ch4_append_fact_audit | 0144_job_work_state.sql:303–316 | Preserve deferred append, actor recheck after waits, source identities, context restoration and rollback. |
| privileged checkpoint handoff | audit-checkpoint-handoff.ts:36–67 | Retain operator connection, serialize via protected path, keep checkpoint controls private; never switch to runtime to regain revoked helpers. |

The SQL direct-INSERT search returned seven migration files: 0115, 0120, 0128, 0132, 0133, 0144 and 0154. 0115's follow-up implementation is superseded by 0154. No additional installed definition was inferred solely from a stale migration. The effective catalog still needs actual PostgreSQL confirmation.

## Required proof after coordinator prerequisites

The 27 proposed-format unit cases cover parts of LP4-04/05/07/08/09/10/16 only. No complete acceptance row is passed. Actual-role refusal/inheritance/wrapper/context tests, forged source tests, SQL parity, clock waits, concurrency, rollback/retry, owner-writer positives/refusals, six contractor replay properties, mixed legacy/new checkpoint/export/handoff and upgrade controls remain unbuilt and unexecuted.

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

Future proof must use unchanged upgrade-proof-utils.ts: canonical database row text on named old columns; full name/type snapshots; captured primary-key identities; nonempty old rows; microsecond/retype/missing/changed-row failing controls and later nullable-column/function/later-insert passing controls in rolled-back transactions. No upgrade proof is claimed for this code-only preparation.
