import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 인증 불필요 엔드포인트 표시(로그인·회원가입·헬스체크 등). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
