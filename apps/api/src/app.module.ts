import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthModule } from './health/health.module';

// ── 바운디드 컨텍스트 모듈 (CLAUDE.md §3) ──
import { IamModule } from './modules/iam/iam.module';
import { PeopleModule } from './modules/people/people.module';
import { MembershipModule } from './modules/membership/membership.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { MatchingModule } from './modules/matching/matching.module';
import { BookingModule } from './modules/booking/booking.module';
import { ConsultationModule } from './modules/consultation/consultation.module';
import { BillingModule } from './modules/billing/billing.module';
import { PricingPolicyModule } from './modules/pricing-policy/pricing-policy.module';
import { EvaluationModule } from './modules/evaluation/evaluation.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { OpsModule } from './modules/ops/ops.module';
import { NotificationModule } from './modules/notification/notification.module';
import { QnaModule } from './modules/qna/qna.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    ScheduleModule.forRoot(), // §5-3 주간 크레딧 부여/소멸 스케줄러 기반
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
    BillingModule,
    PricingPolicyModule,
    EvaluationModule,
    PayrollModule,
    OpsModule,
    NotificationModule,
    QnaModule,
  ],
  providers: [
    // 전역 인증·인가 (CLAUDE.md §7). @Public() 은 통과, @Roles() 로 역할 제한.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
