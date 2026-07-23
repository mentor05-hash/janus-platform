import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { FilesService } from '../storage/files.service';
import type { UploadedFileLike } from '../storage/storage.types';
import { AssignConsultantDto, CreateApplicationDto, CreatePaymentDto, InboxQueryDto, UploadDocumentDto } from './dto/consulting.dto';
import {
  canTransition,
  defaultAssignmentMode,
  packagePriceWon,
  type ConsultingPackage,
  type ConsultingStatus,
} from './domain/status';
import { validateDocument } from './domain/documents';
import { canViewDocumentContent, resolvePaymentAmount } from './domain/payment';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment/payment.types';
import { buildAnalysisInput } from './domain/analysis';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm.types';
import { NotifyService } from '../notification/notify.service';
import { SchoolRecordGuardPolicyService } from '../guard/school-record-guard-policy.service';
import { SchoolRecordEventService } from '../guard/school-record-event.service';
import { SchoolRecordConsultingDisabledException } from '../guard/school-record-consulting-disabled.exception';
import { GUARD_SURFACE, POLICY_REASON } from '../guard/school-record-admin.types';

// Phase 1: 신청/업로드. Phase 2: 결제·게이팅·배정. Phase 3: LLM 분석. Phase 4: 인박스·알림.
@Injectable()
export class ConsultingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly notify: NotifyService,
    private readonly srPolicy: SchoolRecordGuardPolicyService,
    private readonly srEvents: SchoolRecordEventService,
  ) {}

  private assertStaffOrConsultant(app: { consultant_id: string | null }, user: AuthUser): void {
    if (this.isStaff(user)) return;
    if (app.consultant_id && app.consultant_id === user.id) return;
    throw new ForbiddenException('관리자 또는 배정된 컨설턴트만 접근할 수 있습니다.');
  }

  private isStaff(user: AuthUser): boolean {
    return user.role === 'admin' || user.role === 'hr';
  }

  private assertStaff(user: AuthUser): void {
    if (!this.isStaff(user)) throw new ForbiddenException('관리자 권한이 필요합니다.');
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
    const [docs, pay] = await Promise.all([
      this.prisma.consulting_document.findMany({ where: { application_id: id }, orderBy: { uploaded_at: 'asc' } }),
      this.prisma.consulting_payment.findUnique({ where: { application_id: id } }),
    ]);
    return {
      ...this.toApplicationDto(app),
      payment: pay ? this.toPaymentDto(pay) : null,
      documents: docs.map((d) => this.toDocumentDto(d)),
    };
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

    // 정책 게이트(지시서 §2 컨설팅 행·§4-d) — 토글 활성 시 신규 생기부(student_record) 업로드 거부.
    // 기존 저장분·다운로드·다른 종류(성적표·모의고사 등)는 건드리지 않는다. 내용 감지 가드는 별개 백스톱.
    if (dto.type === 'student_record') {
      const toggle = await this.srPolicy.getConsultingUploadDisabled();
      if (toggle.enabled) {
        await this.srEvents.record({
          reason: POLICY_REASON.CONSULTING_UPLOAD_DISABLED,
          stage: 'policy',
          surface: GUARD_SURFACE.CONSULTING_INTAKE,
          actorId: user.id,
          actorRole: user.role,
        });
        throw new SchoolRecordConsultingDisabledException();
      }
    }

    const v = validateDocument(file);
    if (!v.ok) throw new BadRequestException(v.reason);

    const stored = await this.files.upload(user.id, file, {
      surface: GUARD_SURFACE.CONSULTING_INTAKE,
      actorRole: user.role,
    });
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

  // ── Phase 2: 결제 ────────────────────────────────────────────────
  // 결제 생성 — 원화(크레딧 불가). 신청자/스태프. 상품 기본가 또는 full은 amountWon 필수.
  async createPayment(id: string, dto: CreatePaymentDto, user: AuthUser) {
    const app = await this.prisma.consulting_application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('신청을 찾을 수 없습니다.');
    this.assertOwnerOrStaff(app, user);
    if (app.status !== 'submitted' && app.status !== 'awaiting_payment') {
      throw new ConflictException(`현재 상태(${app.status})에서는 결제를 생성할 수 없습니다.`);
    }
    const existing = await this.prisma.consulting_payment.findUnique({ where: { application_id: id } });
    if (existing) throw new ConflictException('이미 결제가 생성되었습니다.');

    const amt = resolvePaymentAmount(app.package as ConsultingPackage, dto.amountWon ?? null);
    if (!amt.ok) throw new BadRequestException(amt.reason);

    const charge = await this.payments.createCharge({ applicationId: id, amountWon: amt.amount });
    const pay = await this.prisma.consulting_payment.create({
      data: {
        application_id: id,
        amount_won: amt.amount,
        method: 'manual',
        status: 'pending',
        pg_provider: 'manual',
        pg_ref: charge.providerRef,
      },
    });
    if (app.status === 'submitted') {
      await this.prisma.consulting_application.updateMany({
        where: { id, status: 'submitted' },
        data: { status: 'awaiting_payment', updated_at: new Date() },
      });
    }
    return this.toPaymentDto(pay, charge.checkoutUrl);
  }

  // 결제 확인 — 스태프(수동/모의) 또는 PG 웹훅. paid 처리 + application → paid. 멱등.
  async confirmPayment(id: string, user: AuthUser) {
    this.assertStaff(user);
    const app = await this.prisma.consulting_application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('신청을 찾을 수 없습니다.');
    const pay = await this.prisma.consulting_payment.findUnique({ where: { application_id: id } });
    if (!pay) throw new BadRequestException('결제 정보가 없습니다. 먼저 결제를 생성하세요.');
    if (pay.status === 'paid') return this.getOne(id, user);

    const providerStatus = await this.payments.confirm(pay.pg_ref ?? '');
    if (providerStatus !== 'paid') throw new ConflictException('결제 확인에 실패했습니다.');

    await this.prisma.$transaction(async (tx) => {
      await tx.consulting_payment.update({ where: { id: pay.id }, data: { status: 'paid', paid_at: new Date() } });
      if (canTransition(app.status as ConsultingStatus, 'paid')) {
        await tx.consulting_application.updateMany({
          where: { id, status: 'awaiting_payment' },
          data: { status: 'paid', updated_at: new Date() },
        });
      }
    });
    await this.notify.notify(app.applicant_account_id, 'consulting_paid', { applicationId: id });
    if (app.consultant_id) {
      await this.notify.notify(app.consultant_id, 'consulting_paid', { applicationId: id });
    }
    return this.getOne(id, user);
  }

  // ── Phase 2: 컨설턴트 배정 ───────────────────────────────────────
  // 스태프가 teacher 계정을 배정. 결제 완료(paid) 상태면 in_review로 전이. (상품별 배정 방식 지원)
  async assignConsultant(id: string, dto: AssignConsultantDto, user: AuthUser) {
    this.assertStaff(user);
    const app = await this.prisma.consulting_application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('신청을 찾을 수 없습니다.');
    if (app.status === 'completed' || app.status === 'canceled') {
      throw new ConflictException(`현재 상태(${app.status})에서는 배정할 수 없습니다.`);
    }
    const teacher = await this.prisma.account.findUnique({
      where: { id: dto.consultantId },
      select: { id: true, role: true },
    });
    if (!teacher || teacher.role !== 'teacher') {
      throw new BadRequestException('배정 대상은 teacher 계정이어야 합니다.');
    }
    await this.prisma.consulting_application.update({
      where: { id },
      data: { consultant_id: dto.consultantId, updated_at: new Date() },
    });
    // 결제 완료 상태였다면 검토 착수(in_review)로 전이.
    if (app.status === 'paid') {
      await this.prisma.consulting_application.updateMany({
        where: { id, status: 'paid' },
        data: { status: 'in_review', updated_at: new Date() },
      });
    }
    await this.notify.notify(dto.consultantId, 'consulting_assigned', { applicationId: id });
    return this.getOne(id, user);
  }

  // ── Phase 4: 인박스/목록 (역할별 스코프 + 페이지네이션) ──────────
  // 스태프=전체, teacher=배정건, 그 외=본인 신청. 상태 필터 지원.
  async listInbox(user: AuthUser, q: InboxQueryDto) {
    const page = Math.max(1, q.page ?? 1);
    const size = Math.min(100, Math.max(1, q.size ?? 20));
    const where: Record<string, unknown> = {};
    if (this.isStaff(user)) {
      // 전체
    } else if (user.role === 'teacher') {
      where.consultant_id = user.id;
    } else {
      where.applicant_account_id = user.id;
    }
    if (q.status) where.status = q.status;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.consulting_application.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.consulting_application.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        applicantName: r.applicant_name,
        studentGrade: r.student_grade,
        interestType: r.interest_type,
        package: r.package,
        status: r.status,
        consultantId: r.consultant_id,
        createdAt: r.created_at,
      })),
      meta: { page, size, total },
    };
  }

  // ── Phase 2: 게이팅 다운로드 ─────────────────────────────────────
  // 자료 원문 다운로드. 신청자/스태프는 항상, 배정 컨설턴트는 결제 완료 후에만.
  async getDocument(id: string, docId: string, user: AuthUser) {
    const app = await this.prisma.consulting_application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('신청을 찾을 수 없습니다.');
    const doc = await this.prisma.consulting_document.findFirst({ where: { id: docId, application_id: id } });
    if (!doc) throw new NotFoundException('자료를 찾을 수 없습니다.');
    const pay = await this.prisma.consulting_payment.findUnique({ where: { application_id: id } });

    const allowed = canViewDocumentContent({
      isOwner: !!app.applicant_account_id && app.applicant_account_id === user.id,
      isStaff: this.isStaff(user),
      isAssignedConsultant: !!app.consultant_id && app.consultant_id === user.id,
      paymentStatus: pay?.status,
    });
    if (!allowed) throw new ForbiddenException('결제 완료 후 열람할 수 있습니다.');
    if (!doc.file_id) throw new NotFoundException('파일이 없습니다.');

    const { data } = await this.files.readBytes(doc.file_id);
    return { data, filename: doc.original_name, contentType: doc.mime };
  }

  // ── Phase 3: LLM 분석 ────────────────────────────────────────────
  // 스태프/배정 컨설턴트가 트리거. 결제 완료(게이트) 필수. 식별정보 마스킹 후 LLM 호출.
  async runAnalysis(id: string, user: AuthUser) {
    const app = await this.prisma.consulting_application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('신청을 찾을 수 없습니다.');
    this.assertStaffOrConsultant(app, user);
    const pay = await this.prisma.consulting_payment.findUnique({ where: { application_id: id } });
    if (pay?.status !== 'paid') throw new ForbiddenException('결제 완료 후 분석할 수 있습니다.');

    const docs = await this.prisma.consulting_document.findMany({ where: { application_id: id } });
    await this.prisma.consulting_analysis.upsert({
      where: { application_id: id },
      create: { application_id: id, status: 'running' },
      update: { status: 'running' },
    });
    try {
      const result = await this.llm.analyzeConsulting(buildAnalysisInput(app, docs));
      const row = await this.prisma.consulting_analysis.update({
        where: { application_id: id },
        data: {
          status: 'done',
          model: result.model,
          summary: result.summary,
          diagnostic: result.diagnostic,
          document_check: result.document_check,
          generated_at: new Date(),
        },
      });
      if (app.consultant_id) {
        await this.notify.notify(app.consultant_id, 'consulting_analysis_ready', { applicationId: id });
      }
      return this.toAnalysisDto(row);
    } catch (e) {
      await this.prisma.consulting_analysis.update({ where: { application_id: id }, data: { status: 'failed' } });
      throw new BadRequestException(`분석에 실패했습니다: ${(e as Error).message}`);
    }
  }

  // 분석 결과 조회 — 스태프/배정 컨설턴트, 결제 완료 게이트.
  async getAnalysis(id: string, user: AuthUser) {
    const app = await this.prisma.consulting_application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('신청을 찾을 수 없습니다.');
    this.assertStaffOrConsultant(app, user);
    const pay = await this.prisma.consulting_payment.findUnique({ where: { application_id: id } });
    if (pay?.status !== 'paid') throw new ForbiddenException('결제 완료 후 열람할 수 있습니다.');
    const row = await this.prisma.consulting_analysis.findUnique({ where: { application_id: id } });
    return row ? this.toAnalysisDto(row) : null;
  }

  private toAnalysisDto(a: {
    status: string;
    model: string | null;
    summary: unknown;
    diagnostic: unknown;
    document_check: unknown;
    generated_at: Date | null;
  }) {
    return {
      status: a.status,
      model: a.model,
      summary: a.summary ?? null,
      diagnostic: a.diagnostic ?? null,
      documentCheck: a.document_check ?? null,
      generatedAt: a.generated_at,
      note: '컨설턴트 검수용 초안입니다. 확정·발송 전 반드시 검토하세요.',
    };
  }

  private toPaymentDto(
    p: {
      id: string;
      amount_won: number;
      method: string;
      status: string;
      paid_at: Date | null;
    },
    checkoutUrl?: string,
  ) {
    return {
      id: p.id,
      amountWon: p.amount_won,
      method: p.method,
      status: p.status,
      paidAt: p.paid_at,
      ...(checkoutUrl ? { checkoutUrl } : {}),
    };
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
