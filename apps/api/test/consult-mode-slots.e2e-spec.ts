import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AvailabilityService } from '../src/modules/availability/availability.service';
import { ACCOUNTS } from './fixtures/demo-accounts';

/**
 * 환경 인지 상담 모드 매칭의 **실연동**(O120 후속) — 어댑터가 실제 슬롯 조회에 걸리는지.
 *
 * 규약: 요청한 상담 모드가 그 시간대에 불가능하면 **슬롯을 내주지 않는다**(예약 단계에서 거른다 —
 * 입장한 뒤에 "화상이 안 되네"를 알면 늦다). 반환 형태(Slot[])는 그대로 두고, 사유는
 * `GET /teachers/:id/consult-modes` 가 알려준다(빈 배열만 주면 막다른 길이 된다).
 */
describe('상담 모드 슬롯 필터', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let svc: AvailabilityService;
  let teacherId = '';
  let studentId = '';
  let prevRecurring: unknown = null;
  let prevStay: unknown = null;
  /** 월요일 — 요일 고정으로 템플릿을 심는다(테스트가 오늘 요일에 흔들리지 않게). */
  let monday = '';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    svc = mod.get(AvailabilityService);

    const t = await prisma.account.findFirstOrThrow({
      where: { login_id: ACCOUNTS.teacher },
      select: { id: true },
    });
    const s = await prisma.account.findFirstOrThrow({
      where: { login_id: ACCOUNTS.student },
      select: { id: true },
    });
    teacherId = t.id;
    studentId = s.id;

    const ws = await prisma.work_schedule.findFirst({
      where: { teacher_id: teacherId },
    });
    prevRecurring = ws?.recurring_template ?? null;
    const sp = await prisma.student_profile.findUnique({
      where: { account_id: studentId },
    });
    prevStay = sp?.stay_time ?? null;

    // 다음 월요일(UTC 기준 계산 — periodBounds 류와 같은 규약)
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
    monday = d.toISOString().slice(0, 10);

    // 선생님: 집(전 모드 가능) / 학생: 독서실(소리 불가 — chat·whiteboard 만)
    await prisma.work_schedule.updateMany({
      where: { teacher_id: teacherId },
      data: {
        recurring_template: {
          '1': [{ start: '19:00', end: '22:00', env: 'home' }],
        },
      },
    });
    await prisma.student_profile.update({
      where: { account_id: studentId },
      data: {
        stay_time: { '1': [{ start: '19:00', end: '21:00', env: 'study' }] },
      },
    });
  });

  afterAll(async () => {
    // 원복 — 다른 스위트가 데모 근무·체류 템플릿을 전제한다.
    await prisma.work_schedule.updateMany({
      where: { teacher_id: teacherId },
      data: { recurring_template: (prevRecurring ?? Prisma.DbNull) as never },
    });
    await prisma.student_profile.update({
      where: { account_id: studentId },
      data: { stay_time: (prevStay ?? Prisma.DbNull) as never },
    });
    await app.close();
  });

  it('집(선생님) × 독서실(학생) → 가능한 모드는 화이트보드·채팅뿐', async () => {
    const r = await svc.getConsultModes(teacherId, monday, studentId);
    expect(r.availableModes).toEqual(['whiteboard', 'chat']);
  });

  it('줌 화상은 예약 불가로 표시되고 슬롯도 내주지 않는다 — 예약 단계에서 걸러야 한다', async () => {
    const r = await svc.getConsultModes(teacherId, monday, studentId);
    expect(r.consultModes.find((m) => m.mode === 'zoom')!.bookable).toBe(false);
    expect(await svc.getDaySlots(teacherId, monday, studentId, 'zoom')).toEqual(
      [],
    );
  });

  it('채팅·필기공유는 예약 가능 — 슬롯이 나온다', async () => {
    const r = await svc.getConsultModes(teacherId, monday, studentId);
    expect(r.consultModes.find((m) => m.mode === 'chat')!.bookable).toBe(true);
    expect(r.consultModes.find((m) => m.mode === 'hand')!.bookable).toBe(true);
    expect(
      (await svc.getDaySlots(teacherId, monday, studentId, 'chat')).length,
    ).toBeGreaterThan(0);
  });

  it('오프라인(센터 대면)은 온라인 모드와 무관하므로 걸러내지 않는다', async () => {
    const r = await svc.getConsultModes(teacherId, monday, studentId);
    expect(r.consultModes.find((m) => m.mode === 'offline')!.bookable).toBe(
      true,
    );
    expect(
      (await svc.getDaySlots(teacherId, monday, studentId, 'offline')).length,
    ).toBeGreaterThan(0);
  });

  it('mode 를 주지 않으면 기존과 동일하다 — 소비처 6곳의 계약이 바뀌지 않는다', async () => {
    const withoutMode = await svc.getDaySlots(teacherId, monday, studentId);
    expect(withoutMode.length).toBeGreaterThan(0);
    // zoom 이 막혀도 mode 미지정 조회는 영향받지 않아야 한다.
    expect(withoutMode).toEqual(
      await svc.getDaySlots(teacherId, monday, studentId, undefined),
    );
  });

  it('근무 창이 없는 날은 hasWindows=false 이고 어떤 모드도 예약 불가 — 화면이 "방식을 바꿔 보세요"로 헛걸음시키지 않게', async () => {
    // 템플릿에 월요일('1')만 심었으므로 화요일에는 창이 없다.
    const tue = new Date(`${monday}T00:00:00Z`);
    tue.setUTCDate(tue.getUTCDate() + 1);
    const r = await svc.getConsultModes(
      teacherId,
      tue.toISOString().slice(0, 10),
      studentId,
    );
    expect(r.hasWindows).toBe(false);
    // offline 은 환경과 무관하지만, 근무가 없으면 그것도 잡을 수 없다.
    expect(r.consultModes.every((m) => !m.bookable)).toBe(true);
  });

  it('근무가 있는 날은 hasWindows=true — 빈 슬롯의 원인이 모드임을 화면이 구분할 수 있다', async () => {
    expect(
      (await svc.getConsultModes(teacherId, monday, studentId)).hasWindows,
    ).toBe(true);
  });

  it('모르는 모드는 막지 않는다 — 멀쩡한 예약을 사라지게 하면 안 된다', async () => {
    expect(
      (await svc.getDaySlots(teacherId, monday, studentId, 'unknown_mode'))
        .length,
    ).toBeGreaterThan(0);
  });

  it('학생 체류시간이 없으면 제한 없음(기존 규약) — 선생님 쪽 모드를 그대로 쓴다', async () => {
    await prisma.student_profile.update({
      where: { account_id: studentId },
      data: { stay_time: Prisma.DbNull },
    }); // undefined 는 '변경 안 함'이라 실제로 비워지지 않는다
    const r = await svc.getConsultModes(teacherId, monday, studentId);
    expect(r.availableModes).toContain('video'); // 집(선생님) 기준
    expect(
      (await svc.getDaySlots(teacherId, monday, studentId, 'zoom')).length,
    ).toBeGreaterThan(0);
    // 되돌리기
    await prisma.student_profile.update({
      where: { account_id: studentId },
      data: {
        stay_time: { '1': [{ start: '19:00', end: '21:00', env: 'study' }] },
      },
    });
  });
});
