import {
  buildMarketEventBundle,
  type MarketEventRegistrationInput,
} from "./registration.js";
import type {
  MarketEventBundle,
  MarketEventPriority,
} from "./contracts.js";
import type { TdnetMarketEventCandidate } from "./tdnet-event-candidates.js";
import type { TdnetPrimaryReviewAssessment } from "./tdnet-primary-review.js";

export type TdnetFutureEventStatus = "SCHEDULED" | "TENTATIVE";

export type TdnetRegistrationPreviewMetadata = {
  eventTitle: string;
  status: TdnetFutureEventStatus;
  priority: MarketEventPriority;
  whyItMatters: string;
  checksBefore?: string[];
  checksAfter?: string[];
  relatedEventIds?: string[];
  staleAfter?: string | null;
};

export type TdnetRegistrationPreview = {
  input: MarketEventRegistrationInput;
  bundle: MarketEventBundle;
};

function requiredText(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${fieldName} is required`);
  return normalized;
}

function assertOfficialTdnetSourceUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("TDnet registration preview requires an official TDnet source URL");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== "www.release.tdnet.info"
    || !parsed.pathname.startsWith("/inbs/")
  ) {
    throw new Error("TDnet registration preview requires an official TDnet source URL");
  }
}

function assertTdnetSourceCodeProvenance(candidate: TdnetMarketEventCandidate): void {
  if (candidate.sourceCode === null) return;

  const sourceCode = candidate.sourceCode.trim().toUpperCase();
  if (!/^[0-9A-Z]{4,5}$/.test(sourceCode)) {
    throw new Error("TDnet registration preview has invalid sourceCode provenance");
  }
  if (candidate.issuerCode.trim().toUpperCase() !== sourceCode.slice(0, 4)) {
    throw new Error("TDnet registration preview sourceCode does not match issuerCode");
  }
}

export function prepareTdnetRegistrationPreview(
  candidate: TdnetMarketEventCandidate,
  assessment: TdnetPrimaryReviewAssessment,
  metadata: TdnetRegistrationPreviewMetadata,
): TdnetRegistrationPreview {
  if (assessment.candidateId !== candidate.candidateId) {
    throw new Error("TDnet registration preview candidateId mismatch");
  }
  if (assessment.outcome !== "FUTURE_EVENT_CONFIRMED") {
    throw new Error(`TDnet registration preview requires FUTURE_EVENT_CONFIRMED, got ${assessment.outcome}`);
  }
  if (!assessment.registrationPreviewReady || assessment.blockers.length > 0) {
    throw new Error(`TDnet registration preview is blocked: ${assessment.blockers.join(",") || "review_not_ready"}`);
  }

  assertOfficialTdnetSourceUrl(candidate.sourceUrl);
  assertTdnetSourceCodeProvenance(candidate);

  const reviewed = assessment.normalized;
  if (
    reviewed.eventType === null
    || reviewed.occurrenceKey === null
    || reviewed.time === null
    || reviewed.time.precision === "UNKNOWN"
    || reviewed.sourceContentHash === null
    || reviewed.sourceRetrievedAt === null
  ) {
    throw new Error("TDnet ready assessment is missing required registration facts");
  }

  const eventTitle = requiredText(metadata.eventTitle, "eventTitle");
  const whyItMatters = requiredText(metadata.whyItMatters, "whyItMatters");

  const input: MarketEventRegistrationInput = {
    issuerCode: candidate.issuerCode || null,
    issuerName: candidate.issuerName,
    eventType: reviewed.eventType,
    occurrenceKey: reviewed.occurrenceKey,
    title: eventTitle,
    status: metadata.status,
    priority: metadata.priority,
    time: reviewed.time,
    edgeTypes: [],
    currentDecisionState: "INFO",
    whyItMatters,
    checksBefore: metadata.checksBefore ?? [],
    checksAfter: metadata.checksAfter ?? [],
    relatedEventIds: metadata.relatedEventIds ?? [],
    lastVerifiedAt: reviewed.reviewedAt,
    staleAfter: metadata.staleAfter ?? null,
    observedAt: reviewed.reviewedAt,
    publishedAt: candidate.disclosurePublishedAt,
    effectiveAt: null,
    firstExecutableAt: null,
    changeType: "CREATED",
    facts: {
      tdnetCandidateId: candidate.candidateId,
      tdnetSourceCode: candidate.sourceCode,
      tdnetMatchedSignals: [...candidate.matchedSignals],
      sourcePublicationIsEventTime: false,
    },
    sources: [{
      authority: "TDNET",
      sourceType: "TDNET",
      url: candidate.sourceUrl,
      title: candidate.disclosureTitle,
      publishedAt: candidate.disclosurePublishedAt,
      retrievedAt: reviewed.sourceRetrievedAt,
      contentHash: reviewed.sourceContentHash,
      storageClass: "METADATA_ONLY",
      objectKey: null,
    }],
    decision: null,
    deliveries: [],
  };

  const bundle = buildMarketEventBundle(input, {
    revisionNumber: 1,
    previousRevisionId: null,
    existingCreatedAt: null,
  });

  if (bundle.deliveries.length !== 0) {
    throw new Error("TDnet registration preview must never create deliveries");
  }
  if (bundle.decisionSnapshot !== null) {
    throw new Error("TDnet registration preview must not create a decision snapshot");
  }

  return { input, bundle };
}
