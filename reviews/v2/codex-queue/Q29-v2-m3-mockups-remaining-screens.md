# Q29 · V2-M3: clickable mock-ups for every remaining V2 screen (batch C1)

**Tier:** T1 (mock-up route only, with fixture data, no backend). **Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Base:** `v2/main` @ 63f3af5ab or later. **Branch:** `codex/sandbox/v2-m3`. **PR:** draft into `v2/main`. **Planner:** Fable thread, 25 Nov 16:00 UK. Use ★★★, because every screen below waits on it (screen rule, plan section 3). Effort M.

## Rules this piece must meet
`01-RULES.md` (rules 1 to 28) and `02-BUILD-RULES-CHECKLIST.md`, with a "Rules met" list in the PR body.

## Dry-check (planner, 25 Nov 15:55 UK, rule 23)
- **Pattern to copy exactly:** M2 #930 (branch `claude/project-thread-99dmkk`, not merged).
  - Files: `apps/web/app/(designed)/v2-mock-pages/{page.tsx,pages-mock.tsx,fixture.ts}`.
  - The page returns `notFound()` unless `JOBGUARD_LOCAL_V2 === "1"`.
  - Test: `apps/web/e2e/v2-mock-pages.spec.ts` with `apps/web/playwright.v2-mock-pages.config.ts`. It runs `next dev` on port 3108 with `JOBGUARD_ENV=synthetic_demo`, at 360 and 1280 px, and once without the flag for the 404 case. No database is needed.
  - Lane file: `config/lanes/v2-mock-pages.json`.
- **Don't touch M2's files.** Make your own folder `apps/web/app/(designed)/v2-mock-pages-3/`, your own spec `e2e/v2-mock-pages-3.spec.ts`, config `playwright.v2-mock-pages-3.config.ts` (use **port 3109**), lane file `config/lanes/v2-m3.json`, and screenshots under `e2e/artifacts/v2-mock-pages-3/`.
- Use only the existing designed components: `Card`, `Head`, `Note`, `Shell` and `Tag` from `apps/web/app/(designed)/designed-ui`, as the Friday update screen does on `codex/sandbox/v2-k3`.
- The screen contents come from plan rev 1.3, section 3 (`reviews/v2/JobGuard-V2-Build-Plan-rev-1.3.md`, the "What people see" table) plus the additions noted below.

## Screens, each with Example, Empty and Problem states plus the extra states named
1. **Tomorrow** (builder, Today):
   - ready, blocked and waiting lists, each blocked item with why and what would unblock it;
   - a proposed swap with "Apply the swap", and "Still to tell" people;
   - the **6pm crew list** preview: one card per crew member, the "practice: goes to the local test inbox" note, and "Send at 6pm" ticked.
   - Extra state: "Nothing for tomorrow".
2. **Your choices** (customer, by link):
   - each open choice with its decide-by date and allowance;
   - an over-allowance choice shows "£X over your allowance, sent to the builder as a change to approve", never as a committed price.
   - Extra states: "Decided", "Link expired".
3. **Daywork sheet** (builder, Job › Money):
   - date, people and hours, materials with quantity, an exact-decimal total, "Ask the customer to agree by link".
   - Extra states: "Agreed", "Changed after sending" (the old link no longer works).
4. **Certificates checklist** (builder, Job › Records):
   - certificates expected for this job type (see Q30 G0's list), each marked "Got it", "Not needed (why)" or "Still needed".
   - Extra state: "Job type has none".
5. **Share** (builder): the "Share" button under a sent Friday update and under a crew brief, the text exactly as it will be shared, and the fallback when the phone can't share ("Copy text" and "Open WhatsApp").
6. **Snags** (builder, Job › Records): each snag with owner, due date, photo, Fixed and Checked marks, "Checked by a second person".
7. **Handover** (builder, Job › Records): a tick list of what goes in, a preview as the customer sees it (no amounts), version history, who acknowledged, "Release this version".
8. **Your handover pack** (customer, by link): what was done, changes, photos, manuals and certificates, outstanding snags, contacts, "Acknowledge receipt". No amounts. Extra state: "Newer version available".

Every screen: never show "saved" for something pending; the practice notice is on every page; tap targets are at least 44 px; no amounts on customer or crew pages except the allowance and the change on Your choices, which follow the plan.

## Done when
- The spec passes at 360 and 1280 px, with screenshots committed for every state, and the 404 when the flag is off.
- The spec checks there's no `£` on Your handover pack and on crew cards.
- A Claude check of the screenshots against plan section 3 and this packet.
