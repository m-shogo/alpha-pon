import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readListingCsvRows } from "../src/listing-csv-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-listing-csv-input-"));
const emptyPath = join(dir, "empty.csv");
const headerOnlyPath = join(dir, "header-only.csv");
const rowsPath = join(dir, "rows.csv");
const quotedPath = join(dir, "quoted.csv");
const malformedPath = join(dir, "malformed.csv");

try {
  writeFileSync(emptyPath, "\n\n");
  writeFileSync(headerOnlyPath, "code,reviewPrice\n");
  writeFileSync(rowsPath, "code,reviewPrice\n1234,1500\n5678,\n");
  writeFileSync(quotedPath, 'code,note,source\n1234,"value, with comma","official ""primary"""\n');
  writeFileSync(malformedPath, 'code,note\n1234,"unterminated\n');

  assert.deepEqual(readListingCsvRows(emptyPath), [], "empty existing CSV files must not crash the read-only listing pipeline");
  assert.deepEqual(readListingCsvRows(headerOnlyPath), [], "header-only CSV files must be treated as zero rows");
  assert.deepEqual(readListingCsvRows(rowsPath), [
    { code: "1234", reviewPrice: "1500" },
    { code: "5678", reviewPrice: "" },
  ]);
  assert.deepEqual(readListingCsvRows(quotedPath), [
    { code: "1234", note: "value, with comma", source: 'official "primary"' },
  ], "quoted commas and escaped quotes must remain inside the same evidence field");
  assert.throws(
    () => readListingCsvRows(malformedPath),
    /unterminated quoted field/,
    "malformed quoted CSV must fail closed instead of shifting provenance columns",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("listing-csv-input: OK");
