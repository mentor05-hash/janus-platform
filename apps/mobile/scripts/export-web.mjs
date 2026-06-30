// expo-web 정적 export + 후처리(meta 주입).
//   사용: npm run export:web --workspace apps/mobile   (레포 루트에서)
//   - EXPO_PUBLIC_API_BASE=/api/v1 로 주입 → nginx /api 프록시 뒤 상대경로 사용.
//   - format-detection 메타 주입 → 안드로이드 Chrome 이 "09:00"을 "9시" 등으로
//     자동 변환하는 것을 방지(시간 표 일관성).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

execSync('npx expo export -p web', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_API_BASE: process.env.EXPO_PUBLIC_API_BASE ?? '/api/v1' },
});

const indexPath = join(root, 'dist', 'index.html');
let html = readFileSync(indexPath, 'utf8');
const meta = '<meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>';
if (!html.includes('format-detection')) {
  html = html.replace(/<head>/i, `<head>${meta}`);
  writeFileSync(indexPath, html);
  console.log('[export-web] format-detection meta 주입 완료');
} else {
  console.log('[export-web] format-detection meta 이미 존재');
}
