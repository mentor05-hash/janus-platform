import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** 목록 공통 쿼리 (CLAUDE.md §7): ?page&size&sort */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size = 20;

  @IsOptional()
  @IsString()
  sort?: string;
}

export interface PageMeta {
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export function buildPageMeta(total: number, page: number, size: number): PageMeta {
  return { page, size, total, totalPages: Math.max(1, Math.ceil(total / size)) };
}
