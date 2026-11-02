import { ZodError } from "zod";

/** Includes the legacy ZodError used by the supplier adapter. */
export function isRouteValidationError(error: unknown): boolean {
  return error instanceof ZodError || (error instanceof Error && error.name === "ZodError");
}

/** Classify schema failures before reading any business error message. */
export function routeErrorCode(error: unknown, validationCode: string): string {
  if (isRouteValidationError(error)) return validationCode;
  return error instanceof Error ? error.message : validationCode;
}
