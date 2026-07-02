/**
 * 알림 메시지 템플릿 레지스트리 (§3 notification).
 * 알림 type + payload → {title, body} 렌더링을 한 곳에서 정의한다.
 * - 인앱 수신함 표시, 채널(SMS·알림톡) 발송 문구가 모두 이 템플릿을 사용 → 문구 일관성.
 * - body 안의 {키} 는 payload 값으로 치환(없으면 그대로 유지하지 않고 빈 문자열).
 * - 신규 알림 type 은 여기에 한 줄 추가한다(누락 시 generic 폴백).
 */
export type NotifPayload = Record<string, unknown>;
export interface RenderedNotif {
  title: string;
  body: string;
}

type Tmpl = { title: string; body: string };
const S = (v: unknown) => (v == null ? '' : String(v));

/** payload 우선순위 키에서 첫 유효값(사람이 넣은 message/title 우선). */
const pick = (p: NotifPayload, ...keys: string[]): string => {
  for (const k of keys) {
    const v = p[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
};

/** 정적 템플릿(대부분). {키} 치환은 render 에서 수행. */
const TEMPLATES: Record<string, Tmpl> = {
  // ── 예약 ──
  booking_requested: { title: '새 상담 신청', body: '새로운 상담 신청이 도착했어요. 예약 관리에서 확인하세요.' },
  booking_confirmed: { title: '예약 확정', body: '신청하신 상담이 확정되었어요. 예약 현황에서 확인하세요.' },
  booking_rejected: { title: '예약 거절', body: '신청하신 상담이 거절되었어요. 다른 시간·선생님으로 다시 신청해 주세요.' },
  booking_cancelled: { title: '예약 취소', body: '예약이 취소되었어요. 크레딧은 환원됩니다.' },
  booking_noshow: { title: '미진행 신고', body: '미진행(노쇼) 신고가 접수되었어요. 관리자가 확인합니다.' },
  booking_reminder: { title: '상담 임박', body: '곧 상담이 시작돼요. 준비해 주세요.' },
  // ── 역상담 ──
  reverse_proposed: { title: '역상담 제안', body: '선생님의 역상담 제안이 도착했어요. 수락 여부를 선택해 주세요.' },
  reverse_accepted: { title: '역상담 수락', body: '제안하신 역상담이 수락되어 예약이 확정됐어요.' },
  reverse_rejected: { title: '역상담 거절', body: '제안하신 역상담이 거절되었어요.' },
  // ── 결제·크레딧 ──
  payment_requested: { title: '결제 요청', body: '크레딧 결제(대납) 요청이 도착했어요. 결제 화면에서 확인하세요.' },
  payment_responded: { title: '결제 요청 응답', body: '결제 요청에 응답이 처리되었어요.' },
  // ── 연결·계정 ──
  guardian_link_requested: { title: '자녀 연결 요청', body: '자녀(학생) 연결 요청이 도착했어요. 확인 후 수락해 주세요.' },
  guardian_link_responded: { title: '연결 요청 응답', body: '보호자 연결 요청에 응답이 처리되었어요.' },
  account_approved: { title: '가입 승인', body: '계정이 승인되었어요. 이제 로그인해 서비스를 이용할 수 있어요.' },
  // ── 상담기록·성적·질문 ──
  note_shared: { title: '상담 기록 공개', body: '상담 기록(핵심요약·숙제·향후방향)이 공개되었어요.' },
  score_uploaded: { title: '성적 업데이트', body: '성적이 업데이트되었어요. 성적·배치에서 확인하세요.' },
  qna_answered: { title: '질문 답변', body: '등록한 질문에 답변이 달렸어요.' },
  qna_assigned: { title: '질문 배정', body: '새 질문이 배정되었어요. 답변을 작성해 주세요.' },
  // ── 공지·기타 ──
  announcement: { title: '{title}', body: '{body}' },
  announcement_reminder: { title: '예약 공지 발송 예정', body: '예약하신 공지가 곧 발송돼요.' },
  push_test: { title: '{title}', body: '{body}' },
};

const GENERIC: Tmpl = { title: '새 알림', body: '새 알림이 도착했어요.' };

/** type + payload → 표시/발송용 {title, body}. */
export function renderNotification(type: string, payload: NotifPayload = {}): RenderedNotif {
  const tmpl = TEMPLATES[type] ?? GENERIC;
  const subst = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => S(payload[k]));
  // 사람이 직접 넣은 message 가 있으면 body 우선 사용(공지·커스텀).
  const custom = pick(payload, 'message');
  return {
    title: subst(tmpl.title) || GENERIC.title,
    body: (custom || subst(tmpl.body)) || GENERIC.body,
  };
}
