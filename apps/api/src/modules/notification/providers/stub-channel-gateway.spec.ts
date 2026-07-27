import { StubChannelGateway } from './stub-channel-gateway';
import { NotifyMessage } from '../notification.types';
import type { PrismaService } from '../../../common/prisma/prisma.service';

describe('StubChannelGateway (§10)', () => {
  // push 채널 미테스트 → push_token.findMany 만 최소 목 제공.
  const prismaStub = {
    push_token: { findMany: async () => [] },
  } as unknown as PrismaService;
  const sut = new StubChannelGateway(prismaStub);
  const msg: NotifyMessage = {
    recipientId: 'r1',
    type: 'test',
    channels: [],
    payload: {},
  };

  it('앱 채널은 성공', async () => {
    expect(await sut.deliver('app', msg)).toBe(true);
  });

  it('SMS·카카오는 미구성 → 실패', async () => {
    expect(await sut.deliver('sms', msg)).toBe(false);
    expect(await sut.deliver('kakao', msg)).toBe(false);
  });
});
