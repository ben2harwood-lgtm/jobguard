# Environment modes contract v1

The deployment, from trusted server configuration, selects exactly one mode; API payloads cannot select or mutate it.

- `synthetic_demo`: generated data, test recipients, simulated settlement and journals; isolated credentials/data; visibly labelled.
- `pilot_no_charge`: real data only after G1; supported builder documents may be sent, but no JobGuard fee obligation, collection, or production recovery posting.
- `provider_sandbox`: provider test credentials/events; never production settlement evidence or customer debt.
- `production_billing`: only after G4 and every applicable approved decision; obligations, invoices, settlement and refunds remain separate facts.

Sandbox references are rejected by production execution. Pilot jobs remain no-charge and cannot be retrospectively converted without a new versioned agreement and migration task.
