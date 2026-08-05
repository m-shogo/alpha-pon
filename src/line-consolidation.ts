// LINE統合通知の中核ロジック（純関数 + トランスポート抽象）。
//
// 責務:
//  - バッチに蓄積された通知fragmentをセクションごとに分類・**決定論的に**重複排除し、
//    1通の統合メッセージへ組み立てる（入力順・ファイル生成順に依存しない）。
//  - 文字数上限超過時は黙って捨てず、送信本文に省略件数を明記し、
//    省略fragmentは呼び出し側でpendingのまま残せるよう ID を返す。
//  - 実ネットワーク送信は Transport 抽象に隔離し、テスト/ドライランでは実 LINE API を呼ばない。
//  - トークン等の秘匿値をログ・エラー・生成物へ出さない。
//
// 配信状態の記録（queued/sent/failed/pending-retry/skipped）と再送保証は
// src/line-batch-queue.ts が担う。このファイルは「1通に組み立てる」責務に限定する。

// LINEテキストメッセージの安全上限（実上限5000文字に対し余裕を持たせる）。
export const LINE_MAX_CHARS = 4900;

// fragmentの先頭行から論理セクションを判定するためのマッピング。
const SECTION_HEADERS: Record<string, string> = {
  "🚨 Alpha Pon 緊急開示": "🚨 緊急開示",
  "🚨 alpha-pon": "🚨 緊急開示",
  "🌅 Alpha Pon Morning Lite": "📊 銘柄スコア",
  "💎 Alpha Pon 特殊状況": "💎 特殊状況",
  "🤖 AIニュース": "🤖 AI",
  "🔧 半導体ニュース": "🔧 半導体",
  "🚀 宇宙ニュース": "🚀 宇宙",
  "🎮 ゲーム業界ニュース": "🎮 ゲーム",
  "⏰ Alpha Pon 3日前リマインド": "⏰ リマインド",
  "alpha-pon pipeline health": "⚙ パイプライン注意",
};

// 統合後は不要になる各fragmentの定型ヘッダ/フッタ行。
const NOISE_LINES = [
  "5分朝刊 / 重要な変化だけ",
  "個人重点・特殊状況だけ優先確認",
  "本当に重要そうなものだけ / 売買推奨なし",
  "事実/一次情報ベース。売買推奨なし。",
  "重要イベントだけ通知 / 売買推奨なし",
  "━━━━━━━━━━━━",
];

// 各fragmentに含まれる免責文言（統合メッセージ末尾に1回だけ付与するため除去）。
const DISCLAIMER_PATTERNS = [
  /^※売買推奨ではありません/,
  /^※報道・噂/,
  /^※事実・報道・噂/,
  /^データ取得やレポート生成に注意があります/,
];

// テーマニュース（後段でまとめて1セクションに畳む）。
const THEME_SECTIONS = ["🤖 AI", "🔧 半導体", "🚀 宇宙", "🎮 ゲーム"];

// 統合メッセージのセクション表示順（決定論的）。
export const SECTION_ORDER = [
  "🚨 緊急開示",
  "📊 銘柄スコア",
  "💎 特殊状況",
  "⏰ リマインド",
  "⚙ パイプライン注意",
  "📋 その他",
];

const OTHER_SECTION = "📋 その他";
const THEME_SECTION_TITLE = "📰 テーマニュース";
// テーマは他セクションの後ろに置く（決定論的な優先度）。
const THEME_PRIORITY = SECTION_ORDER.length;

export function detectSection(text: string): string | null {
  const firstLine = text.split("\n")[0] ?? "";
  for (const [prefix, label] of Object.entries(SECTION_HEADERS)) {
    if (firstLine.includes(prefix)) return label;
  }
  return null;
}

export function stripHeaderAndFooter(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (NOISE_LINES.includes(trimmed)) return false;
      if (DISCLAIMER_PATTERNS.some((p) => p.test(trimmed))) return false;
      return true;
    })
    .join("\n")
    .trim();
}

export function stripSectionTitle(text: string): string {
  const lines = text.split("\n");
  const firstLine = lines[0] ?? "";
  for (const prefix of Object.keys(SECTION_HEADERS)) {
    if (firstLine.includes(prefix)) {
      return lines.slice(1).join("\n").trim();
    }
  }
  return text;
}

// 重複排除キー: 記号・空白・URL を落として本文の論理的同一性を判定する。
// notification-dedupe.ts の normalizeKeyPart と同じ発想（衝突を避けつつ表記ゆれを吸収）。
export function normalizeKey(section: string, body: string): string {
  const norm = body
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9぀-ヿ㐀-鿿]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${section}|${norm}`;
}

export function isThemeSection(section: string): boolean {
  return THEME_SECTIONS.includes(section);
}

// バッチ内の1fragment。hash は line-batch-queue.ts の contentHash。
export type BatchFragment = {
  hash: string;
  section: string;
  body: string;
};

type WithKey = BatchFragment & { key: string };

// 生テキスト → セクション/本文へ分解（hash は呼び出し側で付与済みの想定）。
export function parseFragmentText(raw: string): { section: string; body: string } {
  const section = detectSection(raw) ?? OTHER_SECTION;
  const body = stripSectionTitle(stripHeaderAndFooter(raw));
  return { section, body };
}

// テスト/簡易利用向け: 生テキスト列 → BatchFragment 列（hash は本文から算出しない簡易版）。
// 実行時は line-batch-queue.ts が contentHash を付与する。
export function fragmentsFromRaw(rawTexts: string[], hashFn: (t: string) => string): BatchFragment[] {
  return rawTexts
    .map((raw) => {
      const { section, body } = parseFragmentText(raw);
      return { hash: hashFn(raw), section, body };
    })
    .filter((f) => f.body.length > 0);
}

const SECTION_PRIORITY = new Map(SECTION_ORDER.map((s, i) => [s, i]));

function priorityOf(section: string): number {
  if (isThemeSection(section)) return THEME_PRIORITY;
  return SECTION_PRIORITY.get(section) ?? SECTION_ORDER.indexOf(OTHER_SECTION);
}

// (key, hash) の安定した昇順比較（入力順に依存しない）。
function byKeyThenHash(a: WithKey, b: WithKey): number {
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  if (a.hash < b.hash) return -1;
  if (a.hash > b.hash) return 1;
  return 0;
}

export type DedupeResult = {
  representatives: WithKey[];
  // 採用されなかった重複（代表 hash → 重複 hash群）
  duplicatesByRepresentative: Map<string, string[]>;
  droppedDuplicateCount: number;
};

// 論理キーで重複排除し、各グループの代表を決定論的に選ぶ（hash 最小）。
// URL/空白だけ違う variant も、どれを採用するか hash 最小で一意に決まる。
export function dedupeFragments(fragments: BatchFragment[]): DedupeResult {
  const withKey: WithKey[] = fragments
    .filter((f) => f.body.length > 0)
    .map((f) => ({ ...f, key: normalizeKey(f.section, f.body) }));

  const groups = new Map<string, WithKey[]>();
  for (const f of withKey) {
    const g = groups.get(f.key);
    if (g) g.push(f);
    else groups.set(f.key, [f]);
  }

  const representatives: WithKey[] = [];
  const duplicatesByRepresentative = new Map<string, string[]>();
  let dropped = 0;
  for (const group of groups.values()) {
    const sorted = [...group].sort(byKeyThenHash);
    const rep = sorted[0];
    representatives.push(rep);
    const dupHashes = sorted.slice(1).map((x) => x.hash);
    if (dupHashes.length > 0) {
      duplicatesByRepresentative.set(rep.hash, dupHashes);
      dropped += dupHashes.length;
    }
  }
  return { representatives, duplicatesByRepresentative, droppedDuplicateCount: dropped };
}

type AssembledSection = { title: string; body: string; memberHashes: string[]; priority: number };

function assembleSections(reps: WithKey[]): AssembledSection[] {
  const themeReps = reps.filter((r) => isThemeSection(r.section)).sort(byKeyThenHash);
  const otherReps = reps.filter((r) => !isThemeSection(r.section));

  const sections: AssembledSection[] = [];
  for (const title of SECTION_ORDER) {
    const members = otherReps.filter((r) => r.section === title).sort(byKeyThenHash);
    if (members.length > 0) {
      sections.push({
        title,
        body: members.map((m) => m.body).join("\n\n"),
        memberHashes: members.map((m) => m.hash),
        priority: priorityOf(title),
      });
    }
  }

  if (themeReps.length > 0) {
    sections.push({
      title: THEME_SECTION_TITLE,
      body: themeReps.map((r) => `${r.section}\n${r.body}`).join("\n\n"),
      memberHashes: themeReps.map((r) => r.hash),
      priority: THEME_PRIORITY,
    });
  }

  return sections;
}

export type BuildResult = {
  /** 送信すべき統合本文。送る内容が無い場合は null。 */
  message: string | null;
  sections: Array<{ title: string; body: string }>;
  /** 実際に送信本文へ含まれた代表fragmentのhash（成功時に delivered 記録する対象）。 */
  includedHashes: string[];
  /** 文字数上限で丸ごと落ちた代表fragmentのhash（pendingのまま残す対象）。 */
  omittedHashes: string[];
  /** 送信本文に含まれた代表の重複と判定され、skipにできるhash（含まれた代表の分のみ）。 */
  skippedDuplicateHashes: string[];
  /** 実際に含まれた項目数（全kept件数ではない）。 */
  includedCount: number;
  droppedDuplicateCount: number;
  /** 文字数上限で先頭セクション本文を切り詰めたか。 */
  truncated: boolean;
  /** 上限超過により丸ごと落ちたセクション数。 */
  omittedSectionCount: number;
  /** 丸ごと落ちた項目数。 */
  omittedItemCount: number;
};

export type BuildOptions = {
  today: string;
  maxChars?: number;
  /** 即時送信済みの緊急件数（本文に「即時通知済み」として1行参照する）。 */
  immediateUrgentCount?: number;
  /** 省略時に案内するWeb確認先（任意）。 */
  webReportHint?: string;
};

const HEADER_PREFIX = "🌅 Alpha Pon 朝刊";
const FOOTER = "※売買推奨ではありません。未確認は一次情報不足として扱います。";
const TRUNCATION_SUFFIX = "\n\n…（続きはWebで確認）";

function emptyResultBase(): Omit<BuildResult, "message" | "droppedDuplicateCount"> {
  return {
    sections: [],
    includedHashes: [],
    omittedHashes: [],
    skippedDuplicateHashes: [],
    includedCount: 0,
    truncated: false,
    omittedSectionCount: 0,
    omittedItemCount: 0,
  };
}

// fragment列から1通の統合メッセージを決定論的に組み立てる。
// 文字数上限超過時は、優先度の高いセクションを残しつつ落とした分を本文に明記し、
// 落とした代表fragmentは omittedHashes として返す（呼び出し側で pending 継続）。
export function buildConsolidatedMessage(
  fragments: BatchFragment[],
  opts: BuildOptions,
): BuildResult {
  const maxChars = opts.maxChars ?? LINE_MAX_CHARS;
  const { representatives, duplicatesByRepresentative, droppedDuplicateCount } =
    dedupeFragments(fragments);
  const allSections = assembleSections(representatives);

  const immediateNote =
    opts.immediateUrgentCount && opts.immediateUrgentCount > 0
      ? `🚨 緊急 ${opts.immediateUrgentCount} 件は即時通知済み`
      : null;

  if (allSections.length === 0 && !immediateNote) {
    return { message: null, droppedDuplicateCount, ...emptyResultBase() };
  }

  const headerLines = [`${HEADER_PREFIX} ${opts.today}`, ""];
  if (immediateNote) headerLines.push(immediateNote, "");
  const header = headerLines.join("\n");
  const footer = `\n${FOOTER}`;
  const webHint = opts.webReportHint ? ` ${opts.webReportHint} で確認`
    : " 次回統合またはWebレポートで確認";

  // まず本文に収まる範囲でセクションを優先順に採用（決定論的順序で）。
  const budget = maxChars - header.length - footer.length;
  const included: AssembledSection[] = [];
  const includedHashes: string[] = [];
  const omittedHashes: string[] = [];
  let used = 0;
  let truncated = false;

  for (const section of allSections) {
    const block = `■ ${section.title}\n${section.body}\n`;
    // 省略注記の分の余白を残す（保守的に予約）。
    const reserve = 60;
    if (used + block.length + reserve <= budget) {
      included.push(section);
      includedHashes.push(...section.memberHashes);
      used += block.length;
      continue;
    }
    // 先頭セクションすら入らない極端なケースは、本文を安全に切り詰めて必ず何か残す。
    // 切り詰めた先頭セクションのメンバは delivered 扱い（無限再送を避ける／注記を出す）。
    if (included.length === 0) {
      const room = Math.max(
        0,
        budget - `■ ${section.title}\n`.length - TRUNCATION_SUFFIX.length - reserve,
      );
      const clippedBody = section.body.slice(0, room);
      included.push({ ...section, body: clippedBody });
      includedHashes.push(...section.memberHashes);
      truncated = true;
    }
    // 予算を超えたので、以降のセクションはすべて省略（下で集計）。
    break;
  }

  // 省略されたセクション（included に無いもの）を集計。
  const includedTitles = new Set(included.map((s) => s.title));
  const omittedSections = allSections.filter((s) => !includedTitles.has(s.title));
  for (const s of omittedSections) omittedHashes.push(...s.memberHashes);
  const omittedItemCount = omittedHashes.length;

  // 含まれた代表の重複だけ skip 対象にする（省略された代表の重複は pending 継続）。
  const includedHashSet = new Set(includedHashes);
  const skippedDuplicateHashes: string[] = [];
  for (const [repHash, dupHashes] of duplicatesByRepresentative) {
    if (includedHashSet.has(repHash)) skippedDuplicateHashes.push(...dupHashes);
  }

  const bodyLines: string[] = [];
  for (const { title, body } of included) {
    bodyLines.push(`■ ${title}`, body, "");
  }
  if (omittedItemCount > 0) {
    bodyLines.push(
      `※ ほか ${omittedItemCount} 件（${omittedSections.length} セクション）は文字数上限のため未掲載。${webHint}`,
      "",
    );
  }

  let message =
    header + bodyLines.join("\n") + (truncated ? TRUNCATION_SUFFIX : "") + footer;

  // 念のための最終ガード（想定外の長大入力でも上限を超えない）。
  if (message.length > maxChars) {
    message = message.slice(0, maxChars - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
    truncated = true;
  }

  return {
    message,
    sections: included.map((s) => ({ title: s.title, body: s.body })),
    includedHashes,
    omittedHashes,
    skippedDuplicateHashes,
    includedCount: includedHashes.length,
    droppedDuplicateCount,
    truncated,
    omittedSectionCount: omittedSections.length,
    omittedItemCount,
  };
}

// -------------------------------------------------------
// 秘匿値のリダクション
// -------------------------------------------------------

// 与えた秘匿値（トークン / userId 等）をテキストから伏字化する。
// 空値は無視。Bearer ヘッダ形式も保険で伏字化する。
export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue;
    out = out.split(secret).join("***REDACTED***");
  }
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/g, "Bearer ***REDACTED***");
  return out;
}

// -------------------------------------------------------
// トランスポート抽象（実送信を隔離）
// -------------------------------------------------------

// 送信結果の区別: dry-run / sent / credentials-missing / http-4xx / http-5xx / network-error
export type TransportOutcome =
  | "sent"
  | "dry-run"
  | "credentials-missing"
  | "http-4xx"
  | "http-5xx"
  | "network-error";

export type TransportResult = {
  ok: boolean;
  outcome: TransportOutcome;
  status?: number;
  error?: string; // redacted
};

export interface LineTransport {
  readonly mode: "dry-run" | "real";
  // LINE Messaging API の messages 配列（text または flex）をそのまま渡す。
  send(messages: object[]): Promise<TransportResult>;
}

// 実ネットワークを一切呼ばないドライラン。テスト/CI/未設定時に使用。
export class DryRunTransport implements LineTransport {
  readonly mode = "dry-run" as const;
  public readonly sent: object[][] = [];
  async send(messages: object[]): Promise<TransportResult> {
    this.sent.push(messages);
    return { ok: false, outcome: "dry-run" };
  }
}

// 資格情報が無いことを表す（実送信しない）トランスポート。
export class MissingCredentialsTransport implements LineTransport {
  readonly mode = "real" as const;
  async send(_messages: object[]): Promise<TransportResult> {
    return { ok: false, outcome: "credentials-missing" };
  }
}

// 実 LINE Messaging API を叩くトランスポート。
// 失敗時は throw せず TransportResult で返す（呼び出し側で非致命的に扱う）。
export class LineApiTransport implements LineTransport {
  readonly mode = "real" as const;
  constructor(
    private readonly token: string,
    private readonly userId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(messages: object[]): Promise<TransportResult> {
    try {
      const res = await this.fetchImpl("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ to: this.userId, messages }),
      });
      if (!res.ok) {
        const detail = redactSecrets(await res.text(), [this.token, this.userId]).slice(0, 300);
        const outcome: TransportOutcome = res.status >= 500 ? "http-5xx" : "http-4xx";
        return { ok: false, outcome, status: res.status, error: detail };
      }
      return { ok: true, outcome: "sent", status: res.status };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        outcome: "network-error",
        error: redactSecrets(raw, [this.token, this.userId]),
      };
    }
  }
}

// 環境変数からトランスポートを選択する。
//  - LINE_DRY_RUN=1 / NOTIFY_MODE=off → DryRun（実送信しない）
//  - 資格情報なし → MissingCredentials（実送信しない、credentials-missing を返す）
//  - それ以外 → 実 API
export function createTransport(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): LineTransport {
  const token = env.LINE_CHANNEL_TOKEN;
  const userId = env.LINE_USER_ID;
  const dryRun = env.LINE_DRY_RUN === "1" || env.NOTIFY_MODE === "off";
  if (dryRun) return new DryRunTransport();
  if (!token || !userId) return new MissingCredentialsTransport();
  return new LineApiTransport(token, userId, fetchImpl);
}
