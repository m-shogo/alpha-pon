// 世界情勢 → テーマ → 候補企業 → 仮説 → 次に確認する一次情報、のUI用JSONを作る。
// 買い推奨・株価予想ではなく、理由付きの調査候補を後で答え合わせするためのデータ。

type WorldEventImpactForHypothesis = {
  category?: string;
  impactedTags?: string[];
  possibleBeneficiaries?: string[];
  possibleRisks?: string[];
  watchQuestions?: string[];
  primaryChecks?: string[];
};

export type WorldEventForHypothesis = {
  title: string;
  source?: string;
  publishedAt?: string;
  totalImpactScore?: number;
  impacts?: WorldEventImpactForHypothesis[];
};

export type PersonalPriorityWatchForHypothesis = {
  code: string;
  name: string;
  category?: string;
  reasonSummary?: string;
  nextCheck?: string;
};

export type PersonalWatchlistForHypothesis = {
  priorityWatches?: PersonalPriorityWatchForHypothesis[];
};

export type WorldThemeCandidateHypothesis = {
  sourceEventTitle: string;
  sourceEventPublishedAt: string | null;
  theme: string;
  candidateCode: string;
  candidateCompany: string;
  whyThisCompany: string;
  upsideHypothesis: string;
  downsideRisk: string;
  nextPrimaryCheck: string;
  reviewAfterDays: [30, 90, 180];
  disclaimer: string;
};

const BUILTIN_THEME_COMPANIES: Record<string, Array<{ code: string; name: string; why: string }>> = {
  space_connectivity: [
    { code: "7011", name: "三菱重工業", why: "宇宙・防衛・打上げ関連の実需接続を確認しやすい大型候補。" },
    { code: "9348", name: "ispace", why: "宇宙テーマへの関心は高いが、資金調達と売上化の確認が必須。" },
  ],
  ai_compute: [
    { code: "6857", name: "アドバンテスト", why: "AI半導体検査需要との接続を確認しやすい。" },
    { code: "8035", name: "東京エレクトロン", why: "AI設備投資とWFEサイクルの代表候補。" },
  ],
  trade_supply_chain: [
    { code: "8035", name: "東京エレクトロン", why: "輸出規制・供給網再編が半導体装置需要に影響しやすい。" },
  ],
  energy_security: [
    { code: "7011", name: "三菱重工業", why: "エネルギー安全保障・原子力・重工インフラの確認対象。" },
  ],
};

function includesAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some(word => lower.includes(word.toLowerCase()));
}

function themeLabel(impact: WorldEventImpactForHypothesis): string {
  return impact.category ?? impact.impactedTags?.[0] ?? "unknown_theme";
}

function personalMatches(watch: PersonalPriorityWatchForHypothesis, event: WorldEventForHypothesis, impact: WorldEventImpactForHypothesis): boolean {
  const text = [event.title, impact.category, ...(impact.impactedTags ?? [])].join(" ");
  if (watch.category && includesAny(text, [watch.category])) return true;
  if (watch.code === "7974" && includesAny(text, ["game", "gaming", "Nintendo", "任天堂", "consumer", "software", "ip"])) return true;
  if (watch.code.includes("SPACEX") && includesAny(text, ["space", "satellite", "Starlink", "SpaceX", "宇宙", "衛星"])) return true;
  return false;
}

function downsideRisk(impact: WorldEventImpactForHypothesis): string {
  return impact.possibleRisks?.[0] ?? "テーマが既に織り込まれている、または個別企業の業績に届かない可能性。";
}

function nextPrimaryCheck(impact: WorldEventImpactForHypothesis, fallback?: string): string {
  return impact.primaryChecks?.[0] ?? fallback ?? "公式発表・決算資料・主要顧客動向など一次情報を確認。";
}

function toHypothesis(event: WorldEventForHypothesis, impact: WorldEventImpactForHypothesis, company: { code: string; name: string; why: string; nextCheck?: string }): WorldThemeCandidateHypothesis {
  const theme = themeLabel(impact);
  const question = impact.watchQuestions?.[0] ?? "この情勢変化が企業の実需・受注・利益率に接続するか？";
  return {
    sourceEventTitle: event.title,
    sourceEventPublishedAt: event.publishedAt ?? null,
    theme,
    candidateCode: company.code,
    candidateCompany: company.name,
    whyThisCompany: company.why,
    upsideHypothesis: `${theme} の変化が実需・受注・利益率に届けば、評価される可能性がある調査候補。確認論点: ${question}`,
    downsideRisk: downsideRisk(impact),
    nextPrimaryCheck: nextPrimaryCheck(impact, company.nextCheck),
    reviewAfterDays: [30, 90, 180],
    disclaimer: "買い推奨ではなく、世界情勢から作った調査仮説。一次情報で後日答え合わせする。",
  };
}

export function buildWorldThemeCandidateHypotheses(
  events: WorldEventForHypothesis[],
  personalWatchlist: PersonalWatchlistForHypothesis
): WorldThemeCandidateHypothesis[] {
  const results: WorldThemeCandidateHypothesis[] = [];
  const personal = personalWatchlist.priorityWatches ?? [];

  for (const event of events.sort((a, b) => (b.totalImpactScore ?? 0) - (a.totalImpactScore ?? 0)).slice(0, 12)) {
    for (const impact of event.impacts ?? []) {
      const theme = themeLabel(impact);
      const personalCompanies = personal
        .filter(watch => personalMatches(watch, event, impact))
        .map(watch => ({ code: watch.code, name: watch.name, why: watch.reasonSummary ?? `${watch.name} は個人重点ウォッチ。`, nextCheck: watch.nextCheck }));
      const builtinCompanies = BUILTIN_THEME_COMPANIES[theme] ?? [];
      for (const company of [...personalCompanies, ...builtinCompanies].slice(0, 3)) {
        results.push(toHypothesis(event, impact, company));
      }
    }
  }

  const seen = new Set<string>();
  return results.filter(item => {
    const key = `${item.sourceEventTitle}::${item.theme}::${item.candidateCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}
