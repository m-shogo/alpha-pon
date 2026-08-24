import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../scripts/run-catchup.ts", import.meta.url), "utf-8");
assert.match(source, /let todayCovered = hasSucceeded\(job\.name, TODAY\)/);
assert.match(source, /todayCovered = res\.success/);
assert.match(source, /if \(!todayCovered\) \{[\s\S]*\[defer\][\s\S]*continue;/);
assert.doesNotMatch(
  source,
  /for \(const date of pastDates\)[\s\S]*if \(job\.canBackfill\)[\s\S]*markSkipped\(job\.name, date\);[\s\S]*else \{/,
  "today run failureを無視して無条件にpast dateをskipped化しない",
);

console.log("catchup-failure-defer.test.ts passed");
