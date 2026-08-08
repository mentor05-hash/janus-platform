import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEMO_ADMIN_LOGIN_IDS,
  DEMO_ADMIN_PW_ENV,
  DEMO_DEFAULT_PW,
  demoAdminPassword,
  demoPasswordFor,
  isDemoAdminAccount,
} from './demo-admin-accounts';

describe('데모 관리자 비밀번호 분리', () => {
  const NON_ADMIN = ['student01', 'teacher01', 'teacher02', 'guardian01', 'paid01', 'paidall'];

  describe('ENV 미설정 — 기존 동작과 완전히 동일해야 한다(CI·로컬 무영향)', () => {
    it('관리자 계열도 기본 비밀번호', () => {
      for (const id of DEMO_ADMIN_LOGIN_IDS) {
        expect(demoPasswordFor(id, {})).toBe(DEMO_DEFAULT_PW);
      }
    });
    it('일반 계정도 기본 비밀번호', () => {
      for (const id of NON_ADMIN) {
        expect(demoPasswordFor(id, {})).toBe(DEMO_DEFAULT_PW);
      }
    });
    it('빈 문자열·공백만 있는 ENV 는 미설정으로 본다', () => {
      for (const raw of ['', '   ', '\t\n']) {
        expect(demoAdminPassword({ [DEMO_ADMIN_PW_ENV]: raw })).toBeNull();
        expect(demoPasswordFor('admin01', { [DEMO_ADMIN_PW_ENV]: raw })).toBe(DEMO_DEFAULT_PW);
      }
    });
  });

  describe('ENV 설정 — 관리자 계열만 갈라진다', () => {
    const env = { [DEMO_ADMIN_PW_ENV]: 'S3parated-Demo-PW' };

    it('관리자 계열 4종은 분리값', () => {
      for (const id of DEMO_ADMIN_LOGIN_IDS) {
        expect(demoPasswordFor(id, env)).toBe('S3parated-Demo-PW');
      }
    });
    it('일반 계정은 그대로 기본값 — 체험 동선이 깨지면 안 된다', () => {
      for (const id of NON_ADMIN) {
        expect(demoPasswordFor(id, env)).toBe(DEMO_DEFAULT_PW);
      }
    });
    it('앞뒤 공백은 다듬는다', () => {
      expect(demoPasswordFor('hq01', { [DEMO_ADMIN_PW_ENV]: '  padded  ' })).toBe('padded');
    });
  });

  describe('대상 판정', () => {
    it('HR 도 관리자 콘솔 계열이라 포함된다', () => {
      expect(isDemoAdminAccount('hr01')).toBe(true);
    });
    it('학생·선생님·학부모는 대상이 아니다', () => {
      for (const id of NON_ADMIN) expect(isDemoAdminAccount(id)).toBe(false);
    });
  });

  // 한쪽만 고치고 끝나는 사고를 막는다 — 웹이 원터치를 막는 목록과 시드가 비번을 가르는 목록은 같아야 한다.
  describe('웹 RESTRICTED 목록과의 드리프트', () => {
    const WEB_FILE = join(__dirname, '..', '..', '..', 'web', 'src', 'auth', 'demoAccounts.ts');

    it('웹 파일에서 목록을 실제로 읽어낸다(못 읽으면 통과가 아니라 실패)', () => {
      const src = readFileSync(WEB_FILE, 'utf8');
      const m = src.match(/RESTRICTED\s*=\s*new Set\(\s*\[([^\]]*)\]/);
      // 파싱 실패를 조용히 넘기면 '검사한 척'이 된다 — 형태가 바뀌었으면 여기서 멈춰야 한다.
      expect(m).not.toBeNull();
      const webIds = m![1]
        .split(',')
        .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
        .filter(Boolean);
      expect(webIds.length).toBeGreaterThan(0);
      expect([...webIds].sort()).toEqual([...DEMO_ADMIN_LOGIN_IDS].sort());
    });
  });
});
