import * as crypto from 'crypto';
import { LiveKitMediaProvider } from './livekit-media.provider';

const decode = (jwt: string) =>
  JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

describe('LiveKitMediaProvider 토큰(grant)', () => {
  const p = new LiveKitMediaProvider(
    'wss://x.livekit.cloud',
    'APIkey123',
    'secret456',
  );

  it('선생님(publisher): canPublish=true, canSubscribe=true', async () => {
    const r = await p.issueToken('room-1', 'teacher-1', 'publisher', '김선생');
    expect(r.provider).toBe('livekit');
    expect(r.url).toBe('wss://x.livekit.cloud');
    const c = decode(r.token!);
    expect(c.iss).toBe('APIkey123');
    expect(c.sub).toBe('teacher-1');
    expect(c.name).toBe('김선생');
    expect(c.video.room).toBe('room-1');
    expect(c.video.roomJoin).toBe(true);
    expect(c.video.canPublish).toBe(true);
    expect(c.video.canSubscribe).toBe(true);
    expect(c.video.canPublishData).toBe(true);
  });

  it('학생(subscriber): canPublish=false, canSubscribe=true (수신 전용)', async () => {
    const r = await p.issueToken('room-1', 'student-9', 'subscriber');
    const c = decode(r.token!);
    expect(c.sub).toBe('student-9');
    expect(c.video.canPublish).toBe(false);
    expect(c.video.canSubscribe).toBe(true);
    expect(c.video.canPublishData).toBe(false);
  });

  it('서명은 HS256 secret 기반(변조 검증 가능)', async () => {
    const r = await p.issueToken('room-1', 'teacher-1', 'publisher');
    const [h, pl, sig] = r.token!.split('.');
    const expected = crypto
      .createHmac('sha256', 'secret456')
      .update(`${h}.${pl}`)
      .digest('base64url');
    expect(sig).toBe(expected);
  });
});
