import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumberField, parseDiscountText, parseQuantityText, parseRateText, penceText } from "./quote-number-input";

const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: any[] = [];
  return {
    reset() { cursor = 0; slots.length = 0; },
    render() { cursor = 0; },
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useEffect() { cursor++; },
  };
});
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); });

describe("TOMMY-DEMO quote number parsing", () => {
  it.each(["1", "2.5", "0", "0.000001", "999999999"])("accepts quantity %s", value => expect(parseQuantityText(value)).toEqual({ ok: true, value }));
  it.each(["2.", "abc", "-", "-3", "1,5", "9999999999999", ".5", "01"])("refuses quantity %s with a plain message", value => {
    const parsed = parseQuantityText(value);
    expect(parsed.ok).toBe(false);
  });
  it("treats an empty quantity as not entered yet", () => expect(parseQuantityText(" ")).toEqual({ ok: true, value: null }));
  it.each([["", "0"], ["5", "5"], ["12.5", "12.5"], ["100", "100"]])("accepts discount %s", (text, value) => expect(parseDiscountText(text)).toEqual({ ok: true, value }));
  it.each(["abc", "-5", "150", "1,5", "0100", "12."])("refuses discount %s", value => expect(parseDiscountText(value).ok).toBe(false));
  it.each([["1250", 125000], ["1,250.50", 125050], ["£1,000,000", 100000000], ["£ 12.5", 1250], ["0.99", 99]])("reads rate %s as %i pence", (text, pence) =>
    expect(parseRateText(text)).toEqual({ ok: true, value: pence }));
  it.each(["abc", "-50", "1,25", "12.345", "1e3", "10000000001"])("refuses rate %s", value => expect(parseRateText(value).ok).toBe(false));
  it("shows pence as pounds", () => { expect(penceText(125050)).toBe("1250.50"); expect(penceText(null)).toBe(""); });
});

describe("TOMMY-DEMO NumberField", () => {
  function field() {
    vi.stubGlobal("React", React);
    const commits: unknown[] = [], validity: boolean[] = [];
    const render = () => { hooks.render(); return NumberField({ label: "Quantity Paint", value: "1" as string | null, show: v => v ?? "", parse: parseQuantityText, commit: v => commits.push(v), onValidity: ok => validity.push(ok) }); };
    const input = () => (render().props.children as React.ReactElement<any>[])[0]!;
    const alert = () => (render().props.children as React.ReactNode[])[1];
    return { input, alert, commits, validity };
  }
  it("keeps a half-typed value on screen without committing it, then commits the finished number", () => {
    const f = field();
    f.input().props.onChange({ target: { value: "2." } });
    expect(f.input().props.value).toBe("2.");
    expect(f.commits).toEqual([]);
    expect(f.validity.at(-1)).toBe(false);
    expect(React.isValidElement(f.alert())).toBe(true);
    f.input().props.onChange({ target: { value: "2.5" } });
    expect(f.commits).toEqual(["2.5"]);
    expect(f.validity.at(-1)).toBe(true);
    expect(f.alert()).toBeFalsy();
  });
  it("never commits letters or a minus sign", () => {
    const f = field();
    for (const value of ["abc", "-", "-3"]) f.input().props.onChange({ target: { value } });
    expect(f.commits).toEqual([]);
  });
});
