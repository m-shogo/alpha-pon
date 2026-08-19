import { existsSync, readFileSync, statSync } from "fs";

export type SourceHealthReportFileState = {
  exists: boolean;
  size: number;
};

export function inspectSourceHealthReportFile(path: string): SourceHealthReportFileState {
  if (!existsSync(path)) return { exists: false, size: 0 };

  try {
    if (!statSync(path).isFile()) return { exists: false, size: 0 };
    return { exists: true, size: readFileSync(path, "utf-8").length };
  } catch {
    return { exists: false, size: 0 };
  }
}
