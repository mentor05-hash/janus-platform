/* 간이 전환 계측(W3·접합계약 C3) — fire-and-forget 이벤트 로그.
 * 고정 id(변경 금지): 페이지 `baechi` · 상담 전환 CTA `consult-reserve`.
 * 익명 세션 id(localStorage) 기반 — PII 없음. 실패는 조용히 무시(UX 영향 0). */
const SID_KEY = 'janus_sid';

export function sessionId(): string {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return 'anon';
  }
}

export function track(page: string, event: 'view' | 'cta', cta?: string, meta?: Record<string, unknown>) {
  try {
    void fetch('/api/v1/funnel/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, event, ...(cta ? { cta } : {}), sessionId: sessionId(), ...(meta ? { meta } : {}) }),
      keepalive: true, // 페이지 이탈 직전 클릭도 유실 최소화
    });
  } catch {
    /* 계측은 절대 UX 를 막지 않는다 */
  }
}
