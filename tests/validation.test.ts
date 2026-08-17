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
import "./must-watch-audit-status.test.js";
import "./source-health-input.test.js";
import "./pipeline-health-input.test.js";
import "./listing-event-message-preview-input.test.js";
import "./readiness-future-score-snapshot.test.js";
import "./readiness-future-backup.test.js";
import "./ops-dashboard-input-time.test.js";
import "./world-impact-latest-input.test.js";
import "./company-hypothesis-report-input.test.js";
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
import {
  normalizeCompanyCoverageRoots,
  normalizeCompanyCoverageRows,
  normalizeCompanyNetworkReportRows,
  normalizeCompanyNetworkRoot,
} from "../src/company-coverage-input.js";
import { normalizeCompanyRulesWatchlistRow } from "../src/company-rules-watchlist-input.js";
import { validateWatchlist } from "../src/validation.js";
import { resolveWorldImpactEvaluationAsOf } from "../src/world-impact-evaluation-input.js";
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

function testCompanyRulesWatchlistRowIsolation() {
  assert.deepEqual(
    normalizeCompanyRulesWatchlistRow({
      code: " 285A ",
      name: " キオクシア ",
      tags: [" semiconductor ", 123, ""],
      rules: [" ipo_selling_pressure_done ", null],
    }),
    {
      code: "285A",
      name: "キオクシア",
      tags: ["semiconductor"],
      rules: ["ipo_selling_pressure_done"],
    },
    "正常rowはcanonical化して保持する",
  );
  assert.equal(normalizeCompanyRulesWatchlistRow(null), null, "null rowは全watchlistを落とさず隔離できる");
  assert.equal(normalizeCompanyRulesWatchlistRow("broken"), null, "primitive rowは隔離できる");
  assert.deepEqual(
    normalizeCompanyRulesWatchlistRow({ code: "285A", name: "キオクシア", tags: "broken", rules: {} }),
    { code: "285A", name: "キオクシア", tags: [], rules: [] },
    "壊れたtags/rulesはrow全体を落とさず空配列へ隔離する",
  );
}

function testCompanyCoverageRowIsolation() {
  const roots = normalizeCompanyCoverageRoots(
    {
      categories: {
        healthy: {
          label: "Healthy",
          companies: [
            { code: "8136", name: "サンリオ", status: "active" },
            null,
            { code: "", name: "identity missing" },
          ],
        },
        brokenCategory: null,
        brokenCompanies: { label: "Broken", companies: {} },
      },
    },
    {
      companies: {
        " 8136 ": { name: "サンリオ", categoryHints: [" entertainment "] },
        "4661": null,
        "7974": { name: "任天堂", categoryHints: {} },
      },
    },
  );
  const normalized = normalizeCompanyCoverageRows(roots);

  assert.deepEqual(normalized.categories.healthy.companies, [
    { code: "8136", name: "サンリオ", status: "active" },
  ], "正常なhypothesis rowは壊れrowの周囲でも保持する");
  assert.deepEqual(normalized.companies["8136"], {
    name: "サンリオ",
    categoryHints: ["entertainment"],
  }, "network codeもcanonical化して同一company identityを維持する");
  assert.equal(normalized.companies["4661"], undefined, "null network rowは隔離する");
  assert.equal(normalized.companies["7974"], undefined, "壊れたcategoryHints rowは隔離する");
  assert.ok(normalized.warnings.length >= 5, "壊れrowはsilent dropせずmetadata warningへ残す");

  const duplicateRoots = normalizeCompanyCoverageRoots(
    { categories: {} },
    {
      companies: {
        "8136": { name: "サンリオ", categoryHints: [] },
        " 8136 ": { name: "duplicate", categoryHints: [] },
      },
    },
  );
  const duplicateNormalized = normalizeCompanyCoverageRows(duplicateRoots);
  assert.equal(duplicateNormalized.companies["8136"].name, "サンリオ", "canonical duplicateは先行rowを保持する");
  assert.ok(
    duplicateNormalized.warnings.some(warning => warning.includes("canonical identity is duplicated")),
    "canonical duplicateはsilent overwriteせずwarningへ残す",
  );
}

function testCompanyNetworkReportRowIsolation() {
  const input = normalizeCompanyNetworkRoot({
    companies: {
      " 8136 ": {
        name: " サンリオ ",
        categoryHints: [" entertainment "],
        peers: [
          { code: " 7974 ", name: " 任天堂 ", relation: " peer " },
          null,
        ],
        customerOrDemandDrivers: [" licensing "],
        betterPeerRisk: {},
        evidenceChecks: [" IR "],
      },
      "4661": null,
    },
  });
  const normalized = normalizeCompanyNetworkReportRows(input);
  assert.deepEqual(normalized.companies["8136"], {
    name: "サンリオ",
    categoryHints: ["entertainment"],
    peers: [{ code: "7974", name: "任天堂", relation: "peer" }],
    customerOrDemandDrivers: ["licensing"],
    betterPeerRisk: [],
    evidenceChecks: ["IR"],
  }, "nested malformed rowを隔離しつつ正常companyをread-only reportへ保持する");
  assert.equal(normalized.companies["4661"], undefined, "null company rowはreport全体を止めず隔離する");
  assert.ok(normalized.warnings.some(warning => warning.includes("peer row 2")), "壊れたpeer rowをwarningへ残す");
  assert.ok(normalized.warnings.some(warning => warning.includes("betterPeerRisk")), "壊れたlist fieldをwarningへ残す");
  assert.ok(normalized.warnings.some(warning => warning.includes("4661")), "壊れたcompany rowをwarningへ残す");
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

function testWorldImpactEvaluationAsOf() {
  assert.equal(resolveWorldImpactEvaluationAsOf(null, "2026-08-15"), "2026-08-15", "未指定時はJST today fallbackを使う");
  assert.equal(resolveWorldImpactEvaluationAsOf("2024-02-29", "2026-08-15"), "2024-02-29", "実在leap dayを受理する");
  assert.throws(
    () => resolveWorldImpactEvaluationAsOf("2026-02-31", "2026-08-15"),
    /requires a real YYYY-MM-DD date/,
    "不存在日をprovider取得やPIT判定へ渡さない",
  );
  assert.throws(
    () => resolveWorldImpactEvaluationAsOf("0000-01-01", "2026-08-15"),
    /requires a real YYYY-MM-DD date/,
    "Gregorian year zeroを評価基準日にしない",
  );
  assert.throws(
    () => resolveWorldImpactEvaluationAsOf("20260815", "2026-08-15"),
    /requires a real YYYY-MM-DD date/,
    "非canonical date形式を受理しない",
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
  testCompanyRulesWatchlistRowIsolation();
  testCompanyCoverageRowIsolation();
  testCompanyNetworkReportRowIsolation();
  testStrictListingDate();
  testWorldImpactEvaluationAsOf();
  testInvalidWatchlist();
  console.log("validation.test.ts passed");
}

main();