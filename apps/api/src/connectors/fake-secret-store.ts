import type { FictionalMachineSecrets } from "./machine.js";
import { ConnectorInputError } from "./inbound.js";

export type MachineFixtureSecrets = Readonly<{
  tokens: ReadonlyMap<string, string>;
  keys: ReadonlyMap<string, Uint8Array>;
}>;

/** Explicit in-memory fixtures only. Never resolves environment, files or network. */
export class FakeMachineSecretStore implements FictionalMachineSecrets {
  private readonly tokens: Map<string, string>;
  private readonly keys: Map<string, Uint8Array>;
  constructor(fixtures: MachineFixtureSecrets) {
    this.tokens = new Map(fixtures.tokens);
    this.keys = new Map();
    for (const [label, bytes] of fixtures.keys) {
      if (!/^fixture:[a-z0-9_-]{1,112}$(?![\s\S])/u.test(label) || bytes.byteLength < 32)
        throw new ConnectorInputError();
      this.keys.set(label, Uint8Array.from(bytes));
    }
  }
  async token(connectionId: string): Promise<string> {
    const token = this.tokens.get(connectionId);
    if (!token) throw new ConnectorInputError();
    return token;
  }
  async key(label: string): Promise<Uint8Array> {
    const bytes = this.keys.get(label);
    if (!/^fixture:[a-z0-9_-]{1,112}$(?![\s\S])/u.test(label) || !bytes) throw new ConnectorInputError();
    return Uint8Array.from(bytes);
  }
}
