import { z } from "zod";
import { authUrlV1 } from "./auth-url.js";
const identityEnvironmentV1 = z.object({
  JOBGUARD_ENV: z.enum(["synthetic_demo", "pilot_no_charge", "production"]),
  IDENTITY_DATABASE_URL: authUrlV1.refine(value => {
    const url = new URL(value);
    return /^postgres(?:ql)?:$/u.test(url.protocol) && decodeURIComponent(url.username) === "jobguard_identity";
  }, "Identity storage requires the separate jobguard_identity credential"),
  AUTH_CODE_SECRET: z.string().min(32),
  AUTH_ALLOWED_ORIGIN: authUrlV1,
  PILOT_FIRST_OWNER_EMAILS: z.string().max(8192).transform(value =>
    value.split(",").map(email => email.trim().toLowerCase()),
  ).pipe(z.array(z.email().max(320))).optional(),
});
export const parseIdentityEnvironment = (raw: unknown) => identityEnvironmentV1.parse(raw);
