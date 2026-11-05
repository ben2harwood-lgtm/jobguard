# Contractor buyer questionnaire (draft)

DRAFT for founder review. Not to be sent to any buyer until Ben approves it.

`Practice build only: made-up data, a built-in test identity provider, no real customer data, no outside assessor. Nothing here has been assessed or certified by anyone outside the project.`

Evidence cutoff: 1df57716837b0184b1cf291c62c18a9e537276d4 (4 November 2026)

These are JobGuard’s own 34 questions. A buyer’s required format is NOT DETERMINED. Answers apply only at the cutoff. “Covered” names an existing automated test; this refresh ran the identity and signed-export unit suites, alongside the watchdog/context guards, migration-proof loader and ops-pack unit checks; PostgreSQL/browser execution awaits CI. Read the map’s run record separately.

## A Sign-in and identity

### Q-01 How do people sign in today?

**Plain answer:** An eight-digit emailed code, delivered only to a test fixture, or SAML 2.0 single sign-on against the built-in test identity provider. SAML is a signed sign-in message from a company identity provider. Codes have five failed attempts, expiry, a resend cooldown and per-IP throttling. These controls are covered by named automated tests.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-01, E-02, E-02b, E-02c, E-03

**Verifying tests:** [identity.integration.test.ts:52](../../packages/db/test/identity.integration.test.ts#L52); [identity.integration.test.ts:66](../../packages/db/test/identity.integration.test.ts#L66); [identity.integration.test.ts:81](../../packages/db/test/identity.integration.test.ts#L81); [identity.integration.test.ts:126](../../packages/db/test/identity.integration.test.ts#L126); [saml.test.ts:72](../../apps/api/src/auth/sso/saml.test.ts#L72)

**Not done:** E-50, E-53

### Q-02 Do you support single sign-on with SAML 2.0?

**Plain answer:** In the practice build. Both the Response and Assertion must be signed. Covered by named automated tests against a built-in test identity provider only; the merged contract says this is not evidence of live interoperability. Every other provider is refused.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-03, E-15

**Verifying tests:** [saml.test.ts:72](../../apps/api/src/auth/sso/saml.test.ts#L72); [role-mapping.test.ts:15](../../apps/api/src/auth/sso/role-mapping.test.ts#L15)

**Not done:** E-50

### Q-03 Do you support OpenID Connect (OIDC)?

**Plain answer:** A synthetic OIDC adapter, persisted requests/sessions and Nest/Next paths are merged. Tests inject a fictional issuer; default composition has no issuer and refuses sign-in. The library inspection names openid-client 6.8.8. Founder decision not recorded: the pin commit cites Ben answer 19 without the decision text. Approved OpenID operation remains HELD.

**Status:** not claimed

**Merged control:** E-51 (practice construction; approval not claimed)

**Verifying tests:** [oidc-signin.integration.test.ts:10](../../packages/db/test/oidc-signin.integration.test.ts#L10); [oidc.application.test.ts:133](../../apps/api/src/auth/sso/oidc.application.test.ts#L133)

**Not done:** E-51

Approved OpenID operation remains not claimed: founder decision not recorded (E-51).

### Q-04 Can our identity provider create and remove accounts automatically (SCIM)?

**Plain answer:** Deactivation is in place in the practice build: a connection-scoped synthetic bearer request revokes linked membership/grants and bound sessions. The next bound request fails; ordinary sessions lose the removed company but retain other companies. The message is JobGuard JSON, not the SCIM 2.0 wire protocol. Account creation and general SCIM provisioning are NOT BUILT; live interoperability is not claimed.

**Status:** in place for synthetic deactivation; not claimed for account creation or live use

**Merged control:** E-52

**Verifying tests:** [scim-deactivation-access.integration.test.ts:38](../../packages/db/test/scim-deactivation-access.integration.test.ts#L38); [scim-deactivation-access.integration.test.ts:43](../../packages/db/test/scim-deactivation-access.integration.test.ts#L43)

**Not done:** E-52

Automatic creation and live provisioning remain not claimed; deactivation coverage is bounded above (E-52).

### Q-05 Can we require everyone in our company to use single sign-on?

**Plain answer:** In the practice build; default OFF. ON needs a current administrator using that company’s bound SSO session, a working connection and no unlinked active member. Merged emergency practice windows are owner-only, bounded and audited, with no new session. Usable emergency operation remains HELD for the founder approver ruling (E-54). Named tests cover practice construction, not live operation.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-41, E-41b, E-41c, E-41d, E-41e

**Verifying tests:** [sso-required.integration.test.ts:86](../../packages/db/test/sso-required.integration.test.ts#L86); [sso-required.integration.test.ts:142](../../packages/db/test/sso-required.integration.test.ts#L142); [sso-required.integration.test.ts:159](../../packages/db/test/sso-required.integration.test.ts#L159); [sso-required.integration.test.ts:220](../../packages/db/test/sso-required.integration.test.ts#L220); [sso-required.integration.test.ts:174](../../packages/db/test/sso-required.integration.test.ts#L174)

**Not done:** E-50, E-54

### Q-06 What stops copied, tampered, unsigned, expired or misdirected sign-in responses?

**Plain answer:** Assertions are consumed once, including a database race. Wrong audience or issuer, unsigned messages, untrusted signers, tampered messages, expired or not-yet-valid messages, unsolicited requests and messages for another company are refused. Covered by named boundary tests; refusals create no session and enter the record when the database is available. Test provider only.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-04, E-05, E-05b, E-06, E-06b, E-07, E-07b, E-08, E-08b, E-09

**Verifying tests:** [enterprise-identity.integration.test.ts:204](../../packages/db/test/enterprise-identity.integration.test.ts#L204); [saml.test.ts:45](../../apps/api/src/auth/sso/saml.test.ts#L45); [saml.test.ts:46](../../apps/api/src/auth/sso/saml.test.ts#L46); [saml.test.ts:73](../../apps/api/src/auth/sso/saml.test.ts#L73); [saml.test.ts:77](../../apps/api/src/auth/sso/saml.test.ts#L77); [saml.test.ts:57](../../apps/api/src/auth/sso/saml.test.ts#L57); [saml.test.ts:58](../../apps/api/src/auth/sso/saml.test.ts#L58); [saml.test.ts:62](../../apps/api/src/auth/sso/saml.test.ts#L62); [enterprise-identity.integration.test.ts:250](../../packages/db/test/enterprise-identity.integration.test.ts#L250); [enterprise-identity.integration.test.ts:217](../../packages/db/test/enterprise-identity.integration.test.ts#L217)

**Not done:** E-50

### Q-07 Can accounts link by accident, matching email or look-alike domain?

**Plain answer:** Unconfirmed domains cannot link. One domain belongs to one connection across all companies. A matching email never silently links an emailed-code account; linking needs an explicit signed-in request. Covered by a named automated test. Domain ownership checks are synthetic; they establish no real ownership.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-10

**Verifying tests:** [enterprise-identity.integration.test.ts:268](../../packages/db/test/enterprise-identity.integration.test.ts#L268)

**Not done:** E-50

### Q-08 How are roles decided for people using our identity provider?

**Plain answer:** Only explicit group-to-role mappings grant access. Unmapped groups grant nothing; finance and commercial_manager never arise by default. No owner or client-approver mapping exists. Mapping changes enter the audit record. Covered by named automated tests; the sign-in provider is a test fixture.

**Status:** in place (practice build)

**Merged control:** E-11, E-16

**Verifying tests:** [enterprise-identity.integration.test.ts:286](../../packages/db/test/enterprise-identity.integration.test.ts#L286); [contractor.test.ts:5](../../packages/core/src/contractor.test.ts#L5)

**Not done:** nothing further

### Q-09 When someone leaves, how soon does access end?

**Plain answer:** Synthetic SCIM deactivation refuses the next bound SSO request and removes the company from ordinary-session membership choices, while preserving other-company access. OIDC has a named SCIM regression test too. Without a deactivation message, SAML sessions end within 15 minutes and next SAML sign-in replaces old sessions/unmapped grants. Emailed-code access needs current company membership and is blocked for an SSO-required company. Every administrator-removal/native route is not established.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-17b, E-17, E-12, E-12b, E-13, E-41, E-52, E-73 (bounded coverage)

**Verifying tests:** [scim-deactivation-access.integration.test.ts:38](../../packages/db/test/scim-deactivation-access.integration.test.ts#L38); [scim-deactivation-access.integration.test.ts:43](../../packages/db/test/scim-deactivation-access.integration.test.ts#L43); [oidc-signin.integration.test.ts:33](../../packages/db/test/oidc-signin.integration.test.ts#L33); [enterprise-identity.integration.test.ts:385](../../packages/db/test/enterprise-identity.integration.test.ts#L385)

**Not done:** E-52, E-73

Universal removal coverage remains not claimed (E-73); the synthetic SCIM subset is described above.

### Q-10 How long does a session last, and how is its cookie protected?

**Plain answer:** SAML sessions last at most 15 minutes. Cookies use Secure (HTTPS only), HttpOnly (unavailable to page scripts) and SameSite strict (restricted across sites). Contractor practice sessions copy the home deadline with a seven-day cap, support revocation and store a digest rather than the bearer; contractor revocation leaves home access unchanged. Named tests cover these synthetic controls; cutoff-head PostgreSQL execution is not claimed here. The emailed-code 24-hour contract value still lacks a cited exact-duration test.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-13, E-14, E-14b, E-72

**Verifying tests:** [enterprise-identity.integration.test.ts:184](../../packages/db/test/enterprise-identity.integration.test.ts#L184); [action-paths.test.ts:272](../../apps/api/src/auth/sso/action-paths.test.ts#L272); [identity.test.ts:31](../../apps/api/src/auth/identity.test.ts#L31); [contractor-practice-session.integration.test.ts:24](../../packages/db/test/contractor-practice-session.integration.test.ts#L24); [contractor-practice-session.integration.test.ts:64](../../packages/db/test/contractor-practice-session.integration.test.ts#L64); [contractor-practice-session.integration.test.ts:249](../../packages/db/test/contractor-practice-session.integration.test.ts#L249)

**Not done:** E-55; E-72 cutoff-head run only

### Q-11 Is there multi-factor sign-in?

**Plain answer:** Not claimed. NOT EVIDENCED. An emailed code is a sign-in code; it is not described as a second factor.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-56

### Q-12 Is there emergency access if single sign-on is down?

**Plain answer:** Usable emergency access remains HELD for the founder approver ruling. Merged practice code permits a company owner with a fixture emailed code to record a bounded “SSO required” OFF window, approval, use and audit; it issues no new session. Non-owners and revoked/expired owner forms are refused. These are synthetic construction tests, not an approved operational access procedure.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-42

**Verifying tests:** [sso-emergency.integration.test.ts:218](../../packages/db/test/sso-emergency.integration.test.ts#L218); [sso-emergency.integration.test.ts:258](../../packages/db/test/sso-emergency.integration.test.ts#L258)

**Not done:** E-54

Usable emergency access remains HELD for the founder approver ruling (E-54).

### Q-13 Does single sign-on work in mobile apps?

**Plain answer:** Not claimed. Native mobile sign-in is HELD for the native phase.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-57

Not claimed. Waits for native mobile sign-in to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

## B Roles inside the product

### Q-14 What roles exist, and how is access limited by team, branch, region or client?

**Plain answer:** Nine roles: owner, administrator, operative, supervisor, surveyor, commercial manager, finance, read-only and client approver. A permission-by-role-by-scope matrix is covered for every combination in pure code and again against PostgreSQL. Client approvers are limited to their client. Revoked memberships fail on the next practice contractor request; E-73 adds ordinary/bound-session synthetic SCIM company exclusion, without universal removal coverage. Practice build only.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-16, E-16b, E-17b

**Verifying tests:** [contractor.test.ts:5](../../packages/core/src/contractor.test.ts#L5); [contractor.integration.test.ts:109](../../packages/db/test/contractor.integration.test.ts#L109); [contractor.integration.test.ts:265](../../packages/db/test/contractor.integration.test.ts#L265)

**Not done:** E-73

## C Keeping companies apart

### Q-15 How is one customer’s data kept apart from another’s?

**Plain answer:** Row-level security means the database filters reads and checks writes against the server’s company setting. It is forced on business tables; a catalogue test enumerates app tables and explicitly records infrastructure exceptions. Cross-company reads/writes and missing or malformed context fail. Covered by named automated tests. This does not protect against compromised identity credentials or a privileged database rewrite.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-18, E-19, E-19b, E-20b

**Verifying tests:** [tenancy.integration.test.ts:207](../../packages/db/test/tenancy.integration.test.ts#L207); [tenancy.integration.test.ts:84](../../packages/db/test/tenancy.integration.test.ts#L84); [tenancy.integration.test.ts:95](../../packages/db/test/tenancy.integration.test.ts#L95); [tenancy.integration.test.ts:152](../../packages/db/test/tenancy.integration.test.ts#L152)

**Not done:** E-58

### Q-16 What can the application’s database login not do?

**Plain answer:** It is not a superuser and cannot bypass or alter row-level security. LP-1 removes direct account/membership creation, promotion, restoration and deletion; LP-4 removes direct audit writes and seals entries through controlled routines. Named tests cover these changes. Lower-trust authority-named audit statements remain permitted; full protection from forged owner approvals, job status/price and downstream authority is not claimed (E-71). Privileged database and identity-service compromise remain outside this limit.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-21, E-22, E-71 (narrowing only)

**Verifying tests:** [tenancy.integration.test.ts:582](../../packages/db/test/tenancy.integration.test.ts#L582); [lp1-membership-account.integration.test.ts:112](../../packages/db/test/lp1-membership-account.integration.test.ts#L112); [lp4-audit.integration.test.ts:89](../../packages/db/test/lp4-audit.integration.test.ts#L89); [lp4-audit.integration.test.ts:116](../../packages/db/test/lp4-audit.integration.test.ts#L116)

**Not done:** E-58, E-71

### Q-17 How does the application choose a request’s company?

**Plain answer:** From a current, non-revoked membership, checked after sign-in. A client company choice is a selection request, never authority. Only the server module can mint the original company context; copies are refused. Covered by named automated tests. Compromise of the identity service remains outside this protection.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-17, E-17c, E-20

**Verifying tests:** [auth.test.ts:92](../../apps/api/src/auth/auth.test.ts#L92); [auth.test.ts:82](../../apps/api/src/auth/auth.test.ts#L82); [tenant-context.test.ts:38](../../packages/db/src/tenant-context.test.ts#L38)

**Not done:** E-58

## D Records and evidence

### Q-18 Do you keep a tamper-evident record?

**Plain answer:** A per-company hash chain is append-only for the runtime login. It detects alteration or removal relative to a trusted checkpoint. LP-4 closes direct audit writes but permits lower_trust statements, including authority-named ones; those labels do not establish truth or authorization. The database owner could replace the chain and in-database checkpoints. A local fake TSA adapter is built, but no outside audit-chain anchor is claimed.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-22, E-23, E-24; E-71 (LP-4 narrowing only)

**Verifying tests:** [audit.integration.test.ts:107](../../packages/db/test/audit.integration.test.ts#L107); [audit.integration.test.ts:85](../../packages/db/test/audit.integration.test.ts#L85); [audit.integration.test.ts:98](../../packages/db/test/audit.integration.test.ts#L98); [lp4-audit.integration.test.ts:89](../../packages/db/test/lp4-audit.integration.test.ts#L89); [lp4-audit.integration.test.ts:116](../../packages/db/test/lp4-audit.integration.test.ts#L116)

**Not done:** E-59, E-60, E-71

### Q-19 What personal data goes into that record?

**Plain answer:** Allowlisted identifiers and hashes only; no names, emails or free text. Covered by a named automated test. References and hashes can still be personal data and remain subject to access and retention policy. This does not establish a real-data retention policy.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-25

**Verifying tests:** [audit.integration.test.ts:107](../../packages/db/test/audit.integration.test.ts#L107)

**Not done:** E-63

### Q-20 Can we get our record out and check it without trusting you?

**Plain answer:** The original signed single-company audit export has an offline checker and per-export ephemeral signing keys. A separate synthetic signed-evidence wrapper adds signer versions, rotation, retained public records and stored bundle bytes with approved scope/recipient binding. Its offline checker needs independently obtained expected scope and registry input; it refuses untrusted/revoked keys and reports historical expiry. It always reports complete: false. No live key custody, current revocation service, external timestamp or long-term operating promise is claimed.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-26, E-26b, E-27, E-27b, E-28, E-60 (partial practice scope)

**Verifying tests:** [signed-evidence-export.test.ts:43](../../packages/db/test/signed-evidence-export.test.ts#L43); [signed-evidence-export.test.ts:56](../../packages/db/test/signed-evidence-export.test.ts#L56); [signed-evidence-export.test.ts:93](../../packages/db/test/signed-evidence-export.test.ts#L93); [signed-evidence-export-store.integration.test.ts:126](../../packages/db/test/signed-evidence-export-store.integration.test.ts#L126)

**Not done:** E-60

### Q-21 Who can create an export, and is it recorded?

**Plain answer:** Only current company-wide owners or administrators. Other authenticated roles are refused and the refusal is recorded; an unauthenticated request has no trusted company for that record. Each export adds an audit event; repeating its command creates one stored effect. Covered by named automated tests. Creation is refused outside practice mode.

**Status:** in place (practice build)

**Merged control:** E-29, E-30, E-31

**Verifying tests:** [audit-export.integration.test.ts:327](../../packages/db/test/audit-export.integration.test.ts#L327); [audit-export.integration.test.ts:319](../../packages/db/test/audit-export.integration.test.ts#L319); [audit-export.integration.test.ts:366](../../packages/db/test/audit-export.integration.test.ts#L366)

**Not done:** nothing further

### Q-22 How is an export’s checkpoint taken, and is there an outside timestamp?

**Plain answer:** A manual owner-run command takes and hands off each company’s checkpoint. Repeating it without new events writes nothing; a later company needs another run. Named tests cover that behavior. M5-9 adds synthetic retained checking and rotation separately (E-60); the local fake TSA (E-59) is not an outside anchor. Scheduled hand-off and an outside timestamp remain NOT BUILT.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-32, E-32b; E-59 (local fake only), E-60 (partial practice scope)

**Verifying tests:** [audit-checkpoint-handoff.test.ts:59](../../packages/db/src/audit-checkpoint-handoff.test.ts#L59); [audit-checkpoint-handoff.integration.test.ts:211](../../packages/db/test/audit-checkpoint-handoff.integration.test.ts#L211)

**Not done:** E-60

Outside timestamp, scheduled hand-off and live signer operation remain not claimed (E-59/E-60).

## E Data, providers and privacy

### Q-23 Where is data processed and stored, and who are your sub-processors?

**Plain answer:** Not claimed for real data. No real-data route is approved. The practice SAML register schema requires every field and a deny fallback, covered by a named automated test. Sign-in and export registers list no outside provider for those features; that is not an approved hosting or sub-processor list.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-40

**Verifying tests:** [linking.test.ts:7](../../apps/api/src/auth/sso/linking.test.ts#L7)

**Not done:** E-61

### Q-24 Who is the controller and who is the processor?

**Plain answer:** Not claimed. D12 is proposed: the contractor as controller and JobGuard as processor under a data processing agreement (DPA). No DPA is produced; the proposed roles are not a policy in force.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-61

### Q-25 Is our data used to train AI models?

**Plain answer:** Not claimed for the product as a whole. Sign-in and export registers record no model call, but no cited test pins that statement. A product-wide training statement is NOT PRODUCED.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-61

### Q-26 Is data encrypted in transit and at rest?

**Plain answer:** Not claimed for real data. The sign-in data-flow document requires transport and storage encryption before real data. Cookie flags in Q-10 and export signatures do not establish that configuration.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-62

### Q-27 How long is data kept, and can it be deleted when we leave?

**Plain answer:** Not claimed. D07 is proposed; retention, deletion and exit tooling are NOT BUILT as a complete workflow. Session expiry is not a deletion policy.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-63

## F Backup and recovery

### Q-28 Do you back up our data, and have you tested a restore?

**Plain answer:** Not claimed for real data. A named test restores a copy of a disposable fixture database and checks rows, database evidence, roles and the audit chain. It is not a backup service. The deployment document says the hosted demo is not evidence of real-data readiness, residency approval or backup/restore readiness.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-39

**Verifying tests:** [restore-rehearsal.integration.test.ts:12](../../packages/db/test/restore-rehearsal.integration.test.ts#L12)

**Not done:** E-64

## G Incidents and operations

### Q-29 Do you have an incident plan, monitoring and a way to tell us?

**Plain answer:** Not claimed for operations. Synthetic incident-runbook preparation and fake alert tests are merged; no pager, live monitoring, named role holders or buyer-notification exercise is installed. Operational evidence remains NOT EVIDENCED (E-65).

**Status:** not claimed

**Merged control:** E-65 (synthetic preparation only; operations not claimed)

**Verifying tests:** [ops-pack.test.mjs:12](../../tools/ops-pack.test.mjs#L12); [ops-pack.test.mjs:24](../../tools/ops-pack.test.mjs#L24)

**Not done:** E-65

## H How the software is built and changed

### Q-30 How is code tested and reviewed before acceptance?

**Plain answer:** Continuous integration (CI) runs typecheck, lint, tests, build and browser checks. Sign-in and export were reviewed by a different AI model (recorded in docs/verdicts), not a human or third-party review. Models were Claude Opus and Codex Sol. Builder receipts are not verdicts. Several database/browser tests ran later on the Mac or GitHub CI, outside the builder sandbox.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-33, E-33b, E-36, E-03, E-26

**Verifying tests:** [ci.yml:113](../../.github/workflows/ci.yml#L113); [ci.yml:113](../../.github/workflows/ci.yml#L113); [agent-lane-boundary.test.mjs:35](../../tools/agent-lane-boundary.test.mjs#L35); [saml.test.ts:72](../../apps/api/src/auth/sso/saml.test.ts#L72); [audit-export.integration.test.ts:279](../../packages/db/test/audit-export.integration.test.ts#L279)

**Not done:** E-69

### Q-31 Are exposed sensitive values and vulnerable dependencies scanned for?

**Plain answer:** CI scans each pull request and main push for exposed sensitive values, with three exact fingerprint exceptions in .gitleaksignore. A dependency audit fails on findings or lookup errors. Covered by a named automated test or workflow step. These checks do not establish absence of every weakness.

**Status:** in place (practice build)

**Merged control:** E-34, E-35

**Verifying tests:** [dependency-audit.test.mjs:8](../../tools/dependency-audit.test.mjs#L8); [ci.yml:163](../../.github/workflows/ci.yml#L163)

**Not done:** nothing further

### Q-32 Is practice mode kept apart from real use, and can a request switch it?

**Plain answer:** Server configuration selects the mode; requests cannot choose it. The export input refuses client mode fields. Single sign-on and export creation refuse non-practice modes. Covered by named automated tests. This describes those features and their request schemas, not full operational separation for a real deployment.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-15, E-31, E-38

**Verifying tests:** [role-mapping.test.ts:15](../../apps/api/src/auth/sso/role-mapping.test.ts#L15); [audit-export.integration.test.ts:366](../../packages/db/test/audit-export.integration.test.ts#L366); [audit-export.application.test.ts:21](../../apps/api/src/audit-export/audit-export.application.test.ts#L21)

**Not done:** E-61

## I Independent assessment (not commissioned)

### Q-33 Have you had an independent security test?

**Plain answer:** Not claimed. NOT COMMISSIONED. A scope proposal is in this pack; no tester is engaged and no result exists.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-66

Not claimed. Waits for outside security review to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

### Q-34 Do you hold Cyber Essentials, Cyber Essentials Plus, ISO 27001 or SOC 2?

**Plain answer:** Not claimed. All four are NOT STARTED. No assessor, date or certificate exists. The relationship between Cyber Essentials and Plus is NOT DETERMINED; no standard’s requirements were researched for this pack.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-67, E-67a, E-68, E-68a, E-70

