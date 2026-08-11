import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { addDaysJst } from "../src/date.js";

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

assert.equal(
  addDaysJst("2026-01-01", 75),
  "2026-03-17",
  "JST date-only calendar addition must not shift one day through UTC serialization",
);
assert.equal(
  addDaysJst("2026-07-01", 180),
  "2026-12-28",
  "lockup day offsets must remain exact JST calendar dates",
);
assert.equal(addDaysJst("2024-02-28", 1), "2024-02-29", "leap-day calendar addition must be exact");
assert.throws(() => addDaysJst("2026-02-29", 1), /real YYYY-MM-DD/);

const data = readJson("reports/ipo_theme_watch_latest.json");
assert(data !== null, "reports/ipo_theme_watch_latest.json は必ず生成・保持される必要があります");
assert(isObject(data), "ipo_theme_watch_latest.json は object である必要があります");

assert(Array.isArray(data.rules), "rules は配列である必要があります");
assert(data.rules.length > 0, "rules は1件以上必要です");
assert(Array.isArray(data.phases), "phases は配列である必要があります");
assert(data.phases.length > 0, "phases は1件以上必要です");
assert(Array.isArray(data.outcomeStats), "outcomeStats は配列である必要があります");
assert(Array.isArray(data.worldEventHighlights), "worldEventHighlights は配列である必要があります");

// outcomeStats の各行に必須フィールドが揃っているか確認
for (const row of data.outcomeStats as Array<Record<string, unknown>>) {
  assert("finalLabel" in row, "outcomeStats 各行に finalLabel が必要です");
  assert("originalFinalLabel" in row, "outcomeStats 各行に originalFinalLabel が必要です");
  assert("phaseFromPriceSignal" in row, "outcomeStats 各行に phaseFromPriceSignal が必要です");
  assert(typeof row["sampleTooSmall"] === "boolean", "sampleTooSmall は boolean である必要があります");
}

// worldEventHighlights の各行に必須フィールドが揃っているか確認
for (const ev of data.worldEventHighlights as Array<Record<string, unknown>>) {
  assert(typeof ev["title"] === "string", "worldEventHighlights.title は string である必要があります");
  assert(Array.isArray(ev["relatedThemeIds"]), "worldEventHighlights.relatedThemeIds は配列である必要があります");
}

const text = JSON.stringify(data);
for (const keyword of ["SpaceX", "Starlink", "OpenAI", "Anthropic", "キオクシア", "NAND", "SSD", "eSSD"]) {
  assert(text.includes(keyword), `${keyword} が IPOテーマ監視に含まれる必要があります`);
}
for (const phase of ["pre_ipo", "ipo_week", "first_earnings", "lockup_expiry", "post_hype_drawdown", "fundamental_confirmation"]) {
  assert(text.includes(phase), `${phase} が IPOテーマ監視フェーズに含まれる必要があります`);
}
for (const forbidden of ["買うべき", "売るべき", "必ず上がる", "確実に上がる", "推奨銘柄"]) {
  assert(!text.includes(forbidden), `禁止寄り文言 ${forbidden} を含めない`);
}

console.log("ipo-theme-watch.test.ts passed");
