import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";

interface WorkflowDocument {
  on?: {
    push?: { branches?: string[]; "paths-ignore"?: string[] };
    pull_request?: { types?: string[]; "paths-ignore"?: string[] };
    workflow_dispatch?: unknown;
  };
  concurrency?: {
    group?: string;
    "cancel-in-progress"?: boolean;
  };
  jobs?: Record<
    string,
    {
      "runs-on"?: string | string[];
      steps?: Array<Record<string, unknown>>;
    }
  >;
}

const workflowPaths = [
  ".github/workflows/check.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/research-os.yml",
] as const;

function parseWorkflow(path: string): { document: WorkflowDocument; source: string } {
  const source = readFileSync(path, "utf8");
  const document = load(source) as WorkflowDocument;
  assert(document && typeof document === "object", `${path}: YAML document is required`);
  return { document, source };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

const parsed = new Map(workflowPaths.map((path) => [path, parseWorkflow(path)]));

for (const path of workflowPaths) {
  const { document } = parsed.get(path)!;
  const pushBranches = stringArray(document.on?.push?.branches);
  assert.deepEqual(
    pushBranches,
    ["main"],
    `${path}: push must be restricted to main so feature branches do not duplicate pull_request runs`,
  );
  assert(document.on?.pull_request, `${path}: pull_request trigger is required`);
  assert.equal(
    document.concurrency?.["cancel-in-progress"],
    true,
    `${path}: concurrency.cancel-in-progress must stay enabled`,
  );
  assert(
    typeof document.concurrency?.group === "string" &&
      document.concurrency.group.includes("github.event.pull_request.number"),
    `${path}: concurrency group must collapse superseded runs by pull request`,
  );

  const jobs = document.jobs ?? {};
  assert(Object.keys(jobs).length > 0, `${path}: at least one job is required`);
  for (const [jobName, job] of Object.entries(jobs)) {
    const runners = Array.isArray(job["runs-on"]) ? job["runs-on"] : [job["runs-on"]];
    assert.deepEqual(
      runners,
      ["ubuntu-latest"],
      `${path}:${jobName}: only the standard ubuntu-latest runner is allowed without an explicitly reviewed policy change`,
    );
  }
}

const check = parsed.get(".github/workflows/check.yml")!;
const ci = parsed.get(".github/workflows/ci.yml")!;
const research = parsed.get(".github/workflows/research-os.yml")!;

assert(
  check.source.includes("github.event.pull_request.draft == true") &&
    check.source.includes("github.event.pull_request.draft == false"),
  "check.yml: Draft lightweight checks and Ready/full checks must remain separated",
);
assert(
  check.source.includes("failure() || github.ref == 'refs/heads/main'") &&
    check.source.includes("retention-days: 7"),
  "check.yml: report artifacts must be limited to failures/main with seven-day retention",
);
assert.equal(
  ci.source.includes("pnpm check"),
  false,
  "ci.yml: pnpm check belongs to Check and must not be duplicated in CI",
);
assert.equal(
  research.source.includes("pnpm check"),
  false,
  "research-os.yml: pnpm check belongs to Check and must not be duplicated in Research OS",
);

const ciIgnoredPaths = stringArray(ci.document.on?.pull_request?.["paths-ignore"]);
for (const requiredPath of ["research/**", "src/research/**", "tests/research/**", "docs/**"]) {
  assert(
    ciIgnoredPaths.includes(requiredPath),
    `ci.yml: pull_request paths-ignore must include ${requiredPath} to avoid unrelated Cloudflare builds`,
  );
}

for (const eventType of ["ready_for_review", "converted_to_draft"]) {
  assert(
    stringArray(check.document.on?.pull_request?.types).includes(eventType),
    `check.yml: pull_request.types must include ${eventType}`,
  );
  assert(
    stringArray(research.document.on?.pull_request?.types).includes(eventType),
    `research-os.yml: pull_request.types must include ${eventType}`,
  );
}

assert(
  research.source.includes("github.event_name == 'push' && github.ref == 'refs/heads/main'"),
  "research-os.yml: generated commits must be limited to main push events",
);

console.log("github-actions-cost-control: ok");
