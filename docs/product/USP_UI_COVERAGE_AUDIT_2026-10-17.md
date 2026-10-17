# JobGuard — product USPs, build-plan coverage and UI audit
**17 October 2026 | PROPOSED REVIEW PACK — not adopted / not release evidence**

## Executive verdict
The approved visual board and the early demos showed site extras, review, finance, and a small-builder quote/payment subset. They **did not demonstrate the full proposition** in the early JobGuard Sales Bible: a UK *profit watchdog for builders*, following one confirmed job from site survey and quote through materials, readiness, proof, extras, final account, supplier/customer payments and Final Check. The underlying rev 3.0 plan already contains most of this domain scope, but the old demos underrepresented it. A full workforce scheduler, Gantt and detailed job-estimating cost model are **not unconditionally authorized** by the plan.

Sources inspected:
- `BUILD_PLAN.md` rev 3.0 on main, including adopted least-privilege §11.8, §§1,7,9,10,11,12,13,14 (fetched 17 Oct; historical build-status rows are not a fresh CI verdict).
- `AGENTS.md` rev 3.0, especially authority and independent-checking rules.
- `JobGuard Sales Bible` Parts 1, 2, 4, 5, 6 and 7, from the founder's existing material. That Bible describes the proposed *finished product*, not what can be sold as live today. The older Firm and Contractor subscription tiers in Parts 4/5 conflict with rev 3.0 §1.3/§13 and must be corrected.
- Founder-approved 15 October reference image board and the 16–17 October fictional demonstration source (separate Cloudflare Pages projects).

## Product benefits worth demonstrating in a customer's first 10 minutes
For the owner-run small builder: *say it once*; quote without missed or unpriced scope; avoid supplier overcharges and short deliveries; avoid paying a crew to arrive at an unready job; capture proof before work disappears; record every extra; finish the final account promptly and check for genuinely missed work; follow invoices, part payments and recoveries. The builder keeps all their own captured extras; an eligible JobGuard Final Check find follows its separate approved paid-recovery policy. These are proposed commercial mechanisms, not tested customer outcomes.

For the contractor: an operative captures site-originated extras in seconds; scope/evidence is checked; the contracted approval chain and client sign-off occur at the right revision; finance can reconcile what is actually billed and paid; live possible-extra prompts go to appropriate supervisors. **Do not mix the delayed small-builder Final Check disclosure rule into contractor workflows.** Contractor fees, where authorised, have their separate agreement and ledger rules.

## Seven-money-leak coverage map
| Value proposition | Existing plan foundation | Earlier UI gap | New fictional mock-up | Remaining production/release boundary |
|---|---|---|---|---|
| 1. No work lost between site survey and quote | M1-2/3/4, UIWIRE capture, MON-7 | Voice/capture and missing-line checks not explained as a continuous story | Existing builder quote specimen + Product Preview | Connected extraction, sources, gap review and live/provider checks |
| 2. No underpriced or unpriced line | M1-4, UIWIRE-2, M5-6 (later learning) | No own-rate worksheet or understandable cost/margin | **Quote costing**: saved selling rates, job line quantities, entered material/labour/other costs, estimate summary | UX-Q1 scope decision: full costing model/overheads/tax, preserving accepted quotes |
| 3. No short or overpriced materials left unnoticed | M2-1…5; M2-2-S goods receipt and M2-4-S matching | No receiving-day workflow, nor ordered–accepted–invoiced comparison | **Delivery check-in + price match** with short/part delivery and invoice variance | UX-D1 production UI, verified documents, OCR, merchant adapters, identity, G1/G2 |
| 4. No crew turning up when site isn't ready | M2-6-S/readiness; M2-6 live remainder | No staff availability or what-next workday view | **Team & schedule**: hours/person/day, crew shortfall, overlap, access/predecessor/materials | UX-C1 requires founder scope decision. Full PM/Gantt is out of scope under §14.1 |
| 5. No hidden work without evidence | M1-10/UIWIRE-7, M3-5, M4-3 | No obvious stage proof/reminder mock-up | **Proof & stages**: work checkpoint, required evidence, explicit missing state | UX-P1 must use verified upload and actual proof gates; text illustration is not proof |
| 6. No extras forgotten/unapproved | M1-9, ENT-3/5, SV-1…6, MON-5 | Contractor part visible, full small-builder Final Check not | Existing guided/blank capture+review; Final Check visual concept in board | True connected and accepted state, distinct contractor vs small-builder origin/fee rules |
| 7. No delay or invented 'paid' status | M1-11/12, M4-7/8/12, MON-6, ENT-6/7 | Finance panels detached from quote, delivery and job | Sandbox export, invoice, part-payment; money trail labels | Bank-verified funds, payment rails, customer provider sends, fee policy/gates are not demonstrated |

## Feature families to retain in the complete UI map
| Family | Plan reference | Customer-facing UI expectation | Honest current status in demos |
|---|---|---|---|
| Customer, property and paying party | CH-3a/3b | Plain setup and relationship to job and quote | Interactive blank sandbox |
| Survey capture, confirmed scope, estimate and quote | M1-2/3/4/5/6 | Review words once → confirmed scope lines → priced quote → acceptance | Interactive draft quote-costing mock; external acceptance is unconnected |
| Purchase order and delivery check-in | M2-1/2 | On-site item quantities; damaged/rejected/missing; later delivery; a note/document identity | Browser-only interactive mock |
| Merchant invoice comparison and decisions | M2-3/4/5 | Side-by-side ordered/accepted/invoiced, rate, quantity and source | Deterministic typed-value practice; no OCR/vendor validation |
| Crew capacity, daily plan and readiness | M2-6 and candidate UX-C1 | Who is assigned, which hours clash, what prevents work tomorrow | Browser-only bounded demo; *not* an approved full scheduler |
| Site stage proof and mobile capture | M1-10, UIWIRE-7, M3 | Requirements per stage, attachment status, offline queue truth | Text-only checkpoint; photo proof and native sync unconnected |
| Extras and approval progress | ENT-3/5, M1-9, MON-5 | Who acts next; exact amount/revision; reason and audit history | Fictional interactive design; no real client send |
| Final account, Final Check and fees | UIWIRE-9, SV-1…6, CH-9 | Builder's bill locked first, evidence-linked findings and explicit dispositions; fee only on eligible paid outcomes | Prior visual example; requires full reviewed domain connection |
| Invoices, stage payments, customer portal, bank proof | UIWIRE-10…12, M4, MON-5/6 | Clearly different sent, billed, part-paid and verified/settled states | Fictional invoice/payment mock |
| Recovery cases and evidence bundles | M4-1…17 | Human-approved letters, source pack, case history and real settlement distinction | Planned; not completed by this UI exercise |
| Native/offline operative and accounting/merchant connectors | M3, M5, ENT-12/13 | Local/queued/synced states and honest provider-specific integration status | UI concepts only; no native/device/provider proof |
| Contractor work order/SoR, approval, billing and value dashboard | ENT-1…14 | No independent second back office, integrate with contract/permissions | Existing 29-panel reference guided demo; completion not established by this pack |

## UI design decisions adopted for the isolated mock-ups
- One prominent next action, contextual explanation; ordinary builder language, not developer vocabulary.
- Make task distinctions visible: order ≠ delivery ≠ invoice; site captured ≠ priced ≠ approved; exported ≠ invoiced ≠ paid; entered manual money ≠ bank-verified settlement.
- Protect the original founder-approved visual style: dark navy navigation, generous pale surfaces, teal primary controls, photographs/evidence, short labels.
- Disclose when a screen or source fact is fictional. No payment, supplier order, outbound email, third-party fetch, API data mutation, AI detection or automatic schedule update is made by the browser demo.
- Keep the genuinely blank business separate from the seeded showroom. Browser data is local to its origin and downloadable.

## Public design deliverables
- [11-stage guided reference-matched demonstration](https://jobguard-guided-tour-20261017.pages.dev/)
- [Tommy's genuinely blank practice business](https://jobguard-blank-sandbox-20261017.pages.dev/)
- [Prepared full-product USP/feature showroom](https://jobguard-full-product-20261017.pages.dev/)

These are preview demos, **not** the production JobGuard app or new backend components. The seven-leak homepage, quote costing, delivery/invoice checks, crew/readiness and proof examples are interactive, but are not wired into one authoritative job ledger or live services.

## Verification evidence (17 October; not independent acceptance)
- Existing public guided/blank flows: 33 browser checks passed, plus five focused guided/navigation checks.
- New standalone feature exercises: 16 Chrome checks passed across locally entered rate/estimate, partial delivery, invoice variance, crew shortage, proof, browser reload and 360/390/768/1440px layouts.
- Prepared showroom: seven separate browser checks passed (sample data, quote, delivery variance, linked readiness, proof, narrow viewport, no uncaught errors).
- Tests were run in actual Chrome against public HTTPS previews after deployment. **No independent human unscripted trial** has been observed and no production end-to-end CI, supplier connector, photo evidence, payroll or live finance result is claimed.

## Plan correction / release guidance
New **§11.3A** contains UX-Q1, UX-D1, UX-C1, UX-P1 and UX-DEMO1 as proposed reviewable additions; §12.5 holds them outside the adopted dispatch graph; §13.3 ties product benefits to the UI; §14.3 logs the finding. Full roster/Gantt remains forbidden without separate scope approval. Do not represent simulated screens as completed APIs; don't change contractor/small-builder commercial policies, contracts or live gates.

Before accepting these plan changes: record the independent plan reviewer verdict, Ben's scope decision (especially labour-margin estimation and limited crew planning), design acceptance against the original artwork, and human builder trials under M1-15T. Then, if adopted, update the dependency graph and issue one acceptance-tested task per implementation slice. Do not merge this draft simply because the screen preview passes.
