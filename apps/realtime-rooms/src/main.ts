import 'dotenv/config'; // WS 게이트웨이 cors 데코레이터가 import 시점에 ROOMS_CORS_ORIGINS·NODE_ENV 를 읽음 — 제거 금지.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger, ValidationPipe, type INestApplicationContext } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ServerOptions } from 'socket.io';
import { AppModule } from './app.module';

/** 다중 인스턴스 확장용 socket.io Redis 어댑터(WS_REDIS_ADAPTER=1 일 때). */
class RedisIoAdapter extends IoAdapter {
  constructor(app: INestApplicationContext, private readonly url: string) { super(app); }
  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    const pub = new Redis(this.url), sub = pub.duplicate();
    server.adapter(createAdapter(pub, sub));
    return server;
  }
}

async function bootstrap() {
  // CORS: ROOMS_CORS_ORIGINS(콤마) 있으면 허용목록, 없으면 전체 반영(로컬).
  const origins = (process.env.ROOMS_CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const app = await NestFactory.create(AppModule, { cors: { origin: origins.length ? origins : true, credentials: true } });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  app.enableShutdownHooks(); // SIGTERM 시 provider onModuleDestroy(풀 정리) 호출
  if (process.env.WS_REDIS_ADAPTER === '1' && process.env.REDIS_URL) {
    app.useWebSocketAdapter(new RedisIoAdapter(app, process.env.REDIS_URL));
  }
  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
  new Logger('Bootstrap').log(`realtime-rooms on :${port} (path /api/rt/v1/socket.io)`);
}
void bootstrap();
