import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  type CloudflarePermissionGroup,
  type D1PermissionKind,
} from "../src/cloudflare/d1-token-provisioning.js";

type Flags = Map<string, string | boolean>;

type CliOptions = {
  apply: boolean;
  rotate: boolean;
  revokeBootstrap: boolean;
  accountId: string | null;
  databaseId: string;
  databaseName: string;
  repository: string | null;
  environment: string;
};

type CloudflareEnvelope<T> = {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
  result_info?: { page?: number; total_pages?: number };
};

type CloudflareTokenRecord = {
  id?: string;
  name?: string;
  status?: "active" | "disabled" | "expired";
  value?: string;
};

type CreatedToken = {
  id: string;
  name: string;
  value: string;
  kind: D1PermissionKind;
};

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const BOOTSTRAP_TOKEN_ENV = "CLOUDFLARE_TOKEN_CREATOR_API_TOKEN";
const ACCOUNT_ID_ENV = "CLOUDFLARE_ACCOUNT_ID";
const GITHUB_REPOSITORY_ENV = "GITHUB_REPOSITORY";
const REPOSITORY_SECRET_NAMES = ["CLOUDFLARE_D1_READ_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] as const;
const ENVIRONMENT_SECRET_NAME = "CLOUDFLARE_D1_EDIT_API_TOKEN";

function parseFlags(argv: string[]): Flags {
  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [key, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) {
      flags.set(key, inline);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      index += 1;
    } else {
      flags.set(key, true);
    }
  }
  return flags;
}

function stringFlag(flags: Flags, key: string): string | null {
  const value = flags.get(key);
  if (value === undefined) return null;
  if (typeof value !== "string") throw new Error(`--${key} requires a value`);
  return value;
}

function booleanFlag(flags: Flags, key: string): boolean {
  return flags.get(key) === true || flags.get(key) === "true";
}

function readWranglerDefaults(): { databaseId: string; databaseName: string } {
  const path = resolve("wrangler.jsonc");
  if (!existsSync(path)) throw new Error(`wrangler.jsonc not found: ${path}`);
  return parseD1BindingConfig(readFileSync(path, "utf8"));
}

function options(argv: string[]): CliOptions {
  const flags = parseFlags(argv);
  const defaults = readWranglerDefaults();
  const accountId = stringFlag(flags, "account-id") ?? process.env[ACCOUNT_ID_ENV] ?? null;
  const repository = stringFlag(flags, "repo") ?? process.env[GITHUB_REPOSITORY_ENV] ?? null;
  const environment = stringFlag(flags, "environment") ?? "production";
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(environment)) {
    throw new Error("GitHub environment name contains unsupported characters");
  }
  return {
    apply: booleanFlag(flags, "apply"),
    rotate: booleanFlag(flags, "rotate"),
    revokeBootstrap: booleanFlag(flags, "revoke-bootstrap"),
    accountId: accountId ? validateAccountId(accountId) : null,
    databaseId: validateDatabaseId(stringFlag(flags, "database-id") ?? defaults.databaseId),
    databaseName: stringFlag(flags, "database-name") ?? defaults.databaseName,
    repository: repository ? validateGitHubRepository(repository) : null,
    environment,
  };
}

function usage(): void {
  console.log(`Alpha Pon Cloudflare D1 token and GitHub Secret setup

Usage:
  bash scripts/setup-cloudflare-d1-github-secrets.sh
  bash scripts/setup-cloudflare-d1-github-secrets.sh --apply [options]

Default mode:
  Dry-run only. Shows the exact Cloudflare permissions and GitHub Secret names.

Apply options:
  --apply                 Create D1 Read/Edit tokens and store them in GitHub
  --account-id <id>       Cloudflare account ID (or CLOUDFLARE_ACCOUNT_ID)
  --repo <owner/name>     GitHub repository; auto-detected with gh when omitted
  --environment <name>    GitHub environment for the Edit token (default: production)
  --rotate                Replace managed tokens after new Secrets verify successfully
  --revoke-bootstrap      Revoke the one-time token-creator token after success
  --database-id <uuid>    Override wrangler.jsonc D1 database ID
  --database-name <name>  Override wrangler.jsonc D1 database name

Required one-time prerequisite:
  Create a Cloudflare token from the official "Create additional tokens" template.
  The shell wrapper reads it without echo into ${BOOTSTRAP_TOKEN_ENV}.

Safety:
  Token values are never printed, written to files, passed as command arguments,
  or stored in shell history. No D1 bootstrap, schema migration, data write,
  Access, Zero Trust, billing, or scheduled workflow is created.
`);
}

function commandExists(command: string): boolean {
  const result = spawnSync("sh", ["-c", `command -v ${command} >/dev/null 2>&1`], { stdio: "ignore" });
  return result.status === 0;
}

function runGh(args: string[], input?: string): string {
  const result = spawnSync("gh", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const message = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`gh ${args[0] ?? "command"} failed${message ? `: ${message}` : ""}`);
  }
  return result.stdout.trim();
}

function detectRepository(): string {
  const value = runGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  return validateGitHubRepository(value);
}

function listGitHubSecretNames(repository: string, environment?: string): Set<string> {
  const args = ["secret", "list", "--repo", repository, "--json", "name", "--jq", ".[].name"];
  if (environment) args.push("--env", environment);
  const output = runGh(args);
  return new Set(output.split(/\r?\n/).map(value => value.trim()).filter(Boolean));
}

function ensureGitHubEnvironment(repository: string, environment: string): void {
  runGh([
    "api",
    "--method", "PUT",
    `repos/${repository}/environments/${encodeURIComponent(environment)}`,
    "--input", "-",
    "--silent",
  ], "{}\n");
}

function setGitHubSecret(repository: string, name: string, value: string, environment?: string): void {
  const args = ["secret", "set", name, "--repo", repository];
  if (environment) args.push("--env", environment);
  runGh(args, `${value}\n`);
}

function deleteGitHubSecret(repository: string, name: string, environment?: string): void {
  const args = ["secret", "delete", name, "--repo", repository];
  if (environment) args.push("--env", environment);
  try {
    runGh(args);
  } catch {
    // Best-effort cleanup is followed by an explicit failure report.
  }
}

const knownSecrets = new Set<string>();

function formatCloudflareErrors(payload: CloudflareEnvelope<unknown>): string {
  const entries = [...(payload.errors ?? []), ...(payload.messages ?? [])];
  const text = entries.map(entry => `${entry.code ?? "?"}: ${entry.message ?? "unknown error"}`).join("; ");
  return text || "Cloudflare API returned an unsuccessful response";
}

async function cloudflareRequest<T>(
  path: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ result: T; resultInfo?: CloudflareEnvelope<T>["result_info"] }> {
  knownSecrets.add(token);
  const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload: CloudflareEnvelope<T>;
  try {
    payload = JSON.parse(text) as CloudflareEnvelope<T>;
  } catch {
    throw new Error(`Cloudflare API returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok || payload.success !== true || payload.result === undefined) {
    throw new Error(`Cloudflare API ${init.method ?? "GET"} ${path} failed: ${formatCloudflareErrors(payload)}`);
  }
  return { result: payload.result, resultInfo: payload.result_info };
}

async function verifyToken(token: string): Promise<{ id: string; status: string }> {
  const { result } = await cloudflareRequest<CloudflareTokenRecord>("/user/tokens/verify", token);
  if (!result.id || !/^[a-f0-9]{32}$/i.test(result.id)) throw new Error("Cloudflare token verification returned no valid token ID");
  if (result.status !== "active") throw new Error(`Cloudflare token is not active: ${String(result.status)}`);
  return { id: result.id, status: result.status };
}

async function listPermissionGroups(bootstrapToken: string): Promise<CloudflarePermissionGroup[]> {
  const { result } = await cloudflareRequest<CloudflarePermissionGroup[]>(
    "/user/tokens/permission_groups",
    bootstrapToken,
  );
  return result;
}

async function listUserTokens(bootstrapToken: string): Promise<CloudflareTokenRecord[]> {
  const records: CloudflareTokenRecord[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { result, resultInfo } = await cloudflareRequest<CloudflareTokenRecord[]>(
      `/user/tokens?include_expired=false&per_page=50&page=${page}`,
      bootstrapToken,
    );
    records.push(...result);
    const totalPages = resultInfo?.total_pages ?? page;
    if (page >= totalPages || result.length === 0) break;
  }
  return records;
}

async function createD1Token(options: {
  bootstrapToken: string;
  accountId: string;
  permissionGroupId: string;
  name: string;
  kind: D1PermissionKind;
}): Promise<CreatedToken> {
  const body = buildD1UserTokenCreateBody({
    name: options.name,
    permissionGroupId: options.permissionGroupId,
    accountId: options.accountId,
  });
  const { result } = await cloudflareRequest<CloudflareTokenRecord>(
    "/user/tokens",
    options.bootstrapToken,
    { method: "POST", body },
  );
  if (!result.id || !/^[a-f0-9]{32}$/i.test(result.id) || !result.value || result.value.length < 40) {
    throw new Error(`Cloudflare did not return a usable value for ${options.kind} token`);
  }
  knownSecrets.add(result.value);
  return { id: result.id, name: options.name, value: result.value, kind: options.kind };
}

async function deleteCloudflareToken(bootstrapToken: string, tokenId: string): Promise<void> {
  await cloudflareRequest<unknown>(`/user/tokens/${tokenId}`, bootstrapToken, { method: "DELETE" });
}

async function verifyD1Access(options: {
  token: CreatedToken;
  accountId: string;
  databaseId: string;
  databaseName: string;
}): Promise<void> {
  await verifyToken(options.token.value);
  const { result: database } = await cloudflareRequest<{ uuid?: string; name?: string }>(
    `/accounts/${options.accountId}/d1/database/${options.databaseId}`,
    options.token.value,
  );
  if (database.uuid?.toLowerCase() !== options.databaseId || database.name !== options.databaseName) {
    throw new Error(`D1 ${options.token.kind} token resolved an unexpected database identity`);
  }
  const { result } = await cloudflareRequest<Array<{ results?: Array<{ ok?: number }>; success?: boolean }>>(
    `/accounts/${options.accountId}/d1/database/${options.databaseId}/query`,
    options.token.value,
    { method: "POST", body: { sql: "SELECT 1 AS ok" } },
  );
  const ok = result.some(query => query.success !== false && query.results?.some(row => Number(row.ok) === 1));
  if (!ok) throw new Error(`D1 ${options.token.kind} token could not execute a read-only verification query`);
}

function printPlan(cli: CliOptions, repository: string): void {
  console.log(JSON.stringify({
    mode: cli.apply ? "apply" : "dry-run",
    repository,
    githubEnvironment: cli.environment,
    cloudflareAccount: cli.accountId ?? "required-at-apply",
    d1: { databaseName: cli.databaseName, databaseId: cli.databaseId },
    cloudflareTokens: {
      read: {
        permission: D1_PERMISSION_NAMES.read,
        resource: cli.accountId ? `com.cloudflare.api.account.${cli.accountId}` : "one explicit account",
      },
      edit: {
        permission: D1_PERMISSION_NAMES.edit,
        resource: cli.accountId ? `com.cloudflare.api.account.${cli.accountId}` : "one explicit account",
      },
    },
    githubSecrets: {
      repository: [...REPOSITORY_SECRET_NAMES],
      environment: { [cli.environment]: [ENVIRONMENT_SECRET_NAME] },
    },
    publicWorkerWriteApi: false,
    d1DataWrite: false,
    bootstrapOrMigration: false,
    schedule: false,
    accessOrZeroTrust: false,
    billingChange: false,
    tokenValuesPrinted: false,
  }, null, 2));
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }
  const cli = options(process.argv.slice(2));
  if (!commandExists("gh")) throw new Error("GitHub CLI (gh) is required");
  runGh(["auth", "status"]);
  const repository = cli.repository ?? detectRepository();
  printPlan(cli, repository);
  if (!cli.apply) {
    console.log("DRY_RUN_ONLY: no Cloudflare token or GitHub Secret was changed.");
    return;
  }
  if (!cli.accountId) throw new Error("--apply requires a Cloudflare account ID");
  const bootstrapToken = process.env[BOOTSTRAP_TOKEN_ENV]?.trim() ?? "";
  if (bootstrapToken.length < 40) {
    throw new Error(`${BOOTSTRAP_TOKEN_ENV} is missing; use the secure shell wrapper prompt`);
  }
  knownSecrets.add(bootstrapToken);

  const bootstrap = await verifyToken(bootstrapToken);
  const permissionGroups = await listPermissionGroups(bootstrapToken);
  const readPermission = selectD1PermissionGroup(permissionGroups, "read");
  const editPermission = selectD1PermissionGroup(permissionGroups, "edit");
  const existingCloudflareTokens = (await listUserTokens(bootstrapToken))
    .filter(token => token.status === "active" && typeof token.name === "string");
  const managedExisting = existingCloudflareTokens.filter(token => (
    isManagedD1TokenName(token.name as string, "read") || isManagedD1TokenName(token.name as string, "edit")
  ));
  if (managedExisting.length > 0 && !cli.rotate) {
    throw new Error("Managed Alpha Pon D1 tokens already exist. Review them, then rerun with --rotate.");
  }

  const existingRepoSecrets = listGitHubSecretNames(repository);
  let existingEnvironmentSecrets = new Set<string>();
  try {
    existingEnvironmentSecrets = listGitHubSecretNames(repository, cli.environment);
  } catch {
    // The environment may not exist yet. It is created immediately before storing the Edit token.
  }
  const preexistingTargetSecrets = [
    ...REPOSITORY_SECRET_NAMES.filter(name => existingRepoSecrets.has(name)),
    ...(existingEnvironmentSecrets.has(ENVIRONMENT_SECRET_NAME) ? [ENVIRONMENT_SECRET_NAME] : []),
  ];
  if (preexistingTargetSecrets.length > 0 && !cli.rotate) {
    throw new Error(`Target GitHub Secrets already exist: ${preexistingTargetSecrets.join(", ")}. Rerun with --rotate after review.`);
  }

  const tokenNames = buildProvisionedTokenNames({ rotate: cli.rotate });
  const created: CreatedToken[] = [];
  let githubSecretWriteStarted = false;
  try {
    const readToken = await createD1Token({
      bootstrapToken,
      accountId: cli.accountId,
      permissionGroupId: readPermission.id,
      name: tokenNames.read,
      kind: "read",
    });
    created.push(readToken);
    const editToken = await createD1Token({
      bootstrapToken,
      accountId: cli.accountId,
      permissionGroupId: editPermission.id,
      name: tokenNames.edit,
      kind: "edit",
    });
    created.push(editToken);

    await verifyD1Access({ token: readToken, accountId: cli.accountId, databaseId: cli.databaseId, databaseName: cli.databaseName });
    await verifyD1Access({ token: editToken, accountId: cli.accountId, databaseId: cli.databaseId, databaseName: cli.databaseName });

    ensureGitHubEnvironment(repository, cli.environment);
    githubSecretWriteStarted = true;
    setGitHubSecret(repository, ENVIRONMENT_SECRET_NAME, editToken.value, cli.environment);
    setGitHubSecret(repository, "CLOUDFLARE_D1_READ_API_TOKEN", readToken.value);
    setGitHubSecret(repository, "CLOUDFLARE_ACCOUNT_ID", cli.accountId);

    const repoSecretsAfter = listGitHubSecretNames(repository);
    const environmentSecretsAfter = listGitHubSecretNames(repository, cli.environment);
    for (const required of REPOSITORY_SECRET_NAMES) {
      if (!repoSecretsAfter.has(required)) throw new Error(`GitHub repository Secret was not confirmed: ${required}`);
    }
    if (!environmentSecretsAfter.has(ENVIRONMENT_SECRET_NAME)) {
      throw new Error(`GitHub environment Secret was not confirmed: ${ENVIRONMENT_SECRET_NAME}`);
    }

    if (cli.rotate) {
      for (const oldToken of managedExisting) {
        if (!oldToken.id || created.some(token => token.id === oldToken.id)) continue;
        await deleteCloudflareToken(bootstrapToken, oldToken.id);
      }
    }

    let bootstrapRevoked = false;
    if (cli.revokeBootstrap) {
      await deleteCloudflareToken(bootstrapToken, bootstrap.id);
      bootstrapRevoked = true;
    }

    console.log(JSON.stringify({
      result: "configured-and-verified",
      repository,
      githubEnvironment: cli.environment,
      d1: { databaseName: cli.databaseName, databaseId: cli.databaseId },
      cloudflareTokens: created.map(token => ({ id: token.id, name: token.name, permission: D1_PERMISSION_NAMES[token.kind] })),
      githubSecrets: {
        repository: [...REPOSITORY_SECRET_NAMES],
        environment: { [cli.environment]: [ENVIRONMENT_SECRET_NAME] },
      },
      oldManagedTokensRevoked: cli.rotate ? managedExisting.length : 0,
      bootstrapTokenRevoked: bootstrapRevoked,
      tokenValuesPrinted: false,
    }, null, 2));
  } catch (error) {
    if (!githubSecretWriteStarted && !cli.rotate) {
      for (const token of created.reverse()) {
        try {
          await deleteCloudflareToken(bootstrapToken, token.id);
        } catch {
          // The final error explicitly states that cleanup must be checked.
        }
      }
    } else if (githubSecretWriteStarted && !cli.rotate && preexistingTargetSecrets.length === 0) {
      deleteGitHubSecret(repository, ENVIRONMENT_SECRET_NAME, cli.environment);
      for (const secret of REPOSITORY_SECRET_NAMES) deleteGitHubSecret(repository, secret);
      for (const token of created.reverse()) {
        try {
          await deleteCloudflareToken(bootstrapToken, token.id);
        } catch {
          // The final error explicitly states that cleanup must be checked.
        }
      }
    }
    const base = error instanceof Error ? error.message : String(error);
    const suffix = githubSecretWriteStarted && cli.rotate
      ? " Rotation may be partially applied; old tokens were preserved. Inspect GitHub Secret names and Cloudflare token metadata before retrying."
      : " Newly created token values were never printed. Verify Cloudflare token metadata before retrying if cleanup reported an API failure.";
    throw new Error(`${base}${suffix}`);
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSecrets(message, knownSecrets));
  process.exitCode = 1;
}
