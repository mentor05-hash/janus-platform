import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

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
 * 불변식: HR 에게 열린 API 는 **HR 이 들어갈 수 있는 화면이 부르는** API 여야 한다.
 * (백엔드가 표보다 **좁은** 것은 허용 — 화면이 없는 관리 API 가 있을 수 있다.)
 *
 * ── 1차(O181) 이후 고친 것 두 가지 ─────────────────────────────────────────────
 *
 * ① **데코레이터 귀속이 틀렸다.** 이전 파서는 `@Get(...)` 줄에서 **아래로 8줄**을 읽어
 *    `@Roles` 를 찾았다. NestJS 데코레이터는 메서드 **위**에 붙으므로, 짧은 핸들러에서는
 *    8줄 창이 다음 핸들러의 데코레이터까지 삼킨다. 실제로 `funnel.controller` 에서
 *    `@Public()` 인 `POST /funnel/event` 가 다음 핸들러의 `@Roles('admin','hr')` 를
 *    가져가고, 정작 `GET /funnel/summary` 는 역할이 없는 것으로 보여 **검사에서 빠졌다**.
 *    (O181 이 잔여 목록에 'funnel/event' 를 적은 것도 이 오탐 때문이다.)
 *    → 이제 **데코레이터 묶음 단위**로 파싱한다: 연속된 `@...` 줄을 모아 두었다가 처음
 *      만나는 비-데코레이터 줄(= 피수식 대상)에 귀속시킨다. 다음 핸들러로 샐 수 없다.
 *
 * ② **화면을 이름으로 찾았다.** 이전에는 `admin/scores/ocr` → `scores` 처럼 경로 앞부분을
 *    화면 키로 썼다. 키가 다르면 조용히 '대응 화면 없음'으로 빠져나갔고, 그렇게 빠진 것이
 *    실제 누수였다 — `admin/school-record-guard/*`(화면 `sr-guard`) · `admin/ops-settings`
 *    (화면 `ops`) · `admin/realtime/policy`(화면 `infra`) · `admin/teachers/monthly-hours`
 *    (화면 `evaluation`). 생기부 이의 큐까지 HR 에게 열려 있었다.
 *    → 이제 **누가 부르는가**로 찾는다. 각 화면의 페이지 파일에서 API 경로를 뽑아
 *      `경로 → 그 경로를 부르는 화면들` 을 만든다. 이름 규칙에 기대지 않는다.
 *
 * ── 판정할 수 없는 것 ────────────────────────────────────────────────────────
 * `/admin` 밖 선생님 공용 경로(booking·classroom·availability·qna·material 등)와 대응
 * 화면이 아예 없는 운영 API 는 이 기준으로 판정할 수 없다. 이들은 **개수를 고정**해
 * 새로 늘어날 때만 실패시킨다(lint 예산과 같은 래칫) — 판단을 미루되 부채는 보이게 둔다.
 */

const API_SRC = join(__dirname, '..', '..');
const WEB_SRC = join(API_SRC, '..', '..', 'web', 'src');
const ADMIN_ROUTES_FILE = join(WEB_SRC, 'auth', 'adminRoutes.ts');
const APP_FILE = join(WEB_SRC, 'App.tsx');

const read = (p: string): string | null => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

// ────────────────────────────── 백엔드 ──────────────────────────────

type Grant = { file: string; route: string; method: string; roles: string[] };

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...controllerFiles(p));
    else if (e.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}

/**
 * 데코레이터 묶음 → 피수식 대상. 연속된 `@...` 줄을 모아 두었다가 비-데코레이터 줄에서
 * 확정한다. 여러 줄에 걸친 데코레이터는 괄호 균형으로 이어 붙인다.
 */
function decoratorRuns(
  src: string,
): Array<{ decorators: string; target: string }> {
  const runs: Array<{ decorators: string; target: string }> = [];
  let pending: string[] = [];
  let buf = '';
  let depth = 0;
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (depth > 0) {
      buf += ' ' + t;
      depth += (t.match(/\(/g) ?? []).length - (t.match(/\)/g) ?? []).length;
      if (depth <= 0) {
        pending.push(buf);
        buf = '';
        depth = 0;
      }
      continue;
    }
    if (t.startsWith('@')) {
      const open =
        (t.match(/\(/g) ?? []).length - (t.match(/\)/g) ?? []).length;
      if (open > 0) {
        buf = t;
        depth = open;
      } else pending.push(t);
      continue;
    }
    // 빈 줄·주석은 묶음을 끊지 않는다(주석 딸린 데코레이터가 흔하다).
    if (!t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*'))
      continue;
    if (pending.length) {
      runs.push({ decorators: pending.join('\n'), target: t });
      pending = [];
    }
  }
  return runs;
}

const rolesOf = (decorators: string): string[] =>
  /@Roles\(([^)]*)\)/
    .exec(decorators)?.[1]
    .split(',')
    .map((r) => r.replace(/['\s]/g, '')) ?? [];

function readBackendGrants(): Grant[] {
  const grants: Grant[] = [];
  for (const file of controllerFiles(join(API_SRC, 'modules'))) {
    const src = read(file);
    if (!src) continue;
    const runs = decoratorRuns(src);
    const cls = runs.find((r) =>
      /^(export\s+)?(abstract\s+)?class\b/.test(r.target),
    );
    const base = cls
      ? (/@Controller\(\s*'([^']*)'/.exec(cls.decorators)?.[1] ?? '')
      : '';
    const classRoles = cls ? rolesOf(cls.decorators) : [];
    for (const run of runs) {
      if (run === cls) continue;
      const http = /@(Get|Post|Patch|Put|Delete)\(\s*'?([^')]*)'?\s*\)/.exec(
        run.decorators,
      );
      if (!http) continue;
      if (/@Public\(/.test(run.decorators)) continue; // 공개 경로는 역할 판정 대상이 아니다
      const own = /@Roles\(/.test(run.decorators)
        ? rolesOf(run.decorators)
        : classRoles;
      if (!own.length) continue;
      grants.push({
        file: file.replace(`${API_SRC}/`, ''),
        route: [base, http[2]].filter(Boolean).join('/'),
        method: http[1].toUpperCase(),
        roles: own,
      });
    }
  }
  return grants;
}

// ────────────────────────────── 웹 ──────────────────────────────

/** 웹 표에서 `path → roles`. 표 형식이 바뀌면 여기서 먼저 깨진다(의도). */
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

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const b = resolve(dirname(from), spec);
  for (const c of [
    `${b}.tsx`,
    `${b}.ts`,
    join(b, 'index.tsx'),
    join(b, 'index.ts'),
  ])
    if (existsSync(c)) return c;
  return null;
}

/** `ADMIN_ELEMENTS` 의 화면 키 → 페이지 파일. */
function readScreenFiles(): Map<string, string> {
  const app = readFileSync(APP_FILE, 'utf8');
  const block = app.slice(
    app.indexOf('const ADMIN_ELEMENTS'),
    app.indexOf('function AdminGuard'),
  );
  const compOf = new Map<string, string>();
  for (const m of block.matchAll(/'?([\w/-]+)'?:\s*<(\w+)/g))
    compOf.set(m[1], m[2]);

  const fileOf = new Map<string, string>();
  for (const m of app.matchAll(
    /const (\w+) = lazy\(\(\) => import\('([^']+)'\)/g,
  )) {
    const f = resolveLocal(APP_FILE, m[2]);
    if (f) fileOf.set(m[1], f);
  }
  for (const m of app.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const f = resolveLocal(APP_FILE, m[2]);
    if (!f) continue;
    for (const n of m[1].split(',')) fileOf.set(n.trim(), f);
  }

  const out = new Map<string, string>();
  for (const [screen, comp] of compOf) {
    const f = fileOf.get(comp);
    if (f) out.set(screen, f);
  }
  return out;
}

/**
 * 페이지 파일이 부르는 API 경로. `api.get('/x')` · `fetch('/api/v1/x')` 뿐 아니라
 * 변수로 조립하는 형태(`const path = ... ? '/a' : '/b'`)도 잡아야 하므로 `/` 로 시작하는
 * 문자열·템플릿 리터럴을 모두 모은 뒤, **실제 백엔드 경로와 일치하는 것만** 남긴다.
 * (라우터 경로 같은 무관한 리터럴은 이 교집합에서 자동으로 걸러진다.)
 * 다만 `to=`·`href=`·`navigate(` 자리의 리터럴은 화면 이동이므로 미리 뺀다.
 */
function apiPathsIn(src: string): string[] {
  const cleaned = src
    .replace(/\b(?:to|href)=\{?[`'"][^`'"]*[`'"]\}?/g, '')
    .replace(/navigate\(\s*[`'"][^`'"]*[`'"]/g, 'navigate(');
  const out = new Set<string>();
  for (const m of cleaned.matchAll(/[`'"](\/[A-Za-z0-9_\-/${}.:]*)[`'"]/g))
    out.add(m[1]);
  for (const m of cleaned.matchAll(/[`'"](\/[A-Za-z0-9_\-/${}.:]*)\?/g))
    out.add(m[1]);
  return [...out];
}

/** 파라미터·쿼리·prefix 를 지운 비교용 키. `/api/v1/admin/scores/${id}` → `admin/scores`. */
function routeKey(p: string): string {
  return p
    .replace(/^\/?api\/v1\//, '')
    .replace(/\$\{[^}]*\}/g, ':x')
    .split('/')
    .filter((s) => s && s !== ':x' && !s.startsWith(':'))
    .join('/');
}

// ────────────────────────────── 검사 ──────────────────────────────

/**
 * 화면으로 판정할 수 없는 **HR 허용 경로**의 상한(래칫).
 * `/admin` 밖 선생님 공용 경로 + 대응 화면이 없는 운영 API 다. 줄이는 것은 자유,
 * **늘리려면 이 숫자를 올려야 하고** 그때 근거를 남기게 된다(N37 잔여 워크스트림).
 */
const UNJUDGEABLE_HR_BUDGET = 34;

describe('백엔드 @Roles ↔ 웹 ADMIN_ROUTES 정합 (N37)', () => {
  const screens = readScreenRoles();
  const screenFiles = readScreenFiles();
  const grants = readBackendGrants();

  /** 경로키 → 그 경로를 부르는 화면들 */
  const callers = new Map<string, Set<string>>();
  {
    const backendKeys = new Set(grants.map((g) => routeKey(g.route)));
    for (const [screen, file] of screenFiles) {
      const src = read(file);
      if (!src) continue;
      for (const p of apiPathsIn(src)) {
        const k = routeKey(p);
        if (!backendKeys.has(k)) continue; // 실제 API 가 아닌 리터럴
        if (!callers.has(k)) callers.set(k, new Set());
        callers.get(k)!.add(screen);
      }
    }
  }

  const hrGrants = grants.filter((g) => g.roles.includes('hr'));

  it('웹 표를 읽어 온다 — 표 형식이 바뀌면 여기서 먼저 깨진다', () => {
    expect(screens.size).toBeGreaterThan(10);
    expect(screens.get('payroll')).toEqual(['admin']); // O127
    expect(screens.get('dashboard')).toEqual(['admin', 'hr']); // HR 착지 화면
    // 표의 모든 화면이 App.tsx 의 페이지 파일로 이어져야 호출자 분석이 성립한다.
    expect([...screens.keys()].filter((s) => !screenFiles.has(s))).toEqual([]);
  });

  it('데코레이터를 묶음 단위로 귀속한다 — 다음 핸들러로 새지 않는다', () => {
    const byRoute = (r: string) => grants.find((g) => g.route === r);
    // `@Public()` 인 이 경로가 다음 핸들러의 @Roles 를 가져가던 회귀(O181 오탐의 원인).
    expect(byRoute('funnel/event')).toBeUndefined();
    // 반대로 이 경로는 이전 파서에서 아예 보이지 않았다.
    expect(byRoute('funnel/summary')?.roles).toEqual(['admin', 'hr']);
  });

  it('화면이 부르는 API 를 찾아낸다 — 못 찾으면 검사가 무의미해진다', () => {
    expect(callers.size).toBeGreaterThan(50);
    // 이름이 다른 탓에 이전 파서가 놓쳤던 것들이 이제 잡혀야 한다.
    expect([...(callers.get('admin/school-record-guard/stats') ?? [])]).toEqual(
      ['sr-guard'],
    );
    expect([...(callers.get('admin/ops-settings') ?? [])]).toEqual(['ops']);
  });

  it('HR 에게 열린 API 는 HR 이 들어갈 수 있는 화면이 불러야 한다', () => {
    const violations: string[] = [];
    for (const g of hrGrants) {
      // 학생에게도 열린 경로라면 HR 을 빼도 얻는 것이 없다 — 학생은 최소 권한 역할이므로
      // 'hr' 가 거기 있다고 해서 직무를 넘는 권한이 생기지 않는다(예: 상담 기본시간 조회).
      if (g.roles.includes('student')) continue;
      const screensCalling = callers.get(routeKey(g.route));
      if (!screensCalling?.size) continue; // 화면으로 판정 불가 — 아래 래칫이 맡는다
      const open = [...screensCalling].some((s) =>
        screens.get(s)?.includes('hr'),
      );
      if (open) continue;
      // 화면 표로는 좁혀야 하지만 다른 근거로 유지하는 경우는 `n37:` 사유를 코드에 남긴다.
      const src = read(join(API_SRC, g.file)) ?? '';
      const hasRationale = new RegExp(
        `n37:[^]*?@(?:Get|Post|Patch|Put|Delete)\\([^)]*${g.route
          .split('/')
          .pop()!
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      ).test(src);
      if (hasRationale) continue;
      violations.push(
        `${g.method} ${g.route} → 화면 [${[...screensCalling].join(',')}] 은 HR 미개방인데 API 는 [${g.roles.join(',')}] (${g.file})`,
      );
    }
    expect(violations).toEqual([]);
  });

  it('화면으로 판정할 수 없는 HR 경로가 늘지 않는다(래칫)', () => {
    const unjudgeable = hrGrants.filter(
      (g) => !callers.get(routeKey(g.route))?.size,
    );
    if (unjudgeable.length > UNJUDGEABLE_HR_BUDGET) {
      const added = unjudgeable.map(
        (g) => `${g.method} ${g.route} (${g.file})`,
      );
      throw new Error(
        `화면 없이 HR 에게 열린 경로가 ${unjudgeable.length}건 — 상한 ${UNJUDGEABLE_HR_BUDGET} 초과.\n` +
          `새 경로에 'hr' 를 넣었다면 대응 화면을 표에 추가하거나 'hr' 를 빼세요.\n  ` +
          added.join('\n  '),
      );
    }
    expect(unjudgeable.length).toBeLessThanOrEqual(UNJUDGEABLE_HR_BUDGET);
  });
});
