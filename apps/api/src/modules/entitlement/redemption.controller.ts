import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateLimit } from '../../common/ratelimit/rate-limit.decorator';
import { PRODUCT_KEYS } from './domain/products';
import { RedemptionService } from './redemption.service';

class GenerateDto {
  @IsIn(PRODUCT_KEYS) productKey!: string;
  @IsInt() @Min(1) @Max(500) count!: number;
  @IsOptional() @IsISO8601() grantExpiresAt?: string; // 등록 시 부여할 권한 만료
  @IsOptional() @IsISO8601() validUntil?: string; // 코드 사용 기한
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
class RedeemDto {
  @IsString() @MaxLength(40) code!: string;
}

/** 리뎀션 코드(수강권) — 발급(관리자)·목록·등록(사용자). */
@Controller()
export class RedemptionController {
  constructor(private readonly redemption: RedemptionService) {}

  /** POST /me/redemption/redeem {code} — 사용자가 수강권 코드 등록 → 권한 부여. */
  @Post('me/redemption/redeem')
  @RateLimit({ limit: 20, windowSec: 60 })
  redeem(@CurrentUser() user: AuthUser, @Body() dto: RedeemDto) {
    return this.redemption.redeem(user, dto.code);
  }

  /** 관리자: 상품별 코드 N개 발급(발급된 코드 문자열 반환 — 인쇄·배포용). */
  @Roles('admin')
  @Post('admin/redemption-codes')
  generate(@CurrentUser() actor: AuthUser, @Body() dto: GenerateDto) {
    return this.redemption.generate(actor, {
      productKey: dto.productKey,
      count: dto.count,
      grantExpiresAt: dto.grantExpiresAt ? new Date(dto.grantExpiresAt) : null,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      note: dto.note,
    });
  }

  /** 관리자: 코드 목록(상품·사용여부 필터). */
  @Roles('admin')
  @Get('admin/redemption-codes')
  list(
    @Query('productKey') productKey?: string,
    @Query('redeemed') redeemed?: string,
  ) {
    return this.redemption.list({
      productKey: productKey || undefined,
      redeemed:
        redeemed === 'true' ? true : redeemed === 'false' ? false : undefined,
    });
  }
}
