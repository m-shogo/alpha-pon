import assert from "node:assert/strict";
import { isUsableProKnowledgeRegimeAsOf } from "../src/pro-knowledge-refresh-input.js";

const today = "2026-08-21";
assert.equal(isUsableProKnowledgeRegimeAsOf(today, today), true);
assert.equal(isUsableProKnowledgeRegimeAsOf("2026-08-20", today), true);
assert.equal(isUsableProKnowledgeRegimeAsOf("2026-08-22", today), false);
assert.equal(isUsableProKnowledgeRegimeAsOf("2026-02-31", today), false);
assert.equal(isUsableProKnowledgeRegimeAsOf("0000-01-01", today), false);
assert.equal(isUsableProKnowledgeRegimeAsOf("2026-08-21T00:00:00+09:00", today), false);
assert.equal(isUsableProKnowledgeRegimeAsOf(undefined, today), false);

console.log("pro-knowledge-refresh-input.test.ts passed");
