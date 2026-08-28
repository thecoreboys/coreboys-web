import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("production deployment rejects a loopback database before migrations or rollout", () => {
  const workflow = readFileSync(
    resolve(process.cwd(), ".github/workflows/deploy-azure.yml"),
    "utf8",
  );
  const validation = workflow.indexOf("Production DATABASE_URL cannot point at a loopback host.");
  const migrations = workflow.indexOf("pnpm db:apply-web-migrations");
  const rollout = workflow.indexOf("az containerapp update");

  assert.ok(validation >= 0, "missing production database host validation");
  assert.ok(migrations > validation, "database validation must run before migrations");
  assert.ok(rollout > migrations, "migrations must finish before the production rollout");
  assert.match(workflow, /\["localhost", "127\.0\.0\.1", "::1", "0\.0\.0\.0"\]/);
});
