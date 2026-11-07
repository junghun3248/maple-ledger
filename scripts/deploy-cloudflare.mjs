import './sites-env.mjs';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const expected = JSON.parse(readFileSync('wrangler.cloudflare.json', 'utf8'));
const built = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
if (
  built.name !== expected.name ||
  built.d1_databases?.find((db) => db.binding === 'DB')?.database_id !==
    expected.d1_databases.find((db) => db.binding === 'DB')?.database_id
) {
  throw new Error(
    'Run npm run build:cloudflare before deploying. The current build targets another host.',
  );
}
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
    'deploy',
    '--config',
    'dist/server/wrangler.json',
  ],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
