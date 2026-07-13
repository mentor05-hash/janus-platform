import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/ratelimit/rate-limit.decorator';
import { GatewayInterpretDto } from './dto/gateway.dto';
import { GatewayService } from './gateway.service';

@Controller()
export class GatewayController {
  constructor(private readonly gateway: GatewayService) {}

  /** 관문 홈 "길 찾기" — 비로그인 공개, IP 분당 20회 제한(+일 상한은 서비스 내부 비용 가드). */
  @Public()
  @RateLimit({ limit: 20, windowSec: 60 })
  @Post('gateway/interpret')
  interpret(@Body() dto: GatewayInterpretDto) {
    return this.gateway.interpret(dto.q);
  }
}
