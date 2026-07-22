import { describe, expect, it } from 'vitest';
import {
  inspectForSchoolRecord,
  inspectForSchoolRecordSync,
} from './guard';
import { REASON } from './reasons';
import type { VisionResult } from './types';

/**
 * 주의(무취급 원칙): 아래 데이터는 전부 **모의 서식 문자열**이다.
 * 실제 생기부 파일·실 PII는 테스트에도 절대 사용하지 않는다.
 */

const enc = new TextEncoder();

// ① 모의 생기부 텍스트 — 서식 고유 표제어 3개 조합(임계 2 이상).
const MOCK_SCHOOL_RECORD = [
  '창의적 체험활동상황',
  '  자율활동 / 동아리활동 / 진로활동',
  '세부능력 및 특기사항',
  '행동특성 및 종합의견',
  '(모의 서식 — 실데이터 아님)',
].join('\n');

// ② 모의 성적통지표 — 생기부 고유 표제어는 없음.
const MOCK_REPORT_CARD = [
  '2026학년도 1학기 성적통지표',
  '중간고사 / 기말고사 반영',
  '국어 90  수학 85  영어 88',
  '총점 263  평균 87.7  석차 3/28  등급 2',
  '(모의 통지표 — 실데이터 아님)',
].join('\n');

describe('inspectForSchoolRecord — 3단 판정', () => {
  it('① 모의 생기부 텍스트(서식 키워드 2개 이상)는 차단된다 → SR_KEYWORD', async () => {
    const verdict = await inspectForSchoolRecord({
      filename: 'upload.txt',
      mimeType: 'text/plain',
      bytes: enc.encode(MOCK_SCHOOL_RECORD),
    });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe(REASON.KEYWORD);
    expect(verdict.stage).toBe('keyword');
  });

  it('② 모의 성적통지표 텍스트는 통과한다', async () => {
    const verdict = await inspectForSchoolRecord({
      filename: '성적표.txt',
      mimeType: 'text/plain',
      bytes: enc.encode(MOCK_REPORT_CARD),
    });
    expect(verdict.blocked).toBe(false);
    expect(verdict.reason).toBeNull();
  });

  it('③ 일반 문제 사진 메타(이미지)는 통과한다', async () => {
    // 비전 훅 미주입 + 정책 llmCheck 기본 off → 이미지는 키워드 스캔도 건너뛰고 통과.
    const verdict = await inspectForSchoolRecord({
      filename: 'math_problem_01.jpg',
      mimeType: 'image/jpeg',
      bytes: enc.encode('\xFF\xD8\xFF\xE0mock-jpeg-bytes'),
    });
    expect(verdict.blocked).toBe(false);
    expect(verdict.reason).toBeNull();
  });

  it('④ 서식 키워드가 1개(임계 미달)면 통과한다', async () => {
    const verdict = await inspectForSchoolRecord({
      filename: 'note.txt',
      mimeType: 'text/plain',
      bytes: enc.encode('출결상황 요약 메모 (키워드 1개, 모의)'),
    });
    expect(verdict.blocked).toBe(false);
    expect(verdict.reason).toBeNull();
  });
});

describe('1단계 — 파일명 패턴', () => {
  it('파일명이 생기부 패턴이면 내용과 무관하게 차단 → SR_FILENAME', async () => {
    const verdict = await inspectForSchoolRecord({
      filename: '홍길동_학교생활기록부_2026.pdf',
      mimeType: 'application/pdf',
    });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe(REASON.FILENAME);
    expect(verdict.stage).toBe('filename');
  });

  it('공백 변형 파일명("생활 기록부")도 정규화로 매칭된다', async () => {
    const verdict = await inspectForSchoolRecordSync({
      filename: '생활 기록부 사본.hwp',
    });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe(REASON.FILENAME);
  });

  it("로마자 패턴 school.?record 변형(school_record/School Record)도 차단", () => {
    for (const filename of [
      'My_School_Record.pdf',
      'School Record 2026.jpg',
      'schoolrecord.png',
    ]) {
      const verdict = inspectForSchoolRecordSync({ filename });
      expect(verdict.blocked, filename).toBe(true);
      expect(verdict.reason).toBe(REASON.FILENAME);
    }
  });
});

describe('3단계 — 비전 분류 훅', () => {
  const imageInput = {
    filename: 'scan_001.png',
    mimeType: 'image/png',
    bytes: enc.encode('mock-png-bytes'),
  };

  it("분류기 'yes'(생기부 확신) → SR_VISION 차단", async () => {
    const classifyImage = async (): Promise<VisionResult> => ({ label: 'yes' });
    const verdict = await inspectForSchoolRecord(
      imageInput,
      { llmCheck: true },
      { classifyImage },
    );
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe(REASON.VISION);
    expect(verdict.stage).toBe('vision');
  });

  it("분류기 'unsure' → 무취급 기본값에 따라 차단(SR_UNSURE) + 이의 경로", async () => {
    const classifyImage = async (): Promise<VisionResult> => ({
      label: 'unsure',
    });
    const verdict = await inspectForSchoolRecord(
      imageInput,
      { llmCheck: true },
      { classifyImage },
    );
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe(REASON.UNSURE);
    expect(verdict.stage).toBe('vision');
  });

  it("분류기 'no'(문제 사진 등) → 통과", async () => {
    const classifyImage = async (): Promise<VisionResult> => ({ label: 'no' });
    const verdict = await inspectForSchoolRecord(
      { ...imageInput, filename: 'math_problem_02.png' },
      { llmCheck: true },
      { classifyImage },
    );
    expect(verdict.blocked).toBe(false);
    expect(verdict.reason).toBeNull();
  });

  it('llmCheck off면 분류기가 있어도 호출되지 않고 통과', async () => {
    let called = false;
    const classifyImage = async (): Promise<VisionResult> => {
      called = true;
      return { label: 'yes' };
    };
    const verdict = await inspectForSchoolRecord(
      imageInput,
      { llmCheck: false },
      { classifyImage },
    );
    expect(called).toBe(false);
    expect(verdict.blocked).toBe(false);
  });
});

describe('정책 스키마', () => {
  it('enabled=false면 무조건 통과', async () => {
    const verdict = await inspectForSchoolRecord(
      { filename: '학교생활기록부.pdf', bytes: enc.encode(MOCK_SCHOOL_RECORD) },
      { enabled: false },
    );
    expect(verdict.blocked).toBe(false);
    expect(verdict.reason).toBeNull();
  });

  it('keywordThreshold=3이면 키워드 2개 조합은 통과(임계 상향)', async () => {
    const twoKeywords = '출결상황\n수상경력\n(모의)';
    const verdict = await inspectForSchoolRecordSync(
      { mimeType: 'text/plain', bytes: enc.encode(twoKeywords) },
      { keywordThreshold: 3 },
    );
    expect(verdict.blocked).toBe(false);
  });
});

describe('무취급 — 반환값에 원문 미포함(구조 검증)', () => {
  it('판정 결과 키는 blocked/reason/stage 뿐이다', async () => {
    const verdict = await inspectForSchoolRecord({
      mimeType: 'text/plain',
      bytes: enc.encode(MOCK_SCHOOL_RECORD),
    });
    expect(Object.keys(verdict).sort()).toEqual(
      ['blocked', 'reason', 'stage'].sort(),
    );
    // 원문/스니펫이 실려나가지 않음을 직렬화로 재확인.
    const serialized = JSON.stringify(verdict);
    expect(serialized).not.toContain('창의적');
    expect(serialized).not.toContain('세부능력');
  });
});
