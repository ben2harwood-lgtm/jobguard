# Extra evidence pack timing v1 — ENT-5-PACK-TIMING

Synthetic practice only. ENT-5 is still not complete. This amendment supersedes
only the timing omission on newly assembled extra source packs.

Decision: new extra-pack artifacts carry the server-derived timing exactly as the
existing projection gives it: the linked visit interval bounds, its uncertainty
state, and doneWithoutRequiredPreapproval as true, false, uncertain or not_derived.
No new timing logic, no invented exact times.

The tenant-scoped source loader calls the existing readExtraApprovalTiming
projection for the exact request already selected for the pack. Earlier frozen
requirements remain part of that projection. An extra without a request uses a
nil request identity for the projection's empty request selection; visit bounds
still come from the linked visit. This adds no approval or timing derivation.
The existing authenticated withTenant boundary and verified origin/job identity
precede this internal read; it grants no client access or commercial authority.

Each new pack requires one approval-kind source named
`extra_approval_timing:<extraId>`, source version 2, with JSON content version
`extra-pack-timing.v1`. Its content is the unchanged projection's workTiming,
doneWithoutRequiredPreapproval and approvalTimings. workTiming is null without a
linked visit; otherwise it contains source=site_visit, visitId, recorded startedAt,
nullable finishedAt, and uncertainty=during_this_visit. These are interval bounds,
never exact per-extra times. Uncertain and not_derived values are retained.
The source is a snapshot: later approvals or visit completion do not rewrite an
already assembled artifact. It is not an immutable stored timing event.

The wrapper remains extra-source-pack.v1 and the shared manifest/export/verifier
remain unchanged. The timing content is sealed through the existing source hash
and manifest digest. Field edits are refused by the content schema or detected by
the shared hash verification. As before, a self-consistently rewritten artifact
needs persisted-source comparison or an independently trusted manifest digest to
establish authenticity. The timing snapshot cannot attest to its own authenticity.

Both earlier omission variants remain readable and verifiable unchanged:
`Extra work timing HELD` and
`Approval requirement, steps and extra work timing HELD`.
New artifacts carry neither timing omission and always retain
`Client access HELD` and `Export and send HELD`, alongside source-specific
omissions. completeApprovalPack remains false. Actor-bound pack revision creation
is outside this slice. No export, send, client access, provider or fee is enabled.

No database migration or new grants are needed: the existing runtime timing read
and tenant-scoped sources suffice. Reserved migration 0860 remains unused.
Roll forward by changing new assembly only; preserve earlier artifact bytes.

Validation: core tests cover current content, all four breach flag values, null
visit and open finish, both legacy formats and timing-field tampering. The new
extra-evidence-pack-timing.integration.test.ts compares the source to the existing
projection on synthetic contractor jobs for a finished-visit breach, uncertain
overlap and absent visit; it also checks foreign-tenant and wrong-job refusal.
Database execution belongs to CI in this restricted sandbox. Independent RED
review at the committed head and green CI remain landing requirements.
