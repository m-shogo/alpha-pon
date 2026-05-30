import { sendPipelineFailureNotification, sendPipelineSummaryNotification } from "./notify.js";

const kind = process.argv[2] ?? "summary";
const title = process.argv[3] ?? "alpha-pon";
const detail = process.argv.slice(4).join(" ") || "detailなし";

try {
  if (kind === "alert") {
    await sendPipelineFailureNotification(title, detail);
  } else {
    await sendPipelineSummaryNotification(`${title}\n${detail}`);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`pipeline message error: ${message}`);
}
