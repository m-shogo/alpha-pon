import assert from "node:assert/strict";
import { extractExplicitUsTickerHint } from "../src/idiosyncratic-shock-us-symbol.js";

assert.equal(extractExplicitUsTickerHint("McDonald's (NYSE: MCD) CEO resigns"), "MCD");
assert.equal(extractExplicitUsTickerHint("Company update NASDAQ: INTC after investigation"), "INTC");
assert.equal(extractExplicitUsTickerHint("Why $EBAY moved after executive news"), "EBAY");
assert.equal(extractExplicitUsTickerHint("SEC investigates CEO conduct"), null, "SECをtickerとして誤抽出しない");
assert.equal(extractExplicitUsTickerHint("McDonald's CEO resigns"), null, "社名だけからtickerを推測しない");

console.log("idiosyncratic-shock US symbol tests: OK");
