import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SPOKEN_SORT_PRACTICE_TENANT_ID, readSpokenJob } from "@jobguard/ai";
import { DEMO_TENANT_ID, type VerifiedTenantContext } from "@jobguard/db";
import { modelReaderOn, readWithModel, withModelReader, type ModelReaderEnv } from "./model-reader.js";

const TEXT = "In the kitchen fit new units 2000 and in the bathroom tile the floor 500 and move two sockets 90.";
const KEY = "test-key-not-real-0123456789";
const on: ModelReaderEnv = { JOBGUARD_ENV: "synthetic_demo", JOBGUARD_SPOKEN_JOB_MODEL_KEY: KEY, JOBGUARD_SPOKEN_JOB_MONTHLY_CAP_PENCE: "1000", JOBGUARD_SPOKEN_JOB_LIVE: "1" };
const context = { tenantId: DEMO_TENANT_ID } as VerifiedTenantContext;
const readerA = () => { const { timeline: _, ...a } = readSpokenJob("cap-1", TEXT); return a; };
const agreeing = () => {
  const a = readerA();
  const named = a.areas.filter(area => area.name.provenance.kind === "extracted");
  return { areas: named.map(area => ({ name_words: area.name.value })), items: a.lines.map((line, item_index) => ({ item_index, area_index: named.findIndex(area => area.key === line.areaKey), trade: line.trade.value })), missed: [] };
};
const ledger = (over: Partial<{ available: boolean; reserved: boolean }> = {}) => ({
  available: vi.fn(async () => over.available ?? true),
  reserve: vi.fn(async () => (over.reserved ?? true) ? { reserved: true as const } : { reserved: false as const, reason: "cap_reached" as const }),
  settle: vi.fn(async () => undefined),
});
function fakeProvider(body: unknown, status = 200) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const message = (wire: unknown, over: Record<string, unknown> = {}) => ({ id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", stop_sequence: null,
  content: [{ type: "text", text: JSON.stringify(wire) }], usage: { input_tokens: 700, output_tokens: 80 }, ...over });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("V2-SQ-G model reader around Reader A", () => {
  it("the practice tenant ids agree", () => expect(SPOKEN_SORT_PRACTICE_TENANT_ID).toBe(DEMO_TENANT_ID));

  it("with any one switch missing there is no network call and no ledger write", async () => {
    const fetch = fakeProvider(message(agreeing()));
    for (const drop of ["JOBGUARD_SPOKEN_JOB_MODEL_KEY", "JOBGUARD_SPOKEN_JOB_MONTHLY_CAP_PENCE", "JOBGUARD_SPOKEN_JOB_LIVE", "JOBGUARD_ENV"]) {
      const env = { ...on, [drop]: undefined };
      const ports = { ledger: ledger(), env };
      expect(await readWithModel(ports, context, { captureId: "cap-1", text: TEXT, readerA: readerA() }), drop).toEqual({ used: false });
      expect(ports.ledger.reserve, drop).not.toHaveBeenCalled();
    }
    for (const live of ["0", "true", "yes", ""]) expect(modelReaderOn({ ...on, JOBGUARD_SPOKEN_JOB_LIVE: live })).toBe(false);
    for (const cap of ["0", "-1", "NaN", "2001"]) expect(modelReaderOn({ ...on, JOBGUARD_SPOKEN_JOB_MONTHLY_CAP_PENCE: cap })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("another tenant, a long transcript, a missing ledger table or a reached cap make no call", async () => {
    const fetch = fakeProvider(message(agreeing()));
    const other = { tenantId: "22222222-2222-4222-8222-222222222222" } as VerifiedTenantContext;
    expect(await readWithModel({ ledger: ledger(), env: on }, other, { captureId: "cap-1", text: TEXT, readerA: readerA() })).toEqual({ used: false });
    expect(await readWithModel({ ledger: ledger(), env: on }, context, { captureId: "cap-1", text: `${TEXT} `.repeat(90), readerA: readerA() })).toEqual({ used: false });
    const missing = ledger({ available: false });
    expect(await readWithModel({ ledger: missing, env: on }, context, { captureId: "cap-1", text: TEXT, readerA: readerA() })).toEqual({ used: false });
    expect(missing.reserve).not.toHaveBeenCalled();
    expect(await readWithModel({ ledger: ledger({ reserved: false }), env: on }, context, { captureId: "cap-1", text: TEXT, readerA: readerA() })).toEqual({ used: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reserves the worst case, makes one call, settles from usage, and keeps every number of Reader A", async () => {
    const fetch = fakeProvider(message(agreeing()));
    const ports = { ledger: ledger(), env: on };
    const result = await readWithModel(ports, context, { captureId: "cap-1", text: TEXT, readerA: readerA() });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.used).toBe(true);
    const reserve = (ports.ledger.reserve.mock.calls[0] as unknown as [unknown, { microPence: number; capMicroPence: number }])[1];
    expect(reserve.capMicroPence).toBe(1_000_000_000);
    expect(reserve.microPence).toBeGreaterThan(2_000_000);
    expect(ports.ledger.settle).toHaveBeenCalledWith(context, expect.objectContaining({ outcome: "ok", microPence: 700 * 200 + 80 * 1000, inputTokens: 700, outputTokens: 80, modelId: "claude-sonnet-5-5" }));
    if (result.used) {
      expect(result.understanding.lines.map(line => [line.quantity, line.unitPricePence])).toEqual(readerA().lines.map(line => [line.quantity, line.unitPricePence]));
      expect(result.stored).toMatchObject({ readerAVersion: "context-reader/1", promptVersion: "spoken-job-sort-prompt.v1" });
    }
    expect(withModelReader("fixture-capture-v1")).toBe("fixture-capture-v1+claude-sonnet-5-5");
  });

  it("a refusal or wrong model settles and falls back; a timeout or a provider error leaves the reservation in full", async () => {
    for (const [body, outcome] of [[message({}, { stop_reason: "refusal" }), "refused"], [message(agreeing(), { model: "claude-opus-5-5" }), "wrong_model"], [message("nope"), "invalid_output"]] as const) {
      fakeProvider(body);
      const ports = { ledger: ledger(), env: on };
      expect(await readWithModel(ports, context, { captureId: "cap-1", text: TEXT, readerA: readerA() })).toEqual({ used: false });
      expect(ports.ledger.settle).toHaveBeenCalledWith(context, expect.objectContaining({ outcome }));
    }
    fakeProvider({ type: "error", error: { type: "overloaded_error", message: TEXT } }, 529);
    const ports = { ledger: ledger(), env: on };
    expect(await readWithModel(ports, context, { captureId: "cap-1", text: TEXT, readerA: readerA() })).toEqual({ used: false });
    expect(ports.ledger.settle).not.toHaveBeenCalled();
  });

  it("a timeout at 15 s: one outbound attempt, the reservation stands in full, Reader A's quote is used unchanged", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }));
      vi.stubGlobal("fetch", fetch);
      const ports = { ledger: ledger(), env: on };
      const pending = readWithModel(ports, context, { captureId: "cap-1", text: TEXT, readerA: readerA() });
      await vi.advanceTimersByTimeAsync(15_001);
      expect(await pending).toEqual({ used: false });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(ports.ledger.reserve).toHaveBeenCalledTimes(1);
      expect(ports.ledger.settle).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("no transcript text and no key reach any log line", async () => {
    const lines: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
    for (const body of [message(agreeing()), message({}, { stop_reason: "refusal" }), { type: "error", error: { type: "x", message: `${TEXT} ${KEY}` } }]) {
      fakeProvider(body, "type" in body && body.type === "error" ? 500 : 200);
      await readWithModel({ ledger: ledger(), env: on }, context, { captureId: "cap-1", text: TEXT, readerA: readerA() });
    }
    for (const line of lines) { expect(line).not.toContain(KEY); expect(line).not.toContain("fit new units"); }
  });
});

describe("V2-SQ-G architecture: one live route", () => {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => { for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", ".next", ".open-next", ".git", ".turbo", "coverage"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path); else if (/\.(?:m?[jt]sx?)$/u.test(name) && !/\.test\.|\.spec\./u.test(name)) files.push(path);
  } };
  for (const top of ["apps", "packages", "tools"]) walk(join(root, top));
  const matching = (pattern: RegExp) => files.filter(file => pattern.test(readFileSync(file, "utf8"))).map(file => relative(root, file)).sort();
  it("exactly one file imports the live adapter, and only it and the eval script build one", () => {
    expect(matching(/@jobguard\/ai\/live-adapter/u)).toEqual(["apps/api/src/capture/model-reader.ts"]);
    expect(matching(/from\s+["']@anthropic-ai\/sdk["']/u)).toEqual(["packages/ai/src/anthropic-live-sort.ts"]);
  });
  it("exactly one call site calls generateLive()", () => {
    const calls = files.flatMap(file => (readFileSync(file, "utf8").match(/\.generateLive\(/gu) ?? []).map(() => relative(root, file)));
    expect(calls).toEqual(["apps/api/src/capture/model-reader.ts"]);
  });
});
