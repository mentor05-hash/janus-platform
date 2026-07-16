import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PRODUCT_KEYS, PRODUCTS } from './domain/products';
import { EntitlementService } from './entitlement.service';

class GrantDto {
  @IsUUID() accountId!: string;
  @IsIn(PRODUCT_KEYS) productKey!: string;
  @IsOptional() @IsISO8601() expiresAt?: string; // 일회성 기간제 만료(수능시즌). 생략=무기한(예외).
  @IsOptional() @IsIn(['admin', 'payment', 'promo']) source?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

/**
 * 상품 권한(entitlement) 관리자 API — 결제/체크아웃 도입 전 수동 부여·취소 경로.
 * 결제 훅이 생기면 결제 성공 콜백이 EntitlementService.grant() 를 그대로 호출(source='payment').
 */
@Controller()
export class EntitlementController {
  constructor(private readonly entitlement: EntitlementService) {}

  /** 상품 카탈로그(관리자 UI 셀렉트용). */
  @Roles('admin')
  @Get('admin/entitlements/products')
  products() {
    return Object.values(PRODUCTS);
  }

  /** 계정의 권한 이력(활성·만료·취소 포함). */
  @Roles('admin')
  @Get('admin/entitlements')
  list(@Query('accountId', new ParseUUIDPipe()) accountId: string) {
    return this.entitlement.list(accountId);
  }

  /** 상품 권한 부여(수동/결제 콜백). */
  @Roles('admin')
  @Post('admin/entitlements')
  grant(@CurrentUser() actor: AuthUser, @Body() dto: GrantDto) {
    return this.entitlement.grant(actor, dto.accountId, dto.productKey, {
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
