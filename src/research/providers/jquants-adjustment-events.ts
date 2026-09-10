/**
 * J-Quants が返す調整係数（`AdjFactor`）の観測台帳。
 *
 * ## なぜ価格レコードに入れないか
 *
 * `PitPriceRecord.adjustmentFactor` は「この行の値段に掛かっている調整」を
 * 表す。無調整で保存している以上そこは 1 でなければならず、検証もそう強制する
 * （`adjusted=false の行は adjustmentFactor=1 が必要`）。
 * また `corporateActions[]` に入れると `quantitative-outcome.ts` の
 * 無調整前提の測定が落ちる。
 *
 * ここに入るのは別種の事実 —「その日が権利落ち日だった」という観測。
 * 値段の意味は変えず、事実だけを横に置く。
 *
 * ## 何に使うか
 *
 * F1（異常変動検出）と earnings-gap の `corporateActionDates`。
 * これが無いと 1:100 分割が -99% の暴落として候補に上がる。
 * 実測: 2024-06-19〜2025-03 の189営業日で、単日 -25% 以下が 470件。
 * その大半が分割だった（`15680` 2024-06-28 は AdjFactor=0.01 で -99%）。
 *
 * ## type を決め打ちしない理由
 *
 * `AdjFactor` は「いくら調整したか」しか言わない。分割か、併合か、
 * 権利落ちかは区別できない。向きだけは factor から確実に分かるので、
 * 向きは `direction` として持ち、原因は名乗らない。
 */

import { createHash } from "node:crypto";

export const JQUANTS_ADJUSTMENT_LEDGER_NAME = "_adjustments.jsonl";

export type AdjustmentDirection = "price_decrease" | "price_increase";

export interface JQuantsAdjustmentEvent {
  schemaVersion: 1;
  code: string;
  /** 権利落ち日（この日の値段から新しい株数基準になる）。 */
  effectiveDate: string;
  /** J-Quants の AdjFactor そのまま。1未満なら値段が下がる向き。 */
  factor: number;
  direction: AdjustmentDirection;
  source: "jquants";
  sourceVersion: string;
  observedAt: string;
  retrievedAt: string;
  contentHash: string;
}

export type JQuantsAdjustmentEventInput = Omit<JQuantsAdjustmentEvent, "contentHash" | "direction">;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function adjustmentDirection(factor: number): AdjustmentDirection {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`adjustment factor must be a positive finite number: ${factor}`);
  }
  if (factor === 1) throw new Error("factor=1 is not an adjustment event");
  return factor < 1 ? "price_decrease" : "price_increase";
}

export function withAdjustmentHash(input: JQuantsAdjustmentEventInput): JQuantsAdjustmentEvent {
  if (!ISO_DATE.test(input.effectiveDate)) {
    throw new Error(`effectiveDate must be YYYY-MM-DD: ${input.effectiveDate}`);
  }
  if (!/^[0-9A-Z]{4,5}$/.test(input.code)) {
    throw new Error(`invalid security code: ${input.code}`);
  }
  const direction = adjustmentDirection(input.factor);
  // contentHash は「同じ事実か」の判定にだけ使う。観測時刻は含めない
  // （同じ権利落ちを2回観測しても同じ事実であるべき）。
  const canonical = JSON.stringify([input.code, input.effectiveDate, input.factor, direction]);
  return {
    ...input,
    direction,
    contentHash: createHash("sha256").update(canonical).digest("hex"),
  };
}

export function parseAdjustmentLedger(content: string): JQuantsAdjustmentEvent[] {
  const events: JQuantsAdjustmentEvent[] = [];
  for (const [index, raw] of content.split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as JQuantsAdjustmentEvent);
    } catch (error) {
      throw new Error(`adjustment ledger line ${index + 1} is not JSON: ${(error as Error).message}`);
    }
  }
  return events;
}

/**
 * 台帳を (code, effectiveDate) で畳む。
 *
 * 中断・再開で同じ権利落ちが二重に書かれることはある（価格ファイルの rename
 * より前に追記するため）。同じ事実の重複は畳んでよい。
 * だが **同じ日に別の factor** が2つあるのは畳めない。どちらが正しいか
 * 決められないので落とす。黙って片方を採ると、その銘柄の検証が静かに狂う。
 */
export function dedupeAdjustmentEvents(events: readonly JQuantsAdjustmentEvent[]): JQuantsAdjustmentEvent[] {
  const byKey = new Map<string, JQuantsAdjustmentEvent>();
  for (const event of events) {
    const key = `${event.code}|${event.effectiveDate}`;
    const prior = byKey.get(key);
    if (!prior) { byKey.set(key, event); continue; }
    if (prior.factor !== event.factor) {
      throw new Error(
        `conflicting adjustment factors for ${event.code} on ${event.effectiveDate}: `
        + `${prior.factor} vs ${event.factor}`,
      );
    }
  }
  return [...byKey.values()].sort((left, right) =>
    left.effectiveDate === right.effectiveDate
      ? left.code.localeCompare(right.code)
      : left.effectiveDate.localeCompare(right.effectiveDate),
  );
}

/** F1 / earnings-gap の `corporateActionDates` にそのまま渡せる形。 */
export function toCorporateActionDates(
  events: readonly JQuantsAdjustmentEvent[],
): Map<string, Set<string>> {
  const byCode = new Map<string, Set<string>>();
  for (const event of dedupeAdjustmentEvents(events)) {
    let dates = byCode.get(event.code);
    if (!dates) { dates = new Set<string>(); byCode.set(event.code, dates); }
    dates.add(event.effectiveDate);
  }
  return byCode;
}
