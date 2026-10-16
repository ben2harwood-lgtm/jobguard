# Merchant feed structural review v1

M5-4A is an isolated, synchronous pure-core library, imported directly from
`packages/core/src/merchant-feed-review.ts`. It has no package-root export or
application integration. Compatibility establishes only structural agreement
with the exact schema selected by trusted calling code. It establishes no
authenticity, permission, commercial correctness or payment entitlement.

## API and trust boundary

`reviewMerchantFeed(input: unknown, descriptor: unknown): MerchantFeedResult`
returns a value conforming to exported `merchantFeedResultV1`. Exported
`merchantFeedEnvelopeV1` describes the strict outer input contract:

```ts
{
  version: "merchant-feed-envelope.v1",
  sourceReference: "opaque-fictional-source", // 1–200 code units; no normalization
  documentKind: "dispatch",                 // optional unknown input; checked exactly
  schemaVersion: "1",                       // optional unknown input; checked exactly
  document: { reference: "FICTIONAL-001" }   // untrusted document; never selects rules
}
```

The separate descriptor is a strict object with `schemaId`, `documentKind`,
`schemaVersion` (each a string of 1–200 code units) and `schema` (a supported Zod
validator). The descriptor is a trusted code/configuration choice, never an
object derived from document contents, a schema URL, a model output or a remote
schema. The API validates the descriptor's envelope and supported validator
subset defensively; it is not a sandbox for malicious JavaScript, overridden
Zod implementations, getters or monkey-patched validators. Use ordinary data
objects as documents and ordinary pinned Zod constructors as validators.

The checker validates the envelope, then descriptor, then the entire supported
schema subset before examining document structure. It compares the supplied kind
and version using exact string equality. Missing (`undefined` or absent) metadata
and present mismatches produce review. Empty strings, nulls and numeric versions
are mismatches. There is no inference, fallback, coercion or version registry.
When metadata fails, only metadata diagnostics are returned; the payload is not
validated against a mismatched schema.

## Supported schema subset

Inspection of the Zod **3.25.67** representation stays inside this module and is
covered against that installed dependency. Any dependency upgrade requires
rechecking these assumptions and tests.

- The root must be a strict `z.object(...).strict()`. Every nested object must
  also be strict, including objects inside arrays and optional/nullable wrappers.
- Arrays, nested arrays, strings, finite numbers, booleans, scalar literals
  (string, finite number, boolean or null), `z.enum`, optional and nullable nodes.
- Validation-only string checks: min/max/exact length, email, URL, emoji, UUID,
  nanoid, cuid/cuid2, ulid, includes, startsWith, endsWith, regex, JWT, datetime,
  date/time/duration, IP/CIDR and base64/base64url. No URL is fetched.
- Number checks: min/max, integer, multipleOf and finite. Non-finite numbers
  always require review, even if the selected `z.number()` omits `.finite()`.
- Array length bounds are preserved. Validation-only check messages are ignored
  by diagnostic generation. No normalized document is returned.

Rejected configurations include coercion, defaults, catch fallbacks, effects
(transforms, preprocessors, custom refinements and asynchronous callbacks),
pipelines, string trim/case changes, non-strict/strip/passthrough objects,
non-never catchalls, records, lazy schemas, unions, intersections, tuples,
any/unknown/never nodes, standalone null/undefined/NaN nodes, native enums,
dates, bigints, maps, sets, promises, function schemas, branded/readonly nodes
and any unlisted construct. A standalone optional/nullable object is not a
strict object root. Unsupported descendants are rejected even when their
corresponding fields are absent from the document.

Schema-level error maps on issue-producing nodes are also rejected so caller
error callbacks cannot execute. Use factory constructors such as `z.array(...)`
without creation-parameter error maps; in the pinned Zod, some convenience
methods (for example `z.string().array()`) install maps and are consequently
outside this deliberately narrow subset. The internal maps installed on
optional/nullable wrappers are inert: the inspected pinned implementations
unwrap without invoking those maps. Their descendants must still pass inspection.
Callers must not change Zod's global error map. There is no mutation of global
Zod state in this library.

## Outcomes

All results have `version: "merchant-feed-result.v1"` and strict schemas.

| Status | Fields and meaning |
| --- | --- |
| `compatible` | `sourceReference`, `selectedSchema: { schemaId, documentKind, schemaVersion }`, `diagnostics: []`; structure matches the selected rules. |
| `review_required` | Same source and selected identity, plus nonempty `diagnostics`; structural compatibility could not be established. |
| `error` / `malformed_envelope` | Only version, status and fixed code. No source or input is echoed. Includes null/array input, invalid/missing source, unsupported envelope version or extra envelope fields. |
| `error` / `invalid_schema_descriptor` | Version, status, fixed code and validated `sourceReference`; descriptor envelope is invalid. |
| `error` / `unsupported_schema_configuration` | Version, status, fixed code and validated `sourceReference`; validator is outside the supported subset. No document validation occurs. |

The validated source reference is preserved verbatim in its dedicated field for
every outcome after envelope validation. It is never interpolated into diagnostics.
Descriptor errors return no selected identity. Exceptions while inspecting schema
configuration become the unsupported-configuration error. Exceptions while
validating document structure become review with `invalid_value` at `["document"]`.
No exception text is returned. Missing documents require review. Documents are
never rewritten, returned as normalized values, stored or used for side effects.

## Safe diagnostics

Each diagnostic is exactly `{ code, path }`, with no message or received value.
The fixed codes are `missing_document_kind`, `document_kind_mismatch`,
`missing_schema_version`, `schema_version_mismatch`, `missing_field`,
`type_mismatch`, `unexpected_fields`, and `invalid_value`.

Metadata paths are `["documentKind"]` and `["schemaVersion"]`. Document paths
start at `["document"]`; subsequent segments are registered field names and
nonnegative array positions. Paths are reconstructed from the selected schema,
never copied blindly from raw issues. Unexpected keys are reported only at their
containing object, including an array position where applicable. Unexpected key
names, document values, raw Zod issues/messages and exception messages are never
returned. Trusted field names must therefore be structural names suitable for
diagnostics; never embed private data in registered field names. The source field
is an opaque caller reference, not automatically safe for unrestricted logging.

Diagnostics are deduplicated and ordered segment by segment: containing path
before descendants, string field names in code-unit order, array positions in
numeric order, then fixed code for equal paths. Validation may stop at a failed
container, and the list is not a promise of every downstream error.

## Fictional example

```ts
const descriptor = {
  schemaId: "fictional-dispatch-v1",
  documentKind: "dispatch",
  schemaVersion: "1",
  schema: z.object({ reference: z.string() }).strict(),
};
const input = {
  version: "merchant-feed-envelope.v1",
  sourceReference: "opaque-fictional-source",
  documentKind: "dispatch", schemaVersion: "1",
  document: { reference: "FICTIONAL-001", extraPrivateKey: "fictional-value" },
};
reviewMerchantFeed(input, descriptor);
// review_required, retaining source and selected identity; diagnostics:
// [{ code: "unexpected_fields", path: ["document"] }]
```

Removing that unexpected field produces `compatible`. Changing version to `"2"`
produces `schema_version_mismatch`, without selecting another schema. Registering
`z.object({ reference: z.coerce.string() }).strict()` produces
`unsupported_schema_configuration` before document validation.

## Caller responsibilities and held integration

Callers own schema selection/version registration and upstream input/resource
limits. This synchronous helper has no streaming, ingestion or resource-isolation
boundary. Callers must gate any downstream processing on the result and provide
their own authorized review workflow. This module verifies no hashes, provenance,
tenant binding, authorization, supplier identity, evidence lifecycle or commercial
facts. It does not implement quarantine, alerts, capability evidence, deduplication
or any write path. Those remain separate M5-4 work and release-gated integration.
