import { ConfigService } from '@nestjs/config';
import { QnaService } from './qna.service';
import { SchoolRecordGuardService } from '../guard/school-record-guard.service';

/**
 * 상담 승격 첨부 이관 필터 검증 (지시서 §2·§6 스텝2, 완료기준 ③).
 * 생기부로 감지된 첨부가 상담 예약 이관 목록(payload)에서 제외됨을 실측한다.
 */
function makeService(readBytes: jest.Mock) {
  const guard = new SchoolRecordGuardService({ get: () => undefined } as unknown as ConfigService);
  const files = { readBytes } as any;
  // 필터가 쓰는 의존성은 files·guard 뿐 — 나머지는 스텁.
  const svc = new QnaService(
    {} as any, // prisma
    {} as any, // pricing
    {} as any, // credit
    {} as any, // llm
    {} as any, // cache
    {} as any, // booking
    {} as any, // availability
    {} as any, // notify
    files, // files
    guard, // guard
    {} as any, // policy(AdminPolicyService) — 이 필터는 쓰지 않는다
    { get: () => undefined } as unknown as ConfigService, // config — 유사도 한도 ENV 조회용
  );
  return svc;
}

describe('QnaService.filterEscalationAttachments (상담 승격 첨부 필터)', () => {
  const CLEAN = { id: 'clean', name: '풀이.png', type: 'image' };
  const SR = { id: 'sr', name: '생기부.pdf', type: 'pdf' };

  const readBytes = jest.fn(async (id: string) => {
    if (id === 'sr') {
      // 생기부 파일명 → 가드 차단(SR_FILENAME).
      return { data: Buffer.from('임의'), filename: '생기부.pdf', contentType: 'application/octet-stream' };
    }
    // 성적/일반 첨부 → 통과.
    return { data: Buffer.from('국어 90 수학 85'), filename: '풀이.png', contentType: 'text/plain' };
  });

  it('차단 파일은 이관 목록에서 제외, 통과 파일만 유지', async () => {
    const svc = makeService(readBytes);
    const kept = await (svc as any).filterEscalationAttachments([CLEAN, SR]);
    expect(kept).toEqual([CLEAN]); // 생기부(sr) 제외
  });

  it('첨부 없음 → 빈 배열', async () => {
    const svc = makeService(jest.fn());
    expect(await (svc as any).filterEscalationAttachments(null)).toEqual([]);
    expect(await (svc as any).filterEscalationAttachments([])).toEqual([]);
  });

  it('읽기 실패한 첨부는 이관 유지(업로드 시 가드 통과분)', async () => {
    const failing = jest.fn(async () => {
      throw new Error('not found');
    });
    const svc = makeService(failing);
    const kept = await (svc as any).filterEscalationAttachments([CLEAN]);
    expect(kept).toEqual([CLEAN]);
  });
});
