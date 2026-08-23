import { existsSync, lstatSync, readFileSync, statSync } from "fs";

export type RequiredFileState = "ok" | "missing" | "not_file" | "empty";

export function inspectRequiredFile(path: string): RequiredFileState {
  if (!existsSync(path)) return "missing";
  try {
    if (lstatSync(path).isSymbolicLink()) return "not_file";
    const stat = statSync(path);
    if (!stat.isFile()) return "not_file";
    if (stat.size <= 0) return "empty";
    return "ok";
  } catch {
    return "missing";
  }
}

export function readSmokeText(path: string): string {
  if (inspectRequiredFile(path) !== "ok") return "";
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}
