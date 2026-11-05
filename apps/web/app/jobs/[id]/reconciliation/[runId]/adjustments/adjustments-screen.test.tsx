import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
import { AdjustmentsScreen } from "./adjustments-screen";
it("starts without invented figures and labels the simulated review and independent approver", () => {
 const html = renderToStaticMarkup(<AdjustmentsScreen jobId="job" runId="run" />);
 expect(html).toContain("Simulation only. Nothing is posted or collected.");
 expect(html).toContain("Another finance user must approve");
 expect(html).toContain("min-height:44px");
 expect(html).not.toContain("Waiting for approval");
 expect(html).not.toContain("£");
});
