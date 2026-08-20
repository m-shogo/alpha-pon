import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readReadOnlyJsonObjectArrayFile } from "../src/read-only-json-file.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-read-only-row-isolation-"));
try {
  const path = join(dir, "committee.json");
  writeFileSync(
    path,
    JSON.stringify({ decisions: [{ code: "8136", finalLabel: "watch" }, null, "broken", { code: "7203", finalLabel: "watch" }] }),
    "utf-8",
  );

  const loaded = readReadOnlyJsonObjectArrayFile<Record<string, unknown>>(path, "decisions", isRecord);
  assert(loaded.rows.length === 2, "malformed object-array rows must be isolated without dropping valid rows");
  assert(loaded.invalidRows === 2, "isolated malformed row count must remain observable as metadata");
  assert(loaded.rows[0]?.code === "8136" && loaded.rows[1]?.code === "7203", "valid row order must remain stable");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("read-only JSON row isolation tests passed");
