import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/observability/logging.interceptor';
import { createLogger } from './common/observability/json-logger';
import { requestIdMiddleware } from './common/observability/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // PG 웹훅 서명검증(HMAC)용 원문 보존 — JSON 파싱은 그대로 동작
    // 구조적 로깅(§10) — LOG_FORMAT=json|pretty, 기본 staging/prod=json
    logger: createLogger(
      process.env.APP_ENV ?? process.env.NODE_ENV,
      process.env.LOG_FORMAT,
    ),
  });

  app.use(requestIdMiddleware); // 요청 ID 전파(§10 관측성) — 최선행

  // 보안 헤더(helmet) + HSTS — API는 JSON 전용이라 CSP/COEP는 완화, HSTS는 prod에서 강제
  const isProd = (process.env.APP_ENV ?? process.env.NODE_ENV) === 'prod';
  app.use(
    helmet({
      contentSecurityPolicy: false, // API(JSON) — 문서 CSP 불필요, 프론트에서 관리
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // 웹/모바일 크로스 오리진 첨부 허용
      hsts: isProd ? { maxAge: 15552000, includeSubDomains: true, preload: true } : false,
    }),
  );

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

  // OpenAPI 문서 — 로컬/스테이징에서만 노출(/docs). prod 는 비노출.
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('멘토링 플랫폼 API')
      .setDescription('1:1 멘토링/상담 예약 플랫폼 — REST API 문서')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${prefix}/docs`.replace(/^\//, ''), app, doc);
    Logger.log(`API docs on /${prefix.replace(/^\//, '')}/docs`, 'Bootstrap');
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API up on http://localhost:${port}${prefix}`, 'Bootstrap');
}
bootstrap();
