# Q12 · V2-F6: customer approves an extra by link

Tier: **RED** (customer approval of money). Migration **2018**. Astra: yes. Usefulness **very high**, effort **M**. Rework risk: **low** (base merged).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-f6, section 2A item 1. Practice slice of BUILD_PLAN.md MON-5 (Ben's decision 1); MON-5 stays the plan of record.
**Starts:** now. **Base:** `v2/main`. Draft PR against `v2/main`. It uses the variation path already on v2/main's base, so it does **not** wait for F3.

## Goal
For one variation version at a time, the builder makes a link; the customer opens it and sees the description, price and any photos of that exact version, with one "I agree" button.

## Scope
- Table of approval links: firm, job, variation, variation version, amount (exact decimal string), token stored as a hash, expiry, cancelled, agreed at, agreed by (name typed by the customer). Builder creates and cancels; the customer agrees. One audit event per command.
- Customer page by token, V2 only, no sign-in: shows only that variation version. No other prices, margins, notes, other jobs or hidden findings.
- On "I agree": apply the **existing** variation approval command with the link as the customer's evidence, bound to that version and amount. If the existing command can't take a customer-link approval without changing it, record the agreement only and show the builder a one-tap "Customer agreed by link at <time>: approve" using the existing command unchanged. Say which in the PR.
- The link is "sent" only to the local catcher.

## Done when
- Approving an old version's link is refused; a changed price needs a fresh link; a declined or unapproved change adds nothing to the committed price; another firm's link opens nothing; an expired or cancelled link is refused; a replayed agree applies once; the agreed quote and issued invoices are untouched.
- Playwright of the customer page at 360/1280 + phone-mode run. CI green apart from Vercel.
