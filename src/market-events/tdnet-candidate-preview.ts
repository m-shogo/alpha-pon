import {
  buildTdnetListUrl,
  type TdnetDisclosureSnapshot,
} from "../fetcher/jpx.js";
import {
  classifyTdnetDisclosureCandidate,
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

function assertDisclosurePublicationDates(snapshot: TdnetDisclosureSnapshot): void {
  const escapedObservationDate = snapshot.observationDate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const canonicalPublishedAt = new RegExp(
    `^${escapedObservationDate}T(?:[01]\\d|2[0-3]):[0-5]\\d:00\\+09:00$`,
  );
  for (const disclosure of snapshot.disclosures) {
    if (!canonicalPublishedAt.test(disclosure.publishedAt)) {
      throw new Error(
        `TDnet preview disclosure publishedAt must match observationDate and canonical JST viewer timestamp: ${disclosure.publishedAt}`,
      );
    }
  }
}

function assertDisclosureSourceUrls(snapshot: TdnetDisclosureSnapshot): void {
  for (const disclosure of snapshot.disclosures) {
    let sourceUrl: URL;
    try {
      sourceUrl = new URL(disclosure.url);
    } catch {
      throw new Error(`TDnet preview disclosure requires an official canonical PDF source URL: ${disclosure.url}`);
    }
    if (
      sourceUrl.href !== disclosure.url
      || sourceUrl.origin !== "https://www.release.tdnet.info"
      || sourceUrl.protocol !== "https:"
      || sourceUrl.hostname !== "www.release.tdnet.info"
      || sourceUrl.port !== ""
      || sourceUrl.username !== ""
      || sourceUrl.password !== ""
      || !sourceUrl.pathname.startsWith("/inbs/")
      || !sourceUrl.pathname.toLowerCase().endsWith(".pdf")
      || sourceUrl.search !== ""
      || sourceUrl.hash !== ""
    ) {
      throw new Error(`TDnet preview disclosure requires an official canonical PDF source URL: ${disclosure.url}`);
    }
  }
}

function assertDisclosureSourceCodes(snapshot: TdnetDisclosureSnapshot): void {
  for (const disclosure of snapshot.disclosures) {
    if (!/^[0-9A-Z]{4}$/.test(disclosure.code)) {
      throw new Error(`TDnet preview disclosure code must be a canonical 4-character issuer code: ${disclosure.code}`);
    }
    if (disclosure.sourceCode === undefined) {
      throw new Error(`TDnet preview disclosure requires the raw 5-character sourceCode: ${disclosure.code}`);
    }
    if (!/^[0-9A-Z]{5}$/.test(disclosure.sourceCode)) {
      throw new Error(`TDnet preview disclosure sourceCode must be an exact 5-character uppercase source value: ${disclosure.sourceCode}`);
    }
    if (disclosure.sourceCode.slice(0, 4) !== disclosure.code) {
      throw new Error(`TDnet preview disclosure sourceCode does not match issuer code: ${disclosure.sourceCode}`);
    }
  }
}

function assertDisclosureViewerText(snapshot: TdnetDisclosureSnapshot): void {
  for (const disclosure of snapshot.disclosures) {
    for (const [fieldName, value] of [
      ["companyName", disclosure.companyName],
      ["title", disclosure.title],
    ] as const) {
      const canonicalViewerText = value.replace(/\s+/g, " ").trim();
      if (!canonicalViewerText || value !== canonicalViewerText) {
        throw new Error(`TDnet preview disclosure ${fieldName} must preserve canonical non-empty viewer text`);
      }
    }
  }
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
  if (snapshot.explicitEmpty && snapshot.pageCount !== 1) {
    throw new Error("TDnet preview explicit-empty proof must come from the first official viewer page only");
  }
  for (const [index, pageUrl] of snapshot.pageUrls.entries()) {
    const expectedUrl = buildTdnetListUrl(snapshot.observationDate, index + 1);
    if (pageUrl !== expectedUrl) {
      throw new Error(`TDnet preview pageUrl must match the canonical official viewer URL: ${pageUrl}`);
    }
  }
  assertDisclosurePublicationDates(snapshot);
  assertDisclosureSourceUrls(snapshot);
  assertDisclosureSourceCodes(snapshot);
  assertDisclosureViewerText(snapshot);

  const unmatchedDisclosureCount = snapshot.disclosures.reduce(
    (count, disclosure) => count + (classifyTdnetDisclosureCandidate(disclosure) === null ? 1 : 0),
    0,
  );
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
    unmatchedDisclosureCount,
    registrationReadyCount: 0,
    blockerCounts,
    candidates,
  };
}
