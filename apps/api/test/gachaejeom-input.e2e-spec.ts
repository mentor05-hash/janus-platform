import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ScoresService } from '../src/modules/scores/scores.service';

/**
 * 가채점 입력(O226) — 원점수 → 추정 표준점수 → janus_score.est.
 *
 * 지키는 것 셋:
 *   ① 원점수를 넣으면 추정 표준점수로 저장되고 **원점수는 버려지지 않는다**(12/11 재환산용).
 *   ② `janus_score.est='gachaejeom'` 이 실려 배치표가 면책을 낼 수 있다.
 *   ③ 환산표가 없으면 **명시적으로 거절**한다 — 조용히 무보정 값으로 넘어가면
 *      추정치가 실측처럼 저장된다.
 * 그리고 기존 std·nb 경로는 건드리지 않는다(회귀 0).
 */
describe('가채점 자가 입력 (POST /scores/me · mode=raw)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scores: ScoresService;
  let student: { id: string; role: 'student'; centerId: string | null };
  let tablePath: string;
  let dir: string;

  const relSub = () => ({
    type: 'relative',
    max_raw: 100,
    corrected: true,
    raw_to_std: Array.from({ length: 101 }, (_, r) => [r, 60 + r * 0.9]),
    raw_to_pct: Array.from({ length: 101 }, (_, r) => [r, r]),
  });
  const absSub = () => ({
    type: 'absolute',
    max_raw: 100,
    raw_to_grade: Array.from({ length: 101 }, (_, r) => [
      r,
      r >= 90 ? 1 : r >= 80 ? 2 : 3,
    ]),
  });

  const PERIOD = '2027-수능(가채점 검증)';
  const RAW_ITEMS = [
    { subject: '국어', score: 90 },
    { subject: '수학', score: 80 },
    { subject: '탐구1', score: 70 },
    { subject: '탐구2', score: 60 },
    { subject: '영어', score: 92 },
  ];

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janus-gachaejeom-'));
    tablePath = path.join(dir, 'table.json');
    fs.writeFileSync(
      tablePath,
      JSON.stringify({
        schema: 1,
        mode: 'gachaejeom',
        base_year: 2026,
        target_year: 2027,
        disclaimer:
          '가채점 기반 추정치입니다. 실채점 결과와 차이가 있을 수 있습니다.',
        subjects: {
          kor: relSub(),
          mat: relSub(),
          tam1: relSub(),
          tam2: relSub(),
          eng: absSub(),
        },
      }),
      'utf8',
    );
    // ConfigService 가 스냅샷을 잡으므로 모듈 생성 **전에** 심는다.
    process.env.JANUS_GACHAEJEOM_TABLE = tablePath;

    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    scores = mod.get(ScoresService);

    const a = await prisma.account.findFirstOrThrow({
      where: { login_id: 'student01' },
      select: { id: true, center_id: true },
    });
    student = { id: a.id, role: 'student', centerId: a.center_id };
  });

  afterAll(async () => {
    await prisma.score_report
      .deleteMany({
        where: { student_id: student.id, period: { contains: '가채점 검증' } },
      })
      .catch(() => undefined);
    delete process.env.JANUS_GACHAEJEOM_TABLE;
    fs.rmSync(dir, { recursive: true, force: true });
    await app.close();
  });

  it('원점수를 넣으면 추정 표준점수로 저장되고 원점수가 남는다', async () => {
    const res = await scores.saveMyScore(student as never, {
      period: PERIOD,
      mode: 'raw',
      gye: '이과',
      items: RAW_ITEMS,
    });
    expect(res.ok).toBe(true);
    expect(res.estimated?.complete).toBe(true);
    expect(res.estimated?.disclaimer).toContain('추정치');

    const rep = await prisma.score_report.findFirstOrThrow({
      where: { student_id: student.id, period: PERIOD },
      include: { items: true },
    });
    const pl = rep.placement as Record<string, unknown>;
    expect(pl.est).toBe('gachaejeom');
    // 원점수 보존 — 12/11 실채점 표가 오면 같은 원점수로 다시 환산해야 한다.
    expect(pl.raw).toEqual({ kor: 90, mat: 80, tam1: 70, tam2: 60, eng: 92 });

    const kor = rep.items.find((i) => i.subject === '국어');
    expect(Number(kor?.score)).toBe(141); // 60 + 90*0.9
    const eng = rep.items.find((i) => i.subject === '영어');
    expect(eng?.grade).toBe('1');
  });

  it('janus_score 에 est 가 실려 배치표가 면책을 낼 수 있다', async () => {
    const js = await scores.janusScore(student as never);
    expect(js.est).toBe('gachaejeom');
    expect(js.mode).toBe('std');
    expect(js.kor).toBe(141);
  });

  it('격차 리포트가 가채점임을 함께 알린다 — 추정치를 실측처럼 두지 않는다', async () => {
    const rep = await scores.gapReport(
      student as never,
      {
        mode: 'susi',
        univ: '가채점검증대',
        dept: '검증과',
        cut: 2.0,
        myGrade: 2.5,
      } as never,
    );
    expect(rep.est).toBe('gachaejeom');
    expect(rep.estNotice).toContain('추정치');
  });

  it('환산표가 없으면 조용히 넘어가지 않고 거절한다', async () => {
    fs.rmSync(tablePath, { force: true }); // 미배치 상황을 실제로 만든다
    await expect(
      scores.saveMyScore(student as never, {
        period: PERIOD + '-2',
        mode: 'raw',
        gye: '이과',
        items: RAW_ITEMS,
      }),
    ).rejects.toMatchObject({
      response: { code: 'GACHAEJEOM_TABLE_UNAVAILABLE' },
    });
  });

  it('기존 std 경로는 그대로다 — est 가 붙지 않는다', async () => {
    await scores.saveMyScore(student as never, {
      period: PERIOD + '-std',
      mode: 'std',
      gye: '이과',
      items: [
        { subject: '국어', score: 131 },
        { subject: '수학', score: 135 },
        { subject: '탐구1', score: 65 },
        { subject: '탐구2', score: 64 },
      ],
    });
    const rep = await prisma.score_report.findFirstOrThrow({
      where: { student_id: student.id, period: PERIOD + '-std' },
    });
    const pl = rep.placement as Record<string, unknown>;
    expect(pl.est).toBeUndefined();
    expect(pl.raw).toBeUndefined();
  });
});
