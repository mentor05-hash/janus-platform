import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env.validation';
import { CacheModule } from './common/cache/cache.module';
import { QuotaModule } from './common/quota/quota.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    ScheduleModule.forRoot(), // §5-3 주간 크레딧 부여/소멸 스케줄러 기반
    CacheModule, // §10 캐시 외부화(memory|redis)
    QuotaModule, // 유료 AI·SFU 일 사용량 조회(상한은 각 어댑터가 강제)
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
