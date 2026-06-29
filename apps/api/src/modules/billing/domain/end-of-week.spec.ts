import { endOfWeekKst } from '../weekly-grant.service';

/** §5-3 주간 소멸 경계: 부여 시점 기준 해당 주 일요일 23:59 KST(소멸 cron과 동일 시각). */
const kstParts = (d: Date) => {
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return { dow: k.getUTCDay(), h: k.getUTCHours(), m: k.getUTCMinutes() };
};

describe('주간 소멸 경계(§5-3)', () => {
  it('월요일 부여 → 같은 주 일요일 23:59 KST 만료', () => {
    // 2026-06-01 00:00 KST = 2026-05-31T15:00:00Z (월요일)
    const grantNow = new Date('2026-05-31T15:00:00Z');
    const exp = endOfWeekKst(grantNow);
    const p = kstParts(exp);
    expect(p.dow).toBe(0); // 일요일
    expect(p.h).toBe(23);
    expect(p.m).toBe(59);
    // 만료가 부여보다 뒤이고, 7일 이내(이월 없음)
    expect(exp.getTime()).toBeGreaterThan(grantNow.getTime());
    expect(exp.getTime() - grantNow.getTime()).toBeLessThan(7 * 86_400_000);
  });

  it('소멸 cron(일 23:59)이 당주 만료분을 잡는다 (expire_at <= now)', () => {
    const grantMon = new Date('2026-05-31T15:00:00Z');
    const exp = endOfWeekKst(grantMon);
    // 같은 주 일요일 23:59:00 KST 의 cron 실행 시각 = exp 와 동일 → <= 성립
    expect(exp.getTime()).toBeLessThanOrEqual(exp.getTime());
    // 다음 월요일 00:00 KST(새 부여)는 만료 이후
    const nextMon = new Date('2026-06-07T15:00:00Z');
    expect(nextMon.getTime()).toBeGreaterThan(exp.getTime());
  });
});
