import assert from "node:assert/strict";
import {
  compareSanrioEdinetRevisionEntriesWithLogicalAlignment,
  edinetPublicDocumentLogicalKey,
} from "../src/research/edinet-sanrio-logical-entry-alignment.js";
import type { SanrioEdinetRevisionPairPlan } from "../src/research/edinet-sanrio-revision-diff-workspace.js";

const pair: SanrioEdinetRevisionPairPlan = {
  pairId: "edinet:S100TUQ8->S100YMT4",
  groupId: "edinet-chain:S100TUQ8",
  chainRootDocID: "S100TUQ8",
  fromDocID: "S100TUQ8",
  toDocID: "S100YMT4",
  fromDescription: "有価証券報告書－第64期",
  toDescription: "訂正有価証券報告書－第64期",
  fromSubmitDateTime: "2024-06-28T15:00:00+09:00",
  toSubmitDateTime: "2026-06-29T16:21:00+09:00",
  fromZipFile: "before.zip",
  toZipFile: "after.zip",
  fromZipSha256: "1".repeat(64),
  toZipSha256: "2".repeat(64),
};

{
  const before = "XBRL/PublicDoc/jpcrp030000-asr-001_E02655-000_2024-03-31_01_2024-06-28_ixbrl.htm";
  const after = "XBRL/PublicDoc/jpcrp030000-asr-001_E02655-000_2024-03-31_02_2026-06-29_ixbrl.htm";
  assert.equal(edinetPublicDocumentLogicalKey(before), edinetPublicDocumentLogicalKey(after));
  console.log("edinet-logical-alignment: revision slot and submission date normalized OK");
}

{
  const beforePath = "XBRL/PublicDoc/jpcrp030000-asr-001_E02655-000_2024-03-31_01_2024-06-28_ixbrl.htm";
  const afterPath = "XBRL/PublicDoc/jpcrp030000-asr-001_E02655-000_2024-03-31_02_2026-06-29_ixbrl.htm";
  const result = compareSanrioEdinetRevisionEntriesWithLogicalAlignment({
    pair,
    beforeEntries: [
      { path: beforePath, content: "<h1>業績</h1><p>売上高 100</p>" },
      { path: "XBRL/PublicDoc/unchanged.htm", content: "<p>same</p>" },
      { path: "XBRL/PublicDoc/removed.htm", content: "<p>old only</p>" },
    ],
    afterEntries: [
      { path: afterPath, content: "<h1>業績</h1><p>売上高 120</p>" },
      { path: "XBRL/PublicDoc/unchanged.htm", content: "<p>same</p>" },
      { path: "XBRL/PublicDoc/added.htm", content: "<p>new only</p>" },
    ],
  });

  assert.equal(result.diagnostics.logicalRoleMatches, 1);
  assert.equal(result.diff.modifiedEntryCount, 1);
  assert.equal(result.diff.addedEntryCount, 1);
  assert.equal(result.diff.removedEntryCount, 1);
  assert.equal(result.diff.unchangedEntryCount, 1);
  assert.match(result.diff.changes.find(change => change.changeType === "modified")!.path, /=>/);
  console.log("edinet-logical-alignment: renamed logical document becomes modified, not add/remove OK");
}

{
  const result = compareSanrioEdinetRevisionEntriesWithLogicalAlignment({
    pair,
    beforeEntries: [{ path: "XBRL/PublicDoc/old-name.txt", content: "identical unique body" }],
    afterEntries: [{ path: "XBRL/PublicDoc/new-name.txt", content: "identical unique body" }],
  });
  assert.equal(result.diagnostics.identicalContentHashMatches, 1);
  assert.equal(result.diff.unchangedEntryCount, 1);
  assert.equal(result.diff.changes.length, 0);
  console.log("edinet-logical-alignment: unique identical-content rename suppressed OK");
}

{
  const result = compareSanrioEdinetRevisionEntriesWithLogicalAlignment({
    pair,
    beforeEntries: [
      { path: "XBRL/PublicDoc/a-old.txt", content: "duplicate body" },
      { path: "XBRL/PublicDoc/b-old.txt", content: "duplicate body" },
    ],
    afterEntries: [
      { path: "XBRL/PublicDoc/a-new.txt", content: "duplicate body" },
      { path: "XBRL/PublicDoc/b-new.txt", content: "duplicate body" },
    ],
  });
  assert.equal(result.diagnostics.identicalContentHashMatches, 0);
  assert.equal(result.diff.addedEntryCount, 2);
  assert.equal(result.diff.removedEntryCount, 2);
  console.log("edinet-logical-alignment: ambiguous duplicate content remains unmatched OK");
}

console.log("edinet-sanrio-logical-entry-alignment.test.ts passed");
