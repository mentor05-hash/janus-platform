// 마케팅 사이트 생성 — marketing/src/*.html 의 Claude 아티팩트 링크를 상대경로로 재배선해
// marketing/dist/ 로 출력(Netlify 등 정적 호스팅용). `npm run gen:marketing`.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'marketing');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

// 아티팩트 ID → 상대 파일. 랜딩/개별 상세의 상호 링크를 로그인 없는 정적 링크로 치환.
const MAP = {
  '947ad205-7397-4b20-991c-edaae15df51e': 'svc-consulting.html',
  '1f53a6b9-bbdb-4d8b-9b0a-a9d28aef1b96': 'svc-baechi.html',
  '0905fef8-4d16-4f17-890a-59e7867c21f5': 'svc-ganggi.html',
  '33c6eaa1-4ff0-4c4d-9a4d-18cbfc81346b': 'svc-mock.html',
  '01a53965-a83d-4f13-943e-22214557e09d': 'svc-ipgyeol.html',
  'c89fbd93-0d28-4079-8308-2c42250ee41c': 'svc-jaso.html',
  '799b9e97-8f1a-4a2b-8f1c-2727c92aa8d3': 'svc-planner.html',
  '419b90e8-69cb-44da-a59f-9737507dd4fb': 'services.html',
};

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const files = readdirSync(SRC).filter((f) => f.endsWith('.html'));
let totalReplaced = 0;
for (const f of files) {
  let html = readFileSync(join(SRC, f), 'utf8');
  for (const [id, rel] of Object.entries(MAP)) {
    const before = html;
    html = html.split(`https://claude.ai/code/artifact/${id}`).join(rel);
    if (before !== html) totalReplaced++;
  }
  writeFileSync(join(DIST, f), html);
}
const leftover = files.reduce((n, f) => n + (readFileSync(join(DIST, f), 'utf8').includes('claude.ai/code/artifact') ? 1 : 0), 0);
console.log(`✅ marketing/dist 생성: ${files.length}개 파일, 링크 치환 ${totalReplaced}회, 잔여 아티팩트 링크 ${leftover}`);
console.log(`   진입: dist/index.html · 정적 호스팅(Netlify Drop 등)에 dist 폴더 업로드`);
if (leftover > 0) process.exit(1);
