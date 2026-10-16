# LP-3 exact input, version 1 — isolated preparation

Status: synthetic, partial, not independently reviewed or accepted. No dispatcher, application caller, grant or database routine uses this module yet. Q1/Q2/Q5 and the independently checked C4 matrix stop the inseparable replacement/caller/withdrawal group. This document defines the standalone proposed binding; it does not establish exact authorization or a deployment arrangement.

Authority: the issued LP-3 header and addendum; current main BUILD_PLAN §11.8, C1–C8, §§5.1–5.5 and Appendix B. LP-0's `lp-command-binding-design-v1.md` still records no independent review. This contract does not fix LP-5's interface or implement LP-6 binding.

## Strict input

`lp3OperationV1Schema` accepts exactly one complete object, with no unknown fields or coercion. Every envelope starts with `version="lp3-input.v1"`, `operation`, `tenantId`, `actorMembershipId`, `jobId`. The server derives tenant and actor from existing authenticated access; including them in a digest does not authenticate them. They must later be compared independently in SQL.

UUIDs and SHA-256 values are lowercase; hashes have 64 hexadecimal characters. Money is integer GBP pence in `[0,1000000000000]`. Revisions are nonnegative PostgreSQL integers; document versions are positive PostgreSQL integers. Negative zero, absent nullable fields, NUL, unpaired surrogates and implicit defaults are refused. Names are already trimmed by validation before this envelope, with 1–160 UTF-16 code units; provider event identities have 1–200 code units. These conservative string bounds never accept more characters than PostgreSQL's existing limits. Unicode is preserved exactly, without normalization.

Requested times use valid Gregorian UTC strings `YYYY-MM-DDTHH:mm:ss.sssZ`, years 0001–9999, including exact milliseconds. Offsets, sub-millisecond strings and Date objects are refused at this internal envelope boundary. A caller adapter must validate its original input before constructing this representation; it must not round a supplied sub-millisecond value silently. Existing public response and request contracts are unchanged by this unused module.

## Significant fields and encoding order

The following fields follow the five common fields, in exactly this order. No field is optional.

| Operation | Ordered fields |
|---|---|
| `job.switch_live` | `acceptedDocumentId`, `acceptedDocumentVersion`, `acceptedDocumentHash`, `expectedJobRevision`, `acceptedNetValuePence`, `recoveryCapPence`, `mode`, `activationTermsVersion`, `feePolicyVersion`, `amountPence`, `currency`, `recipient`, `activatedAt` |
| `synthetic.settlement` | `obligationId`, `providerEventId`, `amountPence`, `currency`, `policyVersion`, `simulatedAt` |
| `quote.acceptance.attest` | `documentId`, `documentVersion`, `documentHash`, `expectedJobRevision`, `acceptedTotalPence`, `currency`, `statedCustomerName`, `statedMethod`, `acceptedAt`, `evidenceId`, `policyVersion` |
| `quote.declined`, `quote.superseded`, `quote.acceptance_cancelled` | `documentId`, `documentVersion`, `documentHash`, `expectedJobRevision`, `kind`, `occurredAt`, `amountPence`, `currency`, `recipient`, `policyVersion` |

Activation keeps `reference_fee_policy_v1` only. Pilot mode requires `pilot_no_charge.v1`, NULL amount/currency/recipient. Illustrative mode requires `synthetic_demo_illustrative.v1`, 7900/GBP and NULL recipient. The schema does not decide cap arithmetic or source validity; the checked database routine must recompute the existing half-even cap against the accepted snapshot.

Settlement requires 7900/GBP and `synthetic_demo_illustrative.v1`; the server must independently resolve its exact job from the obligation, and the routine must enforce `current_database()='jobguard_synthetic_demo'`. A matching envelope is insufficient permission to simulate settlement.

Acceptance requires GBP, `builder-attestation.v1`, an explicit NULL or UUID evidence reference, and an existing method (`verbal`, `email`, `message`, `signed-paper`). `statedCustomerName` is the exact authorization recipient. This remains builder attestation, not customer authentication. Disposition kind must agree with its operation; amount/currency/recipient are NULL and policy is `quote-disposition.v1`.

## Cross-language digest

Convert each ordered value to a token: strings unchanged; integers as canonical base-10 ASCII with no sign/leading zeros; NULL as the sentinel `-1:`. A non-NULL token becomes its UTF-8 byte length in decimal, then `:`, then its exact bytes. Concatenate all encoded tokens without separators. SHA-256 of that UTF-8 byte sequence is the lowercase payload digest. Example encodings: NULL `-1:`, integer zero `1:0`, `Café` `5:Café`. Prefix lengths make colons, line breaks and the literal `-1:` inside strings unambiguous. Object key order and JSON escaping have no effect.

TypeScript uses `Buffer.byteLength` and Node SHA-256. The proposed SQL encoder uses `octet_length(convert_to(token,'UTF8'))`, `string_agg(... ORDER BY ordinal)` and `encode(sha256(convert_to(canonical,'UTF8')),'hex')`. The new integration file checks this codec using independently named fields, Unicode, NULLs, large pence and UTC timestamp formatting. It has not run here and does not test an installed routine's validation or recomputation. SQL boundary parity for every routine remains outstanding.

## Requested facts, generated identities and replay

Activation, cap, obligation, acceptance, acceptance-event and settlement output UUIDs are generated identities and are excluded from this envelope. So are dispatcher-generated Decision/resolution/authorization IDs and command identity, which have separate linkage and uniqueness checks. Passing any of those fields, or a caller digest, in this object fails strict parsing. The first committed result must retain the generated identities on retry.

Expected revisions and all four operation timestamps are significant requested facts. `activatedAt` is server-selected on the first attempt but must be retained as that attempt's fact; retries cannot replace it with a new wall-clock value. Customer-supplied occurrence facts are likewise retained exactly. Approval/use recording still uses transaction-start time, expiry checks wall clock after waits, and audit wall clock ordered within the writing transaction. Nothing here changes CH-7-TERMS.

Future caller conversion must persist/reconstruct the original validated intent for retry, check current actor/resource access before replay, compare actor/type/resource/input, and retrieve the first receipt result. It must not reconstruct expected revision from today's mutable job, silently omit a timestamp, or return today's view as proof of replay. The current repositories still have their old behavior; no replay correction is claimed here.

The narrow dispatcher seam remains unimplemented with the stopped caller group: preserve unrelated request hashes; bind the validated LP-3 envelope to the consequential command's significant fields; compare the resulting receipt request hash in SQL using the actual command and routine arguments. SQL must independently reconstruct the envelope, then compare the payload hash and exact approved Decision/resolution/authorization. This proposal requires Q3 review alongside the early design note before wiring it in. No arbitrary client digest becomes approval.

## Persistence and migration requirements still outstanding

No SQL file is supplied. Reservation `0196` belongs to this order; the latest naming instruction uses `{mig}_activation_acceptance_checks.sql` for the eventual placeholder. Do not edit the shared migrator or MIGRATIONS.md. Add a migration note when the stopped migration is implemented.

The future side table is immutable, tenant/job-qualified, migration-owned, FORCE RLS and runtime SELECT-only. Receipt/authorization uniqueness and locked source checks precede audit. There is no historical approval-use backfill, new financial formula, direct protected-table write grant, real settlement, send or collection. Both old checked business semantics and v3 behavior must survive the full PostgreSQL suites.

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

That future proof must compare canonical named-column row text, full types and captured primary-key identities with nonempty seeded history. Rolled-back microsecond and type changes fail; later nullable columns, function replacement and inserted rows pass. No upgrade proof is claimed for this migration-free preparation.
