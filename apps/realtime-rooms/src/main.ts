import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger, type INestApplicationContext } from '@nestjs/common';
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
  const app = await NestFactory.create(AppModule, { cors: true });
  if (process.env.WS_REDIS_ADAPTER === '1' && process.env.REDIS_URL) {
    app.useWebSocketAdapter(new RedisIoAdapter(app, process.env.REDIS_URL));
  }
  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
  new Logger('Bootstrap').log(`realtime-rooms on :${port} (path /api/rt/v1/socket.io)`);
}
void bootstrap();
