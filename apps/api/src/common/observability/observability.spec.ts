import { formatLogLine, createLogger, JsonLogger } from './json-logger';
import { requestContext, getRequestId } from './request-context';

describe('관측성(§10)', () => {
  it('formatLogLine 은 한 줄 JSON', () => {
    const line = formatLogLine({
      level: 'info',
      time: '2026-01-01T00:00:00.000Z',
      context: 'X',
      requestId: 'r1',
      message: 'hi',
    });
    expect(line.includes('\n')).toBe(false);
    const o = JSON.parse(line);
    expect(o).toEqual({
      level: 'info',
      time: '2026-01-01T00:00:00.000Z',
      context: 'X',
      requestId: 'r1',
      message: 'hi',
    });
  });

  it('createLogger: json 포맷 → JsonLogger, 기본 prod → json', () => {
    expect(createLogger('local', 'json')).toBeInstanceOf(JsonLogger);
    expect(createLogger('prod', undefined)).toBeInstanceOf(JsonLogger);
    expect(createLogger('local', undefined)).not.toBeInstanceOf(JsonLogger);
  });

  it('requestContext: ALS 내부에서 requestId 가 보인다', () => {
    expect(getRequestId()).toBeUndefined();
    requestContext.run({ requestId: 'abc' }, () => {
      expect(getRequestId()).toBe('abc');
    });
    expect(getRequestId()).toBeUndefined();
  });
});
