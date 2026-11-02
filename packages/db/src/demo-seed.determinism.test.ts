import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { demoCheckpoints, seedDemo, type DemoSeedCommand } from "./demo-seed.js";

describe("LATER-B2 L088 independent demo seed determinism", () => {
  it("AC1 AC3 independent seed invocations produce identical command streams", async () => {
    const first = await recordSeed();
    const second = await recordSeed();

    expect(first.map(command => command.checkpoint)).toStrictEqual([...demoCheckpoints]);
    expectIdenticalStreams(first, second);
  });

  it("AC2 determinism proof detects a changed second-run identity", async () => {
    let invocation = 0;
    const changingSeed: typeof seedDemo = async (environment, boundary) => {
      invocation++;
      return seedDemo(environment, {
        execute: command => boundary.execute(invocation === 2 && command.checkpoint === demoCheckpoints[0]
          ? { ...command, commandId: randomUUID() }
          : command),
      });
    };
    const first = await recordSeed(changingSeed);
    const second = await recordSeed(changingSeed);

    expect(invocation).toBe(2);
    expect(second[0]?.commandId).not.toBe(first[0]?.commandId);
    expect(second).toStrictEqual(first.map((command, index) => index === 0
      ? { ...command, commandId: second[0]?.commandId }
      : command));
    expect(() => expectIdenticalStreams(first, second)).toThrow();
  });
});

async function recordSeed(seed: typeof seedDemo = seedDemo): Promise<DemoSeedCommand[]> {
  const commands: DemoSeedCommand[] = [];
  await seed("synthetic_demo", {
    execute: async command => {
      commands.push(structuredClone(command));
      return "created";
    },
  });
  return commands;
}

function expectIdenticalStreams(first: DemoSeedCommand[], second: DemoSeedCommand[]): void {
  expect(first.length).toBeGreaterThan(0);
  expect(second).not.toBe(first);
  // Full envelopes compare identities, order, values and tenant/job/scope references.
  expect(second).toStrictEqual(first);
}
