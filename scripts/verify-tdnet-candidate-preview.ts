import assert from "node:assert/strict";
import type { TdnetDisclosureSnapshot } from "../src/fetcher/jpx.js";
import { buildTdnetCandidatePreview } from "../src/market-events/tdnet-candidate-preview.js";

const snapshot: TdnetDisclosureSnapshot = {
  observationDate: "2026-09-04",
  explicitEmpty: false,
  pageCount: 2,
  pageUrls: [
    "https://www.release.tdnet.info/inbs/I_list_001_20260904.html",
    "https://www.release.tdnet.info/inbs/I_list_002_20260904.html",
  ],
  disclosures: [
    {
      code: "8136",
      sourceCode: "81360",
      companyName: "サンリオ",
      title: "第三者委員会の設置に関するお知らせ",
      publishedAt: "2026-09-04T15:30:00+09:00",
      url: "https://www.release.tdnet.info/inbs/140120260904000001.pdf",
    },
    {
      code: "4661",
      sourceCode: "46610",
      companyName: "オリエンタルランド",
      title: "決算発表予定日に関するお知らせ",
      publishedAt: "2026-09-04T16:00:00+09:00",
      url: "https://www.release.tdnet.info/inbs/140120260904000002.pdf",
    },
    {
      code: "4680",
      sourceCode: "46800",
      companyName: "ラウンドワン",
      title: "月次売上高のお知らせ",
      publishedAt: "2026-09-04T16:30:00+09:00",
      url: "https://www.release.tdnet.info/inbs/140120260904000003.pdf",
    },
  ],
};

const preview = buildTdnetCandidatePreview(snapshot);
assert.equal(preview.disclosureCount, 3);
assert.equal(preview.candidateCount, 2);
assert.equal(preview.unmatchedDisclosureCount, 1);
assert.equal(preview.registrationReadyCount, 0);
assert.equal(preview.blockerCounts.future_event_time_not_explicit, 2);
assert.equal(preview.blockerCounts.stable_occurrence_key_not_established, 2);
assert.equal(preview.blockerCounts.primary_document_review_required, 2);
assert.deepEqual(preview.pageUrls, snapshot.pageUrls);

for (const candidate of preview.candidates) {
  assert.equal(candidate.registrationReady, false);
  assert.deepEqual(
    [...candidate.blockers].sort(),
    [
      "future_event_time_not_explicit",
      "primary_document_review_required",
      "stable_occurrence_key_not_established",
    ].sort(),
  );
  const serialized = JSON.stringify(candidate);
  for (const forbidden of ["occurrenceKey", "eventId", "firstExecutableAt", "effectiveAt", '"time"']) {
    assert.equal(serialized.includes(forbidden), false, `preview candidate must not contain inferred ${forbidden}`);
  }
}

assert.throws(
  () => buildTdnetCandidatePreview({
    ...snapshot,
    disclosures: [
      { ...snapshot.disclosures[0]!, sourceCode: " 81360" },
    ],
    pageCount: 1,
    pageUrls: [snapshot.pageUrls[0]!],
  }),
  /sourceCode must be an exact 5-character uppercase source value/,
  "candidate projection must reject non-canonical raw TDnet sourceCode instead of trimming provenance",
);

assert.throws(
  () => buildTdnetCandidatePreview({ ...snapshot, pageCount: 1 }),
  /pageUrls must match pageCount/,
);
assert.throws(
  () => buildTdnetCandidatePreview({ ...snapshot, explicitEmpty: true }),
  /explicit-empty while containing disclosures/,
);
assert.throws(
  () => buildTdnetCandidatePreview({
    observationDate: "2026-09-05",
    explicitEmpty: false,
    pageCount: 1,
    pageUrls: ["https://www.release.tdnet.info/inbs/I_list_001_20260905.html"],
    disclosures: [],
  }),
  /requires explicit-empty proof when disclosure count is zero/,
  "zero-row previews must not erase the distinction between explicit-empty and an unproven fetch/parser failure",
);

const emptyPreview = buildTdnetCandidatePreview({
  observationDate: "2026-09-05",
  explicitEmpty: true,
  pageCount: 1,
  pageUrls: ["https://www.release.tdnet.info/inbs/I_list_001_20260905.html"],
  disclosures: [],
});
assert.equal(emptyPreview.candidateCount, 0);
assert.equal(emptyPreview.registrationReadyCount, 0);

console.log("tdnet-candidate-preview: ok");
