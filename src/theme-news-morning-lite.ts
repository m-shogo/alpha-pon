// AI・半導体・宇宙・ゲーム業界ニュースのMorning Lite。scan:world後の world_events_latest.json を短く通知する。

import { readFileSync } from "fs";
import { todayJst } from "./date.js";
import { freshnessOf } from "./data-freshness.js";
import { recordEventNotification, shouldSendEventNotification } from "./notification-dedupe.js";
import { sendPipelineSummaryNotification } from "./notify.js";

type WorldEvent = {
  title: string;
  source?: string;
  publishedAt?: string;
  totalImpactScore?: number;
  sourceReliability?: string;
  verificationStatus?: string;
  misinformationRisk?: string;
  impacts?: Array<{
    category?: string;
    impactedTags?: string[];
    matchedKeywords?: string[];
    watchQuestions?: string[];
    primaryChecks?: string[];
  }>;
};

type Theme = "ai" | "semiconductor" | "space" | "game";

const THEME: Record<Theme, { title: string; keywords: string[]; tags: string[]; category?: string }> = {
  ai: { title: "🤖 AIニュース", category: "ai_compute", keywords: ["AI", "OpenAI", "Anthropic", "NVIDIA", "compute", "GPU", "生成AI"], tags: ["ai", "ai_ipo", "software", "cloud"] },
  semiconductor: { title: "🔧 半導体ニュース", keywords: ["semiconductor", "chip", "GPU", "NAND", "HBM", "半導体", "メモリ"], tags: ["semiconductor", "memory", "datacenter"] },
  space: { title: "🚀 宇宙ニュース", category: "space_connectivity", keywords: ["space", "satellite", "SpaceX", "Starlink", "rocket", "宇宙", "衛星"], tags: ["space", "satellite", "telecom", "defense"] },
  game: { title: "🎮 ゲーム業界ニュース", keywords: ["Nintendo", "Sony", "PlayStation", "Xbox", "Steam", "Roblox", "Unity", "Unreal", "game", "gaming", "任天堂", "ソニー", "ゲーム"], tags: ["game", "gaming", "consumer", "software", "ip"] },
};

function textOf(event: WorldEvent): string {
  return [event.title, ...(event.impacts ?? []).flatMap(i => [...(i.impactedTags ?? []), ...(i.matchedKeywords ?? [])])].join(" ");
}

function matches(event: WorldEvent, theme: Theme): boolean {
  const rule = THEME[theme];
  const text = textOf(event).toLowerCase();
  return (event.impacts ?? []).some(i =>
    (rule.category != null && i.category === rule.category) ||
    (i.impactedTags ?? []).some(tag => rule.tags.includes(tag)) ||
    (i.matchedKeywords ?? []).some(keyword => rule.keywords.some(k => keyword.toLowerCase().includes(k.toLowerCase())))
  ) || rule.keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

function firstImpact(event: WorldEvent) {
  return event.impacts?.[0];
}

async function main(): Promise<void> {
  const theme = (process.argv[2] ?? "ai") as Theme;
  const rule = THEME[theme];
  if (!rule) throw new Error(`unknown theme: ${theme}`);
  const path = "reports/world_events_latest.json";
  const freshness = freshnessOf(path, "world_events_latest.json");
  if (!freshness.isFreshToday) {
    console.log(`鮮度不足のため${rule.title}をスキップ: ${freshness.reason}`);
    return;
  }

  const events = JSON.parse(readFileSync(path, "utf-8")) as WorldEvent[];
  const items = events
    .filter(event => matches(event, theme))
    .sort((a, b) => (b.totalImpactScore ?? 0) - (a.totalImpactScore ?? 0))
    .filter(event => shouldSendEventNotification({ scope: theme, title: event.title, source: event.source }))
    .slice(0, 2);

  if (items.length === 0) {
    console.log(`${rule.title} 重複除外後の通知対象なし`);
    return;
  }

  const text = [
    `${rule.title} Lite ${todayJst()}`,
    "本当に重要そうなものだけ / 売買推奨なし",
    "",
    ...items.flatMap(event => {
      const impact = firstImpact(event);
      return [
        `・${event.title}`,
        `  区分: ${event.verificationStatus ?? "unknown"} / ${event.sourceReliability ?? "unknown"}`,
        `  なぜ重要: ${impact?.watchQuestions?.[0] ?? "関連テーマへの実需接続を確認"}`,
        `  次に確認: ${impact?.primaryChecks?.[0] ?? "公式発表・主要企業決算・規制動向"}`,
      ];
    }),
    "",
    "※報道・噂は確認状態を分け、一次情報で裏取りできるまで仮説扱い。",
  ].join("\n");

  console.log(text);
  await sendPipelineSummaryNotification(text);
  items.forEach(event => recordEventNotification({ scope: theme, title: event.title, source: event.source, preview: event.title }));
}

main().catch(err => {
  console.error("theme-news-morning-lite failed:", err);
  process.exit(1);
});
