import { SetMetadata } from '@nestjs/common';
import { PermLevel } from '../../config/perm';

export const MIN_PERM_KEY = 'min_perm';

/**
 * 최소 권한레벨 요구 (§iam). 예: @MinPerm('L2') = 본사관리자 이상(L1·L2 허용, L3 거부).
 * RolesGuard(@Roles) 와 병행 — 역할은 admin 으로 두고 계층만 제한.
 */
export const MinPerm = (level: PermLevel) => SetMetadata(MIN_PERM_KEY, level);
