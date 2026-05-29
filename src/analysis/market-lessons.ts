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
    chain: ["住宅価格上昇を前提にしたローンが増える", "証券化でリスクが見えにくくなる", "格下げ・損失認識で信頼が崩れる", "短期資金市場が詰まり、金融機関の破綻不安が広がる", "銀行株だけでなく、景気敏感・消費・資源まで売られる"],
    coreMechanism: "信用は一度壊れると、悪い資産の額だけでなく『誰がどれだけ持っているかわからない』不透明性で市場全体へ伝播する。",
    earlySignals: ["信用スプレッド拡大", "短期資金調達の悪化", "住宅関連延滞率上昇", "金融機関の評価損", "格付け引き下げ"],
    wrongTakeaways: ["大手金融機関なら必ず助かる", "PERが安いから安全", "不動産価格は全国的には下がらない"],
    usefulTakeaways: ["レバレッジと流動性を最優先で見る", "資金調達構造を見る", "見えない損失がある業界は一段厳しく見る"],
    modernAnalogyQuestions: ["今の資産価格は低金利前提で膨らんでいないか？", "金利上昇で含み損が出る構造はないか？", "誰が最終リスクを持っているか見えるか？"],
    primaryChecks: ["金利", "信用スプレッド", "不動産価格", "銀行の含み損", "資金調達コスト", "自己資本比率"],
    sourceHints: ["Lehman bankruptcy", "2008 financial crisis", "subprime mortgage crisis"],
    context: {
      macroBackdrop: ["低金利と住宅価格上昇が長く続き、リスク許容度が高まっていた", "家計・金融機関・投資家のレバレッジが積み上がっていた"],
      policyBackdrop: ["金融緩和後の信用拡大と住宅金融政策が背景にあった", "危機後は中央銀行と政府の流動性供給が重要になった"],
      geopoliticalBackdrop: ["地政学よりも米国発の金融システム不安が世界に波及した局面"],
      socialBackdrop: ["住宅は安全資産という心理、格付けへの過信、金融工学への信頼が強かった"],
      marketStructure: ["証券化・CDO・短期資金調達・レバレッジでリスクが見えにくくなっていた"],
      transmissionPath: ["住宅価格下落", "ローン延滞", "証券化商品損失", "金融機関不信", "信用収縮", "株式市場急落"],
      whyItMoved: "信用システムの土台である『相手を信じて資金を貸せる状態』が壊れたため、金融株だけでなく実体経済全体へ売りが波及した。",
      whyItCouldInvert: ["中央銀行が早く流動性を供給する", "損失の所在が透明化する", "自己資本が厚く、連鎖破綻が起きない"],
      modernConditionsToCompare: ["金利水準", "信用スプレッド", "不動産価格", "金融機関の含み損", "短期資金市場", "レバレッジの所在"],
    },
  },
  {
    id: "enron-2001",
    title: "Enron：粉飾・会計不信は株価をゼロ近くまで壊す",
    period: "2001",
    direction: "down",
    category: "accounting_fraud",
    affectedTags: ["fraud", "accounting", "governance", "energy", "audit", "scandal"],
    shortSummary: "複雑な会計処理、特別目的会社、債務隠し、監査不信が表面化し、株価と企業価値が崩壊した。",
    chain: ["高成長企業として評価される", "利益の質や債務の所在が見えにくくなる", "会計疑惑と調査が表面化する", "信用が消え、取引先・投資家・従業員が離れる", "資金繰りが詰まり破綻する"],
    coreMechanism: "会計不信は、利益予想の下方修正より重い。数字そのものが信じられなくなるため、バリュエーションの土台が消える。",
    earlySignals: ["複雑すぎる事業説明", "営業CFと利益の乖離", "関連当事者取引", "監査法人への依存", "空売りや調査報道への過剰反応"],
    wrongTakeaways: ["有名企業だから安心", "決算上は利益が出ているから安心", "株価が下がったから割安"],
    usefulTakeaways: ["利益よりキャッシュフローを見る", "説明不能な複雑さはリスク", "監査・ガバナンス不信は即警戒"],
    modernAnalogyQuestions: ["営業CFは利益についてきているか？", "第三者が事業構造を説明できるか？", "監査・内部統制・関連当事者リスクはないか？"],
    primaryChecks: ["営業CF", "監査意見", "関連当事者取引", "負債注記", "調査報道", "内部統制報告"],
    sourceHints: ["Enron scandal", "accounting fraud", "Arthur Andersen"],
  },
  {
    id: "volkswagen-dieselgate-2015",
    title: "Volkswagen Dieselgate：規制・不正・ブランド毀損の連鎖",
    period: "2015-2016",
    direction: "down",
    category: "regulatory_scandal",
    affectedTags: ["automotive", "regulation", "scandal", "emissions", "governance", "consumer"],
    shortSummary: "排ガス不正の発覚で、罰金・訴訟・販売影響・ブランド毀損が連鎖した。規制領域の不正は財務だけでなく需要と信用に波及する。",
    chain: ["規制対応済みの前提で販売される", "不正・隠蔽が発覚する", "罰金・リコール・訴訟が発生する", "販売・ブランド・中古車価格へ影響する", "同業全体の規制強化につながる"],
    coreMechanism: "規制産業では、不正発覚が一社の問題で終わらず、罰金・販売停止・訴訟・業界規制の再評価に広がる。",
    earlySignals: ["規制値と実使用の乖離", "内部告発", "当局調査", "リコール増加", "説明の変更"],
    wrongTakeaways: ["一時的な罰金だけで終わる", "ブランドが強いからすぐ戻る", "規制問題は売上に関係ない"],
    usefulTakeaways: ["規制産業ではコンプライアンスが収益力そのもの", "不正は同業にも波及する", "ブランド毀損は時間差で効く"],
    modernAnalogyQuestions: ["規制対応が売上の前提になっていないか？", "当局調査が本格化していないか？", "消費者・取引先の信頼が落ちる構造か？"],
    primaryChecks: ["規制当局発表", "リコール", "訴訟", "販売台数", "ブランド調査", "中古価格"],
    sourceHints: ["Volkswagen emissions scandal", "Dieselgate", "regulatory scandal"],
  },
  {
    id: "covid-crash-2020",
    title: "COVIDショック：外部ショックと政策対応で勝ち負けが急変",
    period: "2020",
    direction: "volatile",
    category: "pandemic_shock",
    affectedTags: ["healthcare", "travel", "remote_work", "ecommerce", "logistics", "central_bank", "risk_off"],
    shortSummary: "感染症ショックで経済活動が急停止し株式は急落したが、金融緩和・財政出動・リモート需要により、セクター間の勝ち負けが大きく分かれた。",
    chain: ["感染拡大で移動・消費・生産が止まる", "業績予想が一気に不透明になる", "市場は流動性確保で売りに傾く", "中央銀行・政府が大規模支援を出す", "リモート、EC、クラウド、医療関連が再評価される"],
    coreMechanism: "外部ショックの初期は全体売りになりやすいが、その後は政策対応と生活変化によって勝ち組/負け組が分かれる。",
    earlySignals: ["感染拡大速度", "移動制限", "企業ガイダンス撤回", "信用市場のストレス", "中央銀行の緊急対応"],
    wrongTakeaways: ["全銘柄が同じだけ悪い", "暴落したら全部買い", "感染症ニュースだけ見れば十分"],
    usefulTakeaways: ["ショックの一次影響と二次影響を分ける", "政策対応を見る", "生活様式の変化が売上に変わる企業を探す"],
    modernAnalogyQuestions: ["今のショックは一時的か構造変化か？", "政策対応はあるか？", "需要が消えたのか移っただけか？"],
    primaryChecks: ["WHO/各国発表", "移動制限", "中央銀行政策", "財政支援", "セクター別売上", "企業ガイダンス"],
    sourceHints: ["COVID stock market crash", "pandemic financial market impact"],
  },
  {
    id: "negative-oil-2020",
    title: "WTI原油マイナス価格：金融商品でも物理制約に負ける",
    period: "2020-04",
    direction: "volatile",
    category: "commodity_physical_constraint",
    affectedTags: ["oil", "energy", "storage", "futures", "shipping", "commodity"],
    shortSummary: "需要急減、供給過剰、保管能力不足、先物決済の仕組みが重なり、WTI先物が一時マイナス価格になった。",
    chain: ["パンデミックで移動需要が急減する", "産油国の供給調整が遅れる", "保管タンクが埋まる", "現物受け渡しができない投資家が投げ売る", "近い限月だけ異常価格になる"],
    coreMechanism: "金融市場の価格は、最終的に現物の保管・輸送・受け渡し制約に縛られることがある。",
    earlySignals: ["在庫急増", "保管容量逼迫", "期近と期先の価格差拡大", "需要崩壊", "OPEC協調失敗"],
    wrongTakeaways: ["原油そのものの価値が永続的にマイナス", "ETFや先物は現物と同じ", "安ければ必ず反発する"],
    usefulTakeaways: ["コモディティは保管と限月を見る", "ETF/先物商品の仕組みを確認", "現物制約は株にも波及する"],
    modernAnalogyQuestions: ["その商品は保管・輸送制約があるか？", "金融商品と現物価格がズレていないか？", "在庫と需要の方向は？"],
    primaryChecks: ["在庫", "保管容量", "期近/期先スプレッド", "需要統計", "OPEC方針", "ETF目論見書"],
    sourceHints: ["WTI negative oil price 2020", "storage constraint", "futures market"],
  },
  {
    id: "gamestop-2021",
    title: "GameStopショートスクイーズ：需給・SNS・物語が価格を飛ばす",
    period: "2021-01",
    direction: "up",
    category: "short_squeeze_social",
    affectedTags: ["short_squeeze", "social_media", "retail", "meme", "volatility", "options"],
    shortSummary: "高い空売り比率、SNS上の集団行動、オプション需給、買い戻しが重なり、業績では説明しにくい急騰が発生した。",
    chain: ["空売り比率が極端に高い", "SNSで共通ストーリーが形成される", "個人投資家の買いとオプション取引が増える", "空売りの買い戻しが価格上昇を加速する", "流動性・取引制限・反動下落リスクが高まる"],
    coreMechanism: "需給が極端に偏ると、短期価格はファンダメンタルズではなく強制買い戻しと群集心理で動く。",
    earlySignals: ["空売り比率", "SNS投稿量急増", "出来高急増", "オプション建玉", "貸株料上昇"],
    wrongTakeaways: ["SNSで話題なら長期的に強い", "急騰は企業価値の証明", "みんなが買っているから安全"],
    usefulTakeaways: ["需給イベントと企業価値を分ける", "SNSは買い材料ではなく過熱警戒灯", "出口流動性を確認する"],
    modernAnalogyQuestions: ["空売り比率は極端か？", "出来高とSNSが同時に急増しているか？", "業績でなく需給だけの上昇ではないか？"],
    primaryChecks: ["空売り比率", "出来高", "オプション建玉", "SNS投稿量", "貸株料", "取引規制"],
    sourceHints: ["GameStop short squeeze", "WallStreetBets", "short interest"],
  },
  {
    id: "svb-2023",
    title: "SVB破綻：金利上昇・含み損・預金集中が銀行株を壊す",
    period: "2023-03",
    direction: "down",
    category: "bank_run_duration_risk",
    affectedTags: ["bank", "finance", "interest_rate", "duration", "startup", "liquidity", "deposit"],
    shortSummary: "長期債の含み損、金利上昇、預金流出、テック/スタートアップ顧客への集中が重なり、銀行取り付けと地域銀行不安につながった。",
    chain: ["低金利期に長期債を多く保有する", "金利上昇で債券価格が下がる", "スタートアップ顧客が資金を引き出す", "損失認識と増資発表で不安が広がる", "預金流出が加速し破綻する"],
    coreMechanism: "銀行は信用だけでなく期間ミスマッチで壊れる。預金者が集中していると、情報拡散で取り付けが速くなる。",
    earlySignals: ["未実現損失", "無保険預金比率", "顧客集中", "預金減少", "金利上昇", "増資発表"],
    wrongTakeaways: ["銀行は規制されているから安全", "債券は満期保有なら問題ない", "預金者はゆっくり動く"],
    usefulTakeaways: ["金利感応度と預金構成を見る", "顧客集中は銀行にも危険", "SNS時代の取り付けは速い"],
    modernAnalogyQuestions: ["含み損は自己資本に対して大きいか？", "預金者は分散しているか？", "金利上昇に弱い資産構成か？"],
    primaryChecks: ["HTM/AFS含み損", "無保険預金比率", "預金流出", "金利", "資本調達", "顧客集中"],
    sourceHints: ["Silicon Valley Bank collapse", "duration risk", "uninsured deposits"],
  },
  {
    id: "boeing-737max-2019",
    title: "Boeing 737 MAX：安全・規制・品質不信が長期化する",
    period: "2019-2024",
    direction: "down",
    category: "safety_quality_regulation",
    affectedTags: ["aerospace", "defense", "manufacturing", "regulation", "safety", "supply_chain", "quality"],
    shortSummary: "重大事故、機体の世界的運航停止、認証問題、品質管理不信が重なり、短期の事故ニュースを超えて生産・納入・財務へ長期影響が出た。",
    chain: ["重大事故で安全性が疑われる", "規制当局が運航停止・認証再審査を行う", "生産・納入・顧客補償に影響する", "サプライチェーンと資金繰りに波及する", "ブランドと品質管理の再評価が続く"],
    coreMechanism: "安全が収益の前提にある産業では、品質不信は受注残・生産計画・規制認証・顧客信頼へ長期波及する。",
    earlySignals: ["重大事故", "規制当局の調査", "認証遅延", "納入停止", "品質問題の再発", "顧客補償"],
    wrongTakeaways: ["事故は一度だけならすぐ戻る", "受注残があるから安全", "大企業だから品質問題は限定的"],
    usefulTakeaways: ["安全産業では規制認証を最優先で見る", "品質不信は長期化する", "サプライチェーン全体へ波及する"],
    modernAnalogyQuestions: ["安全・品質が売上の前提か？", "認証や規制がボトルネックか？", "事故/不良が再発していないか？"],
    primaryChecks: ["規制当局発表", "納入数", "受注キャンセル", "品質監査", "補償費用", "サプライヤー影響"],
    sourceHints: ["Boeing 737 MAX grounding", "FAA", "quality control"],
  },
  {
    id: "wirecard-2020",
    title: "Wirecard：成長ストーリーでも現金が消えたら終わる",
    period: "2020",
    direction: "down",
    category: "fintech_accounting_fraud",
    affectedTags: ["fintech", "payments", "fraud", "accounting", "audit", "governance", "growth"],
    shortSummary: "急成長フィンテックとして評価されたが、会計疑惑、監査不信、現金不足の発覚で破綻した。成長株でも現金確認が最重要になる例。",
    chain: ["高成長ストーリーで評価される", "調査報道や疑惑が出る", "監査で現金確認ができなくなる", "信頼が崩れ資金繰りが詰まる", "破綻し株式価値が大きく失われる"],
    coreMechanism: "成長率が高くても、現金・売上・顧客の実在性が崩れると価値評価は成立しない。",
    earlySignals: ["監査遅延", "現金確認不能", "調査報道", "複雑な海外子会社", "利益と現金の乖離"],
    wrongTakeaways: ["成長率が高ければ疑惑は無視できる", "有名指数採用銘柄なら安全", "監査法人がいるから安心"],
    usefulTakeaways: ["成長株ほど現金と顧客の実在性を見る", "調査報道を軽視しない", "監査遅延は重大警戒"],
    modernAnalogyQuestions: ["現金残高は第三者確認できるか？", "売上の相手先は実在するか？", "監査や調査報道に不自然さはないか？"],
    primaryChecks: ["監査報告", "現金残高", "営業CF", "顧客集中", "調査報道", "海外子会社"],
    sourceHints: ["Wirecard scandal", "missing 1.9 billion euros", "audit failure"],
  },
  {
    id: "ai-infrastructure-boom-2023",
    title: "AIインフラブーム：物語が売上に変わる企業だけが残る",
    period: "2023-2026",
    direction: "up",
    category: "ai_capex_cycle",
    affectedTags: ["ai", "semiconductor", "datacenter", "power", "cooling", "cloud", "software", "infrastructure"],
    shortSummary: "生成AIの普及でGPU、半導体、データセンター、電力、冷却、サーバー需要が拡大。だが、テーマ銘柄全てが勝つわけではなく、売上・利益・供給制約を押さえた企業に集中しやすい。",
    chain: ["AI利用が増え計算資源需要が増える", "GPU/半導体/サーバー/データセンター需要が急増する", "電力・冷却・用地・供給網がボトルネックになる", "実際に受注・売上化できる企業が上がる", "周辺の名ばかりAI銘柄は過熱後に失速しやすい"],
    coreMechanism: "大テーマでは、物語よりも『誰がボトルネックを握っているか』『売上と利益に変換できるか』が重要になる。",
    earlySignals: ["データセンター投資", "AIサーバー受注", "半導体供給制約", "電力契約", "粗利率改善", "顧客集中"],
    wrongTakeaways: ["AIと名がつけば全部上がる", "売上がなくてもテーマだけで十分", "電力や冷却の制約は関係ない"],
    usefulTakeaways: ["テーマからボトルネックへ分解する", "受注・売上・利益を確認する", "電力/冷却/供給網も見る"],
    modernAnalogyQuestions: ["その会社はAI需要のどのボトルネックを握るか？", "売上・利益に変わっているか？", "期待は価格に入りすぎていないか？"],
    primaryChecks: ["AI関連売上", "受注残", "粗利率", "データセンター投資", "電力契約", "主要顧客", "設備投資"],
    sourceHints: ["AI data center boom", "Nvidia AI chips", "AI servers"],
  },
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
