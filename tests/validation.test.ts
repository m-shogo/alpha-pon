import assert from "node:assert/strict";
import "./edinet-fetcher.test.js";
import "./edinet-document-lineage.test.js";
import "./edinet-parent-doc-id-canonicality.test.js";
import "./edinet-issuer-boundary.test.js";
import "./edinet-configured-pilot.test.js";
import "./edinet-configured-pilot-generated-at-instant.test.js";
import "./edinet-configured-review-plan.test.js";
import "./edinet-configured-review-plan-instant.test.js";
import "./edinet-configured-acquisition.test.js";
import "./edinet-configured-review-workspace.test.js";
import "./edinet-configured-dashboard.test.js";
import "./edinet-configured-dashboard-generated-at-instant.test.js";
import "./edinet-configured-synthetic-fixture.test.js";
import "./edinet-configured-fidelity-plan.test.js";
import "./edinet-configured-fidelity-extraction.test.js";
import "./edinet-configured-structured-archive-generated-at-instant.test.js";
import "./edinet-configured-anchor-finalizer.test.js";
import "./edinet-configured-exact-comparison.test.js";
import "./edinet-configured-human-comparison-review.test.js";
import "./edinet-inventory-compatibility-audit.test.js";
import "./edinet-inventory-lineage-root-integrity.test.js";
import "./edinet-local-review-dashboard.test.js";
import "./edinet-foundation-mapping-template.test.js";
import "./edinet-sanrio-pilot.test.js";
import "./edinet-sanrio-pilot-generated-at-instant.test.js";
import "./edinet-sanrio-acquisition.test.js";
import "./edinet-sanrio-review-workspace.test.js";
import "./edinet-sanrio-revision-diff-workspace.test.js";
import "./edinet-sanrio-logical-entry-alignment.test.js";
import "./edinet-sanrio-cross-period-triage.test.js";
import "./edinet-sanrio-focused-review-bundle.test.js";
import "./edinet-sanrio-pdf-fidelity-review.test.js";
import "./edinet-sanrio-pdf-fidelity-instant.test.js";
import "./edinet-sanrio-unmatched-anchor-inspection.test.js";
import "./edinet-sanrio-human-review-decision.test.js";
import "./edinet-sanrio-configured-parity-workspace.test.js";
import "./edinet-sanrio-configured-parity-human-review.test.js";
import "./edinet-sanrio-foundation-readiness-audit.test.js";
import "./edinet-sanrio-foundation-readiness-parity-lineage.test.js";
import "./edinet-sanrio-foundation-readiness-parity-decision.test.js";
import "./edinet-sanrio-foundation-readiness-configured-decision.test.js";
import "./edinet-sanrio-foundation-readiness-configured-source-lineage.test.js";
import "./foundation-mapping-readiness-contract.test.js";
import "./foundation-readiness-remediation-plan.test.js";
import "./foundation-readiness-readonly-advisory.test.js";
import "./foundation-pilot-structural-status.test.js";
import "./foundation-pilot-structural-status-cli-preflight.test.js";
import "./foundation-pilot-hash-witness.test.js";
import "./foundation-pilot-hash-witness-conformance.test.js";
import "./foundation-pilot-human-replay-proof.test.js";
import "./edinet-sanrio-review-next-batching.test.js";
import "./edinet-sanrio-review-next-content-bundle.test.js";
import "./edinet-sanrio-impact-review-checklist.test.js";
import "./edinet-sanrio-parity-local-paths.test.js";
import "./edinet-sanrio-real-pilot-preflight.test.js";
import "./edinet-sanrio-real-pilot-preflight-configured-review-advisory.test.js";
import "./edinet-sanrio-configured-advisory-integrity.test.js";
import "./edinet-sanrio-real-pilot-fidelity-integrity.test.js";
import "./edinet-sanrio-real-pilot-integrity.test.js";
import "./edinet-sanrio-real-pilot-readiness-advisory.test.js";
import "./market-event-projection-instant-ordering.test.js";
import "./market-event-web-ordering.test.js";
import "./ops-dashboard-input-time.test.js";
import "./research/security-master.test.js";
import "./research/security-master-identifier-canonicality.test.js";
import "./research/security-master-resolver-namespace.test.js";
import "./research/security-master-repository.test.js";
import "./research/security-master-repository-pit-revision.test.js";
import "./research/security-master-snapshot-endpoint-integrity.test.js";
import "./research/backtest-exact-benchmark-alignment.test.js";
import "./research/jquants-free-provider.test.js";
import "./research/jquants-free-cli-retrieval-boundary.test.js";
import "./research/jquants-free-price-store-audit.test.js";
import "./research/jquants-free-store-conformance.test.js";
import "./research/private-price-store.test.js";
import "./research/price-store-revision-root.test.js";
import "./research/price-store-execution-after-retrieval.test.js";
import "./research/recommendation-persistence.test.js";
import "./research/recommendation-evidence-url-userinfo.test.js";
import "./research/recommendation-price-pit-timing.test.js";
import "./research/quantitative-outcome.test.js";
import "./research/quantitative-outcome-price-pit-timing.test.js";
import "./research/quantitative-outcome-reviewed-at-instant.test.js";
import "./research/corporate-action-clearance.test.js";
import "./research/outcome-semantic-review.test.js";
import "./research/outcome-semantic-review-evidence-instant.test.js";
import "./research/outcome-review-due.test.js";
import "./research/outcome-review-due-future-poisoning.test.js";
import "./research/outcome-review-due-recommendation-asof.test.js";
import "./research/outcome-review-due-recommendation-revision.test.js";
import "./research/outcome-review-due-semantic-chronology.test.js";
import "./research/outcome-review-due-quantitative-cutoff.test.js";
import "./research/outcome-learning-proposal.test.js";
import "./research/outcome-learning-decision.test.js";
import "./research/outcome-learning-decision-secret-ref.test.js";
import "./research/outcome-learning-shadow-evaluation.test.js";
import "./research/outcome-learning-shadow-evaluation-evidence-instant.test.js";
import "./research/outcome-learning-adoption-decision.test.js";
import "./research/outcome-learning-adoption-secret-ref.test.js";
import "./research/outcome-learning-adoption-fractional-ordering.test.js";
import "./research/outcome-learning-change-preparation.test.js";
import "./research/outcome-learning-status.test.js";
import "./research/recommendation-runtime-local-only.test.js";
import "./research/foundation-decision-hypothesis-registration-instant.test.js";
import "./research/document-revision-diff-snapshot-nanosecond.test.js";
import "./research/stock-pro-council-calibration-fractional-ordering.test.js";
import "./research/stock-pro-council-replay-calibration.test.js";
import "./research/stock-pro-council-ledger-hardening.test.js";
import "./research/stock-pro-council-replay.test.js";
import "./research/edge-decay-strict-date.test.js";
import "./research/promotion-asof-nanosecond.test.js";
import "./jquants-v2-date-cap.test.js";
import { validateWatchlist } from "../src/validation.js";
import type { WatchlistConfig } from "../src/types.js";

function candidate(listedAt: string): WatchlistConfig {
  return {
    symbols: [{
      code: "285A",
      name: "キオクシア",
      market: "TSE",
      status: "research",
      priority: "S",
      tags: ["semiconductor"],
      rules: ["ipo_selling_pressure_done"],
      listedAt,
    }],
  };
}

function testValidWatchlist() {
  assert.deepEqual(validateWatchlist(candidate("2024-12-18")), []);
}

function testStrictListingDate() {
  assert.ok(
    validateWatchlist(candidate("2026-02-31")).some(e => e.includes("listedAt は YYYY-MM-DD 形式の実在する日付")),
    "存在しないlistedAtを拒否する",
  );
  assert.ok(
    validateWatchlist(candidate("0000-01-01")).some(e => e.includes("listedAt は YYYY-MM-DD 形式の実在する日付")),
    "Gregorian year zeroのlistedAtを拒否する",
  );
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
  testStrictListingDate();
  testInvalidWatchlist();
  console.log("validation.test.ts passed");
}

main();
