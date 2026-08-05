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
assert.match(shell, /CLOUDFLARE_D1_READ_API_TOKEN_INPUT/);
assert.match(shell, /CLOUDFLARE_D1_EDIT_API_TOKEN_INPUT/);
assert.match(shell, /import-cloudflare-d1-github-secrets\.ts/);
assert.doesNotMatch(shell, /CLOUDFLARE_TOKEN_CREATOR_API_TOKEN/);
assert.doesNotMatch(shell, /set -x/);
assert.doesNotMatch(shell, /echo .*API_TOKEN_INPUT/);

const importCli = readFileSync("scripts/import-cloudflare-d1-github-secrets.ts", "utf8");
for (const contract of [
  "/accounts/${options.accountId}/tokens/verify",
  "/accounts/${options.accountId}/d1/database/${options.databaseId}",
  "SELECT 1 AS ok",
  "cloudflareTokenMutation: false",
  "CLOUDFLARE_D1_READ_API_TOKEN_INPUT",
  "CLOUDFLARE_D1_EDIT_API_TOKEN_INPUT",
  "CLOUDFLARE_D1_READ_API_TOKEN",
  "CLOUDFLARE_D1_EDIT_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "--replace-existing",
  "--edit-secret-scope",
  "DRY_RUN_ONLY",
]) {
  assert.ok(importCli.includes(contract), `missing final-token import contract: ${contract}`);
}
assert.match(importCli, /setGitHubSecret\(repository, targets\[2\], editToken\)/);
assert.match(importCli, /setGitHubSecret\(repository, targets\[0\], readToken\)/);
assert.match(importCli, /setGitHubSecret\(repository, targets\[1\], cli\.accountId\)/);
assert.match(importCli, /runGh\(args, `\$\{value\}\\n`\)/);
assert.doesNotMatch(importCli, /\/accounts\/\$\{[^}]+\}\/tokens(?:\?|`|\")/);
assert.doesNotMatch(importCli, /method:\s*"(?:POST|PUT|DELETE)"[^\n]*tokens/);
assert.doesNotMatch(importCli, /console\.log\([^\n]*(?:readToken|editToken)/);
assert.doesNotMatch(importCli, /writeFileSync\([^\n]*(?:token|secret)/i);
assert.doesNotMatch(importCli, /--body.*token/i);

const runbook = readFileSync("docs/implementation/cloudflare-d1-token-cli-runbook.md", "utf8");
assert.match(runbook, /Manage Account.*Account API Tokens/s);
assert.match(runbook, /D1 Read/);
assert.match(runbook, /D1 Write|D1 Edit/);
assert.match(runbook, /does not create.*Cloudflare token/is);
assert.match(runbook, /does not run D1 bootstrap/);
assert.match(runbook, /do not paste.*chat/i);

console.log("cloudflare-d1-token-provisioning-verification: ok");
