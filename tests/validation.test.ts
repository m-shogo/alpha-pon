import assert from "node:assert/strict";
import "./edinet-fetcher.test.js";
import "./edinet-document-lineage.test.js";
import "./edinet-sanrio-pilot.test.js";
import "./edinet-sanrio-acquisition.test.js";
import "./edinet-sanrio-review-workspace.test.js";
import "./edinet-sanrio-revision-diff-workspace.test.js";
import "./edinet-sanrio-logical-entry-alignment.test.js";
import "./edinet-sanrio-cross-period-triage.test.js";
import { validateWatchlist } from "../src/validation.js";
import type { WatchlistConfig } from "../src/types.js";

function testValidWatchlist() {
  const config: WatchlistConfig = {
    symbols: [
      {
        code: "285A",
        name: "キオクシア",
        market: "TSE",
        status: "research",
        priority: "S",
        tags: ["semiconductor"],
        rules: ["ipo_selling_pressure_done"],
        listedAt: "2024-12-18",
      },
    ],
  };

  assert.deepEqual(validateWatchlist(config), []);
}

function testInvalidWatchlist() {
  const config = {
    symbols: [
      {
        code: "285A",
        name: "キオクシア",
        market: "TSE",
        status: "research",
        priority: "S",
        tags: [],
        rules: [],
        listedAt: "20241218",
      },
      {
        code: "285A",
        name: "重複銘柄",
        market: "TSE",
        status: "watch",
        priority: "A",
        tags: ["ipo"],
        rules: ["healthy_pullback"],
      },
    ],
  } as WatchlistConfig;

  const errors = validateWatchlist(config);
  assert.ok(errors.some(e => e.includes("tags が空です")));
  assert.ok(errors.some(e => e.includes("rules が空です")));
  assert.ok(errors.some(e => e.includes("listedAt は YYYY-MM-DD")));
  assert.ok(errors.some(e => e.includes("銘柄コード重複")));
}

function main() {
  testValidWatchlist();
  testInvalidWatchlist();
  console.log("validation.test.ts passed");
}

main();
