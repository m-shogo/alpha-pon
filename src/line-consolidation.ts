// LINE統合通知の中核ロジック（純関数 + transport抽象）。

export const LINE_MAX_CHARS = 4900;

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

const NOISE_LINES = [
  "5分朝刊 / 重要な変化だけ",
  "個人重点・特殊状況だけ優先確認",
  "本当に重要そうなものだけ / 売買推奨なし",
  "事実/一次情報ベース。売買推奨なし。",
  "重要イベントだけ通知 / 売買推奨なし",
  "━━━━━━━━━━━━",
];

const DISCLAIMER_PATTERNS = [
  /^※売買推奨ではありません/,
  /^※報道・噂/,
  /^※事実・報道・噂/,
  /^データ取得やレポート生成に注意があります/,
];

const THEME_SECTIONS = ["🤖 AI", "🔧 半導体", "🚀 宇宙", "🎮 ゲーム"];

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
    if (firstLine.includes(prefix)) return lines.slice(1).join("\n").trim();
  }
  return text;
}

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

export type BatchFragment = {
  hash: string;
  section: string;
  body: string;
};

type WithKey = BatchFragment & { key: string };

export function parseFragmentText(raw: string): { section: string; body: string } {
  const section = detectSection(raw) ?? OTHER_SECTION;
  const body = stripSectionTitle(stripHeaderAndFooter(raw));
  return { section, body };
}

export function fragmentsFromRaw(rawTexts: string[], hashFn: (t: string) => string): BatchFragment[] {
  return rawTexts
    .map((raw) => {
      const { section, body } = parseFragmentText(raw);
      return { hash: hashFn(raw), section, body };
    })
    .filter((f) => f.body.length > 0);
}

function byKeyThenHash(a: WithKey, b: WithKey): number {
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  if (a.hash < b.hash) return -1;
  if (a.hash > b.hash) return 1;
  return 0;
}

export type DedupeResult = {
  representatives: WithKey[];
  duplicatesByRepresentative: Map<string, string[]>;
  droppedDuplicateCount: number;
};

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

type DisplayMember = { hash: string; rendered: string };
type DisplayGroup = { title: string; members: DisplayMember[] };

function assembleGroups(reps: WithKey[]): DisplayGroup[] {
  const themeReps = reps.filter((r) => isThemeSection(r.section)).sort(byKeyThenHash);
  const otherReps = reps.filter((r) => !isThemeSection(r.section));
  const groups: DisplayGroup[] = [];

  for (const title of SECTION_ORDER) {
    const members = otherReps
      .filter((r) => r.section === title)
      .sort(byKeyThenHash)
      .map((m) => ({ hash: m.hash, rendered: m.body }));
    if (members.length > 0) groups.push({ title, members });
  }

  if (themeReps.length > 0) {
    groups.push({
      title: THEME_SECTION_TITLE,
      members: themeReps.map((r) => ({ hash: r.hash, rendered: `${r.section}\n${r.body}` })),
    });
  }
  return groups;
}

function renderBody(groups: Array<{ title: string; members: DisplayMember[] }>): string {
  return groups
    .filter((g) => g.members.length > 0)
    .map((g) => `■ ${g.title}\n${g.members.map((m) => m.rendered).join("\n\n")}`)
    .join("\n\n");
}

export type BuildResult = {
  message: string | null;
  sections: Array<{ title: string; body: string }>;
  includedHashes: string[];
  omittedHashes: string[];
  oversizedHashes: string[];
  skippedDuplicateHashes: string[];
  includedCount: number;
  includedSectionCount: number;
  droppedDuplicateCount: number;
  truncated: boolean;
  omittedSectionCount: number;
  omittedItemCount: number;
};

export type BuildOptions = {
  today: string;
  maxChars?: number;
  immediateUrgentCount?: number;
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
    oversizedHashes: [],
    skippedDuplicateHashes: [],
    includedCount: 0,
    includedSectionCount: 0,
    truncated: false,
    omittedSectionCount: 0,
    omittedItemCount: 0,
  };
}

export function buildConsolidatedMessage(
  fragments: BatchFragment[],
  opts: BuildOptions,
): BuildResult {
  const maxChars = opts.maxChars ?? LINE_MAX_CHARS;
  const { representatives, duplicatesByRepresentative, droppedDuplicateCount } = dedupeFragments(fragments);
  const groups = assembleGroups(representatives);
  const allMemberCount = groups.reduce((n, g) => n + g.members.length, 0);

  const immediateNote =
    opts.immediateUrgentCount && opts.immediateUrgentCount > 0
      ? `🚨 緊急 ${opts.immediateUrgentCount} 件は即時通知済み`
      : null;

  if (allMemberCount === 0 && !immediateNote) {
    return { message: null, droppedDuplicateCount, ...emptyResultBase() };
  }

  const headerLines = [`${HEADER_PREFIX} ${opts.today}`, ""];
  if (immediateNote) headerLines.push(immediateNote, "");
  const header = headerLines.join("\n");
  const footer = `\n${FOOTER}`;
  const webHint = opts.webReportHint ? ` ${opts.webReportHint} で確認` : " 次回統合またはWebレポートで確認";

  const flat: Array<{ groupIdx: number; member: DisplayMember }> = [];
  groups.forEach((g, gi) => g.members.forEach((m) => flat.push({ groupIdx: gi, member: m })));

  const noteFor = (omittedItems: number, omittedGroups: number): string =>
    omittedItems > 0
      ? `\n\n※ ほか ${omittedItems} 件（${omittedGroups} セクション）は文字数上限または単体超過のため未掲載。pendingとして次回統合へ持ち越し、${webHint.trim()}。`
      : "";

  const renderFor = (sel: Set<number>): string => {
    let cursor = 0;
    const shown = groups.map((g) => {
      const members = g.members.filter(() => sel.has(cursor++));
      return { title: g.title, members };
    });
    return renderBody(shown);
  };

  const omittedInfo = (sel: Set<number>) => {
    const omitted: string[] = [];
    const omittedGroupSet = new Set<number>();
    flat.forEach((u, i) => {
      if (!sel.has(i)) {
        omitted.push(u.member.hash);
        omittedGroupSet.add(u.groupIdx);
      }
    });
    return { omittedHashes: omitted, omittedGroups: omittedGroupSet.size };
  };

  const maxNoteLen = noteFor(allMemberCount, groups.length).length;
  const fits = (sel: Set<number>): boolean =>
    header.length + renderFor(sel).length + maxNoteLen + footer.length <= maxChars;

  const selected = new Set<number>();
  const oversized = new Set<number>();
  let truncated = false;
  let clippedBody: string | null = null;

  for (let i = 0; i < flat.length; i++) {
    const alone = new Set<number>([i]);
    if (!fits(alone)) {
      oversized.add(i);
      continue;
    }

    const candidate = new Set(selected);
    candidate.add(i);
    if (fits(candidate)) selected.add(i);
    // 収まらなくてもbreakしない。後続の小さいfragmentを検討する。
  }

  // 総fragmentが1件だけなら従来どおり切り詰めて送る。
  if (flat.length === 1 && selected.size === 0 && oversized.has(0)) {
    const gi = flat[0].groupIdx;
    const room = Math.max(
      0,
      maxChars - header.length - footer.length -
        `■ ${groups[gi].title}\n`.length - TRUNCATION_SUFFIX.length,
    );
    clippedBody = flat[0].member.rendered.slice(0, room);
    selected.add(0);
    oversized.delete(0);
    truncated = true;
  }

  const includedHashes = flat
    .filter((_, i) => selected.has(i))
    .map((u) => u.member.hash);
  const oversizedHashes = flat
    .filter((_, i) => oversized.has(i))
    .map((u) => u.member.hash);
  const { omittedHashes, omittedGroups } = omittedInfo(selected);
  const omittedItemCount = omittedHashes.length;

  const includedHashSet = new Set(includedHashes);
  const skippedDuplicateHashes: string[] = [];
  for (const [repHash, dupHashes] of duplicatesByRepresentative) {
    if (includedHashSet.has(repHash)) skippedDuplicateHashes.push(...dupHashes);
  }

  const shownGroupCount = new Set(
    flat.filter((_, i) => selected.has(i)).map((u) => u.groupIdx),
  ).size;

  // 通常fragmentが全件未掲載なら、省略案内だけのLINEは送らない。
  if (selected.size === 0 && !immediateNote) {
    return {
      message: null,
      sections: [],
      includedHashes,
      omittedHashes,
      oversizedHashes,
      skippedDuplicateHashes,
      includedCount: 0,
      includedSectionCount: 0,
      droppedDuplicateCount,
      truncated: false,
      omittedSectionCount: omittedGroups,
      omittedItemCount,
    };
  }

  let body = "";
  if (clippedBody !== null) {
    const gi = flat[0].groupIdx;
    body = `■ ${groups[gi].title}\n${clippedBody}`;
  } else {
    body = renderFor(selected);
  }

  const note = noteFor(omittedItemCount, omittedGroups);
  let message = header + body + note + (truncated ? TRUNCATION_SUFFIX : "") + footer;

  if (message.length > maxChars) {
    message = message.slice(0, Math.max(0, maxChars - TRUNCATION_SUFFIX.length)) + TRUNCATION_SUFFIX;
    truncated = true;
  }

  return {
    message,
    sections: [],
    includedHashes,
    omittedHashes,
    oversizedHashes,
    skippedDuplicateHashes,
    includedCount: includedHashes.length,
    includedSectionCount: shownGroupCount,
    droppedDuplicateCount,
    truncated,
    omittedSectionCount: omittedGroups,
    omittedItemCount,
  };
}

export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue;
    out = out.split(secret).join("***REDACTED***");
  }
  return out.replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/g, "Bearer ***REDACTED***");
}

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
  error?: string;
};

export function consumesRetryBudget(outcome: TransportOutcome): boolean {
  return outcome === "http-4xx" || outcome === "http-5xx" || outcome === "network-error";
}

export interface LineTransport {
  readonly mode: "dry-run" | "real";
  send(messages: object[]): Promise<TransportResult>;
}

export class DryRunTransport implements LineTransport {
  readonly mode = "dry-run" as const;
  public readonly sent: object[][] = [];
  async send(messages: object[]): Promise<TransportResult> {
    this.sent.push(messages);
    return { ok: false, outcome: "dry-run" };
  }
}

export class MissingCredentialsTransport implements LineTransport {
  readonly mode = "real" as const;
  async send(_messages: object[]): Promise<TransportResult> {
    return { ok: false, outcome: "credentials-missing" };
  }
}

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
