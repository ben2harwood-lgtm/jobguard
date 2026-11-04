# Not-claimed register (draft)

DRAFT for founder review. Not to be sent to any buyer until Ben approves it.

`Practice build only: made-up data, a built-in test identity provider, no real customer data, no outside assessor. Nothing here has been assessed or certified by anyone outside the project.`

Evidence cutoff: 1df57716837b0184b1cf291c62c18a9e537276d4 (4 November 2026)

## How to read this page

Each label identifies remaining scope or execution evidence we lack, not a defect filed by this pack. A mixed row names the practice control already in place and the exact pending remainder; E-72 records the missing cutoff-head run, not missing code. Internal piece IDs live on this page only. A proposed decision is not a policy in force. Founder approval of sharing this draft remains pending, alongside the solicitor review of the contract set.

## Sign-in

| E-id | Item (plain words) | Label | Why | What would change it | Who decides | Waits for |
|---|---|---|---|---|---|---|
| E-50 | Live identity provider and real domain ownership | HELD | No real route evidence; domain checks are synthetic. | Live route and named interoperability tests plus route approval. | data/security owner (D04, unassigned) | D04 / G5 |
| E-51 | OpenID Connect sign-in | HELD | Adapter, persistence and routes merged; local issuer only. Library review names openid-client 6.8.8. Founder decision not recorded; pin commit cites Ben answer 19 without decision text. See E-51 map for named tests. | Recorded founder library decision and approved live route evidence. | founder | Founder library decision / D04 / G5 |
| E-52 | SCIM automatic account creation and removal | DARK BUILD; CI PENDING | `0966_scim2_machine.sql` plus the separate machine role, owner-enabled expiring binding, Users/Groups transport and deactivation path are built ahead. Local input tests pass; PostgreSQL has not run in this sandbox. | Real PostgreSQL next-request revocation, upgrade/catalogue and adversarial CI tests, independent RED review and merge. | router for synthetic work | ENT-10-rest; no controller registration or machine login installed |
| E-53 | Live delivery of emailed sign-in codes | HELD | Codes go to a test fixture only. | Approved route, live adapter and its own tests. | data/security owner (D04, unassigned) | D04 / G1 |
| E-54 | Usable emergency access | DARK BUILD; CI PENDING | `0965_emergency_dual_owner.sql` adds two other named owners, one non-extendable hour and a restricted recovery capability; owner notice is on the identity screen. SQL and browser proofs are written, not executed here. The merged one-owner tenant-wide switch is separate and is not this capability. | CI, independent RED review, merge and replacement of the legacy public emergency route before claiming usable general sign-in recovery. | router for synthetic work | ENT-10-rest; legacy route replacement is a named landing hold |
| E-55 | Emailed-code session duration pinned by a test | NOT DETERMINED | Contract says 24 hours; no cited test pins that number. | A merged named duration test. | founder | A future identity piece |
| E-56 | Multi-factor sign-in | NOT EVIDENCED | An emailed code is not described as a second factor. | Defined scope, merged control and its own tests. | founder | A future identity piece |
| E-57 | Native mobile single sign-on | HELD | Native path is deferred. | Merged native path and device/build tests. | founder | M3 |
| E-72 | Practice-area sessions expire, can be revoked and store only a hashed key | NOT EVIDENCED | Pending label refers to cutoff-head execution evidence, not implementation: practice control is in place (map E-72, migration 0138, PH1-PH5/PH15 tests). No PostgreSQL run on this cutoff is claimed here. | CI execution on the candidate; real-user operation separately needs release evidence. | founder | Cutoff-head PostgreSQL CI / real-data gates |
| E-73 | A removed member loses access on every sign-in route | NOT EVIDENCED | Ordinary-session company exclusion and bound SSO refusal now have synthetic SCIM tests (map E-73), including OIDC. Universal administrator-removal/native coverage is not established. | Named control/test for every remaining removal and sign-in route. | founder | Remaining every-route evidence / native |

**E-51:** Not claimed as approved OpenID sign-in. Adapter, persistence and test-only issuer paths are merged; founder decision not recorded (map E-51).

**E-52:** Dark Users/Groups provisioning and removal are built ahead. The owner must enable an expiring machine binding. PostgreSQL immediate-revocation and tenant proofs remain CI-pending. The controller is deliberately unregistered. Directory groups do not grant roles; existing explicitly audited SSO mappings retain that authority. This bounded SCIM profile refuses unsupported filters/pagination; reactivation requires a separate human path.

**E-54:** Dark recovery supports inspection and revoking non-owner access only. Two distinct owner identities other than the requester approve within 15 minutes; opening creates one immutable one-hour session. Actions and owner notices seal atomically with the audit chain. No journal, evidence, money, owner or tenant-wide SSO-switch authority. CI must prove the SQL and browser behavior. General emergency sign-in is not claimed: the inherited one-owner public switch still needs replacement.

**E-57:** Not claimed. Waits for native mobile sign-in to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

**E-72:** Practice implementation is in place; cutoff-head PostgreSQL execution and real-data operation are not evidenced here (map E-72).

## Company separation and records

| E-id | Item (plain words) | Label | Why | What would change it | Who decides | Waits for |
|---|---|---|---|---|---|---|
| E-58 | Protection if privileged database or identity access is compromised | NOT EVIDENCED | Row-level security does not cover this trust-boundary failure. | A separately scoped control and named tests, with its residual limits. | data/security owner (D04, unassigned) | Separate security work |
| E-59 | Outside audit-chain anchor | NOT BUILT | Dark local fake TSA construction is merged, including signed DER tests (map E-59); no outside service or externally anchored audit chain. | Merged outside anchor and named tests plus approved operational route. | founder | M4 / D04 / G5 |
| E-60 | Signer registry, rotation, revocation, outside timestamp, scheduled hand-off and long-term checking | NOT BUILT | Outside timestamp, scheduled hand-off and live signer lifecycle remain absent. Synthetic rotation, retained key/export store and offline checking are in place (map E-60); current revocation needs independent input. | Missing controls and their tests, approved custody/retention and operational preservation evidence. | founder | M5-9 remaining operational scope / M4 / D04 / G5 |
| E-71 | Owner approvals, membership changes, job status and price, and audit entries cannot be forged by the app's database login | HELD | LP-1 removes direct account/membership writes; LP-4 closes direct audit writes but accepts lower_trust statements. Named tests and limits are mapped at E-71. Full anti-forgery assertion remains NOT IN PLACE. | Founder decision and merged closure of remaining authority paths with named tests. | founder | Founder decision on remaining hardening scope |

**E-60:** Synthetic rotation and retained checking are in place; the remaining lifecycle, outside timestamp and scheduled hand-off are not claimed (map E-60).

## Data, providers and privacy

| E-id | Item (plain words) | Label | Why | What would change it | Who decides | Waits for |
|---|---|---|---|---|---|---|
| E-61 | Real-data regions, sub-processors, DPA, DPIA, legal roles and product AI-training statement | NOT PRODUCED | D04 and D12 are proposed; contract set absent. | Founder route decisions and solicitor-reviewed contract set, supported by operational evidence. | data/legal owner (D12, unassigned) | ENT-14 / D04 / D12 / G1 / G5 |
| E-62 | Real-data encryption in transit and at rest | NOT EVIDENCED | Cookie flags and signatures are not storage/channel evidence. | Approved real route with measured transport/storage configuration evidence. | data/security owner (D04, unassigned) | D04 / G1 |
| E-63 | Retention, deletion and exit tooling | NOT BUILT | D07 is proposed; no complete exit workflow claimed. | Approved policy and implemented, exercised tooling. | data and operations owners (D07) | D07 / M5-11 |

## Backup and operations

| E-id | Item (plain words) | Label | Why | What would change it | Who decides | Waits for |
|---|---|---|---|---|---|---|
| E-64 | Real-data backups, deployed restore and recovery targets | NOT EVIDENCED | Disposable fixture rehearsal is not a backup service. | Approved objectives and recorded deployed recovery exercises. | data and operations owners (D07) | D07 / M5-10 / G1 |
| E-65 | Incident plan, monitoring, alerts and buyer notification | NOT EVIDENCED | Synthetic runbook preparation and fake-sink tests are merged (map E-65); installed monitoring, named role holders and a buyer-notification exercise remain absent. | Named ownership, runbook, operational monitoring and notification exercise. | data and operations owners (D07) | Separate operations piece / G1 |

## Assessment and certification

| E-id | Item (plain words) | Label | Why | What would change it | Who decides | Waits for |
|---|---|---|---|---|---|---|
| E-66 | Independent security test | NOT COMMISSIONED | Scope proposal only; no tester engaged or result. | Founder commissions test; findings, fixes and retest recorded. | founder | M5-12 |
| E-67 | Cyber Essentials | NOT STARTED | No programme or external result. | Founder starts scoped work and external assessment evidence is recorded. | an external assessor (unnamed) | M5-12 |
| E-67a | Cyber Essentials Plus | NOT STARTED | No programme or external result; prerequisite relationship NOT DETERMINED. | Founder starts scoped work and external assessment evidence is recorded. | an external assessor (unnamed) | M5-12 |
| E-68 | ISO 27001 | NOT STARTED | No programme or external result. | Founder starts scoped work and external assessment evidence is recorded. | an external assessor (unnamed) | M5-12 |
| E-68a | SOC 2 | NOT STARTED | No programme or external result. | Founder starts scoped work and external assessment evidence is recorded. | an external assessor (unnamed) | M5-12 |
| E-69 | Human or third-party code review; company policies, training and supplier management | NOT EVIDENCED | Recorded code reviews are by AI models; builder receipts are not verdicts. | Scoped human/outside review and operational evidence. | founder | Separate operational evidence |

**E-66:** Not claimed. Waits for outside security review to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

## Decisions and gates

| E-id | Item (plain words) | Label | Why | What would change it | Who decides | Waits for |
|---|---|---|---|---|---|---|
| E-70 | Approved decisions and passed release gates | HELD | D04, D07, D12 and D16 proposed; G1, G4-C and G5 not passed. | Dated approval evidence and each applicable gate’s required evidence. | founder | D04 / D07 / D12 / D16 / G1 / G4-C / G5 |

## ENT-10 as a whole

Aggregate acceptance remains outstanding. The merged-piece list describes practice construction only; it is not a new acceptance or a production gate.

| Parent Done-when assertion | Practice evidence | Remaining scope |
|---|---|---|
| Replayed assertions refused | ENT-10a merged; E-04 | Live provider E-50 HELD |
| Wrong audience or issuer refused | ENT-10a merged; E-05, E-05b | Live provider E-50 HELD |
| Altered, unsigned or expired assertions refused | ENT-10a merged; E-03, E-06b, E-07 | Live provider E-50 HELD |
| Provider-initiated sign-in to wrong company refused | ENT-10a merged; E-08, E-08b, E-09 | Live provider E-50 HELD |
| Unconfirmed domains cannot link | ENT-10a merged; E-10 | Real ownership E-50 HELD |
| Emailed-code accounts never link silently | ENT-10a merged; E-10 | Live provider E-50 HELD |
| Finance/commercial roles explicit; mapping changes recorded | ENT-10a merged; E-11 | Native E-57 HELD |
| SCIM deactivation refuses next request | Practice deactivation E-52, named G1/G2 tests | Dark Users/Groups provisioning is built ahead; PostgreSQL CI, RED review and live route remain unproved |
| Without SCIM, access ends at next sign-in and within limit | ENT-10a E-12, E-12b, E-13; administrator revocation E-17b; E-73 adds ordinary/bound-session synthetic SCIM coverage | Emailed code remains unless ENT-10d switch ON (E-41); dark automatic creation E-52 CI PENDING; synthetic deactivation built |
| Existing permission conformance suite passes unchanged | ENT-1 named pure/database suites E-16, E-16b | Regression duty of code pieces; not run or claimed passing here |
| Every M5-7 assertion passes | Web/background limits covered by ENT-10a E-10, E-12b; matrix E-16, E-16b | Dark SCIM provisioning E-52 and restricted emergency E-54 await CI/review/merge; native E-57, approved OpenID operation E-51, general emergency sign-in and D04/G5 E-70 remain not claimed |
| Checker detects altered or missing entries | ENT-10b merged; E-26b, E-27, E-27b | E-60 synthetic rotation and retained checking built; live lifecycle, timestamp and scheduling not claimed |
| Each export covers one company | ENT-10b merged; E-26 | Real-data route E-61 NOT PRODUCED |
| Exports are themselves recorded | ENT-10b merged; E-26, E-30 | Real-data route E-61 NOT PRODUCED |
| Pack honesty checked in the verdict | This draft maps claims to merged code/tests and pending labels | Integrator’s GREEN verdict pending; no independent model verdict claimed |

M5-7 additionally requires bounded, separately logged/reviewed emergency operations: E-42 covers owner-only practice windows and non-owner refusal; E-54 adds a dark two-other-owner restricted capability, with CI/review/merge and legacy-route replacement pending; the founder approver ruling for general sign-in remains unrecorded. Mobile action-path coverage remains E-57. Updated provider-flow approval is E-70 HELD. M5-9 synthetic retained checking and rotation are built; E-60 retains the operational gaps; M5-12 outside assessment remains E-66, E-67, E-67a, E-68 and E-68a NOT STARTED / NOT COMMISSIONED. Metadata completeness E-40 does not satisfy D04/G5.

Merged-piece list: ENT-1; emailed-code identity; server-stamped context; ENT-10a SAML; ENT-10b signed export; ENT-10b-OPS manual hand-off; ENT-10d required-switch path; synthetic SCIM deactivation; OIDC adapter/persistence with injected test issuer; contractor practice-session hardening; M5-9 synthetic signing and retained store; LP-1 account/membership closure and LP-4 audit sealing. The latter additions are construction evidence, not new verdicts. Only SAML and export have the specified recorded model verdicts on main; hand-off and required-switch records are builder receipts, not verdicts.
