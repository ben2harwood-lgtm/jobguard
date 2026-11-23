# DUI-6 Northside billing and settlement

The designed path uses the Northside contractor navigation from DUI-5 and reaches billing, statements and the dashboard with `?designed=1`. The captures show the relevant cards from the production web build at 360 × 800 and 1280 × 800, using generated Northside practice data and local PostgreSQL.

The plan identifies role-specific contractor companions. The settlement-specific states below use the existing reference kit as carried forward into the app. The same billing amounts, statuses, approval controls and evidence remain visible.

| State | Reference kit composition | 360px | 1280px |
| --- | --- | --- | --- |
| Export | A Card groups the saved batch, exact-delivery approval fields and CSV download. The batch amount uses the Money pattern. | [Export](mobile-360-export.png) | [Export](desktop-export.png) |
| Billed | An invoice Card keeps the stored source, line balances and total together. Reconciliation amounts remain available in expandable rows. | [Billed](mobile-360-billed.png) | [Billed](desktop-billed.png) |
| Part-paid | The same invoice Card shows the existing part-paid state and exact recorded balance per line. | [Part-paid](mobile-360-part-paid.png) | [Part-paid](desktop-part-paid.png) |
| Paid | The invoice Card shows the settled balances alongside billed and credited amounts. | [Paid](mobile-360-paid.png) | [Paid](desktop-paid.png) |
| Statement | A Money metric highlights the stored statement delta. Expandable Evidence rows show the agreement, origin, qualifying principal, allocations and synthetic journals. | [Statement](mobile-360-statement.png) | [Statement](desktop-statement.png) |
| Dashboard | The report Card groups activity and Money metrics, billed and paid totals, and the advisory and method sections. The metrics retain their source drill-downs. | [Dashboard](mobile-360-dashboard.png) | [Dashboard](desktop-dashboard.png) |
