import { lstatSync, readFileSync } from "node:fs";
import {
  parsePriceJsonl,
  type PitPriceRecord,
} from "../price-store.js";
import {
  validateHardenedPriceRecords,
  type HardenedPriceIssue,
} from "../price-store-hardening.js";
import { listPriceJsonlFiles } from "../price-store-files.js";
import type { JsonSchema } from "../schema.js";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readPriceSchema(path: string): JsonSchema {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(`price_store_schema_must_be_standalone_regular_file: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf-8")) as JsonSchema;
}

const root = argValue("root") ?? "research/prices";
const schemaPath = argValue("schema") ?? "research/schemas/price-record.schema.json";
const schema = readPriceSchema(schemaPath);
const files = listPriceJsonlFiles(root);
const records: PitPriceRecord[] = [];
const parseIssues: HardenedPriceIssue[] = [];

for (const file of files) {
  try {
    records.push(...parsePriceJsonl(readFileSync(file, "utf-8"), file));
  } catch (error) {
    parseIssues.push({
      severity: "error",
      code: "schema",
      target: file,
      message: (error as Error).message,
    });
  }
}

const issues = [...parseIssues, ...validateHardenedPriceRecords(records, schema)];
for (const issue of issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = issues.filter((issue) => issue.severity === "error");
console.log(`PIT price store: files=${files.length} records=${records.length} errors=${errors.length} warnings=${issues.length - errors.length}`);
if (errors.length > 0) process.exitCode = 1;
