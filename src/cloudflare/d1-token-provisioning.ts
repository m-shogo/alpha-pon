export const CLOUDFLARE_ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
export const CLOUDFLARE_DATABASE_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const D1_PERMISSION_NAMES = {
  read: "D1 Read",
  edit: "D1 Edit",
} as const;

export const D1_TOKEN_BASE_NAMES = {
  read: "Alpha Pon D1 Read GitHub Actions",
  edit: "Alpha Pon D1 Edit GitHub Actions",
} as const;

export type D1PermissionKind = keyof typeof D1_PERMISSION_NAMES;

export type CloudflarePermissionGroup = {
  id?: string;
  name?: string;
  scopes?: string[];
};

export type CloudflareUserTokenCreateBody = {
  name: string;
  policies: Array<{
    effect: "allow";
    permission_groups: Array<{ id: string }>;
    resources: Record<string, "*">;
  }>;
};

export type D1BindingConfig = {
  databaseName: string;
  databaseId: string;
};

function requireSingleMatch(source: string, pattern: RegExp, field: string): string {
  const matches = Array.from(source.matchAll(pattern));
  if (matches.length !== 1 || !matches[0]?.[1]) {
    throw new Error(`Expected exactly one ${field} in wrangler.jsonc, found ${matches.length}`);
  }
  return matches[0][1];
}

export function parseD1BindingConfig(source: string): D1BindingConfig {
  const databaseName = requireSingleMatch(source, /"database_name"\s*:\s*"([^"]+)"/g, "D1 database_name");
  const databaseId = requireSingleMatch(source, /"database_id"\s*:\s*"([^"]+)"/g, "D1 database_id");
  if (!CLOUDFLARE_DATABASE_ID_PATTERN.test(databaseId)) {
    throw new Error(`Invalid D1 database_id in wrangler.jsonc: ${databaseId}`);
  }
  return { databaseName, databaseId };
}

export function validateAccountId(accountId: string): string {
  const normalized = accountId.trim();
  if (!CLOUDFLARE_ACCOUNT_ID_PATTERN.test(normalized)) {
    throw new Error("Cloudflare account ID must be exactly 32 hexadecimal characters");
  }
  return normalized.toLowerCase();
}

export function validateDatabaseId(databaseId: string): string {
  const normalized = databaseId.trim();
  if (!CLOUDFLARE_DATABASE_ID_PATTERN.test(normalized)) {
    throw new Error("Cloudflare D1 database ID must be a canonical UUID");
  }
  return normalized.toLowerCase();
}

export function validateGitHubRepository(repository: string): string {
  const normalized = repository.trim();
  if (!GITHUB_REPOSITORY_PATTERN.test(normalized)) {
    throw new Error("GitHub repository must use owner/name format");
  }
  return normalized;
}

export function selectD1PermissionGroup(
  groups: CloudflarePermissionGroup[],
  kind: D1PermissionKind,
): { id: string; name: string } {
  const expectedName = D1_PERMISSION_NAMES[kind];
  const matches = groups.filter(group => (
    group.name === expectedName
    && group.scopes?.includes("com.cloudflare.api.account")
    && typeof group.id === "string"
    && /^[a-f0-9]{32}$/i.test(group.id)
  ));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one account-scoped ${expectedName} permission group, found ${matches.length}`);
  }
  return { id: matches[0].id as string, name: expectedName };
}

export function buildD1UserTokenCreateBody(options: {
  name: string;
  permissionGroupId: string;
  accountId: string;
}): CloudflareUserTokenCreateBody {
  const accountId = validateAccountId(options.accountId);
  if (!options.name.trim() || options.name.length > 120) {
    throw new Error("Cloudflare token name must contain 1-120 characters");
  }
  if (!/^[a-f0-9]{32}$/i.test(options.permissionGroupId)) {
    throw new Error("Cloudflare permission group ID must be 32 hexadecimal characters");
  }
  return {
    name: options.name,
    policies: [{
      effect: "allow",
      permission_groups: [{ id: options.permissionGroupId.toLowerCase() }],
      resources: {
        [`com.cloudflare.api.account.${accountId}`]: "*",
      },
    }],
  };
}

export function buildProvisionedTokenNames(options: {
  rotate: boolean;
  now?: Date;
}): Record<D1PermissionKind, string> {
  if (!options.rotate) return { ...D1_TOKEN_BASE_NAMES };
  const timestamp = (options.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return {
    read: `${D1_TOKEN_BASE_NAMES.read} ${timestamp}`,
    edit: `${D1_TOKEN_BASE_NAMES.edit} ${timestamp}`,
  };
}

export function isManagedD1TokenName(name: string, kind: D1PermissionKind): boolean {
  const base = D1_TOKEN_BASE_NAMES[kind];
  return name === base || name.startsWith(`${base} `);
}

export function redactSecrets(message: string, secrets: Iterable<string>): string {
  let redacted = message;
  const ordered = Array.from(secrets)
    .filter(secret => secret.length >= 8)
    .sort((left, right) => right.length - left.length);
  for (const secret of ordered) redacted = redacted.split(secret).join("[REDACTED]");
  return redacted;
}
