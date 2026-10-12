# Contractor buyer questionnaire (draft)

DRAFT for founder review. Not to be sent to any buyer until Ben approves it.

`Practice build only: made-up data, a built-in test identity provider, no real customer data, no outside assessor. Nothing here has been assessed or certified by anyone outside the project.`

Evidence cutoff: 96c0cb8a5b5562c65b79f5f601ba9d60f8fcf05a (12 October 2026)

These are JobGuard’s own 34 questions. A buyer’s required format is NOT DETERMINED. Answers apply only at the cutoff. “Covered” names an existing automated test; the builder ran none. Read the map’s run record separately.

## A Sign-in and identity

### Q-01 How do people sign in today?

**Plain answer:** An eight-digit emailed code, delivered only to a test fixture, or SAML 2.0 single sign-on against the built-in test identity provider. SAML is a signed sign-in message from a company identity provider. Codes have five failed attempts, expiry, a resend cooldown and per-IP throttling. These controls are covered by named automated tests.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-01, E-02, E-02b, E-02c, E-03

**Verifying tests:** [identity.integration.test.ts:52](../../packages/db/test/identity.integration.test.ts#L52); [identity.integration.test.ts:66](../../packages/db/test/identity.integration.test.ts#L66); [identity.integration.test.ts:81](../../packages/db/test/identity.integration.test.ts#L81); [identity.integration.test.ts:120](../../packages/db/test/identity.integration.test.ts#L120); [saml.test.ts:72](../../apps/api/src/auth/sso/saml.test.ts#L72)

**Not done:** E-50, E-53

### Q-02 Do you support single sign-on with SAML 2.0?

**Plain answer:** In the practice build. Both the Response and Assertion must be signed. Covered by named automated tests against a built-in test identity provider only; the merged contract says this is not evidence of live interoperability. Every other provider is refused.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-03, E-15

**Verifying tests:** [saml.test.ts:72](../../apps/api/src/auth/sso/saml.test.ts#L72); [role-mapping.test.ts:15](../../apps/api/src/auth/sso/role-mapping.test.ts#L15)

**Not done:** E-50

### Q-03 Do you support OpenID Connect (OIDC)?

**Plain answer:** Not claimed. HELD: no adapter is built. The library decision belongs to the founder.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-51

Not claimed. Waits for OpenID sign-in to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

### Q-04 Can our identity provider create and remove accounts automatically (SCIM)?

**Plain answer:** Not claimed. Automatic account provisioning and removal is NOT BUILT. SCIM is the standard used for that exchange.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-52

Not claimed. Waits for automatic account provisioning and removal to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

### Q-05 Can we require everyone in our company to use single sign-on?

**Plain answer:** In the practice build; default OFF. ON needs a current administrator using that company’s SAML session, a working connection and no unlinked active member. The strict guard and emergency off-only effect are INTERIM. The emergency route refuses every request until the founder supplies an approver rule. Covered by named automated tests; no green run recorded on main.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-41, E-41b, E-41c, E-41d, E-41e

**Verifying tests:** [sso-required.integration.test.ts:84](../../packages/db/test/sso-required.integration.test.ts#L84); [sso-required.integration.test.ts:140](../../packages/db/test/sso-required.integration.test.ts#L140); [sso-required.integration.test.ts:157](../../packages/db/test/sso-required.integration.test.ts#L157); [sso-required.integration.test.ts:218](../../packages/db/test/sso-required.integration.test.ts#L218); [sso-required.integration.test.ts:172](../../packages/db/test/sso-required.integration.test.ts#L172)

**Not done:** E-50, E-54

### Q-06 What stops copied, tampered, unsigned, expired or misdirected sign-in responses?

**Plain answer:** Assertions are consumed once, including a database race. Wrong audience or issuer, unsigned messages, untrusted signers, tampered messages, expired or not-yet-valid messages, unsolicited requests and messages for another company are refused. Covered by named boundary tests; refusals create no session and enter the record when the database is available. Test provider only.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-04, E-05, E-05b, E-06, E-06b, E-07, E-07b, E-08, E-08b, E-09

**Verifying tests:** [enterprise-identity.integration.test.ts:202](../../packages/db/test/enterprise-identity.integration.test.ts#L202); [saml.test.ts:45](../../apps/api/src/auth/sso/saml.test.ts#L45); [saml.test.ts:46](../../apps/api/src/auth/sso/saml.test.ts#L46); [saml.test.ts:73](../../apps/api/src/auth/sso/saml.test.ts#L73); [saml.test.ts:77](../../apps/api/src/auth/sso/saml.test.ts#L77); [saml.test.ts:57](../../apps/api/src/auth/sso/saml.test.ts#L57); [saml.test.ts:58](../../apps/api/src/auth/sso/saml.test.ts#L58); [saml.test.ts:62](../../apps/api/src/auth/sso/saml.test.ts#L62); [enterprise-identity.integration.test.ts:248](../../packages/db/test/enterprise-identity.integration.test.ts#L248); [enterprise-identity.integration.test.ts:215](../../packages/db/test/enterprise-identity.integration.test.ts#L215)

**Not done:** E-50

### Q-07 Can accounts link by accident, matching email or look-alike domain?

**Plain answer:** Unconfirmed domains cannot link. One domain belongs to one connection across all companies. A matching email never silently links an emailed-code account; linking needs an explicit signed-in request. Covered by a named automated test. Domain ownership checks are synthetic; they establish no real ownership.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-10

**Verifying tests:** [enterprise-identity.integration.test.ts:266](../../packages/db/test/enterprise-identity.integration.test.ts#L266)

**Not done:** E-50

### Q-08 How are roles decided for people using our identity provider?

**Plain answer:** Only explicit group-to-role mappings grant access. Unmapped groups grant nothing; finance and commercial_manager never arise by default. No owner or client-approver mapping exists. Mapping changes enter the audit record. Covered by named automated tests; the sign-in provider is a test fixture.

**Status:** in place (practice build)

**Merged control:** E-11, E-16

**Verifying tests:** [enterprise-identity.integration.test.ts:284](../../packages/db/test/enterprise-identity.integration.test.ts#L284); [contractor.test.ts:5](../../packages/core/src/contractor.test.ts#L5)

**Not done:** nothing further

### Q-09 When someone leaves, how soon does access end?

**Plain answer:** There is no SCIM: removal only in your identity provider does not remove the account in JobGuard. SAML sessions end within 15 minutes; next SAML sign-in replaces prior SAML sessions and unmapped grants. Unless “SSO required” is ON (default OFF), a SAML-linked account can still use emailed code. Administrator revocation takes effect on the next request.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-17b, E-17, E-12, E-12b, E-13, E-41

**Verifying tests:** [contractor.integration.test.ts:262](../../packages/db/test/contractor.integration.test.ts#L262); [auth.test.ts:92](../../apps/api/src/auth/auth.test.ts#L92); [enterprise-identity.integration.test.ts:383](../../packages/db/test/enterprise-identity.integration.test.ts#L383); [enterprise-identity.integration.test.ts:312](../../packages/db/test/enterprise-identity.integration.test.ts#L312); [enterprise-identity.integration.test.ts:182](../../packages/db/test/enterprise-identity.integration.test.ts#L182); [sso-required.integration.test.ts:84](../../packages/db/test/sso-required.integration.test.ts#L84)

**Not done:** E-52

Not claimed. Waits for automatic account provisioning and removal to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

### Q-10 How long does a session last, and how is its cookie protected?

**Plain answer:** SAML sessions last at most 15 minutes. Cookies use Secure (HTTPS only), HttpOnly (unavailable to page scripts) and SameSite strict (restricted across sites). Covered by named automated tests. The merged required-switch contract states emailed-code sessions last 24 hours; no cited test pins that number.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-13, E-14, E-14b

**Verifying tests:** [enterprise-identity.integration.test.ts:182](../../packages/db/test/enterprise-identity.integration.test.ts#L182); [action-paths.test.ts:272](../../apps/api/src/auth/sso/action-paths.test.ts#L272); [identity.test.ts:20](../../apps/api/src/auth/identity.test.ts#L20)

**Not done:** E-55

### Q-11 Is there multi-factor sign-in?

**Plain answer:** Not claimed. NOT EVIDENCED. An emailed code is a sign-in code; it is not described as a second factor.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-56

### Q-12 Is there emergency access if single sign-on is down?

**Plain answer:** No usable emergency route is claimed. A route exists but refuses every request until a founder decision supplies an approver. Its only possible effect is switching “SSO required” OFF; it issues no session. That effect is INTERIM. Refusal is covered by a named automated test; no green run or verdict is recorded on main.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-42

**Verifying tests:** [sso-emergency.integration.test.ts:90](../../packages/db/test/sso-emergency.integration.test.ts#L90)

**Not done:** E-54

Not claimed. Waits for usable emergency access to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

### Q-13 Does single sign-on work in mobile apps?

**Plain answer:** Not claimed. Native mobile sign-in is HELD for the native phase.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-57

Not claimed. Waits for native mobile sign-in to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

## B Roles inside the product

### Q-14 What roles exist, and how is access limited by team, branch, region or client?

**Plain answer:** Nine roles: owner, administrator, operative, supervisor, surveyor, commercial manager, finance, read-only and client approver. A permission-by-role-by-scope matrix is covered for every combination in pure code and again against PostgreSQL. Client approvers are limited to their client. Revoked memberships fail on the next request. Practice build only.

**Status:** in place (practice build)

**Merged control:** E-16, E-16b, E-17b

**Verifying tests:** [contractor.test.ts:5](../../packages/core/src/contractor.test.ts#L5); [contractor.integration.test.ts:106](../../packages/db/test/contractor.integration.test.ts#L106); [contractor.integration.test.ts:262](../../packages/db/test/contractor.integration.test.ts#L262)

**Not done:** nothing further

## C Keeping companies apart

### Q-15 How is one customer’s data kept apart from another’s?

**Plain answer:** Row-level security means the database filters reads and checks writes against the server’s company setting. It is forced on business tables; a catalogue test finds them automatically. Cross-company reads/writes and missing or malformed context fail. Covered by named automated tests. This does not protect against compromised identity credentials or a privileged database rewrite.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-18, E-19, E-19b, E-20b

**Verifying tests:** [tenancy.integration.test.ts:179](../../packages/db/test/tenancy.integration.test.ts#L179); [tenancy.integration.test.ts:76](../../packages/db/test/tenancy.integration.test.ts#L76); [tenancy.integration.test.ts:87](../../packages/db/test/tenancy.integration.test.ts#L87); [tenancy.integration.test.ts:141](../../packages/db/test/tenancy.integration.test.ts#L141)

**Not done:** E-58

### Q-16 What can the application’s database login not do?

**Plain answer:** The business runtime login is unprivileged: it cannot alter the row-security policy or change, delete or truncate audit rows. Covered by named automated tests. This limit does not cover the database owner login or compromise of the identity service.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-21, E-22

**Verifying tests:** [tenancy.integration.test.ts:383](../../packages/db/test/tenancy.integration.test.ts#L383); [audit.integration.test.ts:107](../../packages/db/test/audit.integration.test.ts#L107)

**Not done:** E-58

### Q-17 How does the application choose a request’s company?

**Plain answer:** From a current, non-revoked membership, checked after sign-in. A client company choice is a selection request, never authority. Only the server module can mint the original company context; copies are refused. Covered by named automated tests. Compromise of the identity service remains outside this protection.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-17, E-17c, E-20

**Verifying tests:** [auth.test.ts:92](../../apps/api/src/auth/auth.test.ts#L92); [auth.test.ts:82](../../apps/api/src/auth/auth.test.ts#L82); [tenant-context.test.ts:38](../../packages/db/src/tenant-context.test.ts#L38)

**Not done:** E-58

## D Records and evidence

### Q-18 Do you keep a tamper-evident record?

**Plain answer:** A per-company chain links entries by hashes calculated from their contents; it is append-only for the runtime login. Changes are detected against a trusted checkpoint: a saved chain position and hash. Covered by named automated tests. The database owner could replace the whole chain and its in-database checkpoints. No outside anchor or timestamp is built.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-22, E-23, E-24

**Verifying tests:** [audit.integration.test.ts:107](../../packages/db/test/audit.integration.test.ts#L107); [audit.integration.test.ts:85](../../packages/db/test/audit.integration.test.ts#L85); [audit.integration.test.ts:98](../../packages/db/test/audit.integration.test.ts#L98)

**Not done:** E-59, E-60

### Q-19 What personal data goes into that record?

**Plain answer:** Allowlisted identifiers and hashes only; no names, emails or free text. Covered by a named automated test. References and hashes can still be personal data and remain subject to access and retention policy. This does not establish a real-data retention policy.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-25

**Verifying tests:** [audit.integration.test.ts:107](../../packages/db/test/audit.integration.test.ts#L107)

**Not done:** E-63

### Q-20 Can we get our record out and check it without trusting you?

**Plain answer:** A signed single-company file has an offline checker. It detects alteration, omission, reordering, truncation and invalid signatures. A new per-export signing pair is made in memory and discarded. The signature shows integrity, not truthful work; obtain the public key through a trusted channel. No signer registry, rotation, revocation or long-term promise exists. Practice build only.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-26, E-26b, E-27, E-27b, E-28

**Verifying tests:** [audit-export.integration.test.ts:279](../../packages/db/test/audit-export.integration.test.ts#L279); [verify-audit-export-cli.test.ts:56](../../packages/db/test/verify-audit-export-cli.test.ts#L56); [verify-audit-export-cli.test.ts:61](../../packages/db/test/verify-audit-export-cli.test.ts#L61); [verify-audit-export-cli.test.ts:65](../../packages/db/test/verify-audit-export-cli.test.ts#L65); [verify-audit-export-cli.test.ts:44](../../packages/db/test/verify-audit-export-cli.test.ts#L44)

**Not done:** E-60

### Q-21 Who can create an export, and is it recorded?

**Plain answer:** Only current company-wide owners or administrators. Other authenticated roles are refused and the refusal is recorded; an unauthenticated request has no trusted company for that record. Each export adds an audit event; repeating its command creates one stored effect. Covered by named automated tests. Creation is refused outside practice mode.

**Status:** in place (practice build)

**Merged control:** E-29, E-30, E-31

**Verifying tests:** [audit-export.integration.test.ts:327](../../packages/db/test/audit-export.integration.test.ts#L327); [audit-export.integration.test.ts:319](../../packages/db/test/audit-export.integration.test.ts#L319); [audit-export.integration.test.ts:366](../../packages/db/test/audit-export.integration.test.ts#L366)

**Not done:** nothing further

### Q-22 How is an export’s checkpoint taken, and is there an outside timestamp?

**Plain answer:** A manual owner-run command takes and hands off each company’s checkpoint. Repeating it without new events writes nothing. A company created later needs another run before its first export. Covered by named automated tests; no green run or verdict recorded on main. No scheduled run or outside timestamp is built.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-32, E-32b

**Verifying tests:** [audit-checkpoint-handoff.test.ts:56](../../packages/db/src/audit-checkpoint-handoff.test.ts#L56); [audit-checkpoint-handoff.integration.test.ts:209](../../packages/db/test/audit-checkpoint-handoff.integration.test.ts#L209)

**Not done:** E-60

Not claimed. Waits for long-term export checking and signer lifecycle to merge to main with its own named test. This row does not change on the strength of a pull-request title, an order or a plan line.

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

**Plain answer:** Not claimed. NOT EVIDENCED: no incident runbook is merged. Incident ownership is a pre-pilot requirement; monitoring, alerts and buyer notification need operational evidence.

**Status:** not claimed

**Merged control:** none

**Verifying tests:** none — not claimed

**Not done:** E-65

## H How the software is built and changed

### Q-30 How is code tested and reviewed before acceptance?

**Plain answer:** Continuous integration (CI) runs typecheck, lint, tests, build and browser checks. Sign-in and export were reviewed by a different AI model (recorded in docs/verdicts), not a human or third-party review. Models were Claude Opus and Codex Sol. Builder receipts are not verdicts. Several database/browser tests ran later on the Mac or GitHub CI, outside the builder sandbox.

**Status:** in place for the named practice controls; not claimed for the Not done items

**Merged control:** E-33, E-33b, E-36, E-03, E-26

**Verifying tests:** [ci.yml:26](../../.github/workflows/ci.yml#L26); [ci.yml:31](../../.github/workflows/ci.yml#L31); [agent-lane-boundary.test.mjs:35](../../tools/agent-lane-boundary.test.mjs#L35); [saml.test.ts:72](../../apps/api/src/auth/sso/saml.test.ts#L72); [audit-export.integration.test.ts:279](../../packages/db/test/audit-export.integration.test.ts#L279)

**Not done:** E-69

### Q-31 Are exposed sensitive values and vulnerable dependencies scanned for?

**Plain answer:** CI scans each pull request and main push for exposed sensitive values, with two exact exceptions for made-up test names. A dependency audit fails on findings or lookup errors. Covered by a named automated test or workflow step. These checks do not establish absence of every weakness.

**Status:** in place (practice build)

**Merged control:** E-34, E-35

**Verifying tests:** [dependency-audit.test.mjs:8](../../tools/dependency-audit.test.mjs#L8); [ci.yml:37](../../.github/workflows/ci.yml#L37)

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

