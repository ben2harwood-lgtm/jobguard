# Q84 · V2-B1B2: on the V2 launcher the customer link opens, and the default practice recipient is allowed

**Tier:** T2 (local V2 launcher setup only; no product or main SQL change). **Builder:** Opus 5.5 thread. **Checker:** desktop Codex. **Base:** v2/main @ 77ed320e7 plus #1057. **Plan:** Q80 report B1 and B2. Don't touch `tools/v2/local-targets.mjs` (standing rule). Planner: 28 Nov 15:15 UK.

1. **B2.** "Get practice customer link" calls `POST /shadow-demo/customer-link` → `app.demo_issue_customer_link` and gets 403 SYNTHETIC_MODE_REQUIRED.
   - Find which mode check fails on the V2 launcher. Then use the V2 customer-link path (F6/G3 already issue V2 links) for V2 jobs.
   - Don't switch on main's demo-only synthetic mode, and don't rename the database. If the only fix is main's demo switch, stop and tell the planner.
2. **B1.** The launcher catcher refuses the default party email `practice-customer@example.invalid` with V2_RECIPIENT_BLOCKED. Add exactly that invented address to the catcher's allowed list, the same way G4 added `replacement@jobguard-v2.invalid`. Nothing real is sent.

**Tests:**
- A browser step on the launcher: send a quote to the default recipient (the catcher records it), then the customer opens the link and accepts.
- The H1 step 4 screenshot at 1280 and 360.

**Done when:** H1 steps 3 and 4 pass in the browser without workarounds.
