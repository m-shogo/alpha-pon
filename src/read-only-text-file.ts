import { lstatSync, readFileSync } from "fs";
import { dirname, resolve, sep } from "path";

function hasSymlinkedAncestorWithinCwd(path: string): boolean {
  const root = resolve(process.cwd());
  let current = dirname(resolve(path));
  if (current !== root && !current.startsWith(`${root}${sep}`)) return false;

  while (current !== root) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
  return false;
}

/**
 * Read canonical read-only text evidence without following aliases.
 * Missing, linked, non-regular, unreadable, or empty files fail closed.
 */
export function readReadOnlyTextFile(path: string): string {
  try {
    if (hasSymlinkedAncestorWithinCwd(path)) return "";
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return "";
    const text = readFileSync(path, "utf-8");
    return text.trim().length > 0 ? text : "";
  } catch {
    return "";
  }
}
