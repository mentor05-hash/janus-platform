import { SetMetadata } from '@nestjs/common';
import { AccountRole } from '../../config/enums';

export const ROLES_KEY = 'roles';

/** RBAC: 허용 역할 지정 (CLAUDE.md §7). 예) @Roles('admin', 'hr') */
export const Roles = (...roles: AccountRole[]) => SetMetadata(ROLES_KEY, roles);
