import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { addDaysJst, todayJst } from "../src/date.js";
import { normalizeRegimeHistoryActiveRegimes, resolveRegimeHistoryAsOf } from "../src/regime-history-input.js";

assert.equal(resolveRegimeHistoryAsOf(undefined, "2026-08-20"), "2026-08-20", "missing asOf remains backward-compatible with the current history date");
assert.equal(resolveRegimeHistoryAsOf("2026-06-03", "2026-08-20"), "2026-06-03", "historical current-regime provenance remains valid");
assert.equal(resolveRegimeHistoryAsOf("2026-08-20", "2026-08-20"), "2026-08-20", "same-day regime provenance remains valid");

for (const invalid of ["2026-02-31", "0000-01-01", "2026-8-20", "2026-08-20T00:00:00+09:00"] as const) {
  assert.throws(
    () => resolveRegimeHistoryAsOf(invalid, "2026-08-20"),
    /current regime asOf must be/,
    `invalid regime provenance must fail closed: ${invalid}`,
  );
}

assert.throws(
  () => resolveRegimeHistoryAsOf("2026-08-21", "2026-08-20"),
  /must not be after the history date/,
  "future regime provenance must not enter a current read-only history snapshot",
);

assert.deepEqual(
  normalizeRegimeHistoryActiveRegimes([
    {
      id: "risk-off",
      level: "high",
      why: "macro stress",
      watchCategories: ["rates"],
      caution: ["liquidity"],
    },
  ]),
  [
    {
      id: "risk-off",
      level: "high",
      why: "macro stress",
      watchCategories: ["rates"],
      caution: ["liquidity"],
    },
  ],
  "canonical active-regime rows must remain available",
);
assert.deepEqual(normalizeRegimeHistoryActiveRegimes(undefined), [], "missing active regimes remain backward-compatible");

for (const invalid of [
  "broken",
  [null],
  [{ id: "risk-off", level: "high", why: "macro stress", watchCategories: "rates" }],
  [{ id: "", level: "high", why: "macro stress" }],
] as const) {
  assert.throws(
    () => normalizeRegimeHistoryActiveRegimes(invalid),
    /current regime activeRegimes/,
    "malformed active-regime provenance must fail closed before history append",
  );
}

const root = mkdtempSync(join(tmpdir(), "alpha-pon-regime-history-"));
const tsxImport = import.meta.resolve("tsx/esm");
try {
  mkdirSync(join(root, "data"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(
    join(root, "config/current-regime.yml"),
    [
      "mode: risk-off",
      "summary: current test regime",
      "activeRegimes:",
      "  - id: risk-off",
      "    level: high",
      "    why: macro stress",
      "",
    ].join("\n"),
    "utf8",
  );

  const today = todayJst();
  const yesterday = addDaysJst(today, -1);
  writeFileSync(
    join(root, "data/regime_history.jsonl"),
    [
      JSON.stringify({ date: yesterday, asOf: yesterday, mode: "old-a", summary: "old a", activeRegimes: [{ id: "old-a" }] }),
      JSON.stringify({ date: today, asOf: today, mode: "old-today", summary: "old today", activeRegimes: [{ id: "old-today" }] }),
      "{malformed historical row",
      JSON.stringify({ date: yesterday, asOf: yesterday, mode: "old-b", summary: "old b", activeRegimes: [{ id: "old-b" }] }),
      "",
    ].join("\n"),
    "utf8",
  );

  const source = resolve("src/regime-history.ts");
  execFileSync(process.execPath, ["--import", tsxImport, source], { cwd: root, stdio: "pipe" });
  execFileSync(process.execPath, ["--import", tsxImport, source], { cwd: root, stdio: "pipe" });

  const lines = readFileSync(join(root, "data/regime_history.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean);
  const validRows = lines.flatMap(line => {
    try {
      return [JSON.parse(line) as { date?: string; mode?: string }];
    } catch {
      return [];
    }
  });

  assert.equal(
    validRows.filter(row => row.date === today).length,
    1,
    "same-day reruns must keep one regime-history row so current regime is not overweighted",
  );
  assert.equal(
    validRows.filter(row => row.date === yesterday).length,
    1,
    "existing duplicate regime dates must collapse so historical regime counts stay day-weighted",
  );
  assert.equal(
    validRows.find(row => row.date === yesterday)?.mode,
    "old-b",
    "latest row for a duplicated historical date must remain authoritative",
  );
  assert.ok(
    lines.includes("{malformed historical row"),
    "daily upsert must preserve malformed history for downstream read-only audit visibility",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("regime history input: invalid or future provenance and duplicate daily history fail closed OK");
