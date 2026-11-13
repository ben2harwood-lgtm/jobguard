import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IdentitySignIn } from "./sign-in";

const state = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: () => [state.values.shift(), vi.fn()],
  useEffect: () => undefined,
}));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

function render(session: unknown = null, fixtureCode = "", accepted: string | null = null) {
  state.values = ["builder@practice.invalid", "signup", "", "", fixtureCode, !!fixtureCode, false, "", session, false, false, accepted];
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
