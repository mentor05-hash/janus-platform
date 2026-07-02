import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/iam/auth.service';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * 실시간 게이트웨이 e2e — 소켓 실연결로 chat:send/read 브로드캐스트, wb:stroke 동기화,
 * 스냅샷 영속을 검증(#3 게이트웨이 테스트 갭 메움). app.listen 으로 실제 소켓 리슨.
 */
const STUDENT = 'c0000000-0000-4000-8000-000000000001'; // ls1
const TEACHER = 'b0000000-0000-4000-8000-000000000001'; // lt1
const CENTER = 'a0000000-0000-4000-8000-000000000001';

const connect = (port: number, token: string): Socket =>
  io(`http://localhost:${port}`, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'], forceNew: true });
const connected = (s: Socket) => new Promise<void>((res) => s.on('connect', () => res()));
const ack = (s: Socket, ev: string, data: unknown) => new Promise<any>((res) => s.emit(ev, data, res));
const nextEvent = (s: Socket, ev: string, ms = 2000) =>
  new Promise<any>((res, rej) => { const to = setTimeout(() => rej(new Error('timeout ' + ev)), ms); s.once(ev, (d) => { clearTimeout(to); res(d); }); });

describe('실시간 게이트웨이(채팅·화이트보드)', () => {
  let app: INestApplication;
  let port = 0;
  let prisma: PrismaService;
  let studentToken = '';
  let teacherToken = '';
  let bookingId = '';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    await app.listen(0); // 랜덤 포트로 실제 소켓 리슨
    const addr = app.getHttpServer().address();
    port = typeof addr === 'object' && addr ? addr.port : 0;

    prisma = app.get(PrismaService);
    // 테스트 동안 채팅·화이트보드 전면 개방(멤버십 게이팅 무관)
    await prisma.system_setting.upsert({
      where: { key: 'realtime_features' },
      create: { key: 'realtime_features', value: { chat: 'all', whiteboard: 'all', notif: 'all' } },
      update: { value: { chat: 'all', whiteboard: 'all', notif: 'all' } },
    });
    // 학생01↔선생님01 예약 1건(참여자 방)
    const b = await prisma.booking.create({
      data: {
        student_id: STUDENT, teacher_id: TEACHER, center_id: CENTER,
        consult_type: 'subject' as never, mode: 'chat' as never, direction: 'student' as never,
        status: 'confirmed' as never, charged_credits: 0,
        start_at: new Date('2026-08-01T01:00:00Z'), end_at: new Date('2026-08-01T01:30:00Z'),
        content: 'RT-E2E',
      },
      select: { id: true },
    });
    bookingId = b.id;
    const auth = app.get(AuthService);
    studentToken = (await auth.login({ loginId: 'ls1', password: 'dev-password!' })).accessToken;
    teacherToken = (await auth.login({ loginId: 'lt1', password: 'dev-password!' })).accessToken;
  });

  afterAll(async () => {
    if (bookingId) {
      await prisma.chat_message.deleteMany({ where: { booking_id: bookingId } });
      await prisma.whiteboard_snapshot.deleteMany({ where: { booking_id: bookingId } });
      await prisma.booking.delete({ where: { id: bookingId } }).catch(() => undefined);
    }
    await app.close();
  });

  it('채팅: 전송 브로드캐스트(서버권위 mine) + 미확인 + 읽음 확인', async () => {
    const st = connect(port, studentToken);
    const tc = connect(port, teacherToken);
    await Promise.all([connected(st), connected(tc)]);
    await ack(st, 'chat:join', { bookingId });
    await ack(tc, 'chat:join', { bookingId });

    // 선생님이 보낸 메시지를 학생이 수신(mine=false), 발신자는 mine=true
    const stGot = nextEvent(st, 'chat:message');
    const tcGot = nextEvent(tc, 'chat:message');
    const sendAck = await ack(tc, 'chat:send', { bookingId, body: '안녕하세요' });
    expect(sendAck.ok).toBe(true);
    const [ms, mt] = await Promise.all([stGot, tcGot]);
    expect(ms.body).toBe('안녕하세요');
    expect(ms.mine).toBe(false);
    expect(mt.mine).toBe(true);

    // 학생 미확인 = 1(REST) — 테스트 앱은 TransformInterceptor 미등록이라 래핑 유무 모두 대응
    const un1 = await request(app.getHttpServer()).get('/api/v1/chat/unread').set('Authorization', `Bearer ${studentToken}`);
    expect((un1.body.data ?? un1.body)[bookingId]).toBe(1);

    // 학생 열람 → 선생님이 chat:read 수신, 미확인 0
    const tcRead = nextEvent(tc, 'chat:read');
    await ack(st, 'chat:read', { bookingId });
    const rd = await tcRead;
    expect(rd.readerId).toBe(STUDENT);
    const un2 = await request(app.getHttpServer()).get('/api/v1/chat/unread').set('Authorization', `Bearer ${studentToken}`);
    expect((un2.body.data ?? un2.body)[bookingId]).toBeUndefined();

    st.close(); tc.close();
  });

  it('화이트보드: 스트로크 동기화(지우개 플래그) + 스냅샷 영속', async () => {
    const a = connect(port, teacherToken);
    const b = connect(port, teacherToken);
    await Promise.all([connected(a), connected(b)]);
    const ja = await ack(a, 'wb:join', { bookingId });
    expect(ja.ok).toBe(true);
    await ack(b, 'wb:join', { bookingId });

    // a 의 지우개 스트로크가 b 에게 브로드캐스트(erase 플래그 보존)
    const bGot = nextEvent(b, 'wb:stroke');
    a.emit('wb:stroke', { bookingId, stroke: { points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], color: '#000', width: 20, erase: true } });
    const got = await bGot;
    expect(got.stroke.erase).toBe(true);

    // 저장 → DB 영속
    await ack(a, 'wb:save', { bookingId, strokes: [{ points: [{ x: 1, y: 1 }], color: '#000', width: 3 }] });
    const snap = await prisma.whiteboard_snapshot.findFirst({ where: { booking_id: bookingId }, orderBy: { created_at: 'desc' } });
    expect(snap).toBeTruthy();
    expect(Array.isArray(snap!.strokes)).toBe(true);

    a.close(); b.close();
  });

  it('존재하지 않는/미참여 예약은 join 성공하지 않음', async () => {
    const s = connect(port, studentToken);
    await connected(s);
    // 없는 예약 → 핸들러가 예외를 던져 ack 로 성공(ok:true)이 오지 않는다(2s 내 미응답=거부).
    const ackOrTimeout = Promise.race([
      ack(s, 'chat:join', { bookingId: '00000000-0000-4000-8000-0000000000ff' }),
      new Promise((res) => setTimeout(() => res({ timedOut: true }), 2000)),
    ]);
    const r: any = await ackOrTimeout;
    expect(r?.ok).not.toBe(true); // ok:true 아님(예외로 미응답 또는 명시적 실패)
    s.close();
  });
});
