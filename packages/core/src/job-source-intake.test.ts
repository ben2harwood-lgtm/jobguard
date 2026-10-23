import { describe, expect, it } from "vitest";
import {
  classifyJobSourceIntake, jobSourceIntakeReceiptV1, JobSourceIntakeError,
} from "./job-source-intake.js";
import {
  customerMessageInputV1, diaryInputV1, JOB_DIARY_NOTICE, JOB_DIARY_NOTICE_VERSION,
  MAX_JOB_SOURCE_BYTES, MAX_JOB_SOURCE_TEXT,
} from "./job-sources.js";

const id = "a0000000-0000-4000-8000-000000000001";
const diary = { version: "job-diary-input.v1", commandId: id, entryMode: "typed", onSite: true, text: "  Fictional café 🛠\r\n" };
const message = { version: "customer-message-input.v1", commandId: id, text: diary.text,
  fictionalCustomer: { kind: "named_fictional_customer", name: "Fictional Alex" } };
const evidence = { id, objectVersionId: "synthetic-original-v1", sha256: "a".repeat(64), serverReceivedAt: "2026-10-23T10:00:00.000001Z" };
const record = { id, commandId: id, text: diary.text, evidence, actualTesterMembershipId: id };
const common = { version: "job-source-intake-receipt.v1", jobId: id, environment: "synthetic_demo", realExternalActions: 0 };
const diaryReceipt = { ...common, sourceKind: "diary", record: { ...record, entryMode: "typed", onSite: true }, notice: JOB_DIARY_NOTICE, noticeVersion: JOB_DIARY_NOTICE_VERSION };
const messageReceipt = { ...common, sourceKind: "customer_message", record: { ...record, fictionalCustomer: message.fictionalCustomer } };
const forbidden = ["tenantId", "actorMembershipId", "sessionId", "serverReceivedAt", "sha256", "objectVersionId", "processed", "fee", "approval", "role", "filename", "stamp"];

describe("SV7A-INT-C pure contract", () => {
  it("C01/C05 composes existing immutable records with exact diary notice and microseconds", () => {
    for (const receipt of [diaryReceipt, messageReceipt]) {
      const parsed = jobSourceIntakeReceiptV1.parse(receipt);
      expect(parsed).toEqual(receipt);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.record)).toBe(true);
      expect(Object.isFrozen(parsed.record.evidence)).toBe(true);
    }
    expect(jobSourceIntakeReceiptV1.safeParse({ ...diaryReceipt, notice: "Bill this work" }).success).toBe(false);
    expect(jobSourceIntakeReceiptV1.safeParse({ ...diaryReceipt, noticeVersion: "v2" }).success).toBe(false);
    expect(jobSourceIntakeReceiptV1.safeParse({ ...messageReceipt, notice: JOB_DIARY_NOTICE }).success).toBe(false);
    expect(jobSourceIntakeReceiptV1.safeParse({ ...messageReceipt, record: diaryReceipt.record }).success).toBe(false);
    expect(jobSourceIntakeReceiptV1.safeParse({ ...diaryReceipt, record: messageReceipt.record }).success).toBe(false);
  });

  it("C02 rejects caller authority fields at every boundary", () => {
    for (const key of forbidden) {
      expect(diaryInputV1.safeParse({ ...diary, [key]: id }).success).toBe(false);
      expect(customerMessageInputV1.safeParse({ ...message, [key]: id }).success).toBe(false);
      expect(() => classifyJobSourceIntake("diary", { ...diary, [key]: id })).toThrow(JobSourceIntakeError);
      expect(() => classifyJobSourceIntake("customer_message", { ...message, [key]: id })).toThrow(JobSourceIntakeError);
      for (const receipt of [diaryReceipt, messageReceipt]) {
        expect(jobSourceIntakeReceiptV1.safeParse({ ...receipt, [key]: id }).success).toBe(false);
        expect(jobSourceIntakeReceiptV1.safeParse({ ...receipt, record: { ...receipt.record, [key]: id } }).success).toBe(false);
      }
    }
    expect(customerMessageInputV1.safeParse({ ...message, fictionalCustomer: { ...message.fictionalCustomer, role: "owner" } }).success).toBe(false);
    expect(jobSourceIntakeReceiptV1.safeParse({ ...messageReceipt, record: { ...messageReceipt.record, actualTesterMembershipId: "Fictional Alex" } }).success).toBe(false);
  });

  it("C03 preserves reviewed text exactly and enforces existing text/byte bounds", () => {
    for (const text of ["\ufeff Fictional café 🛠\r\n", "  中文 العربية Ελληνικά\n", "a".repeat(MAX_JOB_SOURCE_TEXT), "界".repeat(MAX_JOB_SOURCE_TEXT), "🛠".repeat(MAX_JOB_SOURCE_TEXT / 2)]) {
      expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(MAX_JOB_SOURCE_BYTES);
      for (const entryMode of ["typed", "dictated_text"]) expect(diaryInputV1.parse({ ...diary, entryMode, text }).text).toBe(text);
      expect(customerMessageInputV1.parse({ ...message, text }).text).toBe(text);
      for (const receipt of [diaryReceipt, messageReceipt]) expect(jobSourceIntakeReceiptV1.parse({ ...receipt, record: { ...receipt.record, text } }).record.text).toBe(text);
    }
    for (const text of ["", " \r\n\t", "\0", "x\ud800", "\udc00x", "a".repeat(MAX_JOB_SOURCE_TEXT + 1), "🛠".repeat(MAX_JOB_SOURCE_TEXT)]) {
      expect(() => classifyJobSourceIntake("diary", { ...diary, text })).toThrow(JobSourceIntakeError);
      expect(() => classifyJobSourceIntake("customer_message", { ...message, text })).toThrow(JobSourceIntakeError);
      for (const receipt of [diaryReceipt, messageReceipt]) expect(jobSourceIntakeReceiptV1.safeParse({ ...receipt, record: { ...receipt.record, text } }).success).toBe(false);
    }
  });

  it("C04 returns only source semantics; on-site diary alone requests the later adapter", () => {
    for (const entryMode of ["typed", "dictated_text"]) {
      for (const onSite of [true, false]) expect(classifyJobSourceIntake("diary", { ...diary, entryMode, onSite })).toEqual({ evidenceKind: "job_diary_text", observationKind: "note_or_voice", onSiteDiary: onSite });
    }
    expect(classifyJobSourceIntake("customer_message", message)).toEqual({ evidenceKind: "customer_message_text", observationKind: "customer_request", onSiteDiary: false });
    for (const [kind, input] of [["diary", message], ["customer_message", diary], ["photo", diary], ["diary", null], ["diary", { ...diary, version: "v2" }]] as const) {
      expect(() => classifyJobSourceIntake(kind, input)).toThrow("INVALID_JOB_SOURCE_INPUT");
    }
  });

  it("C05 rejects hidden state, unverified shapes and non-synthetic receipts", () => {
    for (const receipt of [diaryReceipt, messageReceipt]) {
      for (const key of ["detected", "signalCount", "fee", "processed", "clientTimestamp"]) expect(jobSourceIntakeReceiptV1.safeParse({ ...receipt, [key]: 1 }).success).toBe(false);
      for (const change of [{ environment: "production" }, { realExternalActions: 1 }, { jobId: "foreign" }, { version: "v2" }]) expect(jobSourceIntakeReceiptV1.safeParse({ ...receipt, ...change }).success).toBe(false);
      for (const change of [{ sha256: "bad" }, { objectVersionId: "" }, { serverReceivedAt: "yesterday" }, { processed: true }]) expect(jobSourceIntakeReceiptV1.safeParse({ ...receipt, record: { ...receipt.record, evidence: { ...evidence, ...change } } }).success).toBe(false);
    }
  });

  it("exposes only stable typed error codes without raw input", () => {
    for (const code of ["INVALID_JOB_SOURCE_INPUT", "JOB_SOURCE_FORBIDDEN", "SYNTHETIC_MODE_REQUIRED", "IDEMPOTENCY_CONFLICT", "SOURCE_NOT_FINALIZED", "JOB_SOURCE_UNAVAILABLE"] as const) {
      const error = new JobSourceIntakeError(code);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("JobSourceIntakeError");
      expect(error.code).toBe(code);
      expect(error.message).toBe(code);
    }
  });
});
