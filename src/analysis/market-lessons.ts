export type MarketLessonDirection = "up" | "down" | "volatile";

export type MarketLessonContext = {
  macroBackdrop: string[];
  policyBackdrop: string[];
  geopoliticalBackdrop: string[];
  socialBackdrop: string[];
  marketStructure: string[];
  transmissionPath: string[];
  whyItMoved: string;
  whyItCouldInvert: string[];
  modernConditionsToCompare: string[];
};

export type MarketLesson = {
  id: string;
  title: string;
  period: string;
  direction: MarketLessonDirection;
  category: string;
  affectedTags: string[];
  shortSummary: string;
  chain: string[];
  coreMechanism: string;
  earlySignals: string[];
  wrongTakeaways: string[];
  usefulTakeaways: string[];
  modernAnalogyQuestions: string[];
  primaryChecks: string[];
  sourceHints: string[];
  context?: MarketLessonContext;
};

export type LessonMatch = {
  lesson: MarketLesson;
  matchedTags: string[];
  score: number;
  why: string[];
};

export const MARKET_LESSONS: MarketLesson[] = [
  {
    id: "subprime-lehman-2008",
    title: "サブプライム/リーマンショック：信用不安が全市場へ伝播",
    period: "2007-2009",
    direction: "down",
    category: "credit_crisis",
    affectedTags: ["finance", "bank", "real_estate", "credit", "macro", "risk_off", "leverage"],
    shortSummary: "住宅ローンの劣化、証券化商品、過剰レバレッジ、短期資金調達への依存が連鎖し、信用市場の凍結と株式市場の急落につながった。",
    chain: [
      "住宅価格上昇を前提にしたローンが増える",
      "証券化でリスクが見えにくくなる",
      "格下げ・損失認識で信頼が崩れる",
      "短期資金市場が詰まり、金融機関の破綻不安が広がる",
      "銀行株だけでなく、景気敏感・消費・資源まで売られる",
    ],
    coreMechanism: "信用は一度壊れると、悪い資産の額だけでなく『誰がどれだけ持っているかわからない』不透明性で市場全体へ伝播する。",
    earlySignals: ["信用スプレッド拡大", "短期資金調達の悪化", "住宅関連延滞率上昇", "金融機関の評価損", "格付け引き下げ"],
    wrongTakeaways: ["大手金融機関なら必ず助かる", "PERが安いから安全", "不動産価格は全国的には下がらない"],
    usefulTakeaways: ["レバレッジと流動性を最優先で見る", "資金調達構造を見る", "見えない損失がある業界は一段厳しく見る"],
    modernAnalogyQuestions: ["今の資産価格は低金利前提で膨らんでいないか？", "金利上昇で含み損が出る構造はないか？", "誰が最終リスクを持っているか見えるか？"],
    primaryChecks: ["金利", "信用スプレッド", "不動産価格", "銀行の含み損", "資金調達コスト", "自己資本比率"],
    sourceHints: ["Lehman bankruptcy", "2008 financial crisis", "subprime mortgage crisis"],
  }
];

export function matchMarketLessons(input: { tags: string[]; text?: string }): LessonMatch[] {
  const tags = new Set(input.tags.map(tag => tag.toLowerCase()));
  const text = (input.text ?? "").toLowerCase();

  return MARKET_LESSONS
    .map(lesson => {
      const matchedTags = lesson.affectedTags.filter(tag => tags.has(tag.toLowerCase()) || text.includes(tag.toLowerCase()));
      const textHits = [lesson.category, lesson.title, lesson.shortSummary]
        .filter(value => text.includes(value.toLowerCase())).length;
      const score = matchedTags.length * 12 + textHits * 10;
      const why = [
        ...matchedTags.map(tag => `tag:${tag}`),
        ...(textHits > 0 ? ["text similarity"] : []),
      ];
      return { lesson, matchedTags, score, why } satisfies LessonMatch;
    })
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function renderMarketLessonMarkdown(matches: LessonMatch[]): string {
  const lines: string[] = [];
  for (const match of matches) {
    const lesson = match.lesson;
    lines.push(`## ${lesson.title}`);
    lines.push("");
    lines.push(`- Period: ${lesson.period}`);
    lines.push(`- Direction: ${lesson.direction}`);
    lines.push(`- Category: ${lesson.category}`);
    lines.push(`- Match score: ${match.score}`);
    lines.push(`- Matched tags: ${match.matchedTags.join(", ") || "-"}`);
    lines.push("");
    lines.push(lesson.shortSummary);
    lines.push("");
    lines.push("### 連鎖");
    lesson.chain.forEach(item => lines.push(`- ${item}`));
    lines.push("");
    if (lesson.context) {
      lines.push("### 当時の情勢・地政学・政策背景");
      lines.push(`- なぜ動いたか: ${lesson.context.whyItMoved}`);
      lesson.context.macroBackdrop.forEach(item => lines.push(`- マクロ: ${item}`));
      lesson.context.policyBackdrop.forEach(item => lines.push(`- 政策: ${item}`));
      lesson.context.geopoliticalBackdrop.forEach(item => lines.push(`- 地政学: ${item}`));
      lesson.context.marketStructure.forEach(item => lines.push(`- 市場構造: ${item}`));
      lines.push("");
    }
    lines.push("### 使える教訓");
    lesson.usefulTakeaways.forEach(item => lines.push(`- ${item}`));
    lines.push("");
    lines.push("### 現代に当てはめる質問");
    lesson.modernAnalogyQuestions.forEach(item => lines.push(`- ${item}`));
    lines.push("");
  }
  return lines.join("\n");
}
