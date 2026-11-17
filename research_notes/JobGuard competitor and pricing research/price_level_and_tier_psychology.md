# Price level and tier psychology for a builder "profit watchdog" subscription

Scope: behavioural-economics and practitioner evidence on price level, price endings, tier design, value metrics, trial models, annual discounts and price framing, applied to selling a subscription to small UK tradespeople and builders. Research pass dated 2026-09-24. Evidence labels used throughout: **[LAB]** = laboratory or hypothetical-choice experiment; **[FIELD]** = real purchases or randomised field experiment; **[SURVEY/BENCH]** = practitioner benchmark from self-reported or vendor data; **B2C / B2B** = consumer or business buyers.

Source-quality warning for the report writer: many web results for SaaS pricing statistics are content-marketing pages (for example getmonetizely.com, "artisangrowthstrategies", "growthspree") that repeat figures without a traceable primary source. These are flagged below as **weak** and should not carry a recommendation on their own. Also note that OpenView Partners wound down in 2023–24, so any "OpenView 2025 benchmark" cited by aggregators is suspect; the traceable successor data are the Kyle Poyar / ChartMogul / ProductLed reports.

---

## 1. Price–quality inference: does a higher price signal higher quality, and when does it backfire?

### Takeaway
A higher price does raise perceived quality, but the average effect is small (r ≈ 0.12 in the 1989 meta-analysis), it has weakened over time, and it is weaker for services, durables and buyers who are familiar with the product category. It is most useful when quality is hard to judge before purchase, as with a new brand and an unfamiliar "watchdog" concept. It is least reliable where buyers are price-sensitive and can compare against known tools. For builders, the ROI story ("it catches £X you'd miss") is likely to count for more than any price-as-signal effect.

### Cited Findings
- **Rao & Monroe (1989), Journal of Marketing Research 26:351–357** [meta-analysis of mostly LAB studies, B2C]: 54 price–perceived-quality relationships, mean effect size 0.12, statistically significant. Brand name also had a positive, significant effect on perceived quality, but store name did not. The experimental design and the strength of the price manipulation significantly changed the size of the observed effect, which means the effect depends partly on how it is studied. — [Rao & Monroe 1989, SAGE](https://journals.sagepub.com/doi/abs/10.1177/002224378902600309); [PDF, Carlson School](https://carlsonschool.umn.edu/sites/carlsonschool.umn.edu/files/2024-06/Rao%20and%20Monroe%201989.pdf)
- **Völckner & Hofmann (2007), Marketing Letters 18(3):181–196** [meta-analysis of studies published 1989–2006]: the price effect on perceived quality **has decreased** over time. It is stronger in within-subjects designs, for higher-priced products and in European samples. It is **weaker for services, durable goods, and respondents familiar with the product**. The number of other cues present had no significant effect. — [Völckner & Hofmann 2007, SDU portal](https://portal.findresearcher.sdu.dk/en/publications/the-price-perceived-quality-relationship-a-meta-analytic-review-a/); [ResearchGate](https://www.researchgate.net/publication/5153015_The_Price-perceived_Quality_Relationship_A_Meta-analytic_Review_and_Assessment_of_Its_Determinants)
- **Shiv, Carmon & Ariely (2005), JMR 42(4):383–393** "Placebo effects of marketing actions" [LAB, B2C]: people who paid a discounted price for an energy drink said to improve mental acuity solved **fewer puzzles** than people who paid full price for the same drink. The authors attribute this to non-conscious expectancies, not to any real difference between the products. — [Shiv, Carmon & Ariely 2005, SAGE](https://journals.sagepub.com/doi/10.1509/jmkr.2005.42.4.383); [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=707541); rejoinder refining the moderators: [Ruminating about placebo effects, 2005](https://journals.sagepub.com/doi/10.1509/jmkr.2005.42.4.410)
- **Plassmann, O'Doherty, Shiv & Rangel (2008), PNAS 105(3):1050–1054** [LAB, fMRI, B2C]: participants tasted the same wine at different stated prices. A higher stated price raised both reported pleasantness and activity in the medial orbitofrontal cortex. — [PNAS](https://www.pnas.org/doi/10.1073/pnas.0706929105); [PMC full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC2242704/)

### Inferences
- **Where the conditions favour a price signal.** The effect is strongest when buyers cannot easily judge quality in advance. At launch, JobGuard fits that: it is a new brand in a new category ("profit watchdog"), its benefit is hard to verify before use, and its value is an avoided loss that may never become visible. Under those conditions a very low price such as £9–£15 risks reading as a "toy" or a spreadsheet add-on. That is an inference from the conditions above; no study tests it for trades software.
- **Where the conditions work against it.** Völckner & Hofmann found the effect is weaker for **services** and for **familiar** buyers. Many builders already pay for job-management or quoting tools and have a mental reference price for "an app". So the price-as-quality signal is probably weaker than in the classic lab studies, and the relevant anchor is likely competitor prices, not quality inference.
- **Placebo pricing applies to experienced goods such as drinks and wine.** It is not clear it carries over to a tool judged by outcomes, such as pounds recovered on a final account. Once a builder sees results, actual performance should dominate. Price-signalling may therefore matter mainly at first purchase, and less for retention.
- **When a high price is likely to backfire with small businesses:** (a) the benefit is uncertain and the price is paid every month whether or not a recovery happens; (b) the buyer can compare against known tools; (c) cash flow is tight. Sole traders feel £50+/month as a personal cost. The separate 10% success fee under `reference_fee_policy_v3` already ties part of JobGuard's revenue to outcomes. That lowers the need for a high subscription to signal quality, and raises the risk that a high subscription plus a fee feels like "paying twice".
- **What all the evidence has in common.** It is B2C, mostly lab-based, with individual consumers. **I found no peer-reviewed study of price–quality inference for SMB or B2B software buyers.**

### Gaps
- No peer-reviewed evidence found on price–quality inference for B2B, SMB or trades software specifically.
- Replication status of Shiv et al. (2005): I found no direct large-scale replication in this pass. Dan Ariely's credibility was questioned after a data-fabrication finding in an unrelated 2012 honesty paper. That affects how much weight Ariely-authored single studies should get, but I did not verify details or sources in this pass.
- Plassmann et al. used a small fMRI sample. I did not confirm the exact n in this pass.

---

## 2. Anchoring, decoy/compromise effects and good–better–best tier design

### Takeaway
The compromise effect (a middle option gains share) is the more dependable basis for a three-tier good–better–best structure. The "decoy" (asymmetric-dominance) effect, including Ariely's widely quoted Economist example, is contested: in published JMR studies it often disappears with realistic, non-numeric product descriptions. Use three tiers so that the tier you most want to sell is the middle one. Do not rely on a dummy decoy tier to do the work.

### Cited Findings
- **Simonson (1989), Journal of Consumer Research** [LAB, B2C]: introduced the **compromise effect**. An option gains share when it becomes the middle option in a set, because the middle is the easiest choice to justify. A literature review reports that across good–better–best sets, from TVs to mouthwash, middle products averaged **~17.5% larger share** than the rest of the portfolio. — [Manja, Compromise Effect literature review, Univ. Mannheim](https://www.bwl.uni-mannheim.de/media/Lehrstuehle/bwl/Stahl/bachelorstheses/BA_Steven_Manja.pdf); background: [Itamar Simonson, Wikipedia](https://en.wikipedia.org/wiki/Itamar_Simonson). Note that the 17.5% figure comes from a secondary review, not from the original paper.
- **Huber, Payne & Puto (1982), JCR** introduced the **attraction or asymmetric-dominance (decoy) effect**. — [Decoy effect, Wikipedia overview](https://en.wikipedia.org/wiki/Decoy_effect)
- **Ariely's Economist example** (reported in *Predictably Irrational*, 2008) [LAB, hypothetical, MIT students, B2C]. The options were web-only at $59, print-only at $125 and print+web at $125. With all three: 16% chose web, 0% print-only, 84% print+web. With the print-only decoy removed: 68% web, 32% print+web. The claimed revenue gain was about 30%. — [Decoy effect, Wikipedia](https://en.wikipedia.org/wiki/Decoy_effect); [Sketchplanations summary](https://sketchplanations.com/the-decoy-price). This was a classroom demonstration, not a peer-reviewed field study.
- **Frederick, Lee & Baskin (2014), JMR 51:487–507, "The Limits of Attraction"** [LAB, multiple studies]: the attraction effect largely **disappeared with realistic stimuli**, such as qualitative descriptions, images, or more than two numeric attributes, and sometimes reversed. — [SAGE](https://journals.sagepub.com/doi/abs/10.1509/jmr.12.0061)
- **Yang & Lynn (2014), JMR 51(4):508–513**: found no significant attraction effect overall. Only 11 of 91 participants shifted significantly toward the target. — [SAGE](https://journals.sagepub.com/doi/10.1509/jmr.14.0020)
- **Huber, Payne & Puto (2014), "Let's be honest about the attraction effect"**, the original authors' reply: they concede that the effect needs specific conditions, such as a clear dominance relationship and easily compared attributes, but argue it holds when those conditions are met. — [SAGE](https://journals.sagepub.com/doi/10.1509/jmr.14.0208)
- **Simon-Kucher** practitioner guidance: good–better–best portfolios and a high-priced top option make the other options look cheaper. — [Simon-Kucher, A Practical Guide to Pricing (2019 e-book)](https://www.simon-kucher.com/sites/default/files/Files/2019/SimonKucher_Ebook_A_Practical_Guide_to_Pricing.pdf)

### Inferences
- **Three tiers.** For JobGuard, a three-tier ladder should place the intended "hero" plan in the middle. For example: Solo (1 user, limited active jobs), Pro (the hero plan, sized for a typical 1–5 person builder), and Firm or Contractor (multi-user, more jobs). The top tier anchors the middle, as the compromise effect suggests.
- **The top tier should be a real offer.** A purely dominated decoy is the contested mechanism. The top tier should be something some customers actually buy, such as more users, office/admin seats or priority support. That way it works as an anchor and a real option even if the decoy effect fails.
- **Pricing pages favour the decoy effect, but only if the comparison is simple.** A pricing page does present options side by side, which is closer to the lab conditions. But Frederick et al. suggest the effect fades when features are described qualitatively, as on most SaaS feature grids. A clean, number-led comparison (users, active jobs) is more likely to create the effect than a long feature grid.
- **The success fee complicates the ladder.** Keep the 10% success fee identical across tiers so it does not muddy tier comparisons. This matches the v3 policy of no subscription offset.

### Gaps
- I found no field experiment of the compromise or decoy effect on B2B or SMB SaaS pricing pages with published data.
- I found no data on which tier trades or field-service software customers actually choose, for example the share of revenue by tier at Tradify, Fergus or ServiceM8.

---

## 3. Charm pricing (£29 vs £30 vs £35) and round prices

### Takeaway
Nine-endings reliably make a price feel lower when they change the left digit (£29.99 vs £30; £29 vs £30), and a catalogue field experiment found a $39 item outsold the same item at both $34 and $44. Round prices, however, push buyers toward feelings-based evaluation, and non-round or precise prices push toward reasoned evaluation. For a utilitarian business tool bought on ROI, £29 is defensible and a round premium figure (£30, £50) has no clear advantage. The left-digit gain from £29 over £30 is real but small next to the choice of price level itself.

### Cited Findings
- **Thomas & Morwitz (2005), JCR 32(1):54–64, "Penny Wise and Pound Foolish"** [LAB, 5 experiments, B2C]: nine-ending prices are judged lower than a price one cent higher **only when the leftmost digit changes** (e.g. $2.99 vs $3.00). The effect is stronger when the compared prices are close together. — [OUP JCR](https://academic.oup.com/jcr/article-abstract/32/1/54/1796360); [ScienceDaily summary 2005](https://www.sciencedaily.com/releases/2005/06/050607030351.htm)
- **Sokolova, Seenivasan & Thomas (2020), JMR, "The Left-Digit Bias: When and Why Are Consumers Penny Wise and Pound Foolish?"**: a follow-up on the conditions that moderate the bias. — [SAGE](https://journals.sagepub.com/doi/10.1177/0022243720932532)
- **A 2025 replication with extension in Marketing Letters** reports that the left-digit effect extends to spending intentions ("left-digit defending effect"). — [Marketing Letters 2025](https://link.springer.com/article/10.1007/s11002-025-09808-z)
- **Anderson & Simester (2003), Quantitative Marketing and Economics 1(1):93–110** [FIELD, 3 experiments, women's apparel catalogues, B2C]: $9 endings increased demand, more so for **new** items than established ones, and less so when "Sale" cues were present. In one test the same dress sold 16 units at $34, **21 at $39** and 17 at $44. — [Springer](https://link.springer.com/article/10.1023/A:1023581927405); [Kellogg PDF](https://www.kellogg.northwestern.edu/faculty/anderson_e/htm/personalpage_files/Papers/Effects_of_9_Price_Endings_on_Retail_Sales.pdf)
- **Wadhwa & Zhang (2015), JCR 41(5):1172–1185, "This Number Just Feels Right"** [LAB, 5 studies, B2C]: rounded prices ($100.00) raise purchase likelihood for **feelings-driven** purchases, and non-rounded prices ($98.76) raise it for **rational, utilitarian** purchases. The proposed mechanism is processing fluency. — [OUP JCR](https://academic.oup.com/jcr/article-abstract/41/5/1172/2962090); [EurekAlert 2015](https://www.eurekalert.org/news-releases/620662); [PDF](https://www.smallprojectsbureau.com/wp-content/uploads/2020/01/wadhwa-zhang-2015.pdf)

### Inferences
- **£29 vs £30.** The left digit changes, so £29 should be perceived as meaningfully cheaper than £30 (Thomas & Morwitz). That makes £29 the better choice of the two. **£35 vs £29** is a real price change, not an ending effect. Anderson & Simester's demand fell less between $39 and $44 than between $39 and $34, which hints that a "9" price can sit at a local demand peak. But that was one apparel item with small counts, so it is not generalisable.
- **Round prices and premium signalling.** Wadhwa & Zhang support round prices for emotional or hedonic purchases, not for utilitarian tools. A builder's profit-protection tool is a utilitarian purchase, so the evidence does **not** support "£50 round signals professional". If anything it mildly favours a precise-looking or 9-ending price for a reasoned purchase. Whether B2B software buyers read a 9-ending as "cheap" is untested.
- **9-endings as a low-price signal.** Anderson & Simester found 9-endings work better on new items, which fits a new product. They may also signal "discount", which could cut against a premium position. If the founder chooses a higher level, £49 keeps the left-digit benefit relative to £50.

### Gaps
- No evidence found on price endings in B2B or SMB subscription software, or with UK trades buyers.
- No evidence found on whether VAT-exclusive display ("£29 + VAT"), which is standard for UK B2B, blunts the left-digit effect. Most builders are VAT-registered, but sole traders below the threshold see the gross price.

---

## 4. Per-user vs flat vs usage/value-metric pricing, and the right value metric for a trades app

### Takeaway
Practitioner consensus (Price Intelligently/ProfitWell, Simon-Kucher, Ramanujam) favours a **value metric** that grows with the value the customer gets. However, most of the widely repeated statistics ("value-based pricing = 30% lower churn", "1% price = 11% profit") trace back to vendor blogs or older consultancy work, not to controlled studies. For JobGuard, the success fee already acts as the value metric. The subscription should therefore scale on a simple capacity proxy, such as active jobs or users, not on revenue.

### Cited Findings
- Price Intelligently is reported to have found SaaS demand elasticities typically between −1.5 and −2.5. **Weak**: this comes via an aggregator, and I did not find the primary study. — [getmonetizely.com](https://www.getmonetizely.com/articles/the-price-churn-relationship-finding-the-sweet-spot)
- "Value-based pricing companies have 30% lower churn" and "customers acquired via aggressive promotions churn 30% faster" are both attributed to Price Intelligently/ProfitWell. **Weak**: aggregator content with no primary data or method shown. — [getmonetizely.com](https://www.getmonetizely.com/articles/pricing-for-customer-churn-reduction-retention-through-value)
- The claim that a 1% pricing improvement gives about 11% profit is repeated by aggregators as a "Price Intelligently" finding. It more likely originates in McKinsey work (Marn & Rosiello, HBR 1992), which I did not verify in this pass. It applies to large-company cost structures. — [getmonetizely.com (secondary)](https://www.getmonetizely.com/articles/how-to-use-pricing-as-a-strategic-tool-to-de-risk-customer-churn)
- Kyle Poyar & Blake Bartlett (OpenView), "Mastering SaaS pricing" deck: practitioner framework for value metrics and per-seat vs usage pricing. — [SlideShare](https://www.slideshare.net/slideshow/mastering-saas-pricing/88844088)

### Inferences
- **Candidate value metrics for trades software:**
  - **Users/seats** fit poorly. Most small builders have 1–3 office users, and per-seat pricing discourages adding the site lead or other operatives who would feed JobGuard evidence. That directly weakens the product, which depends on on-site capture.
  - **Active (live) jobs** track workload and value well, are easy to understand, and scale from sole traders to firms. The risk is that builders avoid switching small jobs live. Mitigate this by counting only jobs live in a month, or by giving generous job allowances per tier.
  - **Revenue under management or contract value** tracks value best but feels intrusive. It also pushes the subscription toward a percentage-of-revenue fee, and v3 already has a 10% success fee.
- **Recommendation.** Flat tier prices differentiated by active-job allowance, plus users included generously, keep the subscription predictable. The success fee then does the value-capture work. This is consistent with the BUILD_PLAN v3 policy that the subscription is tenant-level (D09) and never per job.
- **Unverified background, not fetched in this pass.** Ramanujam & Tacke, *Monetizing Innovation* (2016), argues for holding willingness-to-pay conversations before building and designing tiers around segments ("leader/filler/killer" features). The founder could use that method with 10–20 builders before fixing the number.

### Gaps
- I found no rigorous, primary-sourced study comparing per-user, flat and usage pricing on SMB adoption. The ProfitWell data behind widely repeated claims is not publicly traceable.
- UK trades competitors' value metrics (e.g. per-user at Tradify/Fergus, per-job-volume at ServiceM8) are outside this note's scope; the competitor research should supply them.

---

## 5. Free trial vs freemium vs reverse trial vs money-back guarantee; trial length

### Takeaway
Across recent benchmarks, card-required trials convert 25–60% of trial starts but attract far fewer sign-ups. No-card trials convert about 4–25% depending on the source and year, and freemium about 3–8%. Per website visitor, a card-required trial produced about 2x the paying customers of freemium in ChartMogul's 2026 data. On length, randomised field evidence is mixed: one large experiment found 7 days beat 14 and 30 days, and another found 7 days beat 3 days. The 14-day default is reasonable. The product's "aha" moment should decide the length, and for JobGuard that moment arrives only when a job is live, which argues for a longer or usage-triggered trial.

### Cited Findings
- **Lenny's Newsletter + OpenView + Pendo (Aug 2023)** [SURVEY/BENCH, 1,000+ mostly B2B products, 6-month window]:

  | Model | Good | Great |
  |---|---|---|
  | Freemium self-serve | 3–5% | 6–8% |
  | Freemium sales-assisted | 5–7% | 10–15% |
  | Free trial | 8–12% | 15–25% |

  Visitor-to-sign-up was 5% for trials vs 9% for freemium. — [Lenny's Newsletter 2023](https://www.lennysnewsletter.com/p/what-is-a-good-free-to-paid-conversion); [OpenView 2022 Product Benchmarks](https://openviewpartners.com/2022-product-benchmarks/)
- **ChartMogul SaaS Conversion Report (Jan 2026; Kyle Poyar + ChartMogul + ProductLed)** [SURVEY/BENCH, 200 B2B products, typical $1–10M ARR, $50–249 ARPA]:

  | Model | Good | Great |
  |---|---|---|
  | Freemium | 3–5% | 8–12% |
  | Free trial, no card | 4–6% | 10–15% |
  | Free trial, card required | 25–35% | 50–60% |
  | Reverse trial | 4–6% | 8–12% |

  The median across all products was 8%, with about 10x variance between the top and bottom quintiles. The article says card-required trials see about 30% conversion, more than 5x no-card trials.

  Paying customers per 1,000 visitors: freemium 5, no-card trial 3.6, ungated freemium 5.6, **card-required trial 10.5**.

  Primary entry point: free trial 57% (of which 62% use 14 days), freemium 26%, reverse trial 7%, interactive demo 7%, paid trial 4%. — [ChartMogul 2026](https://chartmogul.com/reports/saas-conversion-report/); [Kyle Poyar note](https://substack.com/@kylepoyar/note/c-209940962)
- **Reverse trial.** Users get full paid features for a limited time, then drop to a free tier rather than losing access. Kyle Poyar's guide (Apr 2026) gives **no quantitative uplift data**. Its caveats: a reverse trial helps only if the paid features are compelling on their own, and it suits long-term relationships and user-growth goals. — [Growth Unhinged 2026](https://www.growthunhinged.com/p/your-guide-to-reverse-trials); Airtable cited as an example in [Poyar on X](https://x.com/poyark/status/1537064035052568578?lang=en)
- **Yoganarasimhan, Barzegary & Pani (arXiv 2020, "Design and Evaluation of Personalized Free Trials")** [FIELD, randomised, large SaaS firm; ~337,724 users per a secondary summary]: tested 7-, 14- and 30-day trials. A uniform **7-day trial increased subscriptions by 5.59%**, and personalised assignment added more. The paper also reports that short-run conversion gains carried into long-run loyalty and profitability. — [arXiv 2006.13420](https://arxiv.org/abs/2006.13420); sample size and retention/revenue uplifts (+6.4% retention, +7.9% revenue) per [ScienceSays summary](https://app.sciencesays.com/p/optimal-free-trial-length) (secondary; not verified against the paper)
- **Zhang & Duan (2025), Frontiers in Psychology** [FIELD, randomised, 680,588 users of an image-editing freemium SaaS, B2C-leaning]: a 7-day trial vs a 3-day trial raised trial adoption by about 11%, had no significant effect on immediate conversion, raised delayed conversion by about 42% and raised overall subscription over 2 years by about 21%, with more annual and repeat subscriptions. In absolute terms the effects are small (e.g. +0.079 percentage points). — [PMC 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12217587/)
- Industry claims that 7-day trials convert at a 24% median vs 14-day at 19% and 30-day at 14%, and that "Gartner" found shorter trials outperform by up to 20%. **Weak**: aggregator claims with no traceable primary source. — [search summary via Userpilot/others](https://userpilot.com/blog/free-trial-length-saas/)

### Inferences
- **Why trial length should follow time-to-value.** Together the two randomised studies suggest there is an optimum: too short (3 days) loses people who need time, and too long (30 days) removes urgency. The optimum depends on how quickly the product delivers value. JobGuard's value appears when a real job is live and the watchdog flags something. That can take weeks, so a fixed 14-day clock may expire before the aha moment.
- **Options that fit JobGuard's model:**
  - A **usage-triggered trial**, e.g. "free until your first job goes live + 30 days", or "first job free".
  - A **reverse trial**, in which free quoting stays free permanently (consistent with §5.10: free quoting never bills) and the watchdog/final-account features are trialled on the first live job.

  The product already has a natural freemium layer (free quoting), which makes a reverse trial structurally easy.
- **Card-required trials** yield the most paying customers per visitor in ChartMogul's data, but that is B2B SaaS with $50–249 ARPA and sophisticated buyers. Asking a sceptical builder for a card before they have seen value may cut sign-ups more than the benchmark implies. This should be A/B tested.
- **Money-back guarantee.** I found no quantitative SaaS evidence in this pass. For a trades audience, a simple "cancel any time, first month refunded if JobGuard doesn't find anything" guarantee could reduce perceived risk and fits the outcome-linked story, but this is untested.

### Gaps
- No primary evidence found on money-back guarantees vs free trials in SaaS conversion. Userpilot/ProfitWell guarantee data was not located.
- No trades- or field-service-specific conversion benchmarks found.
- The ChartMogul and Lenny benchmark numbers differ, e.g. no-card trial "good" of 8–12% (2023) vs 4–6% (2026). The differences reflect different samples and definitions, so treat both as ranges.

---

## 6. Annual prepay discounts and churn

### Takeaway
The market norm is roughly a 15–20% discount for annual prepay, equivalent to about "2 months free" (≈16.7%). It is well established that annual contracts churn less, but the widely quoted magnitudes (e.g. "92% vs 68% retention", "cuts churn 40–60%") come from untraceable aggregator pages and are confounded by self-selection: committed customers choose annual plans.

### Cited Findings
- 15–20% is the standard annual discount. Slack's ~17% is cited as a benchmark, with Slack, Zoom and HubSpot all around 15–20%. **Moderate**: aggregator content, though consistent with widely observed public pricing pages. — [Monetizely](https://www.getmonetizely.com/articles/monthly-vs-annual-billing-how-subscription-length-impacts-saas-churn-and-cash-flow); [Baremetrics](https://baremetrics.com/blog/annual-vs-monthly-pricing-better-retention)
- Claims that annual plans retain 92% vs 68% for monthly, that annual subscribers churn at about one-third the monthly rate, and that switching to annual-default cuts churn 40–60%. **Weak**: no primary dataset or method given, and selection bias is not addressed. — [Monetizely](https://www.getmonetizely.com/articles/monthly-vs-annual-billing-how-subscription-length-impacts-saas-churn-and-cash-flow); [Growthspree 2026](https://www.growthspreeofficial.com/blogs/b2b-saas-annual-contract-length-multi-year-discount-benchmarks-2026-impact-on-retention-payback)
- In the Zhang & Duan (2025) randomised trial-length experiment, the longer trial also increased annual subscriptions, which suggests more exposure to value makes people more willing to commit. — [PMC 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12217587/)

### Inferences
- **Offer annual at "2 months free".** For builders, the "2 months free" framing (e.g. £290/yr vs £29/mo) is probably clearer than a percentage. Do not make annual the default before trust exists. Sole traders are cash-flow constrained and wary of lock-in, and the downside of a forced annual default (refund disputes, resentment) could be large in a word-of-mouth trade.
- **Seasonality risk.** Construction work is seasonal and lumpy. A monthly plan with pause, or a winter pause option, may reduce churn more than annual prepay for this segment. This is an untested hypothesis.

### Gaps
- No primary-sourced, selection-corrected evidence found on the causal effect of annual billing on churn.
- No SMB or trades-specific churn benchmarks found in this pass.

---

## 7. Price presentation: monthly vs daily framing and "pennies-a-day"

### Takeaway
Gourville (1998) showed in lab studies that reframing an aggregate cost as a small daily amount increases compliance, because it prompts comparison with small everyday expenses. That can make "less than a coffee a day" effective for a £29/month price. For a business tool, however, the stronger frame is likely ROI: "one missed extra pays for a year".

### Cited Findings
- **Gourville (1998), JCR 24(4):395–408, "Pennies-a-Day: The Effect of Temporal Reframing on Transaction Evaluation"** [LAB, B2C]: reframing an aggregate cost as a series of small ongoing expenses increases compliance. The mechanism is that per-day framing leads people to recall small ongoing expenses (such as a coffee) as the comparison, whereas aggregate framing leads them to recall large, infrequent expenses. The effect held across a range of product categories. — [OUP JCR](https://academic.oup.com/jcr/article-abstract/24/4/395/1797969); [HBS listing](https://www.hbs.edu/faculty/Pages/item.aspx?num=3067)
- Follow-up literature on consumer evaluations of temporal reframing exists. — [ResearchGate: Consumer Evaluations of Temporal Reframing of Prices](https://www.researchgate.net/publication/244478492_Consumer_Evaluations_of_Temporal_Reframing_of_Prices)

### Inferences
- **Daily framing works only if the daily figure is trivial.** Gourville's mechanism depends on the per-day amount recalling trivial expenses. At £29/month (≈£0.95/day) the frame is credible. At £79/month (≈£2.60/day) it still roughly compares with a coffee. At £150+/month it stops sounding trivial. My recollection is that Gourville also reported the effect weakens or reverses when the per-day amount is not trivial, but I did not verify this in this pass.
- **Business buyers judge costs against what they save.** Builders are business buyers who compare costs against job margins, so the most persuasive frame is probably a benefit comparison: "£29/month; one unbilled extra on one job typically covers a year". That uses loss aversion (Kahneman & Tversky) rather than trivialisation. **This must not be overstated.** JobGuard's M1 pilot does not validate recovery detection (AGENTS §6), so any "typically recovers £X" claim needs real evidence before it is used.
- **Consistency with the success-fee message.** The success fee is 10% of recovered money. The pricing page can frame it as "you keep 90% of what we find, and we only earn it when you're paid", which is also an outcome-linked quality signal.

### Gaps
- No evidence found testing daily framing with B2B or SMB software buyers.
- I did not verify whether Gourville's effect reverses at higher daily amounts.

---

## Cross-cutting notes for the report writer (evidence quality)

- **Almost all of the academic evidence is B2C.** Of the sources above, only the Anderson & Simester catalogue tests, the Yoganarasimhan et al. trial experiment and the Zhang & Duan trial experiment are **field** evidence. None is B2B trades software. Everything else is lab or hypothetical choice.
- **Contested findings:**
  - The decoy/attraction effect: Frederick et al. 2014 and Yang & Lynn 2014 challenge it; Huber et al. 2014 defend it.
  - Single-study effects from Ariely-authored work, which faces broader credibility concerns.
  - The declining size of the price–quality effect (Völckner & Hofmann 2007).
- **Practitioner benchmarks** (ChartMogul 2026; Lenny/OpenView/Pendo 2023) are self-reported or vendor-sample surveys skewed to $1–10M ARR B2B SaaS. That buyer is more sophisticated than a UK sole-trader builder.
- **Viral SaaS pricing statistics** such as "30% lower churn", "92% vs 68%", "1% = 11%" and "Gartner 20%" could not be traced to primary data in this pass. Treat them as weak.
- **What the evidence suggests for the £29 question.** A new, hard-to-judge product gains some credibility from a non-trivial price. But the effect is small and weak for services and familiar buyers, so there is little evidence-based reason to go premium purely to signal quality. The stronger levers are:
  - three tiers with the hero plan in the middle (compromise effect);
  - a 9-ending price (£29/£49/£99) for a utilitarian tool;
  - a trial tied to the first live job;
  - ROI-based framing.

  The 10% success fee already captures value from high-performing jobs, which argues for keeping the entry subscription accessible. **This is my synthesis, not a directly tested finding.**
