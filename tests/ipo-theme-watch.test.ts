import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const data = readJson("reports/ipo_theme_watch_latest.json");
assert(data === null || isObject(data), "ipo_theme_watch_latest.json は object である必要があります");

if (isObject(data)) {
  assert(Array.isArray(data.rules), "rules は配列である必要があります");
  assert(Array.isArray(data.phases), "phases は配列である必要があります");
  assert(Array.isArray(data.outcomeStats), "outcomeStats は配列である必要があります");

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
}

console.log("ipo-theme-watch.test.ts passed");
