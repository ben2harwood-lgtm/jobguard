import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("./pages-mock", () => ({ PagesMock: () => null }));
import Page, { dynamic } from "./page";
import { PagesMock } from "./pages-mock";

afterEach(() => vi.unstubAllEnvs());

describe("M3 fixture route gate", () => {
  it.each([undefined, "", "0", "false", "true", " 1"])("refuses local V2 flag %s", flag => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", flag);
    expect(() => Page()).toThrow("NEXT_NOT_FOUND");
  });

  it("returns only the mock with the exact local V2 flag", () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    expect(Page().type).toBe(PagesMock);
    expect(dynamic).toBe("force-dynamic");
  });
});
