// Research OS — 銘柄関係グラフ v1。
//
// config/company-network.yml から「コードで辿れる関係」だけを取り出す。
// read-across（1つの事件を関連銘柄へ展開する）の入力になる。
//
// 2026-09-10 時点の実データ:
//   peers               24/24 が code を持つ
//   parents             0件（未入力）
//   subsidiaries        0件（未入力）
//   majorShareholders   0/1 が code を持つ（自由記述）
//   suppliersOrPartners 0/14 が code を持つ（自由記述）
//
// つまり今は peer 伝播（C1）しか動かない。親子伝播（C2 / キオクシア系）は
// config にデータを入れれば自動で効く。取り込めなかった件数を返すのは、
// このデータ欠落を静かに見過ごさないため。

export const COMPANY_RELATION_TYPES = [
  "peer",
  "parent",
  "subsidiary",
  "major_shareholder",
  "supplier_or_partner",
] as const;

export type CompanyRelationType = (typeof COMPANY_RELATION_TYPES)[number];

/** config のキー名 → 関係種別 */
const CONFIG_KEY_TO_RELATION: Record<string, CompanyRelationType> = {
  peers: "peer",
  parents: "parent",
  subsidiaries: "subsidiary",
  majorShareholders: "major_shareholder",
  suppliersOrPartners: "supplier_or_partner",
};

/** 逆向きの辺を張るときの関係種別。null は逆向きを張らない。 */
const INVERSE_RELATION: Record<CompanyRelationType, CompanyRelationType | null> = {
  peer: "peer",
  parent: "subsidiary",
  subsidiary: "parent",
  // 「A の大株主が B」の逆は「B が A を保有」であって対称ではないので張らない。
  major_shareholder: null,
  supplier_or_partner: "supplier_or_partner",
};

export interface CompanyRelation {
  code: string;
  relationType: CompanyRelationType;
  /** config 由来の説明。無ければ undefined。 */
  note?: string;
  /** config に直接書かれた辺か、逆向きに補った辺か。 */
  derived: boolean;
}

export type CompanyRelationGraph = ReadonlyMap<string, readonly CompanyRelation[]>;

export interface CompanyRelationGraphResult {
  graph: Map<string, CompanyRelation[]>;
  companyCount: number;
  /** 直接の辺の数（逆向き補完を含まない） */
  declaredRelationCount: number;
  /** 逆向きに補った辺の数 */
  derivedRelationCount: number;
  /** code を持たないため取り込めなかった関係の件数 */
  skippedWithoutCode: Record<CompanyRelationType, number>;
}

const CODE_PATTERN = /^[0-9A-Z]{4,5}$/;

function emptySkipCounts(): Record<CompanyRelationType, number> {
  const counts = {} as Record<CompanyRelationType, number>;
  for (const type of COMPANY_RELATION_TYPES) counts[type] = 0;
  return counts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

function addEdge(
  graph: Map<string, CompanyRelation[]>,
  from: string,
  relation: CompanyRelation,
): boolean {
  if (from === relation.code) return false; // 自己参照は辺にしない
  const edges = graph.get(from) ?? [];
  // 同じ相手・同じ関係種別は1本だけ。直接の辺を逆向き補完で上書きしない。
  if (edges.some((one) => one.code === relation.code && one.relationType === relation.relationType)) {
    return false;
  }
  edges.push(relation);
  graph.set(from, edges);
  return true;
}

/**
 * config オブジェクトから関係グラフを作る。ファイル読み込みは行わない。
 *
 * `includeInverse` が true（既定）のとき、A が B を peer と宣言していれば
 * B → A の peer 辺も張る。config に載っていない銘柄を起点にした read-across を
 * 可能にするため。親子は subsidiary ↔ parent に反転する。
 */
export function buildCompanyRelationGraph(
  config: unknown,
  options: { includeInverse?: boolean } = {},
): CompanyRelationGraphResult {
  const includeInverse = options.includeInverse ?? true;
  const graph = new Map<string, CompanyRelation[]>();
  const skippedWithoutCode = emptySkipCounts();
  let declaredRelationCount = 0;
  let derivedRelationCount = 0;

  if (!isRecord(config) || !isRecord(config.companies)) {
    throw new Error("company relation config must have a companies object");
  }
  const companies = config.companies;

  for (const rawCode of Object.keys(companies).sort()) {
    const from = normalizedCode(rawCode);
    if (!from) throw new Error(`company relation config has a non-canonical code: ${rawCode}`);
    const entry = companies[rawCode];
    if (!isRecord(entry)) throw new Error(`company relation entry must be an object: ${rawCode}`);

    for (const [configKey, relationType] of Object.entries(CONFIG_KEY_TO_RELATION)) {
      const rows = entry[configKey];
      if (rows === undefined) continue;
      if (!Array.isArray(rows)) {
        throw new Error(`company relation ${rawCode}.${configKey} must be an array`);
      }
      for (const row of rows) {
        const code = isRecord(row) ? normalizedCode(row.code) : null;
        if (!code) {
          // 自由記述（コード無し）はグラフに載せられない。件数だけ残す。
          skippedWithoutCode[relationType] += 1;
          continue;
        }
        const note = isRecord(row) && typeof row.relation === "string" ? row.relation : undefined;
        if (addEdge(graph, from, { code, relationType, note, derived: false })) {
          declaredRelationCount += 1;
        }
      }
    }
  }

  if (includeInverse) {
    for (const [from, edges] of [...graph.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      for (const edge of [...edges]) {
        if (edge.derived) continue;
        const inverseType = INVERSE_RELATION[edge.relationType];
        if (!inverseType) continue;
        if (addEdge(graph, edge.code, { code: from, relationType: inverseType, note: edge.note, derived: true })) {
          derivedRelationCount += 1;
        }
      }
    }
  }

  for (const edges of graph.values()) {
    edges.sort((left, right) =>
      left.code !== right.code
        ? (left.code < right.code ? -1 : 1)
        : (left.relationType < right.relationType ? -1 : left.relationType > right.relationType ? 1 : 0),
    );
  }

  return {
    graph,
    companyCount: Object.keys(companies).length,
    declaredRelationCount,
    derivedRelationCount,
    skippedWithoutCode,
  };
}

/**
 * 33業種でまとめた peer を関係グラフに変換する。
 *
 * config の手書き peer は実測で **8社ぶんしかない**。read-across の
 * 標本にならないので、業種を peer の代理に使う。
 *
 * **これは「同業」であって「関係がある」ではない。** 同じ33業種でも
 * 事業も規模も違う。config の手書き関係（親子・主要株主・取引先）が
 * 埋まったら、そちらを優先する。ここで作る辺は `derived: true` として
 * 印を付け、由来が混ざらないようにする。
 */
export function sectorPeerGraph(
  peersByCode: ReadonlyMap<string, readonly string[]>,
): Map<string, CompanyRelation[]> {
  const graph = new Map<string, CompanyRelation[]>();
  for (const [code, peers] of peersByCode) {
    graph.set(code, peers.map((peer) => ({
      code: peer,
      relationType: "peer" as const,
      note: "同33業種（マスタ由来）",
      derived: true,
    })));
  }
  return graph;
}
