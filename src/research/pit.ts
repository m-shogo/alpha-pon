// Research OS — PIT (Point-In-Time) 検査と Future Leakage 検知。
//
// 守るべき原則:
//   「その時点で公に入手できなかった情報を、その時点の判断に使っていないこと」
// observedAt（情報が公になった時刻）が全データの基準になる。

import type { Issue } from "./edge-registry.js";
import { parseExplicitIso8601Instant } from "./iso-instant.js";
import type { ResearchState } from "./types.js";

/** 東証の当日引け（JST 15:30）。same_close エントリの可否判定に使う。 */
export const TSE_CLOSE_JST_MINUTES = 15 * 60 + 30;

export function jstDateOf(isoDateTime: string): string {
  const instantMs = parseExplicitIso8601Instant(isoDateTime, "timestamp");
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instantMs));
}

export function jstMinutesOf(isoDateTime: string): number {
  const instantMs = parseExplicitIso8601Instant(isoDateTime, "timestamp");
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instantMs));
  const [hour, minute] = formatted.split(":").map(Number);
  return hour * 60 + minute;
}

/** observedAt の情報で当日引けエントリが可能か。引け後に出た開示で当日引け約定はできない。 */
export function canEnterSameClose(observedAt: string): boolean {
  return jstMinutesOf(observedAt) < TSE_CLOSE_JST_MINUTES;
}

function windowsOverlap(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
  return a.from <= b.to && b.from <= a.to;
}

function withinWindow(date: string, window: { from: string; to: string }): boolean {
  return date >= window.from && date <= window.to;
}

/**
 * PIT 違反・未来日付・Holdout 漏れを検査する。
 * `now` を引数で受けるのは、テストを決定論的にするため。
 */
export function checkPit(state: ResearchState, now: Date = new Date()): Issue[] {
  const issues: Issue[] = [];
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error("checkPit now must be a valid Date");
  }
  const nowIso = now.toISOString();
  const today = jstDateOf(nowIso);

  const future = (target: string, field: string, value: string) => {
    issues.push({
      severity: "error",
      code: "future_timestamp",
      target,
      message: `${field} が現在時刻より未来です: ${value}`,
    });
  };

  const instant = (target: string, field: string, value: string): number | null => {
    try {
      return parseExplicitIso8601Instant(value, field);
    } catch {
      issues.push({
        severity: "error",
        code: "invalid_timestamp",
        target,
        message: `${field} は明示タイムゾーン付きの実在する ISO 8601 日時である必要があります: ${value}`,
      });
      return null;
    }
  };

  const checkedJstDate = (target: string, field: string, value: string): string | null => {
    const valueMs = instant(target, field, value);
    if (valueMs === null) return null;
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(valueMs));
  };

  for (const edge of state.edges) {
    if (edge.createdAt > today) future(edge.id, "createdAt", edge.createdAt);
    if (edge.lastUpdate > today) future(edge.id, "lastUpdate", edge.lastUpdate);

    for (const [index, evidence] of (edge.evidence ?? []).entries()) {
      const target = `${edge.id}.evidence[${index}]`;
      const observedMs = instant(target, "observedAt", evidence.observedAt);
      if (observedMs !== null && observedMs > nowMs) future(target, "observedAt", evidence.observedAt);
      const observedDate = observedMs === null
        ? null
        : new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Asia/Tokyo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(observedMs));
      if (evidence.eventDate && observedDate !== null && observedDate < evidence.eventDate) {
        issues.push({
          severity: "error",
          code: "observed_before_event",
          target,
          message: `イベント日(${evidence.eventDate})より前に観測されたことになっています（observedAt: ${evidence.observedAt}）`,
        });
      }
    }

    // Holdout の隔離。研究期間と Holdout 期間が重なっていたら「未使用」を主張できない。
    const researchWindow = edge.holdout?.researchWindow;
    const holdoutWindow = edge.holdout?.holdoutWindow;
    if (researchWindow && holdoutWindow && windowsOverlap(researchWindow, holdoutWindow)) {
      issues.push({
        severity: "error",
        code: "holdout_overlap",
        target: edge.id,
        message: `研究期間 ${researchWindow.from}〜${researchWindow.to} と Holdout 期間 ${holdoutWindow.from}〜${holdoutWindow.to} が重なっています`,
      });
    }
  }

  const analogById = new Map(state.analogs.map((analog) => [analog.id, analog]));

  for (const analog of state.analogs) {
    const observedMs = instant(analog.id, "observedAt", analog.observedAt);
    if (observedMs !== null && observedMs > nowMs) future(analog.id, "observedAt", analog.observedAt);
    if (analog.recordedAt > today) future(analog.id, "recordedAt", analog.recordedAt);
    if (analog.eventDate > today) future(analog.id, "eventDate", analog.eventDate);

    const observedDate = observedMs === null
      ? null
      : new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(observedMs));
    if (observedDate !== null && observedDate < analog.eventDate) {
      issues.push({
        severity: "error",
        code: "observed_before_event",
        target: analog.id,
        message: `observedAt(${analog.observedAt}) がイベント日(${analog.eventDate})より前です`,
      });
    }

    if (analog.marketReaction) {
      const { measuredAt, horizonDays } = analog.marketReaction;
      if (measuredAt > today) future(analog.id, "marketReaction.measuredAt", measuredAt);
      if (measuredAt < analog.eventDate) {
        issues.push({
          severity: "error",
          code: "reaction_before_event",
          target: analog.id,
          message: `marketReaction.measuredAt(${measuredAt}) がイベント日より前です`,
        });
      }
      if (horizonDays > 0 && measuredAt === analog.eventDate) {
        issues.push({
          severity: "warning",
          code: "horizon_inconsistent",
          target: analog.id,
          message: `horizonDays=${horizonDays} なのに measuredAt がイベント当日です`,
        });
      }
    }

    if (analog.outcome) {
      if (analog.outcome.measuredAt > today) future(analog.id, "outcome.measuredAt", analog.outcome.measuredAt);
      if (analog.outcome.measuredAt < analog.eventDate) {
        issues.push({
          severity: "error",
          code: "outcome_before_event",
          target: analog.id,
          message: `outcome.measuredAt(${analog.outcome.measuredAt}) がイベント日より前です`,
        });
      }
      if (analog.outcome.verdict !== "unresolved" && analog.outcome.roiBps === undefined) {
        issues.push({
          severity: "warning",
          code: "outcome_without_roi",
          target: analog.id,
          message: "verdict が確定しているのに roiBps がありません",
        });
      }
    }
  }

  // 研究中の Edge が Holdout 期間の事例を参照していないか
  for (const edge of state.edges) {
    const holdoutWindow = edge.holdout?.holdoutWindow;
    if (!holdoutWindow) continue;
    for (const analogId of edge.analogIds ?? []) {
      const analog = analogById.get(analogId);
      if (!analog) continue;
      if (withinWindow(analog.eventDate, holdoutWindow)) {
        issues.push({
          severity: "error",
          code: "holdout_leak",
          target: `${edge.id} -> ${analogId}`,
          message: `Holdout 期間(${holdoutWindow.from}〜${holdoutWindow.to})の事例を研究中に参照しています`,
        });
      }
    }
  }

  for (const cf of state.counterfactuals) {
    const observedMs = instant(cf.id, "observedAt", cf.observedAt);
    if (observedMs !== null && observedMs > nowMs) future(cf.id, "observedAt", cf.observedAt);
    if (cf.recordedAt > today) future(cf.id, "recordedAt", cf.recordedAt);
  }
  for (const confounder of state.confounders) {
    if (confounder.recordedAt > today) future(confounder.id, "recordedAt", confounder.recordedAt);
  }
  if (state.checkpoint) {
    const savedMs = instant("checkpoint", "savedAt", state.checkpoint.savedAt);
    if (savedMs !== null && savedMs > nowMs) future("checkpoint", "savedAt", state.checkpoint.savedAt);
  }

  return issues;
}
