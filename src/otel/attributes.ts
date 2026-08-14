import { isPlainObject } from "../jsonl.js";

export type OtlpValue =
  | { stringValue: string }
  | { intValue: string | number }
  | { doubleValue: number }
  | { boolValue: boolean };

export function otlpAttributeMap(
  attributes: unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!Array.isArray(attributes)) return out;
  for (const attr of attributes) {
    if (!isPlainObject(attr) || typeof attr.key !== "string") continue;
    out[attr.key] = unwrapOtlpValue(attr.value);
  }
  return out;
}

export function unwrapOtlpValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (!isPlainObject(value)) return undefined;
  if (typeof value.stringValue === "string") return value.stringValue;
  if (typeof value.intValue === "number" && Number.isFinite(value.intValue)) return value.intValue;
  if (typeof value.intValue === "string" && value.intValue.trim()) {
    const n = Number(value.intValue);
    return Number.isFinite(n) ? n : value.intValue;
  }
  if (typeof value.doubleValue === "number" && Number.isFinite(value.doubleValue)) {
    return value.doubleValue;
  }
  if (typeof value.boolValue === "boolean") return value.boolValue;
  return undefined;
}

export function asOptionalString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function asOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asOptionalNonNegInt(value: unknown): number | null {
  const n = asOptionalNumber(value);
  if (n === null || n < 0) return null;
  return Math.floor(n);
}
