import { createHash } from "node:crypto";
import type { TdnetDisclosure } from "../fetcher/jpx.js";
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

function candidateId(disclosure: TdnetDisclosure): string {
  const canonical = JSON.stringify({
    code: disclosure.code.trim(),
    companyName: disclosure.companyName.trim(),
    title: disclosure.title.trim(),
    publishedAt: disclosure.publishedAt.trim(),
    url: disclosure.url.trim(),
  });
  return `tdc_${createHash("sha256").update(canonical).digest("hex").slice(0, 24)}`;
}

export function classifyTdnetDisclosureCandidate(
  disclosure: TdnetDisclosure,
): TdnetMarketEventCandidate | null {
  const title = disclosure.title.trim();
  if (!title) return null;

  const matchingRules = RULES.filter(rule => rule.test(title));
  if (matchingRules.length === 0) return null;

  // Rules are ordered from more specific to more general. The first non-null
  // type hint is advisory only and must never be treated as registration proof.
  const eventTypeHint = matchingRules.find(rule => rule.eventTypeHint !== null)?.eventTypeHint ?? null;
  return {
    candidateId: candidateId(disclosure),
    issuerCode: disclosure.code.trim(),
    sourceCode: disclosure.sourceCode?.trim() || null,
    issuerName: disclosure.companyName.trim(),
    disclosureTitle: title,
    // This is source publication metadata only. It is deliberately not EventTime.
    disclosurePublishedAt: disclosure.publishedAt.trim(),
    sourceUrl: disclosure.url.trim(),
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
    if (candidate !== null) byId.set(candidate.candidateId, candidate);
  }
  return [...byId.values()].sort((left, right) => left.candidateId.localeCompare(right.candidateId));
}
