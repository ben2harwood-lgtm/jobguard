import { z } from "zod";

const opaqueId = z.string().min(1).max(200);
export const merchantFeedEnvelopeV1 = z.object({
  version: z.literal("merchant-feed-envelope.v1"),
  sourceReference: opaqueId,
  documentKind: z.unknown().optional(),
  schemaVersion: z.unknown().optional(),
  document: z.unknown(),
}).strict();

const selectedSchemaV1 = z.object({
  schemaId: opaqueId, documentKind: opaqueId, schemaVersion: opaqueId,
}).strict();
const diagnosticV1 = z.object({
  code: z.enum([
    "missing_document_kind", "document_kind_mismatch", "missing_schema_version", "schema_version_mismatch",
    "missing_field", "type_mismatch", "unexpected_fields", "invalid_value",
  ]),
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
}).strict();
const resultBase = { version: z.literal("merchant-feed-result.v1") };
const checkedBase = { ...resultBase, sourceReference: opaqueId, selectedSchema: selectedSchemaV1 };
export const merchantFeedResultV1 = z.union([
  z.object({ ...checkedBase, status: z.literal("compatible"), diagnostics: z.tuple([]) }).strict(),
  z.object({ ...checkedBase, status: z.literal("review_required"), diagnostics: z.array(diagnosticV1).min(1) }).strict(),
  z.object({ ...resultBase, status: z.literal("error"), code: z.literal("malformed_envelope") }).strict(),
  z.object({ ...resultBase, status: z.literal("error"), sourceReference: opaqueId,
    code: z.enum(["invalid_schema_descriptor", "unsupported_schema_configuration"]) }).strict(),
]);
export type MerchantFeedResult = z.infer<typeof merchantFeedResultV1>;
type Diagnostic = z.infer<typeof diagnosticV1>;
type StructuralPath = Diagnostic["path"];

// This is deliberately local to the installed Zod 3.25.67 representation. Unknown
// nodes/checks fail closed; this is not a registry or a general schema interpreter.
const stringChecks = new Set([
  "min", "max", "length", "email", "url", "emoji", "uuid", "nanoid", "cuid", "cuid2", "ulid",
  "includes", "startsWith", "endsWith", "regex", "jwt", "datetime", "date", "time", "duration",
  "ip", "cidr", "base64", "base64url",
]);
const numberChecks = new Set(["min", "max", "int", "multipleOf", "finite"]);

function supported(schema: unknown, ancestors = new Set<z.ZodTypeAny>()): schema is z.ZodTypeAny {
  if (!(schema instanceof z.ZodType) || ancestors.has(schema)) return false;
  // Zod's optional()/nullable() install internal maps, but their pinned _parse
  // implementations only unwrap and never invoke those maps. All nodes that
  // can emit issues must have no schema-level error callback.
  if (!(schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) && schema._def.errorMap !== undefined) return false;
  ancestors.add(schema);
  try {
    if (schema instanceof z.ZodObject) {
      return schema._def.unknownKeys === "strict" && schema._def.catchall instanceof z.ZodNever
        && Object.values(schema.shape).every(child => supported(child, ancestors));
    }
    if (schema instanceof z.ZodArray) return supported(schema.element, ancestors);
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return supported(schema.unwrap(), ancestors);
    if (schema instanceof z.ZodString) {
      return !schema._def.coerce && schema._def.checks.every(check => stringChecks.has(check.kind));
    }
    if (schema instanceof z.ZodNumber) {
      return !schema._def.coerce && schema._def.checks.every(check => numberChecks.has(check.kind));
    }
    if (schema instanceof z.ZodBoolean) return !schema._def.coerce;
    if (schema instanceof z.ZodEnum) return true;
    if (schema instanceof z.ZodLiteral) {
      const value: unknown = schema.value;
      return value === null || typeof value === "string" || typeof value === "boolean"
        || (typeof value === "number" && Number.isFinite(value));
    }
    return false;
  } finally {
    ancestors.delete(schema);
  }
}

// Never trust an issue path as diagnostic text. Reconstruct it using registered
// object keys and numeric array positions; stop at the last known container.
function structuralPath(schema: z.ZodTypeAny, issuePath: (string | number)[]): StructuralPath {
  const path: StructuralPath = ["document"];
  let node = schema;
  for (const part of issuePath) {
    while (node instanceof z.ZodOptional || node instanceof z.ZodNullable) node = node.unwrap();
    if (node instanceof z.ZodObject && typeof part === "string") {
      const key = Object.keys(node.shape).find(field => field === part);
      if (key === undefined) break;
      path.push(key);
      node = node.shape[key] as z.ZodTypeAny;
    } else if (node instanceof z.ZodArray && typeof part === "number" && Number.isSafeInteger(part) && part >= 0) {
      path.push(part);
      node = node.element;
    } else break;
  }
  return path;
}

function issueDiagnostic(schema: z.ZodTypeAny, issue: z.ZodIssue): Diagnostic {
  let code: Diagnostic["code"] = "invalid_value";
  if (issue.code === "unrecognized_keys") code = "unexpected_fields";
  else if (issue.code === "invalid_type") code = issue.received === "undefined" ? "missing_field" : "type_mismatch";
  return { code, path: structuralPath(schema, issue.path) };
}

// Plain z.number() in the pinned Zod accepts Infinity. A successful parse has
// only registered keys, so scan its private copy to enforce finite numbers too.
function nonFiniteDiagnostics(value: unknown, path: StructuralPath = ["document"]): Diagnostic[] {
  if (typeof value === "number" && !Number.isFinite(value)) return [{ code: "invalid_value", path }];
  if (Array.isArray(value)) return value.flatMap((child: unknown, index) => nonFiniteDiagnostics(child, [...path, index]));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => nonFiniteDiagnostics(child, [...path, key]));
  }
  return [];
}

function orderedDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  // Segment-by-segment ordering: containing object first, keys by code unit,
  // array positions numerically; ties use the fixed reason code. Deduplicate.
  const unique = [...new Map(diagnostics.map(item => [JSON.stringify(item), item])).values()];
  return unique.sort((left, right) => {
    for (let index = 0; index < Math.min(left.path.length, right.path.length); index++) {
      const a = left.path[index]!;
      const b = right.path[index]!;
      if (a === b) continue;
      if (typeof a === "number" && typeof b === "number") return a - b;
      return a < b ? -1 : 1;
    }
    return left.path.length - right.path.length || (left.code < right.code ? -1 : left.code > right.code ? 1 : 0);
  });
}

// z.unknown intentionally does not execute or parse the descriptor's validator.
const descriptorV1 = selectedSchemaV1.extend({ schema: z.unknown() }).strict();

/** Pure structural check; neither compatibility nor review confers commercial authority. */
export function reviewMerchantFeed(input: unknown, descriptor: unknown): MerchantFeedResult {
  const version = "merchant-feed-result.v1" as const;
  let envelope: z.infer<typeof merchantFeedEnvelopeV1>;
  try {
    const parsed = merchantFeedEnvelopeV1.safeParse(input);
    if (!parsed.success) return { version, status: "error", code: "malformed_envelope" };
    envelope = parsed.data;
  } catch {
    return { version, status: "error", code: "malformed_envelope" };
  }
  const { sourceReference } = envelope;
  let registration: z.infer<typeof descriptorV1>;
  try {
    const parsed = descriptorV1.safeParse(descriptor);
    if (!parsed.success) return { version, status: "error", sourceReference, code: "invalid_schema_descriptor" };
    registration = parsed.data;
  } catch {
    return { version, status: "error", sourceReference, code: "invalid_schema_descriptor" };
  }
  const { schema, schemaId, documentKind, schemaVersion } = registration;
  try {
    if (!(schema instanceof z.ZodObject) || !supported(schema)) {
      return { version, status: "error", sourceReference, code: "unsupported_schema_configuration" };
    }
  } catch {
    return { version, status: "error", sourceReference, code: "unsupported_schema_configuration" };
  }
  // The schema has been completely inspected before any document validation.
  const selectedSchema = { schemaId, documentKind, schemaVersion };
  const diagnostics: Diagnostic[] = [];
  if (envelope.documentKind === undefined) diagnostics.push({ code: "missing_document_kind", path: ["documentKind"] });
  else if (envelope.documentKind !== documentKind) diagnostics.push({ code: "document_kind_mismatch", path: ["documentKind"] });
  if (envelope.schemaVersion === undefined) diagnostics.push({ code: "missing_schema_version", path: ["schemaVersion"] });
  else if (envelope.schemaVersion !== schemaVersion) diagnostics.push({ code: "schema_version_mismatch", path: ["schemaVersion"] });
  // Kind/version mismatches never trigger a fallback or a parse against another schema.
  if (diagnostics.length === 0) {
    try {
      const parsed = schema.safeParse(envelope.document);
      if (parsed.success) diagnostics.push(...nonFiniteDiagnostics(parsed.data));
      else diagnostics.push(...parsed.error.issues.map(issue => issueDiagnostic(schema, issue)));
    } catch {
      diagnostics.push({ code: "invalid_value", path: ["document"] });
    }
  }
  if (diagnostics.length) {
    return { version, status: "review_required", sourceReference, selectedSchema, diagnostics: orderedDiagnostics(diagnostics) };
  }
  return { version, status: "compatible", sourceReference, selectedSchema, diagnostics: [] };
}
