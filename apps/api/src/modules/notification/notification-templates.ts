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
  booking_assigned: { title: '상담 자동 배정', body: '근무시간에 상담이 자동 배정됐어요. 오늘/예약에서 확인하세요.' },
  booking_confirmed: { title: '예약 확정', body: '신청하신 상담이 확정되었어요. 예약 현황에서 확인하세요.' },
  booking_rejected: { title: '예약 거절', body: '신청하신 상담이 거절되었어요. 다른 시간·선생님으로 다시 신청해 주세요.' },
  booking_cancelled: { title: '예약 취소', body: '예약이 취소되었어요. 크레딧은 환원됩니다.' },
  booking_noshow: { title: '미진행 신고', body: '미진행(노쇼) 신고가 접수되었어요. 관리자가 확인합니다.' },
  booking_reminder: { title: '상담 임박', body: '곧 상담이 시작돼요. 준비해 주세요.' },
  booking_request_reminder: { title: '⏰ 수락 대기 상담', body: '2시간 넘게 수락하지 않은 상담 신청이 있어요. 예약 탭에서 확인해 주세요.' },
  booking_acked: { title: '선생님 확인 ✓', body: '선생님이 상담을 확인했어요. 예정된 시간에 만나요!' },
  booking_teacher_noshow: { title: '상담 미진행 처리', body: '선생님이 상담을 확인하지 못해 예약이 취소되고 크레딧·질문권이 환원되었습니다. 불편을 드려 죄송해요.' },
  booking_teacher_noshow_teacher: { title: '⚠ 미확인 상담 취소', body: '확인하지 않은 상담이 종료되어 선생님 귀책으로 취소 처리되었습니다(취소 카운트 반영).' },
  booking_teacher_noshow_admin: { title: '선생님 미확인 노쇼', body: '선생님이 확인하지 않아 자동 취소된 상담이 있습니다. 확인해 주세요.' },
  booking_request_escalated: { title: '미응답 상담 신청', body: '24시간 넘게 수락되지 않은 상담 신청이 있습니다. 담당 선생님 확인이 필요해요.' },
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
  // 관리자 강제 복구(O125) — 학생이 끊은 연결을 학생 동의 없이 되살리는 것이라
  // 학생에게 반드시 알린다. 조용히 복구되면 학생은 자기가 끊은 줄로 계속 알고 있게 된다.
  guardian_link_restored: { title: '보호자 연결 복구', body: '관리자가 보호자 연결을 복구했어요. 문의는 센터로 연락해 주세요.' },
  account_approved: { title: '가입 승인', body: '계정이 승인되었어요. 이제 로그인해 서비스를 이용할 수 있어요.' },
  // ── 상담기록·성적·질문 ──
  note_shared: { title: '상담 기록 공개', body: '상담 기록(핵심요약·숙제·향후방향)이 공개되었어요.' },
  consult_report: { title: '상담 리포트 도착 📋', body: '상담 요약 리포트가 도착했어요. 상담 리포트에서 확인하세요.' },
  consult_report_shared: { title: '자녀 상담 리포트 공유 📋', body: '자녀가 상담 요약(학부모용)을 공유했어요. 상담 리포트에서 확인하세요.' },
  consult_report_reminder: { title: '아직 안 읽은 상담 리포트 📋', body: '선생님이 보낸 상담 요약을 아직 확인하지 않았어요. 상담 리포트에서 열어보세요.' },
  score_uploaded: { title: '성적 업데이트', body: '성적이 업데이트되었어요. 성적·배치에서 확인하세요.' },
  academic_reminder: { title: '{ddayLabel} · {title}', body: '{dateLabel} 학사일정이 다가와요. 미리 준비하세요.' },
  task_reminder: { title: '할 일 마감 임박', body: "'{title}' 할 일이 {when} 마감이에요. 잊지 말고 챙겨요." },
  // ── 학부모 계획 제안(O106) ──
  guardian_plan_proposed: { title: '학부모 계획 제안', body: "'{title}' 계획을 학부모가 제안했어요. 수락하면 내 할 일에 추가돼요." },
  guardian_plan_accepted: { title: '자녀가 계획을 수락했어요', body: "'{title}' 제안을 자녀가 수락했어요. 자녀 할 일에 추가됐습니다." },
  guardian_plan_declined: { title: '자녀가 계획을 거절했어요', body: "'{title}' 제안을 자녀가 거절했어요. 다른 방식으로 이야기해 보세요." },
  entitlement_expiring: { title: '이용권 만료 임박', body: '{product} 이용권이 {days}일 뒤 만료돼요. 내 이용권에서 확인·연장하세요.' },
  qna_answered: { title: '질문 답변', body: '등록한 질문에 답변이 달렸어요.' },
  qna_claimed: { title: '선생님 확인 중', body: '선생님이 내 질문을 확인하고 있어요. 곧 답변이 도착합니다.' },
  chat_message: { title: '새 채팅 메시지', body: '상담 채팅에 새 메시지가 도착했어요. 채팅방에서 확인하세요.' },
  // ── 커뮤니티·리그(Q3) ──
  qna_community_answer: { title: '커뮤니티 새 답변', body: '내 커뮤니티 질문에 새 답변이 달렸어요. 확인하고 채택해 보세요.' },
  qna_community_accepted: { title: '답변 채택 🎉', body: '내 커뮤니티 답변이 채택됐어요! 리그 실적에 반영됩니다.' },
  qna_league_promoted: { title: '리그 승급 🏅', body: '{label}(으)로 승급했어요! 커뮤니티 기여 고마워요.' },
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
