// 마케팅 사이트 빌드 — marketing/src/*.html 를 marketing/dist/ 로 내보낸다. `npm run gen:marketing`.
//
// 산출물은 **정적 호스팅(Cloudflare Pages) 전용**이다 — 공개 랜딩의 오리진이 맥에 묶이면 안 된다(O182).
// 배포 대상 주소는 apex·www (개통 보류 중). 배치도: docs/20_exec/야누스_도메인주소_배치도_2026-08-12.md
//
// 정본은 **웹앱의 /·/services** 서사(진단→처방→실행 7종)다. 여기 HTML 은 그 공개용 사본이며,
// 앱의 SERVICES 정의(apps/web/src/pages/ServicesPage.tsx)가 바뀌면 같이 고쳐야 한다.
//
// 구버전(잇올 포지셔닝, 7/06 초판)은 marketing/legacy/ 로 내렸다 — 빌드에 포함되지 않는다.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'marketing');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const files = readdirSync(SRC).filter((f) => f.endsWith('.html'));
if (files.length === 0) {
  console.error('❌ marketing/src 에 HTML 이 없다 — 빌드할 것이 없음');
  process.exit(1);
}
for (const f of files) writeFileSync(join(DIST, f), readFileSync(join(SRC, f), 'utf8'));

// 가드 — 디자인 툴에서 갓 붙여넣은 페이지는 아티팩트 절대링크를 물고 온다.
// 그대로 공개하면 로그인 없는 방문자가 막다른 링크를 만나므로, 남아 있으면 빌드를 깬다.
const dangling = files.filter((f) => readFileSync(join(DIST, f), 'utf8').includes('claude.ai/code/artifact'));
console.log(`✅ marketing/dist 생성: ${files.length}개 파일`);
console.log('   진입: dist/index.html · 정적 호스팅에 dist 폴더 업로드');
if (dangling.length > 0) {
  console.error(`❌ 아티팩트 절대링크가 남은 파일 ${dangling.length}개: ${dangling.join(', ')}`);
  console.error('   → 상대경로(./services.html 등)로 바꾼 뒤 다시 빌드할 것');
  process.exit(1);
}
