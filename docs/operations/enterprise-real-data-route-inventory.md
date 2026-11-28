# Enterprise real-data route: inventory of made-up-data-only paths

**Piece:** Enterprise R1 plan B2, first half (work-list `EP-B2L`). **Date:** 28 November 2026. **Baseline:** `main` at `daaa927ca0184cf7d84ada4e79d49b632c98b2f6`.
**Status:** inventory only. No code was changed and no gate was opened. The follow-on build (B2, second half) is RED: tenant isolation, sign-in and real personal data.

The contractor product has only ever run in `synthetic_demo`. This document lists every place on the contractor paths where real data is refused, so that the reviewed real-data route can be designed once with nothing missed. It is not a flag change: opening real mode means reworking each row below, not flipping a setting.

## How this was built and what counts

A repo-wide search of `apps/` and `packages/` (tests, fixtures and comments excluded) for `synthetic_demo`, `synthetic`, `fictional`, `pilot_no_charge` and `.invalid` gave about 1,170 files. Of these, 286 sit on contractor, enterprise, site, operative, sign-in (SSO/OIDC/SCIM), connector, mobile, work-order, baseline, entitlement or invitation paths. Each hit there was read in context. Small-builder-only screens and services (practice bank, practice company, Northside small-builder practice, quote, final check, recovery, supplier credit) are out of scope unless contractor routes share them.

**Kind** says why a path refuses:

- **Gate:** deliberately written to keep real data out until approval, such as a mode check with an error code, an input schema that takes only `synthetic_demo`, a `.invalid` recipient rule (BUILD_PLAN §9.2: "All recipients use `.invalid`"), or a database CHECK or routine guard.
- **Incidental:** an assumption that the data is made up, such as a hard-wired fake adapter, fixed fixture values, a UI default, an output schema that stamps `synthetic_demo`, or a join that quietly drops pilot rows. These do not protect anything on their own, but each one breaks or hides real data once the gates open.

For the database, a script also read every migration in filename order, kept the latest `CREATE [OR REPLACE] FUNCTION` body for each routine, and flagged the 287 routines whose current body checks the demo database, `synthetic_demo`, `.invalid` or fictional values. Each one on a contractor path is listed below by routine name. The rest are small-builder routines (recovery, final check, subscriptions and meter, practice company and invoices, customer portal, privacy and retention, purchase orders, readiness plans, snags, sync snapshot) and are out of scope. Where a later migration replaces a database routine, only the definition now in force is listed, with what it supersedes. "Demo-DB check" means the routine refuses unless `current_database() = 'jobguard_synthetic_demo'`. "Synthetic track" means a join or check on `job_commercial_track.environment = 'synthetic_demo'`. That column already allows `pilot_no_charge` (migration 0053), so a synthetic-track join silently drops pilot contractor jobs rather than raising an error.

## 1. Central gates (configuration)

| Path:line | What it checks | What it refuses | Kind |
|---|---|---|---|
| `packages/config/src/enterprise-real-data.ts:25-32` | `requireEnterpriseRealData(mode, tenantId, rawEvidence)`: parses mode and an `enterprise-pilot-evidence.v1` record (tenant, agreement version, terms hash, signed pilot, DPA hash, contract-set hash, solicitor review, founder approval, G1 hash, D12 v4 and D16 v1 approved). It throws if the mode is invalid, the record fails to parse or the tenant differs, then runs `requireApprovedDecision` for D12 and D16. **After all of that it throws `EnterpriseRealDataDeniedError` unconditionally (line 31).** | Enterprise real data always, even with a complete, valid, approved record. Never called outside tests. | Gate |
| `packages/config/src/enterprise-real-data.ts:7-18` | Evidence schema: D12 `third_party_data_protection_policy_v4` and D16 `enterprise_site_capture_policy_v1`, status `approved`; signature, founder approval and solicitor review must bind the same terms hash, agreement version and contract set. | Evidence that does not bind the exact terms and policy versions. | Gate |
| `packages/config/src/policy-gates.ts:19` | `EnterpriseGate`: `enterprise_real_data`, `enterprise_fee_posting`, `enterprise_fee_collection`, `enterprise_ai_prompts`. | Through `requireApprovedDecision` (lines 29-40), any gate in `pilot_no_charge` or `production_billing` without a matching approved decision. In `synthetic_demo` and `provider_sandbox` the check returns at once. | Gate |
| `packages/config/src/policy-gates.ts:19` (uses) | Where each gate is passed outside tests: `enterprise_real_data` only at `enterprise-real-data.ts:29-30`; `enterprise_ai_prompts` appears only in an error message (`packages/ai/src/enterprise-ai-prompts.ts:92`); `enterprise_fee_posting` and `enterprise_fee_collection` are never passed. | No caller can open any of the four today. | Gate |
| `packages/config/src/connector-environment.ts:7-10` | `JOBGUARD_ENV` literal `synthetic_demo`; `CONNECTOR_ENDPOINT_KIND` literal `fake`; endpoint and credential refs must be `fixture:`. Used at `apps/api/src/connectors/inbound.ts:53`, `sftp.synthetic.ts:65`. | Any real connector endpoint or credential configuration. | Gate |
| `packages/config/src/connector-environment.ts:31,40` | `JOBGUARD_CONNECTOR_MACHINE` literal `synthetic`, plus mode check. | Machine-connector registration in real modes. | Gate |

## 2. Web server helpers (Next.js)

| Path:line | What it checks | What it refuses | Kind |
|---|---|---|---|
| `apps/web/app/lib/synthetic-server.ts:17` | `syntheticPool()` needs `JOBGUARD_ENV === "synthetic_demo"`. | The database pool for about 27 contractor, SSO and OIDC routes in any other mode (UNAUTHENTICATED). Also the only guard on the connector-promotion route. | Gate |
| `apps/web/app/lib/synthetic-server.ts:35` | `syntheticWorkspace()` mode check. | Workspace session outside `synthetic_demo`. | Gate |
| `apps/web/app/lib/workspace-server.ts:8` | `workspaceApplication()` mode check. | SoR versions, work-order imports, revisions, assignments, site visits, SoR items, order lines, audit exports. | Gate |
| `apps/web/app/lib/enterprise-dashboard-server.ts:11` | `enterpriseRequest` mode check. | Dashboard, baseline and baseline compare (MODE_FORBIDDEN 403). | Gate |
| `apps/web/app/lib/possible-extras-server.ts:15` | Mode check. | Possible-extras list, detail, confirm, dismiss. | Gate |
| `apps/web/app/lib/prompt-sources-server.ts:44` | Mode check. | Possible-extras materials, evaluate, observations. | Gate |
| `apps/web/app/lib/observation-evidence-server.ts:16` | Mode check. | Possible-extras evidence read. | Gate |
| `apps/web/app/lib/evidence-bundle-server.ts:11` | Mode check. | Evidence bundle check. | Gate |
| `apps/web/app/lib/evidence-bundle-server.ts:19` | Always wires `practiceStorage` (Northside practice photo storage, `northside-server.ts:58`). | Any real evidence store. | Incidental |
| `apps/web/app/lib/northside-server.ts:19` | `demoActor()` mode check on `/api/northside/*`. | The routes used by `site/extra/site-extra.tsx:46,77`, `extra-approval/.../client-approval.tsx:21`, `ui/enterprise-dashboard.tsx:83`, `ui/contractor-billing.tsx:187`. | Gate |
| `apps/web/app/lib/identity-server.ts:33` | `identityApplication()` refuses `pilot_no_charge`. | SSO, OIDC, SSO-required and emergency routes in pilot (PILOT_WEB_IDENTITY_TRANSPORT_UNAVAILABLE). | Gate |

## 3. Web routes and screens

| Path:line | What it checks | What it refuses | Kind |
|---|---|---|---|
| `apps/web/app/api/contractor/statements/[action]/route.ts:14` | Mode check. | All statement actions (SYNTHETIC_REFERENCE_FORBIDDEN). | Gate |
| `apps/web/app/api/contractor/jobs/[id]/office-signals/route.ts:15` | Mode check. | Office signals (403). | Gate |
| `apps/web/app/api/contractor/jobs/[id]/finish/route.ts:16` | Mode check. | Job finish end-check. | Gate |
| `apps/web/app/api/contractor/jobs/[id]/duplicate-candidates/transport.ts:10` | Mode check shared by candidates, unlinks, dispositions. | Duplicate handling. | Gate |
| `apps/web/app/api/contractor/jobs/[id]/billing/[action]/route.ts:12` | Mode check. | Billing export, import, delivery. | Gate |
| `apps/web/app/contractor/jobs/[id]/possible-extras/page.tsx:9` | Renders finish state only in `synthetic_demo`. | Finish controls in real modes (silently hidden). | Gate |
| `apps/web/app/api/auth/sso-required/emergency/route.ts:4` | Always 403. | Retired emergency switch, every mode. | Gate |
| `apps/web/app/api/auth/sso/[connectionId]/callback/route.ts:14` | Reply hard-codes `environment:'synthetic_demo'` (OIDC callback route line 11 likewise). | Correct labelling of a real sign-in. | Incidental |
| `apps/web/app/ui/work-order-imports.tsx:45` | Posts fixed `environment:"synthetic_demo"`, `source:{kind:"generated"}`. | Choosing a real file; only generated samples offered. | Incidental |
| `apps/web/app/admin/contractor/contractor-admin.tsx:45` | Default contract `reference:'FICTIONAL-CONTRACT'`, `vatCode:'synthetic-unreviewed'`. | Real contract reference and tax code. | Incidental |
| `apps/web/app/admin/contractor/contractor-admin.tsx:52,59` | Bootstrap and every command post `environment:"synthetic_demo"`. | Real-mode admin commands. | Incidental |
| `apps/web/app/admin/contractor/contractor-admin.tsx:73` | Invites hard-code `member-N@fictional.invalid`. | Typing a real invitee address. | Incidental |
| `apps/web/app/admin/contractor/identity/page.tsx:113` | Domain proof hard-coded `synthetic-domain:...`. | Real domain verification. | Incidental |
| `apps/web/app/admin/contractor/identity/page.tsx:158` | Rejects SSO-required state unless `environment==="synthetic_demo"`. | Real-mode SSO state. | Incidental |
| `apps/web/app/ui/contractor-billing.tsx:51` | Events `source:"northside-fictional"`, invoice `NS-INVOICE-1`. | Real billing status. | Incidental |
| `apps/web/app/ui/contractor-billing.tsx:112` | Default route `fake_download` to `client-billing.invalid`. | Real delivery route. | Incidental |
| `apps/web/app/ui/enterprise-dashboard.tsx:8,132` | Imports fixture `contractor-full-demo-package.v1.json`. | Real baseline source. | Incidental |
| `apps/web/app/ui/enterprise-dashboard.tsx:68,75,134` | `practiceTeamsV1` needs `seeded: z.literal(true)`; binds `fictional-pilot` / `fictional-rest` teams. | Real team bindings. | Incidental |
| `apps/web/app/ui/enterprise-statement.tsx:60` | Fixed "Fictional practice only ... No real money is collected" statement text. | Real statement wording. | Incidental |

## 4. API: contractor services

| Path:line | What it checks | What it refuses | Kind |
|---|---|---|---|
| `apps/api/src/contractor/contractor.application.ts:13` | `JOBGUARD_ENV !== "synthetic_demo"` on every start, read, resume, command. | Contractor organisation use (MODE_FORBIDDEN). | Gate |
| `apps/api/src/contractor/contractor.application.ts:6` | `startV1` needs `environment: z.literal("synthetic_demo")`. | Non-synthetic start body. | Gate |
| `apps/api/src/contractor/work-order.application.ts:16` | Mode gate on all work-order and SoR calls. | Imports, batches, revisions, SoR versions. | Gate |
| `apps/api/src/contractor/work-order.application.ts:30` | `source.kind !== "generated"` → UPLOAD_NOT_ALLOWED. `importFile` (line 39) exists but no route uses it. | Uploading a real work-order file. | Gate |
| `apps/api/src/contractor/scheduling.application.ts:12` | Mode gate. | Assignments and site visits. | Gate |
| `apps/api/src/contractor/enterprise-baseline.application.ts:28` | Mode → BASELINE_REAL_HISTORY_HELD. | Baseline from real history. | Gate |
| `apps/api/src/contractor/enterprise-baseline.application.ts:46` | Mode gate. | Stored baseline import and read. | Gate |
| `apps/api/src/contractor/enterprise-dashboard.application.ts:18` | Mode gate. | Dashboard reads. | Gate |
| `apps/api/src/contractor/full-demo-package.application.ts:27,42` | Mode gate; line 45 hard-codes `"synthetic_demo"` into baseline preparation. | Full package read and preparation. | Gate |
| `apps/api/src/contractor/contractor-parties.application.ts:10` | Mode gate. | Customer linking, resident reads. | Gate |
| `apps/api/src/contractor/contractor-practice-session.application.ts:6` | `assertContractorPracticeSessionMode`. | Session revoke. | Gate |
| `apps/api/src/contractor/practice-worker-switch.application.ts:7` | `assertPracticeWorkerSwitchMode`. | Acting-as routes. | Gate |
| `apps/api/src/contractor/enterprise-live-prompt.application.ts:15` | Mode gate. | Live-prompt evaluation. | Gate |
| `apps/api/src/contractor/site-extra.application.ts:12` | `assertSiteExtraMode`, called at 38, 54, 83, 241. | Site extras, SoR extras, site visits, assigned jobs, order lines, proceed, supervisor queries. | Gate |
| `apps/api/src/contractor/billing.application.ts:25` | Mode gate in `resolveContext`. | All contractor billing. | Gate |
| `apps/api/src/contractor/billing.application.ts:14-15` | Delivery adapters hard-wired to `createSyntheticBillingAdapter`. | Any real delivery channel. | Incidental |
| `apps/api/src/contractor/billing.adapters.ts:5-6,12` | Settings `mode: z.literal("synthetic_demo")`, `fake_*` channels; recipient must end `.invalid`. | Real adapter settings and recipients. | Gate |
| `apps/api/src/contractor/enterprise-fee.executor.ts:16-17,27` | `production_billing` → SYNTHETIC_REFERENCE_FORBIDDEN; other non-synthetic → FEE_GATE_CLOSED; then `refuseEnterpriseFeeExecution`. | Fee accrue, collect, invoice in every mode. | Gate |
| `apps/api/src/native-capture-upload.application.ts:31` | `transfer` refuses unless enabled and `JOBGUARD_ENV === "synthetic_demo"` (DISABLED). | Operative photo and voice uploads from the native app. | Gate |
| `apps/api/src/native-capture-upload.application.ts:42` | Job must be on the synthetic track (and contractor `extra.log` permission). | Uploads to pilot or real contractor jobs. | Gate |
| `apps/api/src/audit-export/audit-export.application.ts:7` | `assertAuditExportMode` (used by `admin/contractor/audit-exports` route lines 10, 14). | Audit exports (AUDIT_EXPORT_MODE_HELD). | Gate |
| `apps/api/src/evidence-bundle.application.ts:28` | SQL demo-DB check. | Bundle checks on a real database. | Gate |
| `apps/api/src/site-day-summary.application.ts:16-18` | G1 pilot check, then `!== "synthetic_demo"` → SYNTHETIC_MODE_REQUIRED. | Site-day summaries in pilot or production. | Gate |
| `apps/api/src/plan-entitlements.authority.ts:15` | Mode → ENTITLEMENT_UNAVAILABLE. | Company entitlement decisions. | Gate |
| `apps/api/src/plan-entitlements.application.ts:21,25` | Default enablement reader returns `synthetic_demo` with `enabled: []`. | Enabling any feature without an injected reader. | Gate |
| `apps/api/src/production-settlement-guard.ts:57,71-73` | Only synthetic passes; otherwise `eligible: false`. | Settlement, accrual, collection in pilot or production. | Gate |

## 5. API: sign-in, invitations and identity email

| Path:line | What it checks | What it refuses | Kind |
|---|---|---|---|
| `apps/api/src/auth/sso/sso.contracts.ts:39-42` | `requireSyntheticSso`: D04 approval first, then mode `synthetic_demo` and provider `in-process-test-idp`. | All SAML, SCIM, SSO-required and enterprise-access routes in real modes or with a real identity provider (SSO_ROUTE_BLOCKED). | Gate |
| `apps/api/src/auth/sso/sso.contracts.ts:9` | `domain.verify` domain must end `.invalid`. | Verifying a real company email domain. | Gate |
| `apps/api/src/auth/sso/sso.contracts.ts:24-25,31` | Data-flow and metadata literals `in-process-test-idp`, `synthetic_demo`. | Stored SAML connections for a real provider. | Gate |
| `apps/api/src/auth/sso/sso.application.ts:45` | `gate()` → `requireSyntheticSso`, called at 55, 63, 77, 113, 148. | SAML admin, view, start, callback, worker checks. | Gate |
| `apps/api/src/auth/sso/sso.application.ts:50` | Entity IDs and URLs must equal `syntheticSsoMetadata`. | Real provider entity IDs and entry points. | Incidental |
| `apps/api/src/auth/sso/sso.application.ts:69` | `connection.create` always builds `syntheticSsoMetadata`. | Configuring real provider metadata. | Incidental |
| `apps/api/src/auth/sso/oidc.application.ts:26` | `guarded()`: `mode !== "synthetic_demo"` → OidcError. | All OIDC admin, start, callback in real modes. | Gate |
| `apps/api/src/auth/sso/oidc.application.ts:24` | `configuredIssuer()` throws when no issuer is injected. | Every OIDC sign-in; deployed composition injects none, so OIDC refuses in every mode, synthetic included (test issuers are injected only by tests). | Gate |
| `apps/api/src/workspace/application.ts:75` | Builds `OidcApplication` without an issuer. | As above, in deployed composition. | Gate |
| `apps/api/src/auth/sso/oidc.contracts.ts:4-7` | `fictionalUrl`: issuer and redirect hosts must end `.invalid`. | Real issuer and redirect URLs. | Gate |
| `apps/api/src/auth/sso/oidc.contracts.ts:11` | `mode` literal `synthetic_demo`, provider `in-process-test-idp`. | Real OIDC configuration. | Gate |
| `apps/api/src/auth/sso/oidc.contracts.ts:24` | Claim email must be `@….invalid`. | Real user emails from a provider. | Gate |
| `apps/api/src/auth/sso/oidc-persistence.contracts.ts:8` | Issuer, client ID, redirect fixed to `issuer.invalid` / `jobguard-practice` / `app.invalid`. | Any other OIDC registration. | Incidental |
| `apps/api/src/auth/sso/sso-required.application.ts:24` | `gate()` → `requireSyntheticSso`, called at 28, 40, 52, 77, 84, 102, 111. | SSO-required view, detail, command, emergency. | Gate |
| `apps/api/src/auth/sso/sso-required.controller.ts:34` | Emergency route always 403. | Emergency SSO bypass via the API. | Gate |
| `apps/api/src/auth/sso/scim.application.ts:14-15` | `requireSyntheticSso` → SCIM_ROUTE_BLOCKED. | SCIM deactivation in real modes. | Gate |
| `apps/api/src/auth/sso/scim.contracts.ts:6` | SCIM deactivation result env literal. | Results from a real environment. | Incidental |
| `apps/api/src/auth/sso/scim.application.ts:16` | Needs `JOBGUARD_SCIM_SYNTHETIC_SEED` (wired at `workspace/application.ts:78`). | SCIM without the synthetic seed. | Incidental |
| `apps/api/src/auth/sso/enterprise-access.application.ts:10` | `gate()`, called at 21, 25, 31. | Emergency access, SCIM2 config and requests. | Gate |
| `apps/api/src/auth/sso/enterprise-access.http.ts:17` | `requireSyntheticSso` before composing (emergency-actions route casts mode at line 7). | SCIM2 and emergency owner actions in real modes. | Gate |
| `apps/api/src/auth/sso/enterprise-access.contracts.ts:13` | SCIM2 `userName` must end `.invalid`. | Provisioning real users. | Gate |
| `apps/api/src/auth/identity-email.ts:22` | `FixtureIdentityEmail`: mode `synthetic_demo` and recipient `.invalid` ("D04 not approved"). | Sign-in, sign-up, invitation and emergency emails to real addresses, pilot included. | Gate |
| `apps/api/src/auth/identity-email.ts:7,26` | `identityEmailV1` `environment: z.literal("synthetic_demo")`. | Delivering pilot challenges. | Incidental |
| `apps/api/src/auth/persisted-auth-provider.ts:16` | Default email adapter is `FixtureIdentityEmail`; composition (`identity.application.ts:96`) passes none. | Any real email transport. | Incidental |
| `apps/api/src/auth/persisted-auth-provider.ts:25-27` | `assertRecipient` (G1 for pilot plus fixture rule), used at 35, 72, 169. | Codes requested, verified or emergency-proved for real addresses. | Gate |
| `apps/api/src/auth/identity.application.ts:78` | `invite()` → `assertRecipient`. | `POST /auth/invitations` with real addresses. | Gate |
| `apps/api/src/auth/customer-signin.ts:39-41` | Client and customer sign-in accepts only `synthetic_demo` or `pilot_no_charge`. Shared by the small-builder customer portal and **contractor client approval links**. | Client sign-in in any other mode. | Gate |
| `apps/api/src/auth/customer-signin.ts:63-64,73-74` | Outside pilot, sign-in and session use try `identity.extra_customer_use` (contractor client approval) and then `customer_portal_use`. In pilot they call **only** `customer_portal_use`. | In pilot, a contractor client cannot sign in or use an approval link at all; only the small-builder portal is reachable. | Gate |
| `apps/api/src/auth/mobile-auth.application.ts:157` | Enabled, mode `synthetic_demo`, source is `MemoryAuthProvider`. | Mobile auth with persisted or real identity, or in real modes. | Gate |

## 6. API: connectors

| Path:line | What it checks | What it refuses | Kind |
|---|---|---|---|
| `apps/api/src/connectors/machine-management.ts:24` | Mode gate. | Machine connector provision, widen, rotate, revoke. | Gate |
| `apps/api/src/connectors/machine-management.ts:7,11-14` | Client contract, namespace, key ref must be `fixture:…`. | Real contract and key references. | Incidental |
| `apps/api/src/connectors/machine.ts:6,9,16` | Authority and request `environment: z.literal("synthetic_demo")`, fixture refs. | Signed machine intake from real environments. | Gate |
| `apps/api/src/connectors/machine.module.ts:39` | `FakeMachineSecretStore` used unconditionally (`app.module.ts:105` passes empty maps). | A real secret store. | Incidental |
| `apps/api/src/connectors/inbound.ts:8,11-17` | Event, subject, document must be `fixture:…`. | Real inbound work-order, materials, billing events. | Incidental |
| `apps/api/src/connectors/sftp.stage.ts:9-11` | Subject and document `fixture:…`; pull must be `sftp-fixture-pull`. | Staging real SFTP pulls. | Incidental |
| `apps/api/src/connectors/conformance-kit.ts:11,17-18` | Capability report allows only `synthetic_only` or `unavailable` for every connector capability. | Reporting any capability as live. | Incidental |
| `apps/api/src/connectors/promotion.application.ts:11` | Mode gate. | Promoting staged connector records. | Gate |
| `apps/api/src/messaging-observation-connector.ts:8,20-21` | Fixture env literal; `readMessagingConnector` always throws DISABLED. | Any real SMS or chat connector. | Gate |
| `apps/api/src/accounting-observation-connector.ts:9,21-22` | Fixture env literal; `readAccountingConnector` always throws DISABLED. | Any real accounting connector. | Gate |
| `apps/api/src/email-forwarding.connector.ts:11-12,42` | Config must be `synthetic_demo` / fixture / enabled, else EMAIL_FORWARDING_DISABLED. | Real email forwarding. | Gate |
| `apps/api/src/email-forwarding.connector.ts:18` | Original text must equal one fixed sentence. | Any real forwarded email. | Incidental |

## 7. Core domain schemas (`packages/core`)

| Path:line | What it checks | What it refuses | Kind |
|---|---|---|---|
| `packages/core/src/contractor.ts:60` | **Synthetic tax label:** client contract `vatCode: z.literal("synthetic-unreviewed")`. Plan piece COM-3 replaces it with the reviewed D02 treatment. | Any real VAT or tax code on a contractor contract. | Gate |
| `packages/core/src/contractor.ts:62` | Contractor command base `environment: z.literal("synthetic_demo")`. | Every contractor admin command in real mode. | Gate |
| `packages/core/src/contractor.ts:66` | `member.invite` email `.endsWith(".invalid")`. | Inviting contractor members with real addresses. | Gate |
| `packages/core/src/contractor.ts:95,98` | Workspace view env literal; member emails `.endsWith(".invalid")`. | Reading a workspace with real members. | Incidental |
| `packages/core/src/contractor-entitlement-authority.ts:7` | Authority `environment: z.literal("synthetic_demo")`. | Entitlement authority from pilot or real environments. | Gate |
| `packages/core/src/contractor-entitlement-authority.ts:9` | `agreementReference` must match `^synthetic-agreement:<uuid>$`. | Real commercial agreement references. | Gate |
| `packages/core/src/contractor-entitlement-authority.ts:13` | Enablement env literal `synthetic_demo`. | Feature enablement outside the demo. | Gate |
| `packages/core/src/plan-entitlements.ts:26,45` | Enablement and decision env literals (parsed at 74). | Real plan enablement and decisions. | Gate |
| `packages/core/src/contractor-parties.ts:7` | Party and resident email `.endsWith(".invalid")`. | Real client and resident contacts. | Gate |
| `packages/core/src/contractor-parties.ts:26,29,44` | Customer-link, party-import, resident-read env literals. | Real customer links, party imports, resident reads. | Gate |
| `packages/core/src/contractor-parties.ts:41,48` | Result and audit-ref env literals. | Results from a real environment. | Incidental |
| `packages/core/src/contractor-practice-session.ts:6` | Revoked-session result env literal. | Revocation result outside the demo. | Incidental |
| `packages/core/src/practice-worker-switch.ts:19` | Worker-switch `environment: z.literal("synthetic_demo")`. | Acting-as commands outside the demo. | Gate |
| `packages/core/src/contractor-billing.ts:89-90` | Delivery channel `fake_download` / `fake_sftp` / `fake_api`; destination must end `.invalid`. | Real delivery channels and destinations. | Gate |
| `packages/core/src/contractor-billing-commands.ts:6` | Approve-delivery: fake channels, `.invalid` destination. | Real delivery approval. | Gate |
| `packages/core/src/contractor-billing.ts:188,253` | Export needs `sandboxLabel` literal; CSV import needs the sandbox label column. | Real exports and real billing CSV rows. | Gate |
| `packages/core/src/contractor-fee-mandate.ts:34,46` | Mandate record and check env literals. | Real fee mandates. | Gate |
| `packages/core/src/contractor-mandate.ts:35` | Mandate reference `mode: z.literal("synthetic_demo")`. | Real mandate state. | Gate |
| `packages/core/src/enterprise-fee-statement.ts:67,111` | Reference statement mode `synthetic_demo` or `pilot_no_charge`; fixed "Illustration — no charge" labels, `postingAuthorized:false`. | Production statements and real charge wording. | Gate |
| `packages/core/src/enterprise-fee-statement.ts:216` | `refuseEnterpriseFeeExecution` always throws. | Accrue, collect, invoice in every mode. | Gate |
| `packages/core/src/enterprise-baseline.ts:18` | Baseline history env literal. | Real baseline history. | Gate |
| `packages/core/src/enterprise-signal.ts:17` | Outlier policy literal `synthetic-closeout-rule.v1`. | Any real outlier policy. | Incidental |
| `packages/core/src/enterprise-live-prompt-contracts.ts:30` | Completion input env literal. | Real completion input. | Gate |
| `packages/core/src/work-order.ts:197` | Import request env literal. | Real work-order imports. | Gate |
| `packages/core/src/work-order.ts:103,110,115,210,217,225,237,241` | Audit payload and projection env literals. | Real audit payloads and projections. | Incidental |
| `packages/core/src/sor-pricing.ts:46` | SoR import env literal. | Real schedule-of-rates imports. | Gate |
| `packages/core/src/site-visit.ts:20` | Shared result head `environment: synthetic_demo, realExternalActions: 0`. | All site-visit results outside the demo. | Incidental |
| `packages/core/src/site-extra.ts:6`; `site-extra-evidence.ts:45`; `site-extra-pricing.ts:122` | Result env literals. | Real site-extra, evidence, pricing, order-check, supervisor results. | Incidental |
| `packages/core/src/extra-client-approval.ts:7` | Client approver recipient must end `.invalid`. | Real client approvers. | Gate |
| `packages/core/src/operative-view-models.ts:44,69,94` | Operative plans emit `synthetic_demo`. | Output only; breaks downstream literal parsing. | Incidental |
| `packages/core/src/merchant-connectors.ts:13-14,38,48,57,69` | `environment !== "synthetic_demo"` → MERCHANT_LIVE_DISABLED; `fictional-merchant`, `fictional-account`; mail alias `materials@fictional-builder.invalid`. | Live merchants, accounts, feeds, mail aliases. | Gate |
| `packages/core/src/mobile-auth.ts:6,27,37`; `mobile-auth-state.ts:16` | Policy `fictional_mobile_auth_policy_v1`; policy, lease and state env literals. | Real mobile auth policy, leases and state. | Gate |
| `packages/core/src/mobile-device-lifecycle.ts:6,37` | Typed env `"synthetic_demo"` (type level only). | Real device inputs at compile time. | Incidental |

## 8. Database repositories (`packages/db/src`)

| Path:line | What it checks | What it refuses | Kind |
|---|---|---|---|
| `packages/db/src/contractor-session-context.ts:43` | `JOBGUARD_ENV !== "synthetic_demo"` → MODE_FORBIDDEN. | Every contractor session, and so every contractor repository call. | Gate |
| `packages/db/src/enterprise-dashboard-repository.ts:24` | `readBilling` mode check. | Dashboard billing reads. | Gate |
| `packages/db/src/enterprise-dashboard-repository.ts:41` | `read` mode check. | Dashboard reads. | Gate |
| `packages/db/src/enterprise-dashboard-queries.ts:9` | SQL demo-DB check. | Returns no actor (empty) on a real database. | Gate |
| `packages/db/src/enterprise-dashboard-queries.ts:27` | Synthetic-track join. | Pilot contractor jobs silently left out. | Incidental |
| `packages/db/src/contractor-entitlement-authority-repository.ts:12` | Hard-codes enablement env `synthetic_demo`. | Cannot express a real enablement. | Incidental |
| `packages/db/src/enterprise-fee-repository.ts:65` | `productionCommand` always throws FEE_GATE_CLOSED. | Every production fee command. | Gate |
| `packages/db/src/enterprise-fee-repository.ts:153-154` | `simulateInvoice` refuses `production_billing`, then any non-`synthetic_demo`. | Invoice simulation in production or pilot. | Gate |
| `packages/db/src/enterprise-baseline-repository.ts:16` | Mode check. | Baseline import and read. | Gate |
| `packages/db/src/imported-baseline-sources.ts:26` | Mode → SYNTHETIC_MODE_REQUIRED. | Imported baseline reads. | Gate |
| `packages/db/src/enterprise-live-prompt-source-reader.ts:16` | Reads `app.synthetic_evidence_original` with env `synthetic_demo`. | Real completion photos (none found). | Incidental |
| `packages/db/src/connector-promotion-repository.ts:93` | Looks up `demo.operative@fictional.invalid`. | Promotion where that fixture operative is absent. | Incidental |
| `packages/db/src/site-visit-repository.ts:319` | Operative assigned-work query joins synthetic track. | Pilot contractor jobs left out of operative work lists. | Incidental |
| `packages/db/src/enterprise-identity-repository.ts:49` | `requireLinkSession` needs `identity.session.environment='synthetic_demo'`. | Linking an SSO identity from a pilot session. | Gate |
| `packages/db/src/audit-export-repository.ts:121` | Mode → AUDIT_EXPORT_MODE_HELD. | Contractor audit exports at the repository. | Gate |
| `packages/db/src/signed-evidence-export-store.ts:28` | Mode → SIGNED_EXPORT_MODE_HELD. | Signed evidence export storage. | Gate |
| `packages/db/src/extra-evidence-pack-writer.ts:23` | Mode → EXTRA_PACK_FORBIDDEN (exported, no app caller yet). | Writing site-extra evidence packs. | Gate |
| `packages/db/src/evidence-bundle-sources.ts:76` | SQL demo-DB check. | Bundle sources on a real database. | Gate |
| `packages/db/src/resumable-evidence.ts:51` | Resumable upload access needs the job on the synthetic track. | Resumable evidence uploads for pilot or real jobs. | Gate |
| `packages/db/src/sso-required-repository.ts:8,12` | State and detail env literals. | Parsing real SSO state. | Incidental |
| `packages/db/src/mobile-auth-store.ts:14-15,21` | Reads and writes only the `synthetic_demo` row. | Non-demo mobile auth state. | Incidental |
| `packages/db/src/tenant-key-registry.ts:28,31` | `NODE_ENV !== production`; DB must be `jobguard_synthetic_demo`. | Tenant keys on real databases. | Gate |

## 9. Database constraints and routines now in force (`packages/db/migrations`)

| Path:line | What it checks | What it refuses | Kind |
|---|---|---|---|
| `0054_contractor_organisation.sql:6-7` | `commercial_track_assignment`: `agreement_reference ~ '^synthetic-agreement:'`, `environment='synthetic_demo'`. | Real agreement references and pilot track assignments. | Gate |
| `0054_contractor_organisation.sql:41` | `contractor_member.email LIKE '%.invalid'`. | Real member emails. | Gate |
| `0054_contractor_organisation.sql:135` | `assign_commercial_track` demo-DB check. | Assigning a track outside the demo. | Gate |
| `0054_contractor_organisation.sql:354,369` | `valid_client_contract`: `vatCode = 'synthetic-unreviewed'` (synthetic tax label at the database). | Contract rows with real VAT codes. | Gate |
| `0749_lp6d_remaining_routines.sql:2514,2620` | `contractor_admin_command`: DB and payload env `synthetic_demo`; `vatCode` check (supersedes 0054, 0138, 0549, 0695, 0696). | All contractor admin commands outside the demo; real VAT codes. | Gate |
| `0765_lp11_bound_tenant_rls.sql:171` | `start_contractor_practice` demo-DB check (supersedes 0054, 0138, 0749). | Starting a contractor workspace. | Gate |
| `0765_lp11_bound_tenant_rls.sql:593,599,605` | `lp6_session_authority` practice and contractor-practice branches need the demo DB. | Contractor practice sessions outside the demo. | Gate |
| `0765_lp11_bound_tenant_rls.sql:730` | `lp6d_refused_contractor_principal` returns nothing unless demo DB. | Contractor principal resolution. | Gate |
| `0165_practice_worker_switch.sql:12,22` | Worker-switch tables `CHECK(environment='synthetic_demo')`. | Acting-as rows outside the demo. | Gate |
| `0620_contractor_job_finish.sql:66` | Job finish reads the agreement with `environment='synthetic_demo'`. | Real agreements (none matched), so the end-of-job check setting is lost. | Incidental |
| `0138_practice_session_hardening.sql:20` | `contractor_practice_home_deadline` needs `environment='synthetic_demo'`. | Sessions homed on non-demo practice sessions. | Incidental |
| `0198_contractor_entitlement_authority.sql:7,9` | Agreement status `environment='synthetic_demo'`; `fictional_source ~ '^fictional-fixture:'`. | Real agreement status rows. | Gate |
| `0198_contractor_entitlement_authority.sql:38` | `mon8_contractor_agreement_context` demo-DB check. | Entitlement reads. | Gate |
| `0548_server_plan_entitlements.sql:69` | `mon8_agreement_status_guard` trigger demo-DB check (supersedes 0198:23). | Agreement status inserts. | Gate |
| `0548_server_plan_entitlements.sql:95` | `mon8_retained_fee_actor` demo-DB check, FEE_GATE_CLOSED. | Retained fee reads. | Gate |
| `0749_lp6d_remaining_routines.sql:4694` | `mon8_retained_baseline_actor` demo-DB check. | Retained baseline reads. | Gate |
| `0749_lp6d_remaining_routines.sql:6954,7005,7136,7204` | `mon8_feature_decision`, `lp6d_mon8_feature_decision`, `mon8_sso_feature_decision`, `lp6d_sso_operative_roles_decision` demo-DB checks. | Plan, feature, SSO and operative-role entitlements. | Gate |
| `0549_contractor_feature_guards.sql:761` | `mon8_require_operative_agreement` demo-DB check. | Operative writes. | Gate |
| `0556_mon8_job_track_and_trial.sql:15` | `mon8_company_feature` needs synthetic track. | Pilot jobs treated as not entitled. | Incidental |
| `0102_contractor_parties.sql:55,61` | `valid_contractor_resident`: email `LIKE '%.invalid'`. | Storing real resident contacts. | Gate |
| `0749_lp6d_remaining_routines.sql:255,300,377` | `link_contractor_customer`, `bind_contractor_parties`, `read_contractor_resident` demo-DB and payload env checks. | Customer linking, party binding, resident reads. | Gate |
| `0243_contractor_billing.sql:254` | `cb_export` needs the synthetic sandbox label. | Real exports. | Gate |
| `0727_billing_export_delivery_once.sql:13` | `cb_delivery`: fake channel, `.invalid` destination (supersedes 0243:533). | Real billing delivery. | Gate |
| `0549_contractor_feature_guards.sql:634,659,663` | `cb_authority` demo-DB check and synthetic track. | All contractor billing; pilot jobs. | Gate |
| `0276_enterprise_fee_derivation.sql:14` | `enterprise_agreement_version.environment='synthetic_demo'`. | Real enterprise agreement versions. | Gate |
| `0276_enterprise_fee_derivation.sql:67` | `ef_immutable` trigger demo-DB check. | Fee table writes. | Gate |
| `0298_enterprise_fee_posting.sql:13` | `platform_enterprise_fee.environment='synthetic_demo'`. | Real platform fee rows. | Gate |
| `0520_lp4_database_audit.sql:603` | `ef_derive` demo-DB check. | Fee derivation. | Gate |
| `0520_lp4_database_audit.sql:737` | `ef_reconcile_exported_duplicate` needs synthetic track. | Reconciling real jobs (NOT_FOUND). | Incidental |
| `0602_enterprise_fee_production_safety.sql:9` | `ef_production_command` raises FEE_GATE_CLOSED unconditionally. | Production fee commands. | Gate |
| `0602_enterprise_fee_production_safety.sql:52,58` | `ef_posting_integrity` demo-DB check; `environment<>'synthetic_demo'` refused. | Real fee postings. | Gate |
| `0290_enterprise_fee_statement.sql:156,184` | `ef_dispute_statement`, `ef_approve_statement` demo-DB checks. | Statement disputes and approvals. | Gate |
| `0704_enterprise_fee_period_order.sql:8,53` | `ef_prepare_statement`, `ef_post_statement` demo-DB checks. | Preparing and posting statements. | Gate |
| `0745_enterprise_fee_rejected_line.sql:33` | `ef_inputs` synthetic-track join. | Pilot jobs left out of fee inputs. | Incidental |
| `0762_northside_hosted_agreement.sql:88,99` | `ef_derive_northside` demo-DB check; `agreement_ref 'northside-fictional:'`. | Hosted derivation outside the demo. | Gate |
| `0296_enterprise_baseline.sql:13` | Batch `history->>'environment'='synthetic_demo'`. | Real baseline batches. | Gate |
| `0749_lp6d_remaining_routines.sql:2673` | `enterprise_baseline_import` env check. | Real baseline imports. | Gate |
| `0196_enterprise_live_prompts.sql:9` | `extra_prompt_rule_settings.environment='synthetic_demo'`. | Real prompt rule settings. | Gate |
| `0749_lp6d_remaining_routines.sql:1352,1377,1639` | `lp_authority` demo-DB check and synthetic track; `lp_visit_evaluate` demo-DB check. | Live prompts and visit evaluation; pilot jobs. | Gate |
| `0749_lp6d_remaining_routines.sql:1483` | `lp_command` picks agreement `environment='synthetic_demo'`. | Real agreements (none matched). | Incidental |
| `0749_lp6d_remaining_routines.sql:403,432,517,549` | `work_order_begin`, `work_order_commit`, `import_batch_record`, `import_sor_version` demo-DB and payload checks. | Work-order and SoR imports. | Gate |
| `0749_lp6d_remaining_routines.sql:754,793,3370,2891` | `ent3b_start_visit`, `ent3b_complete_visit`, `ent3b_close_abandoned_visit`, `lp5b_contractor_permission` demo-DB checks. | Site visits. | Gate |
| `0749_lp6d_remaining_routines.sql:3461` | `ent3a_extra_authority` needs synthetic track. | Site extras on pilot jobs. | Incidental |
| `0749_lp6d_remaining_routines.sql:3534,3543` | `xa_begin` demo-DB check and synthetic track. | Site-extra commands. | Gate |
| `0749_lp6d_remaining_routines.sql:834,5450,5524,5577` | `ent3c_record_sor_revision`, `ent3_supervisor_query` (supersedes 0573:34), `ent3_work_status`, `ent3_proceed_comparison` demo-DB checks. | SoR revisions, supervisor queries, work status, proceed comparison. | Gate |
| `0749_lp6d_remaining_routines.sql:6113` | `ent3_extra_work_status` returns rows only on the demo DB. | NULL status on a real database. | Gate |
| `0765_lp11_bound_tenant_rls.sql:5824` | `identity.extra_customer_use` demo-DB check. | Contractor client sign-in and session use (approval links). | Gate |
| `0765_lp11_bound_tenant_rls.sql:5584` | `app.lp11_open_extra_customer` demo-DB check. | Opening a client approval scope. | Gate |
| `0765_lp11_bound_tenant_rls.sql:5926-5927` | `identity.extra_customer_approval` has no check of its own. It raises CUSTOMER_REFUSED unless the guarded `app.lp11_open_extra_customer` and `identity.extra_customer_use` both succeed, and both refuse outside the demo DB (rows above). | Client approve and reject decisions on a real database, through those two routines. | Gate |
| `0749_lp6d_remaining_routines.sql:1226` | `app.xa_client_decide` raises PERMISSION_DENIED unless `app.lp6d_xc_link_current` is true, which needs the demo DB (row below). The demo check is delegated. | Client decisions on a real database. | Gate |
| `0749_lp6d_remaining_routines.sql:1283,7631` | `app.xa_client_view_authority` and `app.lp6d_client_view_authority` demo-DB checks. | Client approval views. | Gate |
| `0686_extra_client_authority_loss.sql:13`; `0749_lp6d_remaining_routines.sql:7548` | `app.xc_link_current` and `app.lp6d_xc_link_current` treat a client link as current only on the demo DB. | Every client link on a real database (treated as not current). | Gate |
| `0765_lp11_bound_tenant_rls.sql:5998` | `app.xc_cancel_authority_loss` returns false unless demo DB. | Cancelling client approvals when the client loses authority. | Gate |
| `0760_extra_proceed_raiser_authority.sql:9` | `app.xa_proceed` demo-DB check. | Operatives recording a decision to proceed. | Gate |
| `0634_extra_proceed_statement.sql:97` | `app.xa_proceed_breaches` filters on the demo DB, so on a real database it returns an empty list. It is used at `0681_extra_client_timing_proceed.sql:22`. | Finding proceed-statement breaches on a real database. Effect on callers not verified. | Gate |
| `0749_lp6d_remaining_routines.sql:3211` | `app.xa_escalate` demo-DB check. | Approval escalation. | Gate |
| `0765_lp11_bound_tenant_rls.sql:6144,6179` | `app.lp6d_xa_escalate` and `app.lp6d_escalate_overdue_worker` demo-DB checks. | Escalating ordinary overdue approvals (worker). | Gate |
| `0765_lp11_bound_tenant_rls.sql:6055,6111` | `app.lp11_open_extra_escalation` and `infrastructure.discover_extra_escalations` demo-DB checks. | Finding and opening overdue approvals. | Gate |
| `0623_extra_duplicate_disposition.sql:69`; `0729_duplicate_disposition_command_lifecycle.sql:16` | `app.extra_duplicate_candidates` and `app.extra_duplicate_resolve` demo-DB checks. | Duplicate-extra candidates and resolution. | Gate |
| `0744_extra_pack_source_bijection.sql:8` | `app.store_extra_pack_artifact` demo-DB check. | Storing site-extra evidence packs. | Gate |
| `0765_lp11_bound_tenant_rls.sql:6315,6334,6347` | `app.lp11_record_visit_refusal` has a demo-DB check (6315) and reads only `synthetic_demo` sessions (6334). It **stamps** `environment:'synthetic_demo'` into the audit references (6347). | Recording a refused site visit outside the demo. | Gate |
| `0765_lp11_bound_tenant_rls.sql:6288` | `app.lp11_visit_refusal_event` **validates** that audit references carry `environment='synthetic_demo'`. The audit row-level-security policy uses it (USING and WITH CHECK at 6296, 6298). | Writing or reading refused-visit audit rows whose references carry any other environment. | Gate |
| `0749_lp6d_remaining_routines.sql:1676` | `app.lp_sources` emits `enterprise-completion-input.v1` with `synthetic_demo`. | Real completion inputs (the core schema refuses them). | Incidental |
| `0200_contractor_retained_workspace.sql:66` | `app.mon8_retained_contractor_workspace` emits `synthetic_demo`. | Real retained workspace views. | Incidental |
| `0762_northside_hosted_agreement.sql:14` | `app.northside_register` demo-DB check. | Registering a hosted agreement. | Gate |
| `0138_practice_session_hardening.sql:41` | `app.contractor_practice_session_live` filters on the demo DB, so on a real database it returns no session row. | Resolving any contractor practice session on a real database. | Gate |
| `0749_lp6d_remaining_routines.sql:4764` | `app.lp6d_contractor_session_identity` reads its base session from `app.contractor_practice_session_live`, so the refusal is delegated. Its own demo-DB and `synthetic_demo` conditions apply only to the acting-as overlay inside its LEFT JOIN. | Contractor session identity on a real database (through the base routine); acting-as worker substitution outside the demo. | Gate |
| `0765_lp11_bound_tenant_rls.sql:1525` | `app.revoke_contractor_practice_session` demo-DB check. | Revoking contractor sessions. | Gate |
| `0165_practice_worker_switch.sql:47` | `app.practice_company_made_up` returns one row with verdict `forbidden`, reason `mode`, when not on the demo DB. | A company counting as "made up" for the worker switch on a real database. | Gate |
| `0165_practice_worker_switch.sql:201,218` | `app.practice_company_marker_guard` and `app.practice_worker_switch_guard` demo-DB checks. | Worker-switch marker and switch rows outside the demo. | Gate |
| `0749_lp6d_remaining_routines.sql:2995,3065,3107` | `app.practice_worker_switch_on`, `_off`, `_state` demo-DB checks. | Acting-as on, off and state. | Gate |
| `0548_server_plan_entitlements.sql:213,227` | `app.practice_worker_switch_decision` returns `forbidden` unless `app.practice_company_made_up` gives verdict `made_up` (213, delegated). A finance worker is eligible only as the fixture `finance@northside-fictional.invalid` member of a Northside run (227). | The worker switch on a real database; switching to any other finance member. | Incidental |
| `0765_lp11_bound_tenant_rls.sql:876` | `identity.emergency_owner` demo-DB check. | Emergency owner access. | Gate |
| `0763_member_administration.sql:19,81` | `identity.member_remove` and `identity.member_change_role` need a `synthetic_demo` session. | Removing members and changing roles from a pilot or real session. | Gate |
| `0554_connector_intake.sql:17-18` | `connector.binding` `environment='synthetic_demo'`, `endpoint_kind='fake'`. | Real connector bindings. | Gate |
| `0765_lp11_bound_tenant_rls.sql:3374,3467` | `connector.intake` and `connector.machine_stage` binding env and fake endpoint. | Real connector input and machine staging. | Gate |
| `0621_connector_machine.sql:60,138,143` | `connector_machine_command` and `machine_authority` demo-DB checks; fake endpoint. | Machine connector commands and real credentials. | Gate |
| `0754_connector_promotion_list_closed_job.sql:9,16` | `connector_promotion` demo-DB check; client must be "Fictional Housing Association". | Promotion outside the demo or for real clients. | Gate |
| `0111_persisted_identity.sql:9` | `identity.user_email` must end `.invalid`. | Real user emails, pilot included. | Gate |
| `0111_persisted_identity.sql:20-21` | `identity.invitation` `environment='synthetic_demo'`, email `.invalid`. | Real or pilot invitations. | Gate |
| `0111_persisted_identity.sql:29-30` | `identity.challenge` env synthetic, email `.invalid`. | Real sign-in challenges. | Gate |
| `0771_pilot_identity_session.sql:4` | `identity.session` env `synthetic_demo` or `pilot_no_charge`. | Production sessions. | Gate |
| `0772_pilot_identity_invitations.sql:11,30` | `lp11_invitation_sso_state`, `invite_member` need a synthetic or pilot session. | Production sessions issuing invitations. | Gate |
| `0120_enterprise_identity.sql:6` | `sso_connection.environment='synthetic_demo'`. | Real SSO connections. | Gate |
| `0120_enterprise_identity.sql:78` | `sso_load_connection` demo-DB check. | Loading SSO connections. | Gate |
| `0347_oidc_signin.sql:5` | SSO metadata needs `in-process-test-idp`, `issuer.invalid`, `synthetic_demo`. | Real SAML or OIDC providers. | Gate |
| `0347_oidc_signin.sql:62` | `oidc_link` needs a `synthetic_demo` session. | OIDC linking from pilot sessions. | Incidental |
| `0765_lp11_bound_tenant_rls.sql:1313-1314` | `sso_require_admin` demo-DB check and synthetic session. | SSO admin. | Gate |
| `0765_lp11_bound_tenant_rls.sql:1343,1362` | `sso_complete` email `.invalid`, synthetic session. | Real SSO sign-in emails. | Gate |
| `0765_lp11_bound_tenant_rls.sql:6217,6231` | `sso_admin_command` synthetic key and session; `synthetic-domain:` proof. | Real domain verification. | Gate |
| `0765_lp11_bound_tenant_rls.sql:2599,2610` | `sso_action_allowed` false unless demo DB and synthetic session. | SSO actions. | Gate |
| `0765_lp11_bound_tenant_rls.sql:528` | `sso_session_scope` needs a `synthetic_demo` session. | Pilot sessions getting SSO scope. | Incidental |
| `0765_lp11_bound_tenant_rls.sql:1006` | `sso_emergency_use` demo-DB check. | Emergency SSO use. | Gate |
| `0749_lp6d_remaining_routines.sql:7408` | `sso_required_command` demo-DB check. | SSO-required toggles. | Gate |
| `0129_sso_required.sql:130` | `sso_required_append` demo-DB check. | SSO-required events. | Gate |
| `0143_sso_emergency_owner_window.sql:114,196` | `sso_required_view`, `sso_required_detail` demo-DB checks. | SSO state and detail reads. | Gate |
| `0765_lp11_bound_tenant_rls.sql:1128,1217` | `scim2_machine` demo-DB check; `userName` `.invalid`. | Real SCIM provisioning. | Gate |
| `0765_lp11_bound_tenant_rls.sql:1440` | `scim_deactivate` demo-DB check. | SCIM deactivation. | Gate |
| `0507_mobile_auth_store.sql:6,8` | Mobile auth state keyed and checked on env `synthetic_demo`. | Real mobile auth storage. | Gate |
| `0508_tenant_key_registry.sql:40` | `register_tenant_key` demo-DB check. | Registering tenant keys. | Gate |

## 10. AI, storage and the native app

| Path:line | What it checks | What it refuses | Kind |
|---|---|---|---|
| `packages/ai/src/enterprise-ai-prompts.ts:91-92` | `mode !== "synthetic_demo"` → `live_route_disabled`. | Any live enterprise AI prompt route. | Gate |
| `packages/ai/src/enterprise-ai-prompts.ts:38-39` | `dataClass: z.literal("fictional_fixture")`, `provider: z.literal("fixture")`. | Real data and real AI providers. | Gate |
| `packages/ai/src/enterprise-ai-evaluation.ts:48` | Hard-codes `synthetic_demo`, `fictional_fixture`, fixture request. | Evaluating on real data. | Incidental |
| `packages/storage/src/tenant-envelope.ts:4` | Tenant, job and object IDs must match `^synthetic-`. | Real IDs. | Gate |
| `packages/storage/src/tenant-envelope.ts:30` | Metadata `classification: z.literal("synthetic-fixture")`. | Real evidence metadata. | Gate |
| `packages/storage/src/tenant-envelope.ts:84` | Disabled by default; `NODE_ENV` production refused. | All production envelope use. | Gate |
| `packages/storage/src/tenant-kms-fake.ts:25` | Fake key service: production refused, `synthetic-` tenants only. | Real key management (only a fake exists). | Incidental |
| `apps/mobile/App.tsx:7` | Client and native bindings are injected only by a synthetic composition; otherwise shows "not connected" (lines 27, 35). | Any real sign-in or workflow. | Gate |
| `apps/mobile/index.js:3` | Registers `App` with no client or native props. | Any wired transport in a built app. | Incidental |
| `apps/mobile/src/lifecycle.ts:30` | Not enabled or not `synthetic_demo` → MOBILE_DISABLED. | Every mobile lifecycle action in real mode. | Gate |
| `apps/mobile/src/lifecycle-contracts.ts:5` | Mobile session env literal. | Real mobile sessions. | Gate |
| `apps/mobile/src/capture-upload.ts:19` | Upload input env literal. | Real capture uploads. | Gate |
| `apps/mobile/src/local-api.ts:14` | Base URL must be `localhost`, `127.0.0.1` or `10.0.2.2` (LOCAL_API_ONLY). | Any real API host. | Gate |
| `apps/mobile/src/download.ts:113` | `offlineRead()` always throws NATIVE_OFFLINE_READS_HELD_D08. | Offline reads. | Gate |
| `apps/mobile/src/native-lifecycle.ts:47` | `createNativeSyntheticClient` hard-codes `synthetic_demo`. | A real-mode client. | Incidental |
| `apps/mobile/src/capture.ts:16`; `durable-queue.ts:62`; `download.ts:95` | Capture items, queue items and assigned-job results hard-code `synthetic_demo`. | Real captures, queue items, job reads. | Incidental |
| `apps/mobile/src/WorkspaceScreens.tsx:72,74` | Upload only via `captureFixture` with `synthetic_demo`. | Real photo or voice capture. | Incidental |
| `apps/mobile/src/CaptureScreen.tsx:11,18-19`; `OperativeScreen.tsx:26,29-30` | Screens offer only fictional notes, fixture photo and WAV attachments, and existing fictional photo IDs. | Real capture from the operative's device. | Incidental |
| `apps/mobile/src/native-store.ts:7,14` | Synthetic key name and `m31-synthetic.db`. | A separate real local store. | Incidental |

Not listed as refusal points: refusals that block charging rather than real data (`contractor-fee-mandate.ts:64`, `contractor-mandate.ts:87,105`, `enterprise-domain/fee.ts:171`, `origin.ts:72`); test-only issuers (`test-oidc-issuer.ts`, `test-identity-provider.ts`); SME-only checks (`workspace/application.ts:164,176`, the small-builder half of `auth/customer-*` (`customer_portal_*`), `accounting-export.contracts.ts:23`, job evidence holds (`evidence-hold-server.ts:34`), recovery evidence packs (`evidence-pack-v3-sources.ts`, `0306`), `0505_onsite_diary_admission.sql`, small-builder practice-session routines in `0660` and `0741`, the latter's `lp6_session_authority` superseded by `0765`); OpenAPI descriptions; and plain display labels with no effect on what is accepted.

## What a reviewed real mode must satisfy

Drawn only from existing rules. This section proposes no new policy.

1. **The server resolves the approval evidence; the caller never supplies it.** Deployment mode comes from trusted server configuration, never request input (`policy-gates.ts:18`; AGENTS §2 item 7: "Do not trust a client-supplied tenant, price, permission, or settlement state"). Approval data in a request body, header, upload or AI output can never open real mode (AGENTS §5.3: "Resolved" alone is not authorization; an agent cannot mark an approval as given, AGENTS §1).
2. **The evidence is bound to the right tenant, agreement, terms and policy versions.** It must name the tenant (verified membership context, AGENTS §5.1), the agreement version, and the exact terms hash. It must carry the signed pilot agreement and DPA, and D12 `third_party_data_protection_policy_v4` and D16 `enterprise_site_capture_policy_v1` approved, each with approver, date, evidence reference and exact policy version (D12 and D16 "Approval requirement"; BUILD_PLAN §9.1.13 "Real contractor data (pilot)": G1, signed pilot agreement and DPA, D12 v4 and D16 pilot terms approved by the founder, ENT-14).
3. **G1 is met first.** BUILD_PLAN G1 for contractor pilots: approved processor and data-flow register (D04), supported invoice and tax scope, permissions, privacy and retention procedure (D07, D12), secret management, alerts, backup and a successful restore, an outbound kill switch, and a signed pilot agreement and DPA. AGENTS §5.11 adds residency, least privilege, redacted logs and incident ownership.
4. **D12 v4 roles hold.** The contractor is controller of residents' and clients' data and JobGuard is its processor under the DPA. The sub-processor list and a data-protection impact assessment for resident data exist before the first pilot (D12 v4; AGENTS §5.16).
5. **Every other path keeps refusing.** `enterprise_real_data`, `enterprise_fee_posting`, `enterprise_fee_collection` and `enterprise_ai_prompts` fail closed in `pilot_no_charge` and `production_billing` (BUILD_PLAN §9.1.13). Real data does not open charging (G4-C, D16, D02), live AI (D04, DPA), native operatives (G3, D08) or any live connector or SSO capability (G5, each separately). The pilot is `pilot_no_charge` (AGENTS §5.10).
6. **Fail closed and stay tenant-safe.** Missing, malformed, expired, revoked or superseded evidence refuses (AGENTS §§1, 5.3). Real rows keep tenant-qualified keys and RLS (AGENTS §5.1). Demo and test data never qualify in production (AGENTS §5.6), so synthetic fixtures must not mix with real rows.

## Open questions the repo does not answer

1. **Where the approved evidence record lives and who writes it.** `requireEnterpriseRealData` parses a record but nothing stores, looks up or signs one. No table, file or configuration key holds `enterprise-pilot-evidence.v1`, and the repo does not say whether the source is server configuration (like `JOBGUARD_PILOT_21_APPROVAL` for the small-builder pilot), a database record or something else.
2. **Which deployment mode real contractor data runs in.** `pilot_no_charge` exists, but many routines check for the demo database by name (`jobguard_synthetic_demo`) rather than by mode. The repo does not say whether a contractor pilot uses its own database, how it relates to the small-builder pilot's G1 switch (`requirePilotG1`), or whether one deployment serves both.
3. **What replaces the `.invalid` rule for real addresses.** Real recipients need D04 approval of an email route (`identity-email.ts:22`). Nothing says which route, or whether sign-in email and contractor invitations share it. Migrations 0771 and 0772 widened identity sessions to `pilot_no_charge` but left the `.invalid` CHECKs on user emails, invitations and challenges, and the invitation `environment` CHECK, in place. It is unclear whether that is deliberate.
4. **What tax code replaces `synthetic-unreviewed`.** Plan piece COM-3 assigns this to the accountant under D02. No reviewed contractor treatment is recorded yet.
5. **Whether a pilot contractor uses SSO at all.** Every SAML, OIDC and SCIM path refuses real providers, and deployed OIDC has no issuer. G5 governs each live SSO capability, but nothing says whether the first pilot needs one or uses email codes.
6. **How synthetic-track joins should treat pilot jobs.** About a dozen routines join on `job_commercial_track.environment='synthetic_demo'` and silently drop `pilot_no_charge` jobs. The repo does not say whether a real mode should include those jobs, refuse them loudly or keep them separate.
7. **Whether `requireEnterpriseRealData` gains callers in place of the existing mode checks or alongside them.** About 40 application-level mode checks and about 60 database routine guards each refuse independently. No plan text says whether the reviewed route replaces them with one server-resolved gate or adds that gate in front of each.
8. **How contractor clients sign in under a pilot.** In `pilot_no_charge`, `customer-signin.ts` calls only the small-builder `customer_portal_use`, never `extra_customer_use`. The repo does not say whether contractor client approval links should work in a contractor pilot, or through which route.
