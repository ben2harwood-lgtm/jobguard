import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IdentitySignIn } from "./sign-in";

const state = vi.hoisted(() => ({ values: [] as unknown[], effects: [] as Array<() => unknown>, writes: [] as unknown[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [state.values.length ? state.values.shift() : initial, (value: unknown) => state.writes.push(value)],
  useEffect: (effect: () => unknown) => state.effects.push(effect),
}));
beforeEach(() => { vi.stubGlobal("React", React); state.effects = []; state.writes = []; });
afterEach(() => vi.unstubAllGlobals());

function render(session: unknown = null, fixtureCode = "", accepted: string | null = null, busy = false) {
  state.values = ["builder@practice.invalid", "signup", "", "", fixtureCode, !!fixtureCode, busy, "", session, false, false, accepted];
  return renderToStaticMarkup(<IdentitySignIn />);
}
const session = {
  principal: { id: "fictional-identity" },
  memberships: [
    { id: "fictional-membership", tenantId: "fictional-business-id", name: "Fictional builders", role: "owner" },
    { id: "second-membership", tenantId: "second-business-id", name: "Second fictional business", role: "read_only" },
  ],
};

it("keeps identity, business and membership ids inside one closed details element, outside the visible summary", () => {
  const html = render(session);
  const details = html.match(/<details>([\s\S]*?)<\/details>/g) ?? [];
  expect(details).toHaveLength(1);
  expect(details[0]).toContain('<summary>Technical details</summary>');
  expect(html).not.toMatch(/<details[^>]*\bopen\b/);
  expect(details[0]).toContain('<span data-testid="identity-id">fictional-identity</span>');
  expect(details[0]).toContain('<p data-testid="identity-tenant">fictional-business-id</p>');
  expect(details[0]).toContain('<p data-testid="identity-tenant">second-business-id</p>');
  const visible = html.replace(details[0]!, "<summary>Technical details</summary>");
  for (const id of [session.principal.id, ...session.memberships.flatMap(m => [m.id, m.tenantId])]) {
    expect(details[0]).toContain(id);
    expect(visible).not.toContain(id);
  }
  expect(visible).toContain("<h2>You&#x27;re signed in.</h2>");
  expect(visible).toContain("<h3>Fictional builders</h3><p>Owner</p>");
  expect(visible).toContain("<h3>Second fictional business</h3><p>Read only</p>");
  expect(visible).toContain("This is a practice version: made-up jobs only, nothing is sent or charged.");
  expect(visible).toContain('<a href="/classic">Open my jobs</a>');
  expect(visible).toContain('<a href="/plans">See plans and prices</a>');
});

it("uses builder wording while preserving the practice notice, purpose values and order, and code output", () => {
  const html = render(null, "12345678");
  expect(html).toContain("<h1>Sign in to JobGuard</h1>");
  expect(html).toContain("Use the supplied fictional address. Do not enter real names or email addresses.");
  expect(html).toContain('<label for="identity-purpose">What do you want to do?</label>');
  expect(html).toMatch(/<select id="identity-purpose"[^>]*><option value="signup"[^>]*>Start a new business<\/option><option value="signin">Sign in to my business<\/option><option value="invitation">I&#x27;ve been invited<\/option><\/select>/);
  expect(html).toContain('Practice code: <output data-testid="fixture-code">12345678</output> — nothing was emailed.');
});

it.each([
  ["new", "Invitation accepted. Your memberships above are current."],
  ["added", "Invitation accepted. The invited business is now one of this account's memberships above."],
  ["switched", "Invitation accepted. This browser is now signed in as the invited address, which is a different account from the one you were using. The memberships above belong to that account; sign in with your previous address to return to the other one."],
])("preserves the exact %s invitation status", (accepted, sentence) => {
  expect(render(session, "", accepted)).toContain(`<p role="status">${sentence.replaceAll("'", "&#x27;")}</p>`);
});

const owner = { ...session, memberships: [session.memberships[0]] };
it("offers the existing firm screen only to a verified single owner", () => {
  const html = render(owner);
  expect(html).toContain("Name your practice business");
  expect(html).toContain("Use made-up business details only.");
  expect(html).toContain("Trading name");
  // The existing screen keeps fields disabled until its own authorized profile read completes.
  expect(html).toContain("<fieldset disabled");
  expect(html.indexOf("Trading name")).toBeLessThan(html.indexOf("Open my jobs"));
});

it.each([
  ["unsigned", null],
  ["non-owner", { ...owner, memberships: [{ ...session.memberships[0], role: "foreman" }] }],
  ["multiple memberships", session],
  ["no memberships", { ...owner, memberships: [] }],
])("does not offer an owner profile form for %s", (_name, current) => {
  const html = render(current);
  expect(html).not.toContain("Trading name");
  expect(html).not.toContain("Save firm details");
});

it("unmounts the profile while sign-out or account verification is busy", () => {
  const html = render(owner, "", null, true);
  expect(html).not.toContain("Trading name");
  expect(html).toContain("Sign out");
});

it.each([401, 503, "network"])("rechecks on focus and clears the stale session after %s", async status => {
  const window = new EventTarget(), document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", window); vi.stubGlobal("document", document);
  vi.stubGlobal("fetch", status === "network" ? vi.fn().mockRejectedValue(new Error("unavailable")) : vi.fn().mockResolvedValue({ ok: false, status }));
  render(owner);
  const cleanup = state.effects[2]!() as () => void;
  window.dispatchEvent(new Event("focus"));
  expect(state.writes).toContain(true); // Checking hides the profile before the network returns.
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(fetch).toHaveBeenCalledWith("/api/auth/session", { cache: "no-store" });
  expect(state.writes).toContain(null);
  expect(state.writes.at(-1)).toBe(false);
  cleanup();
  const writes = state.writes.length;
  window.dispatchEvent(new Event("focus"));
  expect(state.writes).toHaveLength(writes);
});
