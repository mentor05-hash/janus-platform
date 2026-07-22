import { spawn } from 'child_process';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  inspectForSchoolRecord,
  resolvePolicy,
} from '@mentoring/guard-school-record';
import type {
  GuardVerdict,
  PartialSchoolRecordGuardPolicy,
  SchoolRecordGuardPolicy,
  VisionProbe,
  VisionResult,
} from '@mentoring/guard-school-record';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { LlmProvider } from '../llm/llm.types';
import { SchoolRecordBlockedException } from './school-record-blocked.exception';

/** 판정에 넘길 최소 파일 형태(스토리지 UploadedFileLike 와 호환). */
export interface GuardFileInput {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

/** 판정 옵션. forceVision: 정책 llmCheck 와 무관하게 비전 단계 강제(성적표 OCR 경로 — §5 3단). */
export interface GuardInspectOptions {
  forceVision?: boolean;
}

/**
 * 생기부 가드 서비스 (지시서 §5·§6) — 공용 판정 모듈(@mentoring/guard-school-record)의 NestJS 어댑터.
 *
 * 무취급 원칙(§1-2): 원본 바이트·추출 텍스트를 파일·DB·로그 어디에도 남기지 않는다.
 * PDF 텍스트 추출은 poppler(pdftotext)로 stdin→stdout(임시파일 없음), 판정 직후 폐기.
 * 판정 자체는 순수 모듈이 수행하고, 여기서는 입력 준비(텍스트 추출·비전 어댑터)만 담당한다.
 */
@Injectable()
export class SchoolRecordGuardService {
  private readonly logger = new Logger(SchoolRecordGuardService.name);
  private readonly policy: SchoolRecordGuardPolicy;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(LLM_PROVIDER) private readonly llm?: LlmProvider,
  ) {
    this.policy = this.resolvePolicyFromEnv();
  }

  /**
   * ENV(guard.schoolRecord.*) → 정책값. 미지정 키는 **생략**하고 모듈 기본값(무취급 안전값)에 병합.
   * (undefined 를 넘기면 스프레드가 기본값을 덮어써 버리므로, 설정된 키만 담는다.)
   */
  private resolvePolicyFromEnv(): SchoolRecordGuardPolicy {
    const enabled = this.config.get<string>('GUARD_SR_ENABLED');
    const threshold = this.config.get<string>('GUARD_SR_KEYWORD_THRESHOLD');
    const llmCheck = this.config.get<string>('GUARD_SR_LLM_CHECK');
    const patterns = this.config.get<string>('GUARD_SR_FILENAME_PATTERNS');
    const partial: PartialSchoolRecordGuardPolicy = {};
    if (enabled != null) partial.enabled = enabled !== 'false';
    if (threshold != null && threshold !== '') partial.keywordThreshold = Number(threshold);
    if (llmCheck != null) partial.llmCheck = llmCheck === 'true';
    if (patterns) {
      const list = patterns.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) partial.filenamePatterns = list;
    }
    return resolvePolicy(partial);
  }

  /** 가드 활성 여부(정책). 비활성이면 호출측은 판정을 건너뛴다. */
  get enabled(): boolean {
    return this.policy.enabled;
  }

  /**
   * 파일 1건 판정. PDF 는 텍스트를 추출해 키워드 단계에, 이미지는 바이트를 비전 단계에 사용한다.
   * @returns boolean(차단)+사유. 원본·추출 텍스트는 반환값에 담지 않는다.
   */
  async inspect(
    file: GuardFileInput,
    opts: GuardInspectOptions = {},
  ): Promise<GuardVerdict> {
    const mimeType = file.mimetype;
    const isPdf =
      mimeType === 'application/pdf' ||
      /\.pdf$/i.test(file.originalname ?? '');

    // PDF 는 텍스트 추출(메모리) 후 텍스트 단계로. 추출 실패(poppler 부재 등)는
    // 인프라 사유이므로 fail-open — 파일명 단계는 여전히 적용된다.
    const text = isPdf ? await this.extractPdfText(file.buffer) : undefined;

    // 비전 단계: 일반 업로드는 정책 llmCheck, 성적표 OCR 경로는 forceVision 으로 항상.
    const useVision = opts.forceVision || this.policy.llmCheck;
    const policy = useVision ? { ...this.policy, llmCheck: true } : this.policy;

    return inspectForSchoolRecord(
      {
        filename: file.originalname,
        mimeType,
        // PDF 는 바이트를 텍스트로 디코딩하지 않도록 text 만 넘긴다(순수 모듈이 바이너리 디코딩을 회피).
        bytes: isPdf ? undefined : file.buffer,
        text,
      },
      policy,
      useVision ? { classifyImage: this.classifyImage } : {},
    );
  }

  /**
   * 저장 전 게이트. 감지 시 §4-b 문구를 담은 예외를 던져 업로드를 거부한다.
   * 통과 시 아무 것도 하지 않는다(호출측이 그대로 저장 진행).
   */
  async assertUploadAllowed(
    file: GuardFileInput,
    opts: GuardInspectOptions = {},
  ): Promise<void> {
    if (!this.policy.enabled) return;
    const verdict = await this.inspect(file, opts);
    if (verdict.blocked && verdict.reason) {
      // 로그에는 사유 코드·파일명만 — 내용/추출 텍스트는 남기지 않는다(§1-2).
      this.logger.warn(
        `생기부 감지·차단: reason=${verdict.reason} stage=${verdict.stage} name=${file.originalname ?? '(무명)'}`,
      );
      throw new SchoolRecordBlockedException(verdict.reason);
    }
  }

  /**
   * 비전 분류 어댑터(§5 3단) — LLM_PROVIDER 뒤에서 이미지가 생기부 서식인지 yes/no/unsure 판정.
   * 응답은 라벨만 사용(원문 비보존). LLM 미구성/오류는 보수 원칙상 'unsure'(차단).
   */
  private classifyImage = async (probe: VisionProbe): Promise<VisionResult> => {
    if (!this.llm || !probe.bytes) return { label: 'unsure' };
    try {
      const r = await this.llm.classifySchoolRecord({
        imageBase64: Buffer.from(probe.bytes).toString('base64'),
        mimeType: probe.mimeType ?? 'image/png',
      });
      return { label: r.label };
    } catch (e) {
      this.logger.warn(
        `비전 분류 실패 → 보수적 차단(unsure): ${(e as Error).message}`,
      );
      return { label: 'unsure' };
    }
  };

  /**
   * PDF 바이트 → 텍스트(메모리). poppler `pdftotext -q - -`(stdin→stdout, 임시파일 없음).
   * 실패(바이너리 부재·타임아웃·비PDF)는 빈 문자열로 fail-open. 텍스트는 호출측에서 즉시 폐기.
   */
  private extractPdfText(buffer: Buffer): Promise<string> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (out: string) => {
        if (done) return;
        done = true;
        resolve(out);
      };
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn('pdftotext', ['-q', '-', '-'], {
          stdio: ['pipe', 'pipe', 'ignore'],
        });
      } catch {
        return finish('');
      }
      const chunks: Buffer[] = [];
      let size = 0;
      const MAX = 8 * 1024 * 1024; // 추출 텍스트 상한(과대 PDF 방어)
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* noop */
        }
        finish('');
      }, 10_000);

      child.on('error', () => {
        clearTimeout(timer);
        finish(''); // poppler 미설치 등 — fail-open
      });
      child.stdout?.on('data', (d: Buffer) => {
        size += d.length;
        if (size > MAX) {
          try {
            child.kill('SIGKILL');
          } catch {
            /* noop */
          }
          clearTimeout(timer);
          finish(Buffer.concat(chunks).toString('utf-8'));
          return;
        }
        chunks.push(d);
      });
      child.on('close', () => {
        clearTimeout(timer);
        finish(Buffer.concat(chunks).toString('utf-8'));
      });
      // stdin EPIPE 방어 후 PDF 주입
      child.stdin?.on('error', () => {
        /* 자식 조기 종료 시 무시 */
      });
      child.stdin?.end(buffer);
    });
  }
}
