import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addDaysJst } from "../src/date.js";
import { readIpoThemeOutcomeInput, readIpoThemeWorldEventInput } from "../src/ipo-theme-watch-input.js";
import { readWorldThemeCandidateReviewInput } from "../src/world-theme-candidate-review-input.js";
import { readWorldThemeCandidateStatsInput } from "../src/world-theme-candidate-stats-input.js";

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

const tmp = mkdtempSync(join(tmpdir(), "ipo-theme-input-"));
try {
  const outcomePath = join(tmp, "hypothesis_outcomes.jsonl");
  const validOutcome = (code: string) => JSON.stringify({
    code,
    name: `Company ${code}`,
    hypothesis: {
      reason: "IPO theme",
      relatedWorldEventIds: [],
      evidenceNeeded: [],
      invalidationSignals: [],
    },
    actionLabel: "watch",
    result: "hit",
    return1w: null,
    return1m: null,
    relativeToTopix1m: null,
    maxDrawdownPct: null,
  });
  writeFileSync(
    outcomePath,
    `${validOutcome("8136")}\n{broken\n{}\n{"code":"9999"}\n${validOutcome("5803")}\n`,
    "utf-8",
  );
  const outcomeInput = readIpoThemeOutcomeInput(outcomePath);
  assert.deepEqual(outcomeInput.rows.map(row => row.code), ["8136", "5803"]);
  assert(outcomeInput.warning?.includes("lines 2"), "malformed outcome rows must surface line-number metadata without stopping valid rows");
  assert(outcomeInput.warning?.includes("invalid_rows 2"), "valid JSON rows with unsafe outcome shape must be isolated without stopping valid rows");
  assert(!outcomeInput.warning?.includes("{broken"), "parse warnings must not echo raw malformed JSONL content");

  const worldThemeReviewPath = join(tmp, "world_theme_candidate_hypotheses.jsonl");
  const validWorldThemeHypothesis = JSON.stringify({
    hypothesisId: "world-theme-1",
    detectedAt: "2026-08-01",
    sourceEventTitle: "Space launch",
    theme: "space",
    candidateCode: "8136",
    candidateCompany: "Company 8136",
    nextPrimaryCheck: "official IR",
    reviewDueDates: [
      { afterDays: 30, dueAt: "2026-08-31", status: "open" },
      { afterDays: 90, dueAt: "2026-10-30", status: "reviewed" },
    ],
  });
  writeFileSync(
    worldThemeReviewPath,
    `${validWorldThemeHypothesis}\n{broken\n{}\n{"hypothesisId":"missing-review-dates"}\n`,
    "utf-8",
  );
  const worldThemeReviewInput = readWorldThemeCandidateReviewInput(worldThemeReviewPath);
  assert.deepEqual(worldThemeReviewInput.rows.map(row => row.hypothesisId), ["world-theme-1"]);
  assert(worldThemeReviewInput.warning?.includes("lines 2"), "malformed world-theme rows must surface line-number metadata without stopping valid rows");
  assert(worldThemeReviewInput.warning?.includes("invalid_rows 2"), "JSON-valid unsafe world-theme rows must be isolated without stopping valid rows");
  assert(!worldThemeReviewInput.warning?.includes("{broken"), "world-theme warnings must not echo raw malformed JSONL content");

  const worldThemeStatsPath = join(tmp, "world_theme_candidate_review_results.jsonl");
  const validWorldThemeResult = JSON.stringify({
    theme: "space",
    result: "hit",
    candidateCode: "8136",
    candidateCompany: "Company 8136",
    reviewedAt: "2026-08-16",
    afterDays: 30,
    memo: "reviewed",
  });
  writeFileSync(
    worldThemeStatsPath,
    `${validWorldThemeResult}\n{broken\n{}\n{"theme":"space"}\n`,
    "utf-8",
  );
  const worldThemeStatsInput = readWorldThemeCandidateStatsInput(worldThemeStatsPath);
  assert.deepEqual(worldThemeStatsInput.rows.map(row => row.candidateCode), ["8136"]);
  assert(worldThemeStatsInput.warning?.includes("lines 2"), "malformed stats rows must surface line-number metadata without stopping valid rows");
  assert(worldThemeStatsInput.warning?.includes("invalid_rows 2"), "JSON-valid unsafe stats rows must be isolated without stopping valid rows");
  assert(!worldThemeStatsInput.warning?.includes("{broken"), "stats warnings must not echo raw malformed JSONL content");

  const worldEventsPath = join(tmp, "world_events_latest.json");
  assert.deepEqual(readIpoThemeWorldEventInput(worldEventsPath), { rows: [], warning: null }, "missing world-event snapshots remain a valid empty input");

  writeFileSync(worldEventsPath, "{broken", "utf-8");
  const parseError = readIpoThemeWorldEventInput(worldEventsPath);
  assert.deepEqual(parseError.rows, []);
  assert.equal(parseError.warning, `${worldEventsPath}: parse_error`);
  assert(!parseError.warning.includes("{broken"), "world-event parse warnings must not echo raw payloads");

  writeFileSync(worldEventsPath, JSON.stringify({ title: "SpaceX" }), "utf-8");
  const invalidRoot = readIpoThemeWorldEventInput(worldEventsPath);
  assert.deepEqual(invalidRoot.rows, []);
  assert.equal(invalidRoot.warning, `${worldEventsPath}: invalid_root expected_array`);

  writeFileSync(worldEventsPath, JSON.stringify([
    { title: "SpaceX update", source: "official", publishedAt: "2026-08-16", snippet: "launch" },
    null,
    { title: 42 },
    { title: "OpenAI update", source: "official" },
  ]), "utf-8");
  const mixedRows = readIpoThemeWorldEventInput(worldEventsPath);
  assert.deepEqual(mixedRows.rows.map(row => row.title), ["SpaceX update", "OpenAI update"]);
  assert.equal(mixedRows.warning, `${worldEventsPath}: invalid_rows 2 (rows 2, 3)`);

  writeFileSync(worldEventsPath, JSON.stringify([
    { title: "valid leap day", publishedAt: "2024-02-29" },
    { title: "impossible date", publishedAt: "2026-02-31" },
    { title: "year zero", publishedAt: "0000-01-01" },
    { title: "RFC 822 remains supported", publishedAt: "Sun, 16 Aug 2026 12:00:00 GMT" },
  ]), "utf-8");
  const datedRows = readIpoThemeWorldEventInput(worldEventsPath);
  assert.deepEqual(datedRows.rows.map(row => row.title), ["valid leap day", "RFC 822 remains supported"]);
  assert.equal(datedRows.warning, `${worldEventsPath}: invalid_rows 2 (rows 2, 3)`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const data = readJson("reports/ipo_theme_watch_latest.json");
assert(data !== null, "reports/ipo_theme_watch_latest.json は必ず生成・保持される必要があります");
assert(isObject(data), "ipo_theme_watch_latest.json は object である必要があります");

assert(Array.isArray(data.rules), "rules は配列である必要があります");
assert(data.rules.length > 0, "rules は1件以上必要です");
assert(Array.isArray(data.phases), "phases は配列である必要があります");
assert(data.phases.length > 0, "phases は1件以上必要です");
assert(Array.isArray(data.outcomeStats), "outcomeStats は配列である必要があります");
assert(Array.isArray(data.worldEventHighlights), "worldEventHighlights は配列である必要があります");
assert(Array.isArray(data.inputWarnings), "inputWarnings は配列である必要があります");

for (const row of data.outcomeStats as Array<Record<string, unknown>>) {
  assert("finalLabel" in row, "outcomeStats 各行に finalLabel が必要です");
  assert("originalFinalLabel" in row, "outcomeStats 各行に originalFinalLabel が必要です");
  assert("phaseFromPriceSignal" in row, "outcomeStats 各行に phaseFromPriceSignal が必要です");
  assert(typeof row["sampleTooSmall"] === "boolean", "sampleTooSmall は boolean である必要があります");
}

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
