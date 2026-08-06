import { createHash } from "node:crypto";
import {
  finalizeEdinetFoundationMapping,
  type EdinetFoundationPreviewFinal,
} from "./edinet-foundation-mapping-template.js";

type JsonObject = Record<string, unknown>;

function obj(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function finalizeHumanEditedEdinetFoundationMapping(input: {
  impactReview: unknown;
  sourceImpactReviewFile: string;
  mappingInput: unknown;
  sourceMappingInputFile: string;
  generatedAt?: string;
}): EdinetFoundationPreviewFinal {
  const edited = obj(input.mappingInput, "mappingInput");
  const { recordHash: _staleTemplateHash, ...editedWithoutHash } = edited;
  const rehashedInput = {
    ...editedWithoutHash,
    recordHash: digest(editedWithoutHash),
  };
  return finalizeEdinetFoundationMapping({
    ...input,
    mappingInput: rehashedInput,
  });
}
