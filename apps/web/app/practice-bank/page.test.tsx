import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const screen = vi.hoisted(() => vi.fn(() => null));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("./screen", () => ({ PracticeBankScreen: screen }));
import { notFound } from "next/navigation";
import Page, { dynamic } from "./page";
vi.stubGlobal("React", React);
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it.each(["production", "pilot_no_charge", "", undefined])("does not render the screen in %s", mode => {
  vi.stubEnv("JOBGUARD_ENV", mode);
  expect(() => renderToStaticMarkup(<Page />)).toThrow("NEXT_NOT_FOUND");
  expect(notFound).toHaveBeenCalledOnce();
  expect(screen).not.toHaveBeenCalled();
});
it("renders the screen only in synthetic_demo", () => {
  expect(dynamic).toBe("force-dynamic");
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  renderToStaticMarkup(<Page />);
  expect(notFound).not.toHaveBeenCalled();
  expect(screen).toHaveBeenCalledOnce();
});
it("reads mode again when the server starts after a build with no deployment mode", () => {
  vi.stubEnv("JOBGUARD_ENV", undefined);
  expect(() => renderToStaticMarkup(<Page />)).toThrow("NEXT_NOT_FOUND");
  expect(screen).not.toHaveBeenCalled();
  vi.clearAllMocks();
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  renderToStaticMarkup(<Page />);
  expect(notFound).not.toHaveBeenCalled();
  expect(screen).toHaveBeenCalledOnce();
  vi.clearAllMocks();
  vi.stubEnv("JOBGUARD_ENV", "production");
  expect(() => renderToStaticMarkup(<Page />)).toThrow("NEXT_NOT_FOUND");
  expect(screen).not.toHaveBeenCalled();
});
