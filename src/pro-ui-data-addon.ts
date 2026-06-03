import { existsSync, readFileSync, writeFileSync } from "fs";

const UI_DATA_PATH = "apps/web/public/generated/alpha-pon-data.json";

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function main() {
  const data = readJson<Record<string, unknown>>(UI_DATA_PATH, {});
  const buffettQuality = readJson("data/buffett_quality_latest.json", { generatedAt: null, snapshots: [] });
  const valuationSnapshots = readJson("data/valuation_snapshot_latest.json", { generatedAt: null, snapshots: [] });
  const irEventEvidence = readJson("data/ir_event_evidence_latest.json", { generatedAt: null, events: [] });
  const stockProCommitteeJson = readJson("reports/stock_pro_committee_latest.json", { generatedAt: null, decisions: [] });

  const merged = {
    ...data,
    buffettQuality,
    valuationSnapshots,
    irEventEvidence,
    stockProCommitteeJson,
    proDataMeta: {
      source: "pro-ui-data-addon",
      generatedAt: new Date().toISOString(),
      missing: [
        existsSync("data/buffett_quality_latest.json") ? null : "data/buffett_quality_latest.json",
        existsSync("data/valuation_snapshot_latest.json") ? null : "data/valuation_snapshot_latest.json",
        existsSync("data/ir_event_evidence_latest.json") ? null : "data/ir_event_evidence_latest.json",
        existsSync("reports/stock_pro_committee_latest.json") ? null : "reports/stock_pro_committee_latest.json",
      ].filter(Boolean),
    },
  };

  writeFileSync(UI_DATA_PATH, JSON.stringify(merged, null, 2), "utf-8");
  console.log("merged stock pro data into apps/web/public/generated/alpha-pon-data.json");
}

main();
