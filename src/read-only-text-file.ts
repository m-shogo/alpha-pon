import { lstatSync, readFileSync } from "fs";

/**
 * Read canonical read-only text evidence without following aliases.
 * Missing, linked, non-regular, unreadable, or empty files fail closed.
 */
export function readReadOnlyTextFile(path: string): string {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return "";
    const text = readFileSync(path, "utf-8");
    return text.trim().length > 0 ? text : "";
  } catch {
    return "";
  }
}
