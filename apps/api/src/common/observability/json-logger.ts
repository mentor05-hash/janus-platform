import { ConsoleLogger, LoggerService, LogLevel } from '@nestjs/common';
import { getRequestId } from './request-context';

export interface LogEntry {
  level: string;
  time: string;
  context?: string;
  requestId?: string;
  message: string;
}

/** 구조적 로그 한 줄(JSON) 직렬화 — 순수 함수(테스트 용이). */
export function formatLogLine(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * 구조적 JSON 로거 (CLAUDE.md §10 관측성) — LOG_FORMAT=json 일 때 사용.
 * 한 줄 JSON({level,time,context,requestId,message})으로 출력해 수집기 파싱에 적합.
 * 그 외(local)에서는 Nest 기본 ConsoleLogger(가독 우선)를 쓰도록 팩토리에서 분기.
 */
export class JsonLogger implements LoggerService {
  private write(level: string, message: unknown, context?: string) {
    const line = formatLogLine({
      level,
      time: new Date().toISOString(),
      context,
      requestId: getRequestId(),
      message: typeof message === 'string' ? message : JSON.stringify(message),
    });
    // eslint-disable-next-line no-console
    console.log(line);
  }

  log(message: unknown, context?: string) {
    this.write('info', message, context);
  }
  error(message: unknown, stackOrContext?: string, context?: string) {
    this.write('error', message, context ?? stackOrContext);
  }
  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }
}

/** ENV LOG_FORMAT(json|pretty)·기본(staging/prod=json)에 따라 로거 선택. */
export function createLogger(env: string | undefined, logFormat: string | undefined): LoggerService {
  const fmt = logFormat ?? (env === 'staging' || env === 'prod' ? 'json' : 'pretty');
  if (fmt === 'json') return new JsonLogger();
  const levels: LogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose'];
  return new ConsoleLogger({ logLevels: levels });
}
