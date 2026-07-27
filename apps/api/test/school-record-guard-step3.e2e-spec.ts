import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/common/prisma/prisma.service';
import type { CacheProvider } from '../src/common/cache/cache.types';
import { SchoolRecordGuardPolicyService } from '../src/modules/guard/school-record-guard-policy.service';
import { SchoolRecordEventService } from '../src/modules/guard/school-record-event.service';
import { SchoolRecordAppealService } from '../src/modules/guard/school-record-appeal.service';
import { SchoolRecordConsultingDisabledException } from '../src/modules/guard/school-record-consulting-disabled.exception';
import { CONSULTING_UPLOAD_DISABLED_KEY } from '../src/modules/guard/school-record-admin.types';
import { ConsultingService } from '../src/modules/consulting/consulting.service';

/**
 * 생기부 가드 스텝3 실측 — 컨설팅 토글 on/off + 7/29 예약 발화(시간 조작) + 통계/이의.
 * 실 DB(연결만) 사용, 전체 AppModule 부팅 없이 서비스만 수동 결선(가볍고 결정적).
 * 실제 생기부 파일 미사용 — 모의(benign) 문서만(무취급 §1).
 */
const AFTER = new Date('2026-07-29T12:00:00+09:00'); // 시행(00:00 KST) 이후
const BEFORE = new Date('2026-07-01T00:00:00+09:00'); // 시행 이전
const KEY = CONSULTING_UPLOAD_DISABLED_KEY;

// 실 계정 id 는 FK(applicant_account_id·appeal.actor_id) 때문에 필요 — beforeAll 에서 조회해 채운다.
const STUDENT: any = { id: '', role: 'student', centerId: null, loginId: 's' };
const HQ: any = { id: '', role: 'admin', centerId: null, loginId: 'a' };
let STUB_FILE_ID = ''; // beforeAll 에서 실 stored_file 행 생성(consulting_document.file_id FK 충족).

const configStub = { get: () => undefined } as unknown as ConfigService;
const cacheStub = { acquireLock: async () => true } as unknown as CacheProvider;
const benignPdf = (name = 'benign.pdf') => {
  const buffer = Buffer.from(
    '%PDF-1.4 benign consulting doc (not a school record)\n',
    'utf8',
  );
  return {
    buffer,
    originalname: name,
    mimetype: 'application/pdf',
    size: buffer.length,
  };
};

describe('생기부 가드 스텝3 — 컨설팅 토글·예약·통계·이의(§6 스텝3)', () => {
  let prisma: PrismaService;
  let policy: SchoolRecordGuardPolicyService;
  let events: SchoolRecordEventService;
  let appeals: SchoolRecordAppealService;
  let consulting: ConsultingService;
  const appIds: string[] = [];

  const resetToggle = () =>
    prisma.system_setting.deleteMany({ where: { key: KEY } });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    events = new SchoolRecordEventService(prisma);
    appeals = new SchoolRecordAppealService(prisma);
    policy = new SchoolRecordGuardPolicyService(prisma, cacheStub, configStub);
    const filesStub: any = { upload: async () => ({ id: STUB_FILE_ID }) };
    consulting = new ConsultingService(
      prisma,
      filesStub,
      {} as any,
      {} as any,
      {} as any,
      policy,
      events,
    );
    // FK 충족을 위해 실 계정 id 사용(테스트 시드 계정).
    const stu = await prisma.account.findFirst({
      where: { role: 'student' },
      select: { id: true },
    });
    const adm = await prisma.account.findFirst({
      where: { role: 'admin' },
      select: { id: true },
    });
    if (!stu || !adm) throw new Error('시드 계정(student/admin)이 필요합니다.');
    STUDENT.id = stu.id;
    HQ.id = adm.id;
    // 통과 케이스에서 consulting_document.file_id FK 를 충족할 실 stored_file 1건.
    const sf = await prisma.stored_file.create({
      data: {
        owner_id: STUDENT.id,
        storage_key: `test/sr-step3-${randomUUID()}`,
        filename: 'stub.pdf',
        content_type: 'application/pdf',
        size: 1,
      },
      select: { id: true },
    });
    STUB_FILE_ID = sf.id;
    await resetToggle();
  });

  afterAll(async () => {
    for (const id of appIds) {
      await prisma.consulting_document.deleteMany({
        where: { application_id: id },
      });
      await prisma.consulting_application.deleteMany({ where: { id } });
    }
    await prisma.school_record_appeal.deleteMany({
      where: { actor_id: STUDENT.id },
    });
    await prisma.school_record_block_event.deleteMany({
      where: { actor_id: STUDENT.id },
    });
    if (STUB_FILE_ID)
      await prisma.stored_file.deleteMany({ where: { id: STUB_FILE_ID } });
    await resetToggle();
    await prisma.$disconnect();
  });

  async function newApplication(): Promise<string> {
    const a = await consulting.create(
      {
        applicantName: '홍길동',
        applicantPhone: '010-0000-0000',
        studentGrade: '고3',
        interestType: 'susi',
        package: 'single',
        agree: true,
      },
      STUDENT,
    );
    appIds.push(a.id);
    return a.id;
  }

  // ── 1) 토글 수동 on/off ────────────────────────────────────────────
  it('기본값은 비활성(off) — 저장 행 없음', async () => {
    await resetToggle();
    const s = await policy.getConsultingUploadDisabled();
    expect(s.enabled).toBe(false);
    expect(s.isDefault).toBe(true);
  });

  it('본사 마스터 수동 on → enabled=true(source=manual), off → false', async () => {
    const on = await policy.setConsultingUploadDisabled(HQ, true);
    expect(on.enabled).toBe(true);
    expect(on.source).toBe('manual');
    const off = await policy.setConsultingUploadDisabled(HQ, false);
    expect(off.enabled).toBe(false);
  });

  it('본사 마스터가 아니면(centerId 보유) 변경 거부', async () => {
    await expect(
      policy.setConsultingUploadDisabled({ ...HQ, centerId: 'ctr-1' }, true),
    ).rejects.toThrow();
  });

  // ── 2) 컨설팅 게이트: 토글이 신규 생기부(student_record) 업로드를 막는다 ──
  it('토글 ON → 컨설팅 신규 생기부(student_record) 업로드 거부(SR_CONSULTING_DISABLED)', async () => {
    await policy.setConsultingUploadDisabled(HQ, true);
    const id = await newApplication();
    await expect(
      consulting.uploadDocument(
        id,
        { type: 'student_record' },
        benignPdf('sr.pdf'),
        STUDENT,
      ),
    ).rejects.toBeInstanceOf(SchoolRecordConsultingDisabledException);
    expect(
      await prisma.consulting_document.count({ where: { application_id: id } }),
    ).toBe(0);
  });

  it('토글 ON 이어도 성적표(transcript)는 통과 — 생기부만 막는다', async () => {
    await policy.setConsultingUploadDisabled(HQ, true);
    const id = await newApplication();
    const doc = await consulting.uploadDocument(
      id,
      { type: 'transcript' },
      benignPdf('score.pdf'),
      STUDENT,
    );
    expect(doc.type).toBe('transcript');
  });

  it('토글 OFF → 신규 생기부(student_record) 업로드 허용(정책 게이트 통과)', async () => {
    await policy.setConsultingUploadDisabled(HQ, false);
    const id = await newApplication();
    const doc = await consulting.uploadDocument(
      id,
      { type: 'student_record' },
      benignPdf('sr2.pdf'),
      STUDENT,
    );
    expect(doc.type).toBe('student_record');
  });

  // ── 3) 차단 통계(사유 코드별 집계) ──────────────────────────────────
  it('차단 통계에 CONSULTING_UPLOAD_DISABLED 가 사유별로 집계된다', async () => {
    const before = await events.stats();
    const beforeCount =
      before.byReason.find((r) => r.reason === 'CONSULTING_UPLOAD_DISABLED')
        ?.count ?? 0;
    await policy.setConsultingUploadDisabled(HQ, true);
    const id = await newApplication();
    await consulting
      .uploadDocument(
        id,
        { type: 'student_record' },
        benignPdf('sr3.pdf'),
        STUDENT,
      )
      .catch(() => undefined);
    const after = await events.stats();
    const afterCount =
      after.byReason.find((r) => r.reason === 'CONSULTING_UPLOAD_DISABLED')
        ?.count ?? 0;
    expect(afterCount).toBeGreaterThan(beforeCount);
    expect(after.bySurface.some((s) => s.surface === 'consulting_intake')).toBe(
      true,
    );
  });

  // ── 4) 이의 큐 ─────────────────────────────────────────────────────
  it('이의 접수 → 큐에 노출(open) → 처리(resolved)', async () => {
    const created = await appeals.create(STUDENT, {
      reason: 'SR_UNSURE',
      surface: 'upload',
      note: '생기부 아님(문제 풀이 사진)',
    });
    expect(created.status).toBe('open');
    const list = await appeals.list({ status: 'open' });
    expect(list.data.some((a) => a.id === created.id)).toBe(true);
    expect(list.meta.openCount).toBeGreaterThanOrEqual(1);
    const resolved = await appeals.updateStatus(HQ, created.id, {
      status: 'resolved',
      resolution: '확인 완료 — 오탐',
    });
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).toBeTruthy();
  });

  // ── 5) 예약 발화(시간 조작) — 2026-07-29 00:00 KST 자동 활성 ──────────
  it('시행 이전 now → 미발화(before-target), 토글 off 유지', async () => {
    await resetToggle();
    const r = await policy.runScheduledActivation(BEFORE);
    expect(r.activated).toBe(false);
    expect(r.reason).toBe('before-target');
    expect(r.state.enabled).toBe(false);
  });

  it('시행 이후 now → 1회 자동 활성(enabled=true, source=scheduler, autoActivatedAt 기록)', async () => {
    await resetToggle();
    const r = await policy.runScheduledActivation(AFTER);
    expect(r.activated).toBe(true);
    expect(r.state.enabled).toBe(true);
    expect(r.state.source).toBe('scheduler');
    expect(r.state.autoActivatedAt).toBeTruthy();
  });

  it('재발화(멱등) → already-auto-activated, 중복 활성 없음', async () => {
    const again = await policy.runScheduledActivation(AFTER);
    expect(again.activated).toBe(false);
    expect(again.reason).toBe('already-auto-activated');
    expect(again.state.enabled).toBe(true);
  });

  it('자동 활성 후 관리자가 수동 off → 스케줄러는 다시 켜지 않는다(수동 결정 존중)', async () => {
    await policy.setConsultingUploadDisabled(HQ, false);
    expect((await policy.getConsultingUploadDisabled()).enabled).toBe(false);
    const r = await policy.runScheduledActivation(AFTER);
    expect(r.activated).toBe(false);
    expect(r.reason).toBe('already-auto-activated');
    expect(r.state.enabled).toBe(false);
  });
});
