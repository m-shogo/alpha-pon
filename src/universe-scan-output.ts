import type { UniverseCandidate, UniverseFallbackReason, UniverseScanOutput, UniverseScanStatus } from "./universe.js";

export function buildUniverseScanOutput(input: {
  generatedAt: string;
  dataSource: "jquants" | "mock";
  scanStatus: UniverseScanStatus;
  fallbackReason?: UniverseFallbackReason | null;
  candidates: UniverseCandidate[];
}): UniverseScanOutput {
  return {
    generatedAt: input.generatedAt,
    dataSource: input.dataSource,
    scanStatus: input.scanStatus,
    fallbackReason: input.fallbackReason ?? null,
    count: input.candidates.length,
    candidates: input.candidates,
  };
}
