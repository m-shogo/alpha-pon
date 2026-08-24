export type PipelineHealthConfidence = "normal" | "caution" | "low" | "unknown";

export function extractPipelineHealthConfidence(text: string): PipelineHealthConfidence {
  const matches = [...text.matchAll(/^- report confidence:\s*(normal|caution|low)\s*$/gm)];
  if (matches.length !== 1) return "unknown";
  const confidence = matches[0]?.[1];
  return confidence === "normal" || confidence === "caution" || confidence === "low"
    ? confidence
    : "unknown";
}

export function pipelineHealthConfidenceAtDate(text: string, expectedDate: string): PipelineHealthConfidence {
  const reportDate = text.match(/^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
  if (reportDate !== expectedDate) return "unknown";
  return extractPipelineHealthConfidence(text);
}

export function shouldNotifyPipelineHealth(confidence: PipelineHealthConfidence): boolean {
  return confidence !== "normal";
}
