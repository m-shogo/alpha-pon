import { createHash } from "node:crypto";
import type { TdnetDisclosure } from "../fetcher/jpx.js";
import { parseExplicitIso8601Instant } from "../research/iso-instant.js";
import type { MarketEventType } from "./contracts.js";

export const TDNET_CANDIDATE_BLOCKERS = [
  "future_event_time_not_explicit",
  "stable_occurrence_key_not_established",
  "primary_document_review_required",
] as const;

export type TdnetCandidateBlocker = (typeof TDNET_CANDIDATE_BLOCKERS)[number];

export type TdnetMarketEventCandidate = {
  candidateId: string;
  issuerCode: string;
  sourceCode: string | null;
  issuerName: string;
  disclosureTitle: string;
  disclosurePublishedAt: string;
  sourceUrl: string;
  eventTypeHint: MarketEventType | null;
  matchedSignals: string[];
  registrationReady: false;
  blockers: TdnetCandidateBlocker[];
};

type CandidateRule = {
  signal: string;
  test: (title: string) => boolean;
  eventTypeHint: MarketEventType | null;
};

const RULES: CandidateRule[] = [
  {
    signal: "jpx_remediation_status_report",
    test: title => /改善状況報告書/.test(title),
    eventTypeHint: "JPX_REMEDIATION_STATUS_REPORT",
  },
  {
    signal: "jpx_remediation_report",
    test: title => /改善報告書/.test(title),
    eventTypeHint: "JPX_REMEDIATION_REPORT",
  },
  {
    signal: "continued_shareholder_meeting",
    test: title => /継続会/.test(title),
    eventTypeHint: "CONTINUED_SHAREHOLDER_MEETING",
  },
  {
    signal: "shareholder_meeting",
    test: title => /株主総会/.test(title),
    eventTypeHint: "SHAREHOLDER_MEETING",
  },
  {
    signal: "third_party_committee_report",
    test: title => /(?:第三者|特別|外部)?調査委員会|第三者委員会/.test(title)
      && /(?:調査報告書|調査結果|報告書受領|最終報告)/.test(title),
    eventTypeHint: "THIRD_PARTY_COMMITTEE_REPORT",
  },
  {
    signal: "investigation_update",
    test: title => /第三者委員会|特別調査委員会|外部調査委員会|調査委員会/.test(title),
    eventTypeHint: "INVESTIGATION_UPDATE",
  },
  {
    signal: "earnings_briefing",
    test: title => /決算説明会|決算説明/.test(title),
    eventTypeHint: "EARNINGS_BRIEFING",
  },
  {
    signal: "earnings_release",
    test: title => /決算発表(?:予定)?(?:日)?|決算短信/.test(title),
    eventTypeHint: "EARNINGS_RELEASE",
  },
  {
    signal: "press_conference",
    test: title => /記者会見|会見開催/.test(title),
    eventTypeHint: "PRESS_CONFERENCE",
  },
  {
    signal: "audit_opinion",
    test: title => /監査意見|監査報告書/.test(title),
    eventTypeHint: "AUDIT_OPINION",
  },
  {
    signal: "regulatory_action",
    test: title => /行政処分|業務改善命令|課徴金|勧告/.test(title),
    eventTypeHint: "REGULATORY_ACTION",
  },
  {
    signal: "corporate_action",
    test: title => /スピンオフ|パーシャルスピンオフ|会社分割|吸収分割|新設分割/.test(title),
    eventTypeHint: "CORPORATE_ACTION",
  },
  {
    signal: "tob_or_mbo",
    test: title => /公開買付|\bTOB\b|\bMBO\b/i.test(title),
    // A TOB/MBO disclosure does not establish a TOB_DEADLINE from the title alone.
    eventTypeHint: null,
  },
  {
    signal: "capacity_or_production_start",
    test: title => /生産開始|量産開始|稼働開始|操業開始/.test(title),
    eventTypeHint: "CAPACITY_OR_PRODUCTION_START",
  },
];

function canonicalSourceProvenance(value: string, fieldName: string): string {
  if (!value || value.trim() !== value) {
    throw new Error(`TDnet candidate ${fieldName} must preserve the exact source value without surrounding whitespace`);
  }
  return value;
}

function candidateIssuerCode(value: string): string {
  const issuerCode = value.trim();
  if (!/^[0-9A-Z]{4}$/.test(issuerCode)) {
    throw new Error("TDnet candidate issuerCode must be a canonical 4-character issuer code");
  }
  return issuerCode;
}

function candidatePublishedAt(value: string): string {
  const publishedAt = canonicalSourceProvenance(value, "publishedAt");
  parseExplicitIso8601Instant(publishedAt, "TDnet candidate publishedAt");
  return publishedAt;
}

function candidateSourceUrl(value: string): string {
  const sourceUrl = canonicalSourceProvenance(value, "url");
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("TDnet candidate requires an official TDnet source URL");
  }
  if (
    parsed.href !== sourceUrl
    || parsed.origin !== "https://www.release.tdnet.info"
    || parsed.protocol !== "https:"
    || parsed.hostname !== "www.release.tdnet.info"
    || parsed.port !== ""
    || parsed.username !== ""
    || parsed.password !== ""
    || !parsed.pathname.startsWith("/inbs/")
    || !parsed.pathname.toLowerCase().endsWith(".pdf")
    || parsed.search !== ""
    || parsed.hash !== ""
  ) {
    throw new Error("TDnet candidate requires an official TDnet source URL");
  }
  return sourceUrl;
}

function candidateSourceCode(sourceCode: string | undefined, issuerCode: string): string | null {
  if (sourceCode === undefined) return null;
  if (!/^[0-9A-Z]{5}$/.test(sourceCode)) {
    throw new Error("TDnet candidate sourceCode must be an exact 5-character uppercase source value");
  }
  if (sourceCode.slice(0, 4) !== issuerCode) {
    throw new Error("TDnet candidate sourceCode does not match issuerCode");
  }
  return sourceCode;
}

function candidateIdFromFields(
  issuerCode: string,
  issuerName: string,
  disclosureTitle: string,
  publishedAt: string,
  sourceUrl: string,
): string {
  const canonical = JSON.stringify({
    code: issuerCode,
    companyName: issuerName,
    title: disclosureTitle,
    publishedAt,
    url: sourceUrl,
  });
  return `tdc_${createHash("sha256").update(canonical).digest("hex").slice(0, 24)}`;
}

function candidateId(disclosure: TdnetDisclosure, issuerCode: string, publishedAt: string, sourceUrl: string): string {
  return candidateIdFromFields(
    issuerCode,
    disclosure.companyName.trim(),
    disclosure.title.trim(),
    publishedAt,
    sourceUrl,
  );
}

export function assertTdnetMarketEventCandidateIdentity(candidate: TdnetMarketEventCandidate): void {
  const expected = candidateIdFromFields(
    candidate.issuerCode,
    candidate.issuerName,
    candidate.disclosureTitle,
    candidate.disclosurePublishedAt,
    candidate.sourceUrl,
  );
  if (candidate.candidateId !== expected) {
    throw new Error(`TDnet candidateId does not match canonical candidate provenance: expected ${expected}`);
  }
}

export function classifyTdnetDisclosureCandidate(
  disclosure: TdnetDisclosure,
): TdnetMarketEventCandidate | null {
  const title = disclosure.title.trim();
  if (!title) return null;

  const matchingRules = RULES.filter(rule => rule.test(title));
  if (matchingRules.length === 0) return null;

  const issuerCode = candidateIssuerCode(disclosure.code);
  const publishedAt = candidatePublishedAt(disclosure.publishedAt);
  const sourceUrl = candidateSourceUrl(disclosure.url);
  const sourceCode = candidateSourceCode(disclosure.sourceCode, issuerCode);

  // Rules are ordered from more specific to more general. The first non-null
  // type hint is advisory only and must never be treated as registration proof.
  const eventTypeHint = matchingRules.find(rule => rule.eventTypeHint !== null)?.eventTypeHint ?? null;
  return {
    candidateId: candidateId(disclosure, issuerCode, publishedAt, sourceUrl),
    issuerCode,
    sourceCode,
    issuerName: disclosure.companyName.trim(),
    disclosureTitle: title,
    // This is source publication metadata only. It is deliberately not EventTime.
    disclosurePublishedAt: publishedAt,
    sourceUrl,
    eventTypeHint,
    matchedSignals: [...new Set(matchingRules.map(rule => rule.signal))],
    registrationReady: false,
    blockers: [...TDNET_CANDIDATE_BLOCKERS],
  };
}

export function extractTdnetMarketEventCandidates(
  disclosures: TdnetDisclosure[],
): TdnetMarketEventCandidate[] {
  const byId = new Map<string, TdnetMarketEventCandidate>();
  for (const disclosure of disclosures) {
    const candidate = classifyTdnetDisclosureCandidate(disclosure);
    if (candidate === null) continue;
    const existing = byId.get(candidate.candidateId);
    if (existing && existing.sourceCode !== candidate.sourceCode) {
      throw new Error(
        `TDnet candidate provenance conflict for ${candidate.candidateId}: sourceCode ${existing.sourceCode ?? "unknown"} != ${candidate.sourceCode ?? "unknown"}`,
      );
    }
    if (!existing) byId.set(candidate.candidateId, candidate);
  }
  return [...byId.values()].sort((left, right) => left.candidateId.localeCompare(right.candidateId));
}
