import { describe, expect, it } from "vitest";
import { parseIdentityEnvironment } from "./index.js";

const valid = () => ({
  JOBGUARD_ENV: "synthetic_demo",
  IDENTITY_DATABASE_URL: `postgresql://${["jobguard", "identity"].join("_")}:${"p".repeat(8)}@${["db", "example", "test"].join(".")}:5432/identity`,
  AUTH_CODE_SECRET: "k".repeat(32),
  AUTH_ALLOWED_ORIGIN: `https://${["app", "example", "test"].join(".")}`,
});

describe("identity required settings", () => {
  it("accepts the complete synthetic set", () => {
    expect(() => parseIdentityEnvironment(valid())).not.toThrow();
  });

  it.each(["JOBGUARD_ENV", "IDENTITY_DATABASE_URL", "AUTH_CODE_SECRET", "AUTH_ALLOWED_ORIGIN"] as const)(
    "refuses when %s is omitted",
    key => {
      const raw: Record<string, unknown> = valid();
      delete raw[key];
      expect(() => parseIdentityEnvironment(raw)).toThrow();
    },
  );
});
