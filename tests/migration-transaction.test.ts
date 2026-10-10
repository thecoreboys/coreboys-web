import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrationTransaction } from "../scripts/migration-transaction.mjs";

test("migration transactions retry a deadlock after rolling back", async () => {
  const queries: string[] = [];
  const retries: unknown[] = [];
  let executions = 0;
  const client = {
    async query(query: string) {
      queries.push(query);
      if (query === "ALTER TABLE example" && executions++ === 0) {
        throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
      }
    },
  };

  await applyMigrationTransaction(client, "example.sql", "ALTER TABLE example", {
    sleep: async () => undefined,
    onRetry: (retry: unknown) => retries.push(retry),
  });

  assert.deepEqual(queries, ["BEGIN", "ALTER TABLE example", "ROLLBACK", "BEGIN", "ALTER TABLE example", "COMMIT"]);
  assert.equal(retries.length, 1);
});

test("migration transactions do not retry non-transient database errors", async () => {
  const queries: string[] = [];
  const client = {
    async query(query: string) {
      queries.push(query);
      if (query === "CREATE TABLE example") {
        throw Object.assign(new Error("permission denied"), { code: "42501" });
      }
    },
  };

  await assert.rejects(
    applyMigrationTransaction(client, "example.sql", "CREATE TABLE example", { sleep: async () => undefined }),
    /permission denied/,
  );
  assert.deepEqual(queries, ["BEGIN", "CREATE TABLE example", "ROLLBACK"]);
});

test("migration transactions stop retrying after the bounded attempts", async () => {
  const queries: string[] = [];
  const client = {
    async query(query: string) {
      queries.push(query);
      if (query === "UPDATE example") throw Object.assign(new Error("serialization failure"), { code: "40001" });
    },
  };

  await assert.rejects(
    applyMigrationTransaction(client, "example.sql", "UPDATE example", { sleep: async () => undefined }),
    /serialization failure/,
  );
  assert.deepEqual(queries, ["BEGIN", "UPDATE example", "ROLLBACK", "BEGIN", "UPDATE example", "ROLLBACK", "BEGIN", "UPDATE example", "ROLLBACK"]);
});
