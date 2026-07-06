import { ArrayMaxSize, IsArray, IsInt, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClassDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  subject?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  durationMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;
}

export class EnrollDto {
  @IsArray()
  @ArrayMaxSize(300)
  @IsUUID('4', { each: true })
  studentIds!: string[];
}
