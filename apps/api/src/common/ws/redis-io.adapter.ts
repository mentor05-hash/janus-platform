import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * socket.io Redis 어댑터(§10 수평확장) — WS_REDIS_ADAPTER=true 일 때만 사용.
 * 여러 API 인스턴스가 같은 방(booking:*)의 이벤트를 Redis pub/sub 로 공유해,
 * 채팅·화이트보드·음성 시그널링이 인스턴스 경계를 넘어 전달된다.
 * 미설정 시 기존 in-memory 어댑터(단일 인스턴스) 그대로 — 동작 불변.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger('RedisIoAdapter');
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly url: string,
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    const pub = new Redis(this.url, { maxRetriesPerRequest: 1 });
    const sub = pub.duplicate();
    pub.on('error', (e) => this.logger.warn(`pub error: ${e.message}`));
    sub.on('error', (e) => this.logger.warn(`sub error: ${e.message}`));
    this.adapterConstructor = createAdapter(pub, sub);
    this.logger.log('socket.io Redis 어댑터 준비 완료(수평확장)');
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
