import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CisFixtureScreen } from "./screen";
const state = vi.hoisted(() => ({ values: [] as unknown[], set: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: () => [state.values.shift(), state.set], useEffect: () => undefined }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("labels the unapproved fixture and never claims a verification or approval occurred", () => {
  state.values = [null, "", false, null];
  const html = renderToStaticMarkup(<CisFixtureScreen jobId="fictional" />);
  expect(html).toContain("Practice calculation. Approved by no adviser. Nothing is submitted to HMRC.");
  expect(html).toContain("fictional fixture values that prove nothing");
  expect(html).toContain("No evidence, HMRC verification or human approval is asserted.");
});
it("renders the supplied server figures, policy and rate without deriving amounts", () => {
  const fields = ["invoiceNet", "vatToSupplier", "reverseChargeVat", "retention", "cisDeduction", "actualCash", "unpaidCash", "invoiceUnpaidCash", "refundDue", "feeEligibleRecovery"];
  const row = { ...Object.fromEntries(fields.map((key, i) => [key, { pence: key === "feeEligibleRecovery" ? 0 : 101 + i }])),
    source: { id: "fictional", documentReference: "Server statement" }, rateNumerator: 20 };
  state.values = [{ stored: { book: { statements: [] }, reconciliation: { policyVersion: "server-policy", statements: [row] } }, issueReason: "Server issue refusal" }, "", false, null];
  const html = renderToStaticMarkup(<CisFixtureScreen jobId="fictional" />);
  for (const phrase of ["Invoice net", "Supplier VAT", "Reverse-charge VAT", "Retention", "CIS deduction (not unpaid debt)", "Actual cash", "Remaining allocated cash", "Fee-eligible recovery", "£1.01", "£1.06", "£0.00", "server-policy", "20/100", "Server issue refusal"]) expect(html).toContain(phrase);
  expect(html).toContain("disabled");
});
function buttons(node: React.ReactNode): React.ReactElement<{ onClick?: () => void; children?: React.ReactNode }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return node.type === "button" ? [node] : buttons(node.props.children);
}
it.each([408, 429, 503])("retries the identical saved payload after uncertain response %s, without clearing the command", async (status) => {
  const payload = JSON.stringify({ version: "cis.persist-fixture.v1", commandId: "same-fictional-id" });
  const removeItem = vi.fn(); vi.stubGlobal("sessionStorage", { removeItem });
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => url === "/api/auth/session"
    ? new Response(JSON.stringify({ csrfToken: "fictional-csrf", memberships: [{ tenantId: "fictional-tenant" }] }))
    : new Response(JSON.stringify({ reason: "Outcome unavailable; retry." }), { status }));
  vi.stubGlobal("fetch", fetch);
  state.values = [null, "", false, payload];
  const retry = buttons(CisFixtureScreen({ jobId: "fictional" })).find(button => button.props.children === "Retry same command")!;
  retry.props.onClick!();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  retry.props.onClick!();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
  for (const call of fetch.mock.calls.filter(call => call[0] !== "/api/auth/session")) expect((call[1] as RequestInit).body).toBe(payload);
  expect(removeItem).not.toHaveBeenCalled(); expect(state.set).not.toHaveBeenCalledWith(null);
});
