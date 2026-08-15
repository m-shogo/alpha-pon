import assert from "node:assert/strict";
import { isValidAnalogyReviewDueDate } from "../src/analogy-review-date.js";

assert.equal(isValidAnalogyReviewDueDate("2026-08-15"), true);
assert.equal(isValidAnalogyReviewDueDate("2024-02-29"), true);
assert.equal(isValidAnalogyReviewDueDate("2026-02-31"), false);
assert.equal(isValidAnalogyReviewDueDate("0000-01-01"), false);
assert.equal(isValidAnalogyReviewDueDate("2026-08-15T00:00:00+09:00"), false);
assert.equal(isValidAnalogyReviewDueDate(undefined), false);

console.log("analogy review due-date validation: OK");
