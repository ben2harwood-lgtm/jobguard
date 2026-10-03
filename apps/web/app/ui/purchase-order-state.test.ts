import { afterEach, describe, expect, it, vi } from "vitest";
import { canApproveOrder, orderMatchesForm } from "./purchase-order-state";
import { createMaterialsCommand } from "./materials-command";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseOrder } from "./purchase-order";

// Seed initial UI state for a server render; domain guards/command serialization
// below are exercised separately without mocking requests or a successful API.
const renderState = vi.hoisted(() => ({ order: null as unknown, quantity: "10", busy: false }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual,
    useState: (initial: unknown) => actual.useState(initial === null ? renderState.order : initial === "10" ? renderState.quantity : initial === "25.00" ? "20.00" : initial),
    useSyncExternalStore: (subscribe: (listener: () => void) => () => void, snapshot: () => boolean) => actual.useSyncExternalStore(subscribe, snapshot, () => renderState.busy),
  };
});
afterEach(() => { renderState.order = null; renderState.quantity = "10"; renderState.busy = false; vi.unstubAllGlobals(); });

const form = { quantity: "10", unitPrice: "20.00", recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01" };
const order = { quantity: "10.000000", unitPricePence: 2000, recipient: form.recipient, requiredDate: form.requiredDate, differencePence: 0 };
describe("purchase order approval eligibility", () => {
  it("allows only the matching preview when no command is pending", () => {
    expect(canApproveOrder(order, form, false)).toBe(true);
    expect(canApproveOrder(null, form, false)).toBe(false);
    expect(canApproveOrder({ ...order, differencePence: 1 }, form, false)).toBe(false);
  });
  it.each([{ quantity: "11" }, { unitPrice: "20.01" }, { recipient: "changed@fictional.invalid" }, { requiredDate: "2026-10-02" }, { unitPrice: "20.001" }, { quantity: "invalid" }])("blocks unsaved form edits %j", change => {
    const dirty = { ...form, ...change };
    expect(orderMatchesForm(order, dirty)).toBe(false);
    expect(canApproveOrder(order, dirty, false)).toBe(false);
  });
  it("blocks approval for the whole preview command and authoritative refresh", async () => {
    const flow = createMaterialsCommand();
    let commit!: () => void, refresh!: () => void;
    const committed = new Promise<void>(resolve => { commit = resolve; });
    const refreshed = new Promise<void>(resolve => { refresh = resolve; });
    flow.register(() => refreshed);
    const preview = flow.run(() => committed);
    expect(canApproveOrder(order, form, flow.isBusy())).toBe(false);
    commit();
    await Promise.resolve();
    expect(canApproveOrder(order, form, flow.isBusy())).toBe(false);
    refresh();
    await preview;
    expect(canApproveOrder(order, form, flow.isBusy())).toBe(true);
  });
});

describe("rendered Approve simulated order control", () => {
  it.each([ ["matching", "10", false, false], ["dirty", "11", false, true], ["preview pending", "10", true, true] ] as const)("renders %s approval state", (_name, quantity, busy, disabled) => {
    renderState.order = { ...order, draftId: "draft", revisionId: "shown-revision", revision: 2,
      orderNetPence: 20000, agreedNetPence: 20000, authorityHash: "shown-hash", status: "Draft — approval needed",
      outboxEffectCount: 0, availability: "Availability unknown", preventedFeePence: 0 };
    renderState.quantity = quantity; renderState.busy = busy;
    // Vitest preserves the project's classic JSX transform; Next supplies its own runtime.
    vi.stubGlobal("React", React);
    const html = renderToStaticMarkup(createElement(PurchaseOrder, { jobId: "render-only" }));
    const button = html.match(/<button[^>]*>Approve simulated order<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button!.includes('disabled=""')).toBe(disabled);
  });
});
