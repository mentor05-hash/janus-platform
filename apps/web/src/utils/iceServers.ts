/**
 * WebRTC ICE 설정 단일 소스(M-계약 선행 — 미디어킷 분리 대비, O78).
 * 기본값은 종전과 동일(구글 공개 STUN) — ENV 미설정 시 동작 무변경.
 * TURN 후결합: VITE_TURN_URL/VITE_TURN_USERNAME/VITE_TURN_CREDENTIAL 주입 시 릴레이 폴백 활성
 * (CGNAT/LTE 대비 — Cloudflare TURN 권장, 무료 1TB). STUN 교체는 VITE_STUN_URL.
 */
export function iceServers(): RTCIceServer[] {
  const env = import.meta.env as Record<string, string | undefined>;
  const list: RTCIceServer[] = [{ urls: env.VITE_STUN_URL || 'stun:stun.l.google.com:19302' }];
  if (env.VITE_TURN_URL && env.VITE_TURN_USERNAME && env.VITE_TURN_CREDENTIAL) {
    list.push({ urls: env.VITE_TURN_URL, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  }
  return list;
}
