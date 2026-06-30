import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { MinPerm } from '../../common/decorators/min-perm.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MemberTypeService } from './member-type.service';
import { CreateMemberTypeDto, SetMemberTypeDto } from './dto/member-type.dto';

/**
 * 회원 분류(선생님·학생 유형) 관리 (§people).
 * 조회·배정: 관리자/HR. 분류 체계 생성/비활성: 본사 이상(@MinPerm L2).
 */
@Controller('admin')
@Roles('admin', 'hr')
export class MemberTypeController {
  constructor(private readonly svc: MemberTypeService) {}

  @Get('member-types')
  list(@Query('kind') kind?: 'teacher' | 'student') {
    return this.svc.list(kind);
  }

  @Post('member-types')
  @MinPerm('L2') // 분류 체계 추가는 본사 이상
  create(@Body() dto: CreateMemberTypeDto) {
    return this.svc.create(dto);
  }

  @Delete('member-types/:id')
  @MinPerm('L2')
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deactivate(id);
  }

  @Patch('teachers/:id/type')
  setTeacherType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetMemberTypeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.assign('teacher', id, dto, user);
  }

  @Patch('students/:id/type')
  setStudentType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetMemberTypeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.assign('student', id, dto, user);
  }
}
