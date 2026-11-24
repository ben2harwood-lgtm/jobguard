# JobGuard V2 build plan

**From the first walk-round to customer handover**

24 November 2026 · Small-builder track · Revision 1.3 · Separate V2 implementation plan · Replaces revision 1.2 (21 November)

## In plain words

Today JobGuard helps a builder quote, catch extras and get paid. V2 makes it run the whole job. The builder describes the job once. JobGuard then prepares the work plan, the buying list, instructions for each trade, the customer's choices and a view of what is ready tomorrow. Each update from site feeds progress, changes and the final handover pack. The builder still makes the professional calls and approves anything that commits the firm.

**Build now:** the first milestone, chunks A, C and D, comes first. On 24 November Ben also gave a go for the later chunks "as long as they can be done safely", so a later piece may start before D passes when it depends only on built work, clashes with no piece in flight and, if it is a first cut or RED, has had Astra's plan check. Revision 1.3 adds fifteen small pieces that take JobGuard's work the last step to the customer, the crew or the money (section 2A).

## What changed from revision 1.2

1. **Fifteen small additions placed (section 2A), and twelve more (section 2B), accepted by Ben.** From the builder usefulness review of 24 November (`/mnt/project-files/jobguard-research/builder-usefulness-review-2026-11-24.md`, project files). Each is placed in an existing chunk or in the new chunk K, with its order and dependencies. Where BUILD_PLAN.md rev 3.0 already has the item, V2 builds only a practice slice and cross-references it; BUILD_PLAN.md's order for real use is unchanged.
2. **New chunk K, "reach the customer, crew and money".** Holds the additions that fit no existing chunk: chasing, deposits, the Friday update, share to WhatsApp, calendar links, merchant email forwarding and an accountant export.
3. **Ben's go for the later chunks (24 Nov, 19:49 UK).** "Build the later chunks as well as long as they can be done safely." The rule for "safely" is in "In plain words" above.
4. **B2 practice decisions made (24 Nov, 19:55 UK).** Ben accepted four offline answers for practice use only: photos encrypted on the phone, unsent work never silently deleted, unsent work kept up to 14 days, offline capture up to 72 hours with the phone clock never trusted (project file `jobguard-v2/b2-offline-decisions.md`). v2-b2a is done for practice. The D08 record on main is unchanged and real-data approval stays closed until G3.
5. **Piece D5 split** into v2-d5a (Measurements screen, needs only d1) and v2-d5b (product picking, Materials and Briefs, after d3 and d4).
6. **Ben's decisions recorded (24 Nov, 20:40 UK).** Ben agreed with the recommendation on all six questions in section 8: practice slices of BUILD_PLAN.md items, sends built now but caught locally, the chasing defaults, the accountant export as a live-app quick win, the second group (2B) accepted in full, and idea B "not now". Section 9 is a paradigm check and section 10 lists the review's big ideas, which are not plan text.
7. **The full build order to the end of V2 is in section 2C.**
8. **Plan now lives with V2.** Revisions 1.2 and 1.3 are saved on `v2/main` under `reviews/v2/`, not only on the old coordinator's briefs branch.

## What changed from revision 1.1

1. **Brought up to date.** The starting point is now JobGuard main at `ee974f0343fee3822f952b0299bc1f4c2ac8ad3d` (21 November, 05:50). Revision 1.1 was pinned 38 changes earlier. The phone app's offline groundwork (M3-3, M3-4, M3-5) merged in pull request 868, so chunk B2 is rewritten.
2. **Cut into small pieces.** Every chunk is now a list of pieces, each one pull request with its own "done when". The pieces for A, C and D are final. The pieces for B, E, F, G and H are a first cut, to be re-checked against main when each chunk is issued.
3. **Screens described.** Section 3 says what the builder, trade and customer see on each screen, and where it sits in the existing app.
4. **Chunk A is lighter.** V2 runs only on this Mac, so the inventory of hosted resources and the proof of separation from Tommy's demo are replaced by one start-up check. The full version returns before V2 is hosted anywhere.
5. **More than one job type, cheaply.** The job template is data, not code, and a custom item can be planned by hand. Adding a job type is a data file plus a worked example.
6. **Fairer trial.** Each firm does two different matched jobs, one per method, with order and pairing balanced. The result is treated as a guide, not proof.

## Boundaries

- **Additive.** V2 adds to JobGuard. The existing repository rules still govern customer authority, the explicit Switch live step, money, offline security and release.
- **Out of scope.** Full Gantt planning, new commercial terms and contractor-track changes.
- **Tommy's demo.** V2 is built in its own worktree with its own local database, sign-ins and made-up jobs. It never uses the demo's address, launcher, sign-ins or jobs, and never copies a demo job.
- **Never on main.** V2 pieces open pull requests against a separate `v2/main` branch, never JobGuard main, and are excluded from auto-merge to main. The hosted demo is built from main and runs every database change it finds there, so merging any V2 code into main counts as hosting: the full revision 1.1 separation proof and an independent check of the demo come first.
- **Before the first piece is sent out.** Confirm the automatic checks and merge tools work for pull requests aimed at `v2/main`, and that nothing auto-merges them into main.
- **Admission.** Putting V2 pieces into the JobGuard build queue is a separate decision in the existing build process. This plan issues nothing.
- **Evidence words.** "Present" means the code or named test exists at the pinned revision. Names were spot-checked for revision 1.2; the test suites were not run. A made-up browser journey, a reviewed plan and a real-phone result are three different kinds of evidence.
- **Piece names.** Pieces are lowercase (`v2-a1`, `v2-c3`) to avoid branch-name clashes on this Mac. "Release gate G1, G2, G3" always means the existing release gates, never a V2 piece.

## 1. What exists and what V2 must add

- **Site visit and quote.** Present: on-device dictation, typed fallback, checked text, cited scope lines, questions, pricing, firm-rate suggestions, quote revisions and exact acceptance. Missing: one room-by-room camera and voice session, photo-to-note links the builder can correct, and a real-phone rehearsal of that combined flow.
- **Work planning.** Present: persistent job and scope identities, a frozen accepted quote, scheduled readiness facts, dependency checks and candidate substitute tasks. Missing: turning approved scope into a plan the firm can edit, trade assignments and instructions, choice deadlines and clashes across jobs.
- **Buying and deliveries.** Present: order prechecks, supplier document intake, confirmed supplier facts, goods receipts and three-way matching in made-up workflows. Missing: quantities and pack lists worked out from the quote, required-by dates, merchant enquiries, reply tracking and a delivery slip that updates the work plan.
- **Site updates and decisions.** Present: diary, proof stages, verified evidence, decisions, variations and customer-portal test flows. Missing: briefs per trade, choice and availability requests with a named reply owner, a tomorrow view and site progress that updates all affected work. Real merchant availability and live message delivery need provider evidence.
- **Close-out.** Present: work state, snagging-photo purpose, final-account lock, Final Check, original and supplementary invoice, recorded-receipt paths. Missing: a snag register with owners, a customer-safe handover pack and a record of the exact version shared. No handover code exists today. The internal recovery evidence bundle has a different audience.
- **Offline and phone app.** Present on main since pull request 868: a phone app shell (`apps/mobile`), a download connection for assigned jobs, a durable command queue with a reconciliation screen, and resumable upload of small made-up photo and sound attachments, with the capture screen showing local-only, uploading, verified, rejected and conflict states. All of it uses made-up data and is not connected to real sign-in. Encryption in tests is a stand-in, not the real phone engine. Still held: real camera and microphone capture, general encrypted media files, the six open decisions listed with the phone-app work (D08 offline reading and clock, D08 unsynced work, D08 encrypted media, the D04/D08 sync route, phone sign-in and recovery, and release gate G3 acceptance), and every row of the physical-device matrix, which is blank. Support claims must name the build and device actually passed.

## 2. Build order and pieces

**Order.** First milestone: A → C → D, starting from an accepted quote made in V2. In parallel after A, B1 adds the online phone walk. After D, E and F can proceed independently, then join for blocked work and price-changing choices. G needs F. H needs B1 and C to G. B2 is a separate offline milestone. Live third-party actions need their own release evidence. Chunk K (new in 1.3) runs alongside E and F; its pieces say what each one needs, and none sends anything outside the local catcher until the sends are approved (section 8).

**Rules for every piece.** One owner, one pull request, one "done when". Before starting, check main for newer work and narrow the piece to what is still missing. Pieces marked **RED** touch money, keeping firms' data apart, hidden findings or commitments, and get one independent check before merging. **Any piece that adds a database table or migration is RED**, and its "done when" includes: on real PostgreSQL with row-level security forced (the database rule that stops one firm reading another's rows), the second firm's session can read and write none of its rows. Any piece that adds or changes a screen first gets a clickable mock-up checked against section 3 (see the screen rule there).

### A · A separate local rehearsal job

Owner: platform and QA. Depends on: the pinned source.

- **v2-a1 · Local V2 environment.** A V2 worktree that runs only on this Mac with its own port, its own made-up sign-ins and its own seed. V2 uses its own separate local PostgreSQL server and storage folder, not just a separate database on a shared server, because database setup changes logins and passwords that a shared server would share with other environments. Before any setup, database change, seed, background worker or app start, check the exact V2 database server, database and storage targets against the V2 settings and refuse anything else, including other databases on this Mac. Every outbound message (email, text, merchant, payment, error reporting) goes to a local catcher. A start-up check refuses to run if any setting points at a non-local address, or matches an entry in a short list of the demo's identifiers.
  Done when: V2 starts from a clean checkout with one command; changing any setting to a non-local or demo address stops it starting, with a test for each; a send to an unlisted destination fails closed; pointing V2 at another local database or storage folder is refused before anything is written; starting V2 changes no other environment's logins, passwords or data. The list of demo identifiers is written by the piece's owner from the demo's public addresses and names only, and holds no secrets. For real-phone runs, "local" also covers this Mac's home-network address with a local certificate (phones need a secure address for camera and microphone); a public tunnel does not count.
- **v2-a2 · The fictional job.** A repeatable seed: one owner-builder firm, one customer, a second firm, a merchant, a tiler and a decorator, and the occupied-home kitchen splashback and hall decorating job with two work areas. Use ordinary V2 entry points and the existing quoting routes.
  Done when: a fresh session creates the job, accepts an exact quote and finds both after reload; a second run of the seed creates no duplicates; the second firm cannot see the job.

**Dropped from revision 1.1 for now:** the read-only inventory of the demo's hosted resources, the identity-policy simulator and before/after demo activity records. They are not needed while V2 is local-only. **They come back in full, as written in revision 1.1, before V2 is hosted anywhere other than this Mac.**

### C · Turn agreed scope into a working plan

Owner: domain and quote workspace. Depends on: A.

- **v2-c1 · Template and plan record (RED: new tables).** A job template held as data: tasks, order, durations, trade, material needs, proof points and customer choices. The first template is the two-trade splashback and decorating job. Generate one plan from any quote revision, draft or accepted, using its stable scope IDs.
  Done when: a quote shaped like today's (seeded in V2) and a new quote through the existing typed capture each produce one plan; reopening or retrying never duplicates tasks; in the sample, hall decorating does not depend on splashback tiling.
- **v2-c2 · Editing and regeneration.** The builder can edit order, durations and trade. A custom scope item outside the template can be given a trade, duration and place in the order by hand; until then it shows as "Unplanned". Before acceptance, a quote revision refreshes the draft plan and shows what changed.
  Done when: changing a quote before acceptance updates the affected tasks and keeps manual edits, flagged for review; a custom item planned by hand appears in order; an unplanned one is listed as "Unplanned".
- **v2-c3 · Draft, accepted, live (RED).** Draft follows quote revisions. Accepted freezes the agreement and allows internal planning edits, viewing and internal export. Money scope can only regenerate from the frozen accepted quote plus approved variation revisions. Dates and assignments can change on their own, with a record of who changed them. Live needs the builder's explicit Switch live. The plan's Live state follows the existing Switch live activation, which already records the money terms; add no new Switch live command. There is no silent switch back to draft. Cancelling or changing work state uses the existing rules and leaves the accepted record intact.
  Done when: on acceptance there are zero new scheduler entries, commercial outbox rows, bookings, orders and fee rows; the plan goes Live only through the existing Switch live; retrying it has no second effect. (The single made-up afternoon check it enables is proved in v2-e4.)
- **v2-c4 · Plan screen.** The Plan view in the job's Work tab, as described in section 3.
  Done when: the fictional job's plan can be read and edited at phone and desktop width, and survives reload; the Switch live button calls the existing activation and the banner changes to live.
- **v2-c5 · "Don't forget" prompts on the quote (added in 1.3, #16).** A prompt list per job type (skip, scaffold, waste, parking permit, building control fee, making good, decorating after, overheads, contingency), held as data in its own file beside the v2-c1 template and keyed by the template's key. Before a V2 quote is sent, the builder sees the prompts not yet covered by a quote line and ticks or dismisses each; the choice is recorded. Prompts never add a line or a price on their own.
  Done when: the splashback and hall quote shows its missing prompts before sending; a dismissed prompt stays dismissed after reload; ticking one opens the existing add-line route and adds nothing by itself; zero paid AI calls.

### D · Prepare materials and crew instructions

Owner: procurement and job workspace. Depends on: C.

- **v2-d1 · Measurements (RED: new tables).** One measurement record tied to the scope item: value, unit, source, who confirmed it and when. First version is typed in and confirmed by the builder. B1 later fills the same record from the walk.
  Done when: a missing or unconfirmed measurement produces a question instead of a quantity.
- **v2-d2 · Pack sums.** Work out whole packs from confirmed measurement, the firm's wastage allowance, the chosen product and its pack size. Round the need including allowance up to whole packs, subtract confirmed usable whole packs of the same product and compatible batch already set aside for this job, and never go below zero. Reuse the exact-fraction number format already in `packages/core/src/materials.ts` and add one small tested pack-count sum; do not use decimals that can round wrongly, and do not push pack counts through the money-rounding functions.
  Done when: 6 m² × 1.10 allowance at 1.2 m² per pack with no stock gives six packs; with one usable pack on site it gives five; a missing product choice produces a question.
- **v2-d3 · Materials enquiry draft (RED: new tables).** Group the list by supplier and required-by date. Track who supplies each item, so customer-supplied items can never enter a builder order. An enquiry is a question to a merchant, never an order.
Changing a measurement, its confirmation, the product, pack size, allowance or usable stock set aside marks the dependent quantities and enquiry versions out of date. Regenerating keeps the builder's edits where they still fit and flags the ones that clash.
  Done when: each of those input changes takes "current" off the old enquiry; regenerating gives the corrected quantities once; generating twice leaves one current enquiry; a customer-supplied item is absent from it.
- **v2-d4 · Crew brief (RED: new tables, hidden findings).** An unpriced brief per trade from scope, owner, access window, visit, photos and proof needed.
  Done when: the tiler sees only tiling instructions and the site photos picked for them, with no prices; generating twice leaves one current brief; two copies of the job that differ only in one planted hidden financial finding give identical briefs.
- **v2-d5 · Measurements, Materials and Briefs screens** (split in 1.3 into **v2-d5a**, the Measurements screen, which needs only d1, and **v2-d5b**, product picking, Materials and Briefs, after d3 and d4; the done-when below applies to the pair). As in section 3, with internal view and export only. No sending yet. Includes the Measurements screen and a simple way to pick each product, its pack size and the firm's wastage allowance. On the Materials screen the builder can edit supplier, needed-by date, who supplies each item and enquiry notes, and correct every input to the sums. Edits survive reload.
  Done when: from an accepted quote on the fictional job, using only the screens, a builder confirms measurements, picks products and reaches a usable enquiry and both briefs at phone and desktop width; zero paid AI calls are made; generating the enquiry and briefs creates zero outbox rows, orders or messages, and the local catcher receives nothing.

### B1 · Capture the walk online (first cut)

Owner: field client and capture API. Depends on: A. Runs alongside C and D.

- **v2-b1a · Walk session record.** Room, note segment, stated measurement and unit, photo ID and device capture time; server receipt and verification recorded separately. Photos link to notes by the active room and order within the session. Clock time and photo metadata never choose the room.
  Done when: with device time 24 hours wrong either way, room links are identical and the difference is flagged against server time.
- **v2-b1b · Walk screen.** Pick a room, take photos, dictate or type. Speech stays on the device with no audio uploaded or stored. Vision reading of photos is left for later.
  Done when: refusing the microphone or camera still allows typed notes; losing signal shows pending or unsaved state truthfully and keeps what the server confirmed.
- **v2-b1c · Check and correct.** Unclear links are flagged. Imported photos wait in "needs room". Corrections keep the original and the revision.
  Done when: a misfiled photo can be moved and the move survives reload; imported photos stay unlinked until assigned.
- **v2-b1d · Real-phone rehearsal.** On a named phone: switch rooms, take two photos, edit dictated words, move a misfiled photo, reload and find the right job and links.
  Done when: that run is recorded with build and device named, and a network capture on each supported platform shows no audio leaving the phone. Otherwise that platform offers typed input only.

### B2 · Capture without signal (first cut, rewritten)

Owner: native and evidence storage. Depends on: B1's records, the merged M3 work on main, and the D08 decisions.

Revision 1.1 asked for M3-3, M3-4 and M3-5 to be reconciled first. That is done: they merged in order in pull request 868. B2 now builds on them and adds only what is still missing.

- **v2-b2a · Decisions first.** List which of the six open D08 decisions B2 needs (at least encrypted media, unsynced work and retention on the device) and get them made through the existing route. No B2 code piece starts before this.
- **v2-b2b · Real photos into the existing upload.** Feed real camera photos, with job, room and order, into the resumable upload already on main. Pending media is saved encrypted. Membership is rechecked on reconnect and media is cleared under the approved retention rule.
  Done when: a denied user's upload is refused; low storage or failure is reported with no false "saved".
- **v2-b2c · Kill and resume.** Capture offline, kill and reopen the app, reconnect, resume a part-sent upload and recover one verified original.
- **v2-b2d · Device evidence.** Fill the iOS and Android rows of the device matrix separately, naming build and device.

Release gate G3 still governs any real distribution of the phone app.

### E · Collect replies and prepare tomorrow (first cut)

Owner: job operations and communications. Depends on: C and D. Manual entry and made-up replies can ship before E joins F.

- **v2-e1 · Open facts.** Each outstanding fact has an owner, needed-by date, status and source. Customer choice, merchant delivery date, crew availability and access are stored separately. Logging by hand comes first.
- **v2-e2 · Replies (RED).** A reply is tied to firm, job, verified recipient, the one fact it may answer, the request version, an expiry and a way to cancel.
  Done when: a duplicate reply applies once; a reply to an old request is kept as out of date and not applied; another firm's reply is refused.
- **v2-e3 · Stock position.** A delivery date is a forecast. Only a confirmed delivery or goods receipt puts stock on site.
  Done when: one usable pack on site and three of five ordered packs received shows four of six available, two short.
- **v2-e4 · Afternoon check.** Shows ready, blocked and waiting-for-confirmation work and proposes a swap. Reuses the existing scheduler, outbox and decisions inbox.
  Done when: a delivery slipping from Tuesday to Thursday blocks Tuesday tiling; the hall is proposed for Tuesday only if a qualified person is free for the whole time and materials are on site; Switch live starts exactly one check.
- **v2-e5 · Clashes across jobs (RED).** The requesting trade learns only "clash" or "no clash".
  Done when: unknown availability blocks a commitment; no detail of the other job leaks.
- **v2-e6 · Apply and tell.** Only the builder applies a change. Affected briefs update once. The customer is asked for access for the new day and room.
  Done when: the screen shows who needs telling, who was sent the new version and who has acknowledged it.
- **v2-e7 · Reminders.** An unanswered request produces a limited reminder or a builder decision before the deadline. **Added in 1.3 (#12, delivery chase):** a merchant delivery date with no confirmation is asked for once, and flagged to the builder the day before it is needed if there is still no reply. Done when (after Astra's check, 21:44 UK, persisted state only): a delivery due Thursday with no reply by Wednesday morning is stored as "unconfirmed" with its reason, and the local catcher holds exactly one chase per request. Showing it on the Tomorrow screen belongs to v2-e8.
- **v2-e8 · Tomorrow screen.** As in section 3. **Added in 1.3 (#13, 6pm crew list):** at 6pm each crew member can be sent their own tomorrow list (their tasks, address, access and photos, no prices and nothing about other jobs), using the same content as "My brief". Done when: the tiler's 6pm list matches their brief for tomorrow and holds nothing from the decorator's work or another job.

A finish choice that changes price or scope creates a pending change for F (or a held draft until F exists). It cannot alter agreed scope, cost or an order.

### F · Record progress and manage changes (first cut)

Owner: field workflow and commercial domain. Depends on: D and the existing variation path. Joins E before the blocked-work and price-changing-choice journey is proved.

- **v2-f1 · Done, Blocked, Changed.** Three actions on a trade's current brief, with proof attached to the right work item, reusing the diary. **Added in 1.3 (#20, accepted by Ben 24 Nov 20:40 UK), split after Astra's check (21:44 UK):** **f1** attaches proof photos by media ID using fixture or already-uploaded media, and the proof feeds the diary and the Friday update (v2-k3); the camera stays held. **f1-cam**, Done opening the phone camera in one tap, comes after B2B1-device switches the camera on.
  Done when: replaying a progress update records it once.
- **v2-f2 · Proof holds the stage.** A stage that needs verified proof stays open while its upload is pending.
- **v2-f3 · Change draft (RED).** If the customer extends the splashback, draft the new quantity, materials, duration and price together through the existing variation process. Pending work is shown separately. Customer approval is tied to the exact variation version and amount.
  Done when: a declined or unapproved change adds nothing to the committed price; a changed price needs a fresh decision; the agreed quote and issued invoices are untouched.
- **v2-f4 · Order already sent.** Show the difference and prepare a separate amendment for approval, proved in the existing made-up order test.
- **v2-f5 · Join with E.** A price-changing choice from E becomes a pending change here; approved changes update working instructions, order drafts and accounts under existing policy.
- **v2-f6 · Customer approves a change by link (added in 1.3, #1; RED).** For one change at a time, the customer opens a link and sees the price, the photos and the description of that exact variation version, with one "I agree" button. Approval binds to that version and amount. This is a narrow slice of BUILD_PLAN.md MON-5 (customer portal), not the whole portal. Depends on v2-f3. Done when: approving a link for an old version is refused; a changed price needs a fresh link and approval; a declined change adds nothing; another firm's link opens nothing; in practice mode the link is delivered only to the local catcher.
- **v2-f7 · Daywork sheet (added in 1.3, #8; RED).** For a cost-plus extra: hours per person and materials used, priced by the firm's day rates, signed off by the customer through v2-f6's link, then entering the existing variation path. Depends on v2-f6 and v2-f8. Done when: a signed-off sheet becomes one approved variation with the exact total; an unsigned one adds nothing; editing after sign-off needs a fresh sign-off.
- **v2-f8 · Who was on site today (added in 1.3, #15).** One tap per person per day on the diary, with no location tracking. It feeds the diary and daywork sheets. Depends on v2-f1. Done when: a replayed tap counts once; no location is stored; a crew member sees only their own days.

### G · Snag, hand over and reconcile (first cut)

Owner: close-out and customer experience. Depends on: F.

- **v2-g1 · Snag register.** Each snag has an owner and due date, a record of the fix and who checked it. Agreed outstanding items can be listed openly.
- **v2-g2 · Handover pack.** Built by positively choosing what goes in: approved scope, variations, customer-visible photos, manuals and certificates, snag status and contacts. Descriptions and version references only; amounts stay on the invoice route.
- **v2-g3 · Versions and release.** A saved list for each version with recipient, source versions and acknowledgement. Ordinary site completion plus an explicit release by the builder makes the pack available, independent of the financial lock. Acknowledgement records receipt only and cannot sign off a snag or the account.
  Done when: a customer opens the approved version, sees an outstanding snag and later receives a corrected version.
- **v2-g4 · Who can read it (RED).** Another firm or a cancelled recipient cannot read it. Margins, private notes, other customers' photos, recovery data and hidden findings stay private.
- **v2-g5 · Hidden findings stay hidden (RED).** Two copies of the job that differ only in one planted hidden financial finding. With the same clock and public inputs, their pre-disclosure afternoon briefs and handover contents, hashes, counts and earliest release time must match. Ignore arbitrary record IDs in the comparison.
- **v2-g6 · Close the account.** Final-account review, lock and Final Check run through the existing invoice path. A failed reconciliation leaves the invoice pending. A genuine approved late catch follows the existing supplement route without rewriting an issued invoice.
- **v2-g7 · Snags and Handover screens.** As in section 3.
- **v2-g0 · Certificates checklist by job type (added in 1.3, #9).** The template (v2-c1 data) lists the certificates the job type needs (for example electrics, gas, windows, building control). Split after Astra's check (21:44 UK) into three: **g0** sets the list on the job when the plan is made and stores each as an open fact (v2-e1); **g0r** reminders for missing certificates go through v2-e7; the received-or-missing proof in the handover pack belongs to v2-g2. Done when (g0): the splashback and hall job lists its certificates at plan time and they persist as open facts; a missing one blocks "ready for handover" with a plain reason; adding a job type adds its list as data only.
- **v2-g8 · Review request (added in 1.3, #11).** A week after the builder releases the handover (v2-g3), one polite review request, only if the builder switched it on for that job. Never repeated. Done when: no request goes without the builder's switch; a job with an open dispute or unpaid final invoice sends none; in practice mode it reaches only the local catcher.


### H · Prove the first complete job (first cut)

Owner: QA and product. Depends on: B1 and C to G, with E and F joined. B2 is recorded separately when claiming offline support.

- **v2-h1 · Full browser run.** The fictional job from an empty account to a kept handover, using real V2 screens, storage and scoped sign-ins for builder, trade and customer.
- **v2-h2 · Real-phone run.** The same on a named phone. Recorded as online-only unless B2 has passed on that device.
- **v2-h3 · Second job.** A second job to exercise crew clashes.
- **v2-h4 · Interrupt and resume.** The local environment resumes after being stopped mid-job.

Done when: after reload the user can find the original quote, latest agreed work, current plan, customer-safe pack, acknowledged changes and reconciled final invoice. Only permitted decisions created outside commitments. Record build, devices, which outside actions were simulated, timings, faults and saved record IDs. Fix the first failing normal journey before any live rollout.

### K · Reach the customer, crew and money (new in 1.3, first cut)

Owner: job workspace and communications. Depends on: what each piece names. Every send in K goes only to the local catcher until Ben approves real sends (section 8, decision 2), and real customers need release gate G1 and the hosted pilot.

- **v2-k1 · Share to WhatsApp or anywhere (#6).** A "Share" button on a crew brief, a snag list and the Friday update opens the phone's own share sheet with a plain text and photo version. JobGuard sends nothing itself. Shared copies strip location data (section 5). Depends on v2-d5b (briefs screen); snag list and update follow their screens. Done when: the shared text for the tiler's brief has no prices and no location data; the share leaves no outbox row.
- **v2-k2 · Calendar link (#7; RED: who can read).** A private calendar feed (.ics) of the work plan: the builder sees all tasks, each crew member only their own, the customer only the days work is happening at their home, with no prices. Each feed address can be revoked. Depends on v2-c3 and v2-c4. Done when: each feed shows only what its holder may see; a revoked address returns nothing; a plan change appears in the feed after refresh.
- **v2-k3 · Friday customer update (#5).** A short weekly update for the customer from the diary (QW-2), photos marked customer-visible and the plan: what got done, what's next, decisions needed. The builder previews and sends it. Depends on v2-f1 and the diary being in v2/main (after the main sync). Done when: the update holds no prices, private notes or other customers' photos; it is never sent without the builder's press; in practice mode it reaches only the local catcher.
- **v2-k4 · Automatic chasing (#2).** The builder switches on, once, polite reminders for unanswered quotes (day 3 and day 7) and unpaid invoices (3 and 10 days after the due date), at most three per item, stopping on a reply, payment, dispute or the builder's stop. Reuses v2-e7's reminder rules and follows BUILD_PLAN.md M4-16's rules for customer messages (never chase a disputed, paid or no-charge-pilot amount). Not covered by M4-16 itself, which is about JobGuard's own fees. Depends on v2-e7. Done when: a paid or disputed invoice is never chased; a reply stops the chain; switching off stops everything queued; in practice mode it reaches only the local catcher.
- **v2-k5 · Deposit and stage invoices from the accepted quote (#3; RED: money).** The builder picks a split (for example 30/40/30) on the accepted quote; JobGuard drafts each stage invoice with bank details and a due-date reminder through the existing invoice path. No card payments (that is BUILD_PLAN.md MON-6). This is a practice slice of BUILD_PLAN.md M4-18 (staged customer invoicing); M4-18 stays the plan of record for real use. Depends on v2-c3 (frozen accepted quote). Done when: stages always add up exactly to the accepted total under the existing rounding rules; an approved variation changes only later stages; nothing is issued without the builder's press; the final account still reconciles.
- **v2-k6 · Forward a merchant invoice to the job (#4).** One inbound address per firm; a forwarded merchant email, lands on the right job as a supplier document for the existing three-way check (M2-4-S). Practice uses a local inbound catcher. This is a practice slice of BUILD_PLAN.md M2-2 and SV-7B; real inbound mail needs a provider (D04, a new provider account, so Ben's call). Split after Astra's check (21:44 UK): **k6** handles forwarded email and attached files only; **k6-cam**, a delivery-note photo taken in the app, comes after B2B1-device switches the camera on. Stock effects come with v2-e3. Done when: a forwarded invoice reaches the check without retyping; one from an unknown sender waits for the builder; another firm's address never files into this firm.
- **v2-k7 · Accountant export (#10; RED: firm data). Moved out of V2 by Ben's decision 4: built as live-app quick win QW-7 on main, in practice mode.** Kept here for the record. A CSV download of the firm's invoices, payments and supplier bills for a date range, for the accountant, before any Xero or QuickBooks link (BUILD_PLAN.md M5-1). Read-only; no tax mapping beyond what the records already hold. Depends on nothing in V2; it could ship on main as a quick win instead (section 8, decision 4). Done when: totals match the records exactly; the second firm's rows never appear; the file is the same for the same range.

## 2A. Where each of the fifteen additions sits (new in 1.3)

Numbers are the review's ranking. "BP" is BUILD_PLAN.md rev 3.0 on main.

| # | Addition | Placed as | Already planned elsewhere | Needs Ben (section 8) |
|---|---|---|---|---|
| 1 | Customer approves a change or quote by link | v2-f6 | BP MON-5 (whole portal, behind G1). V2 builds one-change slice only. | 1, 2 |
| 2 | Automatic chasing of quotes and invoices | v2-k4 | Not planned for builders' customers. BP M4-16 rules reused. | 2, 3 |
| 3 | Deposit and stage invoices | v2-k5 | BP M4-18 (late); card links stay in BP MON-6 | 1 |
| 4 | Forward merchant invoice email or delivery-note photo | v2-k6 | BP M2-2 live part, SV-7B | 1, 2 |
| 5 | Friday customer update | v2-k3 | Not planned; reuses QW-2 and QW-3 | 2 |
| 6 | Share to WhatsApp via the share sheet | v2-k1 | Not planned | none |
| 7 | Calendar link | v2-k2 | Not planned | none |
| 8 | Daywork sheet | v2-f7 | Not planned | 2 |
| 9 | Certificates checklist by job type | v2-g0 | Partly in v2-g2 (handover pack) | none |
| 10 | Accountant CSV export | QW-7 on main (was v2-k7; decision 4) | BP M5-1 (Xero, QuickBooks via Codat, last) | 4 |
| 11 | Review request after handover | v2-g8 | Not planned | 2 |
| 12 | Delivery chase | added to v2-e7 | V2 E already had replies, stock and reminders | 2 |
| 13 | 6pm tomorrow list to each crew member | added to v2-e8 | V2 E Tomorrow screen | 2 |
| 14 | Retention release reminder | **not added to V2**; cross-reference only | BP M4-20 covers it fully (retention balances and durable timers) | none |
| 15 | Who was on site today | v2-f8 | Not planned | none |

**Order for the additions.** Without sends: k2 calendar (after c4), g0 certificates (data, after c1), k1 share (after d5b), f8 on site (after f1), k7 export (any time). With sends caught locally: e7 delivery chase, e8 crew list, k4 chasing, k3 Friday update, f6 approval link, f7 daywork, g8 review request. Money: k5 deposits (after c3), f7 daywork. k6 merchant email after e3.

## 2B. Second group: twelve more additions, accepted by Ben (new in 1.3)

From the second pass of the same review (24 November, evening), which came after Ben said "add them all". **Accepted in full by Ben on 24 Nov, 20:40 UK (section 8, decision 5).** Each piece is issued when its dependencies exist. Items 19 and 25 go outside V2 as noted. Placing follows the same rules as section 2A.

| # | Addition | Placed as | Already planned elsewhere | Needs Ben |
|---|---|---|---|---|
| 16 | "Don't forget" prompts on every quote by job type (skip, scaffold, waste, parking permit, building control fee, making good, overheads, contingency) | **v2-c5**: the template (v2-c1 data) holds a prompt list per job type, shown on the quote before it is sent; the builder ticks or dismisses each. Prompts never add a price on their own. | No. BP MON-7 covers property constraints, not missed costs. | accepted |
| 17 | Customer choices and PC sums tracker, with allowance and "decide by" date; over-allowance drafts an extra | **v2-e9 (RED: money)**: a choice is a customer-choice open fact (v2-e1) with an allowance amount and deadline; a choice over the allowance drafts a change through v2-f3, never a committed price. Depends on v2-e1 and v2-f3. | Partly: E already turns a price-changing choice into a pending change | accepted |
| 18 | Off-hire reminders for scaffold, skips and plant | **v2-k8**: hire items on the job with booked date and weekly cost; the builder gets a reminder when the work that needs them is done (from the plan). Builder-only, no outside send. Depends on v2-c3. | No | accepted |
| 19 | Quote options (good, better, best, or with or without a room) | **Outside V2**: V2 starts from an accepted quote, so options belong to the quote track on main, as a later live-app packet (it touches exact-revision acceptance, so RED). V2 then plans from whichever option was accepted. | No | accepted |
| 20 | A photo on every finished task, one tap, phone camera | **Added to v2-f1**, split: f1 attaches proof by media ID now; f1-cam (one-tap camera) after B2B1-device. | Yes, V2 F | none |
| 21 | Translate crew briefs and site notes | **v2-d4b**: a translated copy of a brief, marked as a translation, with the English original kept. Needs a translation route: paid AI or a provider (D04 and section 5 "Cost"). Depends on v2-d4. | No | accepted; translation route and cost decided when issued |
| 22 | Simple risk assessment, method statement and construction phase plan from the job's scope | **v2-k9**: a draft filled from scope, template and plan that the builder completes and signs. JobGuard never certifies it (section 5 "Who decides"). Depends on v2-c3. | No | accepted |
| 23 | Subcontractor bills and CIS | **Not added to V2**; cross-reference only | BP M4-22 (CIS) | accepted as a cross-reference; M4-22 order unchanged |
| 24 | Double-booking warning, same person on two jobs one day | **Already v2-e5**. Suggested: a same-firm version (the builder's own crew, no other firm involved) can come first and is not RED. | Yes, V2 E | none |
| 25 | "Start simple" mode: one job, quote, extras, invoice; the rest hidden until switched on | **Outside V2**: it is screen design for the whole app, so it belongs in the designed-UI plan (DUI), after its open drafts (#890 to #902) settle. V2's screens sit inside the Work and Records tabs, so they can hide with it. | No | accepted |
| 26 | Job profit so far, in plain words | **v2-k10 (RED: money, hidden findings)**: a running figure from the accepted quote, approved extras and recorded costs. It must never reveal a hidden financial finding before the disclosure rules allow (section 5 "Final Check and pricing"). Depends on v2-c3 and the main sync. | Partly: BP VALUE-1 (value page, not a running margin) | accepted |
| 27 | Aftercare and warranty reminders at 6 and 12 months | **v2-g9**: after handover release (v2-g3), one offer of a check-up visit at 6 and 12 months, if the builder switched it on. Sends follow section 8 decision 2. Sits next to BP M4-20 retention. | No | accepted |

## 2C. Full build order from here to the end of V2 (new in 1.3)

**Usefulness order (Ben, 24 Nov 21:28 UK: "features planned according to usefulness/easyiness").** Within the steps below, the most useful piece for the least effort goes first, as long as its dependencies are built and the safety rule holds. The review's automation pieces were cut so they no longer wait on later steps: **f6** approval by link and **k4** chasing build on v2/main's base now (k4 no longer waits for e7; f6 no longer waits for f3); **k6** merchant invoice forward builds now without stock effects (no longer waits for e3); **k3** Friday update and **k10** job profit build on the repaired c3 (no longer wait for the main sync); **e9** choices tracker builds on e1 now (drafts through the existing variation path, no longer waits for f3). Multi-crew planning (e4 to e6 and the same-firm double-booking warning) moves to the end of its step. The ranked list is `reviews/v2/v2-ranked-by-usefulness.md` and the Codex queue order is `reviews/v2/codex-queue/00-QUEUE.md`.

Each step starts when what it names is built, under the safety rule in "In plain words". RED and first-cut pieces get Astra's plan check before building. Every send goes only to the local catcher. Only Ben merges RED pieces.

**Step 1, milestone one (A, C, D).** Repairs found on 24 Nov: R1 (integrity guard, c2/c3), R2 (audit append on plan edits, c2/c3, AGENTS §5.7), d1r1 (audit append on measurement saves). a1, a1-mac, a2, mock, d2 merged. Then c1 → c2 and c3 (repair R1) → c4 and d1 → d3 and d4 → d5a → d5b. Done when d5's done-when passes.

**Step 2, started early alongside step 1.** **c6 add a line to a priced quote** is a later quote-track piece (found by the c5 builder, 24 Nov: once scope is confirmed a line can't be added, so c5 prompts only remind or dismiss). b1 mock-ups, b1a walk record, b2b1 encrypted photos (practice), e1 open facts, c5 don't-forget prompts (data only, beside c1's template). Outside V2: QW-7 accountant export on main.

**Step 3, once c3 and d1 are merged.** **c3b approved extras become plan tasks** (follow-up from the #901 review, 24 Nov). **ci1 V2 seed suite in CI** (from the #904 review; it can start now, on v2/main). k2 calendar link, k5 deposit and stage invoices, k8 off-hire reminders, k9 RAMS draft, same-firm double-booking warning (first part of e5), g0 certificates checklist (needs e1). b1b walk screen and b1c check-and-correct (need b1a). **b1e walk photos upload before the job is live** (after b1a; RED, V2 only; the existing upload accepts live jobs only). b2b2 photos linked to rooms (needs b1a), b2c kill and resume (needs b2b1).

**Step 4, once d3 and d4 are merged.** e2 replies, e3 stock position, e7 reminders with delivery chase, k1 share to WhatsApp (after d5b), d4b translated briefs (after its cost decision), k6 merchant email forward (after e3), f1 Done/Blocked/Changed with one-tap photos, f2 proof holds the stage, f8 who was on site, k4 automatic chasing (after e7).

**Step 5, sync main into v2/main.** After milestone one merges. Brings the live-app quick wins (diary, photos on variations, Friday PDF, snag list, handover page, pack calculator) into V2's base.

**Step 6, changes and the customer.** f3 change draft, f4 order already sent, f6 customer approval by link, f7 daywork sheet, e9 choices and PC sums tracker, f5 join with E, k3 Friday customer update (needs f1 and the sync), k10 job profit so far (needs the sync).

**Step 7, tomorrow and crews.** e4 afternoon check, e5 clashes across jobs (RED), e6 apply and tell, e8 Tomorrow screen with the 6pm crew list. For a 1 to 5 person builder, steps 4 and 6 come before this step where both are ready (section 9).

**Step 8, close-out (G).** g1 snag register and g2 to g4 handover, adopting the snag list (QW-4) and handover page (QW-5) from main after the sync. g5 hidden findings stay hidden (RED), g6 close the account, g7 screens, g8 review request, g9 aftercare reminders.

**Step 9, proof (H).** h1 full browser run, h2 real-phone run, h3 second job, h4 interrupt and resume. b1d and b2d device evidence on Ben's phones.

**After V2.** Hosting: the full separation proof from revision 1.1's chunk A, then G1 and the hosted pilot (section 6). Outside V2, in their own plans: quote options (#19), start-simple mode (#25, DUI plan), CIS (BUILD_PLAN.md M4-22), retention reminder (M4-20). Big ideas A to F (section 10) need Ben's decisions first.

## 3. What people see

V2 adds to the existing app (Today, Jobs, and each job's Overview, Work, Money and Records tabs). It adds no new top-level section.

**Screen rule.** Before a screen piece is built, make a clickable mock-up of that screen filled with the fictional job, using existing components and styles only. A different session checks it against this section using screenshots at phone width (360) and desktop width (1280). The built screen gets the same two screenshots. Keep it plain; visual polish comes later and is not a reason to hold a piece.

| Screen | Who | Where | What is on it | Main action |
| --- | --- | --- | --- | --- |
| Plan | Builder | Job › Work | Tasks in order, each with trade, duration, day and status. "Unplanned" items at the bottom. A banner showing draft, accepted or live. Changes since the last quote revision are marked. | Edit a task; Switch live |
| Measurements | Builder | Job › Work › Materials | One line per scope item: value, unit, where it came from, confirmed or not. Unanswered ones shown as questions. | Confirm a measurement |
| Materials | Builder | Job › Work | The buying list grouped by supplier and needed-by date: product, packs, on site, short. Customer-supplied items listed apart. An "out of date" mark after a product change. | View or export the enquiry |
| Briefs | Builder | Job › Work | One card per trade: what to do, where, when, access, photos, proof needed. No prices. | View or export a brief |
| Walk | Builder, on a phone | Jobs › New | Current room, a camera button, a dictate-or-type box, the notes and photos so far for that room, and a saved or pending mark. | Next room; Finish walk |
| Check the walk | Builder | Jobs › New | Rooms with their notes and photos, unclear links flagged, a "needs room" tray for imported photos. | Move a photo; Confirm |
| Tomorrow | Builder | Today | Three lists: ready, blocked, waiting for an answer. Each blocked item says why and what would unblock it. A proposed swap where one exists. Who still needs telling. | Apply the swap; Send a reminder |
| My brief | Trade, by link | Own page | Today's and tomorrow's instructions for that trade only, with photos and proof needed. | Done; Blocked; Changed |
| Your choices | Customer | Customer job page | Each open choice with its deadline, and any price difference shown as a change awaiting approval. | Choose; Approve a change |
| Snags | Builder | Job › Records | Each snag with owner, due date, photo, fixed and checked marks. | Add a snag; Mark checked |
| Handover | Builder | Job › Records | Tick-list of what goes in the pack, a preview as the customer will see it, version history and who has acknowledged. | Release this version |
| Your handover pack | Customer | Customer job page | What was done, changes, photos, manuals and certificates, outstanding snags, contacts. No amounts. | Acknowledge receipt |

Every screen shows a plain empty state (what to do first) and a plain problem state (what went wrong and what is safe), and never shows "saved" for something still pending.

## 4. More job types

The first run uses one template on purpose. Two things stop that being a dead end:

- **Templates are data.** A new job type is a data file in the same shape as the first (v2-c1) plus one worked example test. No new code.
- **Custom items can be planned by hand** (v2-c2), so a job outside any template still gets a plan, materials list and briefs, with more typing.

After H passes, add the next two templates. Choose them from the jobs the trial firms actually do most; bathroom refresh and single-room decorating are the likely candidates. Do not add templates before then.

## 5. What each action is allowed to do

**Facts and ownership.** Job, firm and scope item stay the common keys. Capture owns observations. The accepted quote owns agreed scope and price. The work plan owns dates and assignments. Stock and receipts own what has landed. The existing commercial commands own approvals and money. Add only the smallest missing records: room and segment links, task dependencies, fact requests, trade briefs, snags and handover versions. Work things out rather than keep a second copy. Every confirmed or outside change carries source, person, time, job, expected version and a replay identity.

**Who decides.** JobGuard may file, calculate, prepare drafts, rank blockers and refresh internal views. The customer chooses finishes and accepts exact commercial revisions. The merchant supplies stock and delivery facts. The crew records availability and progress. The builder or responsible trade confirms dimensions, technical suitability, workmanship and completion. Suggesting an order of work never certifies a technical or regulatory requirement.

**Who can send.** Today's practice order route uses fictional recipients and readiness scheduling is made-up. The first build supports prepared documents and explicit approval of recipient, content and version. A stock enquiry never places an order. Standing rules, if approved for the purpose, can allow limited routine reminders with recipient, expiry, frequency and stop-on-reply. Commitments, purchases and changed commercial terms use their existing exact approval routes. An uncertain provider outcome is settled before any retry. Status distinguishes drafted, authorised, queued, delivered where it can be verified, failed and acknowledged.

**Privacy and offline.** Tie each participant to firm, job, role and the least content they need. Distinguish the device's claimed capture time, server receipt time and final verification. Private notes and photos need an explicit choice to share. Strip unnecessary location data from shared copies. Apply the established keeping and deletion rules to devices, copies and exports. Offline edits queue an intention; identity, version and authority are rechecked on reconnect. Distinguish saved locally, waiting to send, verified and failed. Outside sends and commercial approvals stay online.

**Final Check and pricing.** Ordinary readiness problems can show at once. A small builder's hidden financial findings must not change the brief, its wording, counts or timing before the existing disclosure rules allow. Keep builder-logged changes free of fees and keep existing mandatory disclosures. Any different promise about early disclosure, fees or real charging needs a separate commercial decision.

**Cost.** Templates, pack sums, schedules, photo linking, reminders, handover and status views run without paid AI calls. Pin the made-up fixture reader and assert zero paid extraction calls in the first milestone. An approved optional text call may structure newly reviewed text, saved against firm, content version and model and prompt version, with a firm and job cap, a retry ceiling and a typed fallback. Track billed input and output, storage, media transfer and outside messages separately for won and lost quotes. Paid vision, remote audio, live merchant catalogues and multi-project optimisation stay out of the first slice.

## 6. Release and trial

**Engineering acceptance.** Use the repository's real domain, PostgreSQL, migration, browser and device checks as each piece needs. Test upgrade with a made-up old-shaped accepted job created in the V2 environment, repeated commands, an out-of-date plan, firm and recipient boundaries and recovery after interruption. Save evidence at the reviewed commit. Check the demo independently only if a later approved integration touches shared code. One passing part does not prove the whole journey.

**Release in stages.** Local made-up rehearsal first. Then a named real-phone rehearsal on the same environment. Before V2 is hosted anywhere, restore the full separation proof from revision 1.1's chunk A. Keep made-up, no-charge pilot and production identities separate. The inventoried D04 to D08 and D12/D13 capabilities are proposed and switched off at this baseline. Release gate G1 comes before a no-charge pilot, G2 before anyone relies on it day to day, G3 before any claim about the phone app in the field. A live pilot needs the existing real-data, privacy, identity, delivery and device approvals for the features offered. Confirm backups, access removal, pause and rollback first. If a provider is down, the internally prepared plan, briefs and enquiry must still be usable. A general launch is a separate decision.

**Trial design.** Two matched fictional jobs that both fit the first template: job 1 is the kitchen splashback and hall decorating; job 2 is a utility-room splashback and landing decorating, the same size, with the same events (one delay, one extra, a handover). Each firm does one job its current way and the other with V2. The four combinations of which job and which method comes first are used equally, so recruit eight owner-run firms, or four as the minimum, always a multiple of four. No firm does the same job twice.

After live use is authorised, follow two consented real jobs per firm. Measure active admin time, time from quote approval to a usable enquiry and crew brief, repeated facts, calls and interruptions, wrong assumptions, duplicate effects and processing cost, including quotes that did not convert.

**How to read the result.** With this few firms the timing result is a guide, not proof. Report every firm's pair of results. Work out each firm's percentage drop in active admin minutes, and aim for a median drop of at least 50% across the firms, and five minutes or less from acceptance to a usable enquiry and brief. Require zero unauthorised sends and zero duplicate orders in rehearsal. Give most weight to which firms choose V2 again on a second real job. A missed time target sends the team back to the manual step that was observed. A privacy, money or data-loss failure holds the affected release.

## 7. Review status

Revision 1.1 was reviewed by Claude Opus 5.5 at medium effort on 20 November and given a go for the A, C and D sequence. **That review does not carry over.**

Revision 1.2 was reviewed independently by Claude Opus 5.5 at medium effort on 21 November against JobGuard main at `ee974f03`. Verdict: a conditional go for A, C and D, with four conditions: keep V2 off main; mark every new-table piece RED with a cross-firm test; test hidden findings and no-sending in D; and add the missing measurement and product-picking screens, fix the draft-plan order and reuse the existing Switch live. All four are written into this text, along with the reviewer's smaller notes. The reviewer has not re-read the text after those edits. It ran no test suites, and it confirmed where the hosted demo builds from only from the coordinator's log and the demo's start-up code. Astra (through the read-only Codex route, medium effort) then checked the edited text on 21 November against the same commit. Verdict: a conditional go for A, C and D, with two conditions: V2 gets its own local database server and checks its targets before any setup writes; and the materials enquiry is fully editable and goes out of date when any input to the sums changes. Both are written in. Astra could not see revision 1.1, so it did not confirm that nothing was lost from it, and it ran no tests. Neither reviewer has re-read the text after the last edits. The reviews cover the plan only; code, device evidence and any pilot have their own gates.

Revision 1.3 (24 November) adds section 2A, chunk K and new pieces in E, F and G, and records Ben's two decisions of 24 November. **No reviewer has checked revision 1.3.** It goes to Astra on the handoff issue (frm-management-layer#3) before any 1.3 piece is built. Its first-cut pieces are re-checked against main when issued, like the rest of B to H.

## 8. Decisions for Ben (new in 1.3)

**All decided by Ben on 24 Nov 2026, 20:40 UK: "Agree with you on them all", in reply to the six questions with recommendations in the project chat.** Each decision below took its recommended answer. Decision 6 is idea B in section 10.

1. **Bring BUILD_PLAN.md items forward as V2 practice slices?** Items 1, 3 and 4 already sit in BUILD_PLAN.md (MON-5, M4-18, M2-2 and SV-7B) behind release gates. **Recommended:** yes for practice only. V2 builds the narrow slice; BUILD_PLAN.md stays the plan of record for real use, and its order is not changed by this revision.
2. **Sends to customers, crew and merchants (items 1, 2, 4, 5, 8, 11, 12, 13).** **Recommended:** build them now with every send going only to the local catcher. Real sends wait for the hosted pilot, G1 and a provider choice for texts and email (D04; a new provider account is Ben's call and may cost money).
3. **Automatic chasing defaults (item 2).** **Recommended:** builder switches it on once per firm; quotes nudged at day 3 and 7; invoices at 3 and 10 days after due; at most three per item; stop on reply, payment, dispute or the builder's stop; never on a disputed, paid or no-charge-pilot amount.
4. **Accountant export (item 10): V2 or a live-app quick win?** It needs nothing from V2. **Recommended:** a quick win on main, in practice mode, so it isn't held behind V2's merge to main.
5. **Second group (section 2B).** **Recommended:** accept all twelve as placed.
6. **Idea B, live catches instead of the hidden Final Check.** **Recommended:** not now. It changes the fee model; Ben decides later, with Astra's check.

## 9. Paradigm check (new in 1.3)

Things that change the shape of the plan, not just its list:

1. **No real builder can use V2 until it is hosted.** V2 runs only on Ben's Mac. Chunk A's full separation proof (revision 1.1) and G1 come before any hosting. The review's strongest finding is that hosting the pilot reaches builders faster than any feature. This revision does not change that, but it should be a conscious choice, with a dated step for "V2 hosted for one pilot firm".
2. **V2 leans to firms with several crews.** Crew clashes, swap proposals and cross-job checks (e4, e5) help a firm running several jobs. A 1 to 5 person builder gets more from k1, k2, k3 and k4. **Suggested:** issue those before e4 and e5 once their dependencies are built.
3. **The real channel is WhatsApp.** Customers and crews answer by WhatsApp, not through JobGuard links. k1 covers sending out. **Small gap, suggested for 1.4:** let the builder paste or forward a WhatsApp reply into the job as the answer to an open fact (v2-e1, v2-e2), so the record is complete without the customer using JobGuard.
4. **Customer-supplied items.** d3 keeps customer-supplied items out of the builder's order, but nobody tells the customer what they must buy and by when. **Small gap, suggested for 1.4:** list them in the Friday update (k3) and as open facts (v2-e1) owned by the customer.

## 10. Big ideas for Ben to decide, not in the plan (new in 1.3)

From the review's second pass. None of these is planned here. Each needs Ben's decision, and B also needs Astra's check, before any plan text is written.

- **A. "Talk to the job".** One end-of-day voice note becomes a diary entry, a draft extra with an approval link, a materials enquiry and a change to tomorrow's plan, each a draft the builder approves. Needs the live AI route (BP M0-12a) and speech-to-text (M0-12b), both planned but not built. A first slice could be: voice note to diary entry plus one draft extra, on the existing dictation.
- **B. Show missed extras live instead of holding them for the Final Check.** **Ben, 24 Nov 20:40 UK: not now (decision 6).** **This changes the fee model** (BUILD_PLAN.md §10.2, D13 and the success-fee terms), so it is a commercial decision for Ben, not a plan edit. The contractor track already shows catches live (ENT-8a). V2's rule that hidden findings never leak (d4, g5, k10) stays as written until Ben decides.
- **C. The homeowner's job tracker.** One customer page, like a delivery tracker, that combines v2-f6, v2-k3, v2-k5 and v2-e9. Builds on BP MON-5.
- **D. Quote check against the builder's own past jobs.** Needs several finished jobs per builder; item 16 is the starting point. Nearest planned piece: BP M5-6.
- **E. Merchant price watch across builders.** Needs many builders, consent to pool data (D12) and competition-law care. Later stage; keep the data shape able to support it.
- **F. Back-office autopilot.** JobGuard answers routine messages itself. Start, if at all, with one-tap drafts as in A.
