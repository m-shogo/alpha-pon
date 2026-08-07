import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  JQUANTS_FREE_ENTITLEMENT,
  JQuantsFreePriceProvider,
  isJQuantsFreeConfigured,
  jquantsFreeCapabilities,
} from "../providers/jquants-free.js";
import { jquantsFreeRecordOutput } from "../providers/jquants-free-output.js";
import {
  appendPriceRecords,
  validateProviderBatch,
  withPriceRecordHash,
} from "../price-store.js";
import type { JsonSchema } from "../schema.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function requiredArg(name: string): string {
  const value = argValue(name)?.trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function dateArg(name: string): string {
  const value = requiredArg(name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00+09:00`))) {
    throw new Error(`--${name} must be YYYY-MM-DD`);
  }
  return value;
}

function timestampArg(name: string): string {
  const value = requiredArg(name);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`--${name} must be an ISO-8601 timestamp`);
  return value;
}

function normalizedCode(code: string): string {
  const safe = code.trim().toUpperCase().replace(/\.T$/, "");
  if (!/^[0-9A-Z]{4,5}$/.test(safe)) throw new Error("--code must be a 4-5 character security code");
  return safe;
}

function priceRelativePath(code: string): string {
  return `research/prices/jquants-free/${normalizedCode(code)}.jsonl`;
}

function schema(): JsonSchema {
  const path = resolve(process.cwd(), "research/schemas/price-record.schema.json");
  if (!existsSync(path)) throw new Error(`price schema not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as JsonSchema;
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const executeFetch = hasFlag("execute-fetch");
  const appendLocal = hasFlag("append-local");
  const showValuesLocal = hasFlag("show-values-local");
  const capabilities = jquantsFreeCapabilities();

  if (!executeFetch) {
    print({
      status: "dry_run_no_network",
      networkUsed: false,
      appendRequested: appendLocal,
      appendPerformed: false,
      rawValuesIncluded: false,
      configured: isJQuantsFreeConfigured(),
      entitlement: JQUANTS_FREE_ENTITLEMENT,
      capabilities,
      nextAction: "Pass --execute-fetch with --code, --from, --to, and --first-executable-at to fetch one security locally.",
    });
    return;
  }

  if (!isJQuantsFreeConfigured()) {
    print({
      status: "credentials_missing_nonfatal",
      networkUsed: false,
      appendRequested: appendLocal,
      appendPerformed: false,
      rawValuesIncluded: false,
      configured: false,
      entitlement: JQUANTS_FREE_ENTITLEMENT,
      capabilities,
    });
    return;
  }

  const code = requiredArg("code");
  const from = dateArg("from");
  const to = dateArg("to");
  if (from > to) throw new Error("--from must be on or before --to");
  const firstExecutableAt = timestampArg("first-executable-at");
  const now = new Date();
  const provider = new JQuantsFreePriceProvider({
    now: () => now,
    resolveFirstExecutableAt: ({ observedAt }) => {
      if (Date.parse(firstExecutableAt) < Date.parse(observedAt)) {
        throw new Error("--first-executable-at must be at or after every record observedAt");
      }
      return firstExecutableAt;
    },
  });

  const batch = await provider.fetchDaily({
    seriesKind: "security",
    codes: [code],
    from,
    to,
    asOf: now.toISOString(),
    plan: "free",
  });
  const batchIssues = validateProviderBatch(batch);
  if (batchIssues.length > 0) {
    throw new Error(`J-Quants provider batch invalid:\n${batchIssues.join("\n")}`);
  }

  const records = batch.records.map(withPriceRecordHash);
  let outputPath: string | null = null;
  if (appendLocal && records.length > 0) {
    outputPath = priceRelativePath(code);
    appendPriceRecords(resolve(process.cwd(), outputPath), records, schema(), now);
  }

  print({
    status: records.length > 0 ? "mapped" : "no_rows_returned",
    networkUsed: true,
    appendRequested: appendLocal,
    appendPerformed: Boolean(outputPath),
    outputPath,
    rawValuesIncluded: showValuesLocal,
    entitlement: JQUANTS_FREE_ENTITLEMENT,
    capabilities: batch.capabilities,
    providerId: batch.providerId,
    sourceVersion: batch.sourceVersion,
    license: batch.license,
    retrievedAt: batch.retrievedAt,
    records: records.map((record) => jquantsFreeRecordOutput(record, showValuesLocal)),
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
