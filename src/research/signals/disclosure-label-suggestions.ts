/**
 * 価格イベント候補に、その日の TDnet 開示を突き合わせてラベルを**提案**する。
 *
 * ## 提案までしかしない
 *
 * `event-labels.ts` は「記憶や推測でラベルを付けさせない」ために一次情報の
 * URL を必須にしている。ここが自動でラベルを確定させると、その原則が
 * 見出しの単語一致に置き換わる。
 *
 * とくに危ういのが **misconduct と earnings の切り分け**。
 * 「不適切な会計処理」は不祥事でもあり業績要因でもある。ここを取り違えると
 * treatment と対照が混ざり、差が測れなくなる。単語では決められない。
 *
 * だから返すのは「候補となる開示」と「そう見える理由」まで。
 * 確定は人（または内容まで読む工程）が行い、`labelledBy` に誰が付けたかを残す。
 *
 * ## 時刻の扱い
 *
 * 引け後に出た開示は**翌営業日**の価格に出る。反応日 D の候補に対しては
 *   - D の引けまでに出た開示
 *   - D-1 の引け後に出た開示
 * を対象にする。ここを雑にすると、事件の翌日の値動きを事件当日と数えたり、
 * まだ公になっていない開示を原因として結び付けたりする。
 */

import { jquantsTradingDayCloseJst } from "../providers/jquants-free.js";
import { compareExplicitIso8601Instants } from "../iso-instant.js";
import type { LabelEvidence } from "./label-evidence.js";
import type { EventCauseLabel } from "./event-labels.js";

export interface DisclosureLabelRule {
  label: EventCauseLabel;
  /**
   * 見出しにこのいずれかが含まれること。
   *
   * TDnet の適時開示にしか効かない。**EDINET の `docDescription` は
   * 「臨時報告書」だけ**で記述が無いため、見出しでは判定できない。
   * EDINET は `reasonCodes` で判定する。
   */
  keywords: readonly string[];
  /**
   * EDINET 臨時報告書の事由コードがこのいずれかに完全一致すること。
   *
   * 条文を読んで決めたのではなく、TDnet の見出しと1対1で対応した130組から
   * **観測した**対応（`docs/reference/edinet-reason-codes-2026-09-11.md`）。
   * 観測が曖昧なコード（12号・19号＝財政状態への影響、9号＝代表者異動）は
   * **載せない。** 分からないものを分類しない。
   */
  reasonCodes?: readonly string[];
  /**
   * さらに、見出しにこのいずれかが含まれること。
   *
   * 単語1つでは広すぎる分類のための共起条件。実測（2026-09-11、29営業日）で
   * 「子会社」だけを見ると359件当たったが、中身は
   * 「子会社取締役へのストック・オプション」「国内子会社設立」といった
   * 通常の企業活動が大半で、探している「子会社に限定された問題」ではなかった。
   */
  requireAlso?: readonly string[];
  /** なぜそう見えるかの一言。提案の rationale に入る。 */
  rationale: string;
}

/**
 * 見出しの単語だけで決められるものは少ない。ここにあるのは
 * 「人が最初に見るべき順序」であって、分類器ではない。
 *
 * 上にあるものほど強い手がかり。最初に当たったものを提案する。
 *
 * 事由コードは EDINET 用。実測で観測が明確だったものだけを載せている。
 */
export const DISCLOSURE_LABEL_RULES: readonly DisclosureLabelRule[] = [
  {
    label: "misconduct",
    keywords: ["第三者委員会", "特別調査委員会", "独立調査委員会", "調査委員会", "社内調査委員会"],
    rationale: "調査委員会の設置・報告は不祥事の一次シグナル",
  },
  {
    label: "misconduct",
    keywords: ["不正アクセス", "ランサムウェア", "情報流出", "個人情報の漏えい", "不正流出"],
    rationale: "情報セキュリティ事故。業績と直接は結び付かない",
  },
  {
    label: "misconduct",
    keywords: ["不適切", "不正会計", "架空", "横領", "改ざん", "偽装", "虚偽記載", "循環取引"],
    rationale: "不適切行為の公表。ただし業績起因との切り分けは見出しでは決まらない",
  },
  {
    label: "regulatory_or_litigation",
    keywords: ["行政処分", "業務停止", "課徴金", "勧告", "訴訟", "提訴", "損害賠償請求"],
    // 実測: 6号 → 「当社に対する訴訟の提起」「和解による損害賠償請求訴訟の解決」
    reasonCodes: ["第19条第2項第6号"],
    rationale: "規制・訴訟",
  },
  {
    label: "subsidiary_localized",
    keywords: ["子会社", "孫会社", "関連会社", "持分法適用会社"],
    // 「子会社」単独では通常の企業活動（設立・人事・組織再編）を大量に拾う。
    // 問題が起きたことを示す語との共起を要求する。
    requireAlso: [
      "不正", "不適切", "調査", "訴訟", "損失", "減損", "特別損失",
      "事故", "火災", "操業停止", "破産", "民事再生", "解散", "債務超過",
      "業績予想", "情報流出", "不祥事",
    ],
    rationale: "子会社で問題が起きた可能性。本体への波及範囲は本文を読まないと決まらない",
  },
  {
    label: "earnings",
    keywords: ["業績予想の修正", "下方修正", "上方修正", "決算短信", "四半期報告書"],
    rationale: "業績起因",
  },
  {
    label: "equity_offering",
    keywords: ["公募増資", "第三者割当", "新株式発行", "転換社債", "行使価額修正"],
    // 実測: 2号の2 → 「譲渡制限付株式としての自己株式の処分」「株式報酬型ストックオプション」
    reasonCodes: ["第19条第2項第2号の2"],
    rationale: "資本政策",
  },
  {
    label: "corporate_action",
    keywords: ["公開買付", "TOB", "MBO", "株式交換", "吸収合併", "会社分割", "スピンオフ"],
    // 実測で観測した対応:
    //   3号    → 子会社の異動（取得・譲渡・公開買付の結果）
    //   4号    → 主要株主の異動
    //   6号の2 → 株式交換・完全子会社化
    //   7号    → 会社分割（吸収分割）
    //   8号の2 → 株式の取得（子会社化）
    //
    // 3号は「子会社の異動」だが、中身は通常の M&A。
    // `subsidiary_localized`（子会社に限定された**問題**）とは別物なので
    // そちらへは寄せない。
    reasonCodes: [
      "第19条第2項第3号",
      "第19条第2項第4号",
      "第19条第2項第6号の2",
      "第19条第2項第7号",
      "第19条第2項第8号の2",
    ],
    rationale: "M&A・再編・資本構成の異動",
  },
];

export interface DisclosureMatch {
  evidence: LabelEvidence;
  /** 反応日から見て、その開示が引け前か引け後か。 */
  timing: "before_close" | "after_previous_close";
  matchedRule?: DisclosureLabelRule;
  matchedKeywords: string[];
}

export interface LabelSuggestion {
  candidateId: string;
  code: string;
  /** 価格が動いた営業日。 */
  date: string;
  /** 提案するラベル。**確定ではない。** 一致した開示が無ければ null。 */
  suggestedLabel: EventCauseLabel | null;
  /** 提案の根拠にした開示（時系列順）。 */
  matches: DisclosureMatch[];
  /** 一次情報の URL。`EventLabelInput.evidenceUrls` にそのまま渡せる。 */
  evidenceUrls: string[];
  /** なぜそう見えるか。人が確認するための手がかり。 */
  rationale: string;
  /**
   * 複数のルールに当たったか。当たっているときは単語では決まらないので、
   * 本文を読むまで確定させない。
   */
  conflicting: boolean;
}

/**
 * 見出しに当たるルールを返す。無ければ null。
 *
 * 提案でも下見でも同じ判定を使う。書き直すと共起条件が片方だけに入る。
 */
export function matchRuleForTitle(title: string): DisclosureLabelRule | null {
  return matchRule({ title, reasonCode: null })?.rule ?? null;
}

/** EDINET の事由コードで当たるルール。完全一致のみ。 */
export function matchRuleForReasonCode(reasonCode: string | null): DisclosureLabelRule | null {
  return matchRule({ title: "", reasonCode })?.rule ?? null;
}

function matchRule(
  input: { title: string; reasonCode: string | null },
): { rule: DisclosureLabelRule; keywords: string[] } | null {
  // 事由コードが先。EDINET の見出しは「臨時報告書」だけで判定材料が無く、
  // 構造化されたコードのほうが確か。
  const codes = input.reasonCode === null
    ? []
    : input.reasonCode.split(",").map((one) => one.trim()).filter(Boolean);
  if (codes.length > 0) {
    for (const rule of DISCLOSURE_LABEL_RULES) {
      if (!rule.reasonCodes) continue;
      const matched = codes.filter((code) => rule.reasonCodes!.includes(code));
      if (matched.length > 0) return { rule, keywords: matched };
    }
  }

  if (!input.title) return null;
  for (const rule of DISCLOSURE_LABEL_RULES) {
    const keywords = rule.keywords.filter((keyword) => input.title.includes(keyword));
    if (keywords.length === 0) continue;
    if (rule.requireAlso) {
      const also = rule.requireAlso.filter((keyword) => input.title.includes(keyword));
      if (also.length === 0) continue;
      return { rule, keywords: [...keywords, ...also] };
    }
    return { rule, keywords };
  }
  return null;
}

function previousDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/**
 * 反応日 `date` の価格イベントに結び付く証拠を選ぶ。
 *
 * `evidence` は TDnet でも EDINET でもよい（`label-evidence.ts` でそろえる）。
 * 同じ銘柄のものだけを渡すこと（呼び出し側で絞る）。
 */
export function matchDisclosuresToEvent(input: {
  /** 価格ストアと同じ5桁コード。 */
  code: string;
  date: string;
  evidence: readonly LabelEvidence[];
}): DisclosureMatch[] {
  const closeAt = jquantsTradingDayCloseJst(input.date);
  const previousCloseAt = jquantsTradingDayCloseJst(previousDate(input.date));
  const matches: DisclosureMatch[] = [];

  for (const evidence of input.evidence) {
    if (evidence.code !== input.code) continue;
    // 公表時刻の無い行（TDnet の取り下げ、EDINET の時刻欠落）は
    // 時刻で結び付けられない。推測で当日扱いにしない。
    if (!evidence.publishedAt) continue;

    const beforeClose =
      compareExplicitIso8601Instants(evidence.publishedAt, closeAt, "publishedAt", "close") <= 0;
    const afterPreviousClose =
      compareExplicitIso8601Instants(evidence.publishedAt, previousCloseAt, "publishedAt", "previousClose") > 0;

    if (!beforeClose || !afterPreviousClose) continue;

    const observationClose = jquantsTradingDayCloseJst(evidence.observationDate);
    const timing =
      compareExplicitIso8601Instants(evidence.publishedAt, observationClose, "publishedAt", "observationClose") > 0
        ? "after_previous_close" as const
        : "before_close" as const;

    const matched = matchRule({ title: evidence.title, reasonCode: evidence.reasonCode });
    matches.push({
      evidence,
      timing,
      ...(matched ? { matchedRule: matched.rule } : {}),
      matchedKeywords: matched?.keywords ?? [],
    });
  }

  matches.sort((left, right) =>
    left.evidence.publishedAt!.localeCompare(right.evidence.publishedAt!));
  return matches;
}

/** 候補1件ぶんのラベル提案を作る。確定はしない。 */
export function suggestLabel(input: {
  candidateId: string;
  /** 価格ストアと同じ5桁コード。 */
  code: string;
  date: string;
  evidence: readonly LabelEvidence[];
}): LabelSuggestion {
  const matches = matchDisclosuresToEvent(input);
  const ruled = matches.filter((match) => match.matchedRule !== undefined);
  const labels = new Set(ruled.map((match) => match.matchedRule!.label));
  const conflicting = labels.size > 1;

  // 一致が1種類のときだけ提案する。複数当たっているなら単語では決まらない。
  const suggestedLabel = labels.size === 1 ? [...labels][0]! : null;

  const rationale = ruled.length === 0
    ? matches.length === 0
      ? "対応する開示が見つからなかった。保存庫の期間外か、開示を伴わない値動き"
      : "開示はあるがルールに当たらなかった。見出しからは原因を決められない"
    : conflicting
      ? `複数の分類に当たった（${[...labels].join(" / ")}）。本文を読むまで確定しない`
      : ruled.map((match) => `${match.matchedRule!.rationale}（${match.matchedKeywords.join("・")}）`)
          .filter((value, index, all) => all.indexOf(value) === index)
          .join(" / ");

  return {
    candidateId: input.candidateId,
    code: input.code,
    date: input.date,
    suggestedLabel,
    matches,
    // 証拠は当たった開示だけでなく、その日に見えた開示すべてを残す。
    // 「何を見て分からなかったか」も記録として要る。
    evidenceUrls: matches
      .map((match) => match.evidence.url)
      .filter((url): url is string => Boolean(url)),
    rationale,
    conflicting,
  };
}
