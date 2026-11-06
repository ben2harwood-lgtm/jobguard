import { afterEach, describe, expect, it, vi } from "vitest";
import { click, until } from "./screen-actions";
afterEach(() => vi.unstubAllGlobals());
describe("walkthrough existing-screen actions", () => {
  it("never clicks a control after cancellation", async () => {
    const button = { textContent: "Save", disabled: false, closest: () => null, getClientRects: () => [{}], setAttribute: vi.fn(), click: vi.fn(), scrollIntoView: vi.fn() };
    vi.stubGlobal("document", { getElementById: () => ({ querySelectorAll: () => [button], querySelector: () => null }) });
    const controller = new AbortController(); controller.abort();
    await expect(click("Save", controller.signal)).rejects.toThrow();
    expect(button.click).not.toHaveBeenCalled();
  });
  it("waits for an enabled control, then uses its real click handler", async () => {
    const button = { textContent: "Save", disabled: true, closest: () => null, getClientRects: () => [{}], setAttribute: vi.fn(), click: vi.fn(), scrollIntoView: vi.fn() };
    vi.stubGlobal("document", { getElementById: () => ({ querySelectorAll: () => [button], querySelector: () => null }) });
    setTimeout(() => { button.disabled = false; }, 10);
    await click("Save", new AbortController().signal);
    expect(button.click).toHaveBeenCalledOnce();
  });
  it("does not treat an unresolved action as completion", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    await expect(until(() => false, controller.signal)).rejects.toThrow();
  });
});
