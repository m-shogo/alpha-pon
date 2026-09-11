/**
 * 価格保存庫の全件検査。
 *
 *   pnpm research:validate-prices                      # 既定の保存庫
 *   pnpm research:validate-prices -- --root=... --schema=...
 *
 * `auditPriceStore`（日次で走る軽い検査）とは見るものが違う。
 * こちらは schema・contentHash の妥当性と重複・時刻順序・PIT 境界・
 * OHLCV・権利落ち係数・改訂連鎖まで1行ずつ見る。
 *
 * ## いつ回すか
 *
 * 取り込み側（mapJQuantsFreeQuote / appendPrivatePriceRecords /
 * price-store-hardening）を触ったとき。実測（2026-09-11）で
 * 2,149,545 レコードに対し読み込み90秒＋検査111秒、heap 約4GB。
 * 日次に置くには重いので手で回す。
 *
 * ## 出力を集約する理由
 *
 * `missing_benchmark` は **全レコードに出る**（security record に
 * benchmarkCode を持たせていないため。event study はユニバース等加重指数を
 * 使う設計なので、この項目は使っていない）。1件1行で出すと 215万行になり、
 * 読めないので誰も回さなくなる。**回されない検査は無いのと同じ。**
 * (severity, code) で畳んで、代表例だけ見せる。
 */

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
const examplesPerCode = Number(argValue("examples") ?? "3");
if (!Number.isSafeInteger(examplesPerCode) || examplesPerCode < 0) {
  throw new Error(`--examples must be a non-negative integer: ${argValue("examples")}`);
}

const schema = readPriceSchema(schemaPath);
const files = listPriceJsonlFiles(root);
const records: PitPriceRecord[] = [];
const parseIssues: HardenedPriceIssue[] = [];

console.log(`ファイル ${files.length} 件（付帯台帳は除く）を読み込みます…`);
for (const file of files) {
  try {
    // 展開（push(...array)）は V8 の引数上限（実測で10万〜12.5万件）を
    // 超えると RangeError になる。1ファイルは数千行だが、増えても
    // 落ちないように最初から1件ずつ足す。
    for (const record of parsePriceJsonl(readFileSync(file, "utf-8"), file)) {
      records.push(record);
    }
  } catch (error) {
    parseIssues.push({
      severity: "error",
      code: "schema",
      target: file,
      message: (error as Error).message,
    });
  }
}
console.log(`レコード ${records.length.toLocaleString()} 件 / 解析失敗 ${parseIssues.length} 件`);

const issues = [...parseIssues, ...validateHardenedPriceRecords(records, schema)];

interface Aggregate {
  count: number;
  examples: string[];
}
const byKey = new Map<string, Aggregate>();
for (const issue of issues) {
  const key = `${issue.severity}\t${issue.code}`;
  const entry = byKey.get(key) ?? { count: 0, examples: [] };
  entry.count += 1;
  if (entry.examples.length < examplesPerCode) {
    entry.examples.push(`${issue.target} — ${issue.message}`);
  }
  byKey.set(key, entry);
}

const rows = [...byKey.entries()].sort((left, right) => right[1].count - left[1].count);
for (const [key, entry] of rows) {
  const [severity, code] = key.split("\t") as [string, string];
  console.log(`${severity.toUpperCase().padEnd(7)} ${code.padEnd(34)} ${entry.count.toLocaleString().padStart(12)}`);
  for (const example of entry.examples) console.log(`        例: ${example.slice(0, 160)}`);
}

const errors = issues.filter((issue) => issue.severity === "error");
console.log(
  `\nPIT price store: files=${files.length} records=${records.length.toLocaleString()}`
  + ` errors=${errors.length.toLocaleString()} warnings=${(issues.length - errors.length).toLocaleString()}`,
);
if (errors.length > 0) process.exitCode = 1;
