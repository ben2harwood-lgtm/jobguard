# JobGuard: next usable milestone and deferral list (Build Speed Plan v5, B1a + B2)

Prepared 20 Oct 2026 by the Track A/B session, from origin/main `dc572123`, BUILD_PLAN rev 3.0 §10 and §12.3,
the Command Center road, Ben's 17 Oct finishing order and the open PRs.

## B1a: milestone (ANSWERED by Ben, 20 Oct)

Ben first saw a contractor-demo proposal and chose **"Small-builder demo"**. His deferral answer approved a list that
parked the small-builder track, so he was asked again and chose **"Redo for small-builder (Recommended)"**.

**Milestone: the whole small-builder practice journey (DEMO-S), on made-up data.** Acceptance is the DEMO-S card
unchanged: a guided chooser runs `core-1000`, `recovery-18800`, `shadow-30000`, the meter profiles and the trial, with
resume/reset, every figure reached through the full fresh journey (no seeding into the end state), both browser
projects, and an end report linking every screen to stored state. Two independent checks per piece, green CI, Ben merges.
DEMO-S runs in both browser projects, so the 17 Oct "no UI polish yet" rule is lifted for the journey's screens.

## B2: needed or can wait (APPROVED by Ben 20 Oct: "Approve list (Recommended)")

| Item | Call | Where it stands |
|---|---|---|
| SV-5 Final Check (#189, #181) | **Needed** | Coordinator owns; not touched here |
| SV-6 attribution + fee illustration | **Needed** | Waits on SV-5 |
| SV-7A diary/customer messages (rest) | **Needed** | Waits on CH-4 |
| CH-4 work-state commands (#290) | **Needed** | Repair now: conflicts + red CI |
| CH-5 import, CH-6 integrity, CH-8 packs, CH-9 value page | **Needed** | Wait on MON-1 / SV-5 / SV-6 |
| CH-7 eligibility (#298 CH-7-REST-B) | **Needed** | Two passes; repair one failing test now |
| MON-1 meter (rest), MON-2A plans (rest), MON-3 free first job (rest) | **Needed** | MON-1 waits on CH-4; MON-2A/3 remainders being inventoried |
| MON-4A fee on payment screen, MON-5 customer portal | **Needed** | Wait on SV-6 / SV-7A |
| MON-7 prevention checks | **Needed** | MON-7a merged; MON-7b was parked by Ben on 7 Oct (waits on M4-18). A card follows if DEMO-S cannot close without it |
| MON-8 entitlements (#299 MON-8-P-B) | **Needed** | Two passes; repair one failing test now |
| M4-9-S, M4-10-S, M4-12-S, M4-17-S money chain | **Needed** | M4-9 waits on SV-6, then in order |
| DEMO-S itself | **Needed** | Last |
| Contractor remainder: ENT-6B (#240), ENT-7, ENT-9A/B, ENT-11b | Can wait | Full contractor demo and its sales edition come after. #240 is green and close, so it is still integrated in maintain mode |
| ENT-10 company sign-on (#289, #296), ENT-8a live prompts, ENT-13a connectors | Can wait | Contractor pilot needs them later. #296 has two passes and is integrated in maintain mode |
| ENT-12 and M3-1 to M3-5 native/offline app | Can wait (already parked) | Demo runs in the browser and needs signal |
| Least-privilege chain LP-2 (#283) onward | Can wait | Fine for made-up data; required before any real customer data |
| Audit fixes #196, #206; stage-end sweep list; TESTS-* (#273, #274) | Can wait | Small hardening; reviewed TESTS PRs still merge in maintain mode |

Deferred items leave the active queue; their orders, receipts and branches are kept, nothing is deleted.

## Migration numbers reserved for this wave (owner: Track A/B session)

main ends at 0198. 0199 #298 CH-7-REST-B · 0200 #299 MON-8-P-B · 0201 #290 CH-4-C · 0202 #296 ENT-10-OIDC-B ·
0203 #240 ENT-6B · 0204–0205 held for the coordinator's #189/#181 · 0206+ new orders, issued in sequence here.
Whoever merges first keeps its number; the others keep theirs (no further renumbering unless one is abandoned).


### 20 October — Codex build wave while Claude usage is paused

Coordinator: Codex JobGuard coordinator. Reserved sequentially: **0206 MON-3-P-B** (`0206_free_first_job_admission.sql`), then **0207 CH-7-REST-C** (`0207_recovery_pursuit_terms_required.sql`). Existing **0203 ENT-6B** retained for the repair; **0201 CH-4-C** retained. No other numbers allocated. Builders do not edit shared catalogues, barrels or routing concurrently; coordinator integrates those changes serially. Builds remain synthetic, unreviewed and unaccepted until exact-head Claude verdicts and green CI; Ben owns all merges.

## Wave 2 (23 Oct, build-ahead under decision 74; Ben: "build non-stop", "fan out")
Issued to Codex gpt-6.1-sol: MON1-L, SV7A-INT-C, CH6-C, DEMO-P1 (Gmail) and MON1-T, CH5-C, CH9-S (Yahoo). Orders: ~/.local/share/full-steam/jg-orders/<ID>-v5-w2.txt. Specs are in the Astra build-ahead catalogue (jg-runs/v5-planning-wave-20261020T214337Z). All are built from main, except MON1-T, which is built on CH-4-C 14eca750.
Migration reserved: **0206 MON1-T (meter_small_trip)**. Next free: 0207.
No PR opens until each piece's predecessors merge (five-migration-PR cap respected).

## MON-7b (answered by Ben, 23 Oct: "drop")
DEMO-S closes its prevention scenario with MON-7a. MON-7b is dropped from the DEMO-S dependency list and stays parked behind M4-18.

Wave 3 (23 Oct): CH6-CSG-01 (from main, merge-ready after checks), CH8-A, DEMO-P2 (on demo-p1), CH9-R (on ch9-s). Wave 4: MON1-S on mon1-t+mon1-l, **0207 meter_lifecycle_source** reserved. Next free: 0208.

## Migration ledger CORRECTION (23 Oct, after a full branch scan)
My 0206/0207 reservations collided with the Codex coordinator's branches. Authoritative ledger from a scan of every branch:
0199 #298 CH-7-REST-B · 0200 #299 MON-8-P-B · 0201 #290 CH-4-C · 0202 #296 ENT-10-OIDC-B · 0203 #240 ENT-6B · 0204 #189 · 0205 #181 (coordinator; branches still show 0199 until renumbered) · **0206 MON-3-P-B** (coordinator, free_first_job_admission) · **0207 CH-7-REST-C** (coordinator, recovery_pursuit_terms_required) · **0208 MON1-T** (was 0206) · **0209 MON1-S** (was 0207) · next free **0210**.
Rule from now on: before reserving, scan `git for-each-ref refs/remotes/origin` migration trees, not just main and this ledger.

Wave 6 (23 Oct): SV6-05 (on sv6-01), MON1-A (on mon1-s, **0210 meter_place_admission**), M48-B1 (on m48-c0, **0211 receipt_line_source_bridge**). Full branch scan before reserving: nothing at 0210+. Next free **0212**.

## Tracked holds
- **H-MON1S-SHADOW-PRIV** (23 Oct, from MON1-S reviewer A): MON1-S lifecycle routines execute as jobguard_migration (SECURITY DEFINER), so "meter cannot read shadow tables" (M1S-08) is enforced by code, not by privileges. AGENTS §5.14 requires structural unreadability. This must be resolved before MON1-S merges, either with a definer role that has no shadow grants (provisioned via demo-bootstrap like jobguard_meter) or with a catalogue-level privilege proof.

Wave 7 (24 Oct, C250 rules): DEMO-I (on accepted demo-p2, **0214** if needed), CH9-J (on accepted ch9-r, **0215** if needed), CH9-B (on accepted ch9-r, **0216** if needed). 0212 is taken by post_lock_upload_guard. Next free: **0217**.

## Ownership split with the coordinator (agreed 24 Oct)
Coordinator: SV-5 (including SV5-GUARD), SV-6, MON-3, money chain (M4-9/10/12/17-S, MON-4A).
Track A+B session: CH-8, CH-9, DEMO-S, MON-1 (R/I/J), CH-5/CH-6/SV-7A follow-ons.
Anything outside both lists: message first. Migration numbers: reserve each one by message before use. 0213 is free again.
- 24 Oct: **0213 SV6-PERSIST-A** (coordinator, recovery attribution persistence). Mine stand at 0214 DEMO-I, 0215 CH9-J, 0216 CH9-B. Next free **0217**.
- 24 Oct: **0217 SV6-PERSIST-B** (coordinator). Next free **0218**.
- 24 Oct (coordinator): **0218 M4-9-S**, **0219 M4-10-S**, **0220 M4-12-S**, **0221 MON-4A**. Next free **0222**.
- 24 Oct (coordinator): **0222 M4-17-S**. Next free **0223**. Accepted: M4-12-S b3b322aa, MON-4A 967ac964.
- 24 Oct wave 8 (mine): **0223 MON1-I**, **0224 CH5-P**, **0225 SV7A-INT-P**, **0226 CH8-V** (if needed). Next free **0227**.
- 24 Oct wave 9 (mine): **0227 CH6-P**, **0228 MON1-R** (if needed); CH6-B no migration. Next free **0229**.
- 25 Oct: **0229 CH6-A** (if needed). Next free **0230**. Yahoo Codex lost gpt-6.1-sol (C266): Gmail only.
- 25 Oct (coordinator, C268): **0230 CH5-B**, **0231 SV7A-INT-A** (if needed). Next free **0232**. CH-5 and SV-7A remainders are now coordinator-owned.
- 25 Oct (coordinator): **0232 CH5-E**, **0233 SV7A-INT-D** (if needed). Next free **0234**.
- 25 Oct (coordinator, C270): MON-5 is now coordinator-owned; **0234 M5-PREP** (if needed). Next free **0235**.
- 25 Oct (coordinator): **0235 M5-AUTH**. Next free **0236**. CH-4-C-CATCHUP run 2 = ce9e83d3 (Zod 4 fix), in re-check.
- 25 Oct: **0206 MON-3-P-B** confirmed reserved (coordinator; catch-up building). PR #322 FLAKE-DIAG-2 and #323 MON-3C-P0 (docs) are queued for the next train.
- 25 Oct (coordinator): **0236 MON-3C-ELIG** (free_first_job_eligibility). Next free **0237**.
- 25 Oct: asked the coordinator to renumber #189 (SV5PRE) to **0237** (above every reservation) instead of 0209, to avoid renumbering my chain. Next free **0238**.
- 25 Oct: Ben moved the coordinator role for the SV-5/SV-6/M4/MON-3/MON-5/CH5-B·E/SV7A-INT-A·D·M family to the Codex coordinator chat (01a15a54); the Claude coordinator is now checker-only. Handover: ~/.local/share/full-steam/handoffs/COORDINATOR-HANDOVER-TO-CODEX-2026-10-25.md. Migration numbers: theirs run up to 0237; next free **0238**.
