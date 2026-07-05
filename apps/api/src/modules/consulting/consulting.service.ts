import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { FilesService } from '../storage/files.service';
import type { UploadedFileLike } from '../storage/storage.types';
import { CreateApplicationDto, UploadDocumentDto } from './dto/consulting.dto';
import {
  canTransition,
  defaultAssignmentMode,
  packagePriceWon,
  type ConsultingPackage,
  type ConsultingStatus,
} from './domain/status';
import { validateDocument } from './domain/documents';

// Phase 1: 도메인 & 신청/업로드. 결제(Payment)·LLM(Analysis)은 Phase 2/3에서 활성.
@Injectable()
export class ConsultingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  private isStaff(user: AuthUser): boolean {
    return user.role === 'admin' || user.role === 'hr';
  }

  private assertOwnerOrStaff(app: { applicant_account_id: string | null }, user: AuthUser): void {
    if (this.isStaff(user)) return;
    if (app.applicant_account_id && app.applicant_account_id === user.id) return;
    throw new ForbiddenException('이 신청에 접근할 권한이 없습니다.');
  }

  // 신청 생성 — 개인정보 동의 필수. 상품에서 배정 방식 결정.
  async create(dto: CreateApplicationDto, user: AuthUser) {
    if (!dto.agree) {
      throw new BadRequestException('개인정보 수집·이용 동의가 필요합니다.');
    }
    const pkg = dto.package as ConsultingPackage;
    const now = new Date();
    const row = await this.prisma.consulting_application.create({
      data: {
        applicant_account_id: user?.id ?? null,
        applicant_name: dto.applicantName,
        applicant_phone: dto.applicantPhone,
        student_grade: dto.studentGrade,
        interest_type: dto.interestType,
        package: pkg,
        assignment_mode: defaultAssignmentMode(pkg),
        status: 'submitted',
        message: dto.message ?? null,
        consent_at: now,
        submitted_at: now,
      },
    });
    return this.toApplicationDto(row);
  }

  // 조회 — 신청자 또는 스태프. (배정 컨설턴트 + 결제완료 게이트는 Phase 2)
  async getOne(id: string, user: AuthUser) {
    const app = await this.prisma.consulting_application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('신청을 찾을 수 없습니다.');
    this.assertOwnerOrStaff(app, user);
    const docs = await this.prisma.consulting_document.findMany({
      where: { application_id: id },
      orderBy: { uploaded_at: 'asc' },
    });
    return { ...this.toApplicationDto(app), documents: docs.map((d) => this.toDocumentDto(d)) };
  }

  // 자료 업로드 — PDF·Word 형식 검증 후 stored_file 저장, 메타 기록. 결제 전 허용.
  async uploadDocument(id: string, dto: UploadDocumentDto, file: UploadedFileLike, user: AuthUser) {
    const app = await this.prisma.consulting_application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('신청을 찾을 수 없습니다.');
    this.assertOwnerOrStaff(app, user);
    if (app.status === 'completed' || app.status === 'canceled') {
      throw new ConflictException(`현재 상태(${app.status})에서는 자료를 업로드할 수 없습니다.`);
    }
    if (!file) throw new BadRequestException('파일이 필요합니다.');

    const v = validateDocument(file);
    if (!v.ok) throw new BadRequestException(v.reason);

    const stored = await this.files.upload(user.id, file);
    // 형식 검증을 통과했으므로 clean 처리(스텁). 실제 악성/내용 스캔은 후속 단계에서 비동기로.
    const doc = await this.prisma.consulting_document.create({
      data: {
        application_id: id,
        file_id: stored.id,
        type: dto.type,
        original_name: file.originalname,
        mime: file.mimetype,
        size_bytes: file.size,
        scan_status: 'clean',
      },
    });
    return this.toDocumentDto(doc);
  }

  // 제출 확정 — submitted → awaiting_payment (optimistic).
  async submit(id: string, user: AuthUser) {
    const app = await this.prisma.consulting_application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('신청을 찾을 수 없습니다.');
    this.assertOwnerOrStaff(app, user);

    const from = app.status as ConsultingStatus;
    if (!canTransition(from, 'awaiting_payment')) {
      throw new ConflictException(`현재 상태(${from})에서 결제 대기로 전환할 수 없습니다.`);
    }
    const res = await this.prisma.consulting_application.updateMany({
      where: { id, status: from },
      data: { status: 'awaiting_payment', updated_at: new Date() },
    });
    if (res.count === 0) {
      throw new ConflictException('상태가 이미 변경되었습니다. 다시 시도해 주세요.');
    }
    return this.getOne(id, user);
  }

  private toApplicationDto(a: {
    id: string;
    applicant_account_id: string | null;
    applicant_name: string;
    applicant_phone: string;
    student_grade: string;
    interest_type: string;
    package: string;
    assignment_mode: string;
    status: string;
    message: string | null;
    consultant_id: string | null;
    consent_at: Date | null;
    submitted_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: a.id,
      applicantAccountId: a.applicant_account_id,
      applicantName: a.applicant_name,
      applicantPhone: a.applicant_phone,
      studentGrade: a.student_grade,
      interestType: a.interest_type,
      package: a.package,
      priceWon: packagePriceWon(a.package as ConsultingPackage),
      assignmentMode: a.assignment_mode,
      status: a.status,
      message: a.message,
      consultantId: a.consultant_id,
      consentAt: a.consent_at,
      submittedAt: a.submitted_at,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    };
  }

  private toDocumentDto(d: {
    id: string;
    type: string;
    original_name: string;
    mime: string;
    size_bytes: number;
    scan_status: string;
    uploaded_at: Date;
  }) {
    return {
      id: d.id,
      type: d.type,
      originalName: d.original_name,
      mime: d.mime,
      sizeBytes: d.size_bytes,
      scanStatus: d.scan_status,
      uploadedAt: d.uploaded_at,
    };
  }
}
