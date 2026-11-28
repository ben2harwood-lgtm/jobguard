# Rate-list import v2: per-item "includes" text (CC-I1)

Enterprise R1, workstream F, leaf CC-I1 (parent F1, `ENTERPRISE-R1-F-COMMERCIAL-CONTROLS.md` rev 3, §2 F1 row, §4.2 "Entitlement context", §6 CC-I1). Synthetic data only. No production or pilot capability, no connector, no outbound action. Real use waits on Gate G1. This is a new versioned command next to `sor-version-import.v1` (`work-order-import-v1.md`, "Pricing and the schedule of rates"). It does not change v1.

## The command

`sor-version-import.v2` is `sor-version-import.v1` plus one optional field on each item:

| Field | Rule |
| --- | --- |
| `items[].includes` | Optional. What this rate includes, typed by the contractor from its own contract. Trimmed, then 1 to **1,000** characters. Line breaks and tabs are allowed; other control characters are refused. Empty, whitespace-only, `null` and non-string values are refused (`INVALID_COMMAND`): to give no text, leave the field out. |

Everything else is as in v1. The command is strict (Zod `sorVersionImportV2`). It has up to 10,000 items, no duplicate codes, and money as whole pence. The tenant and provenance are never taken from the caller. Authority is `contract.manage` (owner, admin, commercial_manager), tenant-wide. The import is one transaction with its audit event.

`POST /api/contractor/sor-versions` (and the Nest `POST /contractor/sor-versions`) takes either version, chosen by `version`. A v1 body with an `includes` field is refused as an unknown field. The v2 answer is `sor-version-result.v2`: the v1 answer plus `includesCount`, the number of items that carry text.

**Replay and conflict.** v1 and v2 share one command namespace (`sor_version.command_id`). If the same v2 command arrives again with the same payload, it is replayed. If it arrives with a changed payload, or a command id first used by the other version arrives, the answer is `COMMAND_CONFLICT`. A second version for the same schedule and effective date also conflicts, as in v1.

## Storage

The text is stored in `app.sor_item_includes`, one row per item that has text. The key is `(tenant_id, version_id, code)`, with a foreign key to that version's `app.sor_item`. The table is a tenant table under forced row-level security. The runtime can read it and cannot write it. Its rows are immutable. The only writer is `app.import_sor_version_v2` (migration 0785). The routine computes each text's SHA-256 itself, and a CHECK enforces that hash.

## Audit (rule §3: free text lives in tenant tables, audit carries its hash)

The audit event is `contractor.sor_version.imported`, the same as v1, and the same deferred trigger requires it. The payload is `sorVersionAuditPayloadV2`. It contains `references` (with `importVersion: "sor-version-import.v2"`), `hashes.document` (the canonical content hash over reference, effective date and code-sorted items, text included) and `hashes.includes`. `hashes.includes` is the SHA-256 of the canonical, code-sorted list of `{ code, includes: sha256(text) | null }`. The text itself never appears in an audit payload, receipt or log.

## Reading it (for the entitlement context)

`readSorItemIncludes(db, sorVersionId, code)` (packages/db) returns `sor-item-includes.v1` `{ sorVersionId, code, includes: string | null }` inside the caller's own tenant transaction. The caller (CC-R1's entitlement context) owns the read authority for its screen. `SorRepository.itemIncludes(principal, sorVersionId, code)` is the same read under the price-list read grant (`contract.read`, and never `client_approver`).

- The key is the **rate-list version and the code**. The text shown is only that version's. An earlier or later version of the same code has its own text or none. Nothing falls back to another version.
- `includes: null` means that version's item has no text. This covers every v1 import and every item imported before 0785.
- An unknown version or code, a malformed key, or another tenant's version is `NOT_FOUND`.

## Not in this leaf

The entitlement-context read model and its routes (CC-R1), the contract's inclusion rule and clause (`rates_include_ancillaries`, §4.2), flags and decisions (CC-S2) and any screen are not part of this leaf. Parent F1 stays open until its other leaves pass.
