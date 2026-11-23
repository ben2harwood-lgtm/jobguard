# DUI-2 visual checks

Chromium at 360 × 800 and 1280 × 800. The fictional own job keeps quote document v1 and its £900.00 accepted net throughout. The extra is approved at £150.00 on price revision 2.

The standalone clickable preview was unavailable in this workspace. The comparison uses the same [16 October interface candidate](https://github.com/ben2harwood-lgtm/jobguard/tree/7b909f72b48558facaf483755ea282e592a800e0) as DUI-1a and DUI-1b. All four matching views are layout specimens.

| Work state | Reference gap and composition | 360px | 1280px |
| --- | --- | --- | --- |
| Quote response and acceptance (v081) | The specimen has no acceptance form. A reference form card records the attestation and presents the document version and total. | [Working](mobile-360-acceptance.png) · [Reference](mobile-360-reference-acceptance.png) | [Working](desktop-acceptance.png) · [Reference](desktop-reference-acceptance.png) |
| Switch live (v082) | The specimen has no start control. A separate action card starts the accepted job, and a facts card shows the frozen baseline afterwards. | [Working](mobile-360-switch-live.png) · [Reference](mobile-360-reference-switch-live.png) | [Working](desktop-switch-live.png) · [Reference](desktop-reference-switch-live.png) |
| Work proof and stage review (v086) | The specimen has no proof workflow. An evidence card shows attachment, integrity and completion controls with saved status. | [Working](mobile-360-work-proof.png) · [Reference](mobile-360-reference-work-proof.png) | [Working](desktop-work-proof.png) · [Reference](desktop-reference-work-proof.png) |
| Builder-logged extras (v085) | The specimen has no pricing and approval workflow. Form, money and revision cards show the saved prices and exact approval. | [Working](mobile-360-approved-extra.png) · [Reference](mobile-360-reference-approved-extra.png) | [Working](desktop-approved-extra.png) · [Reference](desktop-reference-approved-extra.png) |

## Navigation map

| Incoming classic fragment | Designed destination |
| --- | --- |
| `#quote` | `/jobs/[id]/work#quote` |
| `#work-proof` | `/jobs/[id]/work#work-proof` |
| `#variations-title` | `/jobs/[id]/work#variations-title` |
| `#variation-<id>` | `/jobs/[id]/work#variation-<id>` |

The bare job URL opens the classic workspace. These four deep links open Work from an initial classic-page visit. The company query branch continues to serve CH-4. The scope, final account, Final Check, practice tools, diary, customer message and invoice fragments retain their existing destinations.

## Workspace panels

| Treatment | Panels |
| --- | --- |
| DUI-1a and DUI-1b | Scope review, customer and site, pricing, quote preview and simulated send. |
| DUI-2 | Journey progress, exact acceptance, switch live, site work, diary, customer messages, proof and extras. |
| DUI-3 and DUI-4 | Final account, Final Check, lock, invoices, receipts and paid-report actions. |
| Practice tools until piece 9 | Materials, purchase orders, supplier documents and matching, things to check, readiness, relevance, commercial integrity, prevention checks, recovery cases and practice tools, practice receipts and facts, allocations, fee statements, trial and recovery links, merchant order. |

## Regression coverage

Retained guards include `SV-3` through `SV-7A`, `real-fc-*`, `real-lock-pending-extra`, and the money refusal assertions in `real-own-job-to-paid`. The new journey checks the actual stale variation refusal and compares the saved baseline and approved extra in both editors.

The unchanged DUI-1b spec still expects direct `/jobs/[id]#quote` to open the classic editor. That assertion conflicts with the incoming link map above. To see the classic quote, open the bare job first and select Quote in Saved job sections.
