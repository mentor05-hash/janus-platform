import { Injectable, Logger } from '@nestjs/common';

export interface IdentityVerifyInput {
  name: string;
  birth?: string; // YYYYMMDD (검증 후 미저장)
  phone?: string; // 검증 후 미저장 — 마스킹 참조만 남긴다
  method: 'phone' | 'ipin' | 'cert' | 'manual';
}

export interface IdentityVerifyResult {
  ok: boolean;
  name: string;
  /** 마스킹된 참조(CI/DI 원본 대체). 저장 가능한 유일한 식별 흔적. */
  refMasked: string;
  provider: string;
  reason?: string;
}

/**
 * 본인확인(성인 실명확인) 어댑터 — CLAUDE.md §7 "외부 의존은 어댑터 뒤로".
 * 실제 PASS/NICE/KMC 연동은 계약·키 확보 후. 현재는 stub(dev/데모): 입력 형식만 검증하고
 * 마스킹 참조를 만든다. ⚠ 휴대폰·생년월일·CI/DI 원본은 절대 저장하지 않는다(마스킹 참조만).
 */
@Injectable()
export class IdentityVerifyProvider {
  private readonly logger = new Logger(IdentityVerifyProvider.name);

  private mode(): 'stub' | 'real' {
    return process.env.IDENTITY_VERIFY_PROVIDER === 'real' ? 'real' : 'stub';
  }

  /** 휴대폰/참조를 마스킹 — 뒤 3자리만 남기고 나머지 별표. */
  private mask(seed?: string): string {
    const digits = (seed ?? '').replace(/[^0-9]/g, '');
    if (!digits) return '****';
    const tail = digits.slice(-3);
    return `${'*'.repeat(Math.max(4, digits.length - 3))}${tail}`;
  }

  verify(input: IdentityVerifyInput): Promise<IdentityVerifyResult> {
    const name = (input.name ?? '').trim();
    if (this.mode() === 'real') {
      // 실 연동 지점 — provider SDK 호출 후 결과 매핑. 미연동 상태에서는 실패 반환(무단 통과 금지).
      this.logger.warn(
        'IDENTITY_VERIFY_PROVIDER=real 이지만 실 연동 미구현 — 검증 실패 처리.',
      );
      return Promise.resolve({
        ok: false,
        name,
        refMasked: '****',
        provider: 'real',
        reason: 'provider_not_wired',
      });
    }
    // stub: 이름 + (휴대폰 또는 인증서 사용자) 형식만 확인.
    if (name.length < 2) {
      return Promise.resolve({
        ok: false,
        name,
        refMasked: '****',
        provider: 'stub',
        reason: 'invalid_name',
      });
    }
    if (
      input.method === 'phone' &&
      !(input.phone ?? '').replace(/[^0-9]/g, '')
    ) {
      return Promise.resolve({
        ok: false,
        name,
        refMasked: '****',
        provider: 'stub',
        reason: 'phone_required',
      });
    }
    return Promise.resolve({
      ok: true,
      name,
      refMasked: `stub:${this.mask(input.phone ?? input.birth)}`,
      provider: 'stub',
    });
  }
}
