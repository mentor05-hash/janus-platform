import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ACCOUNTS, auth, login as loginAs } from './fixtures/demo-accounts';

/**
 * N37(O181 1차 · O182 2차) — **좁힌 경로가 HR 에게 실제로 닫혀 있는가**.
 *
 * 왜 이 스펙이 필요한가: N37 을 좁힌 근거는 `admin-roles-drift.spec.ts` 인데, 그건 **소스를
 * 읽어 대조하는 정적 검사**다. 데코레이터가 실제 요청에서 집행되는지는 보지 않는다.
 * O127 이 남긴 교훈이 정확히 이것이었다 — 코드·문서·nav 가 서로 달랐는데 24일 동안 아무도
 * 못 잡은 이유는 **HR 액터로 무언가를 치는 e2e 가 0건**이었기 때문이다.
 * 거부는 조용해서, 회귀해도 아무도 모른다. 그래서 여기서 거부를 고정한다.
 *
 * 대조군을 함께 둔다: 같은 경로에 **관리자는 403 이 아니어야** 한다. 이게 없으면
 * "전부 깨져서 403" 인 상태도 초록으로 보인다.
 */

const UUID = '00000000-0000-4000-8000-0000000000aa';

/** HR 에게 닫아야 하는 경로 — O182 로 'hr' 를 뺀 것들. */
const DENIED: Array<[method: string, path: string, why: string]> = [
  // 생기부 가드 — 화면 `sr-guard` 는 관리자 전용, 이의 큐에 학생 PII 가 담긴다
  ['get', '/api/v1/admin/school-record-guard/stats', '생기부 차단 통계'],
  ['get', '/api/v1/admin/school-record-guard/appeals', '생기부 이의 큐'],
  ['get', '/api/v1/admin/school-record-guard/consulting-toggle', '컨설팅 토글'],
  [
    'patch',
    `/api/v1/admin/school-record-guard/appeals/${UUID}`,
    '이의 상태 갱신',
  ],
  ['put', '/api/v1/admin/school-record-guard/consulting-toggle', '토글 저장'],
  // 운영 설정·정책 — 화면 `ops`·`infra` 는 관리자 전용
  ['get', '/api/v1/admin/ops-settings', '운영 정책값'],
  ['put', '/api/v1/admin/ops-settings', '운영 정책 저장'],
  ['get', '/api/v1/admin/realtime/policy', '실시간 정책'],
  ['put', '/api/v1/admin/realtime/policy', '실시간 정책 저장'],
  ['get', '/api/v1/admin/dashboard/policy', '대시보드 노출 정책'],
  ['put', '/api/v1/admin/dashboard/policy', '노출 정책 저장'],
  // 급여 산정 기초값 — O127(HR 은 급여에 권한이 없다)과 정합
  ['put', `/api/v1/admin/teachers/${UUID}/monthly-hours`, '월간 시수'],
  ['put', `/api/v1/admin/teachers/${UUID}/director`, '원장 지정'],
  // 운영 지표 — 화면 `analytics`·`assignment` 는 관리자 전용
  ['get', '/api/v1/ops/center-comparison', '센터 비교'],
  ['get', '/api/v1/assignment/dashboard', '자동배정 대시보드'],
  // 예약 정책·역상담 — 화면 `infra`·`reverse` 는 관리자 전용
  ['get', '/api/v1/bookings/reverse/policy', '역상담 정책'],
  ['get', '/api/v1/bookings/external/policy', '외부학생 정책(할증·크레딧)'],
  ['get', '/api/v1/bookings/reverse/admin-students', '역상담 대상 학생'],
  ['patch', `/api/v1/bookings/reverse/admin/${UUID}`, '역상담 지정/해제'],
  // 신고 — 화면 `reports` 는 관리자 전용. 사유 원문 + 제재 판단
  ['get', '/api/v1/reports', '신고 목록'],
  ['patch', `/api/v1/reports/${UUID}`, '신고 처리'],
  // 판매 조건 — 화면 `membership` 은 관리자 전용
  ['get', '/api/v1/hr/membership-grades', '등급·부여 크레딧'],
  ['patch', `/api/v1/hr/membership-grades/${UUID}`, '부여 크레딧 편집'],
  // 분류 한도 — HR 은 적용 대상이지 설정 주체가 아니다
  ['get', '/api/v1/hr/limits', '분류 한도 조회'],
  ['post', '/api/v1/hr/limits', '분류 한도 저장'],
  // 리그 정책 — 승급 요건은 크레딧 소비량에 직결
  ['get', '/api/v1/qna/league/policy', '리그 정책 조회'],
  ['put', '/api/v1/qna/league/policy', '리그 정책 저장'],
  // 결제 확정 — ManualPaymentProvider 는 무조건 paid 다(비가역, O127 과 같은 문제)
  [
    'post',
    `/api/v1/consulting/applications/${UUID}/payment/confirm`,
    '결제 확정',
  ],
  // 보호자 강제 연결 — 학생 동의 우회(O180)
  ['patch', `/api/v1/guardian/links/${UUID}/respond`, '보호자 연결 강제 복구'],
];

/** HR 에게 열어 둔 경로 — 대응 화면이 HR 개방이라 유지한 것들(O182). */
const ALLOWED: Array<[method: string, path: string, why: string]> = [
  ['get', '/api/v1/admin/dashboard', 'HR 착지 화면(O128)'],
  ['get', '/api/v1/funnel/summary', '화면 `dashboard` 가 HR 개방'],
  ['get', '/api/v1/admin/member-types', '화면 `member-types`(PPL-10)'],
  ['get', '/api/v1/dashboard/access', '자기 범위 조회(n37: 사유 주석)'],
  ['get', '/api/v1/hr/teachers', 'HR 직무 — 선생님 등록·관리'],
  [
    'patch',
    `/api/v1/teachers/${UUID}/verify-achievements`,
    '화면 `hr-teachers`',
  ],
];

const call = (
  app: INestApplication,
  method: string,
  path: string,
  token: string,
) =>
  (
    request(app.getHttpServer()) as unknown as Record<
      string,
      (p: string) => request.Test
    >
  )
    [method](path)
    .set(auth(token))
    .send({});

describe('N37 — 좁힌 경로는 HR 에게 닫혀 있다(O182)', () => {
  let app: INestApplication;
  const tok: Record<string, string> = {};

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    tok.hr = await loginAs(app, ACCOUNTS.hr);
    tok.centerAdmin = await loginAs(app, ACCOUNTS.centerAdmin);
    tok.hq = await loginAs(app, ACCOUNTS.hq);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it.each(DENIED)('HR 차단: %s %s (%s)', async (method, path) => {
    const res = await call(app, method, path, tok.hr);
    expect(res.status).toBe(403);
  });

  /**
   * 대조군 — 이게 없으면 앱이 통째로 죽어 **전부 403** 인 상태도 위 검사를 통과한다.
   * 403 이 아니기만 하면 된다: 404(없는 UUID)·400(빈 바디)은 **역할을 통과했다**는 증거다.
   *
   * 관리자를 둘 쓰는 이유: 일부 쓰기 경로는 `@MinPerm('L2')` 라 **본사급만** 통과한다
   * (`admin/ops-settings` PUT · `admin/realtime/policy` PUT · `admin/dashboard/policy` PUT ·
   *  `admin/teachers/:id/director`). 센터관리자(L3) 하나만 보면 그 정당한 403 을
   *  회귀로 오인한다. 반대로 센터 스코프 경로는 본사(center_id NULL)가 막히므로,
   *  **둘 중 하나라도 통과하면** "역할 때문에 막힌 게 아니다"가 성립한다.
   */
  it.each(DENIED)('관리자는 통과: %s %s (%s)', async (method, path) => {
    const [asCenter, asHq] = await Promise.all([
      call(app, method, path, tok.centerAdmin),
      call(app, method, path, tok.hq),
    ]);
    expect([asCenter.status, asHq.status]).not.toEqual([403, 403]);
  });

  it.each(ALLOWED)('HR 유지: %s %s (%s)', async (method, path) => {
    const res = await call(app, method, path, tok.hr);
    expect(res.status).not.toBe(403);
  });
});
