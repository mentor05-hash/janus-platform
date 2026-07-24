import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env.validation';
import { CacheModule } from './common/cache/cache.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermLevelGuard } from './common/guards/perm-level.guard';
import { RateLimitGuard } from './common/ratelimit/rate-limit.guard';
import { HealthModule } from './health/health.module';

// ── 바운디드 컨텍스트 모듈 (CLAUDE.md §3) ──
import { IamModule } from './modules/iam/iam.module';
import { PeopleModule } from './modules/people/people.module';
import { MembershipModule } from './modules/membership/membership.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { MatchingModule } from './modules/matching/matching.module';
import { BookingModule } from './modules/booking/booking.module';
import { ConsultationModule } from './modules/consultation/consultation.module';
import { ConsultingModule } from './modules/consulting/consulting.module';
import { ClassroomModule } from './modules/classroom/classroom.module';
import { BillingModule } from './modules/billing/billing.module';
import { PricingPolicyModule } from './modules/pricing-policy/pricing-policy.module';
import { EvaluationModule } from './modules/evaluation/evaluation.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { OpsModule } from './modules/ops/ops.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationModule } from './modules/notification/notification.module';
import { QnaModule } from './modules/qna/qna.module';
import { ReportModule } from './modules/report/report.module';
import { StorageModule } from './modules/storage/storage.module';
import { MaterialModule } from './modules/material/material.module';
import { CategoryModule } from './modules/category/category.module';
import { CommunityModule } from './modules/community/community.module';
import { LegalModule } from './modules/legal/legal.module';
import { AuditModule } from './modules/audit/audit.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { ScoresModule } from './modules/scores/scores.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RoomsBridgeModule } from './modules/rooms-bridge/rooms-bridge.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { AssignmentModule } from './modules/assignment/assignment.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { PlacementHubModule } from './modules/placement-hub/placement-hub.module';
import { FunnelModule } from './modules/funnel/funnel.module';
import { SsoModule } from './modules/sso/sso.module';
import { EntitlementModule } from './modules/entitlement/entitlement.module';
import { GuardianReportModule } from './modules/guardian-report/guardian-report.module';
import { GuardianConsentModule } from './modules/guardian-consent/guardian-consent.module';
import { DiagnosticModule } from './modules/diagnostic/diagnostic.module';
import { CurriculumModule } from './modules/curriculum/curriculum.module';
import { LectureModule } from './modules/lecture/lecture.module';
import { AdminStatsModule } from './modules/admin-stats/admin-stats.module';
import { AcademicModule } from './modules/academic/academic.module';
import { SearchModule } from './modules/search/search.module';
import { AcademyFinderModule } from './modules/academy-finder/academy-finder.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    ScheduleModule.forRoot(), // §5-3 주간 크레딧 부여/소멸 스케줄러 기반
    CacheModule, // §10 캐시 외부화(memory|redis)
    PrismaModule,
    HealthModule,
    // 도메인 컨텍스트
    IamModule,
    PeopleModule,
    MembershipModule,
    AvailabilityModule,
    MatchingModule,
    BookingModule,
    ConsultationModule,
    ConsultingModule,
    ClassroomModule,
    BillingModule,
    PricingPolicyModule,
    EvaluationModule,
    PayrollModule,
    OpsModule,
    DashboardModule,
    NotificationModule,
    QnaModule,
    ReportModule,
    StorageModule,
    MaterialModule,
    CategoryModule,
    CommunityModule,
    LegalModule,
    AuditModule,
    MetricsModule,
    ScoresModule,
    RealtimeModule,
    RoomsBridgeModule,
    InboxModule,
    AssignmentModule,
    GatewayModule, // 관문 홈 LLM 훅(W2 D5) — 공개 해석 엔드포인트
    PlacementHubModule, // 배치표 허브 — JANUS_DATA_DIR 런타임 서빙(데이터 무반입)
    FunnelModule, // 간이 전환 계측(W3·C3) — baechi→consult-reserve 전환율
    SsoModule, // 크로스서비스 SSO(O42·W3) — HS256+epoch·레지스트리·verify 위임
    EntitlementModule, // 상품 권한(유료 배치표·계산기) — role 티어와 별개 서비스 해제(일회성 기간제)
    GuardianReportModule, // 학부모 주간 통합 리포트(W8) — 자녀 성적·출석·상담·Q&A 요약
    GuardianConsentModule, // 본부 결정 ① 학부모 동의·본인확인 — 미성년 데이터 전달 게이트
    DiagnosticModule, // 수준진단(진단 관문) — 문항 풀이→채점→약점→처방(문제은행 데모+후속 kice)
    CurriculumModule, // 주간 학습 플랜 — 진단 약점+성적 → 우선순위 처방 카드
    LectureModule, // 강좌 v1 — 카탈로그·수강신청(데모 강좌+후속 교사 등록)
    SearchModule, // 전역 통합검색 — 강좌·자료·커뮤니티·선생님
    AcademyFinderModule, // 학원찾기 v2 — 통학·성적대 기반 학원 탐색(세션1: 스키마·공공적재·provenance)
    AdminStatsModule, // 관리자 통계 대시보드 — 진단·강좌·커뮤니티 지표
    AcademicModule, // 학사일정 — 수능·모의고사·신청기간 캘린더 + D-7/D-1/당일 리마인더(9e2elr salvage ⑤-1)
  ],
  providers: [
    // 전역 가드: rate limit(§10) → 인증 → 인가 순. @Public() 은 인증 통과, @Roles() 로 역할 제한.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermLevelGuard },
  ],
})
export class AppModule {}
