export type StructuralScoreDetail = {
  score: number;
  reasons: string[];
  nextSteps: string[];
};

const keywordScores: Record<string, number> = {
  パーシャルスピンオフ: 15,
  スピンオフ: 15,
  会社分割: 10,
  吸収分割: 10,
  新設分割: 10,
  子会社株式の譲渡: 10,
  上場準備: 12,
  新規上場申請: 12,
  事業ポートフォリオ: 5,
  MBO: 12,
  TOB: 10,
};

export function scoreStructuralEvent(text: string): StructuralScoreDetail {
  let score = 0;
  const reasons: string[] = [];

  for (const [keyword, point] of Object.entries(keywordScores)) {
    if (text.includes(keyword)) {
      score += point;
      reasons.push(`構造イベント検出: 「${keyword}」`);
    }
  }

  const nextSteps = [
    "開示文書の全文確認（TDnet / EDINET）",
    "スピンオフ先の事業価値の試算",
    "対象会社の財務サマリー確認",
    "類似事例の株価反応リサーチ",
  ];

  return { score: Math.min(score, 30), reasons, nextSteps };
}
