import { MockPgProvider } from './mock-pg.provider';

describe('MockPgProvider (§9 O2·§10)', () => {
  const sut = new MockPgProvider();

  it('정상 금액 → 승인(done) + 멱등키 기반 결정적 거래ID', async () => {
    const r = await sut.charge({ payerAccountId: 'p1', amount: 30000, purpose: 'subscription', idempotencyKey: 'sub1:t' });
    expect(r.status).toBe('done');
    expect(r.transactionId).toBe('mock_sub1:t');
  });

  it('0 이하 금액 → 실패', async () => {
    const r = await sut.charge({ payerAccountId: 'p1', amount: 0, purpose: 'subscription', idempotencyKey: 'x' });
    expect(r.status).toBe('failed');
  });
});
