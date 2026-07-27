import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ScoresService } from '../src/modules/scores/scores.service';
import { GuardianConsentService } from '../src/modules/guardian-consent/guardian-consent.service';

/**
 * 학부모 자녀 산출물 열람 게이트(O105) — 연령별 권한 분기.
 *   · 성인 학생  → **학생 본인의 공유 동의** 필요(기본 deny, 철회 즉시 반영)
 *   · 미성년 학생 → 보호자 **본인확인 + 전달동의** 필요
 * 승인되지 않은 연결은 두 경우 모두 차단.
 */
describe('학부모 열람 게이트(janus_report)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scores: ScoresService;
  let consent: GuardianConsentService;
  let student: any;
  let guardian: any;
  let prevIsMinor: boolean | null = null;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    scores = mod.get(ScoresService);
    consent = mod.get(GuardianConsentService);

    const s = await prisma.account.findFirstOrThrow({
      where: { login_id: 'student01' },
      select: { id: true, center_id: true },
    });
    const g = await prisma.account.findFirstOrThrow({
      where: { login_id: 'guardian01' },
      select: { id: true, center_id: true },
    });
    student = { id: s.id, role: 'student', centerId: s.center_id };
    guardian = { id: g.id, role: 'guardian', centerId: g.center_id };

    // 승인된 연결을 **이 스펙이 보장**한다 — guardian.e2e-spec 이 afterAll 에서 링크를 지우고 복원하지 않아
    // 전체 e2e 순서에 따라 이 스위트가 통째로 무너졌다(데모 시드에도 링크가 없다).
    await prisma.guardian_student_link.upsert({
      where: {
        guardian_id_student_id: { guardian_id: g.id, student_id: s.id },
      },
      create: {
        guardian_id: g.id,
        student_id: s.id,
        relation: '모',
        status: 'approved',
        link_method: 'test',
      },
      update: { status: 'approved' },
    });

    const uc = await prisma.user_consent.findUnique({
      where: { account_id: s.id },
      select: { is_minor: true },
    });
    prevIsMinor = uc?.is_minor ?? null;

    // 이력 1건 확보(열람 대상)
    await prisma.janus_report.deleteMany({ where: { student_id: s.id } });
    await scores.gapReport(student, {
      mode: 'susi',
      univ: '게이트검증대',
      dept: '검증과',
      cut: 2.0,
      myGrade: 2.5,
    });
    await prisma.student_share_consent.deleteMany({
      where: { student_id: s.id },
    });
    await prisma.guardian_data_consent.deleteMany({
      where: { student_id: s.id, guardian_id: g.id },
    });
  });

  afterAll(async () => {
    await prisma.janus_report.deleteMany({ where: { student_id: student.id } });
    await prisma.student_share_consent.deleteMany({
      where: { student_id: student.id },
    });
    await prisma.guardian_data_consent.deleteMany({
      where: { student_id: student.id, guardian_id: guardian.id },
    });
    if (prevIsMinor !== null) {
      await prisma.user_consent.update({
        where: { account_id: student.id },
        data: { is_minor: prevIsMinor },
      });
    }
    await app.close();
  });

  const setMinor = async (v: boolean) => {
    await prisma.user_consent.upsert({
      where: { account_id: student.id },
      create: {
        account_id: student.id,
        terms_version: 'v1',
        privacy_version: 'v1',
        is_minor: v,
      },
      update: { is_minor: v },
    });
  };

  describe('성인 학생 — 본인 동의 필요', () => {
    beforeAll(() => setMinor(false));

    it('동의 없으면 열람 불가(기본 deny)', async () => {
      await expect(
        scores.listChildReports(guardian, student.id),
      ).rejects.toThrow();
    });

    it('학생이 동의하면 열람 가능', async () => {
      await consent.grantShare(student, guardian.id);
      const list = await scores.listChildReports(guardian, student.id);
      expect(list.length).toBeGreaterThan(0);
      expect((list[0].payload as any).target.univ).toBe('게이트검증대');
    });

    it('학생이 철회하면 즉시 열람 불가', async () => {
      await consent.revokeShare(student, guardian.id);
      await expect(
        scores.listChildReports(guardian, student.id),
      ).rejects.toThrow();
    });

    it('학생 동의 상태 조회 — 보호자 목록·granted 플래그', async () => {
      const st = await consent.myShareConsents(student);
      expect(st.isMinor).toBe(false);
      const row = st.guardians.find((x) => x.guardianId === guardian.id);
      expect(row).toBeDefined();
      expect(row!.granted).toBe(false); // 철회 상태
      expect(row!.revokedAt).not.toBeNull();
    });

    it('보호자의 전달동의만으로는 성인 학생 데이터를 열람할 수 없다', async () => {
      await prisma.guardian_data_consent.create({
        data: {
          guardian_id: guardian.id,
          student_id: student.id,
          verify_status: 'verified',
          verified_at: new Date(),
          consent_delivery: true,
          consent_at: new Date(),
        },
      });
      await expect(
        scores.listChildReports(guardian, student.id),
      ).rejects.toThrow(); // 여전히 학생 동의가 없다
      await prisma.guardian_data_consent.deleteMany({
        where: { student_id: student.id, guardian_id: guardian.id },
      });
    });
  });

  describe('미성년 학생 — 보호자 본인확인 + 전달동의', () => {
    beforeAll(async () => {
      await setMinor(true);
      await prisma.student_share_consent.deleteMany({
        where: { student_id: student.id },
      });
      await prisma.guardian_data_consent.deleteMany({
        where: { student_id: student.id, guardian_id: guardian.id },
      });
    });

    it('본인확인 전에는 열람 불가', async () => {
      await expect(
        scores.listChildReports(guardian, student.id),
      ).rejects.toThrow();
    });

    it('본인확인만 하고 전달동의가 없으면 열람 불가', async () => {
      await prisma.guardian_data_consent.create({
        data: {
          guardian_id: guardian.id,
          student_id: student.id,
          verify_status: 'verified',
          verified_at: new Date(),
        },
      });
      await expect(
        scores.listChildReports(guardian, student.id),
      ).rejects.toThrow();
    });

    it('본인확인 + 전달동의면 열람 가능(학생 동의 없이도 — 보호자 권한)', async () => {
      await consent.grantConsent(guardian, { studentId: student.id } as any);
      const list = await scores.listChildReports(guardian, student.id);
      expect(list.length).toBeGreaterThan(0);
    });

    it('전달동의 철회 시 즉시 열람 불가', async () => {
      await consent.revokeConsent(guardian, student.id);
      await expect(
        scores.listChildReports(guardian, student.id),
      ).rejects.toThrow();
    });
  });

  it('승인되지 않은 연결은 차단(연결 없는 보호자)', async () => {
    await setMinor(false);
    const stranger = {
      id: '00000000-0000-4000-8000-0000000000fd',
      role: 'guardian',
      centerId: guardian.centerId,
    };
    await expect(
      scores.listChildReports(stranger as any, student.id),
    ).rejects.toThrow();
  });

  it('학생 본인 경로는 게이트와 무관하게 자기 이력을 본다', async () => {
    const mine = await scores.listMyReports(student);
    expect(mine.length).toBeGreaterThan(0);
  });
});
