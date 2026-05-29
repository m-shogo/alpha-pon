import type { MarketLesson, MarketLessonContext } from "./market-lessons.js";

function includesAny(values: string[], needles: string[]): boolean {
  const haystack = values.join(" ").toLowerCase();
  return needles.some(needle => haystack.includes(needle.toLowerCase()));
}

export function inferMarketLessonContext(lesson: MarketLesson): MarketLessonContext {
  if (lesson.context) return lesson.context;

  const values = [lesson.id, lesson.title, lesson.category, lesson.shortSummary, ...lesson.affectedTags, ...lesson.chain];
  const macroBackdrop: string[] = [];
  const policyBackdrop: string[] = [];
  const geopoliticalBackdrop: string[] = [];
  const socialBackdrop: string[] = [];
  const marketStructure: string[] = [];
  const transmissionPath: string[] = [...lesson.chain];
  const whyItCouldInvert: string[] = [];
  const modernConditionsToCompare: string[] = [...lesson.primaryChecks];

  if (includesAny(values, ["rate", "interest", "bank", "credit", "finance", "currency", "inflation", "macro", "金利", "信用", "銀行", "通貨", "インフレ"])) {
    macroBackdrop.push("金利・信用・通貨・インフレなど、マクロ金融環境が企業価値や資金繰りに効きやすい局面");
    marketStructure.push("レバレッジ、資金調達、流動性、信用スプレッドの変化が価格変動を増幅しやすい");
    whyItCouldInvert.push("中央銀行や政府の流動性供給、信用不安の透明化、資本増強が早い場合は逆方向に動く可能性がある");
  }

  if (includesAny(values, ["war", "defense", "security", "sanction", "geopolitics", "middle_east", "ukraine", "terror", "戦争", "防衛", "安全保障", "制裁", "地政学"])) {
    geopoliticalBackdrop.push("軍事衝突・制裁・安全保障不安が、資源、物流、防衛、リスクプレミアムに波及しやすい局面");
    policyBackdrop.push("防衛予算、制裁、輸出管理、重要インフラ保護など政策対応が企業収益を変えやすい");
    whyItCouldInvert.push("紛争が限定的に収束する、制裁影響が軽い、供給網の代替が早い場合は市場影響が逆転・縮小しやすい");
  }

  if (includesAny(values, ["pandemic", "health", "who", "vaccine", "testing", "covid", "sars", "ebola", "mpox", "感染", "ワクチン", "公衆衛生"])) {
    socialBackdrop.push("感染症や公衆衛生不安により、人流、消費、医療需要、政府対応が同時に変化しやすい局面");
    policyBackdrop.push("WHOや各国政府の宣言、渡航制限、医療予算、ワクチン/検査調達が市場の注目点になる");
    whyItCouldInvert.push("感染拡大が限定的、医療体制が強い、政策対応が早い場合は過度なリスクオフが反転しやすい");
  }

  if (includesAny(values, ["earthquake", "flood", "hurricane", "disaster", "nuclear", "supply_chain", "logistics", "震災", "地震", "洪水", "災害", "供給網", "物流", "原発"])) {
    geopoliticalBackdrop.push("地理的な集中リスク、自然災害、重要インフラ停止がサプライチェーン全体へ波及しやすい局面");
    marketStructure.push("在庫、代替調達、工場所在地、物流チョークポイントが企業業績の差を作る");
    whyItCouldInvert.push("在庫が厚い、代替供給が早い、復旧支援や復興需要が大きい場合はプラス方向に転じることがある");
  }

  if (includesAny(values, ["ai", "semiconductor", "space", "satellite", "starlink", "ev", "technology", "software", "datacenter", "宇宙", "半導体", "データセンター", "技術"])) {
    macroBackdrop.push("技術サイクルと設備投資サイクルが重なり、期待と実需の差が大きくなりやすい局面");
    marketStructure.push("ボトルネックを握る企業に利益が集中し、名ばかりテーマ銘柄は過熱後に失速しやすい");
    whyItCouldInvert.push("技術期待が売上・利益に変わらない、供給過多になる、規制や電力制約が強い場合は逆方向に動きやすい");
  }

  if (includesAny(values, ["fraud", "accounting", "governance", "scandal", "audit", "不正", "会計", "監査", "ガバナンス", "スキャンダル"])) {
    socialBackdrop.push("企業への信頼、監査、開示、ブランドへの不安が市場心理を急速に悪化させやすい局面");
    marketStructure.push("信用低下が資金繰り、取引先、顧客、株主の行動へ連鎖しやすい");
    whyItCouldInvert.push("第三者調査で疑惑が限定的と確認される、現金や契約の実在性が確認される場合は反転余地がある");
  }

  if (macroBackdrop.length === 0) macroBackdrop.push("当時の金利、景気、流動性、資金調達環境を確認する必要がある");
  if (policyBackdrop.length === 0) policyBackdrop.push("政府、中央銀行、規制当局の対応が市場の方向を変える可能性がある");
  if (geopoliticalBackdrop.length === 0) geopoliticalBackdrop.push("地政学・地域リスクが直接ではなく資源、物流、政策を通じて効く可能性がある");
  if (socialBackdrop.length === 0) socialBackdrop.push("市場参加者の過信、恐怖、FOMO、信頼低下など心理要因を確認する必要がある");
  if (marketStructure.length === 0) marketStructure.push("需給、流動性、レバレッジ、空売り、在庫、供給制約など市場構造を確認する必要がある");
  if (whyItCouldInvert.length === 0) whyItCouldInvert.push("政策対応、需給改善、一次情報の確認、期待の織り込み具合によって逆方向に動く可能性がある");

  return {
    macroBackdrop,
    policyBackdrop,
    geopoliticalBackdrop,
    socialBackdrop,
    marketStructure,
    transmissionPath,
    whyItMoved: lesson.coreMechanism,
    whyItCouldInvert,
    modernConditionsToCompare: [...new Set(modernConditionsToCompare)],
  };
}

export function enrichMarketLesson(lesson: MarketLesson): MarketLesson {
  return {
    ...lesson,
    context: inferMarketLessonContext(lesson),
  };
}
