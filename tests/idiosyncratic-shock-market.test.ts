import assert from "node:assert/strict";
import {
  inferShockMarket,
  shockBenchmarkLabel,
  supportsAutomaticShockPrice,
} from "../src/idiosyncratic-shock-market.js";

assert.equal(inferShockMarket({ country: "JP", ticker: "8136" }), "JP");
assert.equal(inferShockMarket({ country: "US", ticker: "MCD" }), "US");
assert.equal(inferShockMarket({ country: "GB", ticker: "BP" }), "UK");
assert.equal(inferShockMarket({ country: "DE", ticker: "VOW3" }), "EUROPE");
assert.equal(inferShockMarket({ country: "AU", ticker: "SUL" }), "AU");
assert.equal(inferShockMarket({ country: "CA", ticker: "SHOP" }), "CA");
assert.equal(inferShockMarket({ code: "9999" }), "JP", "4桁codeは後方互換でJP扱い");
assert.equal(inferShockMarket({ ticker: "MCD" }), "OTHER", "国/market不明の英字tickerをUS決め打ちしない");
assert.equal(inferShockMarket({ market: "US", code: "9999" }), "US", "明示marketを最優先");

assert.equal(shockBenchmarkLabel("JP"), "TOPIX");
assert.equal(shockBenchmarkLabel("US"), "S&P 500");
assert.equal(shockBenchmarkLabel("UK"), "FTSE 100");
assert.equal(shockBenchmarkLabel("EUROPE"), "STOXX Europe 600");

assert.equal(supportsAutomaticShockPrice("JP"), true, "現在の自動価格providerはJ-Quants/JPのみ");
assert.equal(supportsAutomaticShockPrice("US"), false, "USは価格provider導入までfail-closed");
assert.equal(supportsAutomaticShockPrice("EUROPE"), false);

console.log("idiosyncratic-shock-market tests: OK");
