import { existsSync, readFileSync, statSync } from "fs";

export type JsonArtifactHealth =
  | { ok: true }
  | { ok: false; reason: "missing" | "not_file" | "empty" | "invalid_json" };

export function inspectJsonArtifact(path: string): JsonArtifactHealth {
  if (!existsSync(path)) return { ok: false, reason: "missing" };

  try {
    if (!statSync(path).isFile()) return { ok: false, reason: "not_file" };
    const text = readFileSync(path, "utf-8");
    if (text.trim().length === 0) return { ok: false, reason: "empty" };
    const value = JSON.parse(text) as unknown;
    return value === null ? { ok: false, reason: "invalid_json" } : { ok: true };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
