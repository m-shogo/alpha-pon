export type PipelineHealthConfidence = "normal" | "caution" | "low" | "unknown";

export function extractPipelineHealthConfidence(text: string): PipelineHealthConfidence {
  if (text.includes("report confidence: low")) return "low";
  if (text.includes("report confidence: caution")) return "caution";
  if (text.includes("report confidence: normal")) return "normal";
  return "unknown";
}

export function shouldNotifyPipelineHealth(confidence: PipelineHealthConfidence): boolean {
  return confidence !== "normal";
}
