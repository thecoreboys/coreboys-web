/** Real SQL lifecycle against the isolated local DB; all fixture writes roll back. */
import assert from 'node:assert/strict';
import pg from 'pg';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const url = new URL(process.env.MEDIA_INTELLIGENCE_DATABASE_URL);
if (!['localhost','127.0.0.1'].includes(url.hostname) || url.pathname !== '/coreboys_media_ai') throw new Error('Requires isolated local coreboys_media_ai');
const client = new pg.Client({ connectionString: url.href });
const capabilities = { vector: false, trigram: false };
const schema = { mediaIntelligenceQuery: (...args) => client.query(...args),
  ensureMediaIntelligenceSchema: async () => capabilities,
  withMediaIntelligenceTransaction: (work) => work(client, capabilities) };
const modules = new Map();
function load(path) {
  const full = resolve(root, path);
  if (modules.has(full)) return modules.get(full);
  const js = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = {};
  modules.set(full, api);
  vm.runInNewContext(`(function(exports,require){${js}\n})`, { process, TextEncoder, Date })(api, (id) => {
    if (id === 'server-only') return {};
    if (id === './schema') return schema;
    if (id.startsWith('.')) return load(resolve(dirname(full), `${id}.ts`));
    if (id.startsWith('node:')) return require(id);
    throw new Error(`Unexpected import ${id}`);
  });
  return api;
}
try {
  await client.connect(); await client.query('BEGIN');
  await client.query(load('lib/media-intelligence/transcript-schema.ts').TRANSCRIPT_SCHEMA_SQL);
  const { prepareWatchItem, getLocalMetadataAnalyzer } = load('lib/media-intelligence/analyzer.ts');
  const store = new (load('lib/media-intelligence/postgres-store.ts').PostgresMediaIntelligenceStore)();
  const service = load('lib/media-intelligence/transcript-imports.ts');
  const analyzer = getLocalMetadataAnalyzer();
  const item = { id: '__transcript_sql_test__', platform: 'youtube', kind: 'youtube', title: 'A source with real captions',
    durationSeconds: 600, format: 'long', memberSlug: 'marlon', memberLabel: 'Marlon', accountLabel: 'Marlon', poster: '', backdrop: '', accent: '#fff', href: '/' };
  const prepared = prepareWatchItem(item, analyzer);
  await store.prepareRevision(prepared.asset, prepared.revision);
  const coverage = load('lib/media-intelligence/coverage.ts').mediaIntelligenceCoverage;
  const youtubeCoverage = async () => (await coverage()).assets.find((row) => row.platform === 'youtube');
  const baseline = await youtubeCoverage();
  for (const value of [null, '', '  ', 123]) {
    await client.query("UPDATE media_intelligence_assets SET item=jsonb_set(item,'{mediaUrl}',$2::jsonb) WHERE asset_key=$1", [prepared.asset.key, JSON.stringify(value)]);
    assert.equal((await youtubeCoverage()).mediaReferences, baseline.mediaReferences, 'invalid or blank media values must not count');
  }
  await client.query("UPDATE media_intelligence_assets SET item=jsonb_set(item,'{mediaUrl}',to_jsonb($2::text)) WHERE asset_key=$1", [prepared.asset.key, 'https://example.com/test-only.mp4']);
  assert.equal((await youtubeCoverage()).mediaReferences, baseline.mediaReferences + 1);
  await client.query('UPDATE media_intelligence_assets SET is_live=true WHERE asset_key=$1', [prepared.asset.key]);
  assert.equal((await youtubeCoverage()).mediaReferences, baseline.mediaReferences, 'live input is not a replay artifact');
  assert.equal((await youtubeCoverage()).live, baseline.live + 1);
  await client.query("UPDATE media_intelligence_assets SET is_live=false,item=item-'mediaUrl' WHERE asset_key=$1", [prepared.asset.key]);
  const input = { assetKey: prepared.asset.key, source: 'WEBVTT\n\n00:02:00.000 --> 00:02:10.000\nPlaying Minecraft with friends.', language: 'en', rightsReference: 'Test-only authorized fixture', actor: 'local-test' };
  const imported = await service.submitTranscriptImport(input);
  // A stale worker must not attach fetched captions to a new catalog revision.
  await client.query('SAVEPOINT stale_caption_check');
  await assert.rejects(() => service.submitTranscriptImport({ ...input, expectedRevisionId: 'stale-revision' }), /active, indexed/);
  await client.query('ROLLBACK TO SAVEPOINT stale_caption_check');
  assert.equal(imported.id, (await service.submitTranscriptImport(input)).id);
  const documents = async () => (await store.searchDocuments('local','core-hash-ngrams-v1',{})).filter((entry) => entry.asset.key === prepared.asset.key);
  assert.equal((await documents()).length, 0, 'draft evidence must not leak');
  await service.reviewTranscriptImport(imported.id, 'approve', 'local-reviewer');
  assert.equal((await documents())[0].segment.startSeconds, 120);
  assert.equal((await service.reviewTranscriptImport(imported.id, 'approve', 'local-reviewer')).unchanged, true);
  await client.query('UPDATE media_intelligence_revisions SET is_current=false WHERE revision_id=$1', [prepared.revision.id]);
  assert.equal((await documents()).length, 0, 'changed revisions must not expose old evidence');
  await client.query('UPDATE media_intelligence_revisions SET is_current=true WHERE revision_id=$1', [prepared.revision.id]);
  await client.query("UPDATE media_intelligence_transcript_imports SET expires_at=now()-interval '1 day' WHERE import_id=$1", [imported.id]);
  assert.equal((await documents()).length, 0, 'expired evidence must be hidden');
  await client.query("UPDATE media_intelligence_transcript_imports SET expires_at=now()+interval '1 day' WHERE import_id=$1", [imported.id]);
  await service.reviewTranscriptImport(imported.id, 'revoke', 'local-reviewer');
  assert.equal((await documents()).length, 0, 'revocation must immediately remove search evidence');
  await assert.rejects(() => service.reviewTranscriptImport(imported.id, 'approve', 'local-reviewer'), /draft/);
  await client.query("UPDATE media_intelligence_transcript_imports SET expires_at=now()-interval '1 day' WHERE import_id=$1", [imported.id]);
  const retention = await load('lib/media-intelligence/retention.ts').runMediaIntelligenceRetention(100);
  assert.ok(retention.transcriptsPruned >= 1);
  assert.equal((await client.query('SELECT import_id FROM media_intelligence_transcript_imports WHERE import_id=$1', [imported.id])).rows.length, 0);
  console.log(JSON.stringify({ ok: true, checks: ['source coverage','blank media rejection','live/replay distinction','idempotent import','draft isolation','approval','real timestamp','revision isolation','expiry','revocation','retention purge'], rollback: true, paidCalls: 0 }));
} finally { await client.query('ROLLBACK').catch(() => {}); await client.end(); }
