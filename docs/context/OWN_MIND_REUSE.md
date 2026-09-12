# What else to reuse from OWN MIND — for JobGuard and the control plane

**Date:** 11 September 2026 · **Question (Ben):** beyond the three assets already extracted (the red-team harness, the governance validators, the Ed25519 verifier), what else from how we worked on OWN MIND should the two new builds take?

**Bottom line:** Both builds have already absorbed the OWN MIND *method* — remarkably so, mostly reinvented cleanly rather than copied. The builder ≠ checker recorded-verdict loop, founder-reserved decisions, append-only history, honest-evidence language, self-hashing versioned evidence, and "no boolean equals authority" are all present. What was genuinely still missing is small and specific, and I have now applied most of it.

## Reuse table

| From OWN MIND | JobGuard | Control plane | Status |
|---|---|---|---|
| **Cross-model builder ≠ checker loop**, recorded verdicts, founder-reserved decisions (working agreement §3–4) | take (adapt) | take (adapt) | Both already inherit it. **Applied:** promoted from the dated issue packet into a durable JobGuard invariant, AGENTS §5.13. |
| **Agent lane-boundary lint** (`tools/agent-lane-boundary-lint.mjs` + `config/agent-lane-assignments.json`) — the mechanical control whose absence caused OWN MIND's six duplicate branches | take (adapt) — highest value | already has a lane concept | **Applied to the plan:** M0-1 now ships it (run in CI, not only as a bypassable hook) before the first parallel wave, because JobGuard dispatches M0-2/M0-3/M0-4/M0-12 to separate agents — the exact configuration that caused the duplicates. |
| **cwa_v2 harness** — sealed-capture, self-hash, pre-registration, calibration-anchor / kappa-reliability design (untracked, 134 green tests) | lesson only (JobGuard §5.8 already specifies the same self-hashing evidence pattern in TypeScript) | **take (adapt)** — it is a purpose-built substrate for the control plane's M4b measurement (frozen pre-registered manifests, double-checked ground truth, held-out vs adaptive sets) | **Applied:** extracted into the control-plane repo `extracted/research_redteam_harness/cwa_v2/` (134 tests still green). Use its canonicalisation as a cross-language rejection-corpus for M1, **not** as the signing kernel — it is not RFC 8785 JCS. |
| **Pre-commit rails / supply-chain lints** (action-pinning, the canary anti-vacuity self-test) | take (adapt): pin GitHub Actions to full SHAs; ship a canary that fails the build if a detector stops biting | already pins deps | **Staged** in the rev 2.2 change log (M0-1 CI) as a should-fix. |
| **RPL founder-receipt + SHA-256 evidence gate + manifest re-pin** ceremony | lesson only | superseded | The control plane's Ed25519 signed approach already supersedes the "status: VALID string typed into JSON" weakness. The RPL *lesson* (bind acceptance to exact code identity) already lives in both plans (JobGuard §5.3 Decision binding; control-plane subject binding). Neither needs the ceremony verbatim. |
| **CANON / NOW / queue** governance for parallel work | take the lesson | take the lesson | You now steer three lanes (JobGuard, control plane, standing OWN MIND WKC-PREP-01) from one head. A single cross-programme **NOW pointer** + reserved-decision queue is the mechanism for exactly that. A living `NOW.md` beats a dated issue packet. |
| **Hard lessons** — signature not delegable; archive never delete; the `--no-verify`/HUSKY bypass danger; false-green from failed uploads; "source-inspected ≠ tested ≠ verified"; token-routing tiers | mostly already present | mostly already present | K01, archive-never-delete, and the three-way evidence distinction are already in both plans. **Applied:** the bypassable-hook lesson is now explicit in JobGuard M0-1 (lane lint runs in CI, not only as a hook); the checker/evidence discipline is now AGENTS §5.13. The token-budget rule (Claude scarce; no silent API billing) is worth one line in the issue packet given your £0 setup. |

## What I applied vs what remains your call

**Applied now:**
- Extracted `cwa_v2` into the control-plane repo (control-plane reuse gap closed).
- Promoted the checker loop into JobGuard AGENTS §5.13 (durable, not a dated packet).
- Put the lane-boundary lint into JobGuard M0-1 (before the first parallel wave).
- Backed up rev 2.1 and applied the plan fixes as rev 2.2.

**Still your call (one line each):**
- Wire `cwa_v2` in as the control plane's M4b substrate when that milestone is issued (it is extracted and ready).
- Adopt a single cross-programme `NOW.md` so three parallel lanes don't collide in the one head steering them.
- Add the supply-chain action-pinning + canary self-tests to JobGuard's CI when M0-1 is built.

**Verdict for you:** you had already taken what matters. The one thing that would have bitten — no mechanical lane lint while dispatching parallel agents onto shared files — is now in the JobGuard plan. The one thing left on the table — `cwa_v2` as the control plane's measurement substrate — is now extracted and waiting for that milestone. Nothing here blocks starting tonight.
