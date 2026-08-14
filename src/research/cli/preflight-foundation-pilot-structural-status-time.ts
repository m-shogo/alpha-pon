import { assertFoundationStructuralStatusGeneratedAtCoversCutoff } from "../foundation-pilot-structural-status-time.js";
import { parseExplicitIso8601Instant } from "../iso-instant.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const informationCutoff = argValue("information-cutoff")?.trim();
if (!informationCutoff) {
  throw new Error("--information-cutoff is required");
}
parseExplicitIso8601Instant(informationCutoff, "--information-cutoff");
assertFoundationStructuralStatusGeneratedAtCoversCutoff(new Date().toISOString(), informationCutoff);
