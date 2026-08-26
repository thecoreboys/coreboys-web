import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
// Node's type-stripping test runner requires an explicit TypeScript suffix.
// @ts-expect-error TS does not enable allowImportingTsExtensions for app code.
import { verifyMetaSignedRequest } from "../lib/meta/signed-request.ts";

const SECRET = "test-meta-secret";

function sign(payload: Record<string, unknown>, secret = SECRET): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encodedPayload, "utf8")
    .digest("base64url");
  return `${signature}.${encodedPayload}`;
}

test("verifies Meta HMAC-SHA256 signed requests", () => {
  const parsed = verifyMetaSignedRequest(
    sign({ algorithm: "HMAC-SHA256", user_id: "178900001", issued_at: 1234 }),
    SECRET,
  );

  assert.deepEqual(parsed, {
    algorithm: "HMAC-SHA256",
    userId: "178900001",
    issuedAt: 1234,
  });
});

test("accepts numeric app-scoped ids without losing their value", () => {
  const parsed = verifyMetaSignedRequest(
    sign({ algorithm: "HMAC-SHA256", user_id: 178900001 }),
    SECRET,
  );

  assert.equal(parsed?.userId, "178900001");
  assert.equal(parsed?.issuedAt, null);
});

test("rejects a request signed with a different app secret", () => {
  const signed = sign({ algorithm: "HMAC-SHA256", user_id: "178900001" });
  assert.equal(verifyMetaSignedRequest(signed, "wrong-secret"), null);
});

test("rejects malformed payloads and unsupported algorithms", () => {
  assert.equal(verifyMetaSignedRequest("not-a-signed-request", SECRET), null);
  assert.equal(
    verifyMetaSignedRequest(
      sign({ algorithm: "HMAC-SHA1", user_id: "178900001" }),
      SECRET,
    ),
    null,
  );
  assert.equal(
    verifyMetaSignedRequest(sign({ algorithm: "HMAC-SHA256" }), SECRET),
    null,
  );
});
