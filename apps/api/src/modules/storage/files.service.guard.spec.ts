import { ConfigService } from '@nestjs/config';
import { FilesService } from './files.service';
import { SchoolRecordGuardService } from '../guard/school-record-guard.service';
import { SchoolRecordBlockedException } from '../guard/school-record-blocked.exception';

/**
 * 업로드 초크포인트(FilesService.upload) 가드 접합 검증 (지시서 §6 스텝2, 완료기준 ①).
 * 생기부 감지 시 storage.put·stored_file.create 가 **호출되지 않음**(스토리지·DB 미기록)을 실측한다.
 * poppler 불필요 — text/plain 모의 서식으로 텍스트 단계를 직접 자극.
 */
const MOCK_SR_TEXT =
  '학교생활세부사항기록부\n인적·학적사항\n창의적 체험활동상황';
const MOCK_SCORE_TEXT = '2026 1학기 중간고사 성적통지표\n국어 90 수학 85';

function makeService() {
  const storage = { put: jest.fn(), get: jest.fn(), delete: jest.fn() };
  const create = jest.fn().mockResolvedValue({
    id: 'file-1',
    filename: 'q.txt',
    content_type: 'text/plain',
    size: 10,
  });
  const prisma = { stored_file: { create } } as any;
  const guard = new SchoolRecordGuardService({
    get: () => undefined,
  } as unknown as ConfigService);
  const service = new FilesService(prisma, storage as any, guard);
  return { service, storage, create };
}

function file(text: string, name = 'q.txt') {
  const buffer = Buffer.from(text, 'utf8');
  return {
    buffer,
    originalname: name,
    mimetype: 'text/plain',
    size: buffer.length,
  };
}

describe('FilesService.upload × 생기부 가드', () => {
  it('생기부 감지 → 예외 + storage·DB 미기록', async () => {
    const { service, storage, create } = makeService();
    await expect(
      service.upload('owner-1', file(MOCK_SR_TEXT)),
    ).rejects.toBeInstanceOf(SchoolRecordBlockedException);
    expect(storage.put).not.toHaveBeenCalled(); // 스토리지 미기록
    expect(create).not.toHaveBeenCalled(); // stored_file DB 미기록
  });

  it('성적표(모의) → 정상 저장(put·create 호출)', async () => {
    const { service, storage, create } = makeService();
    const res = await service.upload('owner-1', file(MOCK_SCORE_TEXT));
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(res.id).toBe('file-1');
  });
});
