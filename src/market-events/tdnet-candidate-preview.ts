import type { TdnetDisclosureSnapshot } from "../fetcher/jpx.js";
import {
  extractTdnetMarketEventCandidates,
  type TdnetCandidateBlocker,
  type TdnetMarketEventCandidate,
} from "./tdnet-event-candidates.js";

export type TdnetCandidatePreview = {
  observationDate: string;
  explicitEmpty: boolean;
  pageCount: number;
  pageUrls: string[];
  disclosureCount: number;
  candidateCount: number;
  unmatchedDisclosureCount: number;
  registrationReadyCount: 0;
  blockerCounts: Record<TdnetCandidateBlocker, number>;
  candidates: TdnetMarketEventCandidate[];
};

function emptyBlockerCounts(): Record<TdnetCandidateBlocker, number> {
  return {
    future_event_time_not_explicit: 0,
    stable_occurrence_key_not_established: 0,
    primary_document_review_required: 0,
  };
}

export function buildTdnetCandidatePreview(
  snapshot: TdnetDisclosureSnapshot,
): TdnetCandidatePreview {
  if (snapshot.explicitEmpty && snapshot.disclosures.length > 0) {
    throw new Error("TDnet preview cannot be explicit-empty while containing disclosures");
  }
  if (snapshot.disclosures.length === 0 && !snapshot.explicitEmpty) {
    throw new Error("TDnet preview requires explicit-empty proof when disclosure count is zero");
  }
  if (!Number.isInteger(snapshot.pageCount) || snapshot.pageCount < 1) {
    throw new Error("TDnet preview requires a positive pageCount");
  }
  if (snapshot.pageUrls.length !== snapshot.pageCount) {
    throw new Error("TDnet preview pageUrls must match pageCount");
  }

  const candidates = extractTdnetMarketEventCandidates(snapshot.disclosures);
  const blockerCounts = emptyBlockerCounts();
  for (const candidate of candidates) {
    if (candidate.registrationReady !== false) {
      throw new Error(`TDnet candidate unexpectedly became registration-ready: ${candidate.candidateId}`);
    }
    for (const blocker of candidate.blockers) blockerCounts[blocker] += 1;
  }

  return {
    observationDate: snapshot.observationDate,
    explicitEmpty: snapshot.explicitEmpty,
    pageCount: snapshot.pageCount,
    pageUrls: [...snapshot.pageUrls],
    disclosureCount: snapshot.disclosures.length,
    candidateCount: candidates.length,
    unmatchedDisclosureCount: snapshot.disclosures.length - candidates.length,
    registrationReadyCount: 0,
    blockerCounts,
    candidates,
  };
}
