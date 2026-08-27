import { DEFAULT_WEIGHTS, type QueueWeights } from "./queue.js";

const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as Array<keyof QueueWeights>;
const WEIGHT_KEY_SET = new Set<string>(WEIGHT_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveQueueWeights(value: unknown): QueueWeights {
  if (value === null || value === undefined) return { ...DEFAULT_WEIGHTS };
  if (!isRecord(value)) throw new Error("Research Queue weights must be a mapping");

  const unknownKeys = Object.keys(value).filter((key) => !WEIGHT_KEY_SET.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`Research Queue weights contain unknown keys: ${unknownKeys.join(", ")}`);
  }

  const resolved: QueueWeights = { ...DEFAULT_WEIGHTS };
  for (const key of WEIGHT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const candidate = value[key];
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
      throw new Error(`Research Queue weight ${key} must be finite`);
    }
    if (key === "roiNormalizationBps") {
      if (candidate <= 0) throw new Error("Research Queue weight roiNormalizationBps must be > 0");
    } else if (candidate < 0) {
      throw new Error(`Research Queue weight ${key} must be >= 0`);
    }
    resolved[key] = candidate;
  }

  return resolved;
}
