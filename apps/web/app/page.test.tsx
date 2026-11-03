import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("web scaffold", () => { it("has a stable title", () => expect("JobGuard").toBe("JobGuard")); });

const state = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
  effects: [] as (() => void | (() => void))[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => state.cookies[name] === undefined ? undefined : { value: state.cookies[name] },
}) }));
vi.mock("./ui/jobguard-app", () => ({ JobGuardApp: () => null }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { state.effects.push(effect); },
}));
import Home from "./page";
import { JobsOnTheGoLine } from "./meter/meter-screen";

afterEach(() => {
  state.effects = [];
  state.cookies = {};
  vi.unstubAllGlobals();
});

it.each([{}, { jg_session: "practice" }, { jobguard_session: "" }])(
  "skips the optional company meter request without a company cookie: %j", async cookies => {
    state.cookies = cookies;
    vi.stubGlobal("React", React);
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const page = await Home();
    expect(page.props.hasCompanySession).toBe(false);
    expect(renderToStaticMarkup(<JobsOnTheGoLine hasCompanySession={page.props.hasCompanySession} />)).toBe("");
    for (const effect of state.effects) effect();
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("still validates a present company cookie through the session endpoint", async () => {
  state.cookies = { jobguard_session: "unverified-company-cookie", jg_session: "practice" };
  vi.stubGlobal("React", React);
  const response = Response.json({}, { status: 401 });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetcher);
  const page = await Home();
  expect(page.props.hasCompanySession).toBe(true);
  expect(renderToStaticMarkup(<JobsOnTheGoLine hasCompanySession={page.props.hasCompanySession} />)).toBe("");
  const cleanups = state.effects.map(effect => effect());
  await vi.waitFor(() => expect(response.bodyUsed).toBe(true));
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  for (const cleanup of cleanups) cleanup?.();
});
