# Contractor track inventory — 28 November 2026

**Pinned revision:** `main` at `daaa927ca0184cf7d84ada4e79d49b632c98b2f6` (merge of #1017, 28 Nov 2026).
**Piece:** EP-A1 (Enterprise R1 plan, piece A1). Docs only. Supersedes the contractor-track status in `BUILD_PLAN.md` §7.2/§7.3, which was written at #92 (`694e9e1`).

Everything below runs only in `synthetic_demo`. No real customer data, live provider, real send, payment rail or production mode is enabled at this revision. A merged PR is test execution plus merge, not an independent verdict or release approval (AGENTS §5.13).

**States used.**
- **merged** — the card's own code is on `main`; nothing in the card is waiting on a real-data switch.
- **merged on made-up data only** — on `main`, but the path runs only on fakes/fixtures or refuses real data.
- **partly built** — some parts are on `main`; named parts are missing or held.
- **not started** — no code on `main`.
- **not evidenced** — this inventory found no evidence either way.

Migration numbers are the files on `main` (`packages/db/migrations`). Several PR titles quote pre-landing numbers that were renumbered at landing; the file name on `main` is authoritative.

## 1. Contractor cards (`BUILD_PLAN.md` §9.2)

| Card | State | Evidence on `main` |
|---|---|---|
| SH-1 shared money and origin primitives | merged | #99; `0053_shared_money_origin.sql`; test fix #117 |
| CH-3b contractor client, contract and resident parties | merged on made-up data only | #120; `0102_contractor_parties.sql`; later guard #651 (`0671_contractor_party_bind_work_order_only.sql`) |
| ENT-1 organisation, roles, client contracts | merged on made-up data only | #100; `0054_contractor_organisation.sql`; later #679 (`0695_contractor_admin_owner_guard.sql`, `0696_contractor_admin_expected_revision.sql`), #793 |
| ENT-2 work-order jobs and schedules of rates | merged on made-up data only | #125, #128; `0110_work_orders.sql`; `apps/api/src/contractor/work-order.controller.ts` |
| ENT-3 operative "Log an extra" and close-out | merged on made-up data only | 3a #156 (`0135_site_extra_authority.sql`); 3b #167 (`0139_site_visit_closeout.sql`); 3c #168 (`0140_site_extra_pricing.sql`); 3d #170 (`0141_site_extra_evidence.sql`); screens #549; priced journey #592; relink #582 (`0622_extra_duplicate_relink.sql`) |
| ENT-4a site-origin and fee domain (pure) | merged | #110, #154 |
| ENT-4b origin persistence and audit | merged on made-up data only | #134, #141; `0122_extra_origin_persistence.sql` |
| ENT-4c un-link a duplicate extra | merged on made-up data only | #148 (plan), #159; `0623_extra_duplicate_disposition.sql` (#582) |
| ENT-5 approval chain and client approval | partly built | #215 (`0157_extra_approval.sql`), #217 (`0158_extra_approval_chain.sql`), #549 (timing, `0574_site_extra_work_status.sql`), #550 (escalation discovery, `0575_extra_escalation_discovery.sql`), #591 (`0634`–`0638`), #624, #638 (price rules), #652 (`0672_extra_pack_artifact_store.sql`), #668 (`0686_extra_client_authority_loss.sql`). Open: Q15 live scheduling/execution and the wider Done-when, including pack verification (`docs/contracts/extra-price-rules-v1.md` line 13; `docs/contracts/extra-approval-chain-v1.md` line 34). See §3. |
| ENT-6 billing export and status import | merged on made-up data only | #220, #240 (`0243_contractor_billing.sql`), #360, #361; later #727 (`0727_billing_export_delivery_once.sql`), #871 |
| ENT-7 enterprise fee engine and monthly statement | merged on made-up data only | #238, #353 (`0276_enterprise_fee_derivation.sql`), #357 (`0290_enterprise_fee_statement.sql`), #359 (`0298_enterprise_fee_posting.sql`), #378 (`0322_enterprise_duplicate_reconciliation.sql`), #398, #416, #526, #533 ("finishes ENT-7"); later #785 (`0745_enterprise_fee_rejected_line.sql`). No minimum fee: D16 is `proposed` (`docs/decisions/d16-enterprise-commercial-terms.md`). |
| ENT-8a deterministic live prompts | merged on made-up data only | #219, #288 (`0196_enterprise_live_prompts.sql`), #549 (inbox), #581 |
| ENT-8b AI prompts and SoR suggestions | merged on made-up data only | #236, #237 — fixture gateway only; no live model route |
| ENT-9 dashboards and pilot baseline | merged on made-up data only | #244, #245, #372 (`0296_enterprise_baseline.sql`), #384, #391, #415, #456, #571, #628 |
| ENT-10 identity and security | partly built | 10a SAML #131 (`0120_enterprise_identity.sql`); 10a2 SCIM deactivation #166 (`0137_scim_deactivation.sql`); 10b audit export #133 (`0121_audit_export.sql`), #147; 10c questionnaire #160; 10d SSO required #146 (`0129_sso_required.sql`); 10e emergency window #180 (`0143_sso_emergency_owner_window.sql`); OIDC #295, #296 (`0347_oidc_signin.sql`), #406; ENT-10-rest #574 (`0612_emergency_dual_owner.sql`, `0613_scim2_machine.sql`), #600. Missing: live identity provider, registered SCIM 2.0 route, default OIDC issuer, native SSO (see §3). |
| ENT-11a first demo | merged on made-up data only | #218, #308, #339, #355 |
| ENT-11b full demo and sales bible | merged on made-up data only | #294, #395, #403, #444, #863 |
| ENT-12 native offline operative app | partly built | server slice #471 (`docs/operations/operative-offline-server.md`); shared view models #691; replay fix #620. No native operative app composed by default (see §3, `apps/mobile/App.tsx`). |
| ENT-13a file and webhook connectors | merged on made-up data only | #287, #477, #550 (`0576_connector_materials_stage.sql`), #581 (`0621_connector_machine.sql`), #641, #670 (`0688`), #671 (`0689`), #673 (`0691`); `0554_connector_intake.sql` (#542); `docs/operations/connector-sftp-synthetic.md` |
| ENT-13b named contractor systems | partly built | Conformance kit and unfilled template only, #554 (`docs/operations/ent-13b-adapter-template.md`: "no actual adapter is implemented"). No named adapter. |
| ENT-14 pilot agreement and enterprise gate | partly built | Dark gate #478, #550; `packages/config/src/enterprise-real-data.ts` always refuses (see §3). Signed pilot, D12 and D16 approval: not evidenced; both decisions are `proposed`. |

## 2. Shared pieces the contractor track depends on

| Piece | State | Evidence on `main` |
|---|---|---|
| M0-13a deployment, least privilege, kill switches | partly built | Ops pack in #561; PILOT-08 #875 (`docs/operations/pilot-infrastructure.md`); outbound stop PILOT-07 #886 (`docs/operations/commercial-outbound-pause.md`). A real deployment is not evidenced. |
| M0-13b backup, restore, recovery rehearsal | partly built | Fixture rehearsal JG-C #75; restore-dark in #561; LP-9 restore test #866 (`packages/db/test/lp9-restore.integration.test.ts`); PILOT-08 #875. A deployed restore is not evidenced (`docs/operations/pilot-infrastructure.md` line 51). |
| M0-13c privacy operations | partly built | #553 (batch-12); PILOT-09 #882 (`docs/operations/privacy-operations.md`; notices are unapproved drafts). D07 is `proposed`. |
| M0-13d foundation gate evidence (G0, G1) | partly built | Gate pack in #561; PILOT-11 #881. `docs/operations/foundation-gates.md` line 5: "G0 is not met. G1 is not met." `config/foundation-gates.v1.json`: 1 row `evidence_present`, 8 `needs_owner_approval`, 12 `blocked`. |
| LP-0 grant freeze guard | merged | #208, #214, #247, #412 |
| LP-1 membership and account closed | merged | #223; `0162_membership_account_closed.sql` |
| LP-2 unchecked job doors closed | merged | #283; `docs/operations/lp-2-rollout-evidence.md` |
| LP-3 old activation/acceptance routes get v3 checks | merged | #414, #546 ("finishes LP-3") |
| LP-4 audit append inside the database | merged | `0520_lp4_database_audit.sql`, landed in #474 |
| LP-5a/5b commands begin and finish in the database | merged | #474 |
| LP-5c revoke direct writes | merged | #540 ("finishes LP-5c") |
| LP-6a dark binding foundation | merged | #544 |
| LP-6b withTenant and bridges | merged | #548, #583 |
| LP-6c money and commitment routines | merged | #666 |
| LP-6d remaining routines | merged | #776, #825 |
| LP-6e trusted audit attribution | merged | #834; `packages/db/test/lp6e-audit.integration.test.ts` |
| LP-7 member removal and role change | merged | #845 |
| LP-8a customer billing tables | merged | #855 |
| LP-8b outbox and evidence dependencies | merged | #856 |
| LP-10 worker login split | merged | #843 |
| LP-11 tenant bound for reads and writes | merged | #852 |
| LP-12 narrower owner for chokepoint routines | merged | #857 |
| LP-13 low-value rows | merged | #859 |
| LP-9 direct-SQL refusal run and final gate | merged on made-up data only | #866 ("synthetic final gate verification"; `packages/db/test/lp9-final-gate.integration.test.ts`). The deployment-specific run is not evidenced. |
| M3-1 native/sync risk slice and offline contract | partly built | #224 (server slice); lockfile and composition in #868. Physical-device build, D08 and G3 not evidenced. |
| M3-2 native auth, encrypted store, device lifecycle | partly built | #227, #462, #466; `apps/mobile/App.tsx` SQLCipher check and injected synthetic auth client; `docs/operations/native-device-lifecycle.md`. Device proof not evidenced. |
| M3-3 PowerSync download authorization | partly built | #297, #485, #868; `0551_sync_snapshot_checkpoint.sql` (#542), `0699_sync_checkpoint_bound_reader.sql` (#685). Live PowerSync provider not evidenced. |
| M3-4 offline outbox, upload authorization, conflicts | partly built | #488, #550, #588, #868; `apps/api/src/offline-upload.controller.ts` |
| M3-5 offline voice/photo capture and resumable upload | partly built | #550, #868. Device proof and media policy not evidenced. |
| M3-6 mobile core-loop screens | partly built | Shared contracts #588; `apps/mobile/src/WorkspaceScreens` is rendered only when bindings are injected. |
| M3-7 device chaos suite and native release gate | partly built | Synthetic groundwork #588; `docs/operations/native-device-matrix.md`. Device runs and release gate not evidenced. |

## 3. Specific points checked at `daaa927c`

**Q01 and Q03 (pricing, applicable contract).** Closed for made-up data. `docs/contracts/extra-price-rules-v1.md` line 3: ENT-5-PRICE-RULES "closes only the Q01 pricing and Q03 applicable-contract questions for synthetic construction"; tests pinned in #638. `docs/contracts/extra-approval-chain-v1.md` is inconsistent with that: line 125 still says "Q01 (pricing), Q03 (applicable contract), Q14 … and Q15 … remain held", and lines 26 and 63 say "ENT-5 remains open". Line 127 adds the landing pointer to the price rules. ENT-5 remaining open is correct (Q15 and the Done-when); the "held" wording for Q01/Q03 is stale. This inventory changes no contract text; the fix belongs to plan piece A3.

**Q14 and Q15.** Q14 (exports and authority-loss behaviour) has a cautious synthetic ruling: `docs/contracts/extra-authority-loss-v1.md` (keep recorded decisions, cancel unused client permission, no client-history export), enforced by `0686_extra_client_authority_loss.sql` (#668). It is reversible by Ben and not a production approval, but it is no longer simply open; `extra-approval-chain-v1.md` line 125 and `extra-client-approval-v1.md` line 11 still say "HELD". **Q15** (live scheduler/executor activation and escalation ownership) is genuinely open: `extra-price-rules-v1.md` line 13 and `extra-authority-loss-v1.md` line 3 both say so, and the Q08 escalation reuses synthetic Graphile discovery only (`extra-approval-chain-v1.md` line 121).

**SCIM controllers.** `apps/api/src/app.module.ts` line 105 registers `ScimController` (`apps/api/src/auth/sso/scim.controller.ts`, route `auth/scim`, the JobGuard-JSON deactivation path). `Scim2Controller` (`apps/api/src/auth/sso/scim2.controller.ts`, route `scim/v2/:bindingId`, the SCIM 2.0 Users/Groups profile backed by `0613_scim2_machine.sql`) is deliberately not registered: it is constructed only in `apps/api/src/auth/sso/enterprise-access.test.ts`, and `docs/verdicts/ENT-10-rest/BUILDER_RECEIPT.md` line 131 says "SCIM controller registration and machine logins stay dark".

**Default OIDC composition.** No issuer. `apps/api/src/workspace/application.ts` line 75 constructs `OidcApplication` with four arguments and no `issuer`; `apps/api/src/auth/sso/oidc.application.ts` lines 23–24 throw `OidcError` when no issuer is configured, so nobody can sign in through OIDC by default. An issuer is injected only in tests (for example `apps/web/e2e/ENT-10-oidc.spec.ts` line 61). Persisted config accepts only `https://issuer.invalid` (`apps/api/src/auth/sso/oidc-persistence.contracts.ts` line 8).

**`apps/mobile/App.tsx` by default.** `apps/mobile/index.js` calls `registerRootComponent(App)` with no props, so `client` and `native` are both undefined. The default screen shows the held notices, an enabled "Check native SQLCipher" button (opens and reads the local encrypted store), all six session buttons disabled, "Synthetic auth transport not connected" and "Native workflow adapters are not connected". No account, transport or workflow screens are wired in by default.

**`packages/config/src/enterprise-real-data.ts` after reading evidence.** `requireEnterpriseRealData` parses the deployment mode and a caller-supplied `enterprise-pilot-evidence.v1` record, checks the tenant matches, runs `requireApprovedDecision` for D12 and D16, and then always throws `EnterpriseRealDataDeniedError` (return type `never`, line 31). No input can open real contractor data at this revision. The evidence is supplied by the caller, not looked up by the server; plan piece B2 covers that.

## 4. Held work-list lines covering contractor pieces

From `cc-work list` on 28 Nov 2026 (owner: All-builds coordinator unless shown). Ancestry checked against `daaa927c`.

| Line | Work-list state and note | PR / branch | On `main`? |
|---|---|---|---|
| DUI-1a | held; PASS at `75afc14c` | #890, `codex/sandbox/dui-1a` | no |
| DUI-1b | held; PASS `566621a1` | #894, `codex/sandbox/dui-1b` | no |
| DUI-2 | held; PASS `8f389fbe` | #896, `codex/sandbox/dui-2` | no |
| DUI-3 | held; PASS `86c1658d` | #897, `codex/sandbox/dui-3` | no |
| DUI-4 | held; PASS `7325bae5` | #899, `codex/sandbox/dui-4` | no |
| DUI-5 | held; PASS `50ab9944` | #902, `codex/sandbox/dui-5` | no |
| DUI-6 | building (Web Codex), last update 23 Nov | `codex/sandbox/dui-6` at `d67e7ef8c`; no PR of its own | no |
| JG-DESIGNED-UI | building, last update 23 Nov | umbrella for DUI-1a to DUI-6 | no |
| M3-1 | held; lockfile slice RED PASS `70ed3399` | landed via #868 | yes (`70ed3399` is an ancestor) |
| M3-3 | held; RED PASS `2c50465e` | landed via #868 | yes |
| M3-4 | held; RED PASS `c4aa0ca7` | landed via #868 | yes |
| M3-5 | held; RED PASS `0cf664b6` | landed via #868 | yes |
| NATIVE-COMPOSITION | held; RED PASS `8f663eec` | landed via #868 | yes |
| native-mature-lockfile | held; RED PASS `70ed3399` | landed via #868 | yes |
| ENT-5 | held; "Merged in part by #549" | see §1 | partly |
| ENT-10 | held; "Part built, per recount 3 Nov" | see §1 | partly |

The M3 and NATIVE-COMPOSITION lines still say "integrate", but their reviewed heads are already on `main` through #868 (NATIVE-M3-INTEGRATE, 21 Nov). Their remaining holds (device proof, D08, G3, media policy) are unchanged. The work-list lines are the coordinator's; this piece does not change them.

## 5. How #918, #896 and #902 relate

The DUI branches form one straight stack, each branch containing the one before: `dui-1a` (1 commit) → `dui-1b` → `dui-2` → `dui-3` → `dui-4` → `dui-5` → `dui-6` (8 commits). Every branch forks from `main` at `76e48522b` (merge of #873, 23 Nov), which is 50 commits behind `daaa927c`.

- **#896** (DUI-2): base `main`, head `8f389fbecfaf0a2f10acdb0d3b16b8ba09403276`, 4 commits. It contains DUI-1a and DUI-1b, so it overlaps #890 and #894.
- **#902** (DUI-5): base `main`, head `50ab994408fc12a1a35cf49db86fdf0c9e579ea8`, 7 commits. It contains all of #896, plus DUI-3 and DUI-4 (#897, #899).
- **#918** ("Tommy demo: hardening fixes"): base `codex/sandbox/dui-6` (not `main`), head `b8adc5b5274c035d8ab8e3d2533a5d591bb98599`, 22 commits against main's fork point. It contains `dui-6`, so it contains #902 and #896 as well.

So #918 ⊃ `dui-6` ⊃ #902 ⊃ #896. Merging #918 into its base only updates `dui-6`; nothing reaches `main` until the stack lands there. Choosing one route is plan piece A2.

## 6. Not evidenced at this revision

A signed contractor pilot agreement; approval of D04, D07, D12 or D16 (all four records say `proposed`); a passed G0, G1, G4-C or G5; a live identity provider, AI route, connector endpoint or PowerSync service; a deployed restore; a physical-device native run; human trial observations.
