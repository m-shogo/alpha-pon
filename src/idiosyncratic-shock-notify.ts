// 企業固有ショック通知。
// report:shocks が出した eligible=true の候補だけを、イベント状態ごとに1回通知する。
// pnpm notify:shocks

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { sendPipelineSummaryNotification } from "./notify.js";
import type { ShockCandidate, ShockNotificationDecision } from "./idiosyncratic-shock.js";

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

function notificationKey(row: WatchRow): string {
  const drawdownBucket = row.candidate.shockDrawdownPct == null
    ? "unknown"
    : Math.round(row.candidate.shockDrawdownPct).toString();
  const relativeBucket = row.candidate.relativeShockDrawdownPct == null
    ? "unknown"
    : Math.round(row.candidate.relativeShockDrawdownPct).toString();
  return [
    row.candidate.id,
    row.candidate.detectedAt,
    row.decision.score,
    row.candidate.investigationStatus ?? "unknown",
    row.candidate.priceState,
    row.jurisdictionReview.country ?? "unknown",
    row.jurisdictionReview.confidence,
    drawdownBucket,
    relativeBucket,
  ].join(":");
}

function render(row: WatchRow): string {
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

  return [
    "🔎 企業固有ショック 調査候補",
    `${row.candidate.code ?? "-"} ${row.candidate.company}  ${row.decision.score}/20`,
    `市場/国: ${row.market} / ${row.jurisdictionReview.country ?? "unknown"} (${row.jurisdictionReview.group})`,
    `分類: ${row.candidate.category} / ${row.candidate.actorType}`,
    `国差感度: ${row.jurisdictionReview.sensitivity} / local confidence=${row.jurisdictionReview.confidence}`,
    `同国同型: ${row.jurisdictionReview.sameCountryCategoryCases}件 / 同制度群: ${row.jurisdictionReview.sameGroupCategoryCases}件 / 世界: ${row.jurisdictionReview.globalCategoryCases}件`,
    `調査: ${row.candidate.investigationStatus ?? "unknown"} / 証拠: ${row.candidate.evidenceStatus}`,
    `ショック下落: ${shockText} / ${row.benchmarkLabel}比: ${relativeText}`,
    `株価: ${row.candidate.priceState} (${row.priceSource}, ${row.priceAsOf ?? "asOf不明"})`,
    `強い項目: ${topReasons || "-"}`,
    `類似過去: ${analogues || "なし"}`,
    `事件: ${row.candidate.eventSummary}`,
    "",
    `✅ 一次情報・調査範囲・12点以上・事件窓の実下落・${row.benchmarkLabel}超過下落・下落一巡・jurisdiction reviewの全ゲートを通過`,
    "※買い推奨ではありません。候補発見後に決算・IR・現地制度・価格を再確認してください。",
  ].join("\n");
}

async function main(): Promise<void> {
  if (!existsSync(REPORT_PATH)) {
    console.log(`${REPORT_PATH} がありません。先に pnpm report:shocks を実行してください。`);
    return;
  }

  const report = JSON.parse(readFileSync(REPORT_PATH, "utf-8")) as WatchReport;
  const eligible = report.candidates.filter(row => row.decision.eligible);
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
    console.log(`LINE通知: ${row.market}/${row.jurisdictionReview.country ?? "?"} ${row.candidate.code ?? "-"} ${row.candidate.company} ${row.decision.score}/20`);
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
