import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  D1_PERMISSION_NAMES,
  D1_TOKEN_BASE_NAMES,
  buildD1UserTokenCreateBody,
  buildProvisionedTokenNames,
  isManagedD1TokenName,
  parseD1BindingConfig,
  redactSecrets,
  selectD1PermissionGroup,
  validateAccountId,
  validateDatabaseId,
  validateGitHubRepository,
} from "../src/cloudflare/d1-token-provisioning.js";

const wrangler = readFileSync("wrangler.jsonc", "utf8");
const binding = parseD1BindingConfig(wrangler);
assert.equal(binding.databaseName, "alpha-pon-market-events");
assert.equal(binding.databaseId, "7b90faf4-9834-4393-a921-275e0a68b398");

assert.equal(validateAccountId("A".repeat(32)), "a".repeat(32));
assert.throws(() => validateAccountId("not-an-account"), /32 hexadecimal/);
assert.equal(validateDatabaseId(binding.databaseId), binding.databaseId);
assert.throws(() => validateDatabaseId("not-a-uuid"), /canonical UUID/);
assert.equal(validateGitHubRepository("m-shogo/alpha-pon"), "m-shogo/alpha-pon");
assert.throws(() => validateGitHubRepository("alpha-pon"), /owner\/name/);

const groups = [
  { id: "1".repeat(32), name: "D1 Read", scopes: ["com.cloudflare.api.account"] },
  { id: "2".repeat(32), name: "D1 Write", scopes: ["com.cloudflare.api.account"] },
  { id: "3".repeat(32), name: "D1 Read", scopes: ["com.cloudflare.api.account.zone"] },
];
const readPermission = selectD1PermissionGroup(groups, "read");
const editPermission = selectD1PermissionGroup(groups, "edit");
assert.deepEqual(readPermission, { id: "1".repeat(32), name: "D1 Read" });
assert.deepEqual(editPermission, { id: "2".repeat(32), name: "D1 Write" });
assert.equal(D1_PERMISSION_NAMES.edit, "D1 Edit / D1 Write");

const legacyEditPermission = selectD1PermissionGroup([
  { id: "4".repeat(32), name: "D1 Edit", scopes: ["com.cloudflare.api.account"] },
], "edit");
assert.deepEqual(legacyEditPermission, { id: "4".repeat(32), name: "D1 Edit" });

assert.throws(
  () => selectD1PermissionGroup([...groups, {
    id: "5".repeat(32),
    name: "D1 Read",
    scopes: ["com.cloudflare.api.account"],
  }], "read"),
  /exactly one/,
);
assert.throws(
  () => selectD1PermissionGroup([
    { id: "6".repeat(32), name: "D1 Edit", scopes: ["com.cloudflare.api.account"] },
    { id: "7".repeat(32), name: "D1 Write", scopes: ["com.cloudflare.api.account"] },
  ], "edit"),
  /found 2/,
);

const accountId = "a".repeat(32);
const body = buildD1UserTokenCreateBody({
  name: D1_TOKEN_BASE_NAMES.read,
  permissionGroupId: readPermission.id,
  accountId,
});
assert.deepEqual(body, {
  name: D1_TOKEN_BASE_NAMES.read,
  policies: [{
    effect: "allow",
    permission_groups: [{ id: readPermission.id }],
    resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
  }],
});
assert.equal(Object.keys(body.policies[0].resources).length, 1);
assert.ok(!Object.keys(body.policies[0].resources).includes("com.cloudflare.api.account.*"));

const stableNames = buildProvisionedTokenNames({ rotate: false });
assert.deepEqual(stableNames, D1_TOKEN_BASE_NAMES);
const rotatedNames = buildProvisionedTokenNames({ rotate: true, now: new Date("2026-08-05T00:00:00.000Z") });
assert.equal(rotatedNames.read, `${D1_TOKEN_BASE_NAMES.read} 20260805T000000Z`);
assert.equal(rotatedNames.edit, `${D1_TOKEN_BASE_NAMES.edit} 20260805T000000Z`);
assert.equal(isManagedD1TokenName(stableNames.read, "read"), true);
assert.equal(isManagedD1TokenName(rotatedNames.edit, "edit"), true);
assert.equal(isManagedD1TokenName("Unrelated token", "read"), false);

const secret = "0123456789abcdef0123456789abcdef01234567";
assert.equal(redactSecrets(`failure: ${secret}`, [secret]), "failure: [REDACTED]");

const shell = readFileSync("scripts/setup-cloudflare-d1-github-secrets.sh", "utf8");
assert.match(shell, /set -euo pipefail/);
assert.match(shell, /stty -echo/);
assert.match(shell, /unset CLOUDFLARE_TOKEN_CREATOR_API_TOKEN/);
assert.match(shell, /setup-cloudflare-d1-account-github-secrets\.ts/);
assert.doesNotMatch(shell, /set -x/);
assert.doesNotMatch(shell, /echo .*CLOUDFLARE_TOKEN_CREATOR_API_TOKEN/);

const legacyCli = readFileSync("scripts/setup-cloudflare-d1-github-secrets.ts", "utf8");
for (const contract of [
  "/user/tokens/verify",
  "/user/tokens/permission_groups",
  "/user/tokens",
  "/query",
  "CLOUDFLARE_D1_READ_API_TOKEN",
  "CLOUDFLARE_D1_EDIT_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "--edit-secret-scope",
  "--revoke-bootstrap",
  "DRY_RUN_ONLY",
  "without changing the GitHub plan",
]) {
  assert.ok(legacyCli.includes(contract), `missing legacy token setup contract: ${contract}`);
}
assert.doesNotMatch(legacyCli, /--body.*token/i);
assert.doesNotMatch(legacyCli, /console\.log\([^\n]*\.value/);
assert.doesNotMatch(legacyCli, /writeFileSync\([^\n]*(?:token|secret)/i);
assert.doesNotMatch(legacyCli, /CLOUDFLARE_TOKEN_CREATOR_API_TOKEN[^\n]*--/);

const accountCli = readFileSync("scripts/setup-cloudflare-d1-account-github-secrets.ts", "utf8");
for (const contract of [
  "/user/tokens/verify",
  "/user/tokens/permission_groups",
  "/accounts/${accountId}/tokens/verify",
  "/accounts/${options.accountId}/tokens",
  "/accounts/${accountId}/tokens/${tokenId}",
  "account-owned service principal",
  "D1_VERIFICATION_DELAYS_MS",
  "SELECT 1 AS ok",
  "Cleanup=",
  "CLOUDFLARE_D1_READ_API_TOKEN",
  "CLOUDFLARE_D1_EDIT_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "--edit-secret-scope",
  "--revoke-bootstrap",
  "DRY_RUN_ONLY",
]) {
  assert.ok(accountCli.includes(contract), `missing account-token setup contract: ${contract}`);
}
assert.match(accountCli, /setGitHubSecret\(repository, EDIT_SECRET_NAME, editToken\.value, editEnvironment\)/);
assert.match(accountCli, /setGitHubSecret\(repository, READ_SECRET_NAME, readToken\.value\)/);
assert.match(accountCli, /setGitHubSecret\(repository, ACCOUNT_SECRET_NAME, cli\.accountId\)/);
assert.match(accountCli, /runGh\(args, `\$\{value\}\\n`\)/);
assert.match(accountCli, /RETRYABLE_CLOUDFLARE_CODES/);
assert.match(accountCli, /cleanupCreatedAccountTokens/);
assert.doesNotMatch(accountCli, /--body.*token/i);
assert.doesNotMatch(accountCli, /console\.log\([^\n]*\.value/);
assert.doesNotMatch(accountCli, /writeFileSync\([^\n]*(?:token|secret)/i);
assert.doesNotMatch(accountCli, /CLOUDFLARE_TOKEN_CREATOR_API_TOKEN[^\n]*--/);

const runbook = readFileSync("docs/implementation/cloudflare-d1-token-cli-runbook.md", "utf8");
assert.match(runbook, /Create additional tokens/);
assert.match(runbook, /D1 Edit.*D1 Write/s);
assert.match(runbook, /--revoke-bootstrap/);
assert.match(runbook, /does not run D1 bootstrap/);
assert.match(runbook, /do not paste it into chat/i);

console.log("cloudflare-d1-token-provisioning-verification: ok");
