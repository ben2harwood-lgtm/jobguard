import { describe, expect, it, vi } from "vitest";
import {
  canonicalizeCommandInputCandidate,
  digestCommandInputCandidate,
  lpCommandInputCandidateV1Schema,
} from "../src/lp-command-contract.js";

// Candidate codec evidence only. These tests do not invoke the dispatcher or prove SQL authority.
const envelope = (significantInput: unknown) => ({ version: "lp-command-input.candidate.v1", significantInput });
const canonical = (input: unknown) => canonicalizeCommandInputCandidate(envelope(input));
const digest = (input: unknown) => digestCommandInputCandidate(envelope(input));

describe("LP5A-05 candidate significant-input codec", () => {
  it("binds every supplied field without excluding regenerated-looking IDs", () => {
    const input = { tenantId: "tenant-a", actor: "actor-a", jobId: "job-a", commandId: "command-a",
      authorizationId: "approval-a", revision: 1, amountPence: 123, currency: "GBP",
      closure: { recipient: "fictional recipient", policy: "candidate.v1" } };
    for (const field of Object.keys(input)) expect(digest({ ...input, [field]: null })).not.toBe(digest(input));
    expect(digest({ ...input, closure: { ...input.closure, policy: "candidate.v2" } })).not.toBe(digest(input));
  });

  it("is independent of object insertion order and uses code-unit key ordering", () => {
    const first = { z: [{ b: 2, a: 1 }], a: null, Z: true, "é": "value" };
    const second = { "é": "value", Z: true, a: null, z: [{ a: 1, b: 2 }] };
    expect(canonical(first)).toBe('{"significantInput":{"Z":true,"a":null,"z":[{"a":1,"b":2}],"é":"value"},"version":"lp-command-input.candidate.v1"}');
    expect(digest(first)).toBe(digest(second));
  });

  it("has a literal canonical vector and a version-bound SHA-256 vector", () => {
    const raw = envelope({ amountPence: 123, quantity: "1.250", acceptedAt: "2026-10-16T12:34:56.123456Z" });
    const expected = '{"significantInput":{"acceptedAt":"2026-10-16T12:34:56.123456Z","amountPence":123,"quantity":"1.250"},"version":"lp-command-input.candidate.v1"}';
    expect(canonicalizeCommandInputCandidate(raw)).toBe(expected);
    expect(digestCommandInputCandidate(raw)).toBe("62dad90e2156d474ba31fa1dabf3a73efe7915039ea49b3771bfb25aad97ab19");
  });

  it("retains nulls, array order, empty structures and exact safe integers", () => {
    expect(canonical([null, true, false, "", {}, [], Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]))
      .toBe('{"significantInput":[null,true,false,"",{},[],9007199254740991,-9007199254740991],"version":"lp-command-input.candidate.v1"}');
    expect(digest([1, 2])).not.toBe(digest([2, 1]));
    expect(digest({ a: null })).not.toBe(digest({}));
  });

  it("preserves timestamp precision and decimal-string representations without coercion", () => {
    expect(digest({ at: "2026-10-16T12:34:56.123456Z" })).not.toBe(digest({ at: "2026-10-16T12:34:56.123457Z" }));
    expect(digest({ quantity: "1.0" })).not.toBe(digest({ quantity: "1.00" }));
    expect(digest({ amountPence: 1 })).not.toBe(digest({ amountPence: "1" }));
  });

  it.each([undefined, NaN, Infinity, -Infinity, 0.1, -0, 9007199254740992, 1n, Symbol("value"), () => 1])
    ("refuses non-JSON or inexact numeric input %#", (value) => {
      expect(() => canonical({ nested: value })).toThrow();
      expect(lpCommandInputCandidateV1Schema.safeParse(envelope(value)).success).toBe(false);
    });

  it.each([new Date("2026-10-16T00:00:00.000Z"), new Map(), new Set(), Object.create({ inherited: 1 })])
    ("refuses implicit platform serialization %#", (value) => expect(() => canonical(value)).toThrow());

  it("does not invoke accessors or toJSON hooks", () => {
    const getter = vi.fn(() => 1), toJSON = vi.fn(() => ({ a: 1 }));
    const input = Object.defineProperty({}, "value", { enumerable: true, get: getter });
    expect(() => canonical(input)).toThrow();
    expect(() => canonical({ toJSON })).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it("refuses hidden fields, symbol keys, sparse arrays and decorated arrays", () => {
    const hidden = Object.defineProperty({ a: 1 }, "hidden", { value: 2 });
    const symbol = { a: 1, [Symbol("hidden")]: 2 };
    const sparse = new Array(2); sparse[1] = 1;
    const decorated = Object.assign([1], { other: 2 });
    for (const value of [hidden, symbol, sparse, decorated]) expect(() => canonical(value)).toThrow();
  });

  it("rejects cycles while permitting repeated non-cyclic objects", () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => canonical(cyclic)).toThrow();
    const same = { a: 1 };
    expect(digest([same, same])).toBe(digest([{ a: 1 }, { a: 1 }]));
  });

  it.each(["\u0000", "\ud800", "\udc00", "a\ud800z"])("refuses PostgreSQL-incompatible Unicode %#", (value) => {
    expect(() => canonical({ value })).toThrow();
    expect(() => canonical({ [value]: 1 })).toThrow();
  });

  it("keeps valid Unicode and escaped text distinct without normalization", () => {
    expect(canonical({ value: '😀\n"\\' })).toContain('😀\\n\\"\\\\');
    expect(digest("é")).not.toBe(digest("e\u0301"));
    const nullPrototype: Record<string, unknown> = Object.create(null); nullPrototype.a = 1;
    expect(digest(nullPrototype)).toBe(digest({ a: 1 }));
  });

  it.each(["__proto__", "prototype", "constructor"])("refuses reserved map key %s", (field) => {
    const input = Object.create(null) as Record<string, unknown>; input[field] = "value";
    expect(() => canonical(input)).toThrow();
  });

  it("bounds depth, node count and encoded UTF-8 bytes", () => {
    let deep: unknown = 1;
    for (let index = 0; index < 65; index++) deep = [deep];
    for (const input of [deep, Array.from({ length: 10_001 }, () => 1), "😀".repeat(262_144)]) {
      expect(() => canonical(input)).toThrow();
    }
  });
});

describe("LP5A-02 candidate codec envelope only", () => {
  it.each([
    { version: "lp-command-input.candidate.v2", significantInput: {} },
    { version: "lp-command-input.candidate.v1", significantInput: {}, authorized: true },
    { version: "lp-command-input.candidate.v1" },
    { significantInput: {} }, null,
  ])("refuses unknown envelope keys, versions and missing input %#", (raw) => {
    expect(lpCommandInputCandidateV1Schema.safeParse(raw).success).toBe(false);
    expect(() => canonicalizeCommandInputCandidate(raw)).toThrow();
  });
});
