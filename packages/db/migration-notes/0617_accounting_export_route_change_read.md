# 0617_accounting_export_route_change_read: synthetic export route read

Adds one checked, tenant/session-bound read routine; no table, table grant or predecessor routine changes. Uses the existing export lock and owner/admin permission, refuses outside jobguard_synthetic_demo, and calls only the fixed routeChangePreview operation of the existing dispatcher. Returns its hash-bound proposal plus immutable confirmed route records in descending revision order. No ledger, mapping, external ID or audit record is written by a read.

Forward fix: disable this screen and revoke runtime EXECUTE before replacing a defective projection; preserve all stored history. Fresh/upgrade, actual catalog privileges and cross-tenant execution require CI PostgreSQL proof. No production activation.
