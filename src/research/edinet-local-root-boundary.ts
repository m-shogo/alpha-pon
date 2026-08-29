import { existsSync, lstatSync } from "node:fs";
import { resolve } from "node:path";

export function resolveCanonicalEdinetRoot(cwd = process.cwd()): string {
  const dataRoot = resolve(cwd, "data");
  if (existsSync(dataRoot) && lstatSync(dataRoot).isSymbolicLink()) {
    throw new Error("data/edinet parent data directory must not be a symlink");
  }
  return resolve(dataRoot, "edinet");
}
