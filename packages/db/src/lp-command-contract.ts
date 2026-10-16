import { createHash } from "node:crypto";
import { z } from "zod";

/** Unconnected review candidate, not the lifecycle SQL contract or a production request hash.
 * No identifiers are excluded. The eventual reviewed operation schemas must supply and
 * validate every significant input, resource, actor and approval term before hashing.
 */
const MAX_DEPTH = 64;
const MAX_NODES = 10_000;
const MAX_BYTES = 1_048_576;
const reservedKeys = new Set(["__proto__", "prototype", "constructor"]);

function encodeCandidate(input: unknown): string {
  const active = new WeakSet<object>();
  const fragments: string[] = [];
  let nodes = 0, bytes = 0;
  const invalid = (): never => { throw new Error("LP_COMMAND_INPUT_INVALID"); };
  const emit = (text: string) => {
    bytes += Buffer.byteLength(text, "utf8");
    if (bytes > MAX_BYTES) invalid();
    fragments.push(text);
  };
  const string = (value: string) => {
    if (Buffer.byteLength(value, "utf8") > MAX_BYTES) invalid();
    for (let index = 0; index < value.length; index++) {
      const unit = value.charCodeAt(index);
      if (unit === 0 || (unit >= 0xdc00 && unit <= 0xdfff)) invalid();
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(++index);
        if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
      }
    }
    emit(JSON.stringify(value));
  };
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) invalid();
    if (value === null) { emit("null"); return; }
    if (typeof value === "string") { string(value); return; }
    if (typeof value === "boolean") { emit(value ? "true" : "false"); return; }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) invalid();
      emit(String(value)); return;
    }
    if (typeof value !== "object") return invalid();
    if (active.has(value)) invalid();
    active.add(value);
    const array = Array.isArray(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== "string")) invalid();
    const read = (key: string): unknown => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return invalid();
      return descriptor.value as unknown;
    };
    if (array) {
      if (value.length > MAX_NODES || keys.length !== value.length + 1) invalid();
      emit("[");
      for (let index = 0; index < value.length; index++) {
        if (index) emit(",");
        visit(read(String(index)), depth + 1);
      }
      emit("]");
    } else {
      if (keys.length > MAX_NODES) invalid();
      // Default string sort compares UTF-16 code units; it never depends on host locale.
      const ordered = (keys as string[]).sort();
      emit("{");
      ordered.forEach((key, index) => {
        if (reservedKeys.has(key)) invalid();
        if (index) emit(",");
        string(key); emit(":"); visit(read(key), depth + 1);
      });
      emit("}");
    }
    active.delete(value);
  };
  visit(input, 0);
  return fragments.join("");
}

// Validate decoded data before Zod reads properties, so accessors/serialization hooks
// cannot silently replace significant input. This is not a raw JSON duplicate-key parser.
const decodedCandidate = z.unknown().transform((raw, context): unknown => {
  try { return JSON.parse(encodeCandidate(raw)) as unknown; }
  catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "LP_COMMAND_INPUT_INVALID" });
    return z.NEVER;
  }
});

export const lpCommandInputCandidateV1Schema = decodedCandidate.pipe(z.object({
  version: z.literal("lp-command-input.candidate.v1"),
  significantInput: z.unknown(),
}).strict().superRefine((value, context) => {
  if (value.significantInput === undefined) context.addIssue({
    code: z.ZodIssueCode.custom, path: ["significantInput"], message: "LP_COMMAND_INPUT_INVALID",
  });
}));

export function canonicalizeCommandInputCandidate(raw: unknown): string {
  return encodeCandidate(lpCommandInputCandidateV1Schema.parse(raw));
}

export function digestCommandInputCandidate(raw: unknown): string {
  return createHash("sha256").update(canonicalizeCommandInputCandidate(raw), "utf8").digest("hex");
}
