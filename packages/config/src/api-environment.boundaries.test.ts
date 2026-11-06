import { describe, expect, it } from "vitest";
import { parseApiEnvironment } from "./index.js";

describe("parseApiEnvironment port boundary", () => {
  it("uses the existing default when the port is omitted", () => {
    expect(parseApiEnvironment({}).API_PORT).toBe(3001);
  });

  it.each([1, 3001, 65535])("accepts valid port %i", port => {
    expect(parseApiEnvironment({ API_PORT: String(port) }).API_PORT).toBe(port);
  });

  it.each(["0", "65536", "-1", "1.5", "not-a-port"])("refuses explicit invalid port %s", port => {
    expect(() => parseApiEnvironment({ API_PORT: port })).toThrow();
  });
});
