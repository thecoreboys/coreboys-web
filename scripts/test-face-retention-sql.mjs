/** Executes the real retention SQL against the isolated dev DB, always rolling back. */
import pg from 'pg';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/coreboys_dev') {
  throw new Error('Requires the isolated local coreboys_dev database');
}
const client = new pg.Client({ connectionString: url.href });
const dependencies = {
  'server-only': {}, '@/lib/members': { CREW: [], MEMBERS_BY_SLUG: {} },
  '@/lib/asset-manifest.json': {}, '@/lib/face-recognition-policy': {},
  '@/lib/db': { query: (...args) => client.query(...args), withTransaction: (run) => run(client) },
};
const source = readFileSync(new URL('../lib/face-recognition-store.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = {};
vm.runInNewContext(`(function(exports, require) { ${js}\n })`)(api, (id) => {
  if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`);
  return dependencies[id];
});
try {
  await client.connect();
  await client.query('BEGIN');
  const result = await api.prepareExpiredFaceDataPurge({
    actor: { id: 'face-retention-cron', email: null }, actorType: 'system',
    requestId: 'local-sql-regression',
  });
  await api.purgeExpiredFaceAudit();
  console.log(JSON.stringify({ ok: true, counts: result.counts, rollback: true }));
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
