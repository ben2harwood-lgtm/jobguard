# DUI-5 Northside work and approvals

The designed work surfaces opt in with `?designed=1` on Northside, the work-order register and detail, site capture, and extra approvals. The screenshots use generated practice records from the production Next.js build backed by local PostgreSQL. The hub, register and order detail are viewport captures. Site capture and approval evidence show the relevant card at each viewport width.

| State | Reference choice | 360 × 800 | 1280 × 800 |
| --- | --- | --- | --- |
| Northside | The reference has contractor role journeys and no dedicated 2,000-order hub. The hub uses the contractor navigation, a practice Notice, counted Metrics and a Card for the existing practice role controls. | [Hub](mobile-360-northside.png) | [Hub](desktop-northside.png) |
| Work-order register | The Orders Card combines a labelled search, the saved order and Money columns, and page controls. It uses the existing register endpoint with optional search and paging over the same authorized rows. Each page shows 50 orders. An unfiltered classic request continues to return up to 200 recent orders. | [Register](mobile-360-work-orders.png) | [Register](desktop-work-orders.png) |
| Work-order detail | A DescriptionList groups the existing job and assignment facts. Revision Cards show the saved lines, net amounts and changes. The billing link leads to the existing billing screen. | [Detail](mobile-360-order-detail.png) | [Detail](desktop-order-detail.png) |
| Site capture | The operative capture pattern groups the assigned job, visit and order controls, work statement, note, Evidence and resident confirmation. | [Capture](mobile-360-site-capture.png) | [Capture](desktop-site-capture.png) |
| Supervisor review | The role queue uses a Card for the extra, Money for the stored price and Progress for the existing approval steps. The available actions come from the same role and queue checks. | [Review](mobile-360-supervisor-review.png) | [Review](desktop-supervisor-review.png) |
| Declined extra | The same decision Card shows the persisted refusal and step state after the reason is recorded. | [Declined](mobile-360-declined-extra.png) | [Declined](desktop-declined-extra.png) |
