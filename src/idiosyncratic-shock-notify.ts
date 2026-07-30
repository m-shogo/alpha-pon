// 企業固有ショック通知。
// report:shocks が出した eligible=true の候補でも、事件帰属contextが未解決なら通知しない。
// pnpm notify:shocks

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { sendPipelineSummaryNotification } from "./notify.js";
import type { ShockCandidate, ShockNotificationDecision } from "./idiosyncratic-shock.js";
import { loadActiveShockConfig } from "./idiosyncratic-shock-data.js";
import { buildShockContextReview, type ShockContextReview } from "./idiosyncratic-shock-context.js";

type CalibrationInfo = {
  readiness: {
    modelLevel: string;
    status: string;
    effectiveThreshold: number;
    effectiveThresholdSource: string;
    countryCases: number;
    countryCategoryCases: number;
    validationCases: number;
  };
  registryEntry: { id: string; scoreMethod?: string } | null;
};

type WatchRow = {
  candidate: ShockCandidate;
  market: string;
  benchmarkLabel: string;
  priceSource: string;
  priceAsOf: string | null;
  jurisdictionReview: {
    country: string | null;
    group: string;
    sensitivity: string;
    confidence: string;
    sameCountryCategoryCases: number;
    sameGroupCategoryCases: number;
    globalCategoryCases: number;
  };
  calibration?: CalibrationInfo;
  localOpportunityScore?: number;
  decision: ShockNotificationDecision;
  analogues: Array<{
    company: string;
    country: string;
    eventDate: string;
    score: number;
    outcomePattern: string;
    distance: number;
    jurisdictionPenalty: number;
    lesson: string;
  }>;
};

type NotifyRow = Omit<WatchRow, "calibration" | "localOpportunityScore"> & {
  calibration: CalibrationInfo;
  localOpportunityScore: number;
  contextReview: ShockContextReview;
};

type WatchReport = {
  generatedAt: string;
  candidates: WatchRow[];
};

type NotifyState = {
  notifiedKeys: string[];
  updatedAt: string;
};

const REPORT_PATH = "reports/idiosyncratic_shock_watch_latest.json";
const STATE_PATH = "data/idiosyncratic_shock_notification_state.json";

function loadState(): NotifyState {
  if (!existsSync(STATE_PATH)) return { notifiedKeys: [], updatedAt: "" };
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as NotifyState;
  } catch {
    return { notifiedKeys: [], updatedAt: "" };
  }
}

function notificationKey(row: NotifyRow): string {
  const drawdownBucket = row.candidate.shockDrawdownPct == null
    ? "unknown"
    : Math.round(row.candidate.shockDrawdownPct).toString();
  const relativeBucket = row.candidate.relativeShockDrawdownPct == null
    ? "unknown"
    : Math.round(row.candidate.relativeShockDrawdownPct).toString();
  const industryBucket = row.contextReview.industryRelativeShockDrawdownPct == null
    ? "unknown"
    : Math.round(row.contextReview.industryRelativeShockDrawdownPct).toString();
  return [
    row.candidate.id,
    row.candidate.detectedAt,
    row.decision.score,
    `local-${row.localOpportunityScore.toFixed(2)}`,
    `threshold-${row.calibration.readiness.effectiveThreshold}`,
    row.calibration.registryEntry?.id ?? "global-default",
    row.candidate.investigationStatus ?? "unknown",
    row.candidate.priceState,
    row.jurisdictionReview.country ?? "unknown",
    row.jurisdictionReview.confidence,
    row.contextReview.incidentGeography,
    row.contextReview.confounderStatus,
    row.contextReview.informationLeakStatus,
    row.contextReview.recurrenceStatus,
    row.contextReview.remediationStatus,
    row.contextReview.listingStructure,
    row.contextReview.ownershipControl,
    row.contextReview.liquidityStatus,
    row.contextReview.incidentClusterStatus,
    drawdownBucket,
    relativeBucket,
    industryBucket,
  ].join(":");
}

function valueOrUnknown(value: number | null, suffix: string): string {
  return value == null || !Number.isFinite(value) ? "不明" : `${value.toFixed(1)}${suffix}`;
}

function render(row: NotifyRow): string {
  const analogues = row.analogues.slice(0, 3)
    .map(item => `[${item.country}] ${item.company}(${item.score}/20, ${item.outcomePattern}, 距離${item.distance}, 国差+${item.jurisdictionPenalty})`)
    .join(" / ");
  const topReasons = Object.entries(row.candidate.scores)
    .filter(([, value]) => value === 2)
    .slice(0, 4)
    .map(([key]) => key)
    .join(", ");
  const shockText = row.candidate.shockDrawdownPct == null
    ? "不明"
    : `${row.candidate.shockDrawdownPct.toFixed(1)}%`;
  const relativeText = row.candidate.relativeShockDrawdownPct == null
    ? "不明"
    : `${row.candidate.relativeShockDrawdownPct.toFixed(1)}%`;
  const calibration = row.calibration.readiness;

  return [
    "🔎 企業固有ショック 調査候補",
    `${row.candidate.code ?? "-"} ${row.candidate.company}`,
    `Global Structural: ${row.decision.score}/20 / Local Opportunity: ${row.localOpportunityScore.toFixed(2)}/20`,
    `実効閾値: ${calibration.effectiveThreshold}/20 (${calibration.effectiveThresholdSource}, ${calibration.modelLevel}/${calibration.status}, method=${row.calibration.registryEntry?.scoreMethod ?? "global_structural"}, registry=${row.calibration.registryEntry?.id ?? "none"})`,
    `市場/本社国: ${row.market} / ${row.jurisdictionReview.country ?? "unknown"} (${row.jurisdictionReview.group})`,
    `事件国: ${row.contextReview.incidentCountry ?? "unknown"} / geography=${row.contextReview.incidentGeography}`,
    `業種リスク: ${row.contextReview.sectorRiskClass} / stakeholder=${row.contextReview.stakeholder} / scope=${row.contextReview.incidentScope}`,
    `構造: listing=${row.contextReview.listingStructure} / ownership=${row.contextReview.ownershipControl} / liquidity=${row.contextReview.liquidityStatus}`,
    `事件連鎖/観測性: ${row.contextReview.incidentClusterStatus} / ${row.contextReview.disclosureObservability}`,
    `原因帰属: ${row.contextReview.confounderStatus} / leak=${row.contextReview.informationLeakStatus}`,
    `再発/是正: ${row.contextReview.recurrenceStatus} / ${row.contextReview.remediationStatus}`,
    `事件地域売上露出: ${valueOrUnknown(row.contextReview.incidentRevenueExposurePct, "%")}`,
    `推定直接損失/時価総額: ${valueOrUnknown(row.contextReview.estimatedDirectCostPctMarketCap, "%")}`,
    `分類: ${row.candidate.category} / ${row.candidate.actorType}`,
    `国差感度: ${row.jurisdictionReview.sensitivity} / local confidence=${row.jurisdictionReview.confidence}`,
    `同国同型: ${row.jurisdictionReview.sameCountryCategoryCases}件 / 同制度群: ${row.jurisdictionReview.sameGroupCategoryCases}件 / 世界: ${row.jurisdictionReview.globalCategoryCases}件`,
    `調査: ${row.candidate.investigationStatus ?? "unknown"} / 証拠: ${row.candidate.evidenceStatus}`,
    `ショック下落: ${shockText} / ${row.benchmarkLabel}比: ${relativeText} / 同業比: ${valueOrUnknown(row.contextReview.industryRelativeShockDrawdownPct, "%")}`,
    `株価: ${row.candidate.priceState} (${row.priceSource}, ${row.priceAsOf ?? "asOf不明"})`,
    `強い項目: ${topReasons || "-"}`,
    `類似過去: ${analogues || "なし"}`,
    `事件: ${row.candidate.eventSummary}`,
    "",
    `✅ 一次情報・調査範囲・Local Opportunity>=${calibration.effectiveThreshold}・事件窓の実下落・${row.benchmarkLabel}超過下落・下落一巡・jurisdiction・原因帰属・流動性/事件連鎖・再発/是正の全ゲートを通過`,
    "※買い推奨ではありません。候補発見後に決算・IR・現地制度・同時材料・価格を再確認してください。",
  ].join("\n");
}

async function main(): Promise<void> {
  if (!existsSync(REPORT_PATH)) {
    console.log(`${REPORT_PATH} がありません。先に pnpm report:shocks を実行してください。`);
    return;
  }

  const report = JSON.parse(readFileSync(REPORT_PATH, "utf-8")) as WatchReport;
  const active = loadActiveShockConfig();
  const activeById = new Map(active.candidates.map(item => [item.id, item]));

  const eligible: NotifyRow[] = [];
  for (const row of report.candidates) {
    if (!row.calibration?.readiness || !Number.isFinite(row.calibration.readiness.effectiveThreshold) || !Number.isFinite(row.localOpportunityScore)) {
      console.log(`企業固有ショック通知: ${row.candidate.id} stale report without calibration/local score -> BLOCK; rerun pnpm report:shocks`);
      continue;
    }
    if (!row.decision.eligible) continue;
    const raw = activeById.get(row.candidate.id);
    if (!raw) {
      console.log(`企業固有ショック通知: ${row.candidate.id} active config missing -> BLOCK`);
      continue;
    }
    const contextReview = buildShockContextReview({
      issuerCountry: raw.country,
      incidentCountry: raw.incidentCountry,
      market: raw.market,
      sector: raw.sector,
      stakeholder: raw.stakeholder,
      incidentScope: raw.incidentScope,
      confounderStatus: raw.confounderStatus,
      informationLeakStatus: raw.informationLeakStatus,
      recurrenceStatus: raw.recurrenceStatus,
      remediationStatus: raw.remediationStatus,
      listingStructure: raw.listingStructure,
      ownershipControl: raw.ownershipControl,
      liquidityStatus: raw.liquidityStatus,
      incidentClusterStatus: raw.incidentClusterStatus,
      disclosureObservability: raw.disclosureObservability,
      incidentRevenueExposurePct: raw.incidentRevenueExposurePct,
      estimatedDirectCostPctMarketCap: raw.estimatedDirectCostPctMarketCap,
      industryRelativeShockDrawdownPct: raw.industryRelativeShockDrawdownPct,
    });
    if (contextReview.blockers.length > 0) {
      console.log(`企業固有ショック通知: ${row.candidate.id} context BLOCK (${contextReview.blockers.join("; ")})`);
      continue;
    }
    eligible.push({ ...row, calibration: row.calibration, localOpportunityScore: row.localOpportunityScore!, contextReview });
  }

  if (eligible.length === 0) {
    console.log("企業固有ショック通知: 対象なし");
    return;
  }

  const state = loadState();
  const known = new Set(state.notifiedKeys);
  const newRows = eligible.filter(row => !known.has(notificationKey(row)));
  if (newRows.length === 0) {
    console.log("企業固有ショック通知: 新規対象なし（既通知）");
    return;
  }

  const notifyOff = process.env.NOTIFY_MODE === "off";
  const lineConfigured = Boolean(process.env.LINE_CHANNEL_TOKEN && process.env.LINE_USER_ID);
  if (notifyOff || !lineConfigured) {
    console.log(`企業固有ショック通知: ${newRows.length}件 eligible だが送信しない (${notifyOff ? "NOTIFY_MODE=off" : "LINE未設定"})`);
    return;
  }

  for (const row of newRows) {
    await sendPipelineSummaryNotification(render(row));
    known.add(notificationKey(row));
    console.log(`LINE通知: ${row.market}/${row.jurisdictionReview.country ?? "?"} ${row.candidate.code ?? "-"} ${row.candidate.company} global=${row.decision.score}/20 local=${row.localOpportunityScore.toFixed(2)}/20 threshold=${row.calibration.readiness.effectiveThreshold}`);
  }

  mkdirSync("data", { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify({
    notifiedKeys: [...known].slice(-500),
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf-8");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
