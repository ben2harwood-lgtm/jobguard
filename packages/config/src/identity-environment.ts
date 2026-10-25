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
});
export const parseIdentityEnvironment = (raw: unknown) => identityEnvironmentV1.parse(raw);
