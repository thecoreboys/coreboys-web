export type MigrationTransactionClient = {
  query(query: string): Promise<unknown>;
};

export type MigrationRetry = {
  name: string;
  attempt: number;
  delayMs: number;
  code: string;
};

export function applyMigrationTransaction(
  client: MigrationTransactionClient,
  name: string,
  sql: string,
  options?: {
    maxAttempts?: number;
    sleep?: (milliseconds: number) => Promise<unknown>;
    onRetry?: (retry: MigrationRetry) => void;
  },
): Promise<void>;
