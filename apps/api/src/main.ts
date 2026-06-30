import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/observability/logging.interceptor';
import { createLogger } from './common/observability/json-logger';
import { requestIdMiddleware } from './common/observability/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // 구조적 로깅(§10) — LOG_FORMAT=json|pretty, 기본 staging/prod=json
    logger: createLogger(
      process.env.APP_ENV ?? process.env.NODE_ENV,
      process.env.LOG_FORMAT,
    ),
  });

  app.use(requestIdMiddleware); // 요청 ID 전파(§10 관측성) — 최선행

  // CORS: web(React)·mobile(RN) 클라이언트 오리진 허용(ENV 분기, §10 설정 외부화)
  const corsOrigins = process.env.CORS_ORIGINS;
  app.enableCors({
    origin: corsOrigins ? corsOrigins.split(',').map((o) => o.trim()) : true,
    credentials: true,
  });
  app.enableShutdownHooks(); // 컨테이너 SIGTERM 시 Prisma onModuleDestroy 보장(§10)

  const prefix = process.env.API_PREFIX ?? '/api/v1';
  app.setGlobalPrefix(prefix.replace(/^\//, '')); // setGlobalPrefix 는 선행 슬래시 없이

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter()); // { error: { code, message }, requestId }
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  ); // 요청로깅 + { data, meta }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API up on http://localhost:${port}${prefix}`, 'Bootstrap');
}
bootstrap();
