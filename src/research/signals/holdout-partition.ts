// Research OS — Holdout Vault によるサンプル分割 v1。
//
// 目的:
//   封印期間のサンプルが検証へ紛れ込むのを **データの入口で** 止める。
//
// なぜ必要か:
//   research/holdout/vault.manifest.json は 2025-07-01〜2026-06-30 を封印し、
//   promotion.ts は holdoutPass gate を主張するとき access_log の記録を要求する。
//   しかし **backtest / event study が封印期間のデータを使うこと自体は
//   誰も止めていなかった**。気づかずに使えば、最後の1回の検証が失われる。
//
// 方針:
//   - 既定では封印期間のサンプルを除外する。除外件数を必ず返す。
//     黙って n が減ると、報告される標本数が実態と食い違う。
//   - 開封するには window id の指定に加えて **access_log の記録が必要**。
//     記録が無い開封要求は拒否する（「開けたことにする」を作らない）。
//   - 判定は純関数。ファイル読み込みは呼び出し側が行う。

export interface HoldoutWindow {
  id: string;
  from: string;
  to: string;
  scope: "all_universe" | "named_codes";
  codes?: string[];
  notes?: string;
}

export interface HoldoutVaultManifest {
  schemaVersion: 1;
  sealedAt: string;
  policy: string;
  windows: HoldoutWindow[];
}

export interface HoldoutAccessRecord {
  id: string;
  edgeId: string;
  windowId: string;
  openedAt: string;
  actor: string;
  purpose: string;
  result: string;
}

export interface HoldoutSample {
  id: string;
  code: string;
  date: string;
}

export interface HoldoutPartitionInput {
  samples: readonly HoldoutSample[];
  manifest: HoldoutVaultManifest;
  /** 開封を要求する window id。access_log に記録が無ければ拒否する。 */
  requestedWindowIds?: readonly string[];
  /** access_log の内容。requestedWindowIds の検証に使う。 */
  accessLog?: readonly HoldoutAccessRecord[];
  /** 指定すると、その Edge の開封記録だけを有効とみなす。 */
  edgeId?: string;
}

export interface HoldoutExclusion {
  sample: HoldoutSample;
  windowId: string;
}

export interface HoldoutPartitionResult {
  /** 封印期間外。通常の検証に使ってよい。 */
  research: HoldoutSample[];
  /** 明示的に開封した window に属し、使用が許可されたサンプル。 */
  opened: HoldoutSample[];
  /** 封印されたままなので除外したサンプル。 */
  excluded: HoldoutExclusion[];
  /** window ごとに何件が該当したか。 */
  hitCountByWindowId: Record<string, number>;
  openedWindowIds: string[];
  warnings: string[];
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, label: string): string {
  if (!ISO_DATE_PATTERN.test(value)) throw new Error(`${label} must be YYYY-MM-DD: ${value}`);
  return value;
}

function assertManifest(manifest: HoldoutVaultManifest): void {
  if (manifest.schemaVersion !== 1) throw new Error("holdout manifest schemaVersion must be 1");
  if (!Array.isArray(manifest.windows) || manifest.windows.length === 0) {
    throw new Error("holdout manifest must declare at least one window");
  }
  const seen = new Set<string>();
  for (const window of manifest.windows) {
    if (typeof window.id !== "string" || window.id.trim() === "") {
      throw new Error("holdout window id must be a non-empty string");
    }
    if (seen.has(window.id)) throw new Error(`duplicate holdout window id: ${window.id}`);
    seen.add(window.id);
    assertIsoDate(window.from, `holdout window ${window.id}.from`);
    assertIsoDate(window.to, `holdout window ${window.id}.to`);
    if (window.from > window.to) {
      throw new Error(`holdout window ${window.id}: from must be on or before to`);
    }
    if (window.scope === "named_codes" && (!window.codes || window.codes.length === 0)) {
      throw new Error(`holdout window ${window.id}: named_codes scope requires codes`);
    }
  }
}

function windowCovers(window: HoldoutWindow, sample: HoldoutSample): boolean {
  if (sample.date < window.from || sample.date > window.to) return false;
  if (window.scope === "all_universe") return true;
  return (window.codes ?? []).includes(sample.code);
}

/**
 * サンプルを封印期間で分割する。
 *
 * 既定では封印期間のサンプルを除外し、除外件数を返す。
 * 開封するには window id の指定と access_log の記録の両方が必要。
 */
export function partitionByHoldout(input: HoldoutPartitionInput): HoldoutPartitionResult {
  assertManifest(input.manifest);
  for (const sample of input.samples) {
    assertIsoDate(sample.date, `holdout sample ${sample.id}.date`);
  }

  const windowsById = new Map(input.manifest.windows.map((window) => [window.id, window]));
  const requested = [...new Set(input.requestedWindowIds ?? [])].sort();
  const accessLog = input.accessLog ?? [];

  // 「開けたことにする」を作らない。記録の無い開封要求は拒否する。
  for (const windowId of requested) {
    if (!windowsById.has(windowId)) {
      throw new Error(`unknown holdout window id: ${windowId}`);
    }
    const matched = accessLog.filter(
      (record) => record.windowId === windowId
        && (input.edgeId === undefined || record.edgeId === input.edgeId),
    );
    if (matched.length === 0) {
      throw new Error(
        `holdout window ${windowId} cannot be opened without an access_log record`
        + (input.edgeId === undefined ? "" : ` for edge ${input.edgeId}`),
      );
    }
  }
  const openedWindowIds = new Set(requested);

  const research: HoldoutSample[] = [];
  const opened: HoldoutSample[] = [];
  const excluded: HoldoutExclusion[] = [];
  const hitCountByWindowId: Record<string, number> = {};
  for (const window of input.manifest.windows) hitCountByWindowId[window.id] = 0;

  for (const sample of input.samples) {
    const window = input.manifest.windows.find((one) => windowCovers(one, sample));
    if (!window) {
      research.push(sample);
      continue;
    }
    hitCountByWindowId[window.id] += 1;
    if (openedWindowIds.has(window.id)) opened.push(sample);
    else excluded.push({ sample, windowId: window.id });
  }

  const warnings: string[] = [];
  if (excluded.length > 0) {
    warnings.push(
      `封印期間のため ${excluded.length} 件を除外しました。`
      + `報告する標本数は research ${research.length} 件です`,
    );
  }
  if (opened.length > 0) {
    warnings.push(
      `Holdout を開封して ${opened.length} 件を使用しています（window: ${[...openedWindowIds].join(", ")}）。`
      + "この検証はやり直せません",
    );
  }

  return {
    research,
    opened,
    excluded,
    hitCountByWindowId,
    openedWindowIds: [...openedWindowIds],
    warnings,
  };
}
