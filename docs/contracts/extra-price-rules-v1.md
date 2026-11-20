# Extra price and applicable contract rules v1

ENT-5-PRICE-RULES closes only the Q01 pricing and Q03 applicable-contract questions for synthetic construction. These cautious rulings are versioned here; Ben may reverse them through a new rule version. They do not authorize real money, customer data, providers or launch.

Q01: An extra's price is exactly one GBP net amount in whole pence: a positive integer within the existing pence schema bound (1 to 1,000,000,000,000 inclusive). Only a surveyor with the existing job-covering grant may set it. ENT-5 accepts no adjustment, discount, markup, quantity, VAT or rounding fields. VAT and totals remain in billing. A change of price requires a new revision through ReviseExtra, subject to its existing state rules, never an edit. The source price referenced by app.extra_approval_revision_binding remains separate and is never overwritten. An unpriced extra counts as above every threshold; equality uses exact pence.

Q03: Submission uses the single client contract version bound to the job's work order at submission time and its approval rule version. Their identities, rule hash and requirements are frozen in the immutable request snapshot. Newer client contracts or rule versions do not replace that binding. A missing contract, multiple candidate bindings, or missing rules must fail closed; there is no default or fallback rule set.

Existing enforcement already implements these rulings: strict core and repository schemas; surveyor authorization and revision state checks in xa_price; immutable source bindings and request snapshots; the work order's unique tenant/job binding and required tenant/contract-qualified foreign keys; and RULES_NOT_FOUND in xa_open_request. Multiple candidates and missing rule references are refused structurally before submission (PostgreSQL uniqueness, NOT NULL and foreign-key errors), rather than arbitrarily choosing one. Repository command/input failures remain typed. The new tests distinguish structural database refusals from repository outcomes.

Migration 0859_extra_price_contract_rules is unused: no additional SQL guard or routine recreation is needed. No stored format, grant, existing contract or production switch changes.

ENT-5 is still not complete. Q15 executor/scheduler activation and the wider ENT-5 Done-when requirements remain open; this amendment supplies no independent review, real-provider or release evidence. Q14 and any other questions are outside this slice.
