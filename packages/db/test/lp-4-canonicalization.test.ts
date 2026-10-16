import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  auditStatementInputV2Schema, auditStatementEventV2Schema,
  canonicalAuditStatementV2, canonicalAuditStatementPayloadV2, verifyAuditStatementV2,
  canonicalAuditHash, verifyAuditChain,
} from "../src/audit.js";

// Standalone proposed-format vectors. No database writer uses this format yet.
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const tenantId = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const input = () => ({
  version: "audit-statement-input.v2" as const, id, subjectType: "job", subjectRef: id,
  payload: { references: { source: "fixture:1" }, classifications: { action: "operational" as const } },
});
const event = () => {
  const base = {
    ...input(), version: "audit.statement.v2" as const, tenantId, sequence: "1",
    actorRef: "membership:fixture", eventType: "audit.statement.recorded" as const,
    trust: "caller_statement" as const, occurredAt: "2026-10-16T12:01:02.123456Z",
    previousHash: null, payloadHash: digest(canonicalAuditStatementPayloadV2(input().payload)),
  };
  return { ...base, eventHash: digest(canonicalAuditStatementV2(base)) };
};

describe("LP-4 isolated statement format preparation (no database cutover)", () => {
  it("[LP4-04 partial] the input has no caller-selected sealing or attribution fields", () => {
    expect(auditStatementInputV2Schema.parse(input())).toEqual(input());
    for (const key of ["tenantId", "actorRef", "sequence", "occurredAt", "previousHash", "payloadHash", "eventHash", "trust", "eventType"]) {
      expect(auditStatementInputV2Schema.safeParse({ ...input(), [key]: "invalid" }).success, key).toBe(false);
    }
  });

  it.each(["approval.approved", "payment.settled", "command.succeeded", "unknown"])(
    "[LP4-05 partial] a statement cannot select authoritative event family %s", eventType => {
      expect(auditStatementEventV2Schema.safeParse({ ...event(), eventType }).success).toBe(false);
    },
  );

  it("[LP4-07 partial] structural verification binds the lower-trust label", () => {
    const sealed = event();
    expect(verifyAuditStatementV2(sealed)).toEqual(sealed);
    for (const trust of [undefined, null, "checked_operation", "legacy", "caller_statement "]) {
      expect(() => verifyAuditStatementV2({ ...sealed, trust })).toThrow();
    }
    expect(() => verifyAuditStatementV2({ ...sealed, version: "audit.v1" })).toThrow();
  });

  it.each(["tenantId", "actorRef", "eventType", "subjectType", "subjectRef", "trust", "sequence", "occurredAt", "payloadHash", "previousHash", "eventHash", "id", "version"])(
    "[LP4-08 partial] payload keys cannot shadow envelope field %s", key => {
      for (const name of [key, key.toUpperCase(), key.replace(/[A-Z]/gu, letter => `_${letter.toLowerCase()}`)]) {
        expect(auditStatementInputV2Schema.safeParse({ ...input(), payload: { references: { [name]: "substitute" } } }).success).toBe(false);
      }
    },
  );

  it("[LP4-08 partial] invalid, scalar and nested payloads are refused, never coerced", () => {
    for (const payload of [null, [], "invalid", 1, { tenantId }, { references: null }, { references: undefined }, { references: { source: undefined } }, { references: { source: { actorRef: "substitute" } } }, JSON.parse('{"references":{"__proto__":"invalid"}}')]) {
      expect(auditStatementInputV2Schema.safeParse({ ...input(), payload }).success).toBe(false);
    }
    // Objects have already lost duplicate JSON keys. This codec accepts no raw JSON text;
    // duplicate-key rejection at the future raw boundary still needs its own implementation.
    expect(auditStatementInputV2Schema.safeParse('{"version":"audit-statement-input.v2","version":"audit.v1"}').success).toBe(false);
  });

  it("[LP4-09 partial] UUIDs have one textual representation", () => {
    const lower = "abcdefab-0000-4000-8000-000000000001";
    expect(auditStatementInputV2Schema.safeParse({ ...input(), id: lower }).success).toBe(true);
    expect(auditStatementInputV2Schema.safeParse({ ...input(), id: lower.toUpperCase() }).success).toBe(false);
  });

  it("[LP4-08 partial] every envelope field and payload fact is hash-bound", () => {
    const sealed = event();
    const changes = {
      id: tenantId, tenantId: id, actorRef: "membership:other", sequence: "2",
      subjectType: "document", subjectRef: tenantId, occurredAt: "2026-10-16T12:01:02.123457Z",
      previousHash: "a".repeat(64), payloadHash: "b".repeat(64), eventHash: "c".repeat(64),
      payload: { references: { source: "fixture:2" } },
    };
    for (const [key, value] of Object.entries(changes)) {
      expect(() => verifyAuditStatementV2({ ...sealed, [key]: value }), key).toThrow();
    }
  });

  it("[LP4-09 partial] byte ordering is explicit for punctuation, case and numeric-looking keys", () => {
    const payload = { references: { "2": "two", "10": "ten", a: "lower", Z: "upper", "@": "at", "/": "slash", "_": "underscore", ":": "colon", "-": "dash", ".": "dot" } };
    expect(canonicalAuditStatementPayloadV2(payload)).toBe('{"references":{"-":"dash",".":"dot","/":"slash","10":"ten","2":"two",":":"colon","@":"at","Z":"upper","_":"underscore","a":"lower"}}');
    expect(canonicalAuditStatementPayloadV2({ references: { a: "lower", Z: "upper" } })).toBe('{"references":{"Z":"upper","a":"lower"}}');
  });

  it("[LP4-09 partial] envelope bytes are stable across property insertion order", () => {
    const { eventHash: _hash, ...sealed } = event();
    const reversed = Object.fromEntries(Object.entries(sealed).reverse());
    expect(canonicalAuditStatementV2(reversed)).toBe(canonicalAuditStatementV2(sealed));
    expect(canonicalAuditStatementV2(sealed)).toContain('"trust":"caller_statement"');
    // Independently calculated with Python json.dumps(sort_keys=True, separators=(",", ":"))
    // and hashlib.sha256 over UTF-8; these are format vectors, never source-file fingerprints.
    expect(sealed.payloadHash).toBe("a139b9135e9ab4ffdeab3500acae7ca4e2e548762c7708e4386589a073bef5b9");
    expect(event().eventHash).toBe("4bc1570d6da4009de1a42d2b251247d3d213f686684085d574440816be67819e");
  });

  it("[LP4-10 partial] stored timestamp precision is retained without Date conversion", () => {
    expect(verifyAuditStatementV2(event()).occurredAt).toBe("2026-10-16T12:01:02.123456Z");
    for (const occurredAt of ["2026-02-30T12:01:02.123456Z", "0000-01-01T00:00:00.000000Z", "2026-10-16T12:01:02.123Z", "2026-10-16T13:01:02.123456+01:00", "2026-10-16T12:01:60.123456Z"]) {
      expect(auditStatementEventV2Schema.safeParse({ ...event(), occurredAt }).success, occurredAt).toBe(false);
    }
    expect(auditStatementEventV2Schema.safeParse({ ...event(), occurredAt: "2024-02-29T00:00:00.000001Z" }).success).toBe(true);
  });

  it("[LP4-09 partial] sequences use canonical decimal bigint text", () => {
    for (const sequence of ["0", "01", "-1", "1.0", "1e3", "9223372036854775808", 1, null]) {
      expect(auditStatementEventV2Schema.safeParse({ ...event(), sequence }).success).toBe(false);
    }
    expect(auditStatementEventV2Schema.safeParse({ ...event(), sequence: "9223372036854775807" }).success).toBe(true);
  });

  it("[LP4-16 partial] the new format does not change historical v1 verification", () => {
    const legacy = {
      id, version: "audit.v1" as const, tenantId, sequence: 1, actorRef: "membership:fixture",
      eventType: "command.succeeded", subjectType: "job", subjectRef: id,
      occurredAt: new Date("2026-10-16T12:01:02.123Z"), payload: {},
      payloadHash: digest("{}"), previousHash: null,
    };
    const sealed = { ...legacy, eventHash: canonicalAuditHash(legacy) };
    expect(() => verifyAuditChain([sealed])).not.toThrow();
    expect(() => verifyAuditStatementV2(sealed)).toThrow();
  });
});
