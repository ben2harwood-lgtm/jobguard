# Q10 · V2-F8: who was on site today

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (new table; personal attendance data). Migration **2016**. Astra: yes. Rework risk: **high**.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-f8, section 2A item 15.
**Starts when:** Q09 (V2-F1) has pushed. **Base:** `codex/sandbox/v2-f1`. Draft PR against it.

## Dry-check against the code (planner, 25 Nov 00:20 UK): **parked until C3C**
"One tap per person" and "a crew member sees only their own days" both need a real crew identity. On V2 the assignee is free text and crew members can't sign in yet. Don't build until C3C (crew binding) exists.

## Screen files and mounts (planner, 25 Nov 00:25 UK; copy this wording verbatim into the builder's brief)
**No mount is allowed.** F8 is parked until C3C, and the screen wording will be set when it is released. This overrides any other line in this packet or brief about editing screen files.

## Release (planner, 25 Nov 20:20 UK). This overrides "parked until C3C", the base line, the old tier line and "no mount" above.
**Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK). **Checker:** Codex (`@codex review` or a read-only Mac review). **Base:** C3C #955, `claude/project-thread-x8p19i` @ ac8c92372. F1 isn't needed. **PR:** draft into that branch; retarget to v2/main when C3C merges. **Migration: 2016** (build-time number; renumbered at merge). **Plan check:** Astra.

**Dry-check against #955 @ ac8c92372 (rule 23):**
- `packages/db/migrations/2027_v2_crew_contact.sql`, lines 15 to 37:
  - `app.v2_crew_contact (tenant_id, firm_key, crew_id, revision, …, display_name, trade, phone, email)` is **firm-owned, not job-owned**, and revisioned;
  - its runtime policy (lines 43 to 45) isolates by `firm_key = app.current_firm_profile_key()`;
  - the assignee guard (lines 50 to 60) shows how to check that a crew id belongs to the job's firm: `c.firm_key = 'practice:' || j.practice_session_digest`.
- `packages/db/src/v2-crew-contact-repository.ts`: `list` is at line 46, `record` at line 53.
- **Crew members can't sign in on V2.** Under SX rev 4 they only get capability links, so F7 "My brief" covers that later.
- **There's no diary view on V2.** #906 is still open against main. The job pages are `apps/web/app/(designed)/jobs/[id]/{overview,work,money,records}/page.tsx`, and `work/page.tsx` renders `WorkspaceShell` plus a practice-only `MerchantOrder`.

**Scope as released:**
- **Table `app.v2_site_attendance`:**
  - columns: tenant_id, job_id, day (date, Europe/London), person_kind (`crew` | `builder`), crew_id (nullable, required when kind=crew), expected_version, command_id, note (optional, 500 characters), tapped_by_membership_id, recorded_at;
  - one current row per (job, day, person), with revisions for edits;
  - **no location, IP, device or user-agent columns**, and the test asserts that;
  - a trigger refuses a crew_id that isn't a crew record of the job's firm, using 2027's guard pattern;
  - forced RLS, SELECT and INSERT only, and the firm lock comes from FL-6. Under rule 30, its bootstrap line goes above 2054.
- **Command and audit:** a `v2-site-attendance-command.v1` command with expected version and replay, and one audit event `v2.site_attendance.recorded` holding references only.
- **Who can use it:** the **builder taps for each person**. A crew member's own view waits for F7 (out of scope). Customers see nothing.
- **Screen:**
  - an "On site today" card on the job's **Records** tab (`records/page.tsx`), listing the firm's crew records, each with one tap, plus "Me";
  - a 7-day list below it;
  - logic in pure helpers with unit tests (there's no jsdom);
  - a new route `apps/web/app/api/v2-backend/jobs/[id]/attendance/route.ts` (GET and POST), with rule 29 refusals, appended to `builderGetRoutes`.
- **Mounts:** only `records/page.tsx`, to render the card, with the lane note "F8 mount: card only".

**Done when:**
- A replayed tap counts once, and no location is stored.
- The second firm sees nothing, and a crew id from another firm is refused.
- The audit event is written once. CI1 is green, and the Codex review is clean.

## Goal (original, for context)
One tap per person per day on the job's diary, with **no location tracking**, to feed the diary and later daywork sheets.

## Scope
- Table: job, person (crew member or builder), day (Europe/London), tapped by, time, optional note. One row per person per day; a second tap the same day is a replay or an edit.
- Command with expected version, replay identity and one audit event. No latitude, longitude, IP or device location stored anywhere.
- A crew member sees only their own days; the builder sees everyone on their jobs; the customer sees nothing.
- Shown on the diary view, V2 only.

## Done when
- A replayed tap counts once; no location is stored (assert the table has no such columns and the request carries none); a crew member sees only their own days; second-firm and audit tests per the rules. CI green apart from Vercel.
