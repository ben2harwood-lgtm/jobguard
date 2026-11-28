K6A (RED) — local inbound address and routing

2072 is installed only by tools/v2/bootstrap.mjs after the checked 2001 V2
retargeting migration. It is deliberately outside the shared migrate() runner:
normal environments and the predecessor purchase-order audit installation do
not acquire these tables. The purchase-order audit suite needs no shared-schema
exemption for this local migration.

Three tables retain the bound firm namespace, including linked firms sharing
the practice tenant. All have forced RLS and no runtime DELETE/TRUNCATE grants.
Only routing state, links and command results are mutable; original sender/subject/receive time
and replay hashes stay immutable. File links use a tenant/job/document FK.

No existing data is rewritten. Bootstrap reruns retain addresses and items.
Forward fix: stop the V2 launcher, apply a reviewed successor migration and
restart. Preserve rows for investigation; do not drop the tables on rollback.
Disable the feature by leaving JOBGUARD_LOCAL_V2 unset outside the rehearsal.

The intake adapter composes the existing intake in the caller's transaction;
its inner BEGIN/COMMIT/ROLLBACK/release do not own that transaction. All business
SQL, live-job checks, replay claims and supplier audit calls remain unchanged.
The existing intake uses its fixed practice alias after K6A has checked the
random inbound address. One inbound event is added per routing command; the
existing intake also records its own supplier_document.intake event. Both roll
back together. The supplier document remains a proposal for the existing fact
confirmation and three-way check; forwarding cannot confirm money facts.

The catcher accepts authenticated same-origin local fixture messages only.
Sender matching uses only the V2 seed's invented merchant identity and existing
material requirements. Exact UUID job references take precedence; unknown,
conflicting or foreign references wait. Body text and attachment bytes are not
stored. Missing/invalid fixture IDs and attachment metadata produce needs_k6b.
No real provider, files, AI, outbound delivery, stock effect or production route.

Proof specification: tools/v2/migration-proofs/2072_v2_inbound_mail.json.
Real PostgreSQL, full seeded suite, Playwright at 360/1280 and Mac phone-mode
execution remain required outside the builder sandbox; this note is not a pass.

Handoff commands (after rebuilding the API/DB and restarting the checked launcher):

    JOBGUARD_ENV=synthetic_demo JOBGUARD_LOCAL_V2=1 JOBGUARD_V2_BACKEND=embedded node --test tools/v2/seed.integration.test.mjs
    JOBGUARD_ENV=synthetic_demo JOBGUARD_LOCAL_V2=1 node --test tools/v2/inbound-mail.browser.test.mjs

For the Mac phone run, set AUTH_ALLOWED_ORIGIN to the existing checked HTTPS LAN
origin and run the same browser file. It reuses one login at 360 and 1280 pixels.
Open /inbound-mail in the signed-in practice firm. The seeded quote must first
be switched live through its normal no-charge command, as the seeded proof does.

Renumbered 2023 -> 2063 -> 2072 above v2/main and the open V2 slices (2063 is D3 in the V2 migration register). app.v2_inbound_item
is firm-locked (FL-K6). Unrouted mail has no job yet, so its restrictive `v2_practice_firm` is
`firm_key = app.current_firm_profile_key()` on the item's own NOT NULL firm_key (set from the
mailbox's firm), and a separate restrictive `v2_practice_job` requires a visible app.job row
whenever job_id is set. The FL guard accepts that form only for a direct table whose job_id is
nullable and whose firm_key is NOT NULL; every other direct table must still join app.job.
