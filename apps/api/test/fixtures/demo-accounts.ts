import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DEMO_DEFAULT_PW, demoPasswordFor } from '../../src/config/demo-admin-accounts';

/**
 * 데모 계정 **단일 정본** + 로그인 헬퍼.
 *
 * 왜 이 파일이 필요한가: e2e 스펙들이 로그인 아이디를 각자 문자열로 박아 두었고, 그중 `hq1`·`t1`·`ls1`·`lt1`
 * 은 어떤 시드에도 없는 값이었다. 게다가 각 스펙의 login 헬퍼가 `.body.data.accessToken` 을 무방비로 읽어
 * 401(없는 계정)·429(리미터·계정잠금)·403(미승인)이 전부 똑같은
 * `TypeError: Cannot read properties of undefined (reading 'accessToken')` 로 위장됐다 —
 * 서로 다른 병 4가지가 같은 증상으로 보고돼 진단이 오래 걸렸다.
 *
 * 정본은 `apps/api/prisma/seed-base.sql` 과 `docs/접속_주소_정리.md` 다. 새 스펙은 문자열을 박지 말고 여기서 import 한다.
 */
export const DEMO_PW = DEMO_DEFAULT_PW;

/**
 * 이 계정의 비밀번호. 보통은 `DEMO_PW` 하나지만, 공개 데모처럼 `JANUS_DEMO_ADMIN_PW` 를 준
 * 환경에서는 관리자 계열만 값이 다르다(`src/config/demo-admin-accounts.ts`).
 * CI 는 ENV 를 주지 않으므로 전 계정 `DEMO_PW` — 기존 스펙 동작은 그대로다.
 */
export const pwFor = (loginId: string): string => demoPasswordFor(loginId);

/** 시드 계정 아이디 — seed-base.sql 기준. (구 `hqadmin`·`hq1`·`t1` 은 폐기됐다.) */
export const ACCOUNTS = {
  master: 'master01', // 마스터(L1) · center_id NULL
  hq: 'hq01', // 본사관리자(L2) · center_id NULL
  centerAdmin: 'admin01', // 센터관리자(L3) · 강남센터
  hr: 'hr01', // HR(L2) · 강남센터
  teacher: 'teacher01', // 선생님 · 강남센터
  teacher2: 'teacher02',
  student: 'student01',
  paid: 'paid01',
  guardian: 'guardian01',
} as const;

/**
 * 로그인 — 실패하면 **상태코드·바디를 담아 던진다**.
 * 토큰을 조용히 undefined 로 넘기면 실패 지점이 엉뚱한 곳(첫 요청의 401)으로 밀려 원인을 못 찾는다.
 */
export async function login(
  app: INestApplication,
  loginId: string,
  password: string = pwFor(loginId),
): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ loginId, password });
  const token = res.body?.data?.accessToken;
  if (!token) {
    throw new Error(
      `로그인 실패 loginId=${loginId} status=${res.status} body=${JSON.stringify(res.body)}\n` +
        `→ 계정이 시드에 있는지 확인하라(정본: test/fixtures/demo-accounts.ts · apps/api/prisma/seed-base.sql).`,
    );
  }
  return token;
}

/** Authorization 헤더 — 스펙마다 재선언하던 것. */
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * e2e 가 만드는 임시 픽스처의 이름 접두어.
 * 이름 기준 deleteMany 로 정리하는 스펙이 여럿이라(센터 등) 접두어 규약이 없으면 서로를 지운다.
 */
export const E2E_PREFIX = 'e2e-';
