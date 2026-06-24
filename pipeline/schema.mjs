import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const SCHEMA_FILES = [
  'infra/postgres/init/002_add_directors.sql',
  'infra/postgres/init/003_add_publish_approvals.sql',
  'infra/postgres/init/004_add_client_account_contexts.sql',
  'infra/postgres/init/005_add_pipeline_orchestration.sql',
  'infra/postgres/init/006_add_reel_types_avatar_generations.sql',
];

export async function ensurePipelineSchema(client) {
  for (const relativePath of SCHEMA_FILES) {
    const sql = await fs.readFile(path.join(REPO_ROOT, relativePath), 'utf8');
    await client.query(sql);
  }
}
