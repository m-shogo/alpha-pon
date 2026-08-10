import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertIsoCalendarDate } from "../../src/research/jquants-free-cli-boundary.js";

{
  assert.equal(assertIsoCalendarDate("2024-02-29", "--from"), "2024-02-29");
  assert.equal(assertIsoCalendarDate("2026-08-11", "--to"), "2026-08-11");
  assert.throws(
    () => assertIsoCalendarDate("2026-02-29", "--from"),
    /valid YYYY-MM-DD Gregorian date/,
  );
  assert.throws(
    () => assertIsoCalendarDate("2026-04-31", "--to"),
    /valid YYYY-MM-DD Gregorian date/,
  );
  assert.throws(
    () => assertIsoCalendarDate("2026-8-11", "--from"),
    /valid YYYY-MM-DD Gregorian date/,
  );
  console.log("jquants-free-cli-date-boundary: impossible and non-canonical dates fail closed OK");
}

{
  const source = readFileSync("src/research/cli/fetch-jquants-free-price.ts", "utf-8");
  assert.match(
    source,
    /return assertIsoCalendarDate\(requiredArg\(name\), `--\$\{name\}`\);/,
    "CLI dateArg must route through the strict Gregorian date boundary",
  );
  assert.equal(
    source.includes("Date.parse(`${value}T00:00:00+09:00`)"),
    false,
    "CLI must not rely on Date.parse normalization for calendar-date validation",
  );
  console.log("jquants-free-cli-date-boundary: CLI wiring uses strict date validation OK");
}

console.log("jquants-free-cli-date-boundary.test.ts passed");
