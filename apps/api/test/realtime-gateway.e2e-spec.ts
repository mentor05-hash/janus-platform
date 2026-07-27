import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/iam/auth.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ACCOUNTS, DEMO_PW } from './fixtures/demo-accounts';

/**
 * 실시간 게이트웨이 e2e — 소켓 실연결로 chat:send/read 브로드캐스트, wb:stroke 동기화,
 * 스냅샷 영속을 검증(#3 게이트웨이 테스트 갭 메움). app.listen 으로 실제 소켓 리슨.
 */
/**
 * ⚠ 픽스처 식별자를 상수로 박지 않는다. 이전 구현은 `c0000000-…`/`b0000000-…`/`a0000000-…` 라는
 * **어떤 시드에도 없는 가상 uuid** 를 썼고, booking 의 FK 3개(center·student_profile·teacher_profile)가
 * 전부 부모 없는 값이라 beforeAll 이 `booking_center_id_fkey` 위반으로 죽었다(3건 전부 실패).
 * 이제 시드 정본 계정에서 런타임 조회한다 — 계정이 없으면 findFirstOrThrow 가 원인을 그대로 알려준다.
 */
const RT_CONTENT = 'RT-E2E'; // 잔여물 회수 기준(스위트가 중간에 죽어도 다음 실행이 지운다)

const connect = (port: number, token: string): Socket =>
  io(`http://localhost:${port}`, {
    path: '/api/v1/socket.io',
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
const connected = (s: Socket) =>
  new Promise<void>((res) => s.on('connect', () => res()));
const ack = (s: Socket, ev: string, data: unknown) =>
  new Promise<any>((res) => s.emit(ev, data, res));
const nextEvent = (s: Socket, ev: string, ms = 2000) =>
  new Promise<any>((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout ' + ev)), ms);
    s.once(ev, (d) => {
      clearTimeout(to);
      res(d);
    });
  });

describe('실시간 게이트웨이(채팅·화이트보드)', () => {
  let app: INestApplication;
  let port = 0;
  let prisma: PrismaService;
  let studentToken = '';
  let teacherToken = '';
  let bookingId = '';
  let prevRealtime: { key: string; value: unknown } | null = null;
  let studentId = ''; // 시드 학생 account_id — chat:read 의 readerId 단정에 쓴다

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    await app.listen(0); // 랜덤 포트로 실제 소켓 리슨
    const addr = app.getHttpServer().address();
    port = typeof addr === 'object' && addr ? addr.port : 0;

    prisma = app.get(PrismaService);

    // FK 부모를 **먼저 확인**한다 — booking 은 center·student_profile·teacher_profile 3개를 참조하므로
    // 계정만 있고 프로필이 없으면 같은 FK 위반이 난다. 없으면 여기서 명확히 실패해야 한다.
    const sp = await prisma.student_profile.findFirstOrThrow({
      where: { account: { login_id: ACCOUNTS.student } },
      select: { account_id: true, center_id: true },
    });
    const tp = await prisma.teacher_profile.findFirstOrThrow({
      where: { account: { login_id: ACCOUNTS.teacher } },
      select: { account_id: true, center_id: true },
    });
    const centerId = sp.center_id ?? tp.center_id;
    if (!centerId)
      throw new Error(
        '데모 학생·선생님에게 center_id 가 없다 — 시드를 확인하라.',
      );

    // 채팅·화이트보드 전면 개방(멤버십 게이팅 무관) — **스냅샷 후 복원**한다.
    // 이전 구현은 복원하지 않아 `realtime_features = all/all/all` 행이 DB 에 영구 잔존했고,
    // 그 결과 프리미엄 화이트보드 게이트가 전역 개방된 상태로 수동 검증·데모가 '통과'로 보였다.
    prevRealtime = await prisma.system_setting.findUnique({
      where: { key: 'realtime_features' },
    });
    await prisma.system_setting.upsert({
      where: { key: 'realtime_features' },
      create: {
        key: 'realtime_features',
        value: { chat: 'all', whiteboard: 'all', notif: 'all' },
      },
      update: { value: { chat: 'all', whiteboard: 'all', notif: 'all' } },
    });

    // 이전 실행이 중간에 죽어 남은 예약 회수(멱등) — content 기준.
    await prisma.booking.deleteMany({
      where: { student_id: sp.account_id, content: RT_CONTENT },
    });
    // 학생01↔선생님01 예약 1건(참여자 방). **상대시각** — 절대 날짜는 그 날짜가 지나면 조용히 부패한다.
    const startAt = new Date(Date.now() + 60 * 60 * 1000);
    const b = await prisma.booking.create({
      data: {
        student_id: sp.account_id,
        teacher_id: tp.account_id,
        center_id: centerId,
        consult_type: 'subject' as never,
        mode: 'chat' as never,
        direction: 'student' as never,
        status: 'confirmed' as never,
        charged_credits: 0,
        start_at: startAt,
        end_at: new Date(startAt.getTime() + 30 * 60 * 1000),
        content: RT_CONTENT,
      },
      select: { id: true },
    });
    bookingId = b.id;
    studentId = sp.account_id;
    const auth = app.get(AuthService);
    // 구 'ls1'/'lt1' 은 어떤 시드에도 없던 가상 계정이었다 → 시드 정본 계정 사용.
    studentToken = (
      await auth.login({ loginId: ACCOUNTS.student, password: DEMO_PW })
    ).accessToken;
    teacherToken = (
      await auth.login({ loginId: ACCOUNTS.teacher, password: DEMO_PW })
    ).accessToken;
  });

  afterAll(async () => {
    if (bookingId) {
      await prisma.chat_message.deleteMany({
        where: { booking_id: bookingId },
      });
      await prisma.whiteboard_snapshot.deleteMany({
        where: { booking_id: bookingId },
      });
      await prisma.booking
        .delete({ where: { id: bookingId } })
        .catch(() => undefined);
    }
    // 전역 설정 원복 — 원래 없던 키였으면 **삭제**한다(기본값 whiteboard='premium' 으로 복귀).
    if (prevRealtime) {
      await prisma.system_setting.update({
        where: { key: 'realtime_features' },
        data: { value: prevRealtime.value as never },
      });
    } else {
      await prisma.system_setting.deleteMany({
        where: { key: 'realtime_features' },
      });
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
    const sendAck = await ack(tc, 'chat:send', {
      bookingId,
      body: '안녕하세요',
    });
    expect(sendAck.ok).toBe(true);
    const [ms, mt] = await Promise.all([stGot, tcGot]);
    expect(ms.body).toBe('안녕하세요');
    expect(ms.mine).toBe(false);
    expect(mt.mine).toBe(true);

    // 학생 미확인 = 1(REST) — 테스트 앱은 TransformInterceptor 미등록이라 래핑 유무 모두 대응
    const un1 = await request(app.getHttpServer())
      .get('/api/v1/chat/unread')
      .set('Authorization', `Bearer ${studentToken}`);
    expect((un1.body.data ?? un1.body)[bookingId]).toBe(1);

    // 학생 열람 → 선생님이 chat:read 수신, 미확인 0
    const tcRead = nextEvent(tc, 'chat:read');
    await ack(st, 'chat:read', { bookingId });
    const rd = await tcRead;
    expect(rd.readerId).toBe(studentId);
    const un2 = await request(app.getHttpServer())
      .get('/api/v1/chat/unread')
      .set('Authorization', `Bearer ${studentToken}`);
    expect((un2.body.data ?? un2.body)[bookingId]).toBeUndefined();

    st.close();
    tc.close();
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
    a.emit('wb:stroke', {
      bookingId,
      stroke: {
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
        color: '#000',
        width: 20,
        erase: true,
      },
    });
    const got = await bGot;
    expect(got.stroke.erase).toBe(true);

    // 저장 → DB 영속
    await ack(a, 'wb:save', {
      bookingId,
      strokes: [{ points: [{ x: 1, y: 1 }], color: '#000', width: 3 }],
    });
    const snap = await prisma.whiteboard_snapshot.findFirst({
      where: { booking_id: bookingId },
      orderBy: { created_at: 'desc' },
    });
    expect(snap).toBeTruthy();
    expect(Array.isArray(snap!.strokes)).toBe(true);

    a.close();
    b.close();
  });

  it('존재하지 않는/미참여 예약은 join 성공하지 않음', async () => {
    const s = connect(port, studentToken);
    await connected(s);
    // 없는 예약 → 핸들러가 예외를 던져 ack 로 성공(ok:true)이 오지 않는다(2s 내 미응답=거부).
    const ackOrTimeout = Promise.race([
      ack(s, 'chat:join', {
        bookingId: '00000000-0000-4000-8000-0000000000ff',
      }),
      new Promise((res) => setTimeout(() => res({ timedOut: true }), 2000)),
    ]);
    const r: any = await ackOrTimeout;
    expect(r?.ok).not.toBe(true); // ok:true 아님(예외로 미응답 또는 명시적 실패)
    s.close();
  });
});
