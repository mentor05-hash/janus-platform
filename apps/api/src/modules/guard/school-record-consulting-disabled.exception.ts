import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 컨설팅 접수 신규 생기부(student_record) 업로드가 정책 토글로 비활성일 때의 거부(§4-d).
 * 내용 감지(SR_*)와 구분되는 **정책** 거부다. 코드는 `SR_` 접두어를 유지해 웹의 §4-b 모달이
 * 동일 경로로 뜨되(각 핸들러 catch 수정 불필요), 모달이 이 코드에 §4-d 문구를 렌더한다.
 * 상태코드 422(재시도로 해결되지 않음).
 */
export const CONSULTING_UPLOAD_DISABLED_MESSAGE =
  '관련 법령(생활기록부 관련 법령 제25조의2, 2026. 7. 29. 시행)에 따라 ' +
  '컨설팅 접수에서도 학교생활기록부(생기부)를 신규로 제공받을 수 없습니다. ' +
  '생활기록부 원본 업로드 대신 성적표(모의고사·내신 성적통지표) 또는 필요한 정보의 직접 입력을 이용해 주세요. ' +
  '기존에 제출된 자료의 취급은 별도 안내에 따릅니다.';

export class SchoolRecordConsultingDisabledException extends HttpException {
  constructor() {
    super(
      { error: 'SR_CONSULTING_DISABLED', message: CONSULTING_UPLOAD_DISABLED_MESSAGE },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
