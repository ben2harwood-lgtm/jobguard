import { afterEach, expect, it, vi } from "vitest";
import * as React from "react";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("./screen", () => ({ DunningScreen: () => null }));
import Page from "./page";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it.each([undefined, "production", "pilot_no_charge", ""])("refuses the page outside synthetic demo (%s)", async environment => {
  vi.stubEnv("JOBGUARD_ENV", environment);
  await expect(Page({ params: Promise.resolve({ id: "fictional-job" }) })).rejects.toThrow("NEXT_NOT_FOUND");
});
it("renders the existing screen in synthetic demo", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubGlobal("React", React);
  const page = await Page({ params: Promise.resolve({ id: "fictional-job" }) });
  expect(React.isValidElement(page)).toBe(true);
  expect(page.props.jobId).toBe("fictional-job");
});
