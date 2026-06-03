// Pro委員会データ → alpha-pon-data.json アドオン
// report-ui-data.ts から呼び出し、legendProCommittee 等を alpha-pon-data.json に追加する。
// 買い推奨ではありません。調査・検証・反証・学習用。

import { existsSync, readFileSync } from "fs";
import type { ProCommitteeReport, ProDecision } from "./pro-types.js";

type BuffettQualityEntry = {
  code: string;
  name: string;
  agentLabel: string;
  stance: string;
  points: string[];
};

type ValuationSnapshotEntry = {
  code: string;
  name: string;
  agentLabel: string;
  stance: string;
  points: string[];
};

type IrEventEvidenceEntry = {
  code: string;
  name: string;
  agentLabel: string;
  stance: string;
  points: string[];
};

export type ProUiDataAddon = {
  legendProCommittee: {
    generatedAt: string;
    decisions: Array<{
      code: string;
      name: string;
      finalLabel: string;
      originalFinalLabel: string;
      finalScore: number;
      proScore: number;
      consensus: string;
      disagreements: ProDecision["disagreements"];
      legendWarnings: string[];
      nextActions: string[];
      blockers: string[];
      missingEvidence: string[];
    }>;
  } | null;
  buffettQuality: BuffettQualityEntry[];
  valuationSnapshots: ValuationSnapshotEntry[];
  irEventEvidence: IrEventEvidenceEntry[];
  stockProCommitteeJson: ProCommitteeReport | null;
};

function readProCommitteeJson(): ProCommitteeReport | null {
  const path = "reports/stock_pro_committee_latest.json";
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ProCommitteeReport;
  } catch {
    return null;
  }
}

/**
 * Pro委員会 JSON から UI 向けデータを生成する
 */
export function buildProUiDataAddon(): ProUiDataAddon {
  const report = readProCommitteeJson();

  if (!report) {
    return {
      legendProCommittee: null,
      buffettQuality: [],
      valuationSnapshots: [],
      irEventEvidence: [],
      stockProCommitteeJson: null,
    };
  }

  const { decisions, generatedAt } = report;

  // legendProCommittee: consensus / disagreements を含む軽量版
  const legendProCommittee = {
    generatedAt,
    decisions: decisions.map(d => ({
      code: d.code,
      name: d.name,
      finalLabel: d.finalLabel,
      originalFinalLabel: d.originalFinalLabel,
      finalScore: d.finalScore,
      proScore: d.proScore,
      consensus: d.consensus,
      disagreements: d.disagreements,
      legendWarnings: d.legendWarnings,
      nextActions: d.nextActions,
      blockers: d.blockers,
      missingEvidence: d.missingEvidence,
    })),
  };

  // buffettQuality: buffett_quality_agent のみ抽出
  const buffettQuality: BuffettQualityEntry[] = decisions.flatMap(d => {
    const v = d.verdicts.find(v => v.agentId === "buffett_quality_agent");
    if (!v) return [];
    return [{ code: d.code, name: d.name, agentLabel: v.agentLabel, stance: v.stance, points: v.points }];
  });

  // valuationSnapshots: valuation_agent のみ抽出
  const valuationSnapshots: ValuationSnapshotEntry[] = decisions.flatMap(d => {
    const v = d.verdicts.find(v => v.agentId === "valuation_agent");
    if (!v) return [];
    return [{ code: d.code, name: d.name, agentLabel: v.agentLabel, stance: v.stance, points: v.points }];
  });

  // irEventEvidence: event_driven_agent のみ抽出
  const irEventEvidence: IrEventEvidenceEntry[] = decisions.flatMap(d => {
    const v = d.verdicts.find(v => v.agentId === "event_driven_agent");
    if (!v) return [];
    return [{ code: d.code, name: d.name, agentLabel: v.agentLabel, stance: v.stance, points: v.points }];
  });

  return {
    legendProCommittee,
    buffettQuality,
    valuationSnapshots,
    irEventEvidence,
    stockProCommitteeJson: report,
  };
}
