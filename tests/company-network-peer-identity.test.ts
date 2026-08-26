import assert from "node:assert/strict";
import {
  normalizeCompanyNetworkReportRows,
  normalizeCompanyNetworkRoot,
} from "../src/company-coverage-input.js";

const normalized = normalizeCompanyNetworkReportRows(normalizeCompanyNetworkRoot({
  companies: {
    "8136": {
      name: "サンリオ",
      categoryHints: ["entertainment"],
      peers: [
        { code: "7974", name: "任天堂", relation: "peer" },
        { code: " 7974 ", name: "任天堂 duplicate", relation: "peer duplicate" },
        { code: "4661", name: "オリエンタルランド", relation: "adjacent" },
      ],
      customerOrDemandDrivers: [],
      betterPeerRisk: [],
      evidenceChecks: [],
    },
  },
}));

assert.deepEqual(
  normalized.companies["8136"].peers,
  [
    { code: "7974", name: "任天堂", relation: "peer" },
    { code: "4661", name: "オリエンタルランド", relation: "adjacent" },
  ],
  "canonical duplicate peer code must not inflate company-network evidence",
);
assert.ok(
  normalized.warnings.some(warning => warning.includes("peer 7974 canonical identity is duplicated")),
  "duplicate peer identity must remain visible as metadata warning",
);

console.log("company-network-peer-identity.test.ts passed");
