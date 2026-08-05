import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseD1BindingConfig,
  redactSecrets,
  validateAccountId,
  validateDatabaseId,
  validateGitHubRepository,
} from "../src/cloudflare/d1-token-provisioning.js";

type Flags = Map<string, string | boolean>;
type EditSecretScopeOption = "auto" | "environment" | "repository";
type ResolvedEditSecretScope = Exclude<EditSecretScopeOption, "auto">;

type CliOptions = {
  apply: boolean;
  replaceExisting: boolean;
  accountId: string | null;
  databaseId: string;
  databaseName: string;
  repository: string | null;
  environment: string;
  editSecretScope: EditSecretScopeOption;
};

type CloudflareEnvelope<T> = {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
};

type CloudflareTokenRecord = {
  id?: string;
  status?: "active" | "disabled" | "expired";
};

type SecretTarget = {
  name: string;
  environment?: string;
};

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const ACCOUNT_ID_ENV = "CLOUDFLARE_ACCOUNT_ID";
const GITHUB_REPOSITORY_ENV = "GITHUB_REPOSITORY";
const READ_INPUT_ENV = "CLOUDFLARE_D1_READ_API_TOKEN_INPUT";
const EDIT_INPUT_ENV = "CLOUDFLARE_D1_EDIT_API_TOKEN_INPUT";
const READ_SECRET_NAME = "CLOUDFLARE_D1_READ_API_TOKEN";
const EDIT_SECRET_NAME = "CLOUDFLARE_D1_EDIT_API_TOKEN";
const ACCOUNT_SECRET_NAME = "CLOUDFLARE_ACCOUNT_ID";
const VERIFY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000] as const;
const RETRYABLE_CODES = new Set([10000, 10001, 9109]);
const knownSecrets = new Set<string>();

class CloudflareApiError extends Error {
  readonly status: number;
  readonly codes: number[];

  constructor(options: { method: string; path: string; status: number; codes: number[]; detail: string }) {
    super(`Cloudflare API ${options.method} ${options.path} failed: ${options.detail}`);
    this.name = "CloudflareApiError";
    this.status = options.status;
    this.codes = options.codes;
  }
}

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

function parseEditSecretScope(value: string | null): EditSecretScopeOption {
  const normalized = value ?? "auto";
  if (normalized !== "auto" && normalized !== "environment" && normalized !== "repository") {
    throw new Error("--edit-secret-scope must be auto, environment, or repository");
  }
  return normalized;
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
  if (flags.has("revoke-bootstrap") || flags.has("rotate")) {
    throw new Error("This import CLI does not create or revoke Cloudflare tokens. Remove --revoke-bootstrap/--rotate.");
  }
  return {
    apply: booleanFlag(flags, "apply"),
    replaceExisting: booleanFlag(flags, "replace-existing"),
    accountId: accountId ? validateAccountId(accountId) : null,
    databaseId: validateDatabaseId(stringFlag(flags, "database-id") ?? defaults.databaseId),
    databaseName: stringFlag(flags, "database-name") ?? defaults.databaseName,
    repository: repository ? validateGitHubRepository(repository) : null,
    environment,
    editSecretScope: parseEditSecretScope(stringFlag(flags, "edit-secret-scope")),
  };
}

function usage(): void {
  console.log(`Alpha Pon Cloudflare D1 final-token importer\n\nUsage:\n  bash scripts/setup-cloudflare-d1-github-secrets.sh\n  bash scripts/setup-cloudflare-d1-github-secrets.sh --apply [options]\n\nApply options:\n  --apply                        Verify final D1 tokens and store them in GitHub\n  --account-id <id>              Cloudflare account ID\n  --repo <owner/name>            GitHub repository; auto-detected when omitted\n  --environment <name>           GitHub environment (default: production)\n  --edit-secret-scope <scope>    auto, environment, or repository\n  --replace-existing             Replace existing target Secret names after verification\n\nThe final D1 Read and D1 Write account-token values are read through hidden prompts.\nThis command never creates, lists, updates, rolls, or deletes Cloudflare tokens.\nVerification performs only token status checks, expected D1 identity checks, and SELECT 1 AS ok.\n`);
}

function commandExists(command: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${command} >/dev/null 2>&1`], { stdio: "ignore" }).status === 0;
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
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`gh ${args[0] ?? "command"} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout.trim();
}

function detectRepository(): string {
  return validateGitHubRepository(runGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]));
}

function listGitHubSecretNames(repository: string, environment?: string): Set<string> {
  const args = ["secret", "list", "--repo", repository, "--json", "name", "--jq", ".[].name"];
  if (environment) args.push("--env", environment);
  const output = runGh(args);
  return new Set(output.split(/\r?\n/).map(value => value.trim()).filter(Boolean));
}

function ensureGitHubEnvironment(repository: string, environment: string): void {
  runGh(["api", "--method", "PUT", `repos/${repository}/environments/${encodeURIComponent(environment)}`, "--input", "-"], "{}\n");
}

function resolveEditSecretScope(repository: string, environment: string, requested: EditSecretScopeOption): ResolvedEditSecretScope {
  if (requested === "repository") return "repository";
  try {
    ensureGitHubEnvironment(repository, environment);
    listGitHubSecretNames(repository, environment);
    return "environment";
  } catch (error) {
    if (requested === "environment") throw error;
    console.warn(`GitHub environment Secret is unavailable; using repository Secret ${EDIT_SECRET_NAME} without changing the GitHub plan.`);
    return "repository";
  }
}

function setGitHubSecret(repository: string, target: SecretTarget, value: string): void {
  const args = ["secret", "set", target.name, "--repo", repository];
  if (target.environment) args.push("--env", target.environment);
  runGh(args, `${value}\n`);
}

function deleteGitHubSecret(repository: string, target: SecretTarget): void {
  const args = ["secret", "delete", target.name, "--repo", repository];
  if (target.environment) args.push("--env", target.environment);
  try {
    runGh(args);
  } catch {
    // Best-effort rollback; final error remains non-zero.
  }
}

function cloudflareEntries(payload: CloudflareEnvelope<unknown>): Array<{ code?: number; message?: string }> {
  return [...(payload.errors ?? []), ...(payload.messages ?? [])];
}

async function cloudflareRequest<T>(path: string, token: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  knownSecrets.add(token);
  const method = init.method ?? "GET";
  const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    method,
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
    throw new CloudflareApiError({ method, path, status: response.status, codes: [], detail: `non-JSON HTTP ${response.status}` });
  }
  if (!response.ok || payload.success !== true || payload.result === undefined) {
    const entries = cloudflareEntries(payload);
    const codes = entries.map(entry => entry.code).filter((code): code is number => typeof code === "number");
    const detail = entries.map(entry => `${entry.code ?? "?"}: ${entry.message ?? "unknown error"}`).join("; ") || "unsuccessful response";
    throw new CloudflareApiError({ method, path, status: response.status, codes, detail });
  }
  return payload.result;
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof CloudflareApiError)) return false;
  return error.status === 429 || error.status >= 500 || error.codes.some(code => RETRYABLE_CODES.has(code));
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

async function verifyD1TokenOnce(options: {
  label: "read" | "edit";
  token: string;
  accountId: string;
  databaseId: string;
  databaseName: string;
}): Promise<{ tokenId: string }> {
  const verification = await cloudflareRequest<CloudflareTokenRecord>(
    `/accounts/${options.accountId}/tokens/verify`,
    options.token,
  );
  if (!verification.id || !/^[a-f0-9]{32}$/i.test(verification.id) || verification.status !== "active") {
    throw new Error(`Cloudflare ${options.label} token is not active or returned no valid token ID`);
  }
  const database = await cloudflareRequest<{ uuid?: string; name?: string }>(
    `/accounts/${options.accountId}/d1/database/${options.databaseId}`,
    options.token,
  );
  if (database.uuid?.toLowerCase() !== options.databaseId || database.name !== options.databaseName) {
    throw new Error(`D1 ${options.label} token resolved an unexpected database identity`);
  }
  const queries = await cloudflareRequest<Array<{ results?: Array<{ ok?: number }>; success?: boolean }>>(
    `/accounts/${options.accountId}/d1/database/${options.databaseId}/query`,
    options.token,
    { method: "POST", body: { sql: "SELECT 1 AS ok" } },
  );
  const ok = queries.some(query => query.success !== false && query.results?.some(row => Number(row.ok) === 1));
  if (!ok) throw new Error(`D1 ${options.label} token could not execute SELECT 1 AS ok`);
  return { tokenId: verification.id };
}

async function verifyD1Token(options: {
  label: "read" | "edit";
  token: string;
  accountId: string;
  databaseId: string;
  databaseName: string;
}): Promise<{ tokenId: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < VERIFY_DELAYS_MS.length; attempt += 1) {
    const delay = VERIFY_DELAYS_MS[attempt];
    if (delay > 0) await sleep(delay);
    try {
      return await verifyD1TokenOnce(options);
    } catch (error) {
      lastError = error;
      if (attempt === VERIFY_DELAYS_MS.length - 1 || !isRetryable(error)) throw error;
      console.warn(`Cloudflare ${options.label} token permission propagation pending; retrying verification.`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function printPlan(cli: CliOptions, repository: string): void {
  console.log(JSON.stringify({
    mode: cli.apply ? "apply" : "dry-run",
    repository,
    githubEnvironment: cli.environment,
    editSecretScope: cli.editSecretScope === "auto" ? "environment when available; repository fallback" : cli.editSecretScope,
    cloudflareAccount: cli.accountId ?? "required-at-apply",
    d1: { databaseName: cli.databaseName, databaseId: cli.databaseId },
    tokenSource: "final account-owned tokens created directly in Cloudflare dashboard",
    cloudflareTokenMutation: false,
    githubSecrets: {
      repository: [READ_SECRET_NAME, ACCOUNT_SECRET_NAME],
      edit: EDIT_SECRET_NAME,
    },
    verification: {
      accountTokenActive: true,
      expectedDatabaseIdentity: true,
      readOnlySql: "SELECT 1 AS ok",
      boundedRetryMilliseconds: VERIFY_DELAYS_MS,
    },
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

  const readToken = process.env[READ_INPUT_ENV]?.trim() ?? "";
  const editToken = process.env[EDIT_INPUT_ENV]?.trim() ?? "";
  if (readToken.length < 40 || editToken.length < 40) {
    throw new Error("Final D1 Read/Edit token input is missing; use the secure shell wrapper prompts");
  }
  if (readToken === editToken) throw new Error("D1 Read and Edit token values must be different");
  knownSecrets.add(readToken);
  knownSecrets.add(editToken);

  const editScope = resolveEditSecretScope(repository, cli.environment, cli.editSecretScope);
  const editEnvironment = editScope === "environment" ? cli.environment : undefined;
  const targets: SecretTarget[] = [
    { name: READ_SECRET_NAME },
    { name: ACCOUNT_SECRET_NAME },
    { name: EDIT_SECRET_NAME, environment: editEnvironment },
  ];
  const existingRepo = listGitHubSecretNames(repository);
  const existingEnvironment = editEnvironment ? listGitHubSecretNames(repository, editEnvironment) : existingRepo;
  const existing = targets.filter(target => (
    target.environment ? existingEnvironment.has(target.name) : existingRepo.has(target.name)
  ));
  if (existing.length > 0 && !cli.replaceExisting) {
    throw new Error(`Target GitHub Secrets already exist: ${existing.map(target => target.name).join(", ")}. Review, then use --replace-existing.`);
  }

  const readVerification = await verifyD1Token({
    label: "read",
    token: readToken,
    accountId: cli.accountId,
    databaseId: cli.databaseId,
    databaseName: cli.databaseName,
  });
  const editVerification = await verifyD1Token({
    label: "edit",
    token: editToken,
    accountId: cli.accountId,
    databaseId: cli.databaseId,
    databaseName: cli.databaseName,
  });

  const written: SecretTarget[] = [];
  try {
    setGitHubSecret(repository, targets[2], editToken);
    written.push(targets[2]);
    setGitHubSecret(repository, targets[0], readToken);
    written.push(targets[0]);
    setGitHubSecret(repository, targets[1], cli.accountId);
    written.push(targets[1]);

    const repoAfter = listGitHubSecretNames(repository);
    const envAfter = editEnvironment ? listGitHubSecretNames(repository, editEnvironment) : repoAfter;
    if (!repoAfter.has(READ_SECRET_NAME) || !repoAfter.has(ACCOUNT_SECRET_NAME) || !envAfter.has(EDIT_SECRET_NAME)) {
      throw new Error("GitHub Secret names could not all be confirmed after write");
    }
  } catch (error) {
    if (!cli.replaceExisting && existing.length === 0) {
      for (const target of [...written].reverse()) deleteGitHubSecret(repository, target);
    }
    throw error;
  }

  console.log(JSON.stringify({
    result: "configured-and-verified",
    repository,
    editSecretScope: editScope,
    githubEnvironment: editEnvironment ?? null,
    d1: { databaseName: cli.databaseName, databaseId: cli.databaseId },
    verifiedCloudflareTokenIds: {
      read: readVerification.tokenId,
      edit: editVerification.tokenId,
    },
    githubSecrets: {
      repository: editScope === "repository"
        ? [READ_SECRET_NAME, ACCOUNT_SECRET_NAME, EDIT_SECRET_NAME]
        : [READ_SECRET_NAME, ACCOUNT_SECRET_NAME],
      environment: editEnvironment ? { [editEnvironment]: [EDIT_SECRET_NAME] } : {},
    },
    cloudflareTokenMutation: false,
    d1DataWrite: false,
    tokenValuesPrinted: false,
  }, null, 2));
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSecrets(message, knownSecrets));
  process.exitCode = 1;
}
