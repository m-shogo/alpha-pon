import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import {
  readListingEventReviewInput,
  type ListingEventReviewInputRow as ListingEvent,
} from "./listing-event-review-input.js";

type Review = {
  id: string;
  code?: string;
  name: string;
  eventType: string;
  eventDate: string | null;
  publicPrice: number | null;
  initialPrice: number | null;
  reviewPrice: number | null;
  publicPriceReturn: number | null;
  initialPriceReturn: number | null;
  topixRelativeReturn: number | null;
  dataQuality: "missing" | "partial" | "ok";
  missingFields: string[];
};

const DATA_PATH = "data/listing_events.jsonl";

function calcReturn(base: number | null | undefined, price: number | null | undefined): number | null {
  if (base == null || price == null || base === 0) return null;
  return (price - base) / base;
}

function buildReview(event: ListingEvent): Review {
  const missingFields: string[] = [];
  if (!event.eventDate) missingFields.push("eventDate");
  if (event.publicPrice == null) missingFields.push("publicPrice");
  if (event.initialPrice == null) missingFields.push("initialPrice");
  if (event.reviewPrice == null) missingFields.push("reviewPrice");
  if (event.topixRelativeReturn == null) missingFields.push("topixRelativeReturn");

  const dataQuality = missingFields.length === 0 ? "ok" : missingFields.length >= 4 ? "missing" : "partial";
  return {
    id: event.id,
    code: event.code,
    name: event.name,
    eventType: event.eventType,
    eventDate: event.eventDate ?? null,
    publicPrice: event.publicPrice ?? null,
    initialPrice: event.initialPrice ?? null,
    reviewPrice: event.reviewPrice ?? null,
    publicPriceReturn: calcReturn(event.publicPrice, event.reviewPrice),
    initialPriceReturn: calcReturn(event.initialPrice, event.reviewPrice),
    topixRelativeReturn: event.topixRelativeReturn ?? null,
    dataQuality,
    missingFields,
  };
}

function formatPct(value: number | null): string {
  if (value == null) return "missing";
  return `${(value * 100).toFixed(1)}%`;
}

function main() {
  const today = todayJst();
  const input = readListingEventReviewInput(DATA_PATH);
  const reviews = input.rows.map(buildReview);
  const missing = reviews.filter(review => review.dataQuality !== "ok");
  const lines: string[] = [];

  lines.push("# 上場イベントレビュー", "", `date: ${today}`, "");
  lines.push("> 買い推奨ではありません。上場イベント後の公開価格比・初値比・TOPIX比を答え合わせするためのレポートです。", "");
  lines.push(`- totalReviews: ${reviews.length}`);
  lines.push(`- missingOrPartial: ${missing.length}`);
  lines.push(`- inputWarnings: ${input.warnings.length}`, "");
  for (const warning of input.warnings) lines.push(`- warning: ${warning}`);
  if (input.warnings.length > 0) lines.push("");

  lines.push("## reviews", "");
  for (const review of reviews) {
    lines.push(`### ${review.name} (${review.id})`, "");
    if (review.code) lines.push(`- code: ${review.code}`);
    lines.push(`- eventType: ${review.eventType}`);
    lines.push(`- eventDate: ${review.eventDate ?? "missing"}`);
    lines.push(`- dataQuality: ${review.dataQuality}`);
    lines.push(`- publicPrice: ${review.publicPrice ?? "missing"}`);
    lines.push(`- initialPrice: ${review.initialPrice ?? "missing"}`);
    lines.push(`- reviewPrice: ${review.reviewPrice ?? "missing"}`);
    lines.push(`- publicPriceReturn: ${formatPct(review.publicPriceReturn)}`);
    lines.push(`- initialPriceReturn: ${formatPct(review.initialPriceReturn)}`);
    lines.push(`- topixRelativeReturn: ${formatPct(review.topixRelativeReturn)}`);
    if (review.missingFields.length > 0) {
      lines.push("- missingFields:");
      for (const field of review.missingFields) lines.push(`  - ${field}`);
    }
    lines.push("");
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_event_review_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_event_review_latest.json", JSON.stringify({ generatedAt: today, reviews, warnings: input.warnings }, null, 2), "utf-8");
  console.log(`listing event review generated: ${reviews.length}, warnings=${input.warnings.length}`);
}

main();
