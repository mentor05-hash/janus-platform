import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const prefix = process.env.API_PREFIX ?? '/api/v1';
  app.setGlobalPrefix(prefix.replace(/^\//, '')); // setGlobalPrefix 는 선행 슬래시 없이

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter()); // { error: { code, message } }
  app.useGlobalInterceptors(new TransformInterceptor()); // { data, meta }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API up on http://localhost:${port}${prefix}`, 'Bootstrap');
}
bootstrap();
