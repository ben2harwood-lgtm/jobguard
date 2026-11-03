# ENT-3 priced capture v2

`POST /contractor/jobs/:id/site-extras/sor` accepts `log-sor-site-extra.v2`
alongside the unchanged strict v1 body. The response remains
`sor-site-extra-logged.v1`; prices are server calculated and are not returned
to the operative by this contract.

V2 adds reviewed `description`, required `photoEvidenceId`, required
`residentConfirmation: { shownContentSha256 }`, and optional `siteVisitId`.
It uses the existing `site-extra-content.v1` and server-written
`resident-confirmation.v1` formats. The resident's identity is not verified.
All v1 fields retain their meaning, including total claimed quantity.
Neither version accepts tenant, actor, role, origin, price or server time.

V2 uses the same session, entitlement, tenant and live-job authority, the
same `LogSiteExtra` command, and the existing `raiseExtra` transaction. Photo
verification and confirmation recording reuse ENT-3d. Stored-origin photo,
confirmation and open-visit checks run inside the raising transaction before
the SoR revision and final audit append. No runtime receipt write, role,
grant or migration is added. Confirmation recording retains ENT-3d's
separate audited transaction; a later refusal may leave that evidence but
cannot create a priced extra. Missing photo/confirmation fields are
`INVALID_COMMAND`; invalid photos are `PHOTO_NOT_ACCEPTED` (422) and a
different shown hash is `CONFIRMATION_MISMATCH` (422).

The request hash includes the v2 version, text, photo, confirmation and visit
alongside the original pricing inputs. It preserves the v1 hash bytes.
Replay checks actor, job and request hash before looking up current pricing
or evidence. Different v2 content with the same command is
`IDEMPOTENCY_CONFLICT`; retries cannot upgrade a v1 command to v2.

Q10 still requires typed SoR search; there is no recent-item list. The screen
shows the persisted fictional proceed limit as a comparison only. It grants
no permission to work. Work-status capture and persistence, automatic
submission into the approval chain, the already-on-order supervisor-query
command, real browser speed/accessibility proof and independent RED review
remain open ENT-3 acceptance work. The practice screen labels work timing
unavailable rather than claiming that a status was saved.
