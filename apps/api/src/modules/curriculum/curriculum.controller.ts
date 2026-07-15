import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurriculumService } from './curriculum.service';

@Controller('curriculum')
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  /** GET /curriculum/me — 내 주간 학습 플랜(학생). 진단 약점 + 성적 → 우선순위 처방. */
  @Get('me')
  @Roles('student')
  myPlan(@CurrentUser() user: AuthUser) {
    return this.curriculum.myPlan(user);
  }
}
