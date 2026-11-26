import { IdentitySignIn } from "./sign-in";
import { connection } from "next/server";

export default async function SignInPage() {
  await connection();
  return <IdentitySignIn pilot={process.env.JOBGUARD_ENV === "pilot_no_charge"}/>;
}
