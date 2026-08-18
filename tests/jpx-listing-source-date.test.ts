import assert from "node:assert/strict";
import { normalizeJpxListingSourceDate } from "../src/jpx-listing-source-date.js";

assert.equal(normalizeJpxListingSourceDate("2026-08-18"), "2026-08-18");
assert.equal(normalizeJpxListingSourceDate("2024年2月29日"), "2024-02-29");
assert.equal(normalizeJpxListingSourceDate("2026/2/3"), "2026-02-03");
assert.equal(normalizeJpxListingSourceDate("2026-02-31"), null);
assert.equal(normalizeJpxListingSourceDate("2025年2月29日"), null);
assert.equal(normalizeJpxListingSourceDate("not-a-date"), null);

console.log("jpx-listing-source-date: OK");
