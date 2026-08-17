export type PipelineHealthConfidence = "normal" | "caution" | "low" | "unknown";

export function extractPipelineHealthConfidence(text: string): PipelineHealthConfidence {
  if (text.includes("report confidence: low")) return "low";
  if (text.includes("report confidence: caution")) return "caution";
  if (text.includes("report confidence: normal")) return "normal";
  return "unknown";
}

export function pipelineHealthConfidenceAtDate(text: string, expectedDate: string): PipelineHealthConfidence {
  const reportDate = text.match(/^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
  if (reportDate !== expectedDate) return "unknown";
  return extractPipelineHealthConfidence(text);
}

export function shouldNotifyPipelineHealth(confidence: PipelineHealthConfidence): boolean {
  return confidence !== "normal";
}
