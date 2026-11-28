import { PilotG1DeniedError, requirePilotG1 } from "./policy-gates.js";

/** Email routing is a server decision. This configuration can only select a fake. */
export function commercialEmailEnabled(
  mode: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (mode !== env.JOBGUARD_ENV) return false;
  if (mode === "synthetic_demo") return true;
  if (mode !== "pilot_no_charge") return false;
  try {
    requirePilotG1(env);
    return true;
  } catch (error) {
    if (error instanceof PilotG1DeniedError) return false;
    throw error;
  }
}
