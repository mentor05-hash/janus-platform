import { StubChannelGateway } from './stub-channel-gateway';
import { NotifyMessage } from '../notification.types';

describe('StubChannelGateway (§10)', () => {
  const sut = new StubChannelGateway();
  const msg: NotifyMessage = { recipientId: 'r1', type: 'test', channels: [], payload: {} };

  it('앱 채널은 성공', async () => {
    expect(await sut.deliver('app', msg)).toBe(true);
  });

  it('SMS·카카오는 미구성 → 실패', async () => {
    expect(await sut.deliver('sms', msg)).toBe(false);
    expect(await sut.deliver('kakao', msg)).toBe(false);
  });
});
