import { existsSync, lstatSync, readFileSync } from "fs";

export type RequiredFileState = "ok" | "missing" | "not_file" | "empty";

export function inspectRequiredFile(path: string): RequiredFileState {
  if (!existsSync(path)) return "missing";
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) return "not_file";
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
