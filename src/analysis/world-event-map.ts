export type WorldEventCategory =
  | "global_health"
  | "space_connectivity"
  | "ai_compute"
  | "energy_security"
  | "macro_policy"
  | "election_policy"
  | "trade_supply_chain"
  | "security_resilience"
  | "migration_demographics"
  | "market_psychology"
  | "unknown";

export type WorldEventImpact = {
  category: WorldEventCategory;
  score: number;
  matchedKeywords: string[];
  impactedTags: string[];
  hypothesisClusters: string[];
  possibleBeneficiaries: string[];
  possibleRisks: string[];
  watchQuestions: string[];
  primaryChecks: string[];
};

export type WorldEventArticle = {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  snippet?: string;
};

export type ClassifiedWorldEvent = WorldEventArticle & {
  impacts: WorldEventImpact[];
  totalImpactScore: number;
};

type CategoryRule = {
  category: WorldEventCategory;
  keywords: string[];
  impactedTags: string[];
  hypothesisClusters: string[];
  possibleBeneficiaries: string[];
  possibleRisks: string[];
  watchQuestions: string[];
  primaryChecks: string[];
};

const RULES: CategoryRule[] = [
  {
    category: "global_health",
    keywords: ["who", "public health emergency", "pheic", "emergency declaration", "ebola", "mpox", "pandemic", "outbreak", "vaccine", "感染", "緊急事態", "エボラ", "ワクチン", "感染症"],
    impactedTags: ["healthcare", "pharma", "logistics", "travel", "testing", "vaccine", "risk_off"],
    hypothesisClusters: ["health-security", "security-resilience", "capital-market-psychology"],
    possibleBeneficiaries: ["検査", "ワクチン", "医療機器", "防疫用品", "遠隔医療", "物流管理"],
    possibleRisks: ["渡航制限", "サプライチェーン遅延", "リスクオフ", "医療資源不足", "援助資金不足"],
    watchQuestions: ["感染拡大が国境を越えているか？", "WHO/各国政府の対応予算は増えるか？", "関連企業の売上に実需として届くか？", "市場心理だけで過熱していないか？"],
    primaryChecks: ["WHO statement", "CDC/ECDC updates", "Reuters/AP/BBC", "企業の受注/製品開示", "渡航制限・物流影響"],
  },
  {
    category: "space_connectivity",
    keywords: ["space", "satellite", "starlink", "spacex", "rocket", "launch", "leo", "衛星", "宇宙", "スターリンク", "ロケット", "打ち上げ", "通信衛星"],
    impactedTags: ["space", "satellite", "telecom", "defense", "disaster", "iot", "infrastructure"],
    hypothesisClusters: ["space-connectivity", "security-resilience"],
    possibleBeneficiaries: ["衛星通信", "アンテナ", "地上局", "防災通信", "IoT", "打上げ関連"],
    possibleRisks: ["期待先行", "海外大手との競争", "規制/周波数", "打上げ失敗", "売上化遅延"],
    watchQuestions: ["事件は需要拡大か供給制約か？", "国内企業に受注・提携が来るか？", "防災/安全保障需要につながるか？", "既存通信会社への逆風か追い風か？"],
    primaryChecks: ["会社開示", "政府調達", "通信規制", "打上げスケジュール", "Starlink/競合動向"],
  },
  {
    category: "ai_compute",
    keywords: ["ai", "artificial intelligence", "gpu", "nvidia", "datacenter", "data center", "semiconductor", "chip", "compute", "生成ai", "半導体", "データセンター", "gpu", "計算資源"],
    impactedTags: ["ai", "software", "semiconductor", "datacenter", "power", "cloud", "cooling", "security"],
    hypothesisClusters: ["ai-sovereignty", "energy-transition", "security-resilience"],
    possibleBeneficiaries: ["半導体", "データセンター", "電力設備", "冷却", "クラウド", "セキュリティ", "業務ソフト"],
    possibleRisks: ["設備投資サイクル天井", "電力制約", "輸出規制", "期待先行", "価格競争"],
    watchQuestions: ["AI需要は売上/利益に変換されているか？", "電力・冷却がボトルネックか？", "輸出規制や国産化が追い風/逆風か？", "短期急騰で織り込み済みではないか？"],
    primaryChecks: ["設備投資計画", "データセンター建設", "電力契約", "主要顧客決算", "規制/輸出管理"],
  },
  {
    category: "energy_security",
    keywords: ["oil", "opec", "energy", "lng", "nuclear", "renewable", "grid", "power", "battery", "crude", "石油", "原油", "エネルギー", "電力", "原子力", "再エネ", "蓄電池"],
    impactedTags: ["energy", "oil", "renewable", "nuclear", "battery", "grid", "power", "materials", "ev"],
    hypothesisClusters: ["energy-transition", "security-resilience", "supply-chain"],
    possibleBeneficiaries: ["電力設備", "蓄電池", "原子力関連", "再エネ", "省エネ", "素材", "送電網"],
    possibleRisks: ["資源価格変動", "補助金依存", "設備投資負担", "インフレ", "供給制約"],
    watchQuestions: ["エネルギー価格はコスト増か売上増か？", "電化/AI需要で電力制約が強まるか？", "補助金なしでも利益が出るか？"],
    primaryChecks: ["資源価格", "電力需要見通し", "設備投資計画", "政府制度", "原材料コスト"],
  },
  {
    category: "election_policy",
    keywords: ["president", "election", "administration", "congress", "tariff", "sanction", "subsidy", "大統領", "大統領選", "選挙", "政権", "関税", "制裁", "補助金", "政策"],
    impactedTags: ["policy", "defense", "energy", "semiconductor", "healthcare", "finance", "infrastructure", "trade"],
    hypothesisClusters: ["security-resilience", "ai-sovereignty", "energy-transition"],
    possibleBeneficiaries: ["防衛", "インフラ", "エネルギー", "半導体", "国内回帰", "補助金対象"],
    possibleRisks: ["政策転換", "関税", "制裁", "補助金縮小", "規制強化", "為替変動"],
    watchQuestions: ["誰が勝つと制度が変わるか？", "補助金/関税/規制の方向は？", "国内企業に実益があるか？", "市場はすでに織り込んだか？"],
    primaryChecks: ["公式政策文書", "選挙日程", "世論調査ではなく政策差", "予算案", "企業開示"],
  },
  {
    category: "migration_demographics",
    keywords: ["immigration", "migrant", "labor shortage", "demographics", "population", "aging", "人手不足", "移民", "外国人材", "人口", "高齢化", "介護", "労働力"],
    impactedTags: ["labor", "immigration", "automation", "robotics", "staffing", "healthcare", "logistics", "education", "consumer"],
    hypothesisClusters: ["japan-labor-demographics", "ai-sovereignty"],
    possibleBeneficiaries: ["人材", "教育", "介護", "物流", "ロボット", "SaaS", "住宅/生活サービス"],
    possibleRisks: ["制度変更", "社会的摩擦", "人件費上昇", "価格転嫁失敗", "採用コスト増"],
    watchQuestions: ["人手不足は省人化需要につながるか？", "外国人材増加でどの生活インフラが伸びるか？", "人件費増を価格転嫁できるか？"],
    primaryChecks: ["政府統計", "在留外国人統計", "人件費率", "採用単価", "制度変更", "価格転嫁状況"],
  },
  {
    category: "trade_supply_chain",
    keywords: ["supply chain", "trade", "export control", "tariff", "shipping", "rare earth", "物流", "供給網", "輸出規制", "貿易", "関税", "レアアース", "海運"],
    impactedTags: ["semiconductor", "materials", "manufacturing", "shipping", "automotive", "trade", "supply_chain"],
    hypothesisClusters: ["security-resilience", "supply-chain", "ai-sovereignty"],
    possibleBeneficiaries: ["国内生産", "代替供給", "素材", "物流管理", "半導体装置", "在庫最適化"],
    possibleRisks: ["輸出規制", "物流遅延", "原材料高", "在庫積み上がり", "顧客生産停止"],
    watchQuestions: ["供給制約は価格決定力につながるか？", "代替供給先として受注が増えるか？", "原価高で利益率が落ちないか？"],
    primaryChecks: ["輸出規制", "海運運賃", "在庫", "粗利率", "主要顧客生産計画", "素材価格"],
  },
];

function normalize(text: string): string {
  return text.toLowerCase();
}

export function classifyWorldEvent(article: WorldEventArticle): ClassifiedWorldEvent {
  const text = normalize(`${article.title} ${article.snippet ?? ""}`);
  const impacts = RULES.map(rule => {
    const matchedKeywords = rule.keywords.filter(keyword => text.includes(keyword.toLowerCase()));
    if (matchedKeywords.length === 0) return null;
    const score = Math.min(100, matchedKeywords.length * 15 + rule.impactedTags.length * 2);
    return {
      category: rule.category,
      score,
      matchedKeywords,
      impactedTags: rule.impactedTags,
      hypothesisClusters: rule.hypothesisClusters,
      possibleBeneficiaries: rule.possibleBeneficiaries,
      possibleRisks: rule.possibleRisks,
      watchQuestions: rule.watchQuestions,
      primaryChecks: rule.primaryChecks,
    } satisfies WorldEventImpact;
  }).filter((impact): impact is WorldEventImpact => impact != null);

  return {
    ...article,
    impacts,
    totalImpactScore: impacts.reduce((sum, impact) => sum + impact.score, 0),
  };
}

export function summarizeWorldEvents(events: ClassifiedWorldEvent[]): string[] {
  const lines: string[] = [];
  const important = events
    .filter(event => event.totalImpactScore > 0)
    .sort((a, b) => b.totalImpactScore - a.totalImpactScore);

  for (const event of important.slice(0, 12)) {
    lines.push(`- ${event.title}`);
    for (const impact of event.impacts.slice(0, 3)) {
      lines.push(`  - ${impact.category}: ${impact.impactedTags.slice(0, 6).join(", ")}`);
      lines.push(`  - 見ること: ${impact.watchQuestions[0]}`);
    }
  }

  return lines;
}

export function collectImpactedTags(events: ClassifiedWorldEvent[]): string[] {
  return [...new Set(events.flatMap(event => event.impacts.flatMap(impact => impact.impactedTags)))];
}
