import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ManagedRecoveryScreen, sendManagedRecoveryChoice } from "./managed-recovery-screen";
const unavailable = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
vi.mock("next/navigation", () => ({ notFound: unavailable }));
import Page from "./page";
vi.stubGlobal("React", React);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("keeps the page dark outside practice and clearly marks practice as not on offer", async () => {
  vi.stubEnv("JOBGUARD_ENV", "production");
  await expect(Page({ params: Promise.resolve({ id: "job", caseId: "case" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "job", caseId: "case" }) }));
  expect(html).toContain("Practice only — not on offer"); expect(html).not.toContain("href=");
});
it("starts without an election or a selected service", () => {
  const html = renderToStaticMarkup(createElement(ManagedRecoveryScreen, { jobId: "fictional-job", caseId: "fictional-case" }));
  expect(html).toContain("Loading the practice case"); expect(html).not.toContain("checked");
  expect(html).not.toContain("£");
});
it("sends the exact confirmed command on uncertain retries without calculating or replacing its ID", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  fetch.mockRejectedValueOnce(new TypeError("lost response")).mockResolvedValueOnce(new Response("{}"));
  const command = { version: "managed-recovery-election-command.v1" as const, commandId: "original-id", caseId: "case",
    termsVersion: "server-terms", selection: { service: "drafted_for_you" as const, points: 5 as const } };
  await expect(sendManagedRecoveryChoice("/api/choice", command)).rejects.toThrow("lost response");
  await sendManagedRecoveryChoice("/api/choice", command);
  expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({ cache: "no-store", credentials: "same-origin", body: JSON.stringify(command) });
});
