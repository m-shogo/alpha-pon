// LINE統合通知の中核ロジック（純関数 + トランスポート抽象）。
//
// 責務:
//  - 各パイプラインステップが LINE_BATCH_DIR に書き出したテキスト断片を
//    セクションごとに分類・重複排除し、決定論的に1通へ統合する。
//  - 実ネットワーク送信は Transport 抽象に隔離し、テスト/ドライランでは
//    実 LINE API を呼ばない。
//  - トークン等の秘匿値をログ・エラー・生成物へ出さない。
//
// このファイルは副作用のない純関数を中心に構成し、テスト可能にしている。
// 実行時 CLI ラッパは src/send-consolidated-line.ts。

// LINEテキストメッセージの安全上限（実上限5000文字に対し余裕を持たせる）。
export const LINE_MAX_CHARS = 4900;

// 断片の先頭行から論理セクションを判定するためのマッピング。
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

// 統合後は不要になる各断片の定型ヘッダ/フッタ行。
const NOISE_LINES = [
  "5分朝刊 / 重要な変化だけ",
  "個人重点・特殊状況だけ優先確認",
  "本当に重要そうなものだけ / 売買推奨なし",
  "事実/一次情報ベース。売買推奨なし。",
  "重要イベントだけ通知 / 売買推奨なし",
  "━━━━━━━━━━━━",
];

// 各断片に含まれる免責文言（統合メッセージ末尾に1回だけ付与するため除去）。
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

export type ParsedEntry = {
  /** 正規化された論理セクション名。 */
  section: string;
  /** ヘッダ/免責を除いた本文。 */
  body: string;
  /** 重複排除に使う正規化キー。 */
  key: string;
};

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

// 生テキスト断片列 → 分類済みエントリ列。空本文は除外する。
export function parseEntries(rawTexts: string[]): ParsedEntry[] {
  return rawTexts
    .map((raw) => {
      const section = detectSection(raw) ?? OTHER_SECTION;
      const body = stripSectionTitle(stripHeaderAndFooter(raw));
      return { section, body, key: normalizeKey(section, body) };
    })
    .filter((e) => e.body.length > 0);
}

// 同一論理キーの断片を1回だけ残す（入力順序に依らず安定）。
// 先勝ち（最初に現れたものを採用）。
export function dedupeEntries(entries: ParsedEntry[]): {
  kept: ParsedEntry[];
  droppedDuplicateCount: number;
} {
  const seen = new Set<string>();
  const kept: ParsedEntry[] = [];
  let dropped = 0;
  for (const e of entries) {
    if (seen.has(e.key)) {
      dropped += 1;
      continue;
    }
    seen.add(e.key);
    kept.push(e);
  }
  return { kept, droppedDuplicateCount: dropped };
}

export type ConsolidatedSection = { title: string; body: string };

export type BuildResult = {
  /** 送信すべき統合本文。送る内容が無い場合は null。 */
  message: string | null;
  sections: ConsolidatedSection[];
  includedCount: number;
  droppedDuplicateCount: number;
  /** 文字数上限で末尾を切り詰めたか。 */
  truncated: boolean;
  /** 上限超過により丸ごと落ちたセクション数。 */
  omittedSectionCount: number;
};

export type BuildOptions = {
  today: string;
  maxChars?: number;
  /** 即時通知済みの緊急件数（本文に「即時通知済み」として1行参照する）。 */
  immediateUrgentCount?: number;
};

// エントリ列を優先順位付きセクションへ組み立てる（純関数）。
function assembleSections(entries: ParsedEntry[]): ConsolidatedSection[] {
  const themeEntries = entries.filter((e) => isThemeSection(e.section));
  const otherEntries = entries.filter((e) => !isThemeSection(e.section));

  const sections: ConsolidatedSection[] = [];
  for (const title of SECTION_ORDER) {
    const matching = otherEntries.filter((e) => e.section === title);
    if (matching.length > 0) {
      sections.push({ title, body: matching.map((e) => e.body).join("\n\n") });
    }
  }

  if (themeEntries.length > 0) {
    const themeBody = themeEntries
      .map((e) => `${e.section}\n${e.body}`)
      .join("\n\n");
    sections.push({ title: THEME_SECTION_TITLE, body: themeBody });
  }

  return sections;
}

const HEADER_PREFIX = "🌅 Alpha Pon 朝刊";
const FOOTER =
  "※売買推奨ではありません。未確認は一次情報不足として扱います。";
const TRUNCATION_SUFFIX = "\n\n…（続きはWebで確認）";

// 断片列から1通の統合メッセージを決定論的に組み立てる。
// 文字数上限超過時は、優先順位の高いセクションを残しつつ末尾を切り詰め、
// 落とした分は omittedSectionCount / truncated で可視化する（全消失させない）。
export function buildConsolidatedMessage(
  rawTexts: string[],
  opts: BuildOptions,
): BuildResult {
  const maxChars = opts.maxChars ?? LINE_MAX_CHARS;
  const parsed = parseEntries(rawTexts);
  const { kept, droppedDuplicateCount } = dedupeEntries(parsed);
  const allSections = assembleSections(kept);

  const immediateNote =
    opts.immediateUrgentCount && opts.immediateUrgentCount > 0
      ? `🚨 緊急 ${opts.immediateUrgentCount} 件は即時通知済み`
      : null;

  if (allSections.length === 0 && !immediateNote) {
    return {
      message: null,
      sections: [],
      includedCount: 0,
      droppedDuplicateCount,
      truncated: false,
      omittedSectionCount: 0,
    };
  }

  const headerLines = [`${HEADER_PREFIX} ${opts.today}`, ""];
  if (immediateNote) headerLines.push(immediateNote, "");
  const header = headerLines.join("\n");
  const footer = `\n${FOOTER}`;

  // 上限に収まる範囲でセクションを優先順に採用する。
  const budget = maxChars - header.length - footer.length;
  const included: ConsolidatedSection[] = [];
  let used = 0;
  let omitted = 0;
  let truncated = false;

  for (const section of allSections) {
    const block = `■ ${section.title}\n${section.body}\n`;
    if (used + block.length <= budget) {
      included.push(section);
      used += block.length;
      continue;
    }
    // 先頭セクションすら入らない極端なケースは、本文を安全に切り詰めて必ず何か残す。
    if (included.length === 0) {
      const room = Math.max(0, budget - `■ ${section.title}\n`.length - TRUNCATION_SUFFIX.length);
      const clippedBody = section.body.slice(0, room);
      included.push({ title: section.title, body: clippedBody });
      truncated = true;
    }
    omitted = allSections.length - included.length;
    break;
  }

  const bodyLines: string[] = [];
  for (const { title, body } of included) {
    bodyLines.push(`■ ${title}`, body, "");
  }

  let message = header + bodyLines.join("\n") + (truncated ? TRUNCATION_SUFFIX : "") + footer;

  // 念のための最終ガード（想定外の長大入力でも上限を超えない）。
  if (message.length > maxChars) {
    message = message.slice(0, maxChars - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
    truncated = true;
  }

  return {
    message,
    sections: included,
    includedCount: kept.length,
    droppedDuplicateCount,
    truncated,
    omittedSectionCount: omitted,
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

export type TransportResult =
  | { ok: true; mode: "dry-run" | "sent" }
  | { ok: false; mode: "sent"; status?: number; error: string };

export interface LineTransport {
  readonly mode: "dry-run" | "real";
  send(message: string): Promise<TransportResult>;
}

// 実ネットワークを一切呼ばないドライラン。テスト/CI/未設定時に使用。
export class DryRunTransport implements LineTransport {
  readonly mode = "dry-run" as const;
  public readonly sent: string[] = [];
  async send(message: string): Promise<TransportResult> {
    this.sent.push(message);
    return { ok: true, mode: "dry-run" };
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

  async send(message: string): Promise<TransportResult> {
    try {
      const res = await this.fetchImpl("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ to: this.userId, messages: [{ type: "text", text: message }] }),
      });
      if (!res.ok) {
        const detail = redactSecrets(await res.text(), [this.token, this.userId]);
        return { ok: false, mode: "sent", status: res.status, error: detail.slice(0, 300) };
      }
      return { ok: true, mode: "sent" };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return { ok: false, mode: "sent", error: redactSecrets(raw, [this.token, this.userId]) };
    }
  }
}

// 環境変数からトランスポートを選択する。
//  - LINE_DRY_RUN=1 / NOTIFY_MODE=off / 資格情報なし → DryRun（実送信しない）
//  - それ以外 → 実 API
export function createTransport(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): LineTransport {
  const token = env.LINE_CHANNEL_TOKEN;
  const userId = env.LINE_USER_ID;
  const dryRun = env.LINE_DRY_RUN === "1" || env.NOTIFY_MODE === "off";
  if (dryRun || !token || !userId) {
    return new DryRunTransport();
  }
  return new LineApiTransport(token, userId, fetchImpl);
}
