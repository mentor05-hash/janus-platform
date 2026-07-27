import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 백엔드 `@Roles` ↔ 웹 `ADMIN_ROUTES` **드리프트 검출** (N37).
 *
 * O128 이 `/admin` 의 nav 와 라우트를 표 하나로 합쳐 **웹 안에서는** 두 목록이 갈라질 수
 * 없게 만들었다. 그런데 백엔드는 그 표를 모른다 — 표가 화면을 닫아도 API 는 열려 있어,
 * 화면 누수는 없지만 **API 직접 호출은 통과**한다. O128 이 남긴 미해결이 이것이다.
 *
 * 여기서 손목록을 하나 더 만들면 O128 이 없앤 문제를 되살리는 꼴이므로,
 * **웹의 표를 그대로 읽어** 기대값으로 쓴다. 표가 정본이고 이 테스트는 대조만 한다.
 *
 * 불변식: `admin/…` 경로가 HR 에게 열려 있다면, 그 화면도 표에서 HR 에게 열려 있어야 한다.
 * (백엔드가 표보다 **좁은** 것은 허용 — 화면이 없는 관리 API 가 있을 수 있다.)
 */

const API_SRC = join(__dirname, '..', '..');
const ADMIN_ROUTES_FILE = join(
  API_SRC,
  '..',
  '..',
  'web',
  'src',
  'auth',
  'adminRoutes.ts',
);

/** 웹 표에서 `path → roles` 를 뽑는다. 표 형식이 바뀌면 여기서 먼저 깨진다(의도). */
function readScreenRoles(): Map<string, string[]> {
  const src = readFileSync(ADMIN_ROUTES_FILE, 'utf8');
  const body = src.slice(src.indexOf('export const ADMIN_ROUTES'));
  const out = new Map<string, string[]>();
  const row = /\{\s*path:\s*'([^']+)'[^}]*?roles:\s*([A-Z_]+|\[[^\]]*\])/g;
  let m: RegExpExecArray | null;
  while ((m = row.exec(body))) {
    const raw = m[2];
    const roles =
      raw === 'ADMIN_HR'
        ? ['admin', 'hr']
        : raw === 'ADMIN'
          ? ['admin']
          : raw
              .replace(/[[\]']/g, '')
              .split(',')
              .filter(Boolean);
    out.set(
      m[1],
      roles.map((r) => r.trim()),
    );
  }
  return out;
}

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...controllerFiles(p));
    else if (e.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}

type Grant = { file: string; route: string; roles: string[] };

/**
 * 컨트롤러에서 `admin/…` 경로와 유효 역할을 뽑는다.
 * 클래스 레벨 `@Roles` 는 메서드에 상속되므로 메서드 데코레이터가 없으면 그것을 쓴다.
 */
function readBackendGrants(): Grant[] {
  const grants: Grant[] = [];
  for (const file of controllerFiles(join(API_SRC, 'modules'))) {
    const src = readFileSync(file, 'utf8');
    const base = /@Controller\(\s*'([^']*)'/.exec(src)?.[1] ?? '';
    const classRoles = classLevelRoles(src);
    const lines = src.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const http =
        /^\s*@(Get|Post|Patch|Put|Delete)\(\s*'?([^')]*)'?\s*\)/.exec(lines[i]);
      if (!http) continue;
      // 메서드 데코레이터 블록(다음 8줄) 안의 @Roles 가 있으면 우선.
      const block = lines.slice(i, i + 8).join('\n');
      const own = /@Roles\(([^)]*)\)/.exec(block);
      const roles = own
        ? own[1].split(',').map((r) => r.replace(/['\s]/g, ''))
        : classRoles;
      if (!roles.length) continue;
      const route = [base, http[2]].filter(Boolean).join('/');
      if (route.startsWith('admin/') || route === 'admin')
        grants.push({ file: file.replace(`${API_SRC}/`, ''), route, roles });
    }
  }
  return grants;
}

/** 클래스 레벨 `@Roles` — `@Controller(...)` 앞뒤 데코레이터 묶음에서 찾는다. */
function classLevelRoles(src: string): string[] {
  const at = src.indexOf('@Controller(');
  if (at < 0) return [];
  const around = src.slice(Math.max(0, at - 300), at + 300);
  const m = /@Roles\(([^)]*)\)/.exec(around);
  return m ? m[1].split(',').map((r) => r.replace(/['\s]/g, '')) : [];
}

/** `admin/scores/ocr` → 화면 키 후보(긴 것부터): `scores/ocr`, `scores`. */
function screenCandidates(route: string): string[] {
  const rest = route.replace(/^admin\/?/, '').split('/');
  const out: string[] = [];
  for (let n = rest.length; n >= 1; n--) {
    const seg = rest.slice(0, n).filter((s) => !s.startsWith(':'));
    if (seg.length) out.push(seg.join('/'));
  }
  return out;
}

describe('백엔드 @Roles ↔ 웹 ADMIN_ROUTES 정합 (N37)', () => {
  const screens = readScreenRoles();
  const grants = readBackendGrants();

  it('웹 표를 읽어 온다 — 표 형식이 바뀌면 여기서 먼저 깨진다', () => {
    expect(screens.size).toBeGreaterThan(10);
    expect(screens.get('payroll')).toEqual(['admin']); // O127
    expect(screens.get('dashboard')).toEqual(['admin', 'hr']); // HR 착지 화면
  });

  it('admin/ 경로를 하나 이상 찾는다 — 못 찾으면 검사가 무의미해진다', () => {
    expect(grants.length).toBeGreaterThan(5);
  });

  it('HR 에게 열린 admin/ API 는 화면도 HR 에게 열려 있어야 한다', () => {
    const violations: string[] = [];
    for (const g of grants) {
      if (!g.roles.includes('hr')) continue;
      const key = screenCandidates(g.route).find((k) => screens.has(k));
      if (!key) continue; // 대응 화면이 없는 관리 API — 이 검사의 대상이 아니다.
      if (!screens.get(key)!.includes('hr')) {
        violations.push(
          `${g.route} → 화면 '${key}' 는 [${screens.get(key)!.join(',')}] 인데 API 는 [${g.roles.join(',')}] (${g.file})`,
        );
      }
    }
    expect(violations).toEqual([]);
  });
});
