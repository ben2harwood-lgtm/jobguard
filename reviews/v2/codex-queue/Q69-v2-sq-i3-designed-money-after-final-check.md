# Q69 · V2-SQ-I-3: the V2 money tab shows invoices and the final check in the designed look, through to Paid

**Tier:** T2 money-adjacent (screens and placement only; no money logic, route, table or contract change). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** SQ-I-2's PR (Q67), at its head when you start; record the sha. If it isn't open yet, use SQ-I-1 #1043 and merge SQ-I-2 in when it opens. **Branch:** the builder thread's own branch, in `config/lanes/v2-sq-i3.json`. **Migration:** none. **Plan:** Q62's report `/mnt/project-files/jobguard-v2/demo-journeys-vs-v2.md`, "five most useful Missing steps" item 5. **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 06:40 UK.

## What it is
On Tommy's demo (#918), the designed money tab shows the invoices card, the final account lock, the final check reveal and the receipts, so a builder goes from the final check to Paid without leaving the designed screens. On `v2/main` the designed money tab (`(designed)/jobs/[id]/money/page.tsx`) mounts only `JobMappedValue` and `ValuePage`, so there are no invoices there at all. The parts exist as v1 components on `v2/main`, unstyled. This piece puts them on the V2 money tab in the designed look.

**Correction to Q62's item 5.** `FINAL_ACCOUNT_LOCK_REQUIRED` and the supplementary-invoice wording are already in `customer-invoices.tsx` on `v2/main` (lines 22, 32 and 40). What's missing is the card that mounts them on the designed money tab, and the designed classes.

## Planner reading (please confirm or correct)
1. **Look and placement, copied rather than merged.** Copy #918's (`claude/project-thread-qytlkj` @ 32decb2c1, read only):
   - `(designed)/job-invoices.tsx` (`JobInvoices`);
   - its money-page mount;
   - the `designed` prop pattern in the six components below;
   - their CSS.
   Never merge #918 or cherry-pick its commits. Don't copy #918's `pilot_no_charge` branch (`PilotJobs`); it isn't a V2 route.
2. **No behaviour or money change.** Every amount, label, `aria-label`, test id, button order, disabled rule and error text stays as `v2/main` has it. With `designed=false`, the markup is unchanged and the existing invoice, final-account and final-check specs pass unchanged. Where #918's copy differs from V2's, V2 wins.
3. **The routes are the shared v1 final-account, lock and invoice routes** already on `v2/main`. Name them in the PR as "Shared v1", per Q62's plan check condition 2. No new route.
4. **The company-only rule stays.** A company session with no practice session still sees only `JobMappedValue`, as the page's comment says.

## Dry-check (rule 23)
- `v2/main` @ 77ed320e7:
  - `(designed)/jobs/[id]/money/page.tsx`, which mounts `JobMappedValue` plus `ValuePage` (not designed);
  - no `(designed)/job-invoices.tsx`;
  - `customer-invoices.tsx` lines 22, 32, 40 and 152 to 153;
  - none of `customer-invoices`, `final-account-lock`, `job-final-account`, `final-check-reveal`, `customer-receipts` or `job-value` has a `designed` prop.
- #918 @ 32decb2c1, `designed` uses per file: `customer-invoices` 19, `final-account-lock` 13, `job-final-account` 14, `final-check-reveal` 22, `customer-receipts` 6, `job-value` 24. Its money page:
  - mounts `<JobInvoices/>` and `<ValuePage designed/>`;
  - wraps `JobMappedValue` in `<Legacy label="Value receipt" cards>`.
- #918's specs: `DUI-3.spec.ts` (the final check reveal and lock, using `helpers/final-account-lock-journey-designed.ts`), `DUI-4-own-job-to-paid.spec.ts` (a blank firm's own £900 job to its paid end report) and `DUI-4-found-extra-to-paid.spec.ts`.

## Build
1. Copy `JobInvoices` to `(designed)/job-invoices.tsx`, minus anything that isn't on `v2/main`. List each removed piece in the PR.
2. Add `designed?: boolean` to the six components, following #918, and pass it only from the designed money page and `JobInvoices`.
3. Mount on the V2 money page, as #918 does, keeping the company-only rule.
4. Copy only the CSS these use into `design-fit.css`, and list it in the PR.
5. Lane `config/lanes/v2-sq-i3.json`. Record each mount on the six main-owned components, the money page and `design-fit.css`.

## Tests
- **Unit:** each of the six components renders through `renderToStaticMarkup` with `designed=true` and `false`. The designed version has the classes; the plain version matches today's markup.
- **e2e:** port `DUI-3`, `DUI-4-own-job-to-paid` and `DUI-4-found-extra-to-paid` as `V2-DUI-3`, `V2-DUI-4-own-job-to-paid` and `V2-DUI-4-found-extra-to-paid`, against the V2 designed routes, at 1280 and 360.
  - Use the rule 22 sign-in, typed input, and no injected adapter for any step claimed as real.
  - Every money figure the #918 spec asserts is asserted unchanged; never relax one.
  - Each spec checks the designed classes, no `jgd-legacy` ancestor on the invoice and lock controls, buttons at least 44 px, and no horizontal scroll at 360.
  - Put screenshots in the PR.
- The existing customer-invoice, final-account-lock, final-check and `real-*` money specs pass unchanged.
- **Rule 29/30:** no route or table added.

## Known limits (to write in the PR)
- V2's own payment schedules and stage invoices (K5A #929, #961, #992; K5B-1 #1013) aren't on this base. They get their designed look when they land.

## Done when
- On V2's designed money tab, a builder goes from the final check to Paid, including a found extra's supplementary invoice, in designed controls at 1280 and 360. Every amount is unchanged.
- CI1 is green, and the Codex check is clean or answered.

## Claude plan check, 28 Nov (stands in for Astra, no reply after 2 hours): PASS
