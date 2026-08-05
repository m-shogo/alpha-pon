import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  parsePriceJsonl,
  type PitPriceRecord,
} from "../price-store.js";
import {
  validateHardenedPriceRecords,
  type HardenedPriceIssue,
} from "../price-store-hardening.js";
import type { JsonSchema } from "../schema.js";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function listJsonl(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...listJsonl(path));
    else if (stat.isFile() && path.endsWith(".jsonl")) files.push(path);
  }
  return files.sort();
}

const root = argValue("root") ?? "research/prices";
const schemaPath = argValue("schema") ?? "research/schemas/price-record.schema.json";
const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as JsonSchema;
const files = listJsonl(root);
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
