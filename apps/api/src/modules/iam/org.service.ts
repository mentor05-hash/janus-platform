import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERM_TIER, permAtLeast } from '../../config/perm';
import { CreateCenterDto, CreateStaffDto } from './dto/org.dto';

/**
 * 조직·관리자 계정 관리 (§iam). 마스터/본사가 센터·관리자를 생성.
 * 위계: L2(본사) 생성은 L1(마스터)만, L3(센터) 생성은 L2 이상.
 */
@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  listCenters() {
    return this.prisma.center.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, region: true } });
  }

  createCenter(dto: CreateCenterDto) {
    return this.prisma.center.create({ data: { name: dto.name, region: dto.region ?? null }, select: { id: true, name: true, region: true } });
  }

  async createStaff(actor: AuthUser, dto: CreateStaffDto) {
    // L2(본사관리자) 생성은 마스터(L1)만.
    if (dto.permLevel === 'L2' && !permAtLeast(actor.permLevel, 'L1')) {
      throw new ForbiddenException('본사관리자(L2) 생성은 마스터(L1)만 가능합니다.');
    }
    if (dto.permLevel === 'L3') {
      if (!dto.centerId) throw new BadRequestException('센터관리자(L3)는 centerId 가 필요합니다.');
      const center = await this.prisma.center.findUnique({ where: { id: dto.centerId } });
      if (!center) throw new NotFoundException('센터를 찾을 수 없습니다.');
    }
    const exists = await this.prisma.account.findUnique({ where: { login_id: dto.loginId } });
    if (exists) throw new ConflictException('이미 사용 중인 아이디입니다.');

    const centerId = dto.permLevel === 'L3' ? dto.centerId! : null;
    const pwHash = await bcrypt.hash(dto.password, 10);
    const account = await this.prisma.account.create({
      data: { role: 'admin', center_id: centerId, login_id: dto.loginId, pw_hash: pwHash, name: dto.name, status: 'approved' },
      select: { id: true },
    });
    await this.prisma.staff_profile.create({
      data: { account_id: account.id, staff_role: PERM_TIER[dto.permLevel], perm_level: dto.permLevel, center_id: centerId },
    });
    return { id: account.id, loginId: dto.loginId, permLevel: dto.permLevel, tier: PERM_TIER[dto.permLevel], centerId };
  }
}
