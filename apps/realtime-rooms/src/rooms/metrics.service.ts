import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

/** Prometheus 메트릭 — 기본 프로세스 지표 + 룸 서비스 커스텀 카운터/게이지. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly roomsCreated = new Counter({ name: 'rooms_created_total', help: '생성된 룸 수', registers: [this.registry] });
  readonly messages = new Counter({ name: 'rooms_messages_total', help: '저장된 채팅 메시지 수', registers: [this.registry] });
  readonly wsConnections = new Gauge({ name: 'rooms_ws_connections', help: '현재 WebSocket 연결 수', registers: [this.registry] });

  constructor() { collectDefaultMetrics({ register: this.registry }); }
  metrics() { return this.registry.metrics(); }
  get contentType() { return this.registry.contentType; }
}
