import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PRODUCT_KEYS, PRODUCTS } from './domain/products';
import { EntitlementService } from './entitlement.service';

class GrantDto {
  @IsString() @MinLength(2) @MaxLength(80) account!: string; // login_id(예: student01) 또는 UUID
  @IsIn(PRODUCT_KEYS) productKey!: string;
  @IsOptional() @IsISO8601() expiresAt?: string; // 일회성 기간제 만료(수능시즌). 생략=무기한(예외).
  @IsOptional() @IsIn(['admin', 'payment', 'promo']) source?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

/**
 * 상품 권한(entitlement) 관리자 API — 결제/체크아웃 도입 전 수동 부여·취소 경로.
 * 결제 훅이 생기면 결제 성공 콜백이 EntitlementService.grant() 를 그대로 호출(source='payment').
 * account 는 login_id(student01) 또는 UUID 모두 허용 — 관리자가 UUID 를 몰라도 부여 가능.
 */
@Controller()
export class EntitlementController {
  constructor(private readonly entitlement: EntitlementService) {}

  /** GET /me/entitlements — 내 이용권(상품 단위 활성/만료 + 남은 일수). 로그인 사용자 본인. */
  @Get('me/entitlements')
  mine(@CurrentUser() user: AuthUser) {
    return this.entitlement.myEntitlements(user.id);
  }

  /** 상품 카탈로그(관리자 UI 셀렉트용). */
  @Roles('admin')
  @Get('admin/entitlements/products')
  products() {
    return Object.values(PRODUCTS);
  }

  /** 만료 임박 알림 실행(운영/스케줄) — 계정당 1회 멱등. 기본 7일 이내. */
  @Roles('admin')
  @Post('admin/entitlements/run-expiry-check')
  runExpiryCheck(@Query('days') days?: string) {
    const n = Math.min(60, Math.max(1, Number(days) || 7));
    return this.entitlement.runExpiryCheck(n);
  }

  /** 계정(login_id·UUID) 조회 — 계정 정보 + 권한 이력(활성·만료·취소). */
  @Roles('admin')
  @Get('admin/entitlements')
  summary(@Query('account') account: string) {
    return this.entitlement.accountSummary(account ?? '');
  }

  /** 상품 권한 부여(수동/결제 콜백). */
  @Roles('admin')
  @Post('admin/entitlements')
  grant(@CurrentUser() actor: AuthUser, @Body() dto: GrantDto) {
    return this.entitlement.grant(actor, dto.account, dto.productKey, {
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      source: dto.source,
      note: dto.note,
    });
  }

  /** 권한 행 취소(환불·오부여) — 소프트 삭제. */
  @Roles('admin')
  @Delete('admin/entitlements/:id')
  revoke(@CurrentUser() actor: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.entitlement.revoke(actor, id);
  }
}
