import { query } from "@/lib/db";

let ready: Promise<void> | null = null;

/**
 * Generic named workspace storage shared by Watch multiview and custom chat.
 * Keeping the payload as versioned JSON lets each surface evolve its own
 * layout schema without coupling the database to presentation details.
 */
export async function ensureWorkspacePreferencesSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS fan_workspace_preferences (
        user_id    text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        kind       text NOT NULL,
        name       text NOT NULL,
        payload    jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, kind, name)
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_workspace_preferences_recent_idx
        ON fan_workspace_preferences (user_id, kind, updated_at DESC)
    `);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export type WorkspacePreferenceRow = {
  kind: string;
  name: string;
  payload: unknown;
  updated_at: Date | string;
};

export async function listWorkspacePreferences(userId: string, kind: string) {
  await ensureWorkspacePreferencesSchema();
  const result = await query<WorkspacePreferenceRow>(
    `SELECT kind, name, payload, updated_at
       FROM fan_workspace_preferences
      WHERE user_id = $1 AND kind = $2
      ORDER BY updated_at DESC, name ASC
      LIMIT 50`,
    [userId, kind],
  );
  return result.rows;
}

export async function upsertWorkspacePreference(
  userId: string,
  kind: string,
  name: string,
  payload: unknown,
) {
  await ensureWorkspacePreferencesSchema();
  await query(
    `INSERT INTO fan_workspace_preferences (user_id, kind, name, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (user_id, kind, name) DO UPDATE SET
       payload = EXCLUDED.payload,
       updated_at = now()`,
    [userId, kind, name, JSON.stringify(payload)],
  );
}

export async function deleteWorkspacePreference(userId: string, kind: string, name: string) {
  await ensureWorkspacePreferencesSchema();
  await query(
    `DELETE FROM fan_workspace_preferences WHERE user_id = $1 AND kind = $2 AND name = $3`,
    [userId, kind, name],
  );
}
