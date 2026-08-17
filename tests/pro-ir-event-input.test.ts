import { normalizeProIrEventInput } from "../src/pro-ir-event-input.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const validEvent = {
  type: "earnings",
  label: "決算",
  sourceUrl: "https://example.test/ir",
  sourceStatus: "confirmed",
  notes: ["official"],
};

{
  const normalized = normalizeProIrEventInput({
    companies: {
      "8136": { name: "Sanrio", events: [validEvent] },
    },
  });
  assert(normalized.companies["8136"]?.events.length === 1, "valid IR event row must remain usable");
  assert(normalized.invalidCompanyCount === 0 && normalized.invalidEventCount === 0, "valid input must not be flagged invalid");
}

{
  const normalized = normalizeProIrEventInput({
    companies: {
      "8136": { name: "Sanrio", events: [validEvent, null, { ...validEvent, notes: {} }] },
      "7203": { name: "Toyota", events: [validEvent] },
    },
  });
  assert(normalized.companies["8136"]?.events.length === 1, "malformed event rows must be isolated without dropping valid peer rows");
  assert(normalized.companies["7203"]?.events.length === 1, "valid companies must survive malformed events elsewhere");
  assert(normalized.invalidEventCount === 2, "malformed event rows must be counted for metadata warning");
}

{
  const normalized = normalizeProIrEventInput({
    companies: {
      "8136": { name: "Sanrio", events: {} },
      "7203": { name: "Toyota", events: [validEvent] },
    },
  });
  assert(!normalized.companies["8136"], "company with non-array events must be isolated");
  assert(normalized.companies["7203"]?.events.length === 1, "malformed company must not stop valid companies");
  assert(normalized.invalidCompanyCount === 1, "malformed company input must be counted");
}

console.log("pro IR event input tests passed");
