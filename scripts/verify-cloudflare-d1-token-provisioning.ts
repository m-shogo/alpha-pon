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
  { id: "2".repeat(32), name: "D1 Edit", scopes: ["com.cloudflare.api.account"] },
  { id: "3".repeat(32), name: "D1 Read", scopes: ["com.cloudflare.api.account.zone"] },
];
const readPermission = selectD1PermissionGroup(groups, "read");
const editPermission = selectD1PermissionGroup(groups, "edit");
assert.deepEqual(readPermission, { id: "1".repeat(32), name: D1_PERMISSION_NAMES.read });
assert.deepEqual(editPermission, { id: "2".repeat(32), name: D1_PERMISSION_NAMES.edit });
assert.throws(
  () => selectD1PermissionGroup([...groups, { id: "4".repeat(32), name: "D1 Read", scopes: ["com.cloudflare.api.account"] }], "read"),
  /exactly one/,
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
assert.doesNotMatch(shell, /set -x/);
assert.doesNotMatch(shell, /echo .*CLOUDFLARE_TOKEN_CREATOR_API_TOKEN/);

const cli = readFileSync("scripts/setup-cloudflare-d1-github-secrets.ts", "utf8");
for (const contract of [
  "/user/tokens/verify",
  "/user/tokens/permission_groups",
  "/user/tokens",
  "/query",
  "CLOUDFLARE_D1_READ_API_TOKEN",
  "CLOUDFLARE_D1_EDIT_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "--revoke-bootstrap",
  "DRY_RUN_ONLY",
]) {
  assert.ok(cli.includes(contract), `missing token setup contract: ${contract}`);
}
assert.match(cli, /setGitHubSecret\(repository, ENVIRONMENT_SECRET_NAME, editToken\.value, cli\.environment\)/);
assert.match(cli, /setGitHubSecret\(repository, "CLOUDFLARE_D1_READ_API_TOKEN", readToken\.value\)/);
assert.match(cli, /runGh\(args, `\$\{value\}\\n`\)/);
assert.doesNotMatch(cli, /--body.*token/i);
assert.doesNotMatch(cli, /console\.log\([^\n]*\.value/);
assert.doesNotMatch(cli, /writeFileSync\([^\n]*(?:token|secret)/i);
assert.doesNotMatch(cli, /CLOUDFLARE_TOKEN_CREATOR_API_TOKEN[^\n]*--/);

console.log("cloudflare-d1-token-provisioning-verification: ok");
