# JobGuard V2 to completion: every remaining piece, ranked and batched (10 days, 25 Nov to 5 Dec 2026)

Planner: Fable thread, 25 Nov 15:20 UK. Ben, 14:47 UK: "make sure we code in the full thing". This covers the whole of V2 plan rev 1.3 (sections 2, 2A, 2B and 2C) to the end of chunk H, plus the follow-ups found since. **Rules are unchanged:** AGENTS.md rev 3.0, BUILD_PLAN.md, `codex-queue/01-RULES.md` rules 1 to 28 and `02-BUILD-RULES-CHECKLIST.md`. Only Ben merges. Every send goes to the local catcher only.

**How a piece goes from here to a builder.** Each line below is a packet stub: goal, base, dependencies, tier, builder and migration. When its batch is next, the planner writes the full packet into `codex-queue/`, dry-checked against the code as it stands then (rule 23). This is deliberately not done now for everything, because a dry-check made today goes stale as soon as the branches it names move. RED pieces get a Claude plan check on frm-management-layer#3 (Ben, 12:50 UK, in place of Astra's). Building starts before the verdict, but the PR isn't called ready until it lands.

**Builder lanes.**
- **A** is desktop Codex on Ben's Mac, two at a time. It takes pieces that need no live database while building; the database proof goes in seed or browser tests that CI1 runs.
- **W** is web Codex, for the same kind of piece.
- **O** is a Claude Opus thread, for pieces that need a live V2 database while building, security boundaries, and anything stacked deep.
- **B** is Mac lane B, the test lane. It runs seed and browser suites on every PR (three passes for browser tests) and never builds.
- The checker is always the other vendor (rule 27).

**Mock-ups first (screen rule).** Each new screen gets a clickable mock-up checked before it's built. Batch C includes one mock-up piece, M3, that covers every remaining screen, so no screen waits on that later.

## What "full JobGuard V2" is
One builder can take a real-looking job from the first walk-round to the handover pack and final account, entirely inside JobGuard, on a phone or a desktop:
- **walk and capture:** photos and notes by room, online and offline;
- **quote to plan:** a template-based plan, with prompts for things people forget;
- **materials and crew:** measurements, pack sums, merchant enquiries and stock, plus crew briefs and crew progress (Done, Blocked or Changed with photos);
- **replies and tomorrow:** customer, merchant and crew replies tied to open facts, reminders, the afternoon check, clashes and the Tomorrow list;
- **changes and money:** extras approved by link, daywork, change drafts, deposits and stage payments, chasing, job profit so far, and choices with PC sums;
- **customer:** the Friday update, approve by link, a calendar, and the handover pack;
- **close-out:** snags, the handover pack with versions and release, the final account and Final Check, a review request and aftercare;
- **proof:** full browser runs and real-phone runs on two fictional jobs.

All of this is **practice only on Ben's Mac** until hosting is decided (see "Ben's decisions" below).

## Built or in flight (not repeated below)
- **A:** a1, a2, a1-mac.
- **C:** c1, c2 and c3 (merged); c4 #903; c5 #921; c3b #922.
- **D:** d1 #904; d2 (merged); d3 #912; d4 and D4A #916; d5a #914; d5b-m #925; d5b-b Q23.
- **B:** b1a #920, b1 mock-ups (merged), b2b1 #924.
- **E:** e1 #919, e2 #949, e3 #932 and #937, e9 #948.
- **F:** f1 Q09, f6 #923, f6t #928, f6-ux Q25.
- **K:** k3 #935 and k3-f Q24, k4 #926 and #944, k5a #929, k6a #927, k8 #933, k9 #934, k10 #931.
- **Safety, CI and tests:** ci1 (merged), ci2 #947, bh1 #936, phone test #950, sx Q26, m2 mock-ups #930.

## Batch C: release 25 Nov evening (planner writes full packets within about 2 hours)
| # | Piece | Use | Size | Lane | Base / waits on | Mig | Tier |
|---|---|---|---|---|---|---|---|
| C1 | **M3 mock-ups** for Tomorrow, Your choices, Snags, Handover, Your handover pack, Daywork sheet, Certificates checklist and Share sheet | ★★★ | M | A | v2/main | none | T1 |
| C2 | **V2-PX** proof photos work on the V2 database (packet exists, `packets/v2-px...` moved into the repo) | ★★★ | M | O | v2/main | 2025 (V2 bootstrap) | RED |
| C3 | **K2A** builder-only calendar feed (Q04, needs its RED plan check) | ★★ | S | A | c4 #903 | 2017 | RED |
| C4 | **G0** certificates checklist by job type (template data, beside c1 and c5) | ★★ | S | W | v2/main + c5 #921 | 2026 | T1 |
| C5 | **K1** share a Friday update, a brief or a link to WhatsApp via the phone's share sheet (no send by JobGuard) | ★★★ | S | W | k3 #935 + d5b-b | none | T1 |
| C6 | **B1B** walk screen (mock-up merged) | ★★ | M | A | b1a #920 | none | T1 |
| C7 | **C3C** crew binding: a named crew member on the job, test crew sessions | ★★★ | M | O | SX (Q26) | 2027 | RED |

## Batch D: about 26 to 27 Nov
| # | Piece | Use | Size | Lane | Waits on | Mig | Tier |
|---|---|---|---|---|---|---|---|
| D1 | **K10-R** real crew and customer refusal tests for job profit | ★★ | S | W | SX | none | T1 |
| D2 | **K5A-1** payment schedule counts every approved extra (same total as K10) | ★★ | S | W | #929, #931 | none | RED money |
| D3 | **F1-P** photos on Done, Blocked or Changed | ★★ | S | A | F1, PX | none | RED |
| D4 | **F2** proof holds the stage open while its upload is pending | ★★ | S | A | F1, PX | 2028 | RED |
| D5 | **B1C** check and correct the walk ("needs room" tray, corrections keep the original) | ★★ | M | A | B1B | 2029 | RED |
| D6 | **B1E** walk photo upload into the existing upload path | ★★ | S | O | B1B, PX | none | RED |
| D7 | **E7** reminders with delivery chase (stop on reply, catcher only) | ★★★ | M | O | e1 #919, e2 #949, e3 | 2030 | RED |
| D8 | **E5A** same-firm double-booking warning (Q02) | ★ | S | A | C3C | none | T1 |
| D9 | **F8** who was on site today (Q10) | ★ | S | A | F1, C3C | 2016 | RED |
| D10 | **SYNC-1** merge main into v2/main (diary, photos on variations, Friday PDF, snag list, handover page, pack calculator) | ★★★ | M | O | Ben merges milestone one plus the QW PRs | none | T2 |

## Batch E: about 27 to 29 Nov, changes and money
| # | Piece | Use | Size | Lane | Waits on | Mig | Tier |
|---|---|---|---|---|---|---|---|
| E1 | **F3** change draft: quantity, materials, duration and price together, through the existing variation process | ★★★ | M | O | f6 #923, e9 #948 | 2031 | RED money |
| E2 | **F4** order already sent: show the difference, draft an amendment | ★★ | M | O | F3, d3 | 2032 | RED |
| E3 | **F5** join with E: a price-changing choice becomes a pending change | ★★ | S | A | F3, e9 | none | RED |
| E4 | **F7** daywork sheet (hours and materials, approve by link) | ★★★ | M | A | f6, M3 | 2033 | RED money |
| E5 | **K5B** deposit and stage invoices drafted and issued (practice) | ★★★ | M | O | K5A-1, SYNC-1 | 2034 | RED money |
| E6 | **K6B** merchant invoice real attached files | ★★ | M | O | K6A #927, PX | 2035 | RED |
| E7 | **DV1** diary entries get a "customer can see this" flag (touches main's diary) | ★★ | S | O | SYNC-1 | 2036 | RED |
| E8 | **K3-D** Friday update includes flagged diary entries | ★★ | S | A | DV1, k3 | none | RED |
| E9 | **C6** add a line to a priced quote (quote track; makes c5 prompts actionable). **Ben, 25 Nov 17:39 UK: in V2, practice first** (he first pressed "On main", then asked for the recommendation). | ★★ | M | O | SYNC-1 | 2037 | RED money |

## Batch F: about 29 Nov to 1 Dec, tomorrow and crews
| # | Piece | Use | Size | Lane | Waits on | Mig | Tier |
|---|---|---|---|---|---|---|---|
| F1 | **E4** afternoon check: ready, blocked or waiting, and a proposed swap (existing scheduler and decisions inbox) | ★★ | M | O | e1, e3, F1 | 2038 | RED |
| F2 | **E5** clashes across jobs ("clash" or "no clash" only) | ★ | M | O | C3C, E4 | 2039 | RED |
| F3 | **E6** apply and tell: briefs update once, customer asked for access | ★★ | M | O | E4 | 2040 | RED |
| F4 | **E8** Tomorrow screen plus the 6pm crew list (catcher only) | ★★★ | M | A | E4, M3, C3C | none | RED |
| F5 | **B2B** real camera photos into the resumable upload (encrypted pending) | ★★ | M | O | b2b1 #924, PX | none | RED |
| F6 | **B2C** kill and resume an offline capture | ★★ | M | O | B2B | none | RED |
| F7 | **My brief** for a crew member by link (Done, Blocked, Changed from their own link) | ★★★ | M | O | C3C, F1, M2 #930 | 2041 | RED |

## Batch G: about 1 to 3 Dec, close-out
| # | Piece | Use | Size | Lane | Waits on | Mig | Tier |
|---|---|---|---|---|---|---|---|
| G1 | **G1** snag register (adopts QW-4 from main) | ★★★ | M | A | SYNC-1, M3 | 2042 | RED |
| G2 | **G2 and G3** handover pack, versions and release (adopts QW-5) | ★★★ | M | O | G1, G0, SYNC-1 | 2043 | RED |
| G3 | **G4** who can read the pack (other firm, cancelled recipient) | ★★ | S | O | G2 | none | RED |
| G4 | **G5** hidden findings stay hidden (twin-job comparison) | ★★ | M | O | G2, E4 | none | RED |
| G5 | **G6** close the account: final review, lock and Final Check on the existing invoice path | ★★★ | M | O | K5B, G2 | none | RED money |
| G6 | **G7** Snags and Handover screens, and the customer's "Your handover pack" | ★★ | M | A | G1, G2, M3 | none | T1 |
| G7 | **G8** review request after handover (catcher only) | ★★ | S | W | G3 | 2044 | RED |
| G8 | **G9** aftercare offer at 6 and 12 months | ★ | S | W | G3 | 2045 | RED |

## Batch H: about 3 to 5 Dec, proof
| # | Piece | Lane | Waits on |
|---|---|---|---|
| H1 | **H1** full browser run, from an empty account to a kept handover, with builder, trade and customer sign-ins | O + B | everything above |
| H2 | **H3** second fictional job (utility room and landing), crew clashes | O | H1 |
| H3 | **H4** interrupt and resume the local environment mid-job | O + B | H1 |
| H4 | **H2, B1D and B2D** real-phone runs on a named phone. **Ben, 25 Nov 17:43 UK: his iPhone, around 4 Dec, one session of about an hour with a step-by-step script. Android stays "not yet tested".** | **Ben's phone** | H1, B2C |

## Held for Ben (not scheduled until he decides)
- **D4B** translated crew briefs (needs a paid translation route). **Ben, 25 Nov 17:37 UK: plan it with a paid service.** The planner writes the D4B packet plus a privacy note (job details leave JobGuard). Ben picks and pays for the service; practice use first, real use only after the privacy check.
- **F1-cam** one-tap camera (after B2B1's device piece).
- Quote options (#19, a main quote-track piece).
- Start-simple mode (#25, DUI plan).
- Hosting and the pilot. **Ben, 25 Nov 17:35 UK: decide around 3 Dec, after the full browser run.** No hosting account or spend before then; pilot hosting follows G1.
- Big ideas A, C, D, E and F. **Ben, 25 Nov 17:47 UK: all later, after V2.** Revisit with pilot feedback.

## Migration numbers reserved
2025 PX (V2 bootstrap), 2026 G0, 2027 C3C, 2028 F2, 2029 B1C, 2030 E7, 2031 F3, 2032 F4, 2033 F7, 2034 K5B, 2035 K6B, 2036 DV1, 2037 C6, 2038 E4, 2039 E5, 2040 E6, 2041 My brief, 2042 G1, 2043 G2/G3, 2044 G8, 2045 G9. 2046 K5A-2 (Q34). 2047 to 2051 V2-FL-1 to FL-5 firm-lock slices (Q35 to Q39). **Next free: 2052.** A builder whose piece turns out not to need its number leaves it unused. A builder that needs a number not listed here stops and asks.

## Throughput check
That's 46 pieces over 10 days, about 5 released a day. Lane A runs two at a time, W one or two, and O three or four threads at once. B tests every PR. Batches overlap: the next batch's packets are written while the current one builds. **The real limit is merging.** About 25 PRs are already waiting on Ben, and each stacked piece needs its base merged first. **Settled (Ben, 25 Nov 12:10 UK, "Merge everything to unlock everything"):** the "Merge all ready PRs" thread merges continuously once CI is green and the review is clean. Ben merges by hand only for releases and deploys. No daily merge slot is needed.

## Change, 25 Nov 16:35 UK: V2-SX revision 4
Customers and crew never get a main sign-in on V2. They reach it only through V2 capability links (F6, E2, K3, F7 My brief, K2 feeds, Your choices, handover pack). Each capability piece proves its own confinement with SX's `assertCapabilityConfined`. D1 K10-R needs only SX rev 4 (cases a to d), and D8 E5A and D9 F8 need only C3C. Migration 2024 is freed.

## Change, 25 Nov 17:50 UK: plan checks go to Astra; Codex builds as much as it safely can
Ben, 17:38 UK: from now on, plan checks go to Astra on frm-management-layer#3, not Claude threads. Keep desktop and web Codex coding alongside Opus. Every new packet names Codex as builder unless it needs a live V2 database while building or a security boundary design. The V2-FL sweep is split into FL-1 (Opus, guard test plus core) and FL-2 to FL-5 plus FL-F (Codex).
