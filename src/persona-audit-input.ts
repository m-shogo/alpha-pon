import { existsSync, lstatSync } from "fs";

export function isUsablePersonaAuditReport(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const stat = lstatSync(path);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}
