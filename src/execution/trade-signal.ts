// 売買計画シグナルの契約と出力整形。
//
// 目的:
//   「何を・どちら向きに・どこで入り・どこで降り・いつまでに・
//     何が起きたら間違いと分かるか・過去の実績はどうか」を1件にまとめる。
//
// なぜ必要か:
//   現状の通知はニュース見出し（直近14日で180件）で、
//   見ても発注の可否が決まらない。銘柄・方向・価格・期限・反証条件を
//   欠いた通知は、行動につながらないという意味で通知していないのと同じ。
//
// 表現について:
//   ここで出すのは **計画の記述** であって「こうしろ」という助言ではない。
//   src/safe-output-audit.ts が禁じているのは推奨表現であり、
//   事実としての価格・期限・条件の記述は対象外。
//   安全装置は一切緩めていない。
//
// 守ること:
//   - 反証条件（何が起きたら降りるか）を必須にする。
//     降り方を決めていない計画は計画ではない。
//   - 一次情報の URL を必須にする。
//   - 実績が無い Edge は **実績なしと明示する**。
//     検証していないものを、検証済みと同じ見た目で出さない。
//   - オーナー向けと公開向けで出力を分ける。
//     公開側には価格・数量を出さない。

import type { PositionSizingResult } from "./position-sizing.js";

export interface TradeSignalTrackRecord {
  /** 検証に使ったサンプル数。 */
  sampleCount: number;
  /** イベント日クラスタ数。sampleCount より小さいのが普通。 */
  clusterCount: number;
  /** クラスタ補正後の t 統計量。算出不能なら null。 */
  clusteredTStat: number | null;
  /** 手数料控除後の平均。 */
  meanNetAlphaBps: number;
  /** その Edge でこれまでに試した回数。多いほど要求水準が上がる。 */
  trials: number;
  asOf: string;
}

export interface TradeSignal {
  schemaVersion: 1;
  signalId: string;
  edgeId: string;
  code: string;
  name?: string;
  side: "long" | "short";
  /** この計画の根拠が確定した時刻。PIT の基準。 */
  observedAt: string;
  /** 参照価格。実際の約定価格ではない。 */
  referencePrice: number;
  entryMode: "next_open" | "limit";
  /** 指値の場合の価格。next_open では未使用。 */
  limitPrice?: number;
  stopPrice: number;
  targetPrice?: number;
  /** 想定保有期間（営業日）。 */
  horizonBars: number;
  /** この日を過ぎたら計画を破棄する。 */
  validUntil: string;
  /** 何が起きたら間違いと分かるか。空は許さない。 */
  invalidation: string[];
  /** 一次情報の URL（https のみ）。 */
  evidenceUrls: string[];
  /** null は「この Edge はまだ検証されていない」を意味する。 */
  trackRecord: TradeSignalTrackRecord | null;
  sizing?: PositionSizingResult;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CODE_PATTERN = /^[0-9A-Z]{4,5}$/;

function assertNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`trade signal ${field} must be a non-empty string`);
  }
  return value;
}

function assertHttpsUrl(value: string, field: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute URL: ${value}`);
  }
  if (parsed.protocol !== "https:") throw new Error(`${field} must use https: ${value}`);
}

export function assertTradeSignal(signal: TradeSignal): void {
  if (signal.schemaVersion !== 1) throw new Error("trade signal schemaVersion must be 1");
  assertNonEmpty(signal.signalId, "signalId");
  assertNonEmpty(signal.edgeId, "edgeId");
  const code = assertNonEmpty(signal.code, "code").trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new Error(`trade signal code must be 4-5 alphanumeric: ${signal.code}`);
  if (signal.side !== "long" && signal.side !== "short") {
    throw new Error(`trade signal side must be long or short: ${signal.side}`);
  }
  if (!ISO_DATE_PATTERN.test(signal.validUntil)) {
    throw new Error(`trade signal validUntil must be YYYY-MM-DD: ${signal.validUntil}`);
  }
  for (const [label, value] of [
    ["referencePrice", signal.referencePrice],
    ["stopPrice", signal.stopPrice],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`trade signal ${label} must be a positive finite number: ${value}`);
    }
  }
  if (signal.entryMode === "limit" && !(Number.isFinite(signal.limitPrice) && (signal.limitPrice ?? 0) > 0)) {
    throw new Error("trade signal limitPrice is required when entryMode is limit");
  }
  if (!Number.isSafeInteger(signal.horizonBars) || signal.horizonBars < 1) {
    throw new Error(`trade signal horizonBars must be a positive safe integer: ${signal.horizonBars}`);
  }

  // 降り方を決めていない計画は計画ではない。
  const wrongStopSide = signal.side === "long"
    ? signal.stopPrice >= signal.referencePrice
    : signal.stopPrice <= signal.referencePrice;
  if (wrongStopSide) {
    throw new Error(
      `trade signal stopPrice must be on the losing side of referencePrice `
      + `(${signal.side}: ${signal.stopPrice} vs ${signal.referencePrice})`,
    );
  }
  if (signal.targetPrice !== undefined) {
    const wrongTargetSide = signal.side === "long"
      ? signal.targetPrice <= signal.referencePrice
      : signal.targetPrice >= signal.referencePrice;
    if (wrongTargetSide) {
      throw new Error("trade signal targetPrice must be on the winning side of referencePrice");
    }
  }

  if (!Array.isArray(signal.invalidation) || signal.invalidation.length === 0) {
    throw new Error("trade signal invalidation is required: 何が起きたら降りるかを書く");
  }
  for (const [index, item] of signal.invalidation.entries()) {
    assertNonEmpty(item, `invalidation[${index}]`);
  }
  if (!Array.isArray(signal.evidenceUrls) || signal.evidenceUrls.length === 0) {
    throw new Error("trade signal evidenceUrls is required: 一次情報を必ず添える");
  }
  for (const [index, url] of signal.evidenceUrls.entries()) {
    assertHttpsUrl(assertNonEmpty(url, `evidenceUrls[${index}]`), `evidenceUrls[${index}]`);
  }
}

function riskRewardRatio(signal: TradeSignal): number | null {
  if (signal.targetPrice === undefined) return null;
  const risk = Math.abs(signal.referencePrice - signal.stopPrice);
  const reward = Math.abs(signal.targetPrice - signal.referencePrice);
  return risk === 0 ? null : reward / risk;
}

function formatTrackRecord(record: TradeSignalTrackRecord | null): string[] {
  if (!record) {
    return [
      "実績: **なし（未検証）**",
      "  この計画はまだ検証を通っていません。過去の成績が存在しません。",
    ];
  }
  const t = record.clusteredTStat === null
    ? "算出不能（クラスタ不足）"
    : record.clusteredTStat.toFixed(2);
  return [
    `実績: n=${record.sampleCount}（クラスタ ${record.clusterCount}） / `
    + `手数料後平均 ${record.meanNetAlphaBps >= 0 ? "+" : ""}${record.meanNetAlphaBps.toFixed(0)}bps / `
    + `t=${t} / 試行 ${record.trials} 回 / 基準日 ${record.asOf}`,
  ];
}

/**
 * オーナー向けの出力。計画の全項目を出す。
 *
 * 表現は事実の記述に限る。判断と発注は人間が行う。
 */
export function formatOwnerSignal(signal: TradeSignal): string {
  assertTradeSignal(signal);
  const lines: string[] = [];
  const label = signal.name ? `${signal.code} ${signal.name}` : signal.code;
  const direction = signal.side === "long" ? "買い方向" : "売り方向";

  lines.push(`■ ${label} / ${direction}`);
  lines.push(
    signal.entryMode === "limit"
      ? `  入り: 指値 ${signal.limitPrice!.toLocaleString()}円`
      : `  入り: 翌営業日の寄付（参照 ${signal.referencePrice.toLocaleString()}円）`,
  );
  lines.push(`  損切り: ${signal.stopPrice.toLocaleString()}円`);
  if (signal.targetPrice !== undefined) {
    const ratio = riskRewardRatio(signal);
    lines.push(
      `  目標: ${signal.targetPrice.toLocaleString()}円`
      + (ratio === null ? "" : `（損益比 ${ratio.toFixed(1)}）`),
    );
  }
  lines.push(`  期間: ${signal.horizonBars}営業日 / ${signal.validUntil} まで有効`);

  if (signal.sizing) {
    if (signal.sizing.rejected) {
      lines.push(`  数量: **建てない**（${signal.sizing.rejectReason}）`);
      for (const warning of signal.sizing.warnings) lines.push(`        ${warning}`);
    } else {
      lines.push(
        `  数量: ${signal.sizing.lots}単元 ${signal.sizing.shares}株`
        + `（想定損失 ${Math.round(signal.sizing.riskJpy).toLocaleString()}円 = `
        + `口座の ${signal.sizing.riskPctOfEquity.toFixed(2)}% / 制約: ${signal.sizing.bindingConstraint ?? "なし"}）`,
      );
      for (const warning of signal.sizing.warnings) lines.push(`        ⚠ ${warning}`);
    }
  }

  lines.push("  降りる条件:");
  for (const item of signal.invalidation) lines.push(`    - ${item}`);
  lines.push(...formatTrackRecord(signal.trackRecord).map((one) => `  ${one}`));
  lines.push("  一次情報:");
  for (const url of signal.evidenceUrls) lines.push(`    - ${url}`);
  return lines.join("\n");
}

/**
 * 公開向けの出力。価格・数量・方向は出さない。
 *
 * 公開物では調査状況だけを示す。売買の判断材料として使える形にしない。
 */
export function formatPublicSignal(signal: TradeSignal): string {
  assertTradeSignal(signal);
  const label = signal.name ? `${signal.code} ${signal.name}` : signal.code;
  const status = signal.trackRecord === null ? "未検証" : `検証中（n=${signal.trackRecord.sampleCount}）`;
  return [
    `${label}: ${signal.edgeId} の調査対象（${status}）`,
    "  ※ 調査状況の共有です。価格・数量・方向は公開しません。",
  ].join("\n");
}
