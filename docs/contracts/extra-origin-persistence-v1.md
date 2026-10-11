# ENT-4b extra origin persistence v1

Persistence/repository/audit only, synthetic_demo. No HTTP command surface, permission rule, pricing, commercial send or fee. ENT-3 owns the first route and revision. SH-1's original extraOriginV1 and command mapping remain unchanged.

`raise-extra.v1` is strict. Calling server code supplies the raising receipt type. Clients cannot supply tenant, origin kind, role, track, state, assignment, server time, order revision, origin hash or money. Note limit 5000; description limit 500. Optional SoR references name a version and code, never a rate. Excess capture mints a new scope identity and explicit variation lineage from a current instructed line.

## Stored facts

`extra_origin`: existing identity/track/receipt fields plus nullable command_type, raising_grant_id, raiser_assigned, work_order_id, work_order_revision_id, site_visit_id, evidence_id, resident_confirmation_evidence_id, client_capture_id, origin_hash. All ten are NULL for small-builder rows and contractor fixture jobs. Mandatory work-order provenance is populated by one new insert trigger after SH-1's validator. It overwrites command type, current order/revision, assigned fact, evidence hash and origin hash. SH-1 overwrites server time and source capture hash. Active contractor membership and a non-revoked grant owned by the same member, matching their membership role, must cover the job via tenant, team, branch or region. This is structural scope, with no role-per-command check. A visit must belong to that job and member; both evidence references use tenant/job-qualified keys. The receipt must be processing and actor/type/semantic identity match SH-1's rule.

`extra_event`: append-only lifecycle facts, server time and gapless sequence per variation, starting at 1 with logged (and only logged at 1). Kinds are ENT-4a's twelve enterpriseStates. The first event uses the origin receipt. An optional revision is bound to the same extra and job. Only logged is written by this repository; transition authority belongs to ENT-5. `variation.state` is untouched.

`extra_duplicate_link`: immutable link/unlink rows, composite tenant/job keys to both extras and to the reversed link. Link rows have no reason/reversal; unlink rows require a reason token and their exact link, which can be reversed once. An active link has no reversing row. A duplicate can have one active parent; no extra can be both duplicate and canonical, preventing chains/cycles. A per-job advisory transaction lock serialises checks. An exported event on either endpoint refuses both kinds. Guards support unlink rows, but no unlink receipt type or repository function is shipped (Q9, no command named in plan).

`extra_order_line_link`: one link per extra and per instructing line; work order/revision/scope keys bind the line to the extra's job and order. The instructing revision number must be strictly later than the origin's order revision. Origin fields/hash remain unchanged. ENT-6 owes billed-once/export proof; ENT-7 owns post-export reconciliation.

All new tables: non-null tenant, migration ownership, enabled/FORCE RLS, exactly SELECT/INSERT runtime rights, immutable UPDATE/DELETE triggers. RLS protects rows within a correctly stamped/authenticated tenant context, not a compromised privileged connection or false tenant selector. Public repository methods accept the stamped context per call and read only tenantId; context is never stored or returned.

## Receipts, retries and audit

Request hashes use merged canonicalJson/sha256Hex, excluding commandId. Extra IDs use merged derivedUuid(`extra:<tenant>:<job>:<capture-or-command>`). Nullable client capture ID is unique per tenant/job; equal payload/type retries return the first result without claiming another receipt; conflicting payload/type is COMMAND_CONFLICT. Receipt claim/replay uses SH-1/dispatcher INSERT ON CONFLICT and exact stored hash/status/result. No external network calls.

Raising types: LogSiteExtra, ConfirmPrompt (held on work-order jobs), RecordOfficeExtra, RecordClientInstruction. Semantic key: `extra-origin:<job>:<extra>`. MarkDuplicate link key: `extra-duplicate:<job>:<duplicate>:<canonical>:<command>`; including the command permits later relinking after immutable reversal, while active-link guards prohibit duplicate effects. Order link type RecordClientInstruction, key `extra-order-line:<job>:<extra>`.

One transaction locks business facts, claims receipt, creates scope/variation/origin/logged event, runs the optional future-leaf seam, appends audit, and completes receipt. Link calls use the same pattern. No new business lock follows audit append. Deferred checks require one logged event and one matching raised audit for each work-order origin, and each link row's exact-ID audit; direct SQL missing these fails commit. The seam may append the future leaf's own rows, before audit; it must not append or alter origins, this leaf's events, receipts or audit itself.

Audit subject type `extra`. Allowed keys:

| Event | references | hashes |
|---|---|---|
| contractor.extra.raised | command, job, extra, environment | origin |
| contractor.extra.duplicate_linked / duplicate_unlinked | command, job, duplicate, canonical, link, environment | none |
| contractor.extra.order_line_linked | command, job, extra, link, work_order, revision, scope, environment | none |

Every reference value is a UUID except the closed token `synthetic_demo` for environment. Hashes are lower-case SHA-256. Note/description/device/capture times never enter audit. Errors are closed codes, with no PostgreSQL detail or client free text.

Duplicate groups return persisted read records and canonical identity; effectiveOrigin is selected by ENT-4a, not a new ordering rule. Its internal full-schema adapter uses persisted origins and structural grant IDs plus inert unknown commercial fields; the adapter is neither returned nor used for fee/eligibility decisions.

## extra-origin-hash.v1

SHA-256 of UTF-8 bytes: prefix `extra-origin-hash.v1` plus LF, followed by the following fields in exact order. Each NULL encodes `N;`; each non-NULL encodes `S<byte length>:<value>;`. Booleans are `true`/`false`. Timestamps are PostgreSQL UTC text `YYYY-MM-DDTHH:MM:SS.ffffffZ`, always six fractional digits, read as text and never through JavaScript Date. Length is UTF-8 octets, not characters. UUIDs use PostgreSQL's lower-case text; text is otherwise unchanged.

1. tenantId
2. jobId
3. variationId
4. jobTrack
5. kind
6. provenance
7. commandId
8. commandType
9. raisingMembershipId
10. raisingRole
11. raisingGrantId
12. raiserAssigned
13. serverRecordedAt
14. deviceId
15. deviceCapturedAt
16. clientCaptureId
17. workOrderId
18. workOrderRevisionId
19. siteVisitId
20. evidenceId
21. evidenceHash
22. residentConfirmationEvidenceId
23. sourceCaptureKind
24. sourceCaptureHash

Links, events, later instructions and mutable projections are excluded. The pure mirror reuses core's platform-independent SHA-256 implementation.

Worked vector: UUID(n) = `00000000-0000-4000-8000-` plus n padded to twelve decimal digits. Fields in order:
`[UUID(1), UUID(2), UUID(3), contractor, site_user, command, UUID(4), LogSiteExtra, UUID(5), operative, UUID(6), true, 2026-10-11T12:34:56.123456Z, fictional-device, 2026-10-11T12:30:00.000001Z, UUID(7), UUID(8), UUID(9), NULL, NULL, NULL, NULL, text, a repeated 64 times]`.
Digest: 461292ec6f37346ad387cf7499f2e15f538b564d7f18adf86de26524fb358654. The same literal record and digest are in core tests; the digest was computed independently with Python hashlib before implementation.

## Held items and release gates

Q3: role-per-command authority needs founder ruling before ENT-3. Q4: first-route stamped-context bridge belongs to ENT-3; scanner/pinned files untouched. Q5: cached variation.state expansion/transition rules belong to ENT-5. Q6: prompt table/FK/provenance belongs to ENT-8a; jobguard_surfaced_confirmed refused on work-order jobs. Q9: unlink command/type/authority held because plan names no command. No fee assertions; D16, G1 and ENT-14 still gate release. SV-2 shares extra_origin; both origin suites must run on the merged result.

Open read-contract conflict: the unchanged SH-1 extraOriginV1 cannot represent legacy/backfilled origins with NULL command/member IDs. R4's legacy read is held pending an issued schema ruling; do not fabricate UUIDs. Command-origin reads use the unchanged schema.
