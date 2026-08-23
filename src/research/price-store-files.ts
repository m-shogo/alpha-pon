import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function listPriceJsonlFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`price_store_symlink_not_allowed: ${path}`);
    }
    if (stat.isDirectory()) files.push(...listPriceJsonlFiles(path));
    else if (stat.isFile() && path.endsWith(".jsonl")) files.push(path);
  }
  return files.sort();
}
