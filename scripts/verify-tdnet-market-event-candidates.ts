import "./verify-tdnet-future-date-window-validation.js";
import "./verify-tdnet-primary-review.js";
import assert from "node:assert/strict";
import {
  classifyTdnetDisclosureCandidate,
  extractTdnetMarketEventCandidates,
  TDNET_CANDIDATE_BLOCKERS,
} from "../src/market-events/tdnet-event-candidates.js";
import type { TdnetDisclosure } from "../src/fetcher/jpx.js";

function disclosure(overrides: Partial<TdnetDisclosure> = {}): TdnetDisclosure {
  return {
    code: "8136",
    companyName: "サンリオ",
    title: "第三者委員会の設置に関するお知らせ",
    publishedAt: "2026-09-04T09:00:00+09:00",
    url: "https://example.invalid/tdnet/8136/1",
    ...overrides,
  };
}

const setup = classifyTdnetDisclosureCandidate(disclosure());
assert(setup, "investigation setup must become a review candidate");
assert.equal(setup.eventTypeHint, "INVESTIGATION_UPDATE");
assert.deepEqual(setup.blockers, [...TDNET_CANDIDATE_BLOCKERS]);
assert.equal(setup.registrationReady, false);
assert.equal(setup.disclosurePublishedAt, "2026-09-04T09:00:00+09:00");
assert.equal("time" in setup, false, "TDnet publication time must never become EventTime");
assert.equal("occurrenceKey" in setup, false, "candidate classification must not invent a stable occurrence key");
assert.equal("eventId" in setup, false, "candidate classification must not register a Market Event identity");

const report = classifyTdnetDisclosureCandidate(disclosure({
  title: "第三者委員会からの調査報告書受領に関するお知らせ",
  url: "https://example.invalid/tdnet/8136/2",
}));
assert(report);
assert.equal(report.eventTypeHint, "THIRD_PARTY_COMMITTEE_REPORT");
assert(report.matchedSignals.includes("third_party_committee_report"));

const tob = classifyTdnetDisclosureCandidate(disclosure({
  title: "公開買付けへの応募に関するお知らせ",
  url: "https://example.invalid/tdnet/8136/3",
}));
assert(tob);
assert.equal(tob.eventTypeHint, null, "TOB wording alone must not invent TOB_DEADLINE");
assert(tob.matchedSignals.includes("tob_or_mbo"));
assert.equal(tob.registrationReady, false);

const shareholderMeeting = classifyTdnetDisclosureCandidate(disclosure({
  title: "定時株主総会招集ご通知",
  url: "https://example.invalid/tdnet/8136/4",
}));
assert(shareholderMeeting);
assert.equal(shareholderMeeting.eventTypeHint, "SHAREHOLDER_MEETING");
assert.equal(shareholderMeeting.registrationReady, false, "title hint is never sufficient registration proof");

assert.equal(
  classifyTdnetDisclosureCandidate(disclosure({
    title: "自己株式取得状況に関するお知らせ",
    url: "https://example.invalid/tdnet/8136/5",
  })),
  null,
  "unrelated disclosure must not become a Market Event candidate",
);

const canonical = disclosure({
  code: " 8136 ",
  companyName: " サンリオ ",
  title: " 第三者委員会の設置に関するお知らせ ",
  publishedAt: " 2026-09-04T09:00:00+09:00 ",
  url: " https://example.invalid/tdnet/8136/1 ",
});
assert.equal(
  classifyTdnetDisclosureCandidate(canonical)?.candidateId,
  setup.candidateId,
  "candidate identity must be stable across harmless surrounding whitespace",
);

const duplicate = disclosure();
const candidatesA = extractTdnetMarketEventCandidates([
  shareholderMeeting ? disclosure({ title: "定時株主総会招集ご通知", url: "https://example.invalid/tdnet/8136/4" }) : disclosure(),
  duplicate,
  duplicate,
]);
const candidatesB = extractTdnetMarketEventCandidates([
  duplicate,
  disclosure({ title: "定時株主総会招集ご通知", url: "https://example.invalid/tdnet/8136/4" }),
]);
assert.deepEqual(candidatesA, candidatesB, "duplicate rows and source ordering must not change candidate output");

for (const candidate of candidatesA) {
  assert.equal(candidate.registrationReady, false);
  assert.deepEqual(candidate.blockers, [...TDNET_CANDIDATE_BLOCKERS]);
  assert.equal("time" in candidate, false);
  assert.equal("occurrenceKey" in candidate, false);
}

console.log("tdnet-market-event-candidates: ok");
