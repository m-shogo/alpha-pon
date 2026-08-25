import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dateOnly, daysBetweenJst } from "../apps/web/lib/format.js";

function homeGeneratedDateState(value: string | null, today: string) {
  const generatedDate = dateOnly(value);
  const generatedAgeDays = generatedDate ? daysBetweenJst(generatedDate, today) : null;
  const valid = value === generatedDate && generatedAgeDays != null && generatedAgeDays >= 0;
  return { generatedDate, generatedAgeDays, valid };
}

assert.deepEqual(
  homeGeneratedDateState("2026-08-24", "2026-08-25"),
  { generatedDate: "2026-08-24", generatedAgeDays: 1, valid: true },
  "canonical past generated date must remain valid",
);
assert.equal(
  homeGeneratedDateState("2026-08-24T12:00:00+09:00", "2026-08-25").valid,
  false,
  "timestamp-shaped generatedAt must not masquerade as the canonical daily generated date",
);
assert.equal(
  homeGeneratedDateState("2026-02-31", "2026-08-25").valid,
  false,
  "nonexistent generated date must fail closed",
);
assert.equal(
  homeGeneratedDateState("2026-08-26", "2026-08-25").valid,
  false,
  "future generated date must not be treated as fresh Home evidence",
);

const homeSource = readFileSync("apps/web/app/page.tsx", "utf-8");
assert.match(
  homeSource,
  /data\.generatedAt === generatedDate && generatedAgeDays != null && generatedAgeDays >= 0/,
  "Home must bind displayed/staleness provenance to a canonical non-future generated date",
);
assert.match(
  homeSource,
  /hasValidGeneratedDate \? data\.generatedAt : '未生成'/,
  "Home must not display malformed/future generatedAt as a successful generation timestamp",
);
assert.match(
  homeSource,
  /生成日が不正または未来日です/,
  "Home must surface malformed/future generatedAt as a read-only warning",
);

console.log("web-home-generated-date.test.ts passed");
