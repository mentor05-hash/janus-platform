/**
 * WebRTC ICE 설정 단일 소스(모바일 — 미디어킷 분리 대비, O78). 웹 utils/iceServers.ts 와 동일 규약.
 * 기본값은 종전과 동일(구글 공개 STUN) — ENV 미설정 시 동작 무변경.
 * TURN 후결합: EXPO_PUBLIC_TURN_URL/EXPO_PUBLIC_TURN_USERNAME/EXPO_PUBLIC_TURN_CREDENTIAL.
 */
export function iceServers(): RTCIceServer[] {
  const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;
  const list: RTCIceServer[] = [{ urls: env.EXPO_PUBLIC_STUN_URL || 'stun:stun.l.google.com:19302' }];
  if (env.EXPO_PUBLIC_TURN_URL && env.EXPO_PUBLIC_TURN_USERNAME && env.EXPO_PUBLIC_TURN_CREDENTIAL) {
    list.push({ urls: env.EXPO_PUBLIC_TURN_URL, username: env.EXPO_PUBLIC_TURN_USERNAME, credential: env.EXPO_PUBLIC_TURN_CREDENTIAL });
  }
  return list;
}
