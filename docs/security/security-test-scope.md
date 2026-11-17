# Independent security test — proposed scope (not commissioned)

DRAFT for founder review. Not to be sent to any buyer until Ben approves it.

`Practice build only: made-up data, a built-in test identity provider, no real customer data, no outside assessor. Nothing here has been assessed or certified by anyone outside the project.`

Evidence cutoff: 96c0cb8a5b5562c65b79f5f601ba9d60f8fcf05a (12 October 2026)

## Status

NOT COMMISSIONED. No tester engaged, no date, no price and no result (E-66). Commissioning is paid work and spending is founder-reserved. This proposal spends nothing. “Penetration test” here means a proposed outside security test, not a result or assessment of JobGuard.

## What a good outcome is

Proposed: findings have an owner, severity, remediation evidence and a retest. Unresolved high-impact findings block the affected commercial feature. These are the build plan’s future acceptance criteria, not achieved operational evidence (E-66, E-69).

## What would be tested

Proposed: a practice build from main at a recorded commit, made-up tester accounts and no real data. Hosting details and the exact address list are NOT DETERMINED; the founder supplies them before agreement. The route inventory is `apps/api/openapi.json` at the tested commit; it is a scope input, not proof every route is covered by this pack.

## In scope

Proposed testing of merged surfaces only, subject to an agreed address list:

| Surface | Mapped practice evidence |
|---|---|
| Emailed-code sign-in and rate limits | E-01, E-02, E-02b, E-02c |
| SAML start and callback; signed assertions | E-03 to E-10, E-05b, E-06b, E-07b, E-08b |
| Required single-sign-on switch and its refusal path | E-41, E-41b, E-41c, E-41d, E-41e, E-42 |
| Sessions and cookie flags | E-12, E-12b, E-13, E-14, E-14b |
| Roles and company separation, including reads by identifier | E-11, E-16, E-16b, E-17, E-17b, E-17c, E-18, E-19, E-19b, E-20, E-20b, E-21 |
| Audit chain, signed file and offline checker | E-22 to E-32, E-26b, E-27b, E-32b, E-38 |
| Route list at the tested commit | Proposed inventory; not a new achieved control |

Ranges mean existing numeric IDs; the lettered IDs are named explicitly. The evidence map supplies limits for every row.

## Cases the plan already requires

Proposed cases: replayed assertion; wrong audience or issuer; tampered, unsigned or expired assertion; unsolicited sign-in for another company; unconfirmed-domain and email-collision linking; role-mapping defaults; revocation and role downgrade on web and background paths; leaver behavior without automatic removal; changed or truncated export. Test reads of another team’s, branch’s or company’s job by identifier. Map to E-04 to E-13, E-16b, E-17b, E-19, E-26b and E-27.

Not claimed: automatic removal remains E-52; mobile paths remain E-57. Existing tests do not replace the proposed outside work (E-66).

## Out of scope

Proposed exclusions: providers’ own infrastructure; anything containing real data; the identity provider’s side; social engineering of staff; high-volume denial of service; physical security. Features not built are excluded: automatic provisioning/removal, OpenID, mobile and a usable emergency approver route (E-51, E-52, E-54, E-57 not claimed). The held route’s refusal is in scope; no successful emergency use is claimed.

## Later phase

Proposed: the money surface needs its own review before the contractor charging gate opens (build plan §3). It is outside the first test. No test of that surface or charging-gate passage is claimed (E-70 HELD).

## Proposed rules of engagement (to be agreed)

Proposed, not in force: founder and tester agree exact addresses, accounts, permitted methods, timing, stop contact and reporting channel in writing. Use synthetic accounts only. Pause on unexpected real data, effect outside the agreed scope or service disruption; report through the agreed contact. No third-party system is touched without its owner’s agreement. Hosting-provider conditions are NOT DETERMINED.

## What JobGuard provides

Proposed: this draft pack, evidence map, repository at the agreed commit, synthetic seed data and tester accounts. Founder supplies the address list and stop contact; both are NOT DETERMINED. No signing material or sensitive connection values are included in this pack.

## Reporting and retest

Proposed: each finding records affected commit/surface, repeatable case, impact, severity, owner and evidence. Founder assigns remediation ownership. Fixes have a linked change and supporting test; the tester retests at a recorded candidate commit. Unresolved high-impact findings keep the affected commercial feature closed. Outside report and retest evidence remain NOT PRODUCED (E-66).

## Decisions the founder must make first

NOT DETERMINED: budget, tester, timing, addresses, contact and reporting channel; whether to include the money surface; hosting-provider rules. No purchase, engagement or outward sharing occurs through this document (E-66, E-70).
