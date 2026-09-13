# Contract ownership and dependencies v1

| Contract | Owner | Consumed by | Required decisions/gates |
|---|---|---|---|
| Environment modes | Platform/product | every server effect | G0; task-specific decisions |
| Command/event v1 terminology | Core/domain | M0-5 onward | exact authorization; immutable versions |
| Provider/data-flow register v1 | Data/security | every provider adapter | D04; D12 for third-party data; G1/G4 as applicable |
| Pilot terms v1 | Product/commercial | M1 pilot | G1; D02/D06 for invoice scope |
| Fee posting boundary | Commercial/accounting | M4 billing | D01/D02/D03/D05; G4 |
| Tax invoice boundary | Tax/product | customer/platform invoice tasks | D02 and D06 as applicable |

Dependency check: an effect is enabled only when its task dependencies, release gate, and every listed decision are satisfied. `proposed` and `superseded` always deny where approval is required. Terms use `job` lifecycle, immutable quote/invoice versions, receipt allocations rather than a writable “paid” flag, and versioned command/provider-event envelopes as defined in BUILD_PLAN.md §3.
