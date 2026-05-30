import type { ClassifiedWorldEvent, SourceReliability, VerificationStatus, WorldEventCategory } from "./world-event-map.js";

export type WorldEventClusterConfirmation = "confirmed" | "developing" | "unverified";

export type WorldEventCluster = {
  schemaVersion: 1;
  clusterId: string;
  title: string;
  articleCount: number;
  sources: string[];
  urls: string[];
  categories: WorldEventCategory[];
  impactedTags: string[];
  officialCount: number;
  tier1Count: number;
  tier2Count: number;
  socialCount: number;
  unknownCount: number;
  unverifiedCount: number;
  confirmationLevel: WorldEventClusterConfirmation;
  misinformationRisk: "low" | "medium" | "high";
  urgencyScore: number;
  totalImpactScore: number;
  representative: ClassifiedWorldEvent;
  events: ClassifiedWorldEvent[];
};

type ReliabilityCounts = Record<SourceReliability, number>;
type VerificationCounts = Record<VerificationStatus, number>;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "from", "as", "at", "is", "are", "was", "were",
  "after", "before", "over", "under", "new", "latest", "update", "breaking", "says", "said", "report", "reports", "news",
  "が", "は", "を", "に", "で", "と", "の", "する", "した", "最新", "速報", "発表", "報道",
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(event: ClassifiedWorldEvent): string[] {
  const text = normalizeText(`${event.title} ${event.snippet ?? ""}`);
  const words = text
    .split(" ")
    .map(word => word.trim())
    .filter(word => word.length >= 2 && !STOP_WORDS.has(word));
  const impactWords = event.impacts.flatMap(impact => [...impact.matchedKeywords, ...impact.impactedTags, impact.category]);
  return [...new Set([...words, ...impactWords.map(normalizeText).filter(Boolean)])].slice(0, 80);
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const union = new Set([...sa, ...sb]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const value of sa) if (sb.has(value)) intersection += 1;
  return intersection / union.size;
}

function sharesCategoryAndKeywords(a: ClassifiedWorldEvent, b: ClassifiedWorldEvent): boolean {
  const aCategories = new Set(a.impacts.map(impact => impact.category));
  const bCategories = new Set(b.impacts.map(impact => impact.category));
  const sharedCategory = [...aCategories].some(category => bCategories.has(category));
  if (!sharedCategory) return false;

  const aKeywords = new Set(a.impacts.flatMap(impact => impact.matchedKeywords.map(normalizeText)));
  const bKeywords = new Set(b.impacts.flatMap(impact => impact.matchedKeywords.map(normalizeText)));
  let sharedKeywords = 0;
  for (const keyword of aKeywords) if (bKeywords.has(keyword)) sharedKeywords += 1;
  return sharedKeywords >= 2;
}

function shouldJoinCluster(event: ClassifiedWorldEvent, cluster: ClassifiedWorldEvent[]): boolean {
  const eventTokens = tokenize(event);
  return cluster.some(existing => {
    const similarity = jaccard(eventTokens, tokenize(existing));
    return similarity >= 0.34 || sharesCategoryAndKeywords(event, existing);
  });
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function reliabilityCounts(events: ClassifiedWorldEvent[]): ReliabilityCounts {
  return {
    official: events.filter(event => event.sourceReliability === "official").length,
    tier1: events.filter(event => event.sourceReliability === "tier1").length,
    tier2: events.filter(event => event.sourceReliability === "tier2").length,
    social: events.filter(event => event.sourceReliability === "social").length,
    unknown: events.filter(event => event.sourceReliability === "unknown").length,
  };
}

function verificationCounts(events: ClassifiedWorldEvent[]): VerificationCounts {
  return {
    confirmed: events.filter(event => event.verificationStatus === "confirmed").length,
    developing: events.filter(event => event.verificationStatus === "developing").length,
    unverified: events.filter(event => event.verificationStatus === "unverified").length,
  };
}

function confirmationLevel(counts: ReliabilityCounts, verifications: VerificationCounts): WorldEventClusterConfirmation {
  if (counts.official > 0 || (counts.tier1 >= 2 && verifications.unverified === 0)) return "confirmed";
  if (counts.tier1 > 0 || counts.tier2 >= 2) return "developing";
  return "unverified";
}

function clusterRisk(counts: ReliabilityCounts, verifications: VerificationCounts, confirmation: WorldEventClusterConfirmation): "low" | "medium" | "high" {
  if (confirmation === "confirmed" && counts.social === 0 && verifications.unverified === 0) return "low";
  if (confirmation === "unverified" || counts.social > 0 || verifications.unverified > 0) return "high";
  return "medium";
}

function clusterIdFromRepresentative(event: ClassifiedWorldEvent, index: number): string {
  const title = normalizeText(event.title).replace(/\s+/g, "-").slice(0, 80);
  return `world-cluster-${String(index + 1).padStart(3, "0")}-${title || "event"}`;
}

function buildCluster(events: ClassifiedWorldEvent[], index: number): WorldEventCluster {
  const sorted = [...events].sort((a, b) => b.urgencyScore - a.urgencyScore || b.totalImpactScore - a.totalImpactScore);
  const representative = sorted[0]!;
  const counts = reliabilityCounts(sorted);
  const verifications = verificationCounts(sorted);
  const confirmation = confirmationLevel(counts, verifications);
  const misinformationRisk = clusterRisk(counts, verifications, confirmation);

  return {
    schemaVersion: 1,
    clusterId: clusterIdFromRepresentative(representative, index),
    title: representative.title,
    articleCount: sorted.length,
    sources: unique(sorted.map(event => event.source).filter((source): source is string => Boolean(source))),
    urls: unique(sorted.map(event => event.url).filter(Boolean)),
    categories: unique(sorted.flatMap(event => event.impacts.map(impact => impact.category))),
    impactedTags: unique(sorted.flatMap(event => event.impacts.flatMap(impact => impact.impactedTags))),
    officialCount: counts.official,
    tier1Count: counts.tier1,
    tier2Count: counts.tier2,
    socialCount: counts.social,
    unknownCount: counts.unknown,
    unverifiedCount: verifications.unverified,
    confirmationLevel: confirmation,
    misinformationRisk,
    urgencyScore: Math.max(...sorted.map(event => event.urgencyScore)),
    totalImpactScore: Math.max(...sorted.map(event => event.totalImpactScore)),
    representative,
    events: sorted,
  };
}

export function buildWorldEventClusters(events: ClassifiedWorldEvent[]): WorldEventCluster[] {
  const important = events
    .filter(event => event.totalImpactScore > 0)
    .sort((a, b) => b.urgencyScore - a.urgencyScore || b.totalImpactScore - a.totalImpactScore);
  const rawClusters: ClassifiedWorldEvent[][] = [];

  for (const event of important) {
    const cluster = rawClusters.find(candidate => shouldJoinCluster(event, candidate));
    if (cluster) cluster.push(event);
    else rawClusters.push([event]);
  }

  return rawClusters
    .map(buildCluster)
    .sort((a, b) => b.urgencyScore - a.urgencyScore || b.articleCount - a.articleCount);
}

export function reflectionCandidateEventsFromClusters(clusters: WorldEventCluster[]): ClassifiedWorldEvent[] {
  return clusters
    .filter(cluster => cluster.confirmationLevel !== "unverified")
    .filter(cluster => cluster.misinformationRisk !== "high")
    .map(cluster => cluster.representative);
}

export function renderWorldEventClusterMarkdown(date: string, clusters: WorldEventCluster[]): string {
  const lines: string[] = [];
  lines.push("# alpha-pon 世界イベント・クラスターレポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> 同じ事件を複数記事として扱わないためのクラスタリング結果です。買い推奨ではありません。");
  lines.push("");
  lines.push("## サマリー");
  lines.push("");
  lines.push(`- クラスタ数: ${clusters.length}`);
  lines.push(`- confirmed: ${clusters.filter(c => c.confirmationLevel === "confirmed").length}`);
  lines.push(`- developing: ${clusters.filter(c => c.confirmationLevel === "developing").length}`);
  lines.push(`- unverified: ${clusters.filter(c => c.confirmationLevel === "unverified").length}`);
  lines.push(`- high risk: ${clusters.filter(c => c.misinformationRisk === "high").length}`);
  lines.push("");

  lines.push("## クラスタ一覧");
  lines.push("");
  lines.push("| cluster | 記事件数 | 確認 | 誤報リスク | official | tier1 | tier2 | social | unknown | tags |");
  lines.push("|---------|----------|------|------------|----------|-------|-------|--------|---------|------|");
  for (const cluster of clusters.slice(0, 50)) {
    lines.push(`| ${cluster.title} | ${cluster.articleCount} | ${cluster.confirmationLevel} | ${cluster.misinformationRisk} | ${cluster.officialCount} | ${cluster.tier1Count} | ${cluster.tier2Count} | ${cluster.socialCount} | ${cluster.unknownCount} | ${cluster.impactedTags.slice(0, 8).join(", ")} |`);
  }
  lines.push("");

  for (const cluster of clusters.slice(0, 20)) {
    lines.push(`## ${cluster.title}`);
    lines.push("");
    lines.push(`- confirmation: ${cluster.confirmationLevel}`);
    lines.push(`- misinformationRisk: ${cluster.misinformationRisk}`);
    lines.push(`- sources: ${cluster.sources.slice(0, 8).join(" / ") || "-"}`);
    lines.push(`- categories: ${cluster.categories.join(", ") || "-"}`);
    lines.push(`- impactedTags: ${cluster.impactedTags.slice(0, 12).join(", ") || "-"}`);
    lines.push("- articles:");
    for (const event of cluster.events.slice(0, 6)) {
      lines.push(`  - [${event.sourceReliability}/${event.verificationStatus}/${event.misinformationRisk}] ${event.title}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`*alpha-pon world event clusters | ${date}*`);
  return lines.join("\n");
}
