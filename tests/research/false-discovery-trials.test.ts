import assert from "node:assert/strict";
import { falseDiscoveryGuard } from "../../src/research/net-alpha.js";

for (const trials of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(
    () => falseDiscoveryGuard(3, trials),
    /trials must be a positive safe integer/,
    `invalid trial count ${String(trials)} must fail closed`,
  );
}

const valid = falseDiscoveryGuard(3, 1);
assert.ok(Number.isFinite(valid.requiredTStat));
assert.equal(valid.requiredTStat, 1.96);

console.log("research/false discovery: trial count contract OK");
