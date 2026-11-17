import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { extractCaptureFixture } from "@jobguard/ai";
import { Recovery18800Launch, recovery18800Source } from "./launch";
vi.stubGlobal("React", React);
it("starts from five source lines that make exactly £18,800", async () => {
  const proposal = await extractCaptureFixture(randomUUID(), recovery18800Source, "deterministic-local-v1");
  expect(proposal.lines).toHaveLength(5);
  expect(proposal.lines.reduce((total, line) => total + (line.unitPricePence.value ?? 0), 0)).toBe(1880000);
});
it("shows no saved job or outcome before a session is checked, and refuses a bad job link", () => {
  const html = renderToStaticMarkup(<Recovery18800Launch />);
  expect(html).toContain("Checking practice session"); expect(html).not.toContain("recovery practice guide");
  expect(renderToStaticMarkup(<Recovery18800Launch requestedJobId="not-a-job" />)).toContain("Invalid saved job reference");
});
