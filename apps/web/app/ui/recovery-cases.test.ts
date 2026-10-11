import * as React from "react";
import { renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { RecoveryCases } from "./recovery-cases";

describe("recovery workbench first paint (M4-1-S-R repair 11, Sol P3-8)", () => {
  let firstPaint = "";
  beforeAll(() => {
    // The web tsconfig keeps JSX as "preserve" for Next, so vitest compiles it with the classic runtime and the component needs a global React at render time.
    // Provide it here so the test renders the real workbench without changing any shared configuration.
    (globalThis as { React?: typeof React }).React = React;
    // Server rendering runs no effects, so this is exactly what a visitor sees before the first read has finished.
    firstPaint = renderToString(React.createElement(RecoveryCases, { jobId: "11111111-1111-4111-8111-111111111111" }));
  });
  it("does not claim the register is empty before the cases have been read", () => {
    expect(firstPaint).not.toContain("No recovery cases yet");
  });
  it("says the cases are loading", () => {
    expect(firstPaint).toContain("Loading recovery cases");
  });
});
