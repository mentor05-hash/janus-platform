import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';

/** 카테고리(본사관리자 관리) — 자료실/선생님 분류. */
@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** 본사관리자 = admin + 센터 미소속. */
  private assertHq(user: AuthUser) {
    if (!(user.role === AccountRole.ADMIN && !user.centerId)) {
      throw new ForbiddenException('본사관리자만 카테고리를 관리할 수 있습니다.');
    }
  }

  async list(kind?: string) {
    const rows = await this.prisma.category.findMany({
      where: kind ? { kind } : {},
      orderBy: [{ kind: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
    });
    return { data: rows };
  }

  async create(user: AuthUser, kind: string, name: string) {
    this.assertHq(user);
    const max = await this.prisma.category.aggregate({
      where: { kind },
      _max: { sort_order: true },
    });
    return this.prisma.category.create({
      data: { kind, name: name.trim(), sort_order: (max._max.sort_order ?? 0) + 1 },
    });
  }

  async remove(user: AuthUser, id: string) {
    this.assertHq(user);
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }
}
