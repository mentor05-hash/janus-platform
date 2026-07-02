/**
 * 한국어 사전(기준 로케일). 키는 도메인.의미 형태.
 * 앱은 한국어 우선(CLAUDE.md §7) — 신규 문자열은 이 사전에 키로 추가하고 t() 로 사용한다.
 * {name} 형태의 자리표시자는 t(key, { name }) 로 치환된다.
 */
export const ko = {
  'common.save': '저장',
  'common.cancel': '취소',
  'common.delete': '삭제',
  'common.edit': '수정',
  'common.close': '닫기',
  'common.confirm': '확인',
  'common.loading': '불러오는 중…',
  'common.empty': '표시할 내용이 없어요.',
  'common.retry': '다시 시도',
  'common.search': '검색',
  'common.send': '전송',

  'nav.search': '선생님 찾기',
  'nav.bookings': '내 예약·상담',
  'nav.scores': '내 성적·배치',
  'nav.materials': '자료실',
  'nav.qna': '질문 게시판',
  'nav.community': '커뮤니티',
  'nav.membership': '멤버십·결제',
  'nav.credits': '크레딧',
  'nav.notifications': '알림',
  'nav.reverse': '역상담',
  'nav.legal': '약관·개인정보',

  'booking.chat': '상담 채팅',
  'booking.whiteboard': '공유 화이트보드',
  'booking.cancel': '예약 취소',
  'booking.reschedule': '시간 변경',

  'notif.new': '새 알림이 도착했어요.',
  'greeting.welcome': '{name}님, 환영합니다.',
} as const;

export type MessageKey = keyof typeof ko;
