import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

/** POST /sso/token — 진입할 연계 서비스 id + (선택) 요청 scope. */
export class SsoTokenDto {
  @IsString() service!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(8) scope?: string[];
}
