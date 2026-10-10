const RETRYABLE_POSTGRES_CODES = new Set(["40P01", "40001"]);

export async function applyMigrationTransaction(
  client,
  name,
  sql,
  { maxAttempts = 3, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), onRetry = () => {} } = {},
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      await client.query(sql);
      await client.query("COMMIT");
      return;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch {
          throw error;
        }
      }

      const retryable = RETRYABLE_POSTGRES_CODES.has(error?.code);
      if (!retryable || attempt >= maxAttempts) throw error;
      const delayMs = 250 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      onRetry({ name, attempt, delayMs, code: error.code });
      await sleep(delayMs);
    }
  }
}
