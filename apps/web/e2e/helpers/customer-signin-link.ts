import { createHmac } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const secret = process.env.AUTH_CODE_SECRET ?? "sbox-only-identity-hmac-secret-32-bytes";
/** The outbox stores only a reference. Only the identity key turns it into the delivered link. */
export async function deliveredCustomerLink(reference: string) {
  const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/db")>;
  const { customerSigninLink } = await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
  return customerSigninLink(reference, value => createHmac("sha256", secret).update(value).digest("hex"));
}
