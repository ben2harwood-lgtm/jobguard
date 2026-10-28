# 0265 enterprise fee derivation (ENT-7a)

Adds `enterprise_agreement_version` (operations writes through the migration owner only), `enterprise_fee_derivation`
and `enterprise_fee_contribution`. All three have FORCE RLS, are append-only by trigger (even for the owner), and give
the runtime role no table privilege. Finance reaches them only through `app.ef_derive` and `app.ef_read`.

`app.ef_derive` takes the billing lock order from 0243 (organisation fence, tenant billing lock), then its own
agreement/period lock, and recomputes exact qualifying principal from stored facts. It accepts no amounts from the
caller. Rounding happens once, half to even, on the cumulative fee. The routine posts nothing; posting is ENT-7b and
approval ENT-7c. It works only in the synthetic database.

Forward fix only: the tables are new and hold synthetic rows, and nothing earlier is altered. No backfill.
