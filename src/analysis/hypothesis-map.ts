import type { Candidate, FinancialQuality, HypeRisk, HypothesisCluster, HypothesisMap, MarketContext } from "../types.js";

type ClusterTemplate = Omit<HypothesisCluster, "matchedTags"> & {
  tags: string[];
};

const CLUSTERS: ClusterTemplate[] = [
  {
    id: "ai-sovereignty",
    label: "AI・計算資源・国家競争",
    tags: ["ai", "software", "semiconductor", "datacenter", "cloud", "power", "infrastructure"],
    thesis: "AIの普及はアプリ企業だけでなく、半導体、データセンター、電力、冷却、通信、セキュリティへ波及する。国や企業が計算資源を戦略資産として扱うほど、関連インフラの重要性が上がる。",
    mechanisms: [
      "AIモデル利用増加でGPU・メモリ・データセンター需要が増える",
      "電力・冷却・通信インフラがボトルネックになりやすい",
      "規制や安全保障の観点から国内供給網・国産化が評価されやすい",
    ],
    possibleBeneficiaries: ["半導体", "データセンター", "電力設備", "冷却", "通信", "セキュリティ", "業務ソフト"],
    risks: [
      "AI期待だけが先行して実需・利益が追いつかない",
      "設備投資サイクルの天井で急減速する",
      "規制強化や輸出管理でサプライチェーンが詰まる",
    ],
    counterSignals: [
      "売上成長が鈍化している",
      "営業利益率が悪化している",
      "短期急騰でhypeRiskがhigh",
      "主要顧客の設備投資が減速",
    ],
    primaryChecks: ["決算説明資料", "設備投資計画", "主要顧客動向", "電力・データセンター関連開示", "規制・輸出管理ニュース"],
  },
  {
    id: "japan-labor-demographics",
    label: "日本の人手不足・移民/外国人材・自動化",
    tags: ["labor", "immigration", "automation", "robotics", "staffing", "healthcare", "logistics", "education", "consumer"],
    thesis: "日本の人手不足が続くと、外国人材、教育、住宅、医療、介護、物流、自動化、ロボット、業務効率化ソフトに需要が分散して生まれる。単純な人口増減ではなく、制度・現場オペレーション・社会受容が重要になる。",
    mechanisms: [
      "人手不足で省人化・自動化投資が増える",
      "外国人材の増加で教育、住宅、生活インフラ需要が増える",
      "介護・医療・物流の供給制約が強まり、効率化ニーズが上がる",
    ],
    possibleBeneficiaries: ["人材", "教育", "介護", "物流", "ロボット", "SaaS", "住宅/生活サービス"],
    risks: [
      "制度変更で需要が急に変わる",
      "社会的摩擦や採用コスト増で利益化が遅れる",
      "人件費上昇を価格転嫁できない",
    ],
    counterSignals: [
      "売上は伸びても営業利益が伸びない",
      "人件費率上昇で利益率悪化",
      "制度変更が逆風になる",
    ],
    primaryChecks: ["政府統計", "在留外国人関連統計", "採用単価", "人件費率", "価格転嫁状況", "規制・制度変更"],
  },
  {
    id: "energy-transition",
    label: "石油依存低下・エネルギー転換・電力制約",
    tags: ["energy", "oil", "renewable", "nuclear", "battery", "grid", "power", "materials", "ev"],
    thesis: "石油がすぐ消えるというより、脱炭素・電化・地政学でエネルギー構成が変わる。AIやEVで電力需要が増える一方、資源価格と送電網が制約になる。",
    mechanisms: [
      "電化が進むほど電力・送電・蓄電の重要性が上がる",
      "資源価格の変動が素材・化学・物流コストに波及する",
      "原子力・再エネ・蓄電池・省エネ設備が政策テーマになりやすい",
    ],
    possibleBeneficiaries: ["電力設備", "蓄電池", "素材", "原子力関連", "再エネ", "省エネ", "送電網"],
    risks: [
      "資源価格下落で投資テーマが冷える",
      "補助金や制度変更に依存しすぎる",
      "設備投資負担が重く利益が出にくい",
    ],
    counterSignals: ["営業利益率悪化", "補助金前提の事業計画", "原材料価格の逆風", "大型投資でFCF悪化"],
    primaryChecks: ["電力需要見通し", "資源価格", "設備投資計画", "補助金/制度", "原材料コスト", "送電網関連開示"],
  },
  {
    id: "space-connectivity",
    label: "宇宙・衛星通信・Starlink的インフラ",
    tags: ["space", "satellite", "telecom", "defense", "disaster", "iot", "infrastructure"],
    thesis: "衛星通信は宇宙ビジネス単体ではなく、防災、安全保障、遠隔地通信、IoT、船舶/航空、災害時バックアップ通信に接続する。Starlink的な低軌道通信の普及は既存通信・端末・防災インフラの見方を変える。",
    mechanisms: [
      "低軌道衛星で通信空白地帯や災害時通信を補完する",
      "安全保障・防災ニーズが国策化しやすい",
      "端末、アンテナ、地上局、運用ソフトに波及する",
    ],
    possibleBeneficiaries: ["衛星", "通信", "防災", "地上局", "アンテナ", "IoT", "安全保障関連"],
    risks: [
      "期待先行で売上化に時間がかかる",
      "海外大手との競争が強い",
      "規制・周波数・打上げコストの制約がある",
    ],
    counterSignals: ["売上化が遅い", "赤字拡大", "大型提携が進まない", "短期急騰だけで材料が薄い"],
    primaryChecks: ["契約/提携開示", "売上貢献時期", "政府調達", "周波数/規制", "災害対応実績", "海外競合動向"],
  },
  {
    id: "security-resilience",
    label: "安全保障・経済安全保障・レジリエンス",
    tags: ["defense", "security", "cybersecurity", "semiconductor", "materials", "infrastructure", "supply_chain"],
    thesis: "世界の不確実性が高まるほど、安さより安定供給・国内生産・サイバー防御・重要インフラ保護が評価されやすい。",
    mechanisms: [
      "重要物資の国内回帰・多元化が進む",
      "サイバー攻撃やインフラ障害への備えが必要になる",
      "防衛・防災・インフラ更新が政策テーマになる",
    ],
    possibleBeneficiaries: ["サイバーセキュリティ", "半導体", "素材", "防衛", "防災", "重要インフラ"],
    risks: ["政策依存が強い", "受注まで時間がかかる", "テーマ化で過熱しやすい"],
    counterSignals: ["受注が増えない", "政策予算が伸びない", "利益率が改善しない", "hypeRiskがhigh"],
    primaryChecks: ["政府予算", "受注残", "契約開示", "利益率", "規制/補助金", "重要インフラ関連ニュース"],
  },
  {
    id: "capital-market-psychology",
    label: "SNS・市場心理・過熱/逆張り",
    tags: ["ipo", "ai", "space", "crypto", "theme", "smallcap"],
    thesis: "テーマが強いほど注目は集まりやすいが、短期急騰後は期待が価格に入りやすい。SNSや流行は買い材料ではなく、過熱を測る警戒灯として使う。",
    mechanisms: [
      "注目度が高いテーマは短期で価格に織り込まれやすい",
      "出来高急増後に需給が崩れることがある",
      "反対意見が少ない時ほど期待先行になりやすい",
    ],
    possibleBeneficiaries: ["短期トレンド検知", "過熱回避", "逆張り候補の選別"],
    risks: ["FOMO", "高値掴み", "材料出尽くし", "流動性低下"],
    counterSignals: ["5日リターン急騰", "20日リターン急騰", "ボラ高騰", "hypeRisk high"],
    primaryChecks: ["出来高推移", "急騰前後の開示", "SNSではなく一次情報", "短期リターン", "ボラティリティ"],
  },
];

function matches(candidate: Candidate, template: ClusterTemplate): string[] {
  const tags = new Set(candidate.tags.map(tag => tag.toLowerCase()));
  return template.tags.filter(tag => tags.has(tag.toLowerCase()));
}

function buildCrossLinks(clusters: HypothesisCluster[]): string[] {
  const ids = new Set(clusters.map(c => c.id));
  const links: string[] = [];

  if (ids.has("ai-sovereignty") && ids.has("energy-transition")) {
    links.push("AI計算需要はデータセンターと電力制約に接続する。AIテーマは電力・冷却・送電網も同時に見る。");
  }
  if (ids.has("ai-sovereignty") && ids.has("security-resilience")) {
    links.push("AI・半導体は経済安全保障と結びつきやすく、国内供給網・規制・輸出管理を確認する。");
  }
  if (ids.has("space-connectivity") && ids.has("security-resilience")) {
    links.push("衛星通信は防災・安全保障・通信バックアップと接続する。売上化時期と政府/企業契約を確認する。");
  }
  if (ids.has("japan-labor-demographics") && ids.has("ai-sovereignty")) {
    links.push("人手不足はAI・自動化・ロボット・業務ソフトの需要につながる。省人化が利益に効いているか確認する。");
  }
  if (ids.has("energy-transition") && ids.has("security-resilience")) {
    links.push("エネルギー転換は資源安全保障と表裏一体。政策・資源価格・供給網をセットで見る。");
  }
  if (ids.has("capital-market-psychology")) {
    links.push("流行テーマは期待が先に価格へ入る。強い物語ほど反証条件を先に置く。");
  }

  return links;
}

export function buildHypothesisMap(input: {
  candidate: Candidate;
  marketContext?: MarketContext;
  financialQuality?: FinancialQuality;
  hypeRisk?: HypeRisk;
}): HypothesisMap {
  const clusters = CLUSTERS
    .map(template => {
      const matchedTags = matches(input.candidate, template);
      if (matchedTags.length === 0) return null;
      const { tags: _tags, ...cluster } = template;
      return { ...cluster, matchedTags };
    })
    .filter((c): c is HypothesisCluster => c != null);

  const crossLinks = buildCrossLinks(clusters);
  const falsificationTriggers = [
    "売上成長がテーマ仮説と逆方向に鈍化する",
    "営業利益率が悪化し、テーマが利益に変換されていない",
    "短期急騰だけで一次情報の裏付けがない",
    "市場対比で弱くなり続ける",
    "重要な規制・制度・供給網の前提が崩れる",
  ];

  const watchQuestions = [
    "この会社は世界の流れのどのボトルネックを解決しているか？",
    "その流れは売上・利益・キャッシュフローに変わっているか？",
    "国策・規制・地政・技術サイクルのどれが追い風/逆風か？",
    "期待がすでに価格に入りすぎていないか？",
    "反対意見を一つ挙げるなら何か？",
  ];

  const sourceNeeds = [...new Set(clusters.flatMap(c => c.primaryChecks))];
  const confidence = Math.min(100, clusters.length * 15 + crossLinks.length * 10 + (input.financialQuality ? 10 : 0) + (input.marketContext ? 10 : 0));
  const summary = clusters.length > 0
    ? `${input.candidate.name} は ${clusters.map(c => c.label).join(" / ")} の流れと接続している可能性があります。銘柄単体ではなく、世界の変化が売上・利益に変わるかを確認します。`
    : `${input.candidate.name} は明確な複合テーマ接続が少ないため、まず事業内容と一次情報から仮説を作る必要があります。`;

  return {
    summary,
    clusters,
    crossLinks,
    falsificationTriggers,
    watchQuestions,
    sourceNeeds,
    confidence,
  };
}
