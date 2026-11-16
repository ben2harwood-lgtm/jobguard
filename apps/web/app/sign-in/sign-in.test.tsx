import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IdentitySignIn } from "./sign-in";

const state = vi.hoisted(() => ({ values: [] as unknown[], effects: [] as Array<() => unknown>, writes: [] as unknown[], live: false, cursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    return [state.live ? state.values[index] : state.values.length ? state.values.shift() : initial, (value: unknown) => {
      state.writes.push(value);
      if (state.live) state.values[index] = value;
    }];
  },
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => unknown) => state.effects.push(effect),
}));
beforeEach(() => { vi.stubGlobal("React", React); state.effects = []; state.writes = []; state.live = false; state.cursor = 0; });
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

// Retain hook state while invoking the real JSX form handlers, then render their visible result.
function interactionTree() {
  state.cursor = 0;
  return IdentitySignIn();
}
type Element = React.ReactElement<Record<string, unknown>>;
function elements(node: React.ReactNode, type: string): Element[] {
  if (Array.isArray(node)) return node.flatMap(child => elements(child, type));
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [...(node.type === type ? [node] : []), ...elements(node.props.children as React.ReactNode, type)];
}
function startInteraction() {
  state.live = true;
  state.values = ["builder@practice.invalid", "invitation", "fictional-invitation", "12345678", "", false, false, "", null, false, false, null];
}
async function submitForm(index: number) {
  const form = elements(interactionTree(), "form")[index]!;
  (form.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} });
  expect(elements(interactionTree(), "button").every(button => button.props.disabled)).toBe(true);
  await new Promise(resolve => setTimeout(resolve, 0));
}
const outage = "Identity storage is unavailable. Your sign-in has not completed.";
const refusals = [
  ["INVALID_AUTH_INPUT", "Check the email address and invitation reference, then submit again."],
  ["ORIGIN_FORBIDDEN", "Your sign-in has not completed. Reload this page or close it and open JobGuard again."],
  ["INVALID_CODE", "That code is invalid or expired. Request another code."],
  ["RATE_LIMITED", "Please wait before requesting another code."],
  ["IDENTITY_ROUTE_BLOCKED", "Use a supplied fictional .invalid address. Real identity email is blocked pending D04."],
  ["UNKNOWN_FAILURE", outage],
  ["toString", outage],
  ["missing code", outage],
  ["network", outage],
  ["invalid JSON", outage],
] as const;
for (const verify of [false, true]) {
  it.each(refusals)(`${verify ? "verify-code" : "request-code"} renders %s through submit without signing in or retrying`, async (reason, message) => {
    startInteraction();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    if (verify) {
      fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ fixtureCode: "12345678" }) });
      await submitForm(0);
      expect(renderToStaticMarkup(interactionTree())).toContain('data-testid="fixture-code">12345678');
      fetch.mockClear();
    }
    if (reason === "network") fetch.mockRejectedValueOnce(new Error("connection failed"));
    else fetch.mockResolvedValueOnce({ ok: false, json: async () => {
      if (reason === "invalid JSON") throw new SyntaxError("Invalid JSON");
      return reason === "missing code" ? {} : { code: reason };
    } });
    await submitForm(verify ? 1 : 0);
    const tree = interactionTree(), html = renderToStaticMarkup(tree);
    expect(html).toContain(`<p role="alert" tabindex="-1">${message}</p>`);
    if (message !== outage) expect(html).not.toContain(outage);
    expect(html).not.toContain("Verified account");
    expect(html).not.toContain("Invitation accepted.");
    expect(html).not.toContain("You're signed in.");
    expect(html).toContain("Do not enter real names or email addresses.");
    expect(elements(tree, "button").every(button => !button.props.disabled)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/api/auth/${verify ? "verify" : "request"}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: verify ? "identity-verify.v1" : "identity-request.v1", email: "builder@practice.invalid", purpose: "invitation", invitationId: "fictional-invitation", ...(verify ? { code: "12345678" } : {}) }),
    });
  });
}

it("preserves successful verification, invitation acceptance and sign-out through the real handlers", async () => {
  startInteraction();
  const replaceState = vi.fn();
  vi.stubGlobal("history", { replaceState });
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ fixtureCode: "12345678" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...session, csrfToken: "fictional-csrf" }) })
    .mockResolvedValueOnce({ ok: true });
  vi.stubGlobal("fetch", fetch);
  await submitForm(0);
  await submitForm(1);
  let tree = interactionTree();
  expect(renderToStaticMarkup(tree)).toContain("Invitation accepted. Your memberships above are current.");
  expect(renderToStaticMarkup(tree)).not.toContain("Practice code:");
  expect(replaceState).toHaveBeenCalledWith(null, "", "/sign-in");
  const signout = elements(tree, "button").find(button => button.props.children === "Sign out")!;
  (signout.props.onClick as () => void)();
  await new Promise(resolve => setTimeout(resolve, 0));
  tree = interactionTree();
  expect(fetch).toHaveBeenLastCalledWith("/api/auth/signout", { method: "POST", headers: { "x-csrf-token": "fictional-csrf" } });
  expect(renderToStaticMarkup(tree)).not.toContain("Verified account");
  expect(renderToStaticMarkup(tree)).not.toContain("Invitation accepted.");
  expect(renderToStaticMarkup(tree)).toContain("Request code");
});
