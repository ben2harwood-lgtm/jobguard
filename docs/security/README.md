# JobGuard security pack for contractor buyers (draft)

DRAFT for founder review. Not to be sent to any buyer until Ben approves it.

`Practice build only: made-up data, a built-in test identity provider, no real customer data, no outside assessor. Nothing here has been assessed or certified by anyone outside the project.`

Evidence cutoff: 96c0cb8a5b5562c65b79f5f601ba9d60f8fcf05a (12 October 2026)

Audit note: the evidence cutoff predates the internal security audit of 12 October 2026 and any remediation of its findings (the audit is an internal document, not yet in this repository). Q-09, Q-10, Q-14, Q-16, Q-18, E-17b, E-21, E-22, E-23, the register's administrator-revocation row and the new not-claimed rows E-71 to E-73 reflect it.

## 1 What this is and who it is for

A practice questionnaire and source map for a contractor’s IT buyer. It is an internal draft for the founder, not an outward statement. The founder decides sharing; the contract set also needs solicitor review. No buyer format is chosen.

## 2 What it covers (product, build, as of which commit)

The contractor track’s practice identity, company-scoped access and audit records at the cutoff above. Companies and accounts are made-up fixtures. It does not describe every product feature or a real-data service. Each source and test line was source-inspected at that commit; cited tests were not run by this builder.

## 3 How to read an answer

**In place (practice build)** needs a merged control, a named merged automated test or continuous integration (CI) step — an automated build check —, a merged introduction commit and a scope limit. A contract alone is insufficient. **Not claimed** means those conditions or the required operational evidence are missing. Mixed answers state both parts. Evidence IDs link questions to the [map](evidence-map.md) and [register](not-claimed-register.md).

A **run record** is an existing main-branch record naming a successful run on a stated reviewed head, before merge. “None recorded on main” gives coverage only, never “tests pass”. Earlier runs do not prove the cutoff head. Builder receipts are not verdicts.

The sign-in and export work was reviewed by a different AI model (recorded in docs/verdicts), not a human or third-party review. This pack claims no independent model verdict; the GREEN integrator verdict is pending. See E-03, E-26 and E-69.

## 4 The six files

| File | Purpose |
|---|---|
| [README](README.md) | Scope and claims rule |
| [Buyer questionnaire](buyer-questionnaire.md) | Our own 34 questions and bounded answers |
| [Evidence map](evidence-map.md) | Exact merged source, test, introduction and run record |
| [Not-claimed register](not-claimed-register.md) | Gaps, decisions, dependencies and owners |
| [Security-test scope](security-test-scope.md) | Proposed scope; NOT COMMISSIONED |
| [Certification roadmap](certification-roadmap.md) | Proposed sequence; NOT STARTED |

## 5 Words we use and words we do not

| Use | Do not use about this product | Why |
|---|---|---|
| built; covered by an automated test; mapped to merged code; inspectable; in place (practice build); not claimed | verified; certified; compliant; compliance; assured; tamper-proof; guaranteed | Construction and test coverage are not outside assessment or real-data operation. <!-- vocab --> |

The identical scope disclaimer and verbatim source/test quotes are printed in backticks to keep the document word check separate from positive prose. This does not change their meaning. No outside assessment or certification is claimed.

## 6 What this pack does not cover

- Automatic provisioning/removal (SCIM), OpenID sign-in, usable emergency access and native mobile sign-in: E-51, E-52, E-54, E-57 not claimed. See internal dependencies in the register.
- Long-term export checking, rotation and outside timestamps: E-59 and E-60 NOT BUILT.
- Forgery by the app's database login of owner approvals, membership changes, job status and price, or audit entries: E-71 not claimed (NOT IN PLACE; hardening proposed, founder decision pending).
- Practice-area session expiry, revocation and hashed storage: E-72 NOT BUILT (piece issued, not built). Removal of a member on every sign-in route: E-73 NOT EVIDENCED beyond the practice contractor route.
- Independent assessment and Cyber Essentials, Cyber Essentials Plus, ISO 27001 or SOC 2: E-66, E-67, E-67a, E-68 and E-68a NOT COMMISSIONED / NOT STARTED.
- Master services agreement, data processing agreement (DPA), sub-processor list, data protection impact assessment (DPIA) and pilot runbook: E-61 NOT PRODUCED; contract-set work is identified in the register.
- Real-data hosting, encryption, retention, backups, incidents and monitoring: E-61 to E-65 not claimed.
- D04, D07, D12 and D16 remain proposed; G1, G4-C and G5 remain unpassed (E-70 HELD). Proposed recovery targets are not approved or measured; no candidate numbers are quoted.
- Full enterprise identity/security acceptance remains outstanding, including automatic leaver removal, other sign-in protocols, usable emergency access, mobile coverage and outside evidence. The register maps every parent assertion.

## 7 When a row may change

Only a control merged to main with its own named merged test, introduction evidence and an honest scope limit moves a row to in place. A pull-request title, order, plan line or promise does not. Required decisions and operational evidence remain separate. The cutoff is the reference; the integrator re-runs document checks on the final candidate. Later changes require a new source check and a draft refresh. The banner stays until Ben decides.
