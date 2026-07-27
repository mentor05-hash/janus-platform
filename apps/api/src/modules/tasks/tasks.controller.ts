import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TasksService } from './tasks.service';

class CreateTaskDto {
  @IsString() @IsNotEmpty() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(20) category?: string;
  @IsOptional() @IsString() @MaxLength(30) subject?: string | null;
  @IsOptional() @IsString() dueDate?: string | null;
}
class StatusDto {
  @IsIn(['todo', 'done', 'dismissed']) status!: 'todo' | 'done' | 'dismissed';
}

/** 학생 맞춤 할 일(체크리스트). */
@Controller('me/tasks')
@Roles('student')
@ApiTags('할 일')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.tasks.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  @Patch(':id')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
  ) {
    return this.tasks.setStatus(user, id, dto.status);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.remove(user, id);
  }
}
