/**
 * 決算開示から「説明のつく日」を組む。
 *
 * ## なぜ要るか
 *
 * F1（-10%級の急落の抽出）は `knownEventDates` に載っている日を除外する。
 * ところがこの Map は **これまで空のまま**渡されていた。空は「既知イベントが
 * 無い」ではなく「情報が無い」を意味するので、候補841件のうち何件が
 * ただの決算反応なのかが分からなかった。不祥事 Edge を測っても、
 * 中身の大半が決算かもしれない、という状態が残る。
 *
 * ## 反応日の決め方
 *
 * 開示は `DiscTime` 付きで来る。引け前なら当日の終値に既に入っていて、
 * 引け後なら翌営業日の寄りに出る。東証の引けは 2024-11-05 に
 * 15:00 → 15:30 へ変わっているので、その判定は
 * `resolveReactionDate` / `jquantsTradingDayCloseJst` に任せる。
 *
 * ## 開示当日も外すか
 *
 * 既定で外す（`includeDisclosureDay`）。引け後の開示なら、その日の終値は
 * ニュースより前なので理屈の上では「説明がつかない」動きのはず。
 * だが決算前の漏れや観測（引け間際の急落→引け後に下方修正）は珍しくない。
 *
 * **外しすぎは標本が減るだけだが、外し損ねは「不祥事の効果」として
 * 決算反応を測ってしまう。** 取り違えのほうが高くつくので保守的に倒す。
 */

import { resolveReactionDate } from "./edinet-reason-events.js";

export interface EarningsDisclosure {
  /** J-Quants の5桁コード。 */
  code: string;
  /** `YYYY-MM-DD`。 */
  disclosedDate: string;
  /** `HH:MM:SS`（JST）。 */
  disclosedTime: string;
}

export interface EarningsEventDatesResult {
  /** code -> 除外する営業日の集合。 */
  byCode: Map<string, Set<string>>;
  /** 反応日を決められた開示の数。 */
  resolved: number;
  /** 営業日カレンダーの外にあって反応日を決められなかった開示の数。 */
  unresolved: number;
  /** 除外対象になった (code, 日) の総数。 */
  markedDates: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{2}:\d{2}:\d{2}$/;

export function buildEarningsEventDates(input: {
  disclosures: readonly EarningsDisclosure[];
  /** 昇順の営業日。価格保存庫の取り込み済み日付を渡す。 */
  tradingDates: readonly string[];
  /** 開示当日も除外するか。既定 true。 */
  includeDisclosureDay?: boolean;
}): EarningsEventDatesResult {
  const includeDisclosureDay = input.includeDisclosureDay ?? true;
  const tradingDaySet = new Set(input.tradingDates);
  const byCode = new Map<string, Set<string>>();
  let resolved = 0;
  let unresolved = 0;

  const mark = (code: string, date: string): void => {
    const dates = byCode.get(code) ?? new Set<string>();
    dates.add(date);
    byCode.set(code, dates);
  };

  for (const disclosure of input.disclosures) {
    const code = disclosure.code.trim().toUpperCase();
    if (code === "") continue;
    if (!ISO_DATE.test(disclosure.disclosedDate)) {
      throw new Error(`disclosedDate must be YYYY-MM-DD: ${disclosure.disclosedDate}`);
    }
    if (!ISO_TIME.test(disclosure.disclosedTime)) {
      throw new Error(
        `disclosedTime must be HH:MM:SS: ${disclosure.disclosedTime}`
        + `（${code} / ${disclosure.disclosedDate}）`,
      );
    }

    const reaction = resolveReactionDate({
      publishedAt: `${disclosure.disclosedDate}T${disclosure.disclosedTime}+09:00`,
      tradingDates: input.tradingDates,
    });
    if (!reaction) {
      // カレンダーの外。**黙って捨てない。** 数えて呼び出し側に見せる。
      unresolved += 1;
      continue;
    }
    resolved += 1;
    mark(code, reaction.reactionDate);
    if (includeDisclosureDay && tradingDaySet.has(disclosure.disclosedDate)) {
      mark(code, disclosure.disclosedDate);
    }
  }

  let markedDates = 0;
  for (const dates of byCode.values()) markedDates += dates.size;
  return { byCode, resolved, unresolved, markedDates };
}
