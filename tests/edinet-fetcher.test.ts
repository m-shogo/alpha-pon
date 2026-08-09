import assert from "node:assert/strict";
import {
  EDINET_API_BASE_URL,
  EDINET_API_KEY_ENV,
  EdinetApiError,
  EdinetCredentialsMissingError,
  buildPdfUrl,
  fetchEdinetDocList,
  getEdinetConfigurationStatus,
} from "../src/fetcher/edinet.js";

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json");
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

const emptyDocList = {
  metadata: {
    message: null,
    resultset: { count: 0 },
  },
  results: [],
};

async function testCredentialsMissingIsNonNetworkFailure() {
  const previous = process.env[EDINET_API_KEY_ENV];
  delete process.env[EDINET_API_KEY_ENV];
  let called = false;

  try {
    await assert.rejects(
      () =>
        fetchEdinetDocList("2026-08-06", {
          fetchImpl: (async () => {
            called = true;
            return jsonResponse(emptyDocList);
          }) as typeof fetch,
        }),
      error => error instanceof EdinetCredentialsMissingError
    );
    assert.equal(called, false, "credentials missing時は外部通信しない");
    assert.deepEqual(getEdinetConfigurationStatus(), {
      source: "edinet",
      configured: false,
      state: "credentials_missing",
      apiKeyEnv: EDINET_API_KEY_ENV,
      baseUrl: EDINET_API_BASE_URL,
    });
  } finally {
    if (previous === undefined) delete process.env[EDINET_API_KEY_ENV];
    else process.env[EDINET_API_KEY_ENV] = previous;
  }
}

async function testAuthenticatedV2Request() {
  const secret = "test-edinet-secret";
  const calls: URL[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    calls.push(new URL(input instanceof Request ? input.url : input.toString()));
    return jsonResponse(emptyDocList);
  }) as typeof fetch;

  const docs = await fetchEdinetDocList("2026-08-06", {
    apiKey: secret,
    fetchImpl,
    maxAttempts: 1,
  });

  assert.deepEqual(docs, []);
  assert.equal(calls.length, 1);
  const requestUrl = calls[0]!;
  assert.equal(requestUrl.origin, "https://api.edinet-fsa.go.jp");
  assert.equal(requestUrl.pathname, "/api/v2/documents.json");
  assert.equal(requestUrl.searchParams.get("date"), "2026-08-06");
  assert.equal(requestUrl.searchParams.get("type"), "2");
  assert.equal(requestUrl.searchParams.get("Subscription-Key"), secret);
  assert.equal(getEdinetConfigurationStatus({ apiKey: secret }).state, "ready");
}

async function testRetryAndRetryAfter() {
  let calls = 0;
  const sleeps: number[] = [];
  const fetchImpl = (async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse({ message: "rate limited" }, 429, { "retry-after": "2" });
    }
    return jsonResponse(emptyDocList);
  }) as typeof fetch;

  await fetchEdinetDocList("2026-08-06", {
    apiKey: "retry-secret",
    fetchImpl,
    maxAttempts: 2,
    retryBaseMs: 1,
    sleep: async ms => {
      sleeps.push(ms);
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [2000]);
}

async function testSecretIsNotLeakedInError() {
  const secret = "must-not-appear";
  const fetchImpl = (async () => jsonResponse({ message: secret }, 401)) as typeof fetch;

  await assert.rejects(
    () =>
      fetchEdinetDocList("2026-08-06", {
        apiKey: secret,
        fetchImpl,
        maxAttempts: 3,
      }),
    error => {
      assert.ok(error instanceof EdinetApiError);
      assert.equal(error.status, 401);
      assert.equal(error.retryable, false);
      assert.equal(error.message.includes(secret), false);
      return true;
    }
  );
}

async function testInvalidDateFailsBeforeFetch() {
  for (const invalidDate of ["20260806", "2026-02-30", "2026-13-01", "2026-00-10"]) {
    let called = false;
    await assert.rejects(
      () =>
        fetchEdinetDocList(invalidDate, {
          apiKey: "test",
          fetchImpl: (async () => {
            called = true;
            return jsonResponse(emptyDocList);
          }) as typeof fetch,
        }),
      /real Gregorian date in YYYY-MM-DD/
    );
    assert.equal(called, false, `${invalidDate} must fail before fetch`);
  }
}

function testPdfEndpointDoesNotEmbedSecret() {
  const url = buildPdfUrl("S100TEST");
  assert.equal(url, `${EDINET_API_BASE_URL}/documents/S100TEST?type=2`);
  assert.equal(url.includes("Subscription-Key"), false);
}

async function main() {
  await testCredentialsMissingIsNonNetworkFailure();
  await testAuthenticatedV2Request();
  await testRetryAndRetryAfter();
  await testSecretIsNotLeakedInError();
  await testInvalidDateFailsBeforeFetch();
  testPdfEndpointDoesNotEmbedSecret();
  console.log("edinet-fetcher.test.ts passed");
}

await main();
