import { addDaysJst, todayJst } from "./date.js";
import type { UniverseCandidate, UniverseFallbackReason, UniverseScanOutput, UniverseScanStatus } from "./universe.js";

function assertCanonicalDate(value: string): void {
  try {
    if (addDaysJst(value, 0) !== value) throw new Error();
  } catch {
    throw new Error("universe scan generatedAt must be a real YYYY-MM-DD date");
  }
  if (value > todayJst()) {
    throw new Error("universe scan generatedAt must not be in the future");
  }
}

function assertCandidateChronology(candidates: UniverseCandidate[], generatedAt: string): void {
  for (const candidate of candidates) {
    try {
      if (addDaysJst(candidate.detectedAt, 0) !== candidate.detectedAt) throw new Error();
    } catch {
      throw new Error("universe scan candidate detectedAt must be a real YYYY-MM-DD date");
    }
    if (candidate.detectedAt > generatedAt) {
      throw new Error("universe scan candidate detectedAt must not be after generatedAt");
    }
  }
}

function assertUniverseScanMetadata(input: {
  dataSource: "jquants" | "mock";
  scanStatus: UniverseScanStatus;
  fallbackReason?: UniverseFallbackReason | null;
}): void {
  const fallbackReason = input.fallbackReason ?? null;
  if (input.dataSource === "mock") {
    if (input.scanStatus !== "mock" || fallbackReason !== null) {
      throw new Error("mock universe scan metadata is inconsistent");
    }
    return;
  }

  if (input.scanStatus === "mock") {
    throw new Error("jquants universe scan must not use mock status");
  }
  if (input.scanStatus === "stale_fallback") {
    if (fallbackReason !== "jquants_zero_candidates") {
      throw new Error("stale universe scan requires jquants_zero_candidates fallback reason");
    }
    return;
  }
  if (fallbackReason !== null) {
    throw new Error("fresh universe scan must not carry a fallback reason");
  }
}

export function buildUniverseScanOutput(input: {
  generatedAt: string;
  dataSource: "jquants" | "mock";
  scanStatus: UniverseScanStatus;
  fallbackReason?: UniverseFallbackReason | null;
  candidates: UniverseCandidate[];
}): UniverseScanOutput {
  assertCanonicalDate(input.generatedAt);
  assertUniverseScanMetadata(input);
  assertCandidateChronology(input.candidates, input.generatedAt);
  if (input.candidates.some(candidate => candidate.dataSource !== input.dataSource)) {
    throw new Error("universe scan candidate provenance must match output dataSource");
  }

  return {
    generatedAt: input.generatedAt,
    dataSource: input.dataSource,
    scanStatus: input.scanStatus,
    fallbackReason: input.fallbackReason ?? null,
    count: input.candidates.length,
    candidates: input.candidates,
  };
}
