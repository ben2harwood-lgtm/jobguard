import { z } from "zod";

const apiEnvironmentSchema = z.object({ API_PORT: z.coerce.number().int().min(1).max(65535).default(3001) });
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export const parseApiEnvironment = (environment: unknown): ApiEnvironment => apiEnvironmentSchema.parse(environment);
