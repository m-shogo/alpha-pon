import { lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function assertStandaloneRegularFile(path: string): void {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      throw new Error(`source health history must be a standalone regular file: ${path}`);
    }
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }
}

export function readSourceHealthHistoryLines(path: string): string[] {
  assertStandaloneRegularFile(path);
  try {
    return readFileSync(path, "utf-8")
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

export function replaceSourceHealthHistory(path: string, content: string): void {
  assertStandaloneRegularFile(path);
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tempPath, content, { encoding: "utf-8", flag: "wx" });
    renameSync(tempPath, path);
  } finally {
    rmSync(tempPath, { force: true });
  }
}
