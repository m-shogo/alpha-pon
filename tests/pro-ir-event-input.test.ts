import { normalizeProIrEventInput, normalizeProIrSourceStatus } from "../src/pro-ir-event-input.js";

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
      "8136": { name: "Sanrio", events: [{ ...validEvent, date: "2026-02-28", eventDate: "2026-03-01" }] },
    },
  });
  assert(normalized.companies["8136"]?.events.length === 1, "valid IR event row must remain usable");
  assert(!normalized.invalidRoot, "valid IR input must not be flagged invalid root");
  assert(normalized.invalidCompanyCount === 0 && normalized.invalidEventCount === 0, "valid input must not be flagged invalid");
}

{
  assert(normalizeProIrSourceStatus(validEvent) === "confirmed", "explicit confirmed source with URL must remain confirmed");
  assert(
    normalizeProIrSourceStatus({ sourceUrl: "https://example.test/ir" }) === "official_check_required",
    "source URL without explicit verification status must not be promoted to confirmed",
  );
  assert(
    normalizeProIrSourceStatus({ sourceUrl: "https://example.test/ir", sourceStatus: "unknown" }) === "official_check_required",
    "unknown source status must remain verification-required",
  );
  assert(
    normalizeProIrSourceStatus({ sourceStatus: "confirmed" }) === "missing",
    "confirmed label without source URL must fail closed as missing",
  );
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
      "8136": { name: "Sanrio", events: [{ ...validEvent, date: "2026-02-31" }, { ...validEvent, eventDate: "0000-01-01" }, validEvent] },
    },
  });
  assert(normalized.companies["8136"]?.events.length === 1, "impossible Gregorian IR dates must be isolated from valid rows");
  assert(normalized.invalidEventCount === 2, "invalid date rows must be counted for metadata warning");
}

{
  const normalized = normalizeProIrEventInput({
    companies: {
      "8136": { name: "Sanrio", events: [validEvent] },
      " 8136": { name: "Padded Sanrio", events: [validEvent] },
      "7203 ": { name: "Padded Toyota", events: [validEvent] },
    },
  });
  assert(normalized.companies["8136"]?.events.length === 1, "canonical company code must remain usable");
  assert(!normalized.companies[" 8136"] && !normalized.companies["7203 "], "padded company codes must be isolated instead of creating ambiguous identities");
  assert(normalized.invalidCompanyCount === 2, "padded company codes must be counted for metadata warning");
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

{
  const normalized = normalizeProIrEventInput({ companies: [] });
  assert(normalized.invalidRoot, "non-object companies root must fail closed instead of becoming an empty event set");
}

console.log("pro IR event input tests passed");
