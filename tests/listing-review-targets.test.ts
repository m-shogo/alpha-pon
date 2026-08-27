import assert from "node:assert/strict";
import { listingReviewRowIsCurrent, listingReviewTargetsDueBy } from "../src/listing-review-targets.js";

const event = {
  id: "listing-8136",
  code: "8136",
  name: "sample",
  eventType: "listing_day",
  eventDate: "2026-08-01",
};

assert.deepEqual(listingReviewTargetsDueBy([event], "2026-08-27"), []);
assert.deepEqual(
  listingReviewTargetsDueBy([event], "2026-08-31").map(target => [target.horizon, target.reviewDate]),
  [["30d", "2026-08-31"]],
);
assert.deepEqual(
  listingReviewTargetsDueBy([event], "2026-10-30").map(target => [target.horizon, target.reviewDate]),
  [["30d", "2026-08-31"], ["90d", "2026-10-30"]],
);
assert.throws(() => listingReviewTargetsDueBy([event], "2026-02-31"), /real YYYY-MM-DD/);
assert.deepEqual(
  listingReviewTargetsDueBy([{ ...event, eventDate: "2026-02-31" }], "2026-10-30"),
  [],
);

assert.equal(listingReviewRowIsCurrent("2026-08-31", "2026-08-27"), false);
assert.equal(listingReviewRowIsCurrent("2026-08-31", "2026-08-31"), true);
assert.equal(listingReviewRowIsCurrent("2026-08-31", "2026-09-01"), true);
assert.equal(listingReviewRowIsCurrent(null, "2026-08-27"), true);
assert.throws(() => listingReviewRowIsCurrent("2026-08-31", "2026-02-31"), /real YYYY-MM-DD/);

console.log("listing review targets tests passed");
