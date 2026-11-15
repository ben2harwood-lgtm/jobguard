import { afterEach, describe, expect, it, vi } from "vitest";
import { click, until } from "./screen-actions";
import { viewerPlayback } from "../../ui/walkthrough/walkthrough";
afterEach(() => vi.unstubAllGlobals());
describe("walkthrough existing-screen actions", () => {
  it("never clicks a control after cancellation", async () => {
    const button = { textContent: "Save", disabled: false, closest: () => null, getClientRects: () => [{}], setAttribute: vi.fn(), click: vi.fn(), scrollIntoView: vi.fn() };
    vi.stubGlobal("document", { querySelectorAll: () => [], getElementById: () => ({ querySelectorAll: () => [button], querySelector: () => null }) });
    const controller = new AbortController(); controller.abort();
    await expect(click("Save", controller.signal)).rejects.toThrow();
    expect(button.click).not.toHaveBeenCalled();
  });
  it("waits for an enabled control, then uses its real click handler", async () => {
    const button = { textContent: "Save", disabled: true, closest: () => null, getClientRects: () => [{}], setAttribute: vi.fn(), click: vi.fn(), scrollIntoView: vi.fn() };
    vi.stubGlobal("document", { querySelectorAll: () => [], getElementById: () => ({ querySelectorAll: () => [button], querySelector: () => null }) });
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

it("clears the previous pointer marker before pointing at the next real control", async () => {
  const removeAttribute = vi.fn();
  const button = { textContent: "Save", disabled: false, closest: () => null, getClientRects: () => [{}], setAttribute: vi.fn(), click: vi.fn(), scrollIntoView: vi.fn() };
  vi.stubGlobal("document", { querySelectorAll: () => [{ removeAttribute }], getElementById: () => ({ querySelectorAll: () => [button] }) });
  await click("Save", new AbortController().signal);
  expect(removeAttribute).toHaveBeenCalledWith("data-walk-action");
  expect(button.setAttribute).toHaveBeenCalledWith("data-walk-action", "true");
});

it.each([
  [false, false, 0], [true, false, 1200], [true, true, 0],
] as const)("paces only viewer autoplay (%s, reduced %s)", async (playing, reduced, delay) => {
  vi.useFakeTimers();
  try {
    const button = { textContent: "Save", disabled: false, closest: () => null, getClientRects: () => [{}], setAttribute: vi.fn(), click: vi.fn(), scrollIntoView: vi.fn() };
    vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
    vi.stubGlobal("document", { querySelectorAll: () => [], getElementById: () => ({ querySelectorAll: () => [button] }) });
    const controller = new AbortController();
    if (playing) viewerPlayback.add(controller.signal);
    const action = click("Save", controller.signal);
    if (delay) { await vi.advanceTimersByTimeAsync(delay - 1); expect(button.click).not.toHaveBeenCalled(); }
    await vi.advanceTimersByTimeAsync(delay ? 2 : 1); await action; expect(button.click).toHaveBeenCalledOnce();
    expect(button.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "instant" });
  } finally { vi.useRealTimers(); }
});

it("cancels a viewer pointer pause without clicking the control", async () => {
  vi.useFakeTimers();
  try {
    const button = { textContent: "Save", disabled: false, closest: () => null, getClientRects: () => [{}], setAttribute: vi.fn(), click: vi.fn(), scrollIntoView: vi.fn() };
    vi.stubGlobal("document", { querySelectorAll: () => [], getElementById: () => ({ querySelectorAll: () => [button] }) });
    const controller = new AbortController(); viewerPlayback.add(controller.signal);
    const action = click("Save", controller.signal);
    const rejected = expect(action).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(100); controller.abort(); await rejected;
    expect(button.click).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

it("opens nested closed ancestors before testing visibility and clicking an exact enabled action", async () => {
  const outer = {open:false, parentElement:null};
  const inner = {open:false, parentElement:{closest:()=>outer}};
  const button = {textContent:"Save",disabled:false,parentElement:{closest:()=>inner},closest:()=>null,getClientRects:()=>inner.open&&outer.open?[{}]:[],setAttribute:vi.fn(),click:vi.fn(),scrollIntoView:vi.fn()};
  vi.stubGlobal("document",{querySelectorAll:()=>[],getElementById:()=>({querySelectorAll:()=>[{...button,textContent:"Save another"},button]})});
  const controller=new AbortController();setTimeout(()=>controller.abort(),300);
  await click("Save",controller.signal);
  expect(inner.open).toBe(true);expect(outer.open).toBe(true);expect(button.click).toHaveBeenCalledOnce();
});
it.each(["disabled", "fieldset", "cancelled"])("does not disclose or click a %s action",async reason=>{
 const details={open:false,parentElement:null};
 const button={textContent:"Save",disabled:reason==="disabled",parentElement:{closest:()=>details},closest:()=>reason==="fieldset"?{}:null,getClientRects:()=>[{}],click:vi.fn()};
 vi.stubGlobal("document",{getElementById:()=>({querySelectorAll:()=>[button]})});
 const controller=new AbortController();if(reason==="cancelled")controller.abort();else setTimeout(()=>controller.abort(),10);
 await expect(click("Save",controller.signal)).rejects.toThrow();expect(button.click).not.toHaveBeenCalled();expect(details.open).toBe(false);
});
