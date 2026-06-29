#!/usr/bin/env node
/**
 * 마이그레이션 일괄 적용 (CLAUDE.md §10 — 수동 단건 SQL 금지, 코드화된 순서 적용).
 * schema_migrations 원장에 적용분을 기록해 idempotent 하게 동작(이미 적용분은 건너뜀).
 * - 빈 원장 + 기존 스키마(account 존재) → 베이스라인(모든 파일을 적용됨으로 기록만).
 * - 빈 원장 + 빈 DB(CI 등) → 전부 순서대로 적용.
 * 적용 자체는 prisma db execute(다중 문장 지원), 원장 조회/기록은 PrismaClient.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(apiRoot, 'migrations');
const schema = join(apiRoot, 'prisma', 'schema.prisma');

require('dotenv').config({ path: join(apiRoot, '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

function applyFile(f) {
  const r = spawnSync(
    'npx',
    ['prisma', 'db', 'execute', '--file', join(migrationsDir, f), '--schema', schema],
    { cwd: apiRoot, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(`\n✗ 실패: ${f}`);
    process.exit(r.status ?? 1);
  }
}

async function main() {
  if (files.length === 0) {
    console.error('적용할 마이그레이션이 없습니다.');
    process.exit(1);
  }

  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  const appliedRows = await prisma.$queryRawUnsafe('SELECT name FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.name));

  // 베이스라인: 원장이 비었는데 스키마가 이미 있으면(account 존재) 기존 파일을 기록만 한다.
  if (applied.size === 0) {
    const exists = await prisma.$queryRawUnsafe(
      "SELECT to_regclass('public.account') IS NOT NULL AS present",
    );
    if (exists[0]?.present) {
      for (const f of files) {
        await prisma.$executeRawUnsafe('INSERT INTO schema_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING', f);
      }
      console.log(`베이스라인: 기존 스키마 감지 → ${files.length}개 마이그레이션을 적용됨으로 기록`);
      await prisma.$disconnect();
      return;
    }
  }

  let count = 0;
  for (const f of files) {
    if (applied.has(f)) {
      console.log(`· ${f} (이미 적용)`);
      continue;
    }
    process.stdout.write(`▶ ${f} ... `);
    applyFile(f);
    await prisma.$executeRawUnsafe('INSERT INTO schema_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING', f);
    console.log('ok');
    count++;
  }
  console.log(`완료: 신규 ${count}개 적용 / 전체 ${files.length}개`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
