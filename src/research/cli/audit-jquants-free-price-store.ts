import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditJQuantsFreePriceStore } from "../jquants-free-price-store-audit.js";
import type { JsonSchema } from "../schema.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function priceSchema(): JsonSchema {
  const path = resolve(process.cwd(), "research/schemas/price-record.schema.json");
  if (!existsSync(path)) throw new Error("canonical price schema is missing");
  return JSON.parse(readFileSync(path, "utf-8")) as JsonSchema;
}

function main(): void {
  const root = resolve(
    process.cwd(),
    argValue("root")?.trim() || "research/prices/jquants-free",
  );
  const report = auditJQuantsFreePriceStore({
    root,
    schema: priceSchema(),
    now: new Date(),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "issues_found") process.exitCode = 1;
}

try {
  main();
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exitCode = 1;
}
