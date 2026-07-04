import { io, type Socket } from 'socket.io-client';

// ── 서버와 공유되는 타입 ──
export type Features = { chat: boolean; whiteboard: boolean; voice: boolean };
export type SessionState = 'before' | 'open' | 'closed';
export type SessionInfo = { restricted: boolean; state: SessionState; opensAt: string | null; closesAt: string | null };
export type Reactions = Record<string, string[]>;
export type ReplyPreview = { id: string; senderId: string | null; kind: string; body: string | null } | null;
export type RoomMessage = {
  id: string; senderId: string | null; mine: boolean; kind: string; body: string | null;
  fileUrl: string | null; createdAt: string; readAt: string | null;
  reactions: Reactions; replyToId: string | null; replyTo: ReplyPreview;
};
export type JoinResult = {
  ok: boolean; participantId?: string; features?: Features; session?: SessionInfo;
  messages?: RoomMessage[]; nextCursor?: string | null; hasMore?: boolean; online?: string[]; error?: string;
};
export type HistoryPage = { ok: boolean; messages: RoomMessage[]; nextCursor: string | null; hasMore: boolean };
export type Ack = { ok: boolean; id?: string; closed?: boolean; reactions?: Reactions; error?: string };

/** 클라이언트가 구독할 수 있는 이벤트(서버→클라). */
export type RoomEvents = {
  connect: () => void;
  disconnect: (reason: string) => void;
  error: (e: { message: string }) => void;
  message: (m: RoomMessage) => void;
  reaction: (e: { messageId: string; reactions: Reactions }) => void;
  read: (e: { readerId: string; at: string }) => void;
  typing: (e: { participantId: string; typing: boolean }) => void;
  presence: (e: { online: string[] }) => void;
  sessionClosed: (e: { roomId: string; at: string }) => void;
  sessionRevoked: (e: { roomId: string }) => void;
  wbStroke: (e: { stroke: unknown; sid?: string }) => void;
  wbStrokePartial: (e: { sid: string; meta: unknown; points: unknown }) => void;
  wbImage: (e: { fileUrl: string | null; page?: number; pageCount?: number }) => void;
  wbClear: () => void;
  callSignal: (e: { from: string; kind: 'offer' | 'answer' | 'ice'; data: unknown }) => void;
  callPeerJoin: (e: { participantId: string }) => void;
  callPeerLeave: (e: { participantId: string }) => void;
};

export type RoomClientOptions = {
  /** 룸 서비스 오리진(예: https://rt.example.com). */
  url: string;
  /** 참가자 룸 토큰(프로비저닝 시 발급). */
  token: string;
  autoConnect?: boolean;
};

export type UploadResult = { id: string; fileUrl: string; filename: string; mime: string; size: number };

const PATH = '/api/rt/v1/socket.io';

/** 실시간 룸 클라이언트. socket.io 를 래핑해 채팅·화이트보드·음성 API + 타입 이벤트를 제공. */
export class RoomClient {
  readonly socket: Socket;
  private readonly url: string;
  private readonly token: string;
  private readonly listeners: { [K in keyof RoomEvents]?: Set<RoomEvents[K]> } = {};

  constructor(opts: RoomClientOptions) {
    this.url = opts.url.replace(/\/$/, '');
    this.token = opts.token;
    this.socket = io(this.url, { path: PATH, auth: { token: this.token }, transports: ['websocket'], autoConnect: opts.autoConnect !== false });
    this.wire();
  }

  // ── 이벤트 구독 ──
  on<K extends keyof RoomEvents>(event: K, cb: RoomEvents[K]): () => void {
    (this.listeners[event] ??= new Set() as never).add(cb as never);
    return () => this.off(event, cb);
  }
  off<K extends keyof RoomEvents>(event: K, cb: RoomEvents[K]): void { this.listeners[event]?.delete(cb as never); }
  private emit<K extends keyof RoomEvents>(event: K, ...args: Parameters<RoomEvents[K]>): void {
    this.listeners[event]?.forEach((cb) => (cb as (...a: unknown[]) => void)(...args));
  }
  private wire() {
    const s = this.socket;
    s.on('connect', () => this.emit('connect'));
    s.on('disconnect', (r: string) => this.emit('disconnect', r));
    s.on('error', (e: { message: string }) => this.emit('error', e));
    s.on('chat:message', (m: RoomMessage) => this.emit('message', m));
    s.on('chat:reaction', (e: { messageId: string; reactions: Reactions }) => this.emit('reaction', e));
    s.on('chat:read', (e: { readerId: string; at: string }) => this.emit('read', e));
    s.on('chat:typing', (e: { participantId: string; typing: boolean }) => this.emit('typing', e));
    s.on('presence', (e: { online: string[] }) => this.emit('presence', e));
    s.on('session:closed', (e: { roomId: string; at: string }) => this.emit('sessionClosed', e));
    s.on('session:revoked', (e: { roomId: string }) => this.emit('sessionRevoked', e));
    s.on('wb:stroke', (e: { stroke: unknown; sid?: string }) => this.emit('wbStroke', e));
    s.on('wb:stroke:partial', (e: { sid: string; meta: unknown; points: unknown }) => this.emit('wbStrokePartial', e));
    s.on('wb:image', (e: { fileUrl: string | null; page?: number; pageCount?: number }) => this.emit('wbImage', e));
    s.on('wb:clear', () => this.emit('wbClear'));
    s.on('call:signal', (e: { from: string; kind: 'offer' | 'answer' | 'ice'; data: unknown }) => this.emit('callSignal', e));
    s.on('call:peer-join', (e: { participantId: string }) => this.emit('callPeerJoin', e));
    s.on('call:peer-leave', (e: { participantId: string }) => this.emit('callPeerLeave', e));
  }
  private ack<T>(event: string, payload: unknown = {}): Promise<T> {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve as (v: T) => void));
  }

  // ── 수명주기 ──
  connect(): void { this.socket.connect(); }
  disconnect(): void { this.socket.disconnect(); }
  get connected(): boolean { return this.socket.connected; }

  // ── 세션 ──
  join(): Promise<JoinResult> { return this.ack<JoinResult>('join'); }

  // ── 채팅 ──
  loadHistory(opts?: { before?: string; limit?: number }): Promise<HistoryPage> { return this.ack<HistoryPage>('chat:history', opts ?? {}); }
  sendMessage(msg: { body?: string; fileUrl?: string; kind?: string; replyToId?: string }): Promise<Ack> { return this.ack<Ack>('chat:send', msg); }
  react(messageId: string, emoji: string): Promise<Ack> { return this.ack<Ack>('chat:react', { messageId, emoji }); }
  setTyping(typing: boolean): void { this.socket.emit('chat:typing', { typing }); }
  markRead(): Promise<Ack> { return this.ack<Ack>('chat:read'); }

  // ── 화이트보드 ──
  wbJoin(): Promise<{ ok: boolean; strokes?: unknown[]; backgroundUrl?: string | null; session?: SessionInfo }> { return this.ack('wb:join'); }
  wbStroke(stroke: unknown, sid?: string): Promise<Ack> { return this.ack<Ack>('wb:stroke', { stroke, sid }); }
  wbStrokePartial(sid: string, meta: unknown, points: unknown): void { this.socket.emit('wb:stroke:partial', { sid, meta, points }); }
  wbImage(fileUrl: string | null, page?: number, pageCount?: number): Promise<Ack> { return this.ack<Ack>('wb:image', { fileUrl, page, pageCount }); }
  wbClear(): Promise<Ack> { return this.ack<Ack>('wb:clear'); }
  wbSave(strokes: unknown, backgroundUrl?: string | null): Promise<Ack> { return this.ack<Ack>('wb:save', { strokes, backgroundUrl }); }

  // ── 음성(WebRTC 시그널) ──
  callJoin(): Promise<Ack> { return this.ack<Ack>('call:join'); }
  callSignal(kind: 'offer' | 'answer' | 'ice', data: unknown): Promise<Ack> { return this.ack<Ack>('call:signal', { kind, data }); }
  callLeave(): Promise<Ack> { return this.ack<Ack>('call:leave'); }

  // ── 첨부(REST) ──
  /** 파일 업로드 → { fileUrl }. 브라우저/노드 공통(FormData·fetch 전역). */
  async uploadFile(file: Blob, filename?: string): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', file, filename ?? (file as File).name ?? 'file');
    const r = await fetch(`${this.url}/api/rt/v1/files`, { method: 'POST', headers: { authorization: `Bearer ${this.token}` }, body: form });
    if (!r.ok) throw new Error(`upload failed: ${r.status}`);
    return r.json() as Promise<UploadResult>;
  }
  /** 첨부 다운로드용 절대 URL(토큰 포함). <img src>·다운로드 링크에 사용. */
  fileUrl(relativeOrId: string): string {
    const rel = relativeOrId.startsWith('/') ? relativeOrId : `/api/rt/v1/files/${relativeOrId}`;
    return `${this.url}${rel}?token=${encodeURIComponent(this.token)}`;
  }
}

export function createRoomClient(opts: RoomClientOptions): RoomClient { return new RoomClient(opts); }
