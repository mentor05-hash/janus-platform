import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CategoryService } from './category.service';

class CreateCategoryDto {
  @IsIn(['material', 'teacher']) kind!: string;
  @IsString() @IsNotEmpty() name!: string;
}

@Controller('categories')
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  /** GET /categories?kind= — 목록(모든 역할). */
  @Get()
  list(@Query('kind') kind?: string) {
    return this.categories.list(kind);
  }

  /** POST /categories — 추가(본사관리자). */
  @Post()
  @Roles('admin')
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthUser) {
    return this.categories.create(user, dto.kind, dto.name);
  }

  /** DELETE /categories/:id — 삭제(본사관리자). */
  @Delete(':id')
  @Roles('admin')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categories.remove(user, id);
  }
}
