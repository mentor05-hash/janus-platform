#!/usr/bin/env node
// DB(information_schema)에서 테이블·컬럼·외래키를 읽어 Mermaid ER 다이어그램 생성.
// 사용: DATABASE_URL=... node scripts/gen-erd.mjs > ../../docs/ERD.mmd
import pg from 'pg';

const url = process.env.DATABASE_URL || 'postgresql://janus:janus_local_pw@localhost:5432/janus';
const c = new pg.Client({ connectionString: url });
await c.connect();

const cols = (await c.query(`
  SELECT table_name, column_name, data_type,
    (SELECT true FROM information_schema.key_column_usage k
       JOIN information_schema.table_constraints tc ON tc.constraint_name=k.constraint_name
      WHERE tc.constraint_type='PRIMARY KEY' AND k.table_name=c.table_name AND k.column_name=c.column_name LIMIT 1) AS is_pk
  FROM information_schema.columns c
  WHERE table_schema='public'
  ORDER BY table_name, ordinal_position`)).rows;

const fks = (await c.query(`
  SELECT tc.table_name AS src, ccu.table_name AS dst, kcu.column_name AS col
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`)).rows;
await c.end();

const byTable = {};
for (const r of cols) (byTable[r.table_name] ??= []).push(r);

let out = 'erDiagram\n';
for (const [t, cs] of Object.entries(byTable)) {
  out += `  ${t} {\n`;
  for (const col of cs) {
    const type = col.data_type.replace(/ /g, '_').replace('character_varying', 'text');
    const key = col.is_pk ? ' PK' : '';
    out += `    ${type} ${col.column_name}${key}\n`;
  }
  out += `  }\n`;
}
const seen = new Set();
for (const f of fks) {
  const k = `${f.src}->${f.dst}`;
  if (seen.has(k)) continue; seen.add(k);
  out += `  ${f.dst} ||--o{ ${f.src} : "${f.col}"\n`;
}
process.stdout.write(out);
