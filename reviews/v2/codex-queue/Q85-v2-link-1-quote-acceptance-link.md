# Q85 · V2-LINK-1: a V2 practice job can issue its own customer quote-acceptance link, without main's demo database lock

**Tier:** T3 RED (a customer link, plus a definer; security review on desktop Codex). **Builder:** Opus 5.5 thread. **Checker:** desktop Codex code review and security review. **Base:** v2/main + #1057 at its head when you start (record the sha). If Q81's 2089 has landed, stack on it. **Branch:** the builder thread's own branch, in a new lane `config/lanes/v2-link-1.json`. **Migration:** one new V2 number from the register (final at merge through `tools/migration-renumber.mjs`). **From:** H1 dry run B2 (`/mnt/project-files/jobguard-v2/notes/h1-dry-2026-11-28.md`) and the Q84 stop (28 Nov 15:36 UK). **Plan check:** Astra on frm-management-layer#3, with a Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 15:40 UK.

## What it is
"Get practice customer link" on a V2 job calls `app.demo_issue_customer_link` (0518, last redefined in 0749 LP6D). Its body refuses with `SYNTHETIC_MODE_REQUIRED` unless `current_database()='jobguard_synthetic_demo'`. V2's database has a different name, which we don't change. So H1 step 9 ("customer accepts by link") can only be done by the builder recording the acceptance. There is no V2 quote-acceptance link on v2/main: F6 #923 (extras) and G3 (handover) issue other kinds of links.

## One rule for V2 and main's demo functions (it also settles Q81-2)
V2 never calls a main `demo_*` function that checks `current_database()`, and never changes one. Where V2 needs the same behaviour, it gets its **own V2-owned definer**. That definer:
- copies main's checks one for one, except that the database-name check becomes V2's practice-tenant check, the same one `enforcePracticePair` and Q81's 2089 use;
- comes with a **parity test** that lists every other refusal in main's function and proves the V2 function refuses the same inputs.

Main's SQL, lp6 and 0518/0650/0733/0749 stay byte-for-byte the same.

## Steps
1. **Dry-check first, and report before writing SQL.** Can `app.customer_portal_current` (0733) ever return true for a V2 practice job? It requires `job_commercial_track` small_builder/synthetic_demo, or no track and `provenance='system_generated_quote'` with status draft, quoting or accepted. If a V2 practice job meets that, the V2 definer can issue an ordinary `customer_portal_grant`. The customer page and accept-by-link then work unchanged. If it doesn't, stop and tell the planner which condition fails. Don't change `customer_portal_current`.
2. **Write `app.v2_issue_customer_link`** with the same signature and return as main's. Run the LP6D binding block first, unchanged. Keep, in the same order:
   - owner-only;
   - the advisory lock and the rechecks after the lock waits;
   - a `.invalid` recipient only;
   - the link digest as 64 hex characters;
   - content up to 4096 characters;
   - the own-quote vs. post-lock branch.

   Grants: REVOKE from PUBLIC and the shadow and infrastructure roles, and GRANT to jobguard_runtime, as in 0518.
3. **The V2 API route** for the launcher's "Get practice customer link" calls the V2 function for a V2 job, through enforcePracticePair. Main jobs still call main's function.
4. **The local catcher only.** The link is captured as `v2.delivery.captured`, and nothing is sent.

## Tests
- **Parity:** for each refusal in main's function, the V2 function raises the same code on the same input. Another firm, a non-owner, a revoked session, a non-`.invalid` recipient, a bad digest, oversized content, and a final-account lock without a catch extra are all refused.
- **A main-lane caller gets nothing new:** calling `v2_issue_customer_link` on a main job (not a V2 practice tenant) is refused.
- **Browser, at 1280 and 360:** a new spoken-quote V2 job, then "Get practice customer link", then the customer page opens, then accept, then the job shows accepted. Screens go in `screens/h1dry/b2/`.
- `tools/migration-renumber.mjs --check` is clean. v2-seed, CI1 and the DB integration suite pass. Rule 29/30: one route and no table.

## Done when
- H1 step 9 runs by link on a V2 practice job, and the builder-recorded acceptance is no longer needed as a workaround.
- Desktop Codex code and security verdicts name the head and are clean.
- Ben presses the RED card to merge, and the planner raises it.

## Planner decision (28 Nov 16:50 UK): PARKED after the dry-check
The builder's dry-check, on a fresh stack with 4 V2 jobs:
- **The grant itself works.** `customer_portal_current` can be true for a V2 practice job, issued by the shared practice owner membership.
- **But the database name gates the whole customer path, in 5 places.** They are `app.demo_issue_customer_link`, `app.customer_portal_issuer`, `identity.customer_portal_use`, `identity.customer_portal_quote` and `app.lp11_open_customer_scope`.

Under this packet's rule, V2 would need mirrors of all five. That includes the identity schema's customer redeem and quote read, and its own copy of lp11's customer-scope opener. In effect it is a second customer-auth path. That's too much security surface for a practice-only H1 step, and the issue-only half (option b, Q85a) gives a link no customer can redeem.

**So B2 is parked.** H1 step 9 keeps the builder-recorded acceptance, which Q87 accepts. Before any build, the design question goes to Astra and to Ben's catch-up: should V2 get its own customer-auth mirrors (one RED packet, a security review, five definers with parity), or should main's five routines accept a second named practice database? The second is a main-lane change, and only Ben's card can allow it. Nothing is built until one is chosen.
