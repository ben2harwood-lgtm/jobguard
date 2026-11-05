import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
import MandateScreen from "./mandate-screen";
import MandatePage from "./page";
vi.stubGlobal("React", React);
afterEach(() => vi.unstubAllEnvs());
it("shows practice and pending wording approval before any authority has loaded", () => {
  const html = renderToStaticMarkup(<MandateScreen />);
  expect(html).toContain("Practice only");
  expect(html).toContain("wording still needs Ben’s approval");
  expect(html).toContain("Nothing is collected from this screen");
  expect(html).toContain("Changed prices, allowances, frequency or scope need fresh approval");
  expect(html).not.toContain("Approve practice terms");
  expect(html).not.toContain("Recorded terms hash");
});
it.each(["production", "pilot", undefined])("the page is not found outside practice mode (%s)", mode => {
  vi.stubEnv("JOBGUARD_ENV", mode);
  expect(() => MandatePage()).toThrow("NEXT_NOT_FOUND");
});
it("renders the screen only in synthetic mode", () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  expect(renderToStaticMarkup(MandatePage())).toContain("Practice terms and standing authority");
});
