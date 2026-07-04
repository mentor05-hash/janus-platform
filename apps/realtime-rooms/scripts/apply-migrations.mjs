// 멱등 마이그레이션 적용 — migrations/*.sql 을 정렬 순서로 실행.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, '..', 'migrations');
const url = process.env.ROOMS_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('ROOMS_DATABASE_URL 미설정'); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
for (const f of files) {
  const sql = readFileSync(join(dir, f), 'utf8');
  process.stdout.write(`apply ${f} ... `);
  await client.query(sql);
  console.log('ok');
}
await client.end();
console.log(`done (${files.length} migrations)`);
