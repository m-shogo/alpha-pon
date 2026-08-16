import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNotificationFeedbackInput } from "../src/notification-feedback-input.js";

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), "alpha-pon-notification-feedback-"));
  try {
    const path = join(dir, "notification-feedback.jsonl");
    writeFileSync(
      path,
      [
        JSON.stringify({
          date: "2026-08-16",
          value: "useful",
          topic: "決算",
          memo: "役立った",
          createdAt: "2026-08-16T09:00:00.000Z",
        }),
        "{broken",
        JSON.stringify({ value: "useful" }),
        "",
      ].join("\n"),
      "utf-8",
    );

    const input = readNotificationFeedbackInput(path);
    assert.equal(input.records.length, 1, "正常rowは破損rowと混在しても継続利用する");
    assert.equal(input.records[0]?.topic, "決算");
    assert.ok(input.warning?.includes("parse_error 1"), "JSON parse破損をmetadata warningへ残す");
    assert.ok(input.warning?.includes("invalid_rows 1"), "shape破損をmetadata warningへ残す");
    assert.ok(input.warning?.includes("lines 2"), "破損行番号だけをwarningへ残す");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("notification-feedback: malformed JSONL isolation OK");
}

main();
