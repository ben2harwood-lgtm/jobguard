import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_READER_NOTICE, WalkIt } from "./jobguard-app";

beforeEach(() => vi.stubGlobal("React", React));
describe("V2-SQ-G model reader notice", () => {
  it("shows the notice beside the mic and the typed box only when the model reader is on", () => {
    const on = renderToStaticMarkup(<WalkIt tenantId="tenant" close={() => {}} mode="own" modelReader/>);
    expect(on).toContain('data-testid="model-reader-notice-mic"');
    expect(on).toContain('data-testid="model-reader-notice-typed"');
    expect(on.split("sent to Anthropic").length - 1).toBe(2);
    expect(MODEL_READER_NOTICE).toBe("Your words (text only, never audio) are sent to Anthropic's Claude to be sorted into rooms and trades. Practice only: don't say real names or addresses.");
    const off = renderToStaticMarkup(<WalkIt tenantId="tenant" close={() => {}} mode="own"/>);
    expect(off).not.toContain("Anthropic");
  });
});
