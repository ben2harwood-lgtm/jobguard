import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Logger } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PracticeAccess } from "../practice-access.js";
import { FeeIllustrationApplication } from "./fee-illustration.application.js";
import { FeeIllustrationController } from "./fee-illustration.controller.js";
import { feeIllustrationCreateV1 } from "./fee-illustration.contracts.js";

const valid = { version: "fee-what-if.v1", acceptedNetPence: 1880000, eligibleNetPence: 282000, settledBasePlanPence: 7900 };
const creation = () => ({ version: "fee-illustration-source.v1", commandId: randomUUID(), fixture: "recovery-18800" });
afterEach(() => vi.restoreAllMocks());

describe("LATER-B18 illustration boundary", () => {
  const malformed = [null, [], {}, { ...valid, version: "unknown" }, { ...valid, extra: true },
    ...["acceptedNetPence", "eligibleNetPence", "settledBasePlanPence"].flatMap(field =>
      [1.5, -1, "100", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(value => ({ ...valid, [field]: value }))),
    { ...valid, acceptedNetPence: 1000000000001 }, { ...valid, eligibleNetPence: 1000000000001 },
    { ...valid, settledBasePlanPence: 7901 }];
  it.each(malformed)("L112 malformed and fractional money input returns typed validation error: %j", async body => {
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({} as never);
    const query = vi.fn(), controller = new FeeIllustrationController({ query } as unknown as Pool);
    const error = await controller.whatIf(randomUUID(), body).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({ code: "VALIDATION_ERROR" });
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("L112 malformed creation returns typed validation error without exposing input", async () => {
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({} as never);
    const create = vi.spyOn(FeeIllustrationApplication.prototype, "create");
    const controller = new FeeIllustrationController({} as Pool);
    await expect(controller.create(randomUUID(), {})).rejects.toMatchObject({ status: 400 });
    await expect(controller.create(randomUUID(), {})).rejects.toMatchObject({ response: { code: "VALIDATION_ERROR" } });
    expect(create).not.toHaveBeenCalled();
    await expect(controller.create(randomUUID(), { ...creation(), fixture: "changed" })).rejects.toMatchObject({ response: { code: "VALIDATION_ERROR" } });
  });

  it("L101 changed job/content under same ID conflicts at the controller boundary", async () => {
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({} as never);
    vi.spyOn(FeeIllustrationApplication.prototype, "create").mockRejectedValue(
      Object.assign(new Error("FEE_ILLUSTRATION_CONFLICT"), { code: "23505" }));
    const error = await new FeeIllustrationController({} as Pool).create(randomUUID(), creation()).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("L112 unknown failures remain 500 through the default Nest error boundary", async () => {
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({} as never);
    const failure = Object.assign(new Error("unexpected database failure"), { code: "23505" });
    vi.spyOn(FeeIllustrationApplication.prototype, "create").mockRejectedValue(failure);
    const controller = new FeeIllustrationController({} as Pool);
    await expect(controller.create(randomUUID(), creation())).rejects.toBe(failure);
    const reply = vi.fn();
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const filter = new BaseExceptionFilter({ isHeadersSent: () => false, reply } as never);
    filter.catch(failure, { getArgByIndex: () => ({}) } as never);
    expect(reply).toHaveBeenCalledWith({}, { statusCode: 500, message: "Internal server error" }, 500);
  });

  it("L112 an internal schema failure remains 500 rather than being labelled invalid input", async () => {
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({} as never);
    const parsed = feeIllustrationCreateV1.safeParse(null);
    if (parsed.success) throw new Error("Expected invalid fixture");
    vi.spyOn(FeeIllustrationApplication.prototype, "create").mockRejectedValue(parsed.error);
    await expect(new FeeIllustrationController({} as Pool).create(randomUUID(), creation())).rejects.toBe(parsed.error);
  });

  it("L112 authority refusal precedes malformed input and remains identical for every job", async () => {
    const failure = new Error("UNAUTHENTICATED");
    vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(failure);
    const controller = new FeeIllustrationController({} as Pool);
    for (const id of [randomUUID(), randomUUID(), randomUUID(), "invalid"])
      for (const call of [() => controller.whatIf(id, null), () => controller.create(id, null)])
        await expect(call()).rejects.toBe(failure);
  });

  it("L101 legacy display calculations unchanged; L112 what-if has no persistence call", async () => {
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({} as never);
    const query = vi.fn(), controller = new FeeIllustrationController({ query } as unknown as Pool);
    const result = await controller.whatIf(randomUUID(), valid);
    expect(result).toMatchObject({ policyVersion: "reference_fee_policy_v1", recoveryCap: { pence: 28200 },
      cappedFee: { pence: 28200 }, baseCredit: { pence: 7900 }, additionalFee: { pence: 20300 } });
    expect(query).not.toHaveBeenCalled();
  });
});
