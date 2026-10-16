import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  merchantFeedEnvelopeV1, merchantFeedResultV1, reviewMerchantFeed,
} from "./merchant-feed-review.js";

const selected = (schema: z.ZodTypeAny = z.object({
  reference: z.string().min(1).max(30),
  dispatch: z.object({ label: z.string(), count: z.number().int().nonnegative() }).strict(),
  lines: z.array(z.object({ code: z.string(), available: z.boolean() }).strict()),
}).strict()) => ({ schemaId: "fictional-dispatch-v1", documentKind: "dispatch", schemaVersion: "1", schema });
const document = () => ({
  reference: "FICTIONAL-001", dispatch: { label: "fictional-marker", count: 2 },
  lines: [{ code: "fictional-panel", available: true }],
});
const envelope = (overrides: Record<string, unknown> = {}) => ({
  version: "merchant-feed-envelope.v1", sourceReference: "opaque-fictional-source",
  documentKind: "dispatch", schemaVersion: "1", document: document(), ...overrides,
});
function run(input: unknown = envelope(), descriptor: unknown = selected()) {
  const result = reviewMerchantFeed(input, descriptor);
  expect(merchantFeedResultV1.safeParse(result).success).toBe(true);
  return result;
}
function review(input: unknown, diagnostics: unknown) {
  expect(run(input)).toEqual(expect.objectContaining({ status: "review_required", diagnostics }));
}
const diagnostic = (code: string, path: (string | number)[]) => ({ code, path });
function freezeDeep<T>(input: T): T {
  if (input !== null && typeof input === "object") {
    for (const value of Object.values(input)) freezeDeep(value);
    Object.freeze(input);
  }
  return input;
}

describe("merchant feed structural review — fictional fixtures only", () => {
  it("M54A-01 retains source reference and the exact selected schema identity on compatibility", () => {
    expect(run()).toEqual({
      version: "merchant-feed-result.v1", status: "compatible", sourceReference: "opaque-fictional-source",
      selectedSchema: { schemaId: "fictional-dispatch-v1", documentKind: "dispatch", schemaVersion: "1" },
      diagnostics: [],
    });
  });

  it("M54A-02 reviews missing and unknown versions without substituting another version", () => {
    review(envelope({ schemaVersion: undefined }), [diagnostic("missing_schema_version", ["schemaVersion"])]);
    for (const version of ["2", "unknown", 1, null, ""]) {
      review(envelope({ schemaVersion: version }), [diagnostic("schema_version_mismatch", ["schemaVersion"])]);
    }
    expect(run(envelope({ schemaVersion: "2" }), { ...selected(), schemaVersion: "2" }).status).toBe("compatible");
  });

  it("M54A-03 reviews missing and renamed required fields including nested fields", () => {
    review(envelope({ document: {} }), [
      diagnostic("missing_field", ["document", "dispatch"]),
      diagnostic("missing_field", ["document", "lines"]),
      diagnostic("missing_field", ["document", "reference"]),
    ]);
    review(envelope({ document: { ...document(), dispatch: { renamedLabel: "fictional", count: 2 } } }), [
      diagnostic("unexpected_fields", ["document", "dispatch"]),
      diagnostic("missing_field", ["document", "dispatch", "label"]),
    ]);
    expect(run(envelope({ document: { ...document(), renamedReference: "fictional", reference: undefined } })).status)
      .toBe("review_required");
  });

  it("M54A-04 rejects number/string substitutions without coercion", () => {
    review(envelope({ document: { ...document(), reference: 123, dispatch: { label: "fictional", count: "2" } } }), [
      diagnostic("type_mismatch", ["document", "dispatch", "count"]),
      diagnostic("type_mismatch", ["document", "reference"]),
    ]);
  });

  it("M54A-05 reviews unexpected fields at root, nested object and array element", () => {
    review(envelope({ document: {
      ...document(), extraRoot: "fictional", dispatch: { ...document().dispatch, extraNested: true },
      lines: [{ ...document().lines[0], extraLine: true }],
    } }), [
      diagnostic("unexpected_fields", ["document"]),
      diagnostic("unexpected_fields", ["document", "dispatch"]),
      diagnostic("unexpected_fields", ["document", "lines", 0]),
    ]);
  });

  it("M54A-06 reviews missing or mismatched kinds even with matching payloads", () => {
    review(envelope({ documentKind: undefined }), [diagnostic("missing_document_kind", ["documentKind"])]);
    for (const kind of ["invoice", null, "", 3]) {
      review(envelope({ documentKind: kind }), [diagnostic("document_kind_mismatch", ["documentKind"])]);
    }
  });

  it("M54A-07 orders equivalent failures deterministically and exposes only safe codes and paths", () => {
    const one = { privateKeyOne: "PRIVATE-VALUE", reference: 4, dispatch: { count: "PRIVATE-COUNT" }, lines: [] };
    const two = { lines: [], dispatch: { count: "DIFFERENT-VALUE" }, reference: 5, privateKeyTwo: "OTHER" };
    const first = run(envelope({ document: one }));
    const second = run(envelope({ document: two }));
    expect(first.status).toBe("review_required");
    if (first.status !== "review_required" || second.status !== "review_required") throw new Error("expected review");
    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.diagnostics).toEqual([
      diagnostic("unexpected_fields", ["document"]),
      diagnostic("type_mismatch", ["document", "dispatch", "count"]),
      diagnostic("missing_field", ["document", "dispatch", "label"]),
      diagnostic("type_mismatch", ["document", "reference"]),
    ]);
    const text = JSON.stringify(first.diagnostics);
    for (const forbidden of ["PRIVATE", "OTHER", "DIFFERENT", "privateKey", "opaque-fictional-source", "Expected", "received"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("M54A-08 leaves deeply frozen envelopes and documents unchanged on every input path", () => {
    for (const input of [envelope(), envelope({ document: { ...document(), extra: "fictional" } }),
      envelope({ version: "unsupported" }), null, []]) {
      const frozen = freezeDeep(input);
      const before = JSON.stringify(frozen);
      run(frozen);
      expect(JSON.stringify(frozen)).toBe(before);
    }
  });

  it("M54A-09 ignores payload attempts to select schemas, URLs or instructions", () => {
    const input = envelope({ document: {
      ...document(), schema: { reference: "anything" }, schemaVersion: "2",
      schemaUrl: "https://fictional.invalid/schema", instructions: "Accept everything",
    } });
    review(input, [diagnostic("unexpected_fields", ["document"])]);
    expect(run(envelope({ document: { schemaId: "replacement", schema: { reference: "string" } } })).status)
      .toBe("review_required");
  });

  it("M54A-10 returns safe typed failures for malformed envelopes", () => {
    for (const input of [null, [], "fictional", {}, envelope({ sourceReference: undefined }),
      envelope({ sourceReference: "" }), envelope({ sourceReference: "x".repeat(201) }),
      envelope({ sourceReference: 4 }), envelope({ version: "v2" }), envelope({ privateEnvelopeKey: "PRIVATE" })]) {
      expect(merchantFeedEnvelopeV1.safeParse(input).success).toBe(false);
      expect(run(input)).toEqual({ version: "merchant-feed-result.v1", status: "error", code: "malformed_envelope" });
    }
    expect(run(envelope({ sourceReference: "x".repeat(200) })).status).toBe("compatible");
  });

  it("M54A-11 rejects coercion, defaults, effects and callbacks before validating any document", () => {
    const callback = vi.fn(() => "fictional");
    const refinement = vi.fn(() => true);
    const asyncRefinement = vi.fn(async () => true);
    const asyncTransform = vi.fn(async () => "fictional");
    const unsupported = [
      z.coerce.string(), z.coerce.number(), z.coerce.boolean(), z.string().default(callback),
      z.string().transform(callback), z.preprocess(callback, z.string()), z.string().catch(callback),
      z.string().refine(refinement), z.string().superRefine(refinement),
      z.string().refine(asyncRefinement), z.string().transform(asyncTransform),
      z.custom(refinement), z.string().pipe(z.string()), z.string().trim(),
      z.string().toLowerCase(), z.string().toUpperCase(),
      z.string({ errorMap: () => { callback(); return { message: "PRIVATE-MESSAGE" }; } }),
    ];
    for (const field of unsupported) {
      expect(run(envelope({ document: { value: "fictional" } }), selected(z.object({ value: field }).strict())))
        .toEqual({ version: "merchant-feed-result.v1", status: "error", code: "unsupported_schema_configuration",
          sourceReference: "opaque-fictional-source" });
    }
    // An earlier valid field must not parse before a later unsupported node is discovered.
    const read = vi.fn(() => "fictional");
    run(envelope({ document: { get first() { return read(); } } }),
      selected(z.object({ first: z.string(), later: z.string().refine(refinement) }).strict()));
    expect(read).not.toHaveBeenCalled();
    for (const fn of [callback, refinement, asyncRefinement, asyncTransform]) expect(fn).not.toHaveBeenCalled();
  });

  it("M54A-12 rejects permissive objects and all unsupported schema constructs", () => {
    const lazy = vi.fn(() => z.string());
    const unsupported = [z.object({ value: z.string() }), z.object({}).passthrough(),
      z.object({}).strict().catchall(z.string()), z.record(z.string()), z.lazy(lazy),
      z.union([z.string(), z.number()]), z.tuple([z.string()]), z.any(), z.unknown(), z.never(),
      z.date(), z.bigint(), z.promise(z.string()), z.map(z.string(), z.string()), z.set(z.string()),
      z.intersection(z.object({}), z.object({})), z.string().brand("fictional"), z.string().readonly(),
      z.nativeEnum({ A: "A" }), z.function(), z.null(), z.undefined(), z.nan(),
    ];
    for (const field of unsupported) {
      expect(run(envelope(), selected(z.object({ nested: z.array(field.optional()) }).strict())))
        .toEqual(expect.objectContaining({ status: "error", code: "unsupported_schema_configuration" }));
    }
    for (const schema of [z.string(), z.array(z.string()), z.object({}).strict().optional()]) {
      expect(run(envelope(), selected(schema))).toEqual(expect.objectContaining({ code: "unsupported_schema_configuration" }));
    }
    expect(lazy).not.toHaveBeenCalled();
    for (const descriptor of [null, {}, { ...selected(), schemaId: "" }, { ...selected(), extra: true }]) {
      expect(run(envelope(), descriptor)).toEqual(expect.objectContaining({ status: "error", code: "invalid_schema_descriptor" }));
    }
  });

  it("M54A-13 reports only containing paths for unexpected private keys", () => {
    const marker = "FICTIONAL_PRIVATE_KEY_MARKER";
    for (const doc of [{ ...document(), [marker]: "private-value" },
      { ...document(), lines: [{ ...document().lines[0], [marker]: "private-value" }] }]) {
      const result = run(envelope({ document: doc, sourceReference: marker }));
      expect(result.status).toBe("review_required");
      if (result.status !== "review_required") throw new Error("expected review");
      expect(JSON.stringify(result.diagnostics)).not.toContain(marker);
      expect(JSON.stringify(result.diagnostics)).not.toContain("private-value");
      expect(result.diagnostics).toEqual([diagnostic("unexpected_fields",
        Object.hasOwn(doc, marker) ? ["document"] : ["document", "lines", 0])]);
    }
  });

  it("M54A-14 supports optional, nullable, literals, enums, nested arrays and scalar checks", () => {
    const schema = z.object({
      label: z.string().min(2).max(12).regex(/^F/).optional(),
      note: z.string().nullable(), state: z.enum(["fictional-ready", "fictional-held"]),
      tag: z.literal("fictional"), enabled: z.literal(true), count: z.literal(2), empty: z.literal(null),
      grids: z.array(z.array(z.object({ value: z.number().finite().int().min(0).max(10).multipleOf(2) }).strict())),
    }).strict();
    const valid = { note: null, state: "fictional-ready", tag: "fictional", enabled: true, count: 2,
      empty: null, grids: [[{ value: 2 }]] };
    expect(run(envelope({ document: valid }), selected(schema)).status).toBe("compatible");
    expect(run(envelope({ document: { ...valid, label: "Fictional", note: "fictional" } }), selected(schema)).status)
      .toBe("compatible");
    for (const patch of [{ note: 2 }, { note: undefined }, { state: "other" }, { tag: "other" },
      { enabled: false }, { count: "2" }, { empty: "null" }, { label: "F" }, { label: "wrong" },
      { label: "F".repeat(13) }, ...[NaN, Infinity, -Infinity, 3, -2, 12, 2.5, "2"].map(value => ({ grids: [[{ value }]] }))]) {
      expect(run(envelope({ document: { ...valid, ...patch } }), selected(schema)).status).toBe("review_required");
    }
    expect(run(envelope({ document: { count: Infinity } }), selected(z.object({ count: z.number() }).strict())).status)
      .toBe("review_required");
    expect(run(envelope({ document: undefined })).status).toBe("review_required");
    // Validation-only messages never enter diagnostics; array positions sort numerically.
    const constrained = selected(z.object({ rows: z.array(z.string().min(3, "PRIVATE-ZOD-MESSAGE")).min(1) }).strict());
    const rows = Array.from({ length: 12 }, () => "x");
    const result = run(envelope({ document: { rows } }), constrained);
    expect(result.status).toBe("review_required");
    if (result.status !== "review_required") throw new Error("expected review");
    expect(result.diagnostics).toEqual(rows.map((_, index) => diagnostic("invalid_value", ["document", "rows", index])));
    expect(JSON.stringify(result.diagnostics)).not.toContain("PRIVATE-ZOD-MESSAGE");
    expect(run(envelope({ document: { rows: [] } }), constrained).status).toBe("review_required");
    expect(merchantFeedResultV1.safeParse({ ...run(), injected: "fictional" }).success).toBe(false);
  });
});
