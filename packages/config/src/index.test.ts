import { describe, expect, it } from "vitest";
import { parseApiEnvironment } from "./index.js";
describe("parseApiEnvironment", () => { it("provides a safe local default", () => expect(parseApiEnvironment({}).API_PORT).toBe(3001)); });
