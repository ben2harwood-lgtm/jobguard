import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

// Use the repository's scripted hook approach, then render the actual component's markup.
const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0, effects: [] as Array<() => void> }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const i = hooks.cursor++;
    if (!(i in hooks.cells)) hooks.cells[i] = initial;
    return [hooks.cells[i], (value: unknown) => { hooks.cells[i] = value; }];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => { hooks.effects.push(effect); },
}));
import { NorthsidePractice } from "./northside-practice";

function render() {
  hooks.cursor = 0;
  hooks.effects = [];
  return renderToStaticMarkup(NorthsidePractice());
}
afterEach(() => vi.unstubAllGlobals());

it("renders the actual invitation policy alongside a historical 1440-minute snapshot", async () => {
  hooks.cells = [];
  vi.stubGlobal("React", React);
  const practice = {
    role: "surveyor", membershipId: "fictional-surveyor", testerMembershipId: "fictional-owner",
    targetsToSwitch: [], recentActions: [], settingsHash: "a".repeat(64),
    settings: {
      version: "northside-demo-settings.v1", label: "demo settings", notice: "Fictional settings",
      journey: ["capture", "approval"], linkLifetimeMinutes: 1440, photoUploadLifetimeMinutes: 15,
      rules: { proceedLimit: { pence: 1000 }, bands: [], clientApproval: { kind: "required", timeLimitMinutes: 60 },
        evidence: { photosRequired: true, residentConfirmationRequired: true } },
    },
  };
  const originalSnapshot = JSON.stringify(practice);
  const fetchMock = vi.fn(async (url: string) => Response.json(url === "/api/northside" ? practice : { state: "owner" }));
  vi.stubGlobal("fetch", fetchMock);
  expect(render()).toBe("");
  hooks.effects.forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  const html = render();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/northside", "/api/contractor/practice/acting-as"]);
  expect(html).toContain('data-testid="demo-settings"');
  expect(html).toContain("New client-approval invitation lifetime: 10075 minutes (seven days less 5 minutes for clock skew).");
  expect(html).toContain("Historical demo link setting: 1440 minutes — demo settings. This does not control these invitations.");
  expect(html).toContain("Photo upload lifetime 15 minutes — demo settings");
  expect(html).toContain(practice.settingsHash);
  expect(html).toContain(practice.settings.version);
  expect(html).not.toContain("Local link lifetime");
  expect(JSON.stringify(practice)).toBe(originalSnapshot);
});
