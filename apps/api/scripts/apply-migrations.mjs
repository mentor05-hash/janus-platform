#!/usr/bin/env node
/**
 * 마이그레이션 일괄 적용 (CLAUDE.md §10 — 수동 단건 SQL 금지, 코드화된 순서 적용).
 * schema_migrations 원장에 적용분을 기록해 idempotent 하게 동작(이미 적용분은 건너뜀).
 * - 빈 원장 + 기존 스키마(account 존재) → 베이스라인(모든 파일을 적용됨으로 기록만).
 * - 빈 원장 + 빈 DB(CI 등) → 전부 순서대로 적용.
 * 적용 자체는 prisma db execute(다중 문장 지원), 원장 조회/기록은 PrismaClient.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(apiRoot, 'migrations');

// .env 로드 — dotenv 는 devDep 일 수 있어(프로덕션 이미지 부재) 폴백 파서 내장.
try {
  require('dotenv').config({ path: join(apiRoot, '.env') });
} catch {
  try {
    for (const line of readFileSync(join(apiRoot, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch { /* .env 없음 */ }
}
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

// prisma CLI(devDep) 대신 pg(prod dep)로 직접 실행 — 프로덕션 컨테이너에서도 동작(근본처방).
// simple query 프로토콜은 다중 문장·DO $$ 블록을 지원한다.
const { Client } = require('pg');

async function applyFile(f) {
  const sql = readFileSync(join(migrationsDir, f), 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
  } catch (e) {
    console.error(`\n✗ 실패: ${f}\n`, e.message ?? e);
    process.exit(1);
  } finally {
    await client.end();
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

  // --baseline: 미기록분을 "실행 없이" 적용됨으로 기록. DB 가 이미 현행(수동 psql 적용 등)인데
  // 원장만 뒤처진 경우의 1회성 정합화 — 이후부터는 신규 파일만 정상 실행된다.
  if (process.argv.includes('--baseline')) {
    let n = 0;
    for (const f of files) {
      if (applied.has(f)) continue;
      await prisma.$executeRawUnsafe('INSERT INTO schema_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING', f);
      console.log(`· ${f} → 기록만(실행 없음)`);
      n++;
    }
    console.log(`베이스라인 완료: ${n}개 기록 / 전체 ${files.length}개`);
    await prisma.$disconnect();
    return;
  }

  // 베이스라인(자동): 원장이 비었는데 스키마가 이미 있으면(account 존재) 기존 파일을 기록만 한다.
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
    await applyFile(f);
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
