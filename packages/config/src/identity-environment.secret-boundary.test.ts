import { describe, expect, it } from "vitest";
import { parseIdentityEnvironment } from "./index.js";

const withSecret = (secret: string) => ({
  JOBGUARD_ENV: "synthetic_demo",
  IDENTITY_DATABASE_URL: `postgresql://${["jobguard", "identity"].join("_")}:${"p".repeat(8)}@${["db", "example", "test"].join(".")}:5432/identity`,
  AUTH_CODE_SECRET: secret,
  AUTH_ALLOWED_ORIGIN: `https://${["app", "example", "test"].join(".")}`,
});

describe("identity code secret length boundary", () => {
  it("refuses a 31-character synthetic secret", () => {
    expect(() => parseIdentityEnvironment(withSecret("a".repeat(31)))).toThrow();
  });

  it.each([32, 33, 64])("accepts a %i-character synthetic secret", length => {
    expect(parseIdentityEnvironment(withSecret("a".repeat(length))).AUTH_CODE_SECRET).toHaveLength(length);
  });
});
