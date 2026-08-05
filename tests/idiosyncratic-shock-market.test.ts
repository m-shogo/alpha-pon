import assert from "node:assert/strict";
import {
  inferShockMarket,
  shockBenchmarkLabel,
  shockMarketProfile,
  supportsAutomaticShockPrice,
} from "../src/idiosyncratic-shock-market.js";
import { extractExplicitUsTickerHint } from "../src/idiosyncratic-shock-us-symbol.js";

assert.equal(inferShockMarket({ country: "JP", ticker: "8136" }), "JP");
assert.equal(inferShockMarket({ country: "US", ticker: "MCD" }), "US");
assert.equal(inferShockMarket({ country: "GB", ticker: "BP" }), "UK");
assert.equal(inferShockMarket({ country: "DE", ticker: "VOW3" }), "EUROPE");
assert.equal(inferShockMarket({ country: "AU", ticker: "SUL" }), "AU");
assert.equal(inferShockMarket({ country: "CA", ticker: "SHOP" }), "CA");
assert.equal(inferShockMarket({ country: "HK", ticker: "0700" }), "HK");
assert.equal(inferShockMarket({ country: "KR" }), "KR");
assert.equal(inferShockMarket({ country: "SG" }), "SG");
assert.equal(inferShockMarket({ country: "CN" }), "CN");
assert.equal(inferShockMarket({ country: "TW" }), "TW");
assert.equal(inferShockMarket({ code: "9999" }), "JP", "4桁codeは後方互換でJP扱い");
assert.equal(inferShockMarket({ ticker: "MCD" }), "OTHER", "国/market不明の英字tickerをUS決め打ちしない");
assert.equal(inferShockMarket({ market: "US", code: "9999" }), "US", "明示marketを最優先");

assert.equal(shockBenchmarkLabel("JP"), "TOPIX");
assert.equal(shockBenchmarkLabel("US"), "S&P 500");
assert.equal(shockBenchmarkLabel("UK"), "FTSE 100");
assert.equal(shockBenchmarkLabel("EUROPE"), "STOXX Europe 600");
assert.equal(shockBenchmarkLabel("HK"), "Hang Seng Index");
assert.equal(shockBenchmarkLabel("KR"), "KOSPI");
assert.equal(shockBenchmarkLabel("SG"), "Straits Times Index");
assert.equal(shockBenchmarkLabel("CN"), "CSI 300");
assert.equal(shockBenchmarkLabel("TW"), "TAIEX");

assert.equal(supportsAutomaticShockPrice("JP"), true, "JPはJ-Quants providerを実装済み");
assert.equal(supportsAutomaticShockPrice("US"), true, "USはTwelve Data providerを実装済み");
assert.equal(shockMarketProfile("US").automaticPriceProvider, "twelve_data");
assert.equal(supportsAutomaticShockPrice("EUROPE"), false, "欧州はprice provider導入までfail-closed");
assert.equal(supportsAutomaticShockPrice("HK"), false, "香港はresearch discoveryのみでlive通知しない");
assert.equal(supportsAutomaticShockPrice("KR"), false, "韓国はresearch discoveryのみでlive通知しない");

assert.equal(extractExplicitUsTickerHint("McDonald's (NYSE: MCD) CEO resigns"), "MCD");
assert.equal(extractExplicitUsTickerHint("Company update NASDAQ: INTC after investigation"), "INTC");
assert.equal(extractExplicitUsTickerHint("Why $EBAY moved after executive news"), "EBAY");
assert.equal(extractExplicitUsTickerHint("SEC investigates CEO conduct"), null, "SECをtickerとして誤抽出しない");
assert.equal(extractExplicitUsTickerHint("McDonald's CEO resigns"), null, "社名だけからtickerを推測しない");

console.log("idiosyncratic-shock-market tests: OK");
