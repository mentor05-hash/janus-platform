import { pickCorsOrigin } from './cors-origin';

describe('pickCorsOrigin (api) — WS/HTTP 동일 정책', () => {
  it('allowlist(csv) 있으면 트림된 배열', () => {
    expect(pickCorsOrigin('https://web.janus.app, https://m.janus.app', true)).toEqual([
      'https://web.janus.app',
      'https://m.janus.app',
    ]);
  });
  it('미설정 + 운영 → false(임의 오리진 인증 WS 거부)', () => {
    expect(pickCorsOrigin(undefined, true)).toBe(false);
    expect(pickCorsOrigin('', true)).toBe(false);
  });
  it('미설정 + 로컬 → true', () => {
    expect(pickCorsOrigin(undefined, false)).toBe(true);
  });
});
