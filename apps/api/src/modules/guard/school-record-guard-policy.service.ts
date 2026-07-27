import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { withCronLock } from '../../common/cache/cron-lock';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import {
  CONSULTING_UPLOAD_DISABLED_KEY,
  DEFAULT_ACTIVATION_AT,
  type ConsultingToggleState,
  type ConsultingToggleValue,
} from './school-record-admin.types';

/**
 * 컨설팅 신규 생기부 업로드 비활성 토글 + 7/29 자동 활성 스케줄러 (지시서 §2 컨설팅 행·§6 스텝3).
 *
 * 런타임 가변: 값은 system_setting(`guard.schoolRecord.consultingUploadDisabled`)에 두고
 * **요청 시마다** 조회한다(가드 ENV 정책이 생성자에서 1회 캐시되는 것과 달리, 재시작 없이 즉시 반영).
 * 관리자 수동 on/off 와 스케줄러가 같은 행을 뒤집는다.
 *
 * 자동 활성(스케줄): 법령(제25조의2) 시행 시각 2026-07-29 00:00 KST 도래 후 1회 활성.
 * 멱등·재시작 안전: 라이브 타이머가 아니라 **DB 상태를 폴링**하는 재발성 크론(공지 runDue 패턴).
 * 도래 시각이 이미 지났어도 다음 틱에서 발화하며, `autoActivatedAt` 마커로 재발화를 막는다
 * (자동 활성 이후 관리자가 수동으로 off 해도 스케줄러가 다시 켜지 않음 — 수동 결정 존중).
 */
@Injectable()
export class SchoolRecordGuardPolicyService {
  private readonly logger = new Logger(SchoolRecordGuardPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
    private readonly config: ConfigService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  /** 자동 활성 예약 시각. 테스트/운영 조정을 위해 ENV(SR_CONSULTING_ACTIVATION_AT)로 덮어쓸 수 있다. */
  private activationAt(): Date {
    const raw =
      this.config.get<string>('SR_CONSULTING_ACTIVATION_AT') ??
      DEFAULT_ACTIVATION_AT;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? new Date(DEFAULT_ACTIVATION_AT) : d;
  }

  /** 현재 토글 상태(저장값이 없으면 기본값=비활성). 요청 시 조회 진입점. */
  async getConsultingUploadDisabled(): Promise<ConsultingToggleState> {
    const row = await this.prisma.system_setting.findUnique({
      where: { key: CONSULTING_UPLOAD_DISABLED_KEY },
    });
    const v = (row?.value ?? null) as Partial<ConsultingToggleValue> | null;
    return {
      enabled: v?.enabled === true,
      source: v?.source ?? 'default',
      autoActivatedAt: v?.autoActivatedAt ?? null,
      updatedBy: v?.updatedBy ?? null,
      updatedAt: v?.updatedAt ?? null,
      isDefault: row === null,
      activationAt: this.activationAt().toISOString(),
    };
  }

  private async write(value: ConsultingToggleValue): Promise<void> {
    await this.prisma.system_setting.upsert({
      where: { key: CONSULTING_UPLOAD_DISABLED_KEY },
      create: {
        key: CONSULTING_UPLOAD_DISABLED_KEY,
        value: value as object,
        updated_by: value.updatedBy ?? null,
      },
      update: {
        value: value as object,
        updated_by: value.updatedBy ?? null,
        updated_at: new Date(),
      },
    });
  }

  /**
   * 관리자 수동 on/off — 본사 마스터(admin·centerId 없음)만(ops.putOpsSetting 규약과 동일).
   * autoActivatedAt 마커는 보존한다(자동 활성 이력 유지).
   */
  async setConsultingUploadDisabled(
    actor: AuthUser,
    enabled: boolean,
  ): Promise<ConsultingToggleState> {
    if (actor.role !== 'admin' || actor.centerId) {
      throw new ForbiddenException('본사 마스터관리자만 변경할 수 있습니다.');
    }
    const cur = await this.getConsultingUploadDisabled();
    await this.write({
      enabled,
      source: 'manual',
      autoActivatedAt: cur.autoActivatedAt,
      updatedBy: actor.id,
      updatedAt: new Date().toISOString(),
    });
    await this.audit?.record(actor, {
      action: 'guard.sr.consulting_upload_toggle',
      targetType: 'system_setting',
      targetId: CONSULTING_UPLOAD_DISABLED_KEY,
      summary: `컨설팅 신규 생기부 업로드 ${enabled ? '비활성(차단)' : '활성(허용)'} — 수동`,
      meta: { enabled, source: 'manual' },
    });
    return this.getConsultingUploadDisabled();
  }

  /**
   * 스케줄 발화 — now ≥ 활성 시각이고 아직 자동 활성 전이면 1회 활성(멱등).
   * `now` 는 테스트에서 시각을 주입하기 위한 시접(공지 runDue 패턴).
   */
  async runScheduledActivation(now = new Date()): Promise<{
    activated: boolean;
    reason: string;
    state: ConsultingToggleState;
  }> {
    const target = this.activationAt();
    const cur = await this.getConsultingUploadDisabled();
    if (now.getTime() < target.getTime()) {
      return { activated: false, reason: 'before-target', state: cur };
    }
    if (cur.autoActivatedAt) {
      return { activated: false, reason: 'already-auto-activated', state: cur };
    }
    await this.write({
      enabled: true,
      source: 'scheduler',
      autoActivatedAt: now.toISOString(),
      updatedBy: null,
      updatedAt: now.toISOString(),
    });
    this.logger.warn(
      `컨설팅 신규 생기부 업로드 자동 비활성화 발화(법령 시행): target=${target.toISOString()} now=${now.toISOString()}`,
    );
    const state = await this.getConsultingUploadDisabled();
    return { activated: true, reason: 'activated', state };
  }

  /** 재발성 틱(기본 5분) — DB 상태 폴링. 다중 인스턴스는 리더락으로 1개만 실행. */
  @Cron(process.env.SR_CONSULTING_ACTIVATION_CRON ?? '*/5 * * * *', {
    timeZone: 'Asia/Seoul',
  })
  async scheduledActivationTick(): Promise<void> {
    await withCronLock(
      this.cache,
      'sr-consulting-activation',
      300,
      async () => {
        const r = await this.runScheduledActivation();
        if (r.activated) {
          this.logger.warn(
            '컨설팅 업로드 토글 자동 활성 완료(7/29 법령 시행).',
          );
        }
      },
      this.logger,
    );
  }
}
