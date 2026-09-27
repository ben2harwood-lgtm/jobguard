# Construction project/commercial platforms and AI quoting tools: pricing and overlap with JobGuard (research as of 24 Sep 2026)

Scope: heavier construction and field-service platforms, UK accounting with job-costing add-ons, variation/payment-application tools, and AI quoting/estimating startups, compared with JobGuard (voice-captured job → free quote → live job → logged extras/variations → final account/invoice, a post-bill "missed extras" check, supplier-invoice overcharge checks, withheld-payment recovery).

Labels used below: **[Vendor]** = the vendor's own pricing page, read in this session. **[3rd-party]** = review or aggregator site, not verified with the vendor. **[Competitor blog]** = a rival vendor's article, likely to be biased. **[Quote-only]** = the vendor publishes no price. All prices exclude VAT unless stated.

## 1. Price points, pricing unit, tiers, trials, contracts and implementation fees

### Takeaway
Pricing splits into four bands:
- **Low, published, per user or flat:** AI quote apps from £0 to £59/month; accounting from £16 to £70/month; Tradify at £34–44 per user; WorkflowMax from £5.50 per user.
- **Mid, published:** UK SME construction suites at £99–£2,250/month flat. Planyard charges £40–164 per project manager.
- **Quote-only field service:** Simpro, Commusoft and BigChange, at roughly £80–£300 per user per month plus onboarding. Commusoft has a 4-licence minimum.
- **Enterprise quote-only:** Procore (a share of annual construction volume, about $4.5k–$60k+ a year), Buildertrend (moved to quotes based on construction volume in 2026), and Causeway, COINS and Eque2 (thousands per user, or six-figure ERP deals).

### Cited Findings

**Heavier field-service platforms (UK)**
- **Simpro**, [Quote-only]. There is no public pricing, no free trial, an annual contract is typically required, and an implementation fee is typically charged. User-reported range: "$150/user/month to $300/user/month; enterprise accounts are custom". Target: "mid-market commercial contractors (10–500 technicians)". — [Field Service Guide, Apr 2026 [3rd-party]](https://fieldserviceguide.com/simpro-pricing/). Other review sites report about $70 per user per month for small setups, rising to $200–300 — [search summary of GetApp/Capterra/ITQlick listings [3rd-party]](https://www.capterra.co.uk/software/10529/simpro-enterprise). The vendor's UK pricing page returned HTTP 403, so I could not verify it.
- **Commusoft**, [Quote-only]. Reported starting prices vary: about $100 per user per month, with other sources saying $70 or $49. Every office worker and engineer needs a paid licence, with "a minimum of 4 licenses per account" — [search summary of Capterra/GetApp/ITQlick/Fervor Studio [3rd-party]](https://www.capterra.com/p/149651/Commusoft/). PricingNow (dated 8 Mar 2026) estimates about $100 per user per month ($12k a year for 10 users), plus one-off data-migration and training fees and annual renewal increases. It says its figures are AI-aggregated — [PricingNow [3rd-party]](https://pricingnow.com/question/commusoft-pricing/). The vendor's GBP pricing page returned 404, so I could not verify it.
- **BigChange**, [Quote-only on the vendor site]. The vendor page shows no prices, only "Request pricing". It claims "customers using BigChange save £5 for every £1 spent", and sells extras such as AI dashcams and fleet — [BigChange pricing page [Vendor]](https://www.bigchange.com/pricing). Third-party listings give Job Management at £79.95 per user per month, Plus at £99.95 per user per month (which bundles a rugged device), and vehicle tracking from £14.95 a month — [search summary of Capterra/TrustRadius/G2 listings [3rd-party, unverified]](https://www.capterra.com/p/149479/JobWatch-powered-by-BigChange/pricing/).

**Residential/US construction management platforms**
- **Buildertrend.** In 2026 it removed its published tiers. Its pricing page now shows no dollar amounts and quotes based on 11 annual construction-volume brackets, from "$0–499K" to "$31M+" — [Projul, 2026 [Competitor blog]](https://projul.com/blog/buildertrend-pricing-analysis-2026/); corroborated by [Contractor/aggregator summary](https://downtobid.com/blog/buildertrend-pricing).
  - Last published tiers: Essential $499, Advanced $799 and Complete $1,099 per month billed month-to-month, or $339, $499 and $829 per month on annual billing. All tiers had unlimited users and projects. Change orders and purchase orders only came with Advanced and above — [search summary of costbench/buildertrendpricing.com [3rd-party]](https://costbench.com/software/construction-management/buildertrend/).
  - The "Boost" onboarding is "free" with an annual contract. Extra coaching reportedly costs $500–2,000, and month-to-month customers pay about $100 a month for onboarding — [Projul [Competitor blog]](https://projul.com/blog/buildertrend-pricing-analysis-2026/).
  - One UK blog puts Buildertrend at "£235–£300/user" typical UK price, plus £2k a year for support — [BuildersAI, 16 Feb 2026 [Competitor blog, conflicts with the flat unlimited-user model above]](https://buildersai.co.uk/blog/construction-software-pricing-uk).
- **CoConstruct** (merged into Buildertrend). Buildertrend bought CoConstruct in February 2021 — [Buildertrend blog [Vendor]](https://buildertrend.com/blog/acquisition-coconstruct-software/).
  - Official migration page: "Projects can still be added through March 31, 2027"; after full migration no new CoConstruct projects are allowed; "No project data will be lost" — [CoConstruct when-to-migrate [Vendor]](https://www.coconstruct.com/when-to-migrate).
  - Third parties say migrating customers move to Buildertrend's Annual Project Volume pricing instead of a flat monthly fee, and that formal migration must start by 30 June 2027 — [search summary of JobTread/Projul/Billdr migration guides [3rd-party]](https://www.jobtread.com/news/jobtread-opens-a-migration-path-for-builders-facing-the-coconstruct-phase-out). One contractor reported a 65% price increase after the acquisition — [Projul [Competitor blog]](https://projul.com/blog/buildertrend-pricing-analysis-2026/).
- **Procore.** It charges "an upfront annual fee by product and based upon your Annual Construction Volume (ACV)", with unlimited users. Contracts are annual, with multi-year pool options. Implementation and training are said to be included. There is no published price and no small-contractor tier, and a UK /en-gb pricing page exists — [Procore pricing [Vendor]](https://www.procore.com/pricing).
  - Third parties put the effective rate at about 0.1–0.2% of annual construction volume. A small-contractor plan reportedly starts around $4,500 a year, and firms with $10–50M volume typically pay $15–30k a year. Renewal increases are reportedly 10–15% — [search summary of costbench/scanmanifold/downtobid [3rd-party]](https://www.scanmanifold.com/blog-posts/procore-pricing-2026-contractors).
  - **Conflict:** one aggregator says first-year implementation adds $50–150k+, while Procore says implementation is included. BuildersAI claims £375–£500 per user plus £20–50k implementation, which contradicts Procore's unlimited-user model — [BuildersAI [Competitor blog]](https://buildersai.co.uk/blog/construction-software-pricing-uk). A search snippet claiming Procore "starts at £29/user/month" is not credible and should be disregarded.

**UK construction ERP / commercial**
- **Eque2 EVision.** Built on Microsoft Dynamics Business Central, for "large and enterprise business with a turnover above £25m", with modules for subcontract, plant and CVR. Listings show about £70,000 as a one-off starting figure, but pricing is custom — [search summary of SoftwareFinder/Eque2 [3rd-party, unverified]](https://softwarefinder.com/construction/evision-construction-accounting); [Eque2 construction software [Vendor]](https://www.eque2.co.uk/construction-software/construction/).
- **Causeway.** Per-seat prices are not published and it is "positioned for mid-to-large practices". Third parties estimate Causeway Estimating at £3,000–£10,000 per user per year — [search summary [3rd-party, unverified]](https://www.softwareadvice.co.uk/software/215023/causeway-estimating). Commercial modules are quote-based — [Site Samurai, 3 Jun 2026 [Competitor blog]](https://www.sitesamurai.co.uk/compare/best-applications-for-payment-software-uk).
- **COINS (now Access Coins).** Per-user pricing, on quote only — [search summary [3rd-party]](https://www.sitesamurai.co.uk/compare/coins-alternative). It is an "enterprise quoting model" aimed at "finance-led contractors with established ERP infrastructure" — [Site Samurai [Competitor blog]](https://www.sitesamurai.co.uk/compare/best-applications-for-payment-software-uk).
- **Sage 300 Construction:** a perpetual licence from £5,000, typically £15–25k plus £2.7–4.5k a year — [BuildersAI [Competitor blog]](https://buildersai.co.uk/blog/construction-software-pricing-uk).

**UK SME construction suites with published prices (new entrants)**
- **Construction AI** (constructionai.io). Plans: Solo £130, Starter £350 (3 office and 3 site seats), Growth £995 (10 office, 15 site), Scale £2,250 (25 office, 50 site) per month, with Enterprise on quote.
  - 14-day trial with no card; annual billing saves 15%. Extra seats cost £130 per office seat and £30 per site seat per month.
  - Its AI Assistant is "bring your own key — no AI markup" — [Construction AI pricing [Vendor]](https://www.constructionai.io/pricing).
  - Claims payment applications with Construction Act payment notices, CIS/VAT and real-time CVR, and variations that cascade from the client to the subcontract — [search summary [Vendor blog]](https://www.constructionai.io/blog/best-procore-alternatives-uk).
  - Built by chartered builder Steve McKenna with AI-generated code (700k+ lines, 22 modules), and aimed at "the 98% of UK construction firms" priced out of enterprise tools — [Nomic newsletter, Mar 2026](https://www.nomic.ai/newsletter/ai-in-the-built-world/march-2026).
- **Site Samurai:** £99 Starter, £199 Professional and £699 Enterprise per month, unlimited users, 17% annual discount. Generates Construction Act payment, pay-less and payee notices, tracks NEC/JCT applications for payment, and has a subcontractor portal with evidence attachments — [Site Samurai, 3 Jun 2026 [Vendor comparison]](https://www.sitesamurai.co.uk/compare/best-applications-for-payment-software-uk).
- **BuildersAI:** a flat £149–£599 a month with no per-user fees and a 14-day trial. It covers site management (drawings, tasks, photos) and explicitly excludes CIS and accounting — [BuildersAI, 16 Feb 2026 [Vendor]](https://buildersai.co.uk/blog/construction-software-pricing-uk).
- **Planyard** (commercial cost control). Priced per project manager per month: Estimating £40, Essential £82, Professional £123, Ultimate £164. Enterprise is custom. Supporting staff cost £33 a month each. There is a 14-day trial — [Planyard pricing [Vendor]](https://www.planyard.com/pricing).
- **Payapps UK:** applications for payment, variations and retentions with Construction Act reminders. Customers report up to 50% lower processing time and cost. Price is not published — [Payapps UK [Vendor], via search summary](https://www.payapps.com/uk/).

**Site diary / field forms**
- **Sitemate Dashpivot:** Standard $32, Pro $54, Premium $76 and Platinum $98 per user per month, with a free version and trial — [search summary of Capterra/Sitemate listings [3rd-party]](https://sitemate.com/software/dashpivot/pricing/). The vendor page returned 403 and GBP prices were not found.
- **Buildtools** (US): "Packages starting from $499 / Month", paid monthly on a 12-month commitment, with no setup fees — [Buildtools pricing [Vendor]](https://www.buildtools.com/pricing).

**Estimating / takeoff**
- **Kreo:** Lite £25, Plus £50 and Pro £125 per user per month billed annually, with Enterprise custom and a 7-day trial. AI features include Caddie AI and, on Pro, auto-measure and auto-count — [Kreo pricing [Vendor]](https://www.kreo.net/pricing).

**Trade job management (lighter tier)**
- **Tradify UK:** Lite £34, Pro £37 and Plus £44 per user per month, with a 14-day trial. Pro adds progress invoicing, job photos and cost/bill tracking. Plus adds "SmartRead for Bills (AI-powered cost capture)", SmartWrite and purchase orders. It syncs with Xero, Sage and QuickBooks — [Tradify UK pricing [Vendor]](https://www.tradifyhq.com/en-gb/pricing).
- **WorkflowMax by BlueRock:** Essentials £5.50 per user per month (3–25 users), Pro £10 (5+ users, adds "quote variations"), Advanced £17 (10+ users, AI-powered reporting and WIP). All billed annually; 14-day trial, no setup fees, no contract. Includes purchase orders and supplier invoicing with Xero/QuickBooks sync — [WorkflowMax pricing [Vendor; figures are unusually low, so check whether they are promotional]](https://www.workflowmax.com/pricing).

**UK accounting and add-ons**
- **Xero UK:** Ignite £18, Grow £39, Comprehensive £55, Ultimate £70 per month. New customers get "90% off for the first 6 months".
  - Projects (job costing) is included only in Ultimate, for 10 users, with extra users at £5 each.
  - Hubdoc document capture is included. CIS returns cost £5 a month. Ignite is limited to 20 invoices/quotes and 10 bills — [Xero UK pricing [Vendor]](https://www.xero.com/uk/pricing-plans/).
- **QuickBooks Online UK.** Tiers are Sole Trader Plus, Simple Start (1 user), Essentials (3 users), Plus (5 users) and Advanced (25 users). Project profitability and purchase orders come only with Plus and Advanced. There is a 30-day free trial with no contract — [QuickBooks UK pricing [Vendor]](https://quickbooks.intuit.com/uk/pricing/). Live GBP prices did not load. Third parties quote Simple Start at £16 and Essentials at £38 a month (£3.80 during a 6-month promotion) — [search summary [3rd-party]](https://www.expertmarket.com/uk/accounting/quickbooks-pricing). Plus and Advanced GBP prices were not verified.
- **Dext (Prepare).** No GBP prices are published. Business plans reportedly cost about £24 a month on annual billing (5 users, 250 documents) or about £30 monthly. Practice pricing reportedly runs £391 a month for 50 clients (June 2026) — [search summary of bookkeepertools.uk/receiptflow [3rd-party]](https://bookkeepertools.uk/dext-pricing-uk-2026/).
- **ApprovalMax for Xero:** Standard, Advanced and Premium plans, billed yearly, with prices on request. Unlimited users. Bill-to-PO matching and budget controls start at Advanced. OCR "Capture" and "Pay" add-ons are priced by volume. Free trial — [ApprovalMax for Xero [Vendor]](https://www.approvalmax.com/pricing/approvalmax-for-xero).

**AI quoting / estimating apps**
- **Qted** (Scotland; Spykra Technologies UK Ltd). Solo £29 a month (50 bookings, AI voice quotes). Pro £59 a month (unlimited, 10 video quotes a month, "AI upsell generator", "Beat This Quote"). Agency on quote. 3 months free, card required — [Qted [Vendor]](https://qted.co.uk/).
- **VoxTrade** (UK). Free tier: 5 quotes/invoices and 10 minutes of voice a month. Pro £14.99 a month or £149.99 a year (120 voice minutes, 15 video analyses). It also offers receipt scanning, per-job profitability and materials extracted from voice — [VoxTrade [Vendor]](https://voxtrade.app/).
- **QuickPrice** (UK). Voice or photo to a priced quote using "real UK labour rates", "Quote DNA" that learns from past quotes, and quote-to-invoice. The free plan allows 3 AI quotes per 30 days. The Pro price was not shown — [QuickPrice [Vendor]](https://getquickprice.com/gb).
- **Other UK voice-quote apps found:** SayInvoice (voice to quote/invoice PDF in about 60 seconds), Tradevoice (AI receptionist plus voice quotes) and Trevio. Prices were not retrieved — [search results](https://www.sayinvoice.app/), [Tradevoice](https://tradevoice.uk/), [Trevio](https://trevio.tech/).
- **Handoff** (US only). Flex $149 a month (7-day trial, no commitment), Pro $299 and Scale $899 a month, with 20% off annual 12-month terms. Covers AI estimates from voice, proposals, invoicing, milestone payments and budget tracking — [Handoff pricing [Vendor]](https://www.handoff.ai/pricing).
- **QuoteIQ** (US): AI Estimator from photos on every plan, from $29.99 a month — [QuoteIQ [Vendor blog]](https://myquoteiq.com/best-ai-estimating-software-concrete-contractors-2026/). **BuildFolio:** AI photo-to-quote — [BuildFolio [Vendor]](https://build-folio.com/features/ai-quote/).
- **Buildbite** (Finland): $10–12 per user per month plus a flat $59 a month base fee, all features on every tier, 14-day trial, free for clients and subcontractors — [Buildbite [Vendor blog]](https://buildbite.com/insights/ai-construction-tools).
- **Prolo** (London): AI-powered procurement for SME builders. It searches 185+ suppliers for trade rates, takes requests via WhatsApp, email or phone, and offers 90-day credit. It raised a €4.9M (£4.2M) seed round in July 2026, led by Triple Point Ventures. Its revenue model is not disclosed — [EU-Startups, 14 Jul 2026](https://www.eu-startups.com/2026/07/london-based-prolo-secures-e4-9-million-to-bring-ai-powered-procurement-to-sme-construction-firms/).

### Inferences
- Among heavier platforms, published pricing is disappearing. Buildertrend went quote-only in 2026, and Procore, Simpro, Commusoft, BigChange, Causeway and COINS are all quote-only. That leaves a "published, flat, UK-native" gap. Construction AI, Site Samurai, BuildersAI and Planyard are filling it at £99–£995 a month.
- Pricing tied to construction volume (Procore; Buildertrend since 2026; Buildertrend's APV for CoConstruct migrants) is a close analogue of value-based pricing. A success fee tied to recovered money is a different axis again, and I found no incumbent using it.
- AI voice-quote apps have commoditised the front end of JobGuard's loop at £0–£59 a month. JobGuard's free quoting stage will be compared with these free or cheap tiers, not with Simpro.

### Gaps
- No verified vendor-published GBP prices for Simpro, Commusoft, BigChange, Causeway, COINS, Dashpivot, Dext or ApprovalMax: the pages returned 403/404 or were quote-only.
- QuickBooks UK Plus and Advanced GBP prices did not load (the page loads prices dynamically).
- Datamolino: no pricing was found in this session.
- "Estimator AI" and "Quotehub AI": no reliable sources were found for products with those names.
- WorkflowMax's £5.50–£17 per user may be promotional. The page did not say.
- I could not confirm whether Procore implementation is actually included for small contractors or charged separately, because sources conflict.

## 2. Overlap with JobGuard: variations, job costing, supplier invoice matching, final accounts, payment applications, evidence and AI

### Takeaway
Variations and change orders, job costing and photo evidence are widespread, but usually sit behind mid or upper tiers. Supplier bill-to-PO matching exists in ApprovalMax, Planyard and Tradify Plus. It checks bills against your own POs, not against quotes or market rates. Construction Act payment and pay-less notices appear only in UK-specific tools (Site Samurai, Construction AI, Payapps). No tool found combines voice capture, a free quote and a final account with a post-bill independent missed-extras check.

### Cited Findings
- **Buildertrend:** change orders, purchase orders, bid requests and takeoff are in Advanced; the Selections portal and warranty are in Complete. Essential has only schedules, daily logs, client communication and time tracking — [search summary [3rd-party]](https://costbench.com/software/construction-management/buildertrend/).
- **Planyard:** "Manage purchase invoices automatically" (Essential), PO approval workflows and PO/work-order variations (Professional), subcontractor change orders (Ultimate), OCR invoice digitisation on all tiers, and budget versus actual and profitability forecasting — [Planyard [Vendor]](https://www.planyard.com/pricing).
- **Tradify:** progress invoicing, job photos and cost/bill tracking in Pro; AI bill capture (SmartRead) and purchase orders in Plus — [Tradify [Vendor]](https://www.tradifyhq.com/en-gb/pricing).
- **ApprovalMax:** bill and PO approvals on all plans; "Bill-to-PO matching" and budget controls from Advanced — [ApprovalMax [Vendor]](https://www.approvalmax.com/pricing/approvalmax-for-xero).
- **WorkflowMax:** purchase orders, supplier invoicing and "quote variations" (Pro) — [WorkflowMax [Vendor]](https://www.workflowmax.com/pricing).
- **Xero:** job costing ("Projects") only on the £70 Ultimate plan — [Xero UK [Vendor]](https://www.xero.com/uk/pricing-plans/). **QuickBooks:** project profitability only on Plus and Advanced — [QuickBooks UK [Vendor]](https://quickbooks.intuit.com/uk/pricing/).
- **Site Samurai:** NEC/JCT applications for payment, Construction Act payment, pay-less and payee notices, and retention and variation valuation tracking. It also compares Procore ("Construction Act automation not core"), COINS, Causeway and ConQuest — [Site Samurai [Vendor comparison]](https://www.sitesamurai.co.uk/compare/best-applications-for-payment-software-uk).
- **Construction AI:** payment applications with payment notices, CIS/VAT, CVR and cascading variations — [Construction AI blog [Vendor]](https://www.constructionai.io/blog/best-procore-alternatives-uk).
- **Payapps UK:** variations, retentions, Construction Act reminders and an audit trail — [Payapps UK [Vendor]](https://www.payapps.com/uk/).
- **Buildbite:** GPS-verified time, auto-tagged photos with timestamps and locations, change-order capture with approvals, and invoices with proof of work attached — [Buildbite [Vendor blog]](https://buildbite.com/insights/ai-construction-tools).
- **VoxTrade:** voice quotes, per-job profitability, receipt scanning and materials lists from voice — [VoxTrade [Vendor]](https://voxtrade.app/). **Qted:** voice, video and photo quotes, Stripe deposits and an "AI upsell generator" — [Qted [Vendor]](https://qted.co.uk/). **QuickPrice:** voice/photo quote, invoice and auto-chase of payments (Pro) — [QuickPrice [Vendor]](https://getquickprice.com/gb).
- **Handoff:** voice-to-estimate, site walkthrough documentation, daily logs, milestone payment schedules and budget tracking. Change orders were not listed on the page I read — [Handoff [Vendor]](https://www.handoff.ai/pricing).
- **Eque2 EVision:** subcontract management, plant and CVR for firms with turnover above £25m — [search summary [3rd-party]](https://softwarefinder.com/construction/evision-construction-accounting).
- **Kreo:** AI takeoff and measurement from drawings, a pre-contract tool with no live-job or final-account features — [Kreo [Vendor]](https://www.kreo.net/pricing).

### Inferences
- A small builder would need to stack several products to match JobGuard's scope. For example: a voice-quote app (£15–59) plus Tradify Plus (£44 per user) or Xero Ultimate (£70), plus Dext (about £24–30), plus ApprovalMax (quote-only), plus Site Samurai (£99+). The stack's total cost is a natural anchor for JobGuard's subscription.
- Incumbent "matching" checks bills against the builder's own purchase orders (two- or three-way matching). JobGuard's supplier overcharge check against quoted or expected prices is a different claim and should be positioned as such.
- Variation tools record changes the builder enters. None found sets independent evidence (photos, diary, supplier documents) against the final bill to reveal work that was never logged.

### Gaps
- I could not read Simpro's UK pages (403), so its variations and progress-claims modules are unverified here.
- Commusoft and BigChange feature detail on variations and supplier-invoice matching was not found.
- Handoff's change-order capability is unclear from its pricing page.

## 3. Target customer size: realistic for a 1–20 person UK builder vs priced out

### Takeaway
For 1–20 person UK builders, the realistic options are AI quote apps, Tradify, WorkflowMax, Xero/QuickBooks with Dext, Planyard at 1–3 project managers, and the flat-fee UK suites (Site Samurai, BuildersAI, Construction AI Solo/Starter). These cost roughly £150–£6,000 a year.
- Simpro, Commusoft and BigChange are borderline. They are per-user, the vendors quote prices only on request, onboarding fees are reported, and Commusoft has a 4-licence minimum.
- Procore, Causeway, COINS, Eque2 and post-2026 Buildertrend are effectively out of reach or poorly fitted to UK practice.

### Cited Findings
- Suggested UK software budgets by firm size: 1–3 people £150–£500 a year; 5–20 people £3.6k–£15k a year; SME per-user budget £30–£50 per month. Hidden costs are said to add 30–80% — [BuildersAI, Feb 2026 [Competitor blog, estimates]](https://buildersai.co.uk/blog/construction-software-pricing-uk).
- Simpro's target is "mid-market commercial contractors (10–500 technicians)" — [Field Service Guide [3rd-party]](https://fieldserviceguide.com/simpro-pricing/).
- Commusoft requires at least 4 licences — [search summary [3rd-party]](https://www.capterra.com/p/149651/Commusoft/). At about $100 per user per month, 10 users cost about $12k a year — [PricingNow [3rd-party]](https://pricingnow.com/question/commusoft-pricing/).
- Eque2 EVision is for turnover above £25m — [search summary [3rd-party]](https://softwarefinder.com/construction/evision-construction-accounting).
- Causeway is "positioned for mid-to-large practices rather than small contractors" — [search summary [3rd-party]](https://www.softwareadvice.co.uk/software/215023/causeway-estimating).
- COINS suits "finance-led contractors with established ERP infrastructure" — [Site Samurai [Competitor blog]](https://www.sitesamurai.co.uk/compare/best-applications-for-payment-software-uk).
- Procore: a small-contractor entry point of about $4,500 a year is reported, but typical spend is $15–30k a year for firms with $10–50M volume — [search summary [3rd-party]](https://www.scanmanifold.com/blog-posts/procore-pricing-2026-contractors). Procore was "built for US construction with no native CIS support" — [search summary of UK comparison [Competitor blog]](https://www.constructionai.io/blog/best-procore-alternatives-uk).
- Buildertrend's lowest volume bracket is "$0–499K", so it does quote very small builders, but prices are hidden — [Projul [Competitor blog]](https://projul.com/blog/buildertrend-pricing-analysis-2026/). Its last published entry tier was $339 a month (annual) or $499 month-to-month, and that tier lacked change orders — [3rd-party](https://costbench.com/software/construction-management/buildertrend/).
- Planyard's case studies are contractors in "£2M–£30M" range — [Planyard [Vendor]](https://www.planyard.com/pricing).
- Construction AI targets "the 98% of UK construction firms that have been priced out of enterprise software" — [Nomic newsletter](https://www.nomic.ai/newsletter/ai-in-the-built-world/march-2026).
- Qted is aimed at "UK sole traders" — [Qted [Vendor]](https://qted.co.uk/). VoxTrade's Pro plan costs £14.99 a month — [VoxTrade [Vendor]](https://voxtrade.app/).

### Inferences
- A 5-person builder would pay about £2.2k a year for Tradify Plus. Commusoft's minimum 4 licences come to roughly £4–5k a year at the reported ~$100 per user, before onboarding. Construction AI Starter is £4.2k a year and Site Samurai Professional £2.4k a year. A JobGuard subscription for 1–20 person firms that sits under about £100–£200 a month would be comparable with these.
- The £3.6k–£15k a year budget quoted for 5–20 person firms is a vendor estimate, not survey data. Treat it as indicative only.

### Gaps
- No independent survey data (for example from FMB, CITB or ONS) on what UK builders with 1–20 staff actually spend on software was found in this session.

## 4. Products that automatically detect unbilled work, missed variations or supplier overcharges, and how they charge

### Takeaway
No product found runs a post-bill check that reveals missed extras to a small builder, and none charges a success fee on money recovered. The closest products fall into three groups:
- **Capture at source**, sold per user: Buildbite reports about a 30% lift in change-order revenue.
- **Enterprise drawing and scope-gap intelligence**, sold on quote: Trunk Tools Cortex.
- **Invoice auditing:** FairRate charges per audit and is aimed at consumers. Enterprise AP overbilling tools exist but do not target builders.

### Cited Findings
- **Buildbite** reports "roughly a 30% lift in change-order revenue… not because more changes happen, but because the ones that used to go unbilled now get captured". It charges per user ($10–12 per user per month plus $59 a month base), not a share of revenue recovered — [Buildbite [Vendor blog; self-reported claim]](https://buildbite.com/insights/ai-construction-tools).
- **Trunk Tools Cortex** (launched June 2026) interprets drawings, "including detecting changes that fall outside revision clouds, a routine source of missed scope". Pricing is quote-only, on enterprise contracts — [search summary of Buildbite article [3rd-party]](https://buildbite.com/insights/ai-construction-tools).
- **FairRate.ai** audits invoices and quotes line by line against "local market rates". It charges per audit (first audit £0.99, bundles available, credits never expire), claims "15,000+ users" and an average saving of £74, and covers the UK. Its focus is consumers (people checking bills from trades), the reverse of JobGuard's direction — [FairRate [Vendor; self-reported claims]](https://www.fairrate.ai/).
- **Generic AP tools** for invoice overcharge detection in construction or facilities: examples include Phacet, TRO Matcher, Insight-Pro, LiveCosts and Protovo, with vendor claims of 15–30% savings on material costs. These are vendor marketing claims, not independently checked — [search results: TRO Matcher](https://tro-matcher.com/blog/construction-material-cost-savings), [Phacet](https://www.phacetlabs.com/ai-agents/control-supplier-billing-and-reduce-overpayments). Buildtools also markets AI invoice processing for construction — [Buildtools](https://www.buildtools.com/features/ai-invoice-processing-construction).
- **Bill-to-PO matching** (ApprovalMax Advanced+, Planyard Professional+) flags bills that do not match POs. It is priced per subscription tier — [ApprovalMax [Vendor]](https://www.approvalmax.com/pricing/approvalmax-for-xero); [Planyard [Vendor]](https://www.planyard.com/pricing).
- **Qted's "AI upsell generator"** suggests extra items at quote stage, a form of revenue uplift before the job starts. It is included in the £59 a month Pro plan — [Qted [Vendor]](https://qted.co.uk/).
- **Prolo** targets material cost (better trade rates) rather than checking invoices after the fact. Its revenue model is undisclosed — [EU-Startups](https://www.eu-startups.com/2026/07/london-based-prolo-secures-e4-9-million-to-bring-ai-powered-procurement-to-sme-construction-firms/).
- **Claims-management AI** can scan contract documents for variation triggers and clause entitlements. It is aimed at larger contractors, and no small-builder pricing was found — [Arched.ai claims software list](https://arched.ai/resources/construction-claims-management-software).
- BigChange markets an ROI claim ("save £5 for every £1 spent") but charges per user, not on outcomes — [BigChange [Vendor]](https://www.bigchange.com/pricing).

### Inferences
- A success fee on recovered, collected money appears to be unused among construction software vendors. Competitors are either per user (Buildbite, Tradify), flat (Site Samurai, Construction AI), based on construction volume (Procore, Buildertrend) or per audit (FairRate). That makes the fee both a differentiator and something buyers will not recognise. Builders will benchmark it against recovery agencies and claims consultants rather than software.
- Buildbite's reported 30% lift in change-order revenue is the nearest public data point on value for "unbilled work captured". It is self-reported and relates to capture at source, not a post-bill check.

### Gaps
- No product was found that, like JobGuard, withholds its own findings until the final account is locked and then reveals missed extras.
- No construction software found charges a percentage of recovered or withheld payments. Pricing of UK construction debt-recovery and adjudication services was outside this scope and was not researched here.
- Trunk Tools pricing and UK availability were not verified.
- Independent evidence for vendor claims (Buildbite 30%, FairRate £74 average, TRO Matcher 15–30%) was not found.
