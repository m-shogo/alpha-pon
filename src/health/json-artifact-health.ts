import { existsSync, readFileSync, statSync } from "fs";

export type JsonArtifactHealth =
  | { ok: true }
  | { ok: false; reason: "missing" | "not_file" | "empty" | "invalid_json" | "invalid_root" };

export function asJsonObject<T extends object>(value: unknown): T | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as T
    : null;
}

export function inspectJsonArtifact(path: string): JsonArtifactHealth {
  if (!existsSync(path)) return { ok: false, reason: "missing" };

  try {
    if (!statSync(path).isFile()) return { ok: false, reason: "not_file" };
    const text = readFileSync(path, "utf-8");
    if (text.trim().length === 0) return { ok: false, reason: "empty" };
    const value = JSON.parse(text) as unknown;
    return asJsonObject(value) ? { ok: true } : { ok: false, reason: "invalid_root" };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
