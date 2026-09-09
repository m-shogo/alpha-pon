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

const duplicateMatched = buildTdnetCandidatePreview({
  ...snapshot,
  disclosures: [snapshot.disclosures[0]!, ...snapshot.disclosures],
});
assert.equal(duplicateMatched.disclosureCount, 4);
assert.equal(duplicateMatched.candidateCount, 2, "candidate projection may deduplicate identical matched disclosure rows");
assert.equal(
  duplicateMatched.unmatchedDisclosureCount,
  1,
  "duplicate matched rows must not be misreported as unmatched disclosures",
);

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
  () => buildTdnetCandidatePreview({
    ...snapshot,
    disclosures: [
      { ...snapshot.disclosures[2]!, code: "468X", sourceCode: "46800" },
    ],
    pageCount: 1,
    pageUrls: [snapshot.pageUrls[0]!],
  }),
  /sourceCode does not match issuer code/,
  "preview provenance must bind sourceCode to issuer code even for disclosures that do not match a candidate rule",
);
assert.throws(
  () => buildTdnetCandidatePreview({
    ...snapshot,
    disclosures: [
      { ...snapshot.disclosures[2]!, sourceCode: "4680a" },
    ],
    pageCount: 1,
    pageUrls: [snapshot.pageUrls[0]!],
  }),
  /sourceCode must be an exact 5-character uppercase source value/,
  "preview provenance must reject malformed raw sourceCode on unmatched disclosures",
);

assert.throws(
  () => buildTdnetCandidatePreview({
    ...snapshot,
    disclosures: [
      { ...snapshot.disclosures[0]!, url: "https://www.release.tdnet.info:443/inbs/140120260904000001.pdf" },
    ],
    pageCount: 1,
    pageUrls: [snapshot.pageUrls[0]!],
  }),
  /official canonical PDF source URL/,
  "candidate projection must reject URL aliases that normalize to a different source identity",
);
assert.throws(
  () => buildTdnetCandidatePreview({
    ...snapshot,
    disclosures: [
      { ...snapshot.disclosures[2]!, url: "https://example.com/inbs/140120260904000003.pdf" },
    ],
    pageCount: 1,
    pageUrls: [snapshot.pageUrls[0]!],
  }),
  /official canonical PDF source URL/,
  "preview provenance must reject off-domain source URLs even for disclosures that do not match a candidate rule",
);
assert.throws(
  () => buildTdnetCandidatePreview({
    ...snapshot,
    disclosures: [
      { ...snapshot.disclosures[2]!, url: "https://www.release.tdnet.info/inbs/140120260904000003.pdf?download=1" },
    ],
    pageCount: 1,
    pageUrls: [snapshot.pageUrls[0]!],
  }),
  /official canonical PDF source URL/,
  "preview provenance must reject query-bearing source aliases for unmatched disclosures",
);

assert.throws(
  () => buildTdnetCandidatePreview({
    ...snapshot,
    disclosures: [
      { ...snapshot.disclosures[2]!, publishedAt: "2026-09-03T16:30:00+09:00" },
    ],
    pageCount: 1,
    pageUrls: [snapshot.pageUrls[0]!],
  }),
  /publishedAt must match observationDate and canonical JST viewer timestamp/,
  "preview provenance must bind every disclosure publication timestamp to the official viewer observationDate, including unmatched rows",
);
assert.throws(
  () => buildTdnetCandidatePreview({
    ...snapshot,
    disclosures: [
      { ...snapshot.disclosures[2]!, publishedAt: "2026-09-04T07:30:00Z" },
    ],
    pageCount: 1,
    pageUrls: [snapshot.pageUrls[0]!],
  }),
  /publishedAt must match observationDate and canonical JST viewer timestamp/,
  "preview provenance must preserve the canonical +09:00 TDnet viewer timestamp instead of accepting equivalent instant aliases",
);

assert.throws(
  () => buildTdnetCandidatePreview({ ...snapshot, pageCount: 1 }),
  /pageUrls must match pageCount/,
);
assert.throws(
  () => buildTdnetCandidatePreview({
    ...snapshot,
    pageCount: 1,
    pageUrls: ["https://example.com/inbs/I_list_001_20260904.html"],
  }),
  /canonical official viewer URL/,
  "preview provenance must reject off-domain page URLs even when a caller constructs the snapshot manually",
);
assert.throws(
  () => buildTdnetCandidatePreview({
    ...snapshot,
    pageCount: 1,
    pageUrls: ["https://www.release.tdnet.info/inbs/I_list_001_20260905.html"],
  }),
  /canonical official viewer URL/,
  "preview provenance must bind page URLs to the snapshot observationDate",
);
assert.throws(
  () => buildTdnetCandidatePreview({
    ...snapshot,
    pageCount: 1,
    pageUrls: ["https://www.release.tdnet.info/inbs/I_list_001_20260904.html?download=1"],
  }),
  /canonical official viewer URL/,
  "preview provenance must reject query-bearing aliases of the official viewer page",
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
assert.throws(
  () => buildTdnetCandidatePreview({
    observationDate: "2026-09-05",
    explicitEmpty: true,
    pageCount: 2,
    pageUrls: [
      "https://www.release.tdnet.info/inbs/I_list_001_20260905.html",
      "https://www.release.tdnet.info/inbs/I_list_002_20260905.html",
    ],
    disclosures: [],
  }),
  /explicit-empty proof must come from the first official viewer page only/,
  "explicit-empty preview provenance must preserve the collector invariant that page 1 alone proves no disclosures",
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
