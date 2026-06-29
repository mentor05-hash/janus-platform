import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/iam/auth.service';

/**
 * d3 §10 보안: refresh 토큰 회전(이전 토큰 무효) + 서버측 로그아웃 무효화.
 */
const STUDENT = '00000000-0000-4000-8000-0000000000a1';

describe('d3 refresh 회전·로그아웃(§10)', () => {
  let app: INestApplication;
  let auth: AuthService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    auth = mod.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('refresh 시 회전 — 이전 refresh 토큰은 재사용 불가', async () => {
    const { refreshToken: rt1 } = await auth.login({ loginId: 'student01', password: 'dev-password!' } as any);
    const { refreshToken: rt2 } = await auth.refresh(rt1);
    expect(rt2).not.toBe(rt1);
    // 이전 토큰 재사용 → 거부(회전됨)
    await expect(auth.refresh(rt1)).rejects.toThrow(/재사용|무효/);
    // 최신 토큰은 유효
    const { refreshToken: rt3 } = await auth.refresh(rt2);
    expect(rt3).toBeTruthy();
  });

  it('로그아웃 후 refresh 무효', async () => {
    const { refreshToken } = await auth.login({ loginId: 'student01', password: 'dev-password!' } as any);
    await auth.logout(STUDENT);
    await expect(auth.refresh(refreshToken)).rejects.toThrow(/재사용|무효/);
  });
});
