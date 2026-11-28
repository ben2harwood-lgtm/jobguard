# JobGuard V2 build plan

**From the first walk-round to customer handover**

21 November 2026 · Small-builder track · Revision 1.2 · Separate V2 implementation plan · Replaces revision 1.1 (20 November)

## In plain words

Today JobGuard helps a builder quote, catch extras and get paid. V2 makes it run the whole job. The builder describes the job once. JobGuard then prepares the work plan, the buying list, instructions for each trade, the customer's choices and a view of what is ready tomorrow. Each update from site feeds progress, changes and the final handover pack. The builder still makes the professional calls and approves anything that commits the firm.

**Build now:** only the first milestone, chunks A, C and D. It starts from an accepted quote and produces an editable materials enquiry and an unpriced crew brief. Everything after that is described here but is not issued until D passes.

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

**Order.** First milestone: A → C → D, starting from an accepted quote made in V2. In parallel after A, B1 adds the online phone walk. After D, E and F can proceed independently, then join for blocked work and price-changing choices. G needs F. H needs B1 and C to G. B2 is a separate offline milestone. Live third-party actions need their own release evidence.

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
- **v2-d5 · Measurements, Materials and Briefs screens.** As in section 3, with internal view and export only. No sending yet. Includes the Measurements screen and a simple way to pick each product, its pack size and the firm's wastage allowance. On the Materials screen the builder can edit supplier, needed-by date, who supplies each item and enquiry notes, and correct every input to the sums. Edits survive reload.
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
- **v2-e7 · Reminders.** An unanswered request produces a limited reminder or a builder decision before the deadline.
- **v2-e8 · Tomorrow screen.** As in section 3.

A finish choice that changes price or scope creates a pending change for F (or a held draft until F exists). It cannot alter agreed scope, cost or an order.

### F · Record progress and manage changes (first cut)

Owner: field workflow and commercial domain. Depends on: D and the existing variation path. Joins E before the blocked-work and price-changing-choice journey is proved.

- **v2-f1 · Done, Blocked, Changed.** Three actions on a trade's current brief, with proof attached to the right work item, reusing the diary.
  Done when: replaying a progress update records it once.
- **v2-f2 · Proof holds the stage.** A stage that needs verified proof stays open while its upload is pending.
- **v2-f3 · Change draft (RED).** If the customer extends the splashback, draft the new quantity, materials, duration and price together through the existing variation process. Pending work is shown separately. Customer approval is tied to the exact variation version and amount.
  Done when: a declined or unapproved change adds nothing to the committed price; a changed price needs a fresh decision; the agreed quote and issued invoices are untouched.
- **v2-f4 · Order already sent.** Show the difference and prepare a separate amendment for approval, proved in the existing made-up order test.
- **v2-f5 · Join with E.** A price-changing choice from E becomes a pending change here; approved changes update working instructions, order drafts and accounts under existing policy.

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

### H · Prove the first complete job (first cut)

Owner: QA and product. Depends on: B1 and C to G, with E and F joined. B2 is recorded separately when claiming offline support.

- **v2-h1 · Full browser run.** The fictional job from an empty account to a kept handover, using real V2 screens, storage and scoped sign-ins for builder, trade and customer.
- **v2-h2 · Real-phone run.** The same on a named phone. Recorded as online-only unless B2 has passed on that device.
- **v2-h3 · Second job.** A second job to exercise crew clashes.
- **v2-h4 · Interrupt and resume.** The local environment resumes after being stopped mid-job.

Done when: after reload the user can find the original quote, latest agreed work, current plan, customer-safe pack, acknowledged changes and reconciled final invoice. Only permitted decisions created outside commitments. Record build, devices, which outside actions were simulated, timings, faults and saved record IDs. Fix the first failing normal journey before any live rollout.

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
