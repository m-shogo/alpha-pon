import { readFileSync } from "fs";
import { isCanonicalReadOnlyJsonFile } from "./read-only-json-file.js";

export type SafeWordingFileRead =
  | { ok: true; content: string }
  | { ok: false; reason: "linked_or_non_regular" | "read_error" };

export function readSafeWordingAuditFile(path: string): SafeWordingFileRead {
  if (!isCanonicalReadOnlyJsonFile(path)) {
    return { ok: false, reason: "linked_or_non_regular" };
  }
  try {
    return { ok: true, content: readFileSync(path, "utf-8") };
  } catch {
    return { ok: false, reason: "read_error" };
  }
}
