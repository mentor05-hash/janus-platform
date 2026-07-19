import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { MediaProvider, MediaRole, MediaTokenResult } from './media.types';

/**
 * 관리형 LiveKit MediaProvider — 강의 음성(선생님 publish → 학생 subscribe) + 녹화(Egress).
 * 접속 토큰은 LiveKit 액세스 토큰(HS256 JWT, video grant). 녹화는 Egress twirp API.
 * ENV: LIVEKIT_URL(wss://…), LIVEKIT_API_KEY, LIVEKIT_API_SECRET, (선택) LIVEKIT_EGRESS_S3(JSON).
 */
export class LiveKitMediaProvider implements MediaProvider {
  private readonly logger = new Logger('MediaProvider:livekit');
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly egressS3?: string, // {"access_key","secret","bucket","region","endpoint?"}
  ) {}

  // ── LiveKit JWT (HS256) ──
  private sign(payload: Record<string, unknown>): string {
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const data = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}`;
    const sig = crypto.createHmac('sha256', this.apiSecret).update(data).digest('base64url');
    return `${data}.${sig}`;
  }
  private nowSec() { return Math.floor(Date.now() / 1000); }

  async issueToken(roomRef: string, identity: string, role: MediaRole, displayName?: string): Promise<MediaTokenResult> {
    const canPublish = role === 'publisher'; // 선생님만 송출, 학생은 수신 전용
    const now = this.nowSec();
    const token = this.sign({
      exp: now + 6 * 3600,
      iss: this.apiKey,
      nbf: now,
      sub: identity,
      ...(displayName ? { name: displayName } : {}),
      video: { room: roomRef, roomJoin: true, canPublish, canSubscribe: true, canPublishData: canPublish },
    });
    return { provider: 'livekit', url: this.url, token, role };
  }

  // ── 서버 API(twirp) ──
  private baseHttp() { return this.url.replace(/^ws/i, 'http'); } // wss→https · ws→http
  private apiToken(grant: Record<string, unknown>): string {
    const now = this.nowSec();
    return this.sign({ exp: now + 600, iss: this.apiKey, nbf: now, sub: this.apiKey, ...grant });
  }
  private async twirp<T>(service: string, body: unknown, grant: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseHttp()}/twirp/${service}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiToken(grant)}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`livekit ${service} → ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return res.json() as Promise<T>;
  }
  private egressOutput(roomRef: string, pathPrefix = 'lectures'): Record<string, unknown> {
    if (!this.egressS3) throw new Error('LiveKit 녹화 저장소(LIVEKIT_EGRESS_S3)가 설정되지 않았습니다.');
    const s3 = JSON.parse(this.egressS3) as { access_key: string; secret: string; bucket: string; region?: string; endpoint?: string };
    return { file_outputs: [{ filepath: `${pathPrefix}/${roomRef}-{time}.mp4`, s3 }] };
  }

  async startRecording(roomRef: string, opts?: { pathPrefix?: string }): Promise<{ provider: string; recordingRef: string }> {
    // 음성 위주 → audio_only room composite egress. (상담 R1 은 pathPrefix='consult-audio' 로 분기 — 오디오 전용 확정)
    const res = await this.twirp<{ egress_id: string }>(
      'livekit.Egress/StartRoomCompositeEgress',
      { room_name: roomRef, audio_only: true, ...this.egressOutput(roomRef, opts?.pathPrefix) },
      { video: { roomRecord: true } },
    );
    this.logger.log(`startRecording room=${roomRef} egress=${res.egress_id}`);
    return { provider: 'livekit', recordingRef: res.egress_id };
  }
  async stopRecording(_roomRef: string, recordingRef: string): Promise<{ url: string | null; durationSec?: number }> {
    await this.twirp('livekit.Egress/StopEgress', { egress_id: recordingRef }, { video: { roomRecord: true } });
    // 산출물 URL 은 egress webhook/조회로 확정(스토리지 경로). 여기선 null.
    return { url: null };
  }
  async closeRoom(roomRef: string): Promise<void> {
    await this.twirp('livekit.RoomService/DeleteRoom', { room: roomRef }, { video: { roomAdmin: true, room: roomRef } });
  }
}
