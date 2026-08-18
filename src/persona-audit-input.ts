import { existsSync, statSync } from "fs";

export function isUsablePersonaAuditReport(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const stat = statSync(path);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}
