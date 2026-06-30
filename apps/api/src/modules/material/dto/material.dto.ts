import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const MATERIAL_VISIBILITY = ['public', 'center', 'private'] as const;
export type MaterialVisibility = (typeof MATERIAL_VISIBILITY)[number];

/** 자료 게시(업로드와 함께 multipart 필드로 전달). */
export class CreateMaterialDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject?: string;

  @IsOptional()
  @IsIn(MATERIAL_VISIBILITY)
  visibility?: MaterialVisibility;
}
