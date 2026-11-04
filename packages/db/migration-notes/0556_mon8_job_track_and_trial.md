# 0556 — MON-8 fixed job track and trial (RED)

Replaces only app.mon8_company_feature(text,text,uuid), starting from 0548's latest
body. No tables, rows, backfill, owners, grants or callable entry points change.
Company answers and contractor guards remain unchanged. Job checks use immutable
synthetic track; a small-builder job keeps effective subscription or its own trial
access after trial end/company moves. Pay-now/new exports remain disabled.

Upgrade proof: plan-entitlement-lifecycle-upgrade.integration.test.ts compares all
populated tables before/after installation and runner replay, plus routine ACLs.
Lifecycle and adversarial tests run in CI's real PostgreSQL suite. This sandbox
cannot execute PostgreSQL. Before merge: green CI and independent exact-head RED
review. Roll forward with a reviewed replacement routine if installed; no historical
facts need undoing. No live providers, billing changes or public routes.
