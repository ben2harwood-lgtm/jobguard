import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Keep the shared floor independent of control classes and the designed skin's
// smaller, more specific rules. This also covers conditional dictation controls.
const css = readFileSync("app/styles.css", "utf8");
const floor = css.match(/:is\(\.walk,\s*\.review\)\s*:is\(([^)]+)\)([^{}]*)\{([^}]+)\}/u);

it.each(["a", "input", "select", "summary"])("capture and review %s controls share the touch-height floor", tag => {
  expect(floor, "Missing shared capture/review touch-height rule").not.toBeNull();
  expect(floor![1]!.split(",").map(selector => selector.trim())).toContain(tag);
});

it("covers smaller designed buttons and preserves the taller classic button minimum", () => {
  expect(floor, "Missing shared capture/review touch-height rule").not.toBeNull();
  expect(floor![2]).toContain(".jgd .jgd-legacy.jgd-tools :is(.walk,.review) button");
  const buttons = [...css.matchAll(/(?:^|\})button\{[^}]*min-height:(\d+)px[^}]*\}/gu)];
  expect(buttons.length).toBeGreaterThan(0);
  expect(Number(buttons.at(-1)![1])).toBeGreaterThanOrEqual(44);
  expect(floor![1]!.split(",")).not.toContain("button");
});

it("enforces at least 44px despite skin overrides, changing only min-height", () => {
  expect(floor, "Missing shared capture/review touch-height rule").not.toBeNull();
  const declarations = floor![3]!.split(";").map(value => value.trim()).filter(Boolean);
  expect(declarations).toHaveLength(1);
  const height = declarations[0]!.match(/^min-height:\s*(\d+(?:\.\d+)?)px\s*!important$/u);
  expect(height, "The shared floor must override smaller skin min-heights").not.toBeNull();
  expect(Number(height![1])).toBeGreaterThanOrEqual(44);
});
