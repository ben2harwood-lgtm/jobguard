# Q15 · V2-K3: Friday customer update

Tier: **RED** (customer-facing; must not leak private data). Migration **2021**. Astra: yes. Usefulness **high**, effort **S**. Rework risk: **medium**.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k3, section 2A item 5, plus plan section 9 point 4 (customer-supplied items).
**Starts when:** R2 has pushed c3. **Base:** that c3 head. It uses the job diary already on v2/main's base and the c3 plan; the QW-2 summary and F1 buttons will feed it later, so it does not wait for the main sync.

## Goal
Once a week the builder previews and sends the customer a short update: what got done, photos marked customer-visible, what's next, decisions needed, and anything the customer must buy and by when.

## Scope
- Table of updates: job, week, version, content snapshot, sent at, sent by. Commands: prepare, edit text, send. One audit event each.
- Content from the diary, plan tasks done and next, customer-visible photos only, open customer facts if E1 is available (skip that section cleanly if not), and customer-supplied items from D3 if available (skip cleanly if not).
- **No prices, private notes, other customers' photos or hidden findings.** Never sent without the builder's press; sent **only to the local catcher**.

## Done when
- The seed job's update lists done and next work and holds no amounts or private notes; editing then sending puts exactly one message in the catcher; a re-send of the same version adds nothing; second-firm and audit tests per the rules. Playwright of the preview at 360/1280. CI green apart from Vercel.
