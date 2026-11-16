import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PracticeBankScreen } from "./screen";

// Stateful interaction harness, as used by quote-editor-interaction.test.tsx.
// Executes the screen's effects, state setters and actual event handlers.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: unknown[] = [], effects: (() => void)[] = [];
  return {
    reset() { cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: unknown) => { slots[index] = value; }];
    },
    useRef(initial: unknown) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(fn: () => void, deps: unknown[]) {
      const index = cursor++;
      if (!(index in slots)) { slots[index] = deps; effects.push(fn); }
    },
  };
});
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));
type Node = React.ReactElement<Record<string, any>>;
function all(tree: React.ReactNode, match: (node: Node) => boolean): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(child => all(child, match));
  if (!React.isValidElement<Record<string, any>>(tree)) return [];
  return [...(match(tree) ? [tree] : []), ...all(tree.props.children, match)];
}
function text(tree: React.ReactNode): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (React.isValidElement<Record<string, any>>(tree)) return text(tree.props.children);
  return typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}
function render() { hooks.render(); const tree = PracticeBankScreen(); hooks.effects(); return tree; }
const button = (name: string) => all(render(), node => node.type === "button" && text(node) === name)[0]!;
function click(name: string) { const node = button(name); expect(node).toBeTruthy(); expect(node.props.disabled).toBeFalsy(); node.props.onClick(); }
function choose(tenantId: string) { all(render(), node => node.type === "select")[0]!.props.onChange({ target: { value: tenantId } }); }
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const A = "00000000-0000-4000-8000-000000000001", B = "00000000-0000-4000-8000-000000000002";
const CA = "00000000-0000-4000-8000-000000000003", CB = "00000000-0000-4000-8000-000000000004";
const companyA = { tenantId: A, name: "Company A" }, companyB = { tenantId: B, name: "Company B" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const view = (tenant = B, status: string | null = "linked", credentialsUnavailable?: boolean) => ({
  version: "ais-practice-view.v1", connection: status ? { connectionId: tenant === A ? CA : CB, status } : null,
  credentialsUnavailable, movements: [{ movementRef: tenant === A ? "cash_A" : "cash_B", status: "settled", pence: 32000, currency: "GBP", bookedOn: "2026-10-02" }],
});
let session: unknown, fetcher: ReturnType<typeof vi.fn>, bank: (init: RequestInit) => Promise<Response>;
const calls = () => fetcher.mock.calls.filter(([url]) => url === "/api/practice-bank");
beforeEach(() => {
  hooks.reset(); vi.stubGlobal("React", React); vi.stubGlobal("window", { location: { search: "" } });
  session = { csrfToken: "fresh-csrf", memberships: [companyA, companyB] };
  bank = async init => json(view((init.headers as Record<string, string>)["x-tenant-id"]));
  fetcher = vi.fn(async (url: string, init: RequestInit) => url === "/api/auth/session" ? json(session) : bank(init));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
async function loaded(tenant = B) { render(); await settle(); choose(tenant); await settle(); }
function deferred() { let release!: (response: Response) => void; const promise = new Promise<Response>(resolve => { release = resolve; }); return { promise, release }; }

it("waits for an explicit company, labels B and binds every read and command to B despite reordering", async () => {
  render(); await settle();
  expect(calls()).toHaveLength(0); expect(text(render())).toContain("Choose a company to practise.");
  expect(button("Refresh practice bank").props.disabled).toBe(true);
  choose(B); await settle();
  expect(text(render())).toContain("Practice bank for Company B"); expect(text(render())).toContain("cash_B");
  session = { csrfToken: "rotated-csrf", memberships: [companyB, companyA] };
  for (const [name, operation] of [["Refresh practice bank", undefined], ["Reconnect fictional account", "start"],
    ["Approve practice consent", "approve-fake-consent"], ["Pull fictional movements", "pull"],
    ["Revoke practice consent", "revoke"], ["Unlink fictional account", "unlink"]] as const) {
    bank = async () => json(view(B, operation === "start" ? "awaiting_consent" : "linked"));
    click(name); await settle();
    const init = calls().at(-1)![1] as RequestInit;
    expect(init.headers).toMatchObject({ "x-tenant-id": B, "x-csrf-token": "rotated-csrf" });
    expect(init.method).toBe(operation ? "POST" : "GET");
    if (operation) expect(JSON.parse(init.body as string)).toEqual({ version: "ais-practice-command.v1", operation,
      ...(operation === "start" ? {} : { connectionId: CB }) });
  }
  for (const [, init] of fetcher.mock.calls) expect(init).toMatchObject({ cache: "no-store", credentials: "same-origin" });
});
it("keeps the one-company path convenient and preserves fictional/fee disclaimers", async () => {
  session = { csrfToken: "csrf", memberships: [companyA] }; render(); await settle();
  expect(calls()).toHaveLength(1); expect(text(render())).toContain("cash_A");
  expect(text(render())).toContain("Fictional account only. No real bank is connected.");
  expect(text(render())).toContain("A bank line does not mark a case landed and does not start a fee.");
});
it.each(["?tenantId=foreign", `?tenantId=${CA}`, `?tenantId=${A}&tenantId=${B}`, "?tenantId="])("refuses an invalid or ambiguous URL request %s", async search => {
  window.location.search = search; render(); await settle();
  expect(calls()).toHaveLength(0); expect(text(render())).toContain("Company access changed.");
});
it("honours an explicit authorised URL selection", async () => {
  window.location.search = `?tenantId=${B}`; render(); await settle();
  expect(calls()).toHaveLength(1); expect(text(render())).toContain("cash_B");
});
it.each([[], [companyA, companyA], [{ tenantId: "malformed" }], [null], undefined])("fails closed on malformed/ambiguous memberships %j", async memberships => {
  session = { csrfToken: "csrf", memberships }; render(); await settle();
  expect(calls()).toHaveLength(0); expect(text(render())).toContain("Company access changed.");
});
it.each([CA, "foreign", ""])("clears figures and controls on unknown company %s", async tenant => {
  await loaded(); choose(tenant); await settle();
  expect(calls()).toHaveLength(1); expect(text(render())).not.toContain("cash_B");
  expect(all(render(), node => node.props["aria-label"] === "Practice consent")).toHaveLength(0);
  expect(button("Refresh practice bank").props.disabled).toBe(true);
});
it("refreshes session before a command, clearing lost B without falling back to A", async () => {
  await loaded(); session = { csrfToken: "new", memberships: [companyA] };
  click("Pull fictional movements"); await settle();
  expect(calls()).toHaveLength(1); expect(text(render())).not.toContain("cash_B");
  expect(text(render())).not.toContain("No settled movements."); expect(text(render())).toContain("Company access changed.");
});
it("does not reuse A's connection for B and guards double commands before rendering", async () => {
  await loaded(A); choose(B); await settle();
  const pending = deferred(); bank = () => pending.promise;
  const action = button("Pull fictional movements").props.onClick;
  action(); action(); await settle(); expect(calls()).toHaveLength(3);
  expect(JSON.parse(calls().at(-1)![1].body)).toMatchObject({ connectionId: CB });
  pending.release(json(view())); await settle();
});
it.each([false, true])("discards A's delayed read success/failure (%s) after selecting B", async failure => {
  render(); await settle(); const pending = deferred(); bank = () => pending.promise;
  choose(A); await settle(); bank = async () => json(view()); choose(B); await settle();
  expect(text(render())).toContain("cash_B");
  pending.release(failure ? json({ code: "AIS_INACTIVE" }, 409) : json(view(A, "awaiting_consent"))); await settle();
  expect(text(render())).toContain("cash_B"); expect(text(render())).not.toContain("cash_A");
  expect(text(render())).not.toContain("Consent is inactive"); expect(text(render())).not.toContain("Approve practice consent");
});
it.each([false, true])("discards A's delayed command success/failure (%s), without recovery under B", async failure => {
  await loaded(A); const pending = deferred(); bank = () => pending.promise;
  click("Pull fictional movements"); await settle();
  bank = async () => json(view()); choose(B); await settle();
  expect(button("Pull fictional movements").props.disabled).toBe(false);
  pending.release(failure ? json({ code: "AIS_INACTIVE" }, 409) : json(view(A, "awaiting_consent"))); await settle();
  expect(calls()).toHaveLength(3); expect(text(render())).toContain("cash_B");
  expect(text(render())).not.toContain("cash_A"); expect(text(render())).not.toContain("Consent is inactive");
  expect(text(render())).not.toContain("Approve practice consent");
});
it("ignores an old company's click handler after switching, rather than posting its connection under B", async () => {
  await loaded(A); const oldAction = button("Pull fictional movements").props.onClick;
  choose(B); await settle(); oldAction(); await settle();
  expect(calls()).toHaveLength(2); expect(calls().every(([, init]) => init.method === "GET")).toBe(true);
});
it("an old command cannot release B's busy protection", async () => {
  await loaded(A); const old = deferred(); bank = () => old.promise;
  click("Pull fictional movements"); await settle();
  const next = deferred(); bank = () => next.promise; choose(B); await settle();
  old.release(json(view(A))); await settle();
  expect(button("Refresh practice bank").props.disabled).toBe(true);
  expect(text(render())).not.toContain("cash_A");
  next.release(json(view())); await settle(); expect(button("Refresh practice bank").props.disabled).toBe(false);
});
it("a lost company during error recovery clears data without a fallback bank read", async () => {
  await loaded(); bank = async () => { session = { csrfToken: "csrf", memberships: [companyA] }; return json({ code: "AIS_INACTIVE" }, 409); };
  click("Pull fictional movements"); await settle();
  expect(calls()).toHaveLength(2); expect(text(render())).not.toContain("cash_B");
  expect(text(render())).toContain("Company access changed.");
});
it("a refused session refresh blocks the command and clears figures", async () => {
  await loaded(); fetcher.mockImplementationOnce(async () => json({}, 401));
  click("Pull fictional movements"); await settle();
  expect(calls()).toHaveLength(1); expect(text(render())).not.toContain("cash_B");
  expect(text(render())).toContain("Company access changed.");
});
it("never posts a command whose session refresh finishes after switching companies", async () => {
  await loaded(A); const pending = deferred();
  fetcher.mockImplementationOnce(() => pending.promise); click("Pull fictional movements"); await settle();
  choose(B); await settle(); pending.release(json(session)); await settle();
  expect(calls()).toHaveLength(2); expect(calls().every(([, init]) => init.method === "GET")).toBe(true);
});
it("reloads durable token-loss status after a failed pull within B and retains the fixed safe error", async () => {
  await loaded(); bank = async init => init.method === "POST" ? json({ code: "AIS_TOKEN_REVOKED", message: "secret" }, 409) : json(view(B, "linked", true));
  click("Pull fictional movements"); await settle();
  expect(calls()).toHaveLength(3); expect(text(render())).toContain("cash_B");
  expect(text(render())).toContain("Practice credentials lost or revoked. Connect again for fresh consent.");
  expect(text(render())).not.toContain("secret"); expect(button("Pull fictional movements").props.disabled).toBe(true);
});
it("discards a delayed A recovery read after a switch to B", async () => {
  await loaded(A); const pending = deferred();
  bank = async init => init.method === "POST" ? json({ code: "AIS_INACTIVE" }, 409) : pending.promise;
  click("Pull fictional movements"); await settle(); bank = async () => json(view()); choose(B); await settle();
  pending.release(json(view(A, "awaiting_consent"))); await settle();
  expect(text(render())).toContain("cash_B"); expect(text(render())).not.toContain("cash_A");
  expect(text(render())).not.toContain("Approve practice consent"); expect(text(render())).not.toContain("Consent is inactive");
});
it("shows refusal as unavailable rather than a successful empty movement list", async () => {
  bank = async () => json({ message: "secret exception" }, 403); await loaded();
  expect(text(render())).toContain("Practice bank unavailable."); expect(text(render())).not.toContain("No settled movements.");
  expect(text(render())).not.toContain("secret exception"); expect(text(render())).not.toContain("Connect fictional account");
});
it.each([false, undefined])("preserves pull with credentialsUnavailable=%s", async credentialsUnavailable => {
  bank = async () => json(view(B, "linked", credentialsUnavailable)); await loaded();
  expect(button("Pull fictional movements").props.disabled).toBe(false);
});
it("keeps DB imports, provider credentials and consent secrets out of the client", () => {
  const source = readFileSync("app/practice-bank/screen.tsx", "utf8");
  expect(source).not.toMatch(/@jobguard\/db|fake_token_|stateHash|client_secret|\.state\b|\.code\s*:/u);
  for (const status of ["pending", "settled", "reversed"]) expect(source).toContain(`"${status}"`);
  expect(source).toContain("m.status === status");
});
