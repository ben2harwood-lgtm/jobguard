import { describe, expect, it } from "vitest";
import { parseIdentityEnvironment } from "./index.js";

const user = ["jobguard", "identity"].join("_");
const host = ["db", "example", "test"].join(".");
const secret = "s".repeat(32);
const base = (databaseUrl: string) => ({
  JOBGUARD_ENV: "synthetic_demo",
  IDENTITY_DATABASE_URL: databaseUrl,
  AUTH_CODE_SECRET: secret,
  AUTH_ALLOWED_ORIGIN: `https://${["app", "example", "test"].join(".")}`,
});
const url = (protocol: string, username: string) => `${protocol}://${username}:${"p".repeat(8)}@${host}:5432/identity`;

describe("identity database URL boundary", () => {
  it.each(["postgres", "postgresql"])("accepts %s URLs with the identity username", protocol => {
    expect(parseIdentityEnvironment(base(url(protocol, user))).IDENTITY_DATABASE_URL).toBe(url(protocol, user));
  });

  it.each(["mysql", "http", "redis"])("refuses %s protocol", protocol => {
    expect(() => parseIdentityEnvironment(base(url(protocol, user)))).toThrow();
  });

  it.each(["postgres", "jobguard_app", `${user}_extra`, `x${user}`])("refuses username %s", username => {
    expect(() => parseIdentityEnvironment(base(url("postgresql", username)))).toThrow();
  });
});
