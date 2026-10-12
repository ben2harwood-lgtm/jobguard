# Not-claimed register (draft)

DRAFT for founder review. Not to be sent to any buyer until Ben approves it.

`Practice build only: made-up data, a built-in test identity provider, no real customer data, no outside assessor. Nothing here has been assessed or certified by anyone outside the project.`

Evidence cutoff: 96c0cb8a5b5562c65b79f5f601ba9d60f8fcf05a (12 October 2026)

## How to read this page

Each label identifies evidence we lack, not a defect filed by this pack. Internal piece IDs live on this page only. A proposed decision is not a policy in force. Founder approval of sharing this draft remains pending, alongside the solicitor review of the contract set.

## Sign-in

| E-id | Item (plain words) | Label | Why | What would change it | Who decides | Waits for |
|---|---|---|---|---|---|---|
| E-50 | Live identity provider and real domain ownership | HELD | No real route evidence; domain checks are synthetic. | Live route and named interoperability tests plus route approval. | data/security owner (D04, unassigned) | D04 / G5 |
| E-51 | OpenID Connect sign-in | HELD | Second library decision is founder-reserved. | Library decision, merged adapter and its own tests. | founder | Ben’s library decision; future piece |
| E-52 | SCIM automatic account creation and removal | NOT BUILT | No endpoint, migration or implementation at cutoff. | Merged provisioning/removal; deactivation refuses the next request. | founder | ENT-10a2 |
| E-53 | Live delivery of emailed sign-in codes | HELD | Codes go to a test fixture only. | Approved route, live adapter and its own tests. | data/security owner (D04, unassigned) | D04 / G1 |
| E-54 | Usable emergency access | HELD | Route refuses every request; no approver writer or rule. | Founder decides approver; merged approval/use path and its own tests. | founder | ENT-10d2 / ENT-10e |
| E-55 | Emailed-code session duration pinned by a test | NOT DETERMINED | Contract says 24 hours; no cited test pins that number. | A merged named duration test. | founder | A future identity piece |
| E-56 | Multi-factor sign-in | NOT EVIDENCED | An emailed code is not described as a second factor. | Defined scope, merged control and its own tests. | founder | A future identity piece |
| E-57 | Native mobile single sign-on | HELD | Native path is deferred. | Merged native path and device/build tests. | founder | M3 |
| E-72 | Practice-area sessions expire, can be revoked and store only a hashed key | NOT BUILT | Piece issued, not built: an order has been written; nothing is built yet. | Merged session hardening with its own named tests. | founder | PRACTICE-SESSION-HARDEN-1 (piece issued, not built) |
| E-73 | A removed member loses access on every sign-in route | NOT EVIDENCED | Evidenced only on the practice contractor route (E-17b); the ordinary sign-in session route is not covered (known gap, fix-later). | A merged control and a named test for each remaining sign-in route. | founder | A fix-later item |

**E-51:** Not claimed. Waits for OpenID sign-in to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

**E-52:** Not claimed. Waits for automatic account provisioning and removal to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

**E-54:** Not claimed. Waits for usable emergency access to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

**E-57:** Not claimed. Waits for native mobile sign-in to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

**E-72:** Not claimed. Waits for practice-area session hardening to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

## Company separation and records

| E-id | Item (plain words) | Label | Why | What would change it | Who decides | Waits for |
|---|---|---|---|---|---|---|
| E-58 | Protection if privileged database or identity access is compromised | NOT EVIDENCED | Row-level security does not cover this trust-boundary failure. | A separately scoped control and named tests, with its residual limits. | data/security owner (D04, unassigned) | Separate security work |
| E-59 | Outside audit-chain anchor | NOT BUILT | Checkpoints remain within the database trust boundary. | Merged external anchor and named tests. | founder | M4 |
| E-60 | Signer registry, rotation, revocation, outside timestamp, scheduled hand-off and long-term checking | NOT BUILT | Per-export material and manual hand-off only; no durable signer lifecycle. | Merged lifecycle/retained-material controls and their own tests. | founder | M5-9 / M4 |
| E-71 | Owner approvals, membership changes, job status and price, and audit entries cannot be forged by the app's database login | HELD | NOT IN PLACE: found by the internal audit of 12 October 2026 (an internal document, not yet in this repository). Hardening is proposed; founder decision pending. | A founder decision, then a merged change removing those rights from the app's database login, with its own named tests. | founder | Founder decision on the proposed hardening programme |

**E-60:** Not claimed. Waits for long-term export checking and signer lifecycle to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

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
| E-65 | Incident plan, monitoring, alerts and buyer notification | NOT EVIDENCED | No merged incident runbook identified; pre-pilot requirement remains. | Named ownership, runbook, operational monitoring and notification exercise. | data and operations owners (D07) | Separate operations piece / G1 |

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
| SCIM deactivation refuses next request | Not claimed; E-52 NOT BUILT | ENT-10a2 |
| Without SCIM, access ends at next sign-in and within limit | ENT-10a E-12, E-12b, E-13; administrator revocation E-17b | Emailed code remains unless ENT-10d switch ON (E-41); automatic removal E-52 NOT BUILT |
| Existing permission conformance suite passes unchanged | ENT-1 named pure/database suites E-16, E-16b | Regression duty of code pieces; not run or claimed passing here |
| Every M5-7 assertion passes | Web/background limits covered by ENT-10a E-10, E-12b; matrix E-16, E-16b | Native E-57, SCIM E-52, OpenID E-51, usable emergency E-54 and D04/G5 E-70 remain not claimed |
| Checker detects altered or missing entries | ENT-10b merged; E-26b, E-27, E-27b | M5-9 long-term checking and rotation E-60 NOT BUILT |
| Each export covers one company | ENT-10b merged; E-26 | Real-data route E-61 NOT PRODUCED |
| Exports are themselves recorded | ENT-10b merged; E-26, E-30 | Real-data route E-61 NOT PRODUCED |
| Pack honesty checked in the verdict | This draft maps claims to merged code/tests and pending labels | Integrator’s GREEN verdict pending; no independent model verdict claimed |

M5-7 additionally requires bounded, separately logged/reviewed emergency operations: E-42 covers refusal only; E-54 waits for ENT-10d2 / ENT-10e with a founder-approved approver. Mobile action-path coverage remains E-57. Updated provider-flow approval is E-70 HELD. M5-9 retained checking and signer rotation remain E-60; M5-12 outside assessment remains E-66, E-67, E-67a, E-68 and E-68a NOT STARTED / NOT COMMISSIONED. Metadata completeness E-40 does not satisfy D04/G5.

Merged-piece list: ENT-1; emailed-code identity; server-stamped context; ENT-10a SAML; ENT-10b signed export; ENT-10b-OPS manual hand-off; ENT-10d required-switch refusal path. Only SAML and export have the specified recorded model verdicts on main; hand-off and required-switch records are builder receipts, not verdicts.
