// Config has no Node type dependency. Keep the declaration limited to the
// digest operation used by the server-only pilot resource bindings.
declare module "node:crypto" {
  export function createHash(algorithm: "sha256"): {
    update(value: string): { digest(encoding: "hex"): string };
  };
}
