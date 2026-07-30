import { ConfigService } from '@nestjs/config';
import { SchoolRecordGuardService } from './school-record-guard.service';
import { SchoolRecordBlockedException } from './school-record-blocked.exception';
import type { LlmProvider } from '../llm/llm.types';

/**
 * 생기부 가드 서비스 단위 테스트 (지시서 §5·§6 스텝2).
 * 모의 서식 문자열만 사용 — 실제 생기부 파일은 테스트에도 쓰지 않는다(무취급 §1).
 */

// 서식 고유 키워드 2개↑(임계 충족) — 모의 생기부 텍스트.
const MOCK_SR_TEXT =
  '학교생활세부사항기록부\n인적·학적사항\n창의적 체험활동상황\n행동특성 및 종합의견';
// 성적통지표 — 생기부 서식 키워드 없음(허용 대상).
const MOCK_SCORE_TEXT =
  '2026학년도 1학기 중간고사 성적통지표\n국어 90 수학 85 영어 88 과학 77 사회 95';

function configStub(env: Record<string, string> = {}): ConfigService {
  return { get: (k: string) => env[k] } as unknown as ConfigService;
}
function llmStub(label: 'yes' | 'no' | 'unsure'): LlmProvider {
  return {
    classifySchoolRecord: () => ({ label }),
  } as unknown as LlmProvider;
}
function textFile(text: string, name = 'q.txt') {
  return {
    buffer: Buffer.from(text, 'utf8'),
    originalname: name,
    mimetype: 'text/plain',
  };
}

describe('SchoolRecordGuardService', () => {
  describe('텍스트/파일명 판정 (poppler 불필요)', () => {
    const guard = new SchoolRecordGuardService(configStub());

    it('생기부 서식 키워드 2개↑ → 차단(SR_KEYWORD)', async () => {
      const v = await guard.inspect(textFile(MOCK_SR_TEXT));
      expect(v.blocked).toBe(true);
      expect(v.reason).toBe('SR_KEYWORD');
    });

    it('성적통지표 텍스트 → 통과', async () => {
      const v = await guard.inspect(textFile(MOCK_SCORE_TEXT));
      expect(v.blocked).toBe(false);
    });

    it('생기부 파일명 → 차단(SR_FILENAME)', async () => {
      const v = await guard.inspect(
        textFile('임의 내용', '2026_생활기록부.pdf'),
      );
      expect(v.blocked).toBe(true);
      expect(v.reason).toBe('SR_FILENAME');
    });

    it('키워드 1개(임계 미달) → 통과', async () => {
      const v = await guard.inspect(
        textFile('학교생활세부사항기록부 안내문 (서식 아님)'),
      );
      expect(v.blocked).toBe(false);
    });

    it('assertUploadAllowed: 생기부 감지 시 SchoolRecordBlockedException', async () => {
      await expect(
        guard.assertUploadAllowed(textFile(MOCK_SR_TEXT)),
      ).rejects.toBeInstanceOf(SchoolRecordBlockedException);
    });

    it('assertUploadAllowed: 성적표는 통과(예외 없음)', async () => {
      await expect(
        guard.assertUploadAllowed(textFile(MOCK_SCORE_TEXT)),
      ).resolves.toBeUndefined();
    });
  });

  describe('정책 비활성(guard.schoolRecord.enabled=false) → 무판정 통과', () => {
    it('enabled=false 면 생기부 텍스트도 통과', async () => {
      const guard = new SchoolRecordGuardService(
        configStub({ GUARD_SR_ENABLED: 'false' }),
      );
      const v = await guard.inspect(textFile(MOCK_SR_TEXT));
      expect(v.blocked).toBe(false);
    });
  });

  describe('비전 단계(§5 3단, forceVision — 성적표 OCR 경로)', () => {
    const imageFile = {
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      originalname: 'photo.png',
      mimetype: 'image/png',
    };

    it('분류기 yes → 차단(SR_VISION)', async () => {
      const guard = new SchoolRecordGuardService(configStub(), llmStub('yes'));
      const v = await guard.inspect(imageFile, { forceVision: true });
      expect(v.blocked).toBe(true);
      expect(v.reason).toBe('SR_VISION');
    });

    it('분류기 no → 통과', async () => {
      const guard = new SchoolRecordGuardService(configStub(), llmStub('no'));
      const v = await guard.inspect(imageFile, { forceVision: true });
      expect(v.blocked).toBe(false);
    });

    it('분류기 unsure → 보수적 차단(SR_UNSURE)', async () => {
      const guard = new SchoolRecordGuardService(
        configStub(),
        llmStub('unsure'),
      );
      const v = await guard.inspect(imageFile, { forceVision: true });
      expect(v.blocked).toBe(true);
      expect(v.reason).toBe('SR_UNSURE');
    });

    it('llmCheck 기본(off) + forceVision 없음 → 이미지 비전 미수행(통과)', async () => {
      const guard = new SchoolRecordGuardService(configStub(), llmStub('yes'));
      const v = await guard.inspect(imageFile); // forceVision 미지정
      expect(v.blocked).toBe(false);
    });
  });
});
