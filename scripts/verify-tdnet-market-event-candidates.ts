import "./verify-tdnet-future-date-window-validation.js";
import "./verify-tdnet-primary-review.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assertTdnetMarketEventCandidateIdentity,
  classifyTdnetDisclosureCandidate,
  extractTdnetMarketEventCandidates,
  TDNET_CANDIDATE_BLOCKERS,
  type TdnetMarketEventCandidate,
} from "../src/market-events/tdnet-event-candidates.js";
import type { TdnetDisclosure } from "../src/fetcher/jpx.js";

function tdnetPdf(serial: number): string {
  return `https://www.release.tdnet.info/inbs/140120260904${String(serial).padStart(6, "0")}.pdf`;
}

function disclosure(overrides: Partial<TdnetDisclosure> = {}): TdnetDisclosure {
  return {
    code: "8136",
    sourceCode: "81360",
    companyName: "サンリオ",
    title: "第三者委員会の設置に関するお知らせ",
    publishedAt: "2026-09-04T09:00:00+09:00",
    url: tdnetPdf(1),
    ...overrides,
  };
}

function forgedCandidateId(candidate: TdnetMarketEventCandidate): string {
  const canonical = JSON.stringify({
    code: candidate.issuerCode,
    companyName: candidate.issuerName,
    title: candidate.disclosureTitle,
    publishedAt: candidate.disclosurePublishedAt,
    url: candidate.sourceUrl,
  });
  return `tdc_${createHash("sha256").update(canonical).digest("hex").slice(0, 24)}`;
}

const setup = classifyTdnetDisclosureCandidate(disclosure());
assert(setup, "investigation setup must become a review candidate");
assert.equal(setup.issuerCode, "8136", "candidate must keep canonical issuer code");
assert.equal(setup.sourceCode, "81360", "candidate must retain raw TDnet source code metadata");
assert.equal(setup.eventTypeHint, "INVESTIGATION_UPDATE");
assert.deepEqual(setup.blockers, [...TDNET_CANDIDATE_BLOCKERS]);
assert.equal(setup.registrationReady, false);
assert.equal(setup.disclosurePublishedAt, "2026-09-04T09:00:00+09:00");
assert.equal("time" in setup, false, "TDnet publication time must never become EventTime");
assert.equal("occurrenceKey" in setup, false, "candidate classification must not invent a stable occurrence key");
assert.equal("eventId" in setup, false, "candidate classification must not register a Market Event identity");

for (const mutate of [
  (candidate: TdnetMarketEventCandidate) => ({ ...candidate, issuerCode: ` ${candidate.issuerCode}` }),
  (candidate: TdnetMarketEventCandidate) => ({ ...candidate, issuerName: ` ${candidate.issuerName}` }),
  (candidate: TdnetMarketEventCandidate) => ({ ...candidate, issuerName: `${candidate.issuerName}  株式会社` }),
  (candidate: TdnetMarketEventCandidate) => ({ ...candidate, disclosureTitle: `${candidate.disclosureTitle} ` }),
  (candidate: TdnetMarketEventCandidate) => ({ ...candidate, disclosureTitle: `${candidate.disclosureTitle}  訂正` }),
]) {
  const forged = mutate(setup);
  forged.candidateId = forgedCandidateId(forged);
  assert.throws(
    () => assertTdnetMarketEventCandidateIdentity(forged),
    /canonical|preserve the exact source value/,
    "candidate identity validation must reject non-canonical persisted provenance even when candidateId is recomputed to match it",
  );
}

for (const mutate of [
  (candidate: TdnetMarketEventCandidate) => ({ ...candidate, eventTypeHint: "TOB_DEADLINE" as const }),
  (candidate: TdnetMarketEventCandidate) => ({ ...candidate, matchedSignals: [...candidate.matchedSignals, "tob_or_mbo"] }),
  (candidate: TdnetMarketEventCandidate) => ({ ...candidate, blockers: [] }),
]) {
  const forged = mutate(setup) as TdnetMarketEventCandidate;
  assert.throws(
    () => assertTdnetMarketEventCandidateIdentity(forged),
    /advisory classification|blockers must preserve/,
    "candidate validation must reject forged advisory or boundary metadata even when stable primary provenance is unchanged",
  );
}

const forgedReady = structuredClone(setup);
(forgedReady as unknown as { registrationReady: boolean }).registrationReady = true;
assert.throws(
  () => assertTdnetMarketEventCandidateIdentity(forgedReady),
  /registrationReady must remain false/,
  "candidate validation must not allow a title-only discovery candidate to become registration-ready",
);

const report = classifyTdnetDisclosureCandidate(disclosure({
  title: "第三者委員会からの調査報告書受領に関するお知らせ",
  url: tdnetPdf(2),
}));
assert(report);
assert.equal(report.eventTypeHint, "THIRD_PARTY_COMMITTEE_REPORT");
assert(report.matchedSignals.includes("third_party_committee_report"));

const tob = classifyTdnetDisclosureCandidate(disclosure({
  title: "公開買付けへの応募に関するお知らせ",
  url: tdnetPdf(3),
}));
assert(tob);
assert.equal(tob.eventTypeHint, null, "TOB wording alone must not invent TOB_DEADLINE");
assert(tob.matchedSignals.includes("tob_or_mbo"));
assert.equal(tob.registrationReady, false);

const shareholderMeeting = classifyTdnetDisclosureCandidate(disclosure({
  title: "定時株主総会招集ご通知",
  url: tdnetPdf(4),
}));
assert(shareholderMeeting);
assert.equal(shareholderMeeting.eventTypeHint, "SHAREHOLDER_MEETING");
assert.equal(shareholderMeeting.registrationReady, false, "title hint is never sufficient registration proof");

assert.equal(
  classifyTdnetDisclosureCandidate(disclosure({
    title: "自己株式取得状況に関するお知らせ",
    url: tdnetPdf(5),
  })),
  null,
  "unrelated disclosure must not become a Market Event candidate",
);

const canonical = disclosure({
  code: " 8136 ",
  sourceCode: "81360",
  companyName: " サンリオ  株式会社 ",
  title: " 第三者委員会の設置に関する  お知らせ ",
});
const canonicalCandidate = classifyTdnetDisclosureCandidate(canonical);
const canonicalExpected = classifyTdnetDisclosureCandidate(disclosure({
  companyName: "サンリオ 株式会社",
  title: "第三者委員会の設置に関する お知らせ",
}));
assert.equal(
  canonicalCandidate?.candidateId,
  canonicalExpected?.candidateId,
  "candidate identity must collapse viewer whitespace exactly as the official TDnet parser does",
);
assert.equal(canonicalCandidate?.issuerName, "サンリオ 株式会社");
assert.equal(canonicalCandidate?.disclosureTitle, "第三者委員会の設置に関する お知らせ");
assert.equal(canonicalCandidate?.sourceCode, "81360");

for (const nonCanonicalViewerText of [
  disclosure({ companyName: " サンリオ " }),
  disclosure({ title: " 第三者委員会の設置に関する  お知らせ " }),
]) {
  assert.throws(
    () => extractTdnetMarketEventCandidates([nonCanonicalViewerText]),
    /must preserve canonical non-empty viewer text/,
    "collector-bound candidate extraction must fail closed on viewer-text aliases instead of silently repairing provenance",
  );
}

assert.throws(
  () => classifyTdnetDisclosureCandidate(disclosure({ sourceCode: " 81360 " })),
  /sourceCode must be an exact 5-character uppercase source value/,
  "raw TDnet sourceCode must not be treated as harmless whitespace-normalizable metadata",
);
assert.throws(
  () => classifyTdnetDisclosureCandidate(disclosure({ sourceCode: "46610" })),
  /sourceCode does not match issuerCode/,
  "raw TDnet sourceCode must remain consistent with the normalized issuer code",
);
assert.throws(
  () => classifyTdnetDisclosureCandidate(disclosure({ publishedAt: " 2026-09-04T09:00:00+09:00 " })),
  /publishedAt must preserve the exact source value/,
  "TDnet source publication chronology must not be repaired by candidate classification",
);
assert.throws(
  () => classifyTdnetDisclosureCandidate(disclosure({ publishedAt: "2026-09-04T09:00:00" })),
  /explicit timezone|ISO-8601/i,
  "TDnet candidate publication chronology must include an explicit timezone",
);
assert.throws(
  () => classifyTdnetDisclosureCandidate(disclosure({ url: ` ${tdnetPdf(1)} ` })),
  /url must preserve the exact source value/,
  "TDnet source URL provenance must not be repaired by candidate classification",
);
assert.throws(
  () => classifyTdnetDisclosureCandidate(disclosure({ url: "https://example.com/inbs/140120260904000001.pdf" })),
  /official TDnet source URL/,
  "TDnet candidate classification must reject off-domain source provenance",
);
assert.throws(
  () => classifyTdnetDisclosureCandidate(disclosure({ url: `${tdnetPdf(1)}?download=1` })),
  /official TDnet source URL/,
  "TDnet candidate classification must reject query-bearing source aliases",
);
assert.throws(
  () => classifyTdnetDisclosureCandidate(disclosure({ url: `${tdnetPdf(1)}#fragment` })),
  /official TDnet source URL/,
  "TDnet candidate classification must reject fragment-bearing source aliases",
);

const legacyWithoutRawSourceCode = classifyTdnetDisclosureCandidate(disclosure({ sourceCode: undefined }));
assert.equal(
  legacyWithoutRawSourceCode?.sourceCode,
  null,
  "missing raw sourceCode must remain unknown rather than being fabricated from issuerCode",
);

const duplicate = disclosure();
const candidatesA = extractTdnetMarketEventCandidates([
  shareholderMeeting ? disclosure({ title: "定時株主総会招集ご通知", url: tdnetPdf(4) }) : disclosure(),
  duplicate,
  duplicate,
]);
const candidatesB = extractTdnetMarketEventCandidates([
  duplicate,
  disclosure({ title: "定時株主総会招集ご通知", url: tdnetPdf(4) }),
]);
assert.deepEqual(candidatesA, candidatesB, "duplicate rows and source ordering must not change candidate output");

for (const provenanceConflict of [
  [disclosure({ sourceCode: undefined }), disclosure({ sourceCode: "81360" })],
  [disclosure({ sourceCode: "81360" }), disclosure({ sourceCode: undefined })],
] as const) {
  assert.throws(
    () => extractTdnetMarketEventCandidates([...provenanceConflict]),
    /TDnet candidate provenance conflict.*sourceCode/,
    "same candidate identity with conflicting raw sourceCode provenance must fail closed regardless of source ordering",
  );
}

for (const candidate of candidatesA) {
  assert.equal(candidate.registrationReady, false);
  assert.deepEqual(candidate.blockers, [...TDNET_CANDIDATE_BLOCKERS]);
  assert.equal("time" in candidate, false);
  assert.equal("occurrenceKey" in candidate, false);
}

console.log("tdnet-market-event-candidates: ok");
