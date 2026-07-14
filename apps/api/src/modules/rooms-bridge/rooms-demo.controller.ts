import { BadRequestException, Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { RoomsProvider } from './rooms.provider';

/**
 * 내부 툴(채팅·화이트보드) 점검용 데모 룸 프로비저너 — 로컬/데모 전용.
 * 프로덕션(APP_ENV/NODE_ENV=prod)에서는 막는다. 로그인 없이 호출(@Public).
 * 룸 1개(모든 기능 on, 세션 모드)에 선생님·학생 참가자를 만들어 접속 토큰을 돌려준다.
 * → 웹 /room/demo 런처가 이 토큰으로 chat|whiteboard 링크를 바로 연다.
 */
@Controller('rooms-bridge')
export class RoomsDemoController {
  constructor(private readonly rooms: RoomsProvider, private readonly config: ConfigService) {}

  @Public()
  @Post('demo')
  async demo() {
    const env = this.config.get<string>('APP_ENV') ?? this.config.get<string>('NODE_ENV') ?? '';
    if (env === 'prod' || env === 'production') {
      throw new BadRequestException('데모 프로비저닝은 로컬/데모 환경에서만 가능합니다.');
    }
    if (!this.rooms.enabled) {
      throw new BadRequestException('실시간 룸 서비스가 비활성화되어 있습니다(REALTIME_ROOMS_ENABLED).');
    }
    const created = await this.rooms.createRoom({
      externalRef: `demo-${Date.now()}`,
      features: { chat: true, whiteboard: true, voice: true },
      opensAt: null,
      closesAt: null,
      mode: 'session',
      participants: [
        { extUserId: 'demo-teacher', displayName: '선생님', role: 'teacher' },
        { extUserId: 'demo-student', displayName: '학생', role: 'student' },
      ],
    });
    const t = created.participants.find((p) => p.extUserId === 'demo-teacher') ?? created.participants[0];
    const s = created.participants.find((p) => p.extUserId === 'demo-student') ?? created.participants[1];
    const [teacherToken, studentToken] = await Promise.all([
      this.rooms.mintToken(created.roomId, t.participantId),
      this.rooms.mintToken(created.roomId, s.participantId),
    ]);
    return { url: this.rooms.publicUrl, roomId: created.roomId, teacherToken, studentToken };
  }
}
