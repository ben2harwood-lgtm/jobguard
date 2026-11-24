# Q04 · V2-K2: calendar link (.ics) of the work plan

Tier: **RED** (who can read; new table). Migration **2017**. Astra: yes (build while pending; mark not ready for Ben). Rework risk: **medium**.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k2, section 2A item 7.
**Starts when:** R2 has pushed `codex/sandbox/v2-c3`. **Base:** `codex/sandbox/v2-c4` (#903) with the new c3 merged in. Draft PR against `codex/sandbox/v2-c4`.

## Goal
A private calendar feed of the work plan: the builder sees every task, a crew member only their own tasks, the customer only the days work happens at their home. No prices.

## Scope
- One table of feed tokens: firm, job (or firm-wide for the builder), holder (builder membership, crew member, customer), random token stored as a hash, created, revoked. Builder creates and revokes (commands, each with an audit event; the token itself never goes in the audit payload).
- A read route `GET .../calendar/<token>.ics` that serves standard iCalendar from c3's plan tasks (title, trade, date, duration, job address for crew and builder; customer sees "Work at your home: <trade>" and the day only).
- Revoked or unknown token: 404, no detail. No prices, notes, private photos or hidden findings ever.
- Builder control on c4's Plan screen: "Calendar links" with create, copy and revoke, V2 only. Mount as a new component; stop and report if c4 files need more than one mount line.

## Done when
- The builder's, tiler's and customer's feeds each show exactly what they may see; a revoked token returns 404; a plan change appears after refresh; the second firm's token never shows this firm's tasks.
- Feed output is valid iCalendar (parse it in a test). Audit events for create and revoke; none for reads.
- Playwright at 360/1280 with the phone-mode run on this Mac. CI green apart from Vercel.
