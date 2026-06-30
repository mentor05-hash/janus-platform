import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { FilesService } from '../storage/files.service';
import type { UploadedFileLike } from '../storage/storage.types';
import { CreateMaterialDto } from './dto/material.dto';

/**
 * 선생님 자료실 (§T 자료 업로드 + 게시). 공개범위 visibility 로 열람 제어:
 * public=전사 / center=자기 센터 / private=본인·관리자만.
 * 다운로드는 stored_file 소유권이 아니라 자료 공개범위로 게이트(FilesService.readBytes).
 */
@Injectable()
export class MaterialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  private isAdmin(u: AuthUser) {
    return u.role === AccountRole.ADMIN || u.role === AccountRole.HR;
  }
  private isHqAdmin(u: AuthUser) {
    return this.isAdmin(u) && u.centerId == null;
  }

  /** 열람자의 소속 센터 집합(보호자는 연결 자녀의 센터). */
  private async viewerCenters(u: AuthUser): Promise<Set<string>> {
    if (u.centerId) return new Set([u.centerId]);
    if (u.role === AccountRole.GUARDIAN) {
      const links = await this.prisma.guardian_student_link.findMany({
        where: { guardian_id: u.id, status: 'approved' },
        select: { student_profile: { select: { center_id: true } } },
      });
      const set = new Set<string>();
      for (const l of links) {
        const cid = l.student_profile?.center_id;
        if (cid) set.add(cid);
      }
      return set;
    }
    return new Set();
  }

  async create(teacher: AuthUser, dto: CreateMaterialDto, file?: UploadedFileLike) {
    const profile = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacher.id },
      select: { center_id: true },
    });
    let fileId: string | null = null;
    if (file?.buffer?.length) {
      const up = await this.files.upload(teacher.id, file);
      fileId = up.id;
    }
    const row = await this.prisma.material.create({
      data: {
        teacher_id: teacher.id,
        center_id: profile?.center_id ?? null,
        file_id: fileId,
        title: dto.title,
        description: dto.description ?? null,
        subject: dto.subject ?? null,
        visibility: dto.visibility ?? 'center',
      },
    });
    return { data: this.shape(row) };
  }

  async list(actor: AuthUser, q: { subject?: string; mine?: string }) {
    const centers = await this.viewerCenters(actor);
    const centerIds = [...centers];
    const where: Record<string, unknown> = {};
    if (q.subject) where.subject = q.subject;

    if (q.mine === 'true') {
      where.teacher_id = actor.id;
    } else if (!this.isHqAdmin(actor)) {
      // 비-본사: 공개 + 본인 + (자기 센터의 center, 관리자면 private 도)
      const or: Record<string, unknown>[] = [
        { visibility: 'public' },
        { teacher_id: actor.id },
      ];
      if (centerIds.length) {
        const vis = this.isAdmin(actor) ? ['center', 'private'] : ['center'];
        or.push({ center_id: { in: centerIds }, visibility: { in: vis } });
      }
      where.OR = or;
    }
    // 본사 관리자: where 제한 없음(전체)

    const rows = await this.prisma.material.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        teacher: { select: { account: { select: { name: true } } } },
        center: { select: { name: true } },
        file: { select: { filename: true, size: true, content_type: true } },
      },
    });
    return { data: rows.map((r) => this.shape(r)), meta: { count: rows.length } };
  }

  async download(actor: AuthUser, id: string) {
    const m = await this.prisma.material.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('자료를 찾을 수 없습니다.');
    if (!(await this.canView(actor, m))) {
      throw new ForbiddenException('이 자료에 접근할 권한이 없습니다.');
    }
    if (!m.file_id) throw new NotFoundException('첨부 파일이 없습니다.');
    return this.files.readBytes(m.file_id);
  }

  async remove(actor: AuthUser, id: string) {
    const m = await this.prisma.material.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('자료를 찾을 수 없습니다.');
    const ownerOrAdmin =
      m.teacher_id === actor.id ||
      this.isHqAdmin(actor) ||
      (this.isAdmin(actor) && m.center_id === actor.centerId);
    if (!ownerOrAdmin) throw new ForbiddenException('삭제 권한이 없습니다.');
    await this.prisma.material.delete({ where: { id } });
    return { data: { id } };
  }

  private async canView(
    actor: AuthUser,
    m: { teacher_id: string; center_id: string | null; visibility: string },
  ): Promise<boolean> {
    if (m.visibility === 'public') return true;
    if (m.teacher_id === actor.id) return true;
    if (this.isHqAdmin(actor)) return true;
    if (this.isAdmin(actor)) return m.center_id != null && m.center_id === actor.centerId;
    if (m.visibility === 'private') return false;
    // center 공개: 열람자 센터가 자료 센터와 일치
    const centers = await this.viewerCenters(actor);
    return m.center_id != null && centers.has(m.center_id);
  }

  private shape(m: Record<string, any>) {
    return {
      id: m.id,
      title: m.title,
      description: m.description ?? null,
      subject: m.subject ?? null,
      visibility: m.visibility,
      teacherId: m.teacher_id,
      teacherName: m.teacher?.account?.name ?? null,
      centerId: m.center_id,
      centerName: m.center?.name ?? null,
      fileId: m.file_id,
      filename: m.file?.filename ?? null,
      size: m.file?.size ?? null,
      createdAt: m.created_at,
      downloadUrl: m.file_id ? `/materials/${m.id}/download` : null,
    };
  }
}
